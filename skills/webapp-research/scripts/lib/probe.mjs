// Read-only GET probe through the saved session and the mutation/scope guards: the safe way for an
// agent to look at an extra page instead of hand-writing browser scripts (which bypass the guards).
import fs from 'node:fs';
import path from 'node:path';
import { login, openSession } from './browser.mjs';
import { makeScope } from './scope.mjs';
import { resolveCredentials } from './credentials.mjs';
import { ensureDir, slug } from './util.mjs';
import { redactText } from './redact.mjs';

export async function probeUrls(project, urls, { screenshot = false, text = false, credentialsFile, headless } = {}) {
  const cfg = project.config();
  const scope = makeScope(cfg);
  const reuse = fs.existsSync(project.p.storageState);
  const session = await openSession(cfg, scope, { storageState: reuse ? project.p.storageState : undefined, headless });
  const results = [];
  try {
    if (!reuse) {
      const creds = resolveCredentials(project, { credentialsFile });
      if (creds) {
        const r = await login(session.page, cfg, creds);
        if (!r.ok) throw new Error(`Login failed (${r.reason}): ${r.detail}`);
      }
    }
    session.guard.enabled = true; // from here on only GET/HEAD/OPTIONS inside scope
    for (const raw of urls) {
      const url = new URL(raw, cfg.baseUrl).toString();
      const s = scope.check(url, 0);
      if (!s.ok && s.reason !== 'depth') { results.push({ url, error: `out of scope (${s.reason}); not requested` }); continue; }
      try {
        const resp = await session.page.goto(url, { waitUntil: 'domcontentloaded', timeout: cfg.navTimeoutMs });
        await session.page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => {});
        const info = {
          url, final_url: session.page.url(), status: resp?.status() ?? null, title: await session.page.title(),
          headings: await session.page.evaluate(() => Array.from(document.querySelectorAll('h1,h2')).slice(0, 8).map((h) => h.innerText.trim())),
          links: await session.page.locator('a[href]').count(),
        };
        if (text) info.text = redactText(await session.page.evaluate(() => document.body.innerText)).slice(0, 1500);
        if (screenshot) {
          const file = path.join(project.p.shotsInteractions, `probe-${slug(new URL(url).pathname + new URL(url).search)}.png`);
          ensureDir(path.dirname(file));
          await session.page.screenshot({ path: file, fullPage: true });
          info.screenshot = path.relative(project.p.dir, file).split(path.sep).join('/');
        }
        results.push(info);
      } catch (e) {
        results.push({ url, error: redactText(e.message).split('\n')[0] });
      }
    }
    for (const b of session.guard.blocked) results.push({ blocked: b });
  } finally {
    await session.close();
  }
  return results;
}
