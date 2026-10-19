import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { initProject, openProject } from '../../skills/webapp-research/scripts/lib/project.mjs';
import { addObservation, makeObservation } from '../../skills/webapp-research/scripts/lib/evidence.mjs';
import { planShot, recordShot } from '../../skills/webapp-research/scripts/lib/screenshots.mjs';
import { redactObject, redactText, redactUrl, registerSecret, clearSecrets } from '../../skills/webapp-research/scripts/lib/redact.mjs';
import { resolveCredentials } from '../../skills/webapp-research/scripts/lib/credentials.mjs';
import { computeCoverage, fullAudit } from '../../skills/webapp-research/scripts/lib/coverage.mjs';
import { validateLinks, scanTodos } from '../../skills/webapp-research/scripts/lib/links.mjs';
import { generateDocs } from '../../skills/webapp-research/scripts/lib/docs.mjs';
import { RouteRegistry } from '../../skills/webapp-research/scripts/lib/routes.mjs';
import { rankCandidates } from '../../skills/webapp-research/scripts/lib/scoring.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'wr-test-'));
const mk = () => initProject({ outRoot: tmp(), app: 'Acme', baseUrl: 'https://acme.test' });

test('init creates the expected layout, secure credentials template and gitignore', () => {
  const { dir, created, project } = mk();
  assert.equal(created, true);
  for (const f of ['research-manifest.json', 'credentials.json', 'routes/routes.json', 'crawlers/config.json', 'crawlers/state.json', 'evidence/network-summary.json', 'screenshots/all', 'screenshots/modules', 'screenshots/interactions', 'docs/technicals', 'reports', 'logs/research.log', '.gitignore'])
    assert.ok(fs.existsSync(path.join(dir, f)), `missing ${f}`);
  const cred = JSON.parse(fs.readFileSync(project.p.credentials, 'utf8'));
  assert.equal(cred.username_env, 'ACME_USERNAME');
  assert.ok(!('password' in cred), 'template must not contain a password field');
  assert.match(fs.readFileSync(path.join(dir, '.gitignore'), 'utf8'), /credentials\.json/);
  assert.equal(initProject({ outRoot: path.dirname(dir), app: 'Acme', baseUrl: 'https://acme.test' }).created, false, 'init is idempotent');
});

test('state persists and survives reopen (resume)', () => {
  const { dir, project } = mk();
  const s = project.state();
  s.queue.push({ url: 'https://acme.test/a', depth: 1 });
  s.done.push('https://acme.test/');
  project.saveState(s);
  const again = openProject(dir).state();
  assert.deepEqual(again.queue, s.queue);
  assert.deepEqual(again.done, s.done);
});

test('registry survives save/load with identical dedupe behaviour', () => {
  const { project } = mk();
  const reg = new RouteRegistry([], {});
  reg.add('https://acme.test/a');
  project.saveRoutes(reg.routes);
  const reg2 = new RouteRegistry(project.routes(), {});
  assert.equal(reg2.add('https://acme.test/a').reason, 'duplicate');
  assert.equal(reg2.add('https://acme.test/b').route.id, 'R002');
});

test('evidence: validation, confidence caps, idempotency, redaction', () => {
  const { project } = mk();
  assert.throws(() => makeObservation({ type: 'bogus', claim: 'x' }), /unknown evidence type/);
  assert.throws(() => makeObservation({ type: 'observed' }), /claim/);
  assert.equal(makeObservation({ type: 'hypothesis', claim: 'x', confidence: 'high' }).confidence, 'low');
  assert.equal(makeObservation({ type: 'inferred', claim: 'x', confidence: 'high' }).confidence, 'medium');
  assert.equal(makeObservation({ type: 'observed', claim: 'x' }).verification_status, 'verified');
  addObservation(project, { type: 'observed', claim: 'login with password=hunter2hunter2', route_id: 'R001' });
  addObservation(project, { type: 'observed', claim: 'login with password=hunter2hunter2', route_id: 'R001' });
  const all = project.observations();
  assert.equal(all.length, 1);
  assert.ok(!JSON.stringify(all).includes('hunter2hunter2'));
});

