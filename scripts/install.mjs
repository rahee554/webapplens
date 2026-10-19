#!/usr/bin/env node
// Installs the platform-neutral skill (skills/webapp-research) where an agent platform looks for skills.
//   node scripts/install.mjs --platform claude|codex|agents|all [--scope project|user] [--dest DIR] [--install-deps] [--force] [--dry-run]
// The skill itself is plain Markdown + a Node CLI, so any agent that can read instructions and run
// shell commands can use it; this script only puts the files in the conventional places.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'skills', 'webapp-research');
const NAME = 'webapp-research';
const MARK = ['<!-- webapplens:start -->', '<!-- webapplens:end -->'];

const PLATFORMS = {
  claude: { skills: '.claude/skills', agents: '.claude/agents', pointerFile: null },
  codex: { skills: '.codex/skills', agents: null, pointerFile: 'AGENTS.md' },
  agents: { skills: '.agents/skills', agents: null, pointerFile: 'AGENTS.md' }, // cross-tool convention
};

const copy = (from, to, dry) => {
  if (dry) return;
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.cpSync(from, to, { recursive: true, force: true, filter: (s) => !/node_modules|package-lock\.json$/.test(s) });
};

function pointer(skillRel) {
  return `${MARK[0]}
## Web application research (WebAppLens)
When asked to research, explore, map or document a web application (or compare products with demos), read \`${skillRel}/SKILL.md\` and follow it. The CLI is \`node ${skillRel}/scripts/cli.mjs\`. Roles are in \`${skillRel}/agents/\`.
${MARK[1]}
`;
}

function upsertPointer(file, block) {
  let text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const re = new RegExp(`${MARK[0]}[\\s\\S]*?${MARK[1]}\\n?`);
  text = re.test(text) ? text.replace(re, block) : `${text}${text && !text.endsWith('\n') ? '\n' : ''}${text ? '\n' : ''}${block}`;
  fs.writeFileSync(file, text);
}

/** @returns {{platform:string, skillDir:string, agentsDir?:string, pointer?:string}[]} */
export function install({ platform = 'claude', scope = 'project', dest, base, dryRun = false, installDeps = false } = {}) {
  const root = base || (scope === 'user' ? os.homedir() : process.cwd());
  const targets = dest ? [['custom', null]] : platform === 'all' ? Object.entries(PLATFORMS) : [[platform, PLATFORMS[platform]]];
  const done = [];
  for (const [name, cfg] of targets) {
    if (!dest && !cfg) throw new Error(`Unknown platform "${platform}". Use: ${Object.keys(PLATFORMS).join(', ')}, all (or --dest DIR).`);
    const skillDir = dest ? path.resolve(dest, NAME) : path.join(root, cfg.skills, NAME);
    copy(SRC, skillDir, dryRun);
    const rec = { platform: name, skillDir };
    if (cfg?.agents) {
      rec.agentsDir = path.join(root, cfg.agents);
      for (const f of fs.readdirSync(path.join(SRC, 'agents'))) copy(path.join(SRC, 'agents', f), path.join(rec.agentsDir, f), dryRun);
    }
    if (cfg?.pointerFile && scope === 'project') {
      rec.pointer = path.join(root, cfg.pointerFile);
      if (!dryRun) upsertPointer(rec.pointer, pointer(path.relative(root, skillDir).split(path.sep).join('/')));
    }
    if (installDeps && !dryRun) execSync('npm install --omit=dev --no-audit --no-fund', { cwd: skillDir, stdio: 'inherit' });
    done.push(rec);
  }
  return done;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values: v } = parseArgs({
    options: { platform: { type: 'string', default: 'claude' }, scope: { type: 'string', default: 'project' }, dest: { type: 'string' }, 'install-deps': { type: 'boolean' }, 'dry-run': { type: 'boolean' }, help: { type: 'boolean' } },
  });
  if (v.help) {
    console.log('usage: node scripts/install.mjs --platform claude|codex|agents|all [--scope project|user] [--dest DIR] [--install-deps] [--dry-run]');
    process.exit(0);
  }
  try {
    const res = install({ platform: v.platform, scope: v.scope, dest: v.dest, installDeps: v['install-deps'], dryRun: v['dry-run'] });
    for (const r of res) {
      console.log(`${v['dry-run'] ? '[dry-run] ' : ''}${r.platform}: skill -> ${r.skillDir}`);
      if (r.agentsDir) console.log(`  agents -> ${r.agentsDir}`);
      if (r.pointer) console.log(`  instructions pointer -> ${r.pointer}`);
    }
    if (!v['install-deps']) console.log(`\nNext: cd "${res[0].skillDir}" && npm install && npx playwright install chromium && node scripts/cli.mjs doctor`);
  } catch (e) {
    console.error(`error: ${e.message}`);
    process.exit(1);
  }
}
