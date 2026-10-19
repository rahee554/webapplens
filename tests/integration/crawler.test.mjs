import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer, DEMO_USER, DEMO_PASS } from '../fixtures/demo-app/server.mjs';
import { initProject } from '../../skills/webapp-research/scripts/lib/project.mjs';
import { crawl } from '../../skills/webapp-research/scripts/lib/crawler.mjs';
import { openSession } from '../../skills/webapp-research/scripts/lib/browser.mjs';
import { makeScope } from '../../skills/webapp-research/scripts/lib/scope.mjs';
import { generateDocs } from '../../skills/webapp-research/scripts/lib/docs.mjs';
import { fullAudit } from '../../skills/webapp-research/scripts/lib/coverage.mjs';
import { clearSecrets } from '../../skills/webapp-research/scripts/lib/redact.mjs';

let app;
let root;
const FAST = { delayMs: 0, navTimeoutMs: 8000, retries: 1, probeOpeners: true, responsive: { enabled: true, maxRoutes: 1 }, auth: { required: true } };
const mkProject = (name, over = {}) => {
  const { project } = initProject({ outRoot: root, app: name, baseUrl: over.baseUrl || app.url, config: { ...FAST, ...over } });
  fs.writeFileSync(project.p.credentials, JSON.stringify({ username_env: 'SHOP_USERNAME', password_env: 'SHOP_PASSWORD' }));
  return project;
};

before(async () => {
  app = await startServer();
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'wr-int-'));
  process.env.SHOP_USERNAME = DEMO_USER;
  process.env.SHOP_PASSWORD = DEMO_PASS;
});
after(async () => {
  await app.close();
  clearSecrets();
});

test('browser starts and renders a page', async () => {
  const s = await openSession({ viewport: { width: 640, height: 480 }, navTimeoutMs: 5000, headless: true }, makeScope({ baseUrl: app.url }), {});
  await s.page.setContent('<title>hello</title>');
  assert.equal(await s.page.title(), 'hello');
  await s.close();
});

test('mutation guard blocks non-GET requests from the page', async () => {
  const s = await openSession({ viewport: { width: 640, height: 480 }, navTimeoutMs: 5000, headless: true }, makeScope({ baseUrl: app.url }), {});
  await s.page.goto(`${app.url}/login`);
  s.guard.enabled = true;
  const outcome = await s.page.evaluate(async () => {
    try { await fetch('/login', { method: 'POST', body: 'x=1' }); return 'sent'; } catch { return 'blocked'; }
  });
  await s.close();
  assert.equal(outcome, 'blocked');
  assert.equal(app.stats.loginPosts, 0);
  assert.equal(s.guard.blocked.length, 1);
});

let full;
test('full authenticated crawl of the demo app', async () => {
  const project = mkProject('Shop');
  const res = await crawl(project, {});
  assert.equal(res.status, 'completed');
  assert.equal(res.stop_reason, 'queue_exhausted');
  full = { project, routes: project.routes(), forms: project.forms(), controls: project.controls() };
  const t = (tpl) => full.routes.find((r) => r.template === tpl);

  // discovery: nested nav behind a collapsed group, pagination, dynamic routes, hash/SPA link injected by JS
  for (const tpl of ['/', '/customers', '/customers/:id', '/customers/:id/edit', '/inventory/products', '/inventory/categories', '/settings', '/spa', '/reports/:id', '/#/sales'])
    assert.ok(t(tpl), `route ${tpl} not discovered`);
  assert.equal(t('/customers/:id').examples.length, 3, 'dynamic route sampled to maxPerTemplate');
  assert.ok(t('/customers').examples.length >= 2, 'pagination followed');
  assert.ok(t('/customers/:id').skipped_variants > 0);
  assert.equal(t('/customers').status, 'explored');
  assert.equal(t('/admin').status, 'blocked');
  assert.equal(t('/admin').access_status, 'forbidden');
  assert.equal(t('/missing-page').status, 'failed');
  assert.equal(t('/missing-page').access_status, 'not_found');
});

test('safety: nothing mutating or session-ending reached the server', () => {
  assert.deepEqual(app.stats.mutations, []);
  assert.equal(app.stats.logoutHits, 0);
  assert.equal(app.stats.loginPosts, 1, 'exactly one login');
  const state = full.project.state();
  assert.ok(state.external_origins.includes('https://example.org'));
  assert.equal(full.routes.some((r) => r.origin === 'https://example.org'), false, 'external origin was not crawled');
});

