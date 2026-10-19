// Demo discovery helpers: marketplace search queries, public-page probing, public demo credential
// extraction, and a single (never repeated) login verification. Only credentials that a vendor or
// marketplace PUBLISHES on a public page are ever used; nothing is guessed, and CAPTCHA/MFA stop the flow.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isLoginPage, login, openSession } from './browser.mjs';
import { makeScope } from './scope.mjs';
import { nowIso, readJson, slug, writeJson } from './util.mjs';
import { redactText, registerSecret } from './redact.mjs';
import { DEFAULT_OUT, openProject, resolveProjectDir } from './project.mjs';

const REF = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'references', 'marketplaces.json');

const BUILTIN = [
  { id: 'vendor-demo', name: 'Vendor sites', query_templates: ['"{topic}" "live demo" OR "demo login" OR "try demo"', '"{topic}" "demo credentials" OR "demo account"'] },
  { id: 'codecanyon', name: 'CodeCanyon (Envato)', query_templates: ['site:codecanyon.net "{topic}" "live preview"', 'site:codecanyon.net "{topic}" admin demo username password'] },
  { id: 'themeforest', name: 'ThemeForest (Envato)', query_templates: ['site:themeforest.net "{topic}" admin template "live preview"'] },
  { id: 'github', name: 'GitHub', query_templates: ['site:github.com "{topic}" open source "live demo"'] },
];

export function loadMarketplaces() {
  return readJson(REF, null)?.marketplaces || BUILTIN;
}

/** @returns {{id:string,name:string,queries:string[]}[]} */
export function buildQueries(topic, ids) {
  const want = ids?.length ? new Set(ids) : null;
  return loadMarketplaces()
    .filter((m) => !want || want.has(m.id))
    .map((m) => ({ id: m.id, name: m.name, queries: (m.query_templates || []).map((q) => q.replaceAll('{topic}', topic)) }));
}

