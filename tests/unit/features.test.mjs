import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applyProfile, DEFAULT_OUT, initProject, PROFILES } from '../../skills/webapp-research/scripts/lib/project.mjs';
import { buildQueries, extractCredentials, loadMarketplaces } from '../../skills/webapp-research/scripts/lib/discovery.mjs';
import * as board from '../../skills/webapp-research/scripts/lib/board.mjs';
import { runSetup } from '../../skills/webapp-research/scripts/lib/setup.mjs';
import { classifyAction, isReadOnlyGraphql } from '../../skills/webapp-research/scripts/lib/safety.mjs';
import { computeCoverage } from '../../skills/webapp-research/scripts/lib/coverage.mjs';
import { RouteRegistry, templateOfUrl } from '../../skills/webapp-research/scripts/lib/routes.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'wr-feat-'));
const mk = (outRoot = tmp()) => initProject({ outRoot, app: 'F', baseUrl: 'https://f.test' }).project;

test('default research root is a hidden .webapplens/docs folder with its own .gitignore', () => {
  assert.equal(DEFAULT_OUT, '.webapplens/docs');
  const root = path.join(tmp(), '.webapplens', 'docs');
  const p = mk(root);
  assert.ok(p.p.dir.endsWith(path.join('.webapplens', 'docs', 'F')));
  const gi = fs.readFileSync(path.join(root, '..', '.gitignore'), 'utf8');
  assert.match(gi, /_discovery\//);
  assert.match(gi, /credentials\.json/);
});

test('extractCredentials finds published pairs, keeps trailing "!", rejects placeholders', () => {
  const c = extractCredentials('Demo login — Username: demo@example.com Password: Demo-Pass-123! Legacy: admin@admin.com / 123456. Your password: ******** . Password: password', 'https://v.test/demo');
  assert.deepEqual(c.map((x) => [x.username, x.password]), [['demo@example.com', 'Demo-Pass-123!'], ['admin@admin.com', '123456']]);
  assert.equal(c[0].source_url, 'https://v.test/demo');
  assert.deepEqual(extractCredentials('Enter your username and password to continue'), []);
  assert.equal(extractCredentials('admin / admin123')[0].password, 'admin123');
});

test('marketplace queries come from the shipped catalogue and honour the id filter', () => {
  assert.ok(loadMarketplaces().length >= 5);
  const all = buildQueries('school management');
  assert.ok(all.some((m) => m.id === 'codecanyon' && m.queries.some((q) => q.includes('site:codecanyon.net') && q.includes('school management'))));
  assert.ok(all.every((m) => m.queries.every((q) => !q.includes('{topic}'))));
  assert.deepEqual(buildQueries('x', ['github']).map((m) => m.id), ['github']);
});

test('roundtable board: threading, open items, decisions, dissent, redaction, summary', () => {
  const p = mk();
  assert.throws(() => board.post(p, { role: 'x', type: 'nope', text: 'a' }), /--type/);
  assert.throws(() => board.post(p, { type: 'question', text: 'a' }), /--role/);
  const q = board.post(p, { role: 'workflow-analyst', type: 'question', text: 'Is invoice approval two-step?', to: 'technical-analyst' });
  const o = board.post(p, { role: 'skeptic', type: 'objection', text: 'No evidence for schema claim; password=hunter2hunter2 leaked in text', ref: q.id, round: 2 });
  assert.equal(q.id, 'M001');
  assert.ok(!JSON.stringify(board.readBoard(p)).includes('hunter2hunter2'), 'board redacts secrets');
  assert.deepEqual(board.read(p, { open: true }).map((m) => m.id), ['M001', 'M002']);
  board.post(p, { role: 'technical-analyst', type: 'answer', text: 'Yes, see R012', ref: q.id });
  assert.deepEqual(board.read(p, { open: true }).map((m) => m.id), ['M002'], 'answered question is closed');
  const { dissent } = board.decide(p, { ref: o.id, decision: 'Mark schema claim as hypothesis', dissent: 'technical-analyst' });
  assert.equal(board.openItems(board.readBoard(p)).length, 0);
  assert.equal(dissent.type, 'dissent');
  const md = fs.readFileSync(board.summary(p).file, 'utf8');
  assert.match(md, /Mark schema claim as hypothesis/);
  assert.match(md, /Recorded dissent/);
  assert.throws(() => board.post(p, { role: 'a', type: 'answer', text: 'x', ref: 'M999' }), /does not exist/);
});

test('profiles: quick/deep/auto presets and unknown profile', () => {
  const base = { responsive: { enabled: false, maxRoutes: 5 }, maxPages: 150 };
  assert.equal(applyProfile(base, 'quick').maxPages, 30);
  const deep = applyProfile(base, 'deep');
  assert.equal(deep.responsive.enabled, true);
  assert.equal(deep.responsive.maxRoutes, 8);
  const auto = applyProfile(base, 'auto');
  assert.equal(auto.allowReadOnlyGraphql, true);
  assert.ok(auto.autoRounds >= 1);
  assert.equal(Object.keys(PROFILES.standard).length, 0);
  assert.throws(() => applyProfile(base, 'wild'), /Unknown profile/);
});

test('setup asks first: no install without --yes, installs the plan with --yes and re-verifies', async () => {
  const failing = { ok: false, checks: [{ id: 'playwright', ok: false, detail: 'missing', fix: 'npm install' }], install_plan: [{ cmd: 'npm install --omit=dev', cwd: '/x', why: 'w' }, { cmd: 'npx playwright install chromium', cwd: '/x', why: 'w' }] };
  const passing = { ok: true, checks: [], install_plan: [] };
  const ran = [];
  const run = (cmd) => ran.push(cmd);
  let n = 0;
  const check = async () => (n++ === 0 ? failing : passing);
  const dry = await runSetup({ yes: false, run, check: async () => failing });
  assert.deepEqual(ran, [], 'nothing installed without permission');
  assert.match(dry.message, /Ask the user/);
  const done = await runSetup({ yes: true, run, check });
  assert.deepEqual(ran, ['npm install --omit=dev', 'npx playwright install chromium']);
  assert.equal(done.ok, true);
  assert.deepEqual((await runSetup({ run, check: async () => passing })).installed, []);
});

test('read-only GraphQL detection is conservative', () => {
  assert.equal(isReadOnlyGraphql('{"query":"query Q { users { id } }"}'), true);
  assert.equal(isReadOnlyGraphql('{"query":"mutation { deleteUser(id:1) }"}'), false);
  assert.equal(isReadOnlyGraphql('[{"query":"{a}"},{"query":"mutation M { y }"}]'), false, 'one mutation poisons a batch');
  assert.equal(isReadOnlyGraphql('{"query":"subscription { x }"}'), false);
  assert.equal(isReadOnlyGraphql('{"operationName":"X","extensions":{"persistedQuery":{}}}'), false, 'persisted queries cannot be inspected');
  assert.equal(isReadOnlyGraphql('garbage'), false);
});

test('GET form submit buttons (search/filter) are read-only; POST submits are not', () => {
  assert.equal(classifyAction('Search', { type: 'submit', method: 'GET' }).category, 'A');
  assert.equal(classifyAction('Search', { type: 'submit', method: 'POST' }).category, 'B');
  assert.equal(classifyAction('Delete', { type: 'submit', method: 'GET' }).category, 'C');
});

test('route templates ignore record ids in form actions', () => {
  assert.equal(templateOfUrl('https://f.test/customers/7/delete'), templateOfUrl('https://f.test/customers/8/delete'));
});

test('accepted routes stay listed but are not open issues; unique controls are counted once', () => {
  const p = mk();
  const reg = new RouteRegistry([], {});
  const a = reg.add('https://f.test/a').route;
  const b = reg.add('https://f.test/dead').route;
  a.status = 'explored';
  b.status = 'failed';
  b.accepted = { reason: 'genuine dead link', at: 'now' };
  p.saveRoutes(reg.routes);
  p.saveControls({ [a.id]: [{ label: 'Menu', role: 'button', category: 'A', exercised: false }], [b.id]: [{ label: 'Menu', role: 'button', category: 'A', exercised: true }] });
  const m = computeCoverage(p);
  assert.equal(m.routes.failed, 1);
  assert.equal(m.routes.accepted, 1);
  assert.ok(!m.issues.some((i) => /failed route/.test(i)), 'accepted failure is not an open issue');
  assert.equal(m.controls.catalogued, 1);
  assert.equal(m.controls.instances, 2);
  assert.equal(m.controls.exercised, 1);
});