test('form inventory: fields, required flags, options, and secret redaction', () => {
  const dlg = full.forms.find((f) => f.in_dialog);
  assert.ok(dlg, 'dialog form found');
  const byLabel = Object.fromEntries(dlg.fields.map((f) => [f.label, f]));
  assert.equal(byLabel.Name.required, true);
  assert.equal(byLabel.Name.maxlength, '40');
  assert.equal(byLabel.Email.type, 'email');
  assert.deepEqual(byLabel.Type.options, ['Individual', 'Company']);
  assert.equal(dlg.submit_tested, false);
  assert.equal(dlg.ui_state, 'dialog:Add Customer');
  const settings = full.forms.find((f) => f.fields.some((x) => x.name === 'pw'));
  const pw = settings.fields.find((x) => x.name === 'pw');
  const key = settings.fields.find((x) => x.name === 'api_key');
  assert.equal(pw.default, null, 'password default never recorded');
  assert.equal(key.default, null, 'secret-looking field default never recorded');
  const theme = settings.fields.find((x) => x.name === 'theme');
  assert.deepEqual(theme.options, ['Light', 'Dark']);
  assert.equal(theme.default, 'Light');
});

test('interactions: tabs, dialog, responsive captured with manifest entries that exist on disk', () => {
  const shots = full.project.shots();
  const files = shots.map((s) => s.file);
  for (const f of ['screenshots/modules/customers-id--tab-invoices.png', 'screenshots/modules/customers-id--tab-notes.png', 'screenshots/interactions/customers--dialog-add-customer.png'])
    assert.ok(files.includes(f), `missing screenshot ${f}`);
  assert.ok(files.some((f) => f.includes('--mobile')), 'responsive view captured');
  for (const s of shots) {
    assert.ok(fs.existsSync(path.join(full.project.p.dir, s.file)), `${s.file} not on disk`);
    assert.ok(s.captured_at && s.viewport && s.route_id);
  }
  assert.equal(new Set(files).size, files.length, 'no duplicate manifest entries');
  assert.ok(full.controls[full.routes.find((r) => r.template === '/customers/:id').id].some((c) => c.role === 'tab' && c.exercised));
});

test('controls are classified A/B/C and destructive ones were never exercised', () => {
  const all = Object.values(full.controls).flat();
  const del = all.find((c) => c.label === 'Delete');
  assert.equal(del.category, 'C');
  assert.equal(del.exercised, false);
  assert.equal(all.find((c) => c.label === 'Save').category, 'B');
  assert.equal(all.find((c) => c.label === 'Inventory').category, 'A', 'disclosure toggles are navigation');
});

test('secrets: password never appears anywhere in the project folder', () => {
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === '.secrets' ? [] : walk(path.join(d, e.name))) : [path.join(d, e.name)]));
  for (const f of walk(full.project.p.dir)) {
    if (/\.(png)$/.test(f)) continue;
    assert.ok(!fs.readFileSync(f, 'utf8').includes(DEMO_PASS), `password leaked into ${path.relative(full.project.p.dir, f)}`);
  }
  assert.ok(fs.existsSync(full.project.p.storageState), 'session state saved to .secrets only');
});

test('network evidence captured and report/audit are consistent', () => {
  const net = JSON.parse(fs.readFileSync(full.project.p.network, 'utf8'));
  assert.ok(net.per_route && Object.keys(net.per_route).length > 5);
  const audit = generateDocs(full.project);
  assert.equal(audit.links.broken.length, 0, JSON.stringify(audit.links.broken));
  assert.equal(audit.routes.blocked, 1);
  assert.equal(audit.routes.failed, 1);
  assert.equal(audit.screenshots.coverage_pct, 100);
  assert.ok(audit.forms.inventoried >= 5);
  assert.doesNotMatch(audit.verdict, /fully explored/i);
  assert.ok(audit.unresolved_todos > 0, 'unfilled analysis docs are flagged, not hidden');
  const mod = fs.readFileSync(path.join(full.project.p.dir, 'docs/modules/customers.md'), 'utf8');
  assert.match(mod, /Add Customer/);
  assert.match(mod, /screenshots\/interactions\/customers--dialog-add-customer\.png/);
});

