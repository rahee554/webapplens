// Keeps .claude-plugin manifests in sync with the repo: version from skills/webapp-research/VERSION and the
// explicit list of role files (Claude Code requires individual .md paths for plugin agents).
//   node scripts/sync-plugin.mjs          # rewrite manifests
//   node scripts/sync-plugin.mjs --check  # exit 1 if they are out of date
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));
const version = fs.readFileSync(path.join(root, 'skills/webapp-research/VERSION'), 'utf8').trim();
const agents = fs.readdirSync(path.join(root, 'skills/webapp-research/agents')).filter((f) => f.endsWith('.md')).sort().map((f) => `./skills/webapp-research/agents/${f}`);

export function expected() {
  const plugin = { ...read('.claude-plugin/plugin.json'), version, agents };
  const market = read('.claude-plugin/marketplace.json');
  market.description ||= 'WebAppLens: research web applications safely and with evidence - UI/theme and tech-stack research, architecture proposals, demo discovery, client-ready docs.';
  market.plugins = market.plugins.map((p) => ({ ...p, version }));
  return { plugin, market };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { plugin, market } = expected();
  const files = { '.claude-plugin/plugin.json': plugin, '.claude-plugin/marketplace.json': market };
  let stale = false;
  for (const [f, data] of Object.entries(files)) {
    const next = JSON.stringify(data, null, 2) + '\n';
    const cur = fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, '\n');
    if (cur !== next) { stale = true; if (!process.argv.includes('--check')) fs.writeFileSync(path.join(root, f), next); }
  }
  if (process.argv.includes('--check')) process.exit(stale ? 1 : 0);
  console.log(`synced plugin manifests (version ${version}, ${agents.length} agents)`);
}
