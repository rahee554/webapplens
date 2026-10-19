// Update awareness and self-update. Nothing here runs automatically: `update-check` only READS a tiny
// version file (cached for 24h, fails silently offline) and `update` changes files only with --yes.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readJson, writeJson } from './util.mjs';

export const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const REPO = 'rahee554/webapplens';
export const VERSION_URL = `https://raw.githubusercontent.com/${REPO}/main/skills/webapp-research/VERSION`;
export const TARBALL_URL = `https://codeload.github.com/${REPO}/tar.gz/refs/heads/main`;
export const CHANGELOG_URL = `https://github.com/${REPO}/blob/main/CHANGELOG.md`;
const HOME_DIR = path.join(os.homedir(), '.webapplens');
const DAY = 24 * 3600 * 1000;

export function readVersion(dir = SKILL_DIR) {
  try { return fs.readFileSync(path.join(dir, 'VERSION'), 'utf8').trim(); } catch { return '0.0.0'; }
}

/** Numeric semver compare: 1 if a>b, -1 if a<b, 0 if equal (pre-release tags ignored). */
export function compareVersions(a, b) {
  const p = (v) => String(v).replace(/^v/, '').split('-')[0].split('.').map((n) => parseInt(n, 10) || 0);
  const [x, y] = [p(a), p(b)];
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0) ? 1 : -1;
  return 0;
}

/**
 * @returns {{current:string, latest:string|null, update_available:boolean, checked_at:string|null, cached:boolean, offline:boolean, notes_url:string}}
 * Never throws: being offline must not block research.
 */