test('resume: a limited run pauses, a second run finishes with no duplicate work', async () => {
  const project = mkProject('ShopResume', { maxPages: 3 });
  const first = await crawl(project, {});
  assert.equal(first.status, 'paused');
  assert.equal(first.stop_reason, 'max_pages');
  assert.ok(first.queue > 0);
  const cfg = project.config();
  cfg.maxPages = 150;
  project.saveConfig(cfg);
  const second = await crawl(project, {});
  assert.equal(second.status, 'completed');
  const done = project.state().done;
  assert.equal(new Set(done).size, done.length, 'no URL visited twice');
  assert.equal(project.routes().length, full.routes.length, 'resumed run finds the same routes as an uninterrupted one');
  assert.equal(project.shots().length, full.project.shots().length);
  assert.equal(fullAudit(project).routes.remaining, 0);
});

test('resume after a crash: an in-progress route is re-queued', async () => {
  const project = mkProject('ShopCrash', { maxPages: 2 });
  await crawl(project, {});
  // simulate a hard kill mid-page: route marked in_progress, checkpoint not advanced
  const routes = project.routes();
  const r = routes.find((x) => x.status === 'explored');
  const url = r.examples[0];
  r.results[url] = 'in_progress';
  r.status = 'in_progress';
  project.saveRoutes(routes);
  const s = project.state();
  s.done = s.done.filter((u) => u !== url);
  project.saveState(s);
  const cfg = project.config();
  cfg.maxPages = 150;
  project.saveConfig(cfg);
  const res = await crawl(project, {});
  assert.equal(res.status, 'completed');
  assert.notEqual(project.routes().find((x) => x.id === r.id).status, 'in_progress');
});

test('failed navigation is recorded, not thrown', async () => {
  const project = mkProject('Dead', { baseUrl: 'http://127.0.0.1:1', auth: { required: false }, retries: 0, navTimeoutMs: 3000 });
  fs.writeFileSync(project.p.credentials, '{}'); // anonymous crawl
  const res = await crawl(project, {});
  assert.equal(res.status, 'completed');
  const [r] = project.routes();
  assert.equal(r.status, 'failed');
  assert.equal(r.access_status, 'navigation_error');
  assert.equal(project.failures().length, 1);
});

test('wrong credentials fail fast with a clear message and no crawl', async () => {
  const project = mkProject('BadLogin');
  process.env.SHOP_PASSWORD = 'wrong-password';
  try {
    await assert.rejects(() => crawl(project, {}), /Login failed \(login_rejected\)/);
  } finally {
    process.env.SHOP_PASSWORD = DEMO_PASS;
  }
  assert.equal(project.routes().length, 1, 'only the seed route exists');
});

test('crawl refuses to start without credentials when login is required', async () => {
  const project = mkProject('NoCreds');
  const saved = [process.env.SHOP_USERNAME, process.env.SHOP_PASSWORD];
  delete process.env.SHOP_USERNAME;
  delete process.env.SHOP_PASSWORD;
  try {
    await assert.rejects(() => crawl(project, {}), /no credentials were found/);
  } finally {
    [process.env.SHOP_USERNAME, process.env.SHOP_PASSWORD] = saved;
  }
});

// ---- flaws found by the agent evaluation, plus discovery/probe features ----------------------------------

test('crawl quality: action forms, deduped examples, GET search, lists, dead-link label, unique skip counts', () => {
  const t = (tpl) => full.routes.find((r) => r.template === tpl);
  // row-level Delete forms are inventoried once (templated action), as category C, never submitted
  const del = full.forms.filter((f) => f.kind === 'action' && /delete/.test(f.action_template));
  assert.equal(del.length, 1);
  assert.equal(del[0].category, 'C');
  assert.equal(del[0].submit_tested, false);
  // sampled examples of /customers/:id/edit are one form, not three
  const edit = full.forms.filter((f) => f.route_id === t('/customers/:id/edit').id && f.kind === 'form');
  assert.equal(edit.length, 1);
  // a GET search form's button is read-only
  const search = Object.values(full.controls).flat().find((c) => c.label === 'Search');
  assert.equal(search.category, 'A');
  // plain lists are captured as content
  assert.equal(t('/inventory/categories').lists[0].items, 2);
  assert.deepEqual(t('/inventory/categories').lists[0].sample, ['Hardware', 'Software']);
  // dead link: label kept and the 404 page is screenshotted
  assert.equal(t('/missing-page').discovered_label, 'Old page');
  assert.ok(t('/missing-page').screenshots.length >= 1);
  // skip counters are per unique link, not per page visit
  const sk = full.project.state().skipped;
  assert.equal(sk.external, 1);
  assert.equal(sk['non-http'], 1);
  // unique-control accounting: the nav toggle repeated on every page counts once
  const a = fullAudit(full.project);
  assert.ok(a.controls.instances > a.controls.catalogued);
});

