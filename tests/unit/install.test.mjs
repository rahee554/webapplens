import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { install } from '../../scripts/install.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'wr-inst-'));

test('installs for Claude Code: skill + agents, no node_modules', () => {
  const base = tmp();
  const [r] = install({ platform: 'claude', base });
  assert.ok(fs.existsSync(path.join(r.skillDir, 'SKILL.md')));
  assert.ok(fs.existsSync(path.join(r.skillDir, 'scripts', 'cli.mjs')));
  assert.ok(fs.existsSync(path.join(base, '.claude', 'agents', 'research-orchestrator.md')));
  assert.ok(!fs.existsSync(path.join(r.skillDir, 'node_modules')));
});

test('installs for Codex and the generic .agents convention with an idempotent AGENTS.md pointer', () => {
  const base = tmp();
  fs.writeFileSync(path.join(base, 'AGENTS.md'), '# My project\n');
  install({ platform: 'codex', base });
  install({ platform: 'codex', base });
  const agents = fs.readFileSync(path.join(base, 'AGENTS.md'), 'utf8');
  assert.match(agents, /# My project/);
  assert.equal(agents.split('webapplens:start').length - 1, 1, 'pointer block is not duplicated');
  assert.match(agents, /\.codex\/skills\/webapp-research\/SKILL\.md/);
  assert.ok(fs.existsSync(path.join(base, '.codex', 'skills', 'webapp-research', 'SKILL.md')));
  install({ platform: 'agents', base });
  assert.ok(fs.existsSync(path.join(base, '.agents', 'skills', 'webapp-research', 'SKILL.md')));
});

test('custom destination and unknown platforms', () => {
  const d = tmp();
  const [r] = install({ dest: d });
  assert.equal(r.skillDir, path.join(d, 'webapp-research'));
  assert.ok(fs.existsSync(path.join(r.skillDir, 'agents', 'completeness-auditor.md')));
  assert.throws(() => install({ platform: 'nope', base: d }), /Unknown platform/);
});

test('skill front matter is valid for every platform that reads SKILL.md', () => {
  const md = fs.readFileSync(path.resolve('skills/webapp-research/SKILL.md'), 'utf8');
  const fm = md.match(/^---\n([\s\S]*?)\n---/)[1];
  assert.match(fm, /^name: webapp-research$/m);
  assert.match(fm, /^description: .{80,}/m);
  for (const f of fs.readdirSync('skills/webapp-research/agents')) {
    const a = fs.readFileSync(path.join('skills/webapp-research/agents', f), 'utf8');
    assert.match(a, /^---\nname: [a-z-]+\ndescription: .+\ntools: .+\n---/, `${f} front matter`);
  }
});