test('redaction scrubs registered secrets, tokens, JWTs and secret URL params', () => {
  clearSecrets();
  registerSecret('S3cret-Value');
  assert.equal(redactText('pw is S3cret-Value ok'), 'pw is [REDACTED] ok');
  assert.match(redactText('Authorization: Bearer abc.def-123'), /Bearer \[REDACTED\]/);
  assert.match(redactText('token=abcdef123456&x=1'), /token=\[REDACTED\]/);
  assert.match(redactText('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.sig123'), /REDACTED_JWT/);
  assert.ok(!redactUrl('https://u:p@x.test/a?access_token=zzz&ok=1').includes('zzz'));
  assert.ok(redactUrl('https://x.test/a?ok=1').includes('ok=1'));
  assert.equal(redactObject({ password: 'x', nested: { api_key: 'y', fine: 'z' } }).nested.fine, 'z');
  assert.equal(redactObject({ password: 'x' }).password, '[REDACTED]');
  clearSecrets();
});

test('credentials resolve from env or file, never from argv, and are registered for redaction', () => {
  clearSecrets();
  const { project } = mk();
  assert.equal(resolveCredentials(project), null);
  process.env.ACME_USERNAME = 'bob';
  process.env.ACME_PASSWORD = 'pw-from-env-1';
  const c = resolveCredentials(project);
  assert.equal(c.source, 'environment');
  assert.equal(redactText('x pw-from-env-1 y'), 'x [REDACTED] y');
  delete process.env.ACME_USERNAME;
  delete process.env.ACME_PASSWORD;
  const f = path.join(tmp(), 'c.json');
  fs.writeFileSync(f, JSON.stringify({ username: 'al', password: 'pw-from-file-2' }));
  assert.equal(resolveCredentials(project, { credentialsFile: f }).source, 'credentials-file');
  clearSecrets();
});

test('screenshot names are deterministic, collision-safe, and the manifest upserts', () => {
  const { project } = mk();
  const r1 = { id: 'R001', key: 'https://acme.test/customers', template: '/customers', module: 'customers' };
  const a = planShot(project, r1, { kind: 'all' });
  const b = planShot(project, r1, { kind: 'all' });
  assert.equal(a.rel, b.rel);
  assert.equal(a.rel, 'screenshots/all/customers.png');
  recordShot(project, { file: a.rel, route_id: 'R001', url: 'u', module: 'customers', viewport: { width: 1, height: 1 } });
  recordShot(project, { file: a.rel, route_id: 'R001', url: 'u', module: 'customers', viewport: { width: 1, height: 1 }, related_docs: ['docs/x.md'] });
  assert.equal(project.shots().length, 1, 'retry must not duplicate');
  const other = planShot(project, { id: 'R002', key: 'https://acme.test/customers?x=1', template: '/customers', module: 'customers' }, { kind: 'all' });
  assert.notEqual(other.rel, a.rel, 'different route gets a different file');
  assert.equal(planShot(project, r1, { kind: 'modules', state: 'tab Invoices' }).rel, 'screenshots/modules/customers--tab-invoices.png');
});

function seed(project, routes) {
  const reg = new RouteRegistry([], {});
  for (const [url, status, extra] of routes) {
    const { route } = reg.add(url);
    route.status = status;
    Object.assign(route, extra || {});
  }
  project.saveRoutes(reg.routes);
  return reg.routes;
}

test('coverage: explicit definitions, blocked/failed kept visible, never claims "fully explored"', () => {
  const { dir, project } = mk();
  const png = path.join(dir, 'screenshots/all/home.png');
  fs.writeFileSync(png, 'x');
  fs.writeFileSync(path.join(dir, 'README.md'), 'doc');
  seed(project, [
    ['https://acme.test/', 'explored', { screenshots: ['screenshots/all/home.png'], docs: ['README.md'] }],
    ['https://acme.test/a', 'explored', { screenshots: ['screenshots/all/missing.png'] }],
    ['https://acme.test/b', 'blocked'],
    ['https://acme.test/c', 'failed'],
    ['https://acme.test/d', 'queued'],
  ]);
  const m = computeCoverage(project);
  assert.equal(m.routes.total, 5);
  assert.equal(m.routes.route_coverage_pct, 40);
  assert.equal(m.routes.accessible_coverage_pct, 50);
  assert.equal(m.screenshots.coverage_pct, 50, 'a screenshot path that does not exist on disk does not count');
  assert.equal(m.documentation.explored_routes_documented, 1);
  assert.equal(m.routes.blocked, 1);
  assert.equal(m.routes.failed, 1);
  assert.match(m.verdict, /INCOMPLETE/);
  assert.doesNotMatch(m.verdict, /fully explored/i);
});