test('hash routes get time to render before they are captured', () => {
  const sales = full.routes.find((r) => r.template === '/#/sales');
  assert.ok(sales && sales.status === 'explored');
});

test('probe: read-only GET through the saved session and guards; out-of-scope URLs are refused', async () => {
  const { probeUrls } = await import('../../skills/webapp-research/scripts/lib/probe.mjs');
  const before = app.stats.mutations.length;
  const out = await probeUrls(full.project, ['/customers?page=2', 'https://example.org/x', '/logout-never'], { text: true, screenshot: true });
  const ok = out.find((o) => o.url?.includes('/customers?page=2'));
  assert.equal(ok.status, 200);
  assert.match(ok.text, /Customer 6/);
  assert.ok(fs.existsSync(path.join(full.project.p.dir, ok.screenshot)));
  assert.match(out.find((o) => o.url === 'https://example.org/x').error, /out of scope/);
  assert.equal(app.stats.mutations.length, before);
  assert.equal(app.stats.logoutHits, 0);
});

test('read-only GraphQL guard: queries pass, mutations are blocked (only when enabled)', async () => {
  const cfg = { viewport: { width: 640, height: 480 }, navTimeoutMs: 5000, headless: true, allowReadOnlyGraphql: true };
  const s = await openSession(cfg, makeScope({ baseUrl: app.url }), {});
  await s.page.goto(`${app.url}/demo-info`);
  s.guard.enabled = true;
  const post = (body) => s.page.evaluate(async (b) => { try { await fetch('/graphql', { method: 'POST', body: b }); return 'sent'; } catch { return 'blocked'; } }, body);
  assert.equal(await post(JSON.stringify({ query: 'query { a }' })), 'sent');
  assert.equal(await post(JSON.stringify({ query: 'mutation { b }' })), 'blocked');
  await s.close();
  const strict = await openSession({ ...cfg, allowReadOnlyGraphql: false }, makeScope({ baseUrl: app.url }), {});
  await strict.page.goto(`${app.url}/demo-info`);
  strict.guard.enabled = true;
  const r = await strict.page.evaluate(async () => { try { await fetch('/graphql', { method: 'POST', body: JSON.stringify({ query: 'query { a }' }) }); return 'sent'; } catch { return 'blocked'; } });
  await strict.close();
  assert.equal(r, 'blocked', 'off by default');
  assert.equal(app.stats.graphql.length, 1);
  assert.match(app.stats.graphql[0], /query \{ a \}/);
});

