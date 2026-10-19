// Requirements preflight. `doctor` only reports; `setup --yes` installs. The agent is expected to
// show the plan to the user and ask before running `setup --yes` (or run it directly in auto mode).
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlaywright, openSession } from './browser.mjs';
import { makeScope } from './scope.mjs';

export const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const NPM_INSTALL = { cmd: 'npm install --omit=dev', cwd: SKILL_DIR, why: 'install the Playwright library' };
const CHROMIUM = { cmd: 'npx playwright install chromium', cwd: SKILL_DIR, why: 'download the Chromium browser (~150 MB)' };

export async function checkRequirements({ launch = true } = {}) {
  const checks = [];
  const plan = [];
  const major = Number(process.versions.node.split('.')[0]);
  checks.push({ id: 'node', ok: major >= 22, detail: `Node ${process.versions.node}`, fix: major >= 22 ? null : 'Install Node.js 22 or newer from https://nodejs.org' });

  let pwOk = false;
  try {
    await loadPlaywright();
    pwOk = true;
    checks.push({ id: 'playwright', ok: true, detail: 'module found', fix: null });
  } catch (e) {
    checks.push({ id: 'playwright', ok: false, detail: 'Playwright library not installed', fix: NPM_INSTALL.cmd });
    plan.push(NPM_INSTALL);
  }

  if (pwOk && launch) {
    try {
      const s = await openSession({ viewport: { width: 800, height: 600 }, navTimeoutMs: 8000, headless: true }, makeScope({ baseUrl: 'http://localhost/' }), {});
      await s.page.setContent('<title>doctor</title>');
      const ok = (await s.page.title()) === 'doctor';
      await s.close();
      checks.push({ id: 'chromium', ok, detail: ok ? 'launched and rendered a page' : 'launched but did not render', fix: ok ? null : CHROMIUM.cmd });
      if (!ok) plan.push(CHROMIUM);
    } catch (e) {
      checks.push({ id: 'chromium', ok: false, detail: String(e.message).split('\n')[0].slice(0, 160), fix: CHROMIUM.cmd });
      plan.push(CHROMIUM);
    }
  } else if (!pwOk) {
    checks.push({ id: 'chromium', ok: false, detail: 'not checked (Playwright missing)', fix: CHROMIUM.cmd });
    plan.push(CHROMIUM);
  }
  return { ok: checks.every((c) => c.ok), checks, install_plan: plan.map((p) => ({ cmd: p.cmd, cwd: p.cwd, why: p.why })) };
}

/** Prints/returns the plan; installs only with yes=true. Re-verifies afterwards. */
export async function runSetup({ yes = false, run = (cmd, cwd) => execSync(cmd, { cwd, stdio: 'inherit' }), check = checkRequirements } = {}) {
  const before = await check();
  if (before.ok) return { ...before, installed: [], message: 'All requirements are already satisfied.' };
  if (!before.install_plan.length) return { ...before, installed: [], message: 'Requirements are missing that cannot be installed automatically (see the failed checks).' };
  if (!yes) return { ...before, installed: [], message: 'Nothing installed. Ask the user for permission, then run `setup --yes` (auto mode: run it directly).' };
  const installed = [];
  for (const step of before.install_plan) {
    run(step.cmd, step.cwd);
    installed.push(step.cmd);
  }
  const after = await check();
  return { ...after, installed, message: after.ok ? 'Installed and verified.' : 'Installed, but some checks still fail.' };
}
