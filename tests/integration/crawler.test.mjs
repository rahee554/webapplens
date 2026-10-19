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
