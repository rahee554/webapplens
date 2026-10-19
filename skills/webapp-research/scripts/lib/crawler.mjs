// Resumable, scope-limited crawler. State is checkpointed after every page, so a crash,
// Ctrl-C or ended Claude session loses at most the page in flight.
import fs from 'node:fs';
import { ensureDir, nowIso, readJson, shortHash, sleep, writeJson } from './util.mjs';
import { makeScope } from './scope.mjs';
import { normalizeUrl, RouteRegistry, routeTemplate, templateOfUrl } from './routes.mjs';
import { classifyAction, isOpener } from './safety.mjs';
import { resolveCredentials } from './credentials.mjs';
import { inspectPage, isLoginPage, login, openSession } from './browser.mjs';
import { planShot, recordShot } from './screenshots.mjs';
import { addObservation } from './evidence.mjs';
import { redactText } from './redact.mjs';
import { inPageSignals, mergeSignals, newTechAcc } from './techstack.mjs';
import { inPageDesign, mergeDesign, newDesignAcc } from './design.mjs';

const CRASH_RE = /Target (page|closed)|browser has been closed|Browser closed|has been closed|crash/i;
const short = (e) => redactText(String(e?.message || e)).split('\n')[0].slice(0, 200);
const idTemplate = (p) => p.split('/').map((s) => (/^(\d+|[0-9a-f-]{24,})$/i.test(s) ? ':id' : s)).join('/');