test('demo discovery: probe finds published credentials; ONE login attempt each; secrets saved only when verified', async () => {
  const { probeDemo, demoLogin } = await import('../../skills/webapp-research/scripts/lib/discovery.mjs');
  const outDir = path.join(root, '.webapplens', 'docs');
  const { file, probe } = await probeDemo(`${app.url}/demo-info`, { outDir });
  assert.ok(file.includes('_discovery'));
  assert.equal(probe.captcha, false);
  assert.equal(probe.credential_candidates.length, 2, 'placeholder "********" is not a candidate');
  assert.equal(probe.credential_candidates[0].username, DEMO_USER);
  assert.ok(probe.links.some((l) => /login/i.test(l.text)));

  const project = initProject({ outRoot: outDir, app: 'Found', baseUrl: app.url }).project;
  const posts0 = app.stats.loginPosts;
  const bad = await demoLogin(file, { index: 1, saveTo: project.dir });
  assert.equal(bad.ok, false);
  assert.equal(bad.attempts, 1);
  assert.equal(app.stats.loginPosts, posts0 + 1, 'exactly one attempt');
  let meta = JSON.parse(fs.readFileSync(project.p.credentials, 'utf8'));
  assert.equal(meta.verification_status, 'failed');
  assert.ok(!('password' in meta), 'unverified credentials are not stored');

  // the demo page has no form of its own: demoLogin follows its login link
  const loginProbe = { file };
  const good = await demoLogin(loginProbe.file, { index: 0, saveTo: project.dir });
  assert.equal(good.ok, true);
  assert.equal(app.stats.loginPosts, posts0 + 2);
  meta = JSON.parse(fs.readFileSync(project.p.credentials, 'utf8'));
  assert.equal(meta.verification_status, 'verified');
  assert.equal(meta.credentials_source, 'vendor_published');
  assert.match(meta.source_url, /demo-info/);
  assert.match(fs.readFileSync(path.join(path.dirname(outDir), '.gitignore'), 'utf8'), /_discovery\//, 'discovery probes (public credentials) are git-ignored by default');
});

// ---- UI research, stack detection, suggestions and precise scope on the real browser -------------------------

test('UI + stack research from a real crawl: tokens, tech doc, a11y/perf facts and suggestions', async () => {
  const { readFileSync, existsSync } = fs;
  const p = full.project;
  generateDocs(p);
  const tokens = JSON.parse(readFileSync(path.join(p.p.technicals, 'design-tokens.json'), 'utf8'));
  assert.equal(tokens.colors.primary, '#4f46e5', 'the fixture accent colour is recovered from computed styles');
  assert.ok(tokens.typography.families.length >= 1 && tokens.typography.scale.length >= 3);
  assert.ok(tokens.radii.includes(9) || tokens.radii.includes(12) || tokens.radii.includes(14) || tokens.radii.length >= 1);
  const design = readFileSync(path.join(p.p.technicals, 'design-system-observed.md'), 'utf8');
  assert.match(design, /Design system \(observed\)/);
  assert.match(design, /\*\*inferred\*\*/);
  const stack = readFileSync(path.join(p.p.technicals, 'tech-stack.md'), 'utf8');
  assert.match(stack, /inferred/);
  assert.match(stack, /Cookies \(names and flags only\)/);
  assert.match(stack, /sid/, 'cookie name is listed');
  assert.ok(!stack.includes('sid=ok') && !/ok\b.*HttpOnly.*ok/.test(stack), 'cookie values are never recorded');
  // per-route facts
  const home = full.project.routes().find((r) => r.template === '/customers');
  assert.ok(home.a11y && typeof home.a11y.h1_count === 'number');
  assert.ok(home.perf && home.perf.load >= 0);
  assert.equal(home.a11y.has_viewport, false, 'the fixture has no viewport meta');
  // suggestions come out of those facts
  const sug = readFileSync(path.join(p.p.reports, 'suggestions.md'), 'utf8');
  assert.match(sug, /No responsive viewport meta tag/);
  assert.match(sug, /Dead link to \/missing-page/);
  assert.ok(existsSync(path.join(p.p.dir, 'evidence', 'suggestions.json')));
  const obs = p.observations();
  assert.ok(obs.every((o) => !/laravel|django|react/i.test(o.claim) || o.type === 'inferred'), 'stack conclusions are always typed inferred');
});

test('precise scope: focus ui+stack runs only those scans, no screenshots and no unrelated doc templates', async () => {
  const project = mkProject('FocusUI', { focus: ['ui', 'stack'], maxPages: 6, probeOpeners: false, responsive: { enabled: false } });
  const res = await crawl(project, {});
  assert.ok(res.pages >= 3);
  assert.equal(project.shots().length, 0, 'screenshots were not asked for');
  assert.deepEqual(fs.readdirSync(project.p.shotsAll), []);
  const design = JSON.parse(fs.readFileSync(project.p.designTokens, 'utf8'));
  const tech = JSON.parse(fs.readFileSync(project.p.techStack, 'utf8'));
  assert.ok(design.pages >= 3 && tech.pages >= 3);
  const audit = generateDocs(project);
  assert.equal(audit.screenshots.required, 0, 'screenshot coverage is not demanded when not requested');
  assert.ok(!audit.issues.some((i) => /screenshot/i.test(i)));
  assert.ok(fs.existsSync(path.join(project.p.docs, 'ui-patterns.md')), 'ui template created');
  for (const absent of ['user-guide.md', 'product-overview.md', 'technicals/architecture-proposal.md', 'technicals/data-model.md', 'improvement-plan.md']) assert.ok(!fs.existsSync(path.join(project.p.docs, absent)), `${absent} was not requested`);
  assert.ok(!fs.existsSync(path.join(project.p.reports, 'suggestions.md')), 'suggestions not requested');
});

test('precise scope: focus screenshots alone skips design/tech scans', async () => {
  const project = mkProject('FocusShots', { focus: ['screenshots'], maxPages: 4, probeOpeners: false, responsive: { enabled: false } });
  await crawl(project, {});
  assert.ok(project.shots().length >= 3);
  assert.equal(JSON.parse(fs.readFileSync(project.p.designTokens, 'utf8')).pages, 0);
  assert.equal(JSON.parse(fs.readFileSync(project.p.techStack, 'utf8')).pages, 0);
});