const PLACEHOLDER = /^(your|\*+|x{3,}|\.{3,}|•+|\[|<|\{|password$|pass$|email$|username$|n\/a$|none$)/i;
// Strip wrapping quotes/brackets and sentence punctuation, but keep a trailing ! or ? (common in passwords).
const clean = (t) => t.replace(/^[("'`[]+|[)"'`\].,;:]+$/g, '');

/** Extracts credential pairs that are written out in public page text. Pure function (unit-tested). */
export function extractCredentials(text, sourceUrl = null) {
  const out = [];
  const seen = new Set();
  const add = (u, p, idx, len) => {
    u = clean(u);
    p = clean(p);
    if (u.length < 3 || p.length < 3 || u.length > 80 || p.length > 60) return;
    if (PLACEHOLDER.test(p) || PLACEHOLDER.test(u) || /[<>]|&nbsp;|https?:/i.test(u + p)) return;
    const k = `${u}\u0000${p}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ username: u, password: p, context: text.slice(Math.max(0, idx - 40), idx + len + 40).replace(/\s+/g, ' ').trim(), source_url: sourceUrl });
  };
  const patterns = [
    [/(?:user(?:name)?|e-?mail|login)\s*[:=–-]\s*([^\s,;|]+)[\s\S]{0,80}?(?:pass(?:word)?|pwd)\s*[:=–-]\s*([^\s,;|]+)/gi, 1, 2],
    [/([\w.+-]+@[\w-]+\.[\w.-]+)\s*(?:\/|\||,|—|–)\s*([^\s,;|/]{3,40})/g, 1, 2],
    [/\b(admin|demo|user|test|guest)\s*\/\s*([^\s,;|/]{3,30})/gi, 1, 2],
  ];
  for (const [re, a, b] of patterns) for (const m of text.matchAll(re)) add(m[a], m[b], m.index, m[0].length);
  return out;
}

const KEYWORDS = /(live\s*preview|live\s*demo|demo|try\s+(it|now|free)|sandbox|admin\s*(panel|demo)|log\s*in|sign\s*in)/i;

/** Opens one PUBLIC page (read-only guard on), reports login/captcha/mfa signals and credential candidates. */
export async function probeDemo(url, { outDir = DEFAULT_OUT, headless = true } = {}) {
  const u = new URL(url);
  const cfg = { viewport: { width: 1366, height: 850 }, navTimeoutMs: 20000, headless, sandbox: false, scopeGuard: false, allowPostPatterns: [] };
  const session = await openSession(cfg, makeScope({ baseUrl: u.origin }), {});
  session.guard.enabled = true;
  try {
    const { page } = session;
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
    const texts = [];
    const iframes = [];
    let loginForm = false;
    for (const f of page.frames()) {
      try {
        texts.push(await f.evaluate(() => document.body?.innerText || ''));
        if (f !== page.mainFrame()) iframes.push(f.url());
        if (await f.locator('input[type=password]:visible').count()) loginForm = true;
      } catch { /* cross-origin frames may refuse; skip */ }
    }
    const text = texts.join('\n').slice(0, 60000);
    const links = await page.evaluate((kw) => {
      const re = new RegExp(kw, 'i');
      return Array.from(document.querySelectorAll('a[href]')).map((a) => ({ text: (a.innerText || a.getAttribute('aria-label') || '').trim().slice(0, 80), href: a.href })).filter((l) => /^https?:/.test(l.href) && (re.test(l.text) || re.test(l.href))).slice(0, 30);
    }, KEYWORDS.source);
    const captcha = (await page.locator('iframe[src*=captcha i],iframe[src*=recaptcha i],.g-recaptcha,.h-captcha,[data-sitekey]').count()) > 0;
    const mfa = (await page.locator('input[autocomplete=one-time-code]').count()) > 0;
    const probe = {
      probed_at: nowIso(), requested_url: url, final_url: page.url(), status: resp?.status() ?? null, title: await page.title(),
      login_form: loginForm || (await isLoginPage(page, page.url())), captcha, mfa, iframes: [...new Set(iframes)].slice(0, 10), links,
      credential_candidates: extractCredentials(text, page.url()),
      note: 'Credentials listed here were written on a public page. They are unverified until demo-login succeeds once.',
    };
    const dir = path.join(outDir, '_discovery');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${slug(u.host + u.pathname)}-probe.json`);
    writeJson(file, probe);
    return { file, probe };
  } finally {
    await session.close();
  }
}

/** ONE login attempt with a published candidate. Never retries, never bypasses CAPTCHA/MFA. */
export async function demoLogin(probeFile, { index = 0, saveTo, outRoot = DEFAULT_OUT, headless = true } = {}) {
  const probe = readJson(probeFile);
  if (!probe) throw new Error(`Cannot read probe file: ${probeFile}`);
  const cand = probe.credential_candidates?.[index];
  if (!cand) throw new Error(`No credential candidate #${index} in ${probeFile}.`);
  if (probe.captcha) return { ok: false, reason: 'captcha_present', detail: 'A CAPTCHA protects this page; not attempted.' };
  // The probed page may not itself be the login page: follow its own "log in / sign in" link if it has one.
  const loginUrl = probe.login_form ? probe.final_url : probe.links?.find((l) => /log\s*-?in|sign\s*-?in/i.test(`${l.text} ${l.href}`))?.href;
  if (!loginUrl) return { ok: false, reason: 'no_login_form', detail: 'No login form or login link found on the probed page; probe the login page directly.', attempts: 0, source_url: cand.source_url };
  registerSecret(cand.password);
  const cfg = { baseUrl: loginUrl, auth: { loginPath: loginUrl }, viewport: { width: 1366, height: 850 }, navTimeoutMs: 20000, headless };
  const session = await openSession(cfg, makeScope({ baseUrl: loginUrl }), {});
  let result;
  try {
    result = await login(session.page, cfg, cand);
  } finally {
    await session.close();
  }
  const out = { ok: result.ok, reason: result.reason || null, detail: redactText(result.detail || ''), attempts: 1, source_url: cand.source_url };
  if (saveTo) {
    const project = openProject(resolveProjectDir(saveTo, outRoot));
    const meta = readJson(project.p.credentials, {}) || {};
    Object.assign(meta, {
      access_type: 'official_demo', credentials_source: 'vendor_published', source_url: cand.source_url,
      verification_status: result.ok ? 'verified' : 'failed', last_verified_at: nowIso(), public_demo: true,
      notes: 'Published demo credentials, verified with one login attempt. Git-ignored; do not share outside the project.',
    });
    if (result.ok) Object.assign(meta, { username: cand.username, password: cand.password });
    writeJson(project.p.credentials, meta);
    out.saved_to = project.p.credentials;
  }
  return out;
}