export async function crawl(project, opts = {}) {
  const base = project.config();
  const cfg = {
    ...base,
    ...(opts.overrides || {}),
    responsive: { ...base.responsive, ...(opts.overrides?.responsive || {}) },
    auth: { ...base.auth, ...(opts.overrides?.auth || {}) },
  };
  const scope = makeScope(cfg);
  const registry = new RouteRegistry(project.routes(), cfg);
  const state = project.state();
  const forms = project.forms();
  const controlsMap = project.controls();
  const failures = project.failures();
  const network = readJson(project.p.network, { api_calls: {}, per_route: {}, blocked: [] });
  network.blocked ||= [];
  const techAcc = readJson(project.p.techStack, null) || newTechAcc();
  const designAcc = readJson(project.p.designTokens, null) || newDesignAcc();
  const focus = cfg.focus?.length ? cfg.focus : ['full'];
  const want = (...fs) => focus.includes('full') || fs.some((f) => focus.includes(f));
  const done = new Set(state.done);
  state.skipped ||= {};
  state.skipped_links ||= [];
  state.stats ||= { pages_visited: 0, restarts: 0 };

  const creds = resolveCredentials(project, { credentialsFile: opts.credentialsFile });
  if (cfg.auth.required && !creds) {
    throw new Error('This project requires login but no credentials were found. Set the env vars named in credentials.json (username_env / password_env) or pass --credentials-file.');
  }
  const needAuth = !!creds;
  creds?.warnings.forEach((w) => project.log('warn', w));

  // ---- queue management -------------------------------------------------
  // Counters are per unique link, not per page visit (a footer link would otherwise be counted on every page).
  state.skipped_seen ||= {};
  const skip = (reason, url, label) => {
    const seen = (state.skipped_seen[reason] ||= []);
    if (!seen.includes(url)) {
      if (seen.length < 2000) seen.push(url);
      state.skipped[reason] = (state.skipped[reason] || 0) + 1;
    }
    if (reason === 'external') {
      try {
        const o = new URL(url).origin;
        if (!state.external_origins.includes(o) && state.external_origins.length < 100) state.external_origins.push(o);
      } catch { /* ignore */ }
    }
    if (reason === 'consequential_link' && state.skipped_links.length < 50 && !state.skipped_links.some((l) => l.url === url)) state.skipped_links.push({ url, label });
  };

  function enqueue(url, depth, parent, via, label = '') {
    const norm = normalizeUrl(url, cfg.baseUrl);
    if (!norm) return skip(/^(mailto|tel|javascript|data|blob):/i.test(url) ? 'non-http' : 'invalid', url);
    const s = scope.check(norm, depth);
    if (!s.ok) {
      if (s.reason === 'depth') registry.add(norm, { parent, depth, via, label }).route?.notes.push('not queued: beyond maxDepth');
      return skip(s.reason, norm);
    }
    const r = registry.add(norm, { parent, depth, via, label });
    if (r.visit) {
      state.queue.push({ url: norm, depth, parent, via });
      if (r.route.status === 'discovered') r.route.status = 'queued';
    } else if (r.reason === 'sampled') skip('sampled_variant', norm);
  }

  // After a crash/resume or a changed config, re-queue anything known but never finished.
  function reconcile() {
    const queued = new Set(state.queue.map((q) => q.url));
    for (const r of registry.routes) {
      for (const ex of r.examples) {
        if (done.has(ex) || queued.has(ex) || !scope.check(ex, r.depth).ok) continue;
        state.queue.push({ url: ex, depth: r.depth, parent: r.parent, via: r.discovery });
        queued.add(ex);
        if (r.results[ex] === 'in_progress') delete r.results[ex];
      }
    }
  }

  if (!state.queue.length && !done.size && !registry.routes.length) {
    for (const sp of cfg.startPaths) enqueue(new URL(sp, cfg.baseUrl).toString(), 0, null, 'seed');
  }
  reconcile();

  // ---- session ---------------------------------------------------------
  let session;
  async function startSession() {
    const reuse = cfg.persistSession && needAuth && fs.existsSync(project.p.storageState);
    const s = await openSession(cfg, scope, { storageState: reuse ? project.p.storageState : undefined, headless: opts.headless });
    if (needAuth) {
      let ok = false;
      if (reuse) {
        await s.page.goto(cfg.baseUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
        ok = !(await isLoginPage(s.page, cfg.baseUrl));
        if (ok) project.log('info', 'reused saved session');
      }
      if (!ok) {
        const r = await login(s.page, cfg, creds);
        if (!r.ok) {
          await s.close();
          throw new Error(`Login failed (${r.reason}): ${r.detail}`);
        }
        project.log('info', `login ok (credentials from ${creds.source})`);
        if (cfg.persistSession) {
          ensureDir(project.p.secrets);
          await s.context.storageState({ path: project.p.storageState });
        }
      }
    }
    s.guard.enabled = true; // from here on, mutating requests are blocked
    return s;
  }

  // ---- helpers ---------------------------------------------------------
  async function capture(route, kind, uiState, fullPage = true) {
    if (!want('screenshots')) return null; // precise scope: screenshots only when asked for
    try {
      const { abs, rel } = planShot(project, route, { kind, state: uiState });
      ensureDir(project.p.dir);
      await session.page.screenshot({ path: abs, fullPage });
      recordShot(project, { file: rel, route_id: route.id, url: session.page.url(), module: route.module, ui_state: uiState || 'default', viewport: session.page.viewportSize(), full_page: fullPage });
      if (!route.screenshots.includes(rel)) route.screenshots.push(rel);
      return rel;
    } catch (e) {
      project.log('warn', `screenshot failed for ${route.id}: ${short(e)}`);
      return null;
    }
  }

  function upsertControls(route, list) {
    const cur = controlsMap[route.id] || [];
    const seen = new Set(cur.map((c) => `${c.role}|${c.label}`));
    for (const c of list) {
      if (!c.label && c.role !== 'tab') continue;
      const k = `${c.role}|${c.label}`;
      if (seen.has(k) || cur.length >= 300) continue;
      seen.add(k);
      cur.push({ label: c.label, role: c.role, type: c.type, disabled: c.disabled, in_dialog: c.in_dialog, nav: c.nav, category: classifyAction(c.label, { role: c.role, type: c.type, toggle: c.expanded !== null, method: c.form_method }).category, exercised: false });
    }
    controlsMap[route.id] = cur;
    route.controls.total = cur.length;
    route.controls.by_category = { A: 0, B: 0, C: 0 };
    for (const c of cur) route.controls.by_category[c.category]++;
    route.controls.exercised = cur.filter((c) => c.exercised).length;
  }

  const markExercised = (route, label, role) => {
    const c = (controlsMap[route.id] || []).find((x) => x.label === label && x.role === role);
    if (c) c.exercised = true;
    route.controls.exercised = (controlsMap[route.id] || []).filter((x) => x.exercised).length;
  };

  function upsertForms(route, data, uiState) {
    const groups = [...data.forms];
    if (data.loose_fields.length) groups.push({ label: 'Standalone controls (search/filters)', action: null, method: null, in_dialog: false, visible: true, fields: data.loose_fields, submit: [] });
    for (const f of groups) {
      if (!f.fields.length && !f.submit?.length) continue;
      // Identity ignores record ids in the action, so sampled examples (/customers/1/delete, /2/delete) are one form.
      const actionT = f.action ? templateOfUrl(f.action, cfg.baseUrl) : 'loose';
      const id = `F${shortHash(route.template + actionT + f.fields.map((x) => x.name || x.label).join(','), 6)}`;
      const submitLabel = f.submit?.[0] || '';
      const spec = {
        id, route_id: route.id, ui_state: f.in_dialog && f.visible ? uiState : 'page', label: f.label || (f.submit?.[0] ? `"${f.submit[0]}" form` : 'Unnamed form'),
        kind: f.fields.length ? 'form' : 'action', action: f.action ? redactText(f.action) : null, action_template: actionT, method: f.method, in_dialog: f.in_dialog, fields: f.fields, submit: f.submit,
        category: f.action ? classifyAction(submitLabel, { type: 'submit', method: f.method, href: f.action }).category : 'A',
        client_validation: { required: f.fields.filter((x) => x.required).map((x) => x.label || x.name), invalid_now: f.fields.filter((x) => x.invalid_now).map((x) => ({ field: x.label || x.name, message: x.invalid_now })) },
        submit_tested: false,
        inspected_at: nowIso(),
      };
      const i = forms.findIndex((x) => x.id === id);
      if (i >= 0) forms[i] = { ...spec, ...forms[i], fields: spec.fields, ui_state: spec.ui_state === 'page' ? forms[i].ui_state : spec.ui_state };
      else forms.push(spec);
      if (!route.forms.includes(id)) route.forms.push(id);
    }
  }

  function harvest(route, data, depth, uiState) {
    for (const l of data.links) {
      if (l.download) continue;
      if (!/^https?:/i.test(l.href)) { skip('non-http', l.href); continue; }
      if (classifyAction(l.text, { role: 'link', href: l.href }).category === 'C') { skip('consequential_link', l.href, l.text); continue; }
      enqueue(l.href, depth + 1, route.id, l.nav ? 'nav' : 'link', l.text);
    }
    upsertControls(route, data.controls);
    upsertForms(route, data, uiState);
  }

  async function gotoWithRetry(page, url) {
    let last;
    for (let a = 0; a <= cfg.retries; a++) {
      try {
        const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: cfg.navTimeoutMs });
        await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => {});
        return { response };
      } catch (e) {
        last = e;
        if (CRASH_RE.test(e.message) || /ERR_BLOCKED_BY_CLIENT/.test(e.message)) break;
        await sleep(400 * 2 ** a);
      }
    }
    return { error: last?.message || 'navigation failed' };
  }

  async function expandMenus(page) {
    await page.evaluate(() => {
      const bad = /delete|remove|log ?out|sign ?out|send|publish|approve|pay/i;
      document.querySelectorAll('nav [aria-expanded="false"],aside [aria-expanded="false"],[role=navigation] [aria-expanded="false"]').forEach((el, i) => {
        if (i < 15 && !bad.test(el.innerText || el.getAttribute('aria-label') || '')) el.click();
      });
    }).catch(() => {});
    await page.waitForTimeout(150);
  }

  async function closeDialog(page, url) {
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(200);
    if ((await inspectPage(page)).dialogs.length) {
      await page.locator('[role=dialog] button, dialog button').filter({ hasText: /close|cancel|dismiss|×|^x$/i }).first().click({ timeout: 1500 }).catch(() => {});
      await page.waitForTimeout(200);
    }
    if ((await inspectPage(page)).dialogs.length) await gotoWithRetry(page, url);
  }

  // ---- one page --------------------------------------------------------
  async function visit(item) {
    const { url, depth } = item;
    const route = registry.findByUrl(url);
    registry.setResult(route, url, 'in_progress');
    const { page, diag, guard } = session;
    diag.drain();
    guard.blocked.length = 0;

    const fail = (result, access, reason) => {
      registry.setResult(route, url, result);
      route.access_status = access;
      route.failure = reason;
      failures.push({ route_id: route.id, url: redactText(url), access, reason, at: nowIso() });
      project.log('warn', `${route.id} ${result}: ${access} (${reason})`);
    };

    const nav = await gotoWithRetry(page, url);
    if (nav.error) {
      if (CRASH_RE.test(nav.error)) throw new Error(nav.error);
      return fail(/ERR_BLOCKED_BY_CLIENT/.test(nav.error) ? 'blocked' : 'failed', 'navigation_error', short({ message: nav.error }));
    }
    // Give client-side rendering a moment; hash routes render after load, so wait longer for them.
    await page.waitForTimeout((cfg.settleMs ?? 150) + (/^#!?\//.test(new URL(page.url()).hash) ? 400 : 0));
    const status = nav.response?.status() ?? 200;
    const finalUrl = page.url();
    const finalScope = scope.check(finalUrl, 0);
    if (!finalScope.ok && finalScope.reason === 'external') return fail('blocked', 'redirected_out_of_scope', 'redirected to an out-of-scope origin');

    const loginPath = new URL(cfg.auth.loginPath || '/login', cfg.baseUrl).pathname;
    if ((await isLoginPage(page, url)) && new URL(finalUrl).pathname !== loginPath) {
      route.auth_required = true;
      return fail('blocked', 'login_required', 'redirected to a login form');
    }
    if (status === 401 || status === 403) {
      route.auth_required = status === 401 ? true : route.auth_required;
      await capture(route, 'all', '');
      return fail('blocked', 'forbidden', `HTTP ${status}`);
    }
    if (status === 404 || status === 410) {
      await capture(route, 'all', '');
      return fail('failed', 'not_found', `HTTP ${status}`);
    }
    if (status >= 500) return fail('failed', 'server_error', `HTTP ${status}`);

    const finalNorm = normalizeUrl(finalUrl);
    if (finalNorm && routeTemplate(finalNorm) !== route.template && finalScope.ok) {
      route.redirect_to = finalNorm;
      route.access_status = 'ok';
      route.notes.push(`redirects to ${new URL(finalNorm).pathname}`);
      enqueue(finalNorm, depth, route.id, 'redirect');
      return registry.setResult(route, url, 'explored');
    }

    const issues = [];
    if (cfg.expandMenus) await expandMenus(page);
    const data = await inspectPage(page);
    route.title = data.title || data.headings[0] || route.title;
    route.access_status = 'ok';
    if (!needAuth) route.auth_required = false;
    route.breadcrumbs = data.breadcrumbs;
    route.headings = data.headings;
    route.tables = data.tables;
    route.lists = data.lists;
    route.pagination = data.pagination;
    route.has_search = data.has_search;
    // Only navigation the crawler is allowed to follow counts toward "unexplored navigation".
    route.nav = [...new Set(data.links.filter((l) => l.nav && scope.check(l.href, 0).ok && classifyAction(l.text, { role: 'link', href: l.href }).category !== 'C').map((l) => normalizeUrl(l.href)).filter(Boolean))].slice(0, 80);
    route.last_inspected_at = nowIso();
    route.a11y = data.a11y;
    // Tech stack + design research (passive; cookie values are never read).
    if (want('stack', 'architecture', 'suggestions', 'ui')) try {
      const sig = await page.evaluate(inPageSignals);
      const cookies = (await session.context.cookies()).map((c) => ({ name: c.name, httpOnly: c.httpOnly, secure: c.secure, sameSite: c.sameSite }));
      mergeSignals(techAcc, sig, { headers: nav.response ? await nav.response.allHeaders().catch(() => ({})) : {}, cookies });
      if (want('ui', 'suggestions')) mergeDesign(designAcc, await page.evaluate(inPageDesign));
      route.perf = await page.evaluate(() => {
        const n = performance.getEntriesByType('navigation')[0];
        const res = performance.getEntriesByType('resource');
        return n ? { ttfb: Math.round(n.responseStart), dom_content_loaded: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd), requests: res.length, transfer_kb: Math.round(res.reduce((a, r) => a + (r.transferSize || 0), 0) / 1024) } : null;
      });
    } catch (e) { project.log('warn', `design/tech scan failed on ${route.id}: ${short(e)}`); }

    if (!route.screenshots.length) await capture(route, 'all', '');
    harvest(route, data, depth, 'page');

    if (cfg.clickTabs && want('screenshots', 'forms', 'workflows', 'data-model', 'docs')) {
      const tabs = data.controls.filter((c) => c.role === 'tab' && c.label && c.visible && c.selected !== 'true' && !c.disabled).slice(0, cfg.maxTabsPerPage);
      for (const t of tabs) {
        if (classifyAction(t.label, { role: 'tab' }).category === 'C') continue;
        try {
          const before = normalizeUrl(page.url());
          await page.getByRole('tab', { name: t.label, exact: true }).first().click({ timeout: 3000 });
          await page.waitForTimeout(250);
          await capture(route, 'modules', `tab ${t.label}`);
          harvest(route, await inspectPage(page), depth, `tab:${t.label}`);
          markExercised(route, t.label, 'tab');
          const after = normalizeUrl(page.url());
          if (after && after !== before) { enqueue(after, depth + 1, route.id, 'tab'); await gotoWithRetry(page, url); }
        } catch (e) { issues.push(`tab "${t.label}": ${short(e)}`); }
      }
    }

    if (cfg.probeOpeners) {
      const openers = data.controls.filter((c) => c.visible && !c.disabled && c.role === 'button' && !c.in_dialog && c.label && isOpener(c.label, { type: c.type })).slice(0, cfg.maxOpenersPerPage);
      for (const o of openers) {
        try {
          const before = normalizeUrl(page.url());
          await page.getByRole('button', { name: o.label, exact: true }).first().click({ timeout: 3000 });
          await page.waitForTimeout(400);
          const d2 = await inspectPage(page);
          markExercised(route, o.label, 'button');
          if (d2.dialogs.length || d2.forms.some((f) => f.in_dialog && f.visible)) {
            await capture(route, 'interactions', `dialog ${o.label}`);
            harvest(route, d2, depth, `dialog:${o.label}`);
            await closeDialog(page, url);
          } else if (normalizeUrl(page.url()) !== before) {
            enqueue(page.url(), depth + 1, route.id, 'opener');
            await gotoWithRetry(page, url);
          } else route.notes.push(`"${o.label}" had no observable effect`);
        } catch (e) { issues.push(`opener "${o.label}": ${short(e)}`); }
      }
    }

    if (cfg.responsive.enabled && want('screenshots', 'ui') && (state.stats.responsive || 0) < cfg.responsive.maxRoutes && !route.responsive) {
      await page.setViewportSize({ width: cfg.responsive.width, height: cfg.responsive.height });
      await page.waitForTimeout(300);
      await capture(route, 'interactions', 'mobile');
      const toggle = (await inspectPage(page)).controls.find((c) => c.visible && /menu|navigation|toggle/i.test(c.label));
      if (toggle) route.notes.push(`mobile: navigation toggle "${toggle.label}" visible at ${cfg.responsive.width}px`);
      route.responsive = true;
      state.stats.responsive = (state.stats.responsive || 0) + 1;
      await page.setViewportSize(cfg.viewport);
    }

    // diagnostics -> evidence
    const d = diag.drain();
    for (const a of d.api) {
      const u = new URL(a.url);
      const key = `${a.method} ${u.origin}${idTemplate(u.pathname)}`;
      const e = (network.api_calls[key] ||= { count: 0, statuses: {}, routes: [] });
      e.count++;
      e.statuses[a.status] = (e.statuses[a.status] || 0) + 1;
      if (!e.routes.includes(route.id)) e.routes.push(route.id);
    }
    network.per_route[route.id] = { console_errors: d.console.length, page_errors: d.page_errors.length, failed_requests: d.failed_requests.length, bad_responses: d.bad_responses.slice(0, 5), samples: d.console.slice(0, 3) };
    for (const b of guard.blocked) {
      if (network.blocked.length < 100) network.blocked.push({ route_id: route.id, ...b });
      route.notes.push(`blocked ${b.method} ${new URL(b.url).pathname}`);
    }
    guard.blocked.length = 0;

    addObservation(project, {
      type: 'observed',
      claim: `Page "${route.title || route.template}" (${route.template}) is reachable${needAuth ? ' after login' : ''}; it shows ${data.tables.length} table(s), ${data.forms.length} form(s) and ${data.controls.length} interactive control(s).`,
      route_id: route.id, source_url: url, screenshot: route.screenshots[0] || null,
    });
    const t = data.tech;
    const hints = [t.meta_generator && `meta generator "${t.meta_generator}"`, t.ng_version && `ng-version ${t.ng_version}`, t.next_data && '__NEXT_DATA__ element', t.nuxt && 'window.__NUXT__', t.vue && 'Vue root marker', t.react_root && 'React root marker'].filter(Boolean);
    if (hints.length) addObservation(project, { type: 'observed', claim: `Page markup contains: ${hints.join(', ')}. (A marker is evidence of a library, not proof of the whole stack.)`, route_id: route.id, source_url: url, confidence: 'medium' });

    route.notes.push(...issues);
    route.notes = [...new Set(route.notes)].slice(0, 30);
    registry.setResult(route, url, issues.length ? 'partial' : 'explored');
  }

  // ---- main loop -------------------------------------------------------
  const runId = `run-${shortHash(nowIso(), 6)}`;
  const t0 = Date.now();
  let stop = false;
  const onSig = () => { stop = true; };
  process.on('SIGINT', onSig);
  state.status = 'running';
  state.started_at ||= nowIso();
  state.stop_reason = null;

  const checkpoint = () => {
    state.done = [...done];
    project.saveRoutes(registry.routes);
    project.saveForms(forms);
    project.saveControls(controlsMap);
    project.saveFailures(failures);
    writeJson(project.p.network, network);
    writeJson(project.p.techStack, techAcc);
    writeJson(project.p.designTokens, designAcc);
    project.saveState(state);
  };
  checkpoint();

  let restarts = 0;
  try {
    session = await startSession();
    while (state.queue.length) {
      if (stop) { state.stop_reason = 'interrupted'; break; }
      if (Date.now() - t0 > cfg.timeBudgetSec * 1000) { state.stop_reason = 'time_budget'; break; }
      if (done.size >= cfg.maxPages) { state.stop_reason = 'max_pages'; break; }
      const item = state.queue[0];
      try {
        await visit(item);
      } catch (e) {
        if (CRASH_RE.test(e.message) && restarts < cfg.maxRestarts) {
          restarts++;
          state.stats.restarts++;
          project.log('warn', `browser died (${short(e)}); restarting (${restarts}/${cfg.maxRestarts})`);
          await session.close();
          session = await startSession();
          continue; // retry the same item
        }
        const route = registry.findByUrl(item.url);
        if (route) {
          registry.setResult(route, item.url, 'failed');
          route.failure = short(e);
          failures.push({ route_id: route.id, url: redactText(item.url), access: 'exception', reason: short(e), at: nowIso() });
        }
        project.log('error', `${item.url}: ${short(e)}`);
      }
      state.queue.shift();
      done.add(item.url);
      state.stats.pages_visited++;
      checkpoint();
      project.log('info', `visited ${item.url} (queue ${state.queue.length})`);
      opts.onProgress?.({ url: item.url, done: done.size, queue: state.queue.length });
      if (cfg.delayMs) await sleep(cfg.delayMs);
    }
    if (!state.queue.length) state.stop_reason = state.stop_reason || 'queue_exhausted';
  } finally {
    process.off('SIGINT', onSig);
    await session?.close();
    state.status = state.queue.length ? 'paused' : 'completed';
    checkpoint();
    const rm = readJson(project.p.runManifest, { runs: [] });
    rm.runs.push({ run_id: runId, started_at: new Date(t0).toISOString(), ended_at: nowIso(), pages_visited_total: done.size, stop_reason: state.stop_reason, restarts, headless: opts.headless ?? cfg.headless, limits: { maxPages: cfg.maxPages, maxDepth: cfg.maxDepth, timeBudgetSec: cfg.timeBudgetSec, maxPerTemplate: cfg.maxPerTemplate }, authenticated: needAuth });
    writeJson(project.p.runManifest, rm);
  }
  return { status: state.status, stop_reason: state.stop_reason, pages: done.size, routes: registry.routes.length, queue: state.queue.length };
}