test('queue exhausted still says controls/workflows are not implied tested', () => {
  const { project } = mk();
  seed(project, [['https://acme.test/', 'explored', { screenshots: [] }]]);
  const s = project.state();
  s.stop_reason = 'queue_exhausted';
  project.saveState(s);
  assert.match(computeCoverage(project).verdict, /does not mean every control or workflow was tested/);
});

test('link validation finds broken relative links and ignores external/anchor/code ones', () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, 'a.md'), '[ok](b.md) [bad](nope.md) [ext](https://x.test) [anchor](#top) ![img](img/x.png)\n```\n[code](ignored.md)\n```\n');
  fs.writeFileSync(path.join(d, 'b.md'), 'hi');
  const r = validateLinks(d);
  assert.deepEqual(r.broken.map((b) => b.link).sort(), ['img/x.png', 'nope.md']);
  fs.writeFileSync(path.join(d, 'c.md'), 'x\n<!-- TODO(agent): write me -->\n');
  assert.equal(scanTodos(d).length, 1);
});

test('report generation: valid links, generated vs agent-owned files', () => {
  const { dir, project } = mk();
  fs.writeFileSync(path.join(dir, 'screenshots/all/home.png'), 'x');
  seed(project, [['https://acme.test/', 'explored', { title: 'Home', screenshots: ['screenshots/all/home.png'] }]]);
  const audit = generateDocs(project);
  assert.equal(audit.links.broken.length, 0, JSON.stringify(audit.links.broken));
  const overview = path.join(dir, 'docs/product-overview.md');
  assert.match(fs.readFileSync(overview, 'utf8'), /TODO\(agent\)/);
  fs.writeFileSync(overview, '# Mine\nwritten by an agent\n');
  generateDocs(project);
  assert.match(fs.readFileSync(overview, 'utf8'), /written by an agent/, 'agent-owned docs are never overwritten');
  assert.ok(fs.existsSync(path.join(dir, 'docs/modules/root.md')));
  assert.ok(fullAudit(project).issues.some((i) => /TODO/.test(i)), 'remaining TODO markers are reported');
});

test('scoring: weights, evidence flags, unverified demo cap, no filler candidates', () => {
  const ev = { relevance: ['u'], coverage: ['u'], demo_access: ['u'], docs: ['u'], researchability: ['u'] };
  const res = rankCandidates({
    candidates: [
      { name: 'A', scores: { relevance: 5, coverage: 5, demo_access: 5, docs: 5, researchability: 5 }, evidence: ev, demo: { verification_status: 'unverified' } },
      { name: 'B', scores: { relevance: 5, coverage: 5, demo_access: 5, docs: 5, researchability: 5 }, evidence: ev, demo: { verification_status: 'verified' } },
      { name: 'C', scores: { relevance: 3 } },
    ],
  });
  assert.equal(res.ranked[0].name, 'B');
  assert.equal(res.ranked[0].total, 100);
  const a = res.ranked.find((c) => c.name === 'A');
  assert.equal(a.scores.demo_access, 3);
  assert.ok(a.flags.some((f) => /not verified/.test(f)));
  assert.ok(res.ranked.find((c) => c.name === 'C').flags.some((f) => /no evidence/.test(f)));
  assert.equal(res.ranked.length, 3);
  assert.match(res.short_list_note, /Only 3/);
  assert.throws(() => rankCandidates({ candidates: [{ name: 'X', scores: { relevance: 9 } }] }), /0-5/);
});
