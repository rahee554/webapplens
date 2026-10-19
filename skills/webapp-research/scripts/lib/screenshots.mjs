// Deterministic screenshot naming + manifest. Same route/state => same filename, so retries overwrite
// instead of piling up duplicates.
import path from 'node:path';
import { nowIso, shortHash, slug } from './util.mjs';

const KINDS = { all: 'shotsAll', modules: 'shotsModules', interactions: 'shotsInteractions' };

/** Returns { abs, rel } for a screenshot, resolving filename collisions between different routes. */
export function planShot(project, route, { kind = 'all', state = '' } = {}) {
  const p = project.p;
  const base = slug((route.template === '/' ? 'home' : route.template).replace(/:/g, ''), 70);
  const suffix = state ? `--${slug(state, 40)}` : '';
  let name = `${base}${suffix}`;
  const entries = project.shots();
  const clash = entries.find((e) => e.file === `screenshots/${kind}/${name}.png` && e.route_id !== route.id);
  if (clash) name += `-${shortHash(route.key, 4)}`;
  const rel = `screenshots/${kind}/${name}.png`;
  return { abs: path.join(p.dir, rel), rel };
}

export function recordShot(project, entry) {
  const shots = project.shots();
  const rec = {
    file: entry.file,
    route_id: entry.route_id,
    url: entry.url,
    module: entry.module,
    ui_state: entry.ui_state || 'default',
    captured_at: nowIso(),
    viewport: entry.viewport,
    full_page: !!entry.full_page,
    related_docs: entry.related_docs || [],
    redacted: !!entry.redacted,
    redaction_note: entry.redaction_note || 'No automated pixel redaction; sensitive regions are masked only if masks were configured.',
  };
  const i = shots.findIndex((s) => s.file === rec.file);
  if (i >= 0) shots[i] = { ...shots[i], ...rec, related_docs: [...new Set([...(shots[i].related_docs || []), ...rec.related_docs])] };
  else shots.push(rec);
  project.saveShots(shots);
  return rec;
}

export { KINDS };
