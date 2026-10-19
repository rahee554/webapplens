import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { analyzeRequest, detectFacets, planFor } from '../../skills/webapp-research/scripts/lib/intent.mjs';
import { detectStack, mergeSignals, newTechAcc, securityObservations, summarizeStack } from '../../skills/webapp-research/scripts/lib/techstack.mjs';
import { designTokensJson, inferRoles, mergeDesign, newDesignAcc, renderDesignDoc } from '../../skills/webapp-research/scripts/lib/design.mjs';
import { buildSuggestions } from '../../skills/webapp-research/scripts/lib/suggest.mjs';
import { renderRepoDocs, scanRepo } from '../../skills/webapp-research/scripts/lib/repo.mjs';
import { inferModel, proposeArchitecture, singular } from '../../skills/webapp-research/scripts/lib/architect.mjs';
import { deliver } from '../../skills/webapp-research/scripts/lib/deliver.mjs';
import { checkUpdate, compareVersions, detectInstall, runUpdate, updateNotice } from '../../skills/webapp-research/scripts/lib/update.mjs';
import { initProject } from '../../skills/webapp-research/scripts/lib/project.mjs';
import { RouteRegistry } from '../../skills/webapp-research/scripts/lib/routes.mjs';
import { writeJson } from '../../skills/webapp-research/scripts/lib/util.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'wr-cap-'));
const mk = () => initProject({ outRoot: tmp(), app: 'Cap', baseUrl: 'https://cap.test' }).project;
const put = (root, rel, text) => { const f = path.join(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };

// ---------------------------------------------------------------------------------------------- precise scope
test('intent: only the asked-for facets run; negation excludes; vague requests ask questions', () => {
  const a = analyzeRequest('I only need the UI theme colors and tech stack of https://shop.test, no screenshots');
  assert.deepEqual([...a.facets].sort(), ['routes', 'stack', 'ui']);
  assert.deepEqual(a.excluded, ['screenshots']);
  assert.ok(a.plan.skipped.some((s) => /screenshots: excluded by the user/.test(s)));
  assert.ok(!a.plan.outputs.some((o) => /screenshots/.test(o)), 'no screenshot output planned');
  assert.ok(a.plan.commands[0].includes('--focus stack,ui') || a.plan.commands[0].includes('--focus ui,stack'));

  const s = detectFacets('take screenshots of every page');
  assert.deepEqual(s.facets.sort(), ['routes', 'screenshots'], 'a screenshots request is not a full-research request');

  const arch = detectFacets('I want an architecture design for this school app');
  assert.ok(arch.facets.includes('architecture') && arch.facets.includes('data-model') && arch.facets.includes('stack'));
  assert.ok(!arch.facets.includes('screenshots'));

  assert.deepEqual(detectFacets('without screenshots or architecture, document the user guide').excluded.sort(), ['architecture', 'screenshots']);
  assert.deepEqual(detectFacets('research everything about https://a.test').facets, ['full']);

  const vague = analyzeRequest('hello');
  assert.deepEqual(vague.questions.map((q) => q.id), ['target', 'goal']);
  assert.equal(analyzeRequest('architecture for https://x.test with laravel').questions.some((q) => q.id === 'target-stack'), false);
  assert.ok(analyzeRequest('architecture for https://x.test').questions.some((q) => q.id === 'target-stack'));
  assert.ok(planFor(['repo']).commands.some((c) => c.startsWith('repo-scan')));
});

// ---------------------------------------------------------------------------------------------- tech stack
test('tech stack: signals merge, detections carry evidence and calibrated confidence', () => {
  const acc = newTechAcc();
  mergeSignals(acc, { globals: ['jQuery'], markers: ['csrf-meta', 'livewire'], hits: ['livewire', 'laravel-vite'], prefixes: {}, tailwind: 40, metas: { generator: 'DemoCMS' }, scripts: ['https://x.test/build/assets/app-1.js'], links: [], versions: { jquery: '3.6.0' }, lang: 'en' },
    { headers: { Server: 'nginx/1.24', 'X-Powered-By': 'PHP/8.2' }, cookies: [{ name: 'laravel_session', httpOnly: true, secure: true, sameSite: 'Lax' }, { name: 'XSRF-TOKEN', httpOnly: false, secure: true }] });
  const d = detectStack(acc);
  const by = Object.fromEntries(d.map((x) => [x.name, x]));
  assert.equal(by['Laravel (PHP)'].confidence, 'high');
  assert.ok(by['Laravel (PHP)'].signals.some((s) => /cookie name laravel_session/.test(s)));
  assert.equal(by.Livewire.confidence, 'medium');
  assert.equal(by.jQuery.version, '3.6.0');
  assert.ok(by.nginx && by.PHP);
  assert.ok(summarizeStack(d, acc).some((l) => /Laravel/.test(l) && /inferred/.test(l)));
  // cookie VALUES are never part of what is stored
  assert.ok(!JSON.stringify(acc).includes('value'));
  const sec = securityObservations(acc);
  assert.ok(sec.weak_cookies.some((c) => c.name === 'XSRF-TOKEN'));
  assert.deepEqual(detectStack(newTechAcc()), [], 'no signals, no claims');
  assert.match(summarizeStack([], newTechAcc())[0], /No confident stack signals/);
});

test('tech stack: security header presence is counted per page', () => {
  const acc = newTechAcc();
  const sig = { globals: [], markers: [], hits: [], prefixes: {}, tailwind: 0, metas: {}, scripts: [], links: [], versions: {}, lang: '' };
  mergeSignals(acc, sig, { headers: { 'content-security-policy': 'default-src self', 'x-frame-options': 'DENY' } });
  mergeSignals(acc, sig, { headers: { 'x-frame-options': 'DENY' } });
  const missing = securityObservations(acc).headers.find((h) => h.id === 'content-security-policy');
  assert.deepEqual([missing.missing_on, missing.of], [1, 2]);
});

// ---------------------------------------------------------------------------------------------- design
const samplePage = () => ({
  colors: { '#111111': 50, '#6b7280': 10 }, backgrounds: { '#ffffff': 40, '#4f46e5': 8 }, borders: { '#e5e7eb': 12 }, fonts: { Inter: 60 }, sizes: { 14: 40, 16: 10, 24: 3 }, weights: { 400: 50, 700: 8 }, radii: { 8: 20, 12: 4 }, shadows: { '0 1px 3px #000000': 5 },
  spacing: { 8: 30, 16: 40, 12: 10, 5: 1 },
  components: { buttons: [{ sig: 'a', bg: '#4f46e5', transparent: false, color: '#ffffff', radius: 8, fontSize: 14, weight: '600', padding: '8px 16px', border: 'none', sample: 'Save', count: 5 }], inputs: [], cards: [], table: { headerBg: '#f3f4f6', headerColor: '#6b7280', headerSize: 12, headerWeight: '600', transform: 'uppercase', cellPadding: '12px 16px' }, headings: { h1: { size: 27, weight: '700', color: '#111111', family: 'Inter' } }, link: { color: '#4f46e5', decoration: 'none' }, body: { bg: '#f4f5fb', color: '#111111', family: 'Inter', size: 15, lineHeight: 'normal' } },
  layout: { header: null, sidebar: { x: 0, width: 236, height: 850, position: 'fixed', display: 'block' }, main: { x: 236, width: 1130, height: 700, position: 'static', display: 'block' }, footer: null },
  cssVars: { '--primary': '#4f46e5' }, breakpoints: { 768: 2 }, darkMode: false, themeColor: null, contrast: { checked: 10, failures: 2, examples: [{ text: 'Muted', fg: '#9ca3af', bg: '#ffffff', ratio: 2.5, size: 12 }] },
});

test('design research: roles are inferred from frequency, tokens and doc are generated and honest', () => {
  const acc = newDesignAcc();
  mergeDesign(acc, samplePage());
  mergeDesign(acc, samplePage());
  assert.equal(acc.pages, 2);
  assert.equal(acc.components.buttons[0].count, 10, 'variant counts add up across pages');
  const r = inferRoles(acc);
  assert.equal(r.primary, '#4f46e5');
  assert.equal(r.surface, '#ffffff');
  assert.equal(r.text, '#111111');
  assert.ok(r.grid4 >= 95);
  const md = renderDesignDoc(acc, 'Cap');
  assert.match(md, /\*\*inferred\*\*/);
  assert.match(md, /#4f46e5/);
  assert.match(md, /Contrast check/);
  assert.match(md, /--primary/);
  const tokens = designTokensJson(acc);
  assert.equal(tokens.colors.primary, '#4f46e5');
  assert.deepEqual(tokens.breakpoints, [768]);
});

// ---------------------------------------------------------------------------------------------- suggestions
test('suggester: evidence-backed findings, accepted routes skipped, severity ordering', () => {
  const p = mk();
  const reg = new RouteRegistry([], {});
  const mkRoute = (u, extra) => Object.assign(reg.add(u).route, { status: 'explored', controls: { total: 3, by_category: { A: 3, B: 0, C: 0 }, exercised: 0 } }, extra);
  const a = mkRoute('https://cap.test/a', { title: 'App', a11y: { images_no_alt: 3, inputs_no_label: 2, buttons_no_name: 1, links_no_name: 0, h1_count: 0, has_lang: false, has_viewport: false, has_main: true, title_empty: false, tables_no_headers: 0, duplicate_ids: 0, positive_tabindex: 0 }, perf: { ttfb: 100, load: 4200, requests: 90, transfer_kb: 3000 }, tables: [{ rows: 12, headers: ['A'], sortable: false }], has_search: false });
  mkRoute('https://cap.test/b', { title: 'App' });
  mkRoute('https://cap.test/c', { title: 'App' });
  const dead = Object.assign(reg.add('https://cap.test/old').route, { status: 'failed', access_status: 'not_found', discovered_label: 'Old page' });
  const accepted = Object.assign(reg.add('https://cap.test/gone').route, { status: 'failed', access_status: 'not_found', accepted: { reason: 'known' } });
  p.saveRoutes(reg.routes);
  const des = newDesignAcc();
  mergeDesign(des, samplePage());
  writeJson(p.p.designTokens, des);
  const res = buildSuggestions(p);
  const titles = res.items.map((i) => i.title);
  assert.ok(titles.includes('Form fields without an accessible label'));
  assert.ok(titles.includes('No responsive viewport meta tag'));
  assert.ok(titles.includes('Slow pages'));
  assert.ok(titles.includes('Many pages share the same title'));
  assert.ok(titles.includes('Dead link to /old'));
  assert.ok(!titles.some((t) => /\/gone/.test(t)), 'accepted failures are not suggested');
  assert.ok(titles.includes('Low colour contrast'));
  const label = res.items.find((i) => /accessible label/.test(i.title));
  assert.equal(label.severity, 'high');
  assert.deepEqual(label.routes, [a.id]);
  assert.ok(res.items.every((i) => i.id && i.recommendation && i.evidence));
  assert.equal(res.items[0].severity, 'high', 'sorted by severity');
  assert.ok(dead.id);
});

// ---------------------------------------------------------------------------------------------- repo scan
test('repo scan: stack, routes, data model and env NAMES; secret files are never read', () => {
  const root = tmp();
  put(root, 'composer.json', JSON.stringify({ require: { 'laravel/framework': '^11.0', 'livewire/livewire': '^3.0' }, 'require-dev': { 'phpunit/phpunit': '^11' } }));
  put(root, 'artisan', '#!/usr/bin/env php');
  put(root, 'routes/web.php', "<?php\nRoute::get('/customers', [CustomerController::class, 'index']);\nRoute::post('/customers', [CustomerController::class, 'store']);\nRoute::resource('invoices', InvoiceController::class);\n");
  put(root, 'database/migrations/2024_01_01_create_customers_table.php', "<?php\nSchema::create('customers', function (Blueprint $table) {\n    $table->id();\n    $table->string('name');\n    $table->string('email')->nullable();\n    $table->timestamps();\n});\n");
  put(root, 'database/migrations/2024_01_02_create_invoices_table.php', "<?php\nSchema::create('invoices', function (Blueprint $table) {\n    $table->id();\n    $table->foreignId('customer_id')->constrained('customers');\n    $table->decimal('total', 10, 2);\n    $table->timestamps();\n});\n");
  put(root, 'app/Models/Customer.php', "<?php\nclass Customer extends Model {\n  public function invoices() {\n    return $this->hasMany(Invoice::class);\n  }\n}\n");
  put(root, 'prisma/schema.prisma', 'model Order {\n  id Int @id @default(autoincrement())\n  note String?\n  userId Int\n  user User @relation(fields: [userId], references: [id])\n}\nmodel User {\n  id Int @id\n  email String\n}\n');
  put(root, '.env', 'APP_KEY=base64:SUPERSECRETVALUE\nDB_PASSWORD=hunter2hunter2\n');
  put(root, '.env.example', 'APP_NAME=Example\nDB_PASSWORD=\nMAIL_HOST=\n');
  put(root, 'keys/id_rsa', 'PRIVATE KEY MATERIAL');
  put(root, 'node_modules/leftpad/index.js', 'module.exports = 1');
  const scan = scanRepo(root, { name: 'Demo' });
  assert.ok(scan.stack.some((s) => s.name === 'Laravel') && scan.stack.some((s) => s.name === 'Livewire'));
  assert.ok(scan.routes.some((r) => r.method === 'POST' && r.path === '/customers'));
  assert.ok(scan.routes.some((r) => r.path === '/invoices'));
  const cust = scan.entities.find((e) => e.name === 'customers');
  assert.deepEqual(cust.columns.map((c) => c.name).slice(0, 3), ['id', 'name', 'email']);
  assert.equal(cust.columns.find((c) => c.name === 'email').nullable, true);
  assert.equal(scan.entities.find((e) => e.name === 'invoices').columns.find((c) => c.fk === 'customers').name, 'customer_id');
  assert.ok(scan.entities.some((e) => e.name === 'Order' && e.kind === 'prisma model'));
  assert.ok(scan.relations.some((r) => r.from === 'Customer' && r.to === 'Invoice'));
  assert.deepEqual(scan.env_vars.map((e) => e.name).sort(), ['APP_NAME', 'DB_PASSWORD', 'MAIL_HOST']);
  assert.ok(scan.totals.secret_files_skipped >= 2);
  const blob = JSON.stringify(scan);
  for (const secret of ['SUPERSECRETVALUE', 'hunter2hunter2', 'PRIVATE KEY MATERIAL']) assert.ok(!blob.includes(secret), `leaked ${secret}`);
  assert.ok(!blob.includes('leftpad'), 'node_modules is ignored');
  const docs = renderRepoDocs(scan);
  assert.match(docs.data, /erDiagram/);
  assert.match(docs.overview, /public_source/);
  assert.throws(() => scanRepo(path.join(root, 'nope')), /Not a folder/);
});

// ---------------------------------------------------------------------------------------------- architecture
test('architect: proposed entities from forms, relations, CRUD API outline and a stack skeleton; code wins over UI', () => {
  assert.equal(singular('customers'), 'customer');
  assert.equal(singular('categories'), 'category');
  assert.equal(singular('addresses'), 'address');
  const p = mk();
  const reg = new RouteRegistry([], {});
  const cust = Object.assign(reg.add('https://cap.test/customers').route, { status: 'explored', tables: [{ headers: ['Name', 'Email', 'Actions'], rows: 5, sortable: true }] });
  const inv = Object.assign(reg.add('https://cap.test/invoices').route, { status: 'explored' });
  p.saveRoutes(reg.routes);
  const F = (route, label, fields, method = 'POST') => ({ id: 'F' + route.id + label, route_id: route.id, label, kind: 'form', method, action_template: `/${route.module}`, fields, submit: ['Save'] });
  p.saveForms([
    F(cust, 'Add customer', [{ label: 'Name', name: 'name', type: 'text', required: true, maxlength: '40' }, { label: 'Email', name: 'email', type: 'email', required: true }, { label: 'Type', name: 'type', type: 'select', options: ['Individual', 'Company'] }]),
    F(inv, 'New invoice', [{ label: 'Customer', name: 'customer', type: 'select', options: ['A', 'B'], required: true }, { label: 'Amount', name: 'amount', type: 'number', required: true }, { label: 'Due date', name: 'due', type: 'date' }]),
    F(cust, 'Search', [{ label: 'Search', name: 'q', type: 'search' }], 'GET'),
    { id: 'Fdel', route_id: cust.id, label: '"Delete" form', kind: 'action', method: 'POST', action_template: '/customers/:id/delete', fields: [], submit: ['Delete'], category: 'C' },
  ]);
  const model = inferModel(p);
  const names = model.entities.map((e) => e.name).sort();
  assert.deepEqual(names, ['Customer', 'Invoice'], 'search and action forms are not entities');
  const c = model.entities.find((e) => e.name === 'Customer');
  assert.equal(c.columns.find((x) => x.name === 'email').nullable, false);
  assert.equal(c.columns.find((x) => x.name === 'type').type, 'enum');
  assert.equal(c.columns.find((x) => x.name === 'name').max, '40');
  assert.ok(model.relations.some((r) => r.from === 'Invoice' && r.to === 'Customer' && r.via === 'customer'), 'select named after another entity becomes a relation');
  const res = proposeArchitecture(p, { stack: 'laravel' });
  assert.equal(res.entities, 2);
  const md = fs.readFileSync(path.join(p.p.technicals, 'proposed-schema.md'), 'utf8');
  assert.match(md, /PROPOSED, not confirmed/);
  assert.match(md, /Schema::create\('customers'/);
  assert.match(md, /erDiagram/);
  assert.match(md, /POST \/customers|\| POST \| \/customers \|/);
  assert.match(md, /PROPOSED \(CRUD convention\)/);
  assert.ok(fs.existsSync(path.join(p.p.technicals, 'architecture-baseline.md')));
  // a repo scan overrides UI inference
  writeJson(p.p.repoScan, { stack: [{ name: 'Laravel' }], entities: [{ name: 'customers', source: 'database/migrations/x.php', columns: [{ name: 'id', type: 'bigint' }, { name: 'legal_name', type: 'string', nullable: false }] }], routes: [] });
  const again = inferModel(p).entities.find((e) => e.name === 'Customer');
  assert.equal(again.from, 'source code');
  assert.deepEqual(again.columns.map((x) => x.name), ['id', 'legal_name']);
});

// ---------------------------------------------------------------------------------------------- delivery
test('deliver: client docs go to the project root; drafts, secrets and agent internals stay in .webapplens', () => {
  const root = tmp();
  const p = initProject({ outRoot: path.join(root, '.webapplens', 'docs'), app: 'Client', baseUrl: 'https://c.test' }).project;
  const put2 = (rel, t) => put(p.p.dir, rel, t);
  put2('docs/product-overview.md', '# Overview\nA finished document. [limits](limitations.md)\n');
  put2('docs/limitations.md', '# Limitations\nread-only crawl\n');
  put2('docs/user-guide.md', '# Guide\n<!-- TODO(agent): write this -->\n');
  put2('docs/technicals/tech-stack.md', '# Stack\nToken Bearer abc.def-123456 leaked here\n');
  put2('screenshots/all/home.png', 'png');
  put2('reports/suggestions.md', '# Suggestions\n');
  put2('evidence/observations.jsonl', '{}');
  fs.writeFileSync(p.p.credentials, JSON.stringify({ username: 'u', password: 'p' }));
  put2('.secrets/storage-state.json', '{"cookies":[]}');
  const r = deliver(p, { root });
  assert.equal(r.to, path.join(root, 'docs', 'research', 'Client'));
  const has = (rel) => fs.existsSync(path.join(r.to, rel));
  assert.ok(has('docs/product-overview.md') && has('docs/limitations.md') && has('screenshots/all/home.png') && has('reports/suggestions.md') && has('README.md') && has('docs/index.md'));
  assert.ok(!has('docs/user-guide.md'), 'unfinished docs are withheld');
  assert.deepEqual(r.drafts_withheld, ['docs/user-guide.md']);
  assert.ok(r.flagged_for_review.includes('docs/technicals/tech-stack.md'), 'secret-looking text is flagged for review');
  for (const internal of ['credentials.json', '.secrets', 'crawlers', 'evidence', 'logs', 'research-manifest.json']) assert.ok(!has(internal), `${internal} must not be delivered`);
  assert.deepEqual(r.broken_links, [], 'delivered docs link only to delivered files');
  assert.match(fs.readFileSync(path.join(r.to, 'README.md'), 'utf8'), /Not included \(still in progress\)/);
  const withDrafts = deliver(p, { root, to: 'out2', includeDrafts: true });
  assert.ok(fs.existsSync(path.join(withDrafts.to, 'docs/user-guide.md')));
  assert.throws(() => deliver(p, { root, to: path.relative(root, path.join(p.p.dir, 'inside')) }), /must not be inside/);
});

// ---------------------------------------------------------------------------------------------- updates
test('updates: version compare, cached/offline checks, notices, install detection', async () => {
  assert.equal(compareVersions('0.2.0', '0.1.9'), 1);
  assert.equal(compareVersions('0.10.0', '0.9.0'), 1);
  assert.equal(compareVersions('v1.0.0', '1.0.0'), 0);
  assert.equal(compareVersions('0.2.0', '0.2.1'), -1);
  const dir = tmp();
  put(dir, 'VERSION', '0.2.0\n');
  const cacheFile = path.join(tmp(), 'cache.json');
  let calls = 0;
  const ok = async () => { calls++; return { ok: true, text: async () => '0.3.0\n' }; };
  const r1 = await checkUpdate({ dir, cacheFile, fetchImpl: ok });
  assert.deepEqual([r1.update_available, r1.latest, r1.cached], [true, '0.3.0', false]);
  const r2 = await checkUpdate({ dir, cacheFile, fetchImpl: ok });
  assert.deepEqual([r2.cached, calls], [true, 1], 'cache is used for 24h');
  await checkUpdate({ dir, cacheFile, fetchImpl: ok, force: true });
  assert.equal(calls, 2);
  const off = await checkUpdate({ dir, cacheFile: path.join(tmp(), 'none.json'), fetchImpl: async () => { throw new Error('offline'); } });
  assert.deepEqual([off.offline, off.update_available, off.latest], [true, false, null], 'offline never throws or blocks');
  const bad = await checkUpdate({ dir, cacheFile: path.join(tmp(), 'bad.json'), fetchImpl: async () => ({ ok: true, text: async () => '<html>' }) });
  assert.equal(bad.update_available, false);
  assert.match(updateNotice(r1), /0\.2\.0 -> 0\.3\.0/);
  assert.equal(updateNotice({ ...r1, update_available: false }), null);
  assert.equal(detectInstall(path.join('home', '.claude', 'plugins', 'cache', 'webapplens', 'skills', 'webapp-research')).kind, 'plugin');
  assert.equal(detectInstall(dir).kind, 'copy');
});

test('update (copied install): plan without --yes; with --yes backs up outside skills, keeps node_modules, refreshes agents', async () => {
  const base = tmp();
  const skill = path.join(base, '.claude', 'skills', 'webapp-research');
  put(skill, 'VERSION', '0.2.0\n');
  put(skill, 'SKILL.md', 'old skill');
  put(skill, 'node_modules/pw/index.js', 'keep me');
  put(base, '.claude/agents/skeptic.md', 'old agent');
  const incoming = tmp();
  put(incoming, 'VERSION', '0.3.0\n');
  put(incoming, 'SKILL.md', 'new skill');
  put(incoming, 'agents/skeptic.md', 'new agent');
  const check = { current: '0.2.0', latest: '0.3.0', update_available: true, offline: false };
  const ran = [];
  const args = { dir: skill, check, getSource: async () => incoming, run: (c) => ran.push(c), backupRoot: path.join(base, 'backups') };
  const plan = await runUpdate({ ...args, yes: false });
  assert.equal(plan.applied, false);
  assert.ok(plan.plan.length >= 4);
  assert.equal(fs.readFileSync(path.join(skill, 'SKILL.md'), 'utf8'), 'old skill', 'nothing changes without --yes');
  const done = await runUpdate({ ...args, yes: true });
  assert.equal(done.applied, true);
  assert.equal(fs.readFileSync(path.join(skill, 'SKILL.md'), 'utf8'), 'new skill');
  assert.equal(fs.readFileSync(path.join(skill, 'VERSION'), 'utf8').trim(), '0.3.0');
  assert.equal(fs.readFileSync(path.join(skill, 'node_modules/pw/index.js'), 'utf8'), 'keep me');
  assert.equal(fs.readFileSync(path.join(base, '.claude/agents/skeptic.md'), 'utf8'), 'new agent');
  assert.ok(done.backup.startsWith(path.join(base, 'backups')), 'backup is outside the skills folder (no duplicate skill)');
  assert.equal(fs.readFileSync(path.join(done.backup, 'SKILL.md'), 'utf8'), 'old skill');
  assert.deepEqual(ran, ['npm install --omit=dev']);
  await assert.rejects(() => runUpdate({ ...args, yes: true, getSource: async () => tmp() }), /does not look like the skill/);
  const same = await runUpdate({ ...args, yes: true, check: { ...check, latest: '0.2.0', update_available: false } });
  assert.match(same.message, /up to date/);
  const plugin = await runUpdate({ dir: path.join(base, '.claude', 'plugins', 'cache', 'x', 'webapp-research'), yes: true, check });
  assert.equal(plugin.applied, false);
  assert.match(plugin.message, /plugin marketplace update/);
});

test('one version everywhere: VERSION, package.json files, plugin and marketplace manifests', () => {
  const v = fs.readFileSync('skills/webapp-research/VERSION', 'utf8').trim();
  assert.match(v, /^\d+\.\d+\.\d+$/);
  const j = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
  assert.equal(j('package.json').version, v);
  assert.equal(j('skills/webapp-research/package.json').version, v);
  assert.equal(j('.claude-plugin/plugin.json').version, v);
  assert.equal(j('.claude-plugin/marketplace.json').plugins[0].version, v);
  assert.match(fs.readFileSync('CHANGELOG.md', 'utf8'), new RegExp(`\\[${v.replace(/\./g, '\\.')}\\]`));
  const hooks = j('hooks/hooks.json');
  assert.match(hooks.hooks.SessionStart[0].hooks[0].command, /update-check --quiet/);
});

test('plugin manifests list every role file and match VERSION (run `node scripts/sync-plugin.mjs` to fix)', async () => {
  const { expected } = await import('../../scripts/sync-plugin.mjs');
  const { plugin, market } = expected();
  const j = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
  assert.deepEqual(j('.claude-plugin/plugin.json').agents, plugin.agents);
  assert.ok(plugin.agents.every((a) => a.endsWith('.md') && fs.existsSync(a)));
  assert.ok(plugin.agents.length >= 11);
  assert.equal(j('.claude-plugin/marketplace.json').plugins[0].version, market.plugins[0].version);
  assert.ok(j('.claude-plugin/marketplace.json').description);
});