export async function checkUpdate({ force = false, timeoutMs = 4000, cacheFile = path.join(HOME_DIR, 'update-check.json'), fetchImpl = globalThis.fetch, now = Date.now(), dir = SKILL_DIR } = {}) {
  const current = readVersion(dir);
  const out = (latest, extra) => ({ current, latest, update_available: !!latest && compareVersions(latest, current) > 0, checked_at: null, cached: false, offline: false, notes_url: CHANGELOG_URL, ...extra });
  const cache = readJson(cacheFile, null);
  if (!force && cache?.latest && cache.checked_at && now - Date.parse(cache.checked_at) < DAY) return out(cache.latest, { checked_at: cache.checked_at, cached: true });
  try {
    const res = await fetchImpl(VERSION_URL, { signal: AbortSignal.timeout(timeoutMs), headers: { 'user-agent': 'webapplens-update-check' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const latest = (await res.text()).trim();
    if (!/^\d+\.\d+\.\d+/.test(latest)) throw new Error('unexpected version format');
    const checked_at = new Date(now).toISOString();
    try { fs.mkdirSync(path.dirname(cacheFile), { recursive: true }); writeJson(cacheFile, { latest, checked_at }); } catch { /* cache is optional */ }
    return out(latest, { checked_at });
  } catch {
    return out(cache?.latest || null, { offline: true, checked_at: cache?.checked_at || null, cached: !!cache?.latest });
  }
}

/** Human/agent-readable notice, or null when there is nothing to say. */
export function updateNotice(r) {
  if (!r.update_available) return null;
  return `WebAppLens update available: ${r.current} -> ${r.latest}. Changes: ${r.notes_url}. Ask the user whether to update (run \`update\`, then \`update --yes\`). Do not update without their OK unless they pre-authorized updates.`;
}

function findGitRoot(start) {
  for (let d = start; ; d = path.dirname(d)) {
    if (fs.existsSync(path.join(d, '.git'))) return d;
    if (path.dirname(d) === d) return null;
  }
}

/** How is this copy installed? plugin (managed by Claude Code), git checkout, or a plain copy. */
export function detectInstall(dir = SKILL_DIR) {
  const norm = dir.split(path.sep).join('/');
  if (/\/\.claude\/plugins\//.test(norm) || /\/plugins\/(cache|marketplaces)\//.test(norm)) return { kind: 'plugin', dir };
  const git = findGitRoot(dir);
  if (git) return { kind: 'git', dir, git_root: git };
  return { kind: 'copy', dir };
}

async function downloadSource() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'webapplens-update-'));
  const tgz = path.join(tmp, 'src.tar.gz');
  const res = await fetch(TARBALL_URL, { signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
  fs.writeFileSync(tgz, Buffer.from(await res.arrayBuffer()));
  execSync(`tar -xzf "${tgz}" -C "${tmp}"`, { stdio: 'ignore' });
  const top = fs.readdirSync(tmp).find((n) => fs.statSync(path.join(tmp, n)).isDirectory());
  return path.join(tmp, top, 'skills', 'webapp-research');
}

/**
 * Plan (always) and apply (only with yes). `getSource` is injectable for tests and returns the folder of the NEW skill.
 */
export async function runUpdate({ yes = false, dir = SKILL_DIR, getSource = downloadSource, run = (cmd, cwd) => execSync(cmd, { cwd, stdio: 'inherit' }), backupRoot = path.join(HOME_DIR, 'backups'), check } = {}) {
  const install = detectInstall(dir);
  const current = readVersion(dir);
  const info = check || (await checkUpdate({ force: true, dir }));
  const base = { install: install.kind, current, latest: info.latest, update_available: info.update_available, applied: false };

  if (install.kind === 'plugin') return { ...base, message: 'Installed as a Claude Code plugin: update it there with `/plugin marketplace update webapplens` then `/plugin update webapplens@webapplens` (or enable auto-update for the marketplace). This tool does not modify plugin folders.' };
  if (!info.update_available && !info.offline) return { ...base, message: `Already up to date (${current}).` };
  if (info.offline && !info.latest) return { ...base, message: 'Could not reach GitHub to check for updates (offline?). Try again later.' };

  if (install.kind === 'git') {
    const plan = [`git -C "${install.git_root}" pull --ff-only`, 'npm install --omit=dev (in the skill folder)'];
    if (!yes) return { ...base, plan, message: 'Nothing changed. Ask the user, then run `update --yes`.' };
    run(`git -C "${install.git_root}" pull --ff-only`, install.git_root);
    run('npm install --omit=dev', dir);
    return { ...base, applied: true, new_version: readVersion(dir), message: 'Updated via git pull.' };
  }

  const plan = [`download the latest ${REPO} source`, `back up ${dir} to ${backupRoot}`, `copy the new skill files over ${dir} (node_modules kept)`, 'refresh sibling role files in ../../agents when present', 'npm install --omit=dev'];
  if (!yes) return { ...base, plan, message: 'Nothing changed. Ask the user, then run `update --yes`.' };

  const src = await getSource();
  if (!fs.existsSync(path.join(src, 'SKILL.md')) || !fs.existsSync(path.join(src, 'VERSION'))) throw new Error('Downloaded source does not look like the skill (no SKILL.md/VERSION); aborting without changes.');
  const incoming = readVersion(src);
  if (compareVersions(incoming, current) <= 0 && !info.offline) throw new Error(`Downloaded version ${incoming} is not newer than ${current}; aborting without changes.`);
  // Backups live OUTSIDE the skills folder: a second SKILL.md there would register as a duplicate skill.
  const backup = path.join(backupRoot, `${current}-${Date.now()}`);
  fs.mkdirSync(backup, { recursive: true });
  fs.cpSync(dir, backup, { recursive: true, filter: (s) => !s.includes('node_modules') });
  fs.cpSync(src, dir, { recursive: true, force: true, filter: (s) => !s.includes('node_modules') });
  const agentsTarget = path.resolve(dir, '..', '..', 'agents');
  const refreshed = [];
  if (fs.existsSync(agentsTarget) && fs.existsSync(path.join(src, 'agents'))) {
    for (const f of fs.readdirSync(path.join(src, 'agents'))) {
      if (fs.existsSync(path.join(agentsTarget, f)) || /^(research-orchestrator|skeptic)\.md$/.test(f)) {
        if (fs.existsSync(agentsTarget)) { fs.copyFileSync(path.join(src, 'agents', f), path.join(agentsTarget, f)); refreshed.push(f); }
      }
    }
  }
  run('npm install --omit=dev', dir);
  return { ...base, applied: true, new_version: readVersion(dir), backup, agents_refreshed: refreshed, message: `Updated ${current} -> ${readVersion(dir)}. Previous files are in ${backup}.` };
}
