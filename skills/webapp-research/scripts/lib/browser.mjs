// Playwright session: mutation guard, scope guard, diagnostics, login. Browser logic lives here only.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { SAFE_METHODS, isReadOnlyGraphql } from './safety.mjs';
import { inPageInspect } from './inspect.mjs';
import { nowIso } from './util.mjs';
import { redactText, redactUrl } from './redact.mjs';

export async function loadPlaywright() {
  try {
    const m = await import('playwright');
    return m.chromium ? m : m.default;
  } catch { /* fall through to global install */ }
  try {
    const root = execSync('npm root -g', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return createRequire(path.join(root, 'noop.js'))('playwright');
  } catch { /* fall through */ }
  throw new Error('Playwright not found. Run `npm install` in the skill folder (or `npm i -g playwright`), then `npx playwright install chromium`.');
}

function attachDiagnostics(page) {
  const buf = { console: [], page_errors: [], failed_requests: [], bad_responses: [], api: [] };
  page.on('console', (m) => { if (m.type() === 'error') buf.console.push(redactText(m.text()).slice(0, 300)); });
  page.on('pageerror', (e) => buf.page_errors.push(redactText(e.message).slice(0, 300)));
  page.on('requestfailed', (r) => buf.failed_requests.push({ method: r.method(), url: redactUrl(r.url()), error: r.failure()?.errorText || 'failed' }));
  page.on('response', (r) => {
    const req = r.request();
    if (r.status() >= 400) buf.bad_responses.push({ url: redactUrl(r.url()), status: r.status() });
    if (['xhr', 'fetch'].includes(req.resourceType())) buf.api.push({ method: req.method(), url: redactUrl(r.url()), status: r.status() });
  });
  return {
    drain() {
      const out = { ...buf };
      for (const k of Object.keys(buf)) buf[k] = [];
      return out;
    },
  };
}

export async function openSession(cfg, scope, { storageState, headless } = {}) {
  const pw = await loadPlaywright();
  const browser = await pw.chromium.launch({ headless: headless ?? cfg.headless });
  const context = await browser.newContext({
    viewport: cfg.viewport,
    storageState,
    acceptDownloads: false,
    serviceWorkers: 'block',
  });
  context.setDefaultTimeout(cfg.navTimeoutMs);

  const guard = { enabled: false, blocked: [] };
  const allowPost = (cfg.allowPostPatterns || []).map((p) => new RegExp(p, 'i'));
  await context.route('**/*', (route) => {
    const req = route.request();
    const url = req.url();
    if (guard.enabled && /^https?:/.test(url)) {
      const gqlRead = cfg.allowReadOnlyGraphql && req.method() === 'POST' && /graphql/i.test(url) && isReadOnlyGraphql(req.postData());
      if (!SAFE_METHODS.has(req.method()) && !cfg.sandbox && !gqlRead && !allowPost.some((re) => re.test(url))) {
        guard.blocked.push({ method: req.method(), url: redactUrl(url), at: nowIso() });
        return route.abort('blockedbyclient');
      }
      if (cfg.scopeGuard !== false && req.isNavigationRequest() && !scope.check(url, 0).ok && scope.check(url, 0).reason !== 'depth') {
        guard.blocked.push({ method: 'NAVIGATE', url: redactUrl(url), at: nowIso(), reason: 'out of scope' });
        return route.abort('blockedbyclient');
      }
    }
    return route.continue();
  });

  const page = await context.newPage();
  const diag = attachDiagnostics(page);
  return { browser, context, page, guard, diag, async close() { await browser.close().catch(() => {}); } };
}

/**
 * A visible password field alone is not a login page (settings pages have one). It counts as a login
 * page when we were redirected, the path looks like a login path, or the page is little more than a login form.
 */
export async function isLoginPage(page, requestedUrl) {
  if (!(await page.locator('input[type=password]:visible').count())) return false;
  const here = new URL(page.url());
  const redirected = requestedUrl && new URL(requestedUrl).pathname !== here.pathname;
  if (redirected || /log-?in|sign-?in|\/auth|session/i.test(here.pathname)) return true;
  const inputs = await page.locator('input:visible:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=submit]):not([type=button])').count();
  return inputs <= 2;
}

/** Generic form login. Refuses to continue on CAPTCHA or MFA instead of trying to get around them. */
export async function login(page, cfg, creds) {
  const a = cfg.auth || {};
  const loginUrl = new URL(a.loginPath || '/login', cfg.baseUrl).toString();
  await page.goto(loginUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});

  if (await page.locator('iframe[src*=captcha i],iframe[src*=recaptcha i],.g-recaptcha,.h-captcha,[data-sitekey]').count())
    return { ok: false, reason: 'captcha_present', detail: 'A CAPTCHA protects this login. Provide an authenticated storage state instead; the tool will not bypass it.' };

  const pw = a.passwordSelector ? page.locator(a.passwordSelector).first() : page.locator('input[type=password]:visible').first();
  if (!(await pw.count())) return { ok: false, reason: 'no_password_field', detail: `No password field at ${loginUrl}. Set auth.loginPath / selectors in crawlers/config.json.` };

  let user = a.userSelector ? page.locator(a.userSelector).first() : page.getByLabel(/user(name)?|e-?mail|login|phone/i).first();
  if (!(await user.count())) user = page.locator('input[type=email]:visible,input[name*=user i]:visible,input[name*=email i]:visible,input[type=text]:visible').first();
  if (!(await user.count())) return { ok: false, reason: 'no_username_field', detail: 'Could not find a username/email field.' };

  await user.fill(creds.username);
  await pw.fill(creds.password);
  const submit = a.submitSelector ? page.locator(a.submitSelector).first() : page.getByRole('button', { name: /log ?in|sign ?in|submit|continue|login/i }).first();
  if (await submit.count()) await Promise.all([page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {}), submit.click()]);
  else await pw.press('Enter');
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForTimeout(300);

  if (await page.locator('input[autocomplete=one-time-code]:visible').count())
    return { ok: false, reason: 'mfa_required', detail: 'Multi-factor prompt detected; not bypassed.' };
  if (await isLoginPage(page, loginUrl)) return { ok: false, reason: 'login_rejected', detail: 'Still on a login form after submitting; credentials may be wrong.' };
  return { ok: true, url: page.url() };
}

export const inspectPage = (page) => page.evaluate(inPageInspect);
