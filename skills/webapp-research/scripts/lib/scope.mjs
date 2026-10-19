// Explicit scope policy: the crawler only follows what this module allows.
const DOWNLOAD_EXT = /\.(zip|rar|7z|tar|gz|tgz|exe|msi|dmg|iso|pkg|apk|bin|mp4|mov|avi|mp3|wav|pdf|docx?|xlsx?|pptx?|csv)(\?|#|$)/i;

// Links that end the session or mutate data via GET are never followed.
export const DEFAULT_EXCLUDES = [
  '(^|/)(log[-_]?out|sign[-_]?out)(/|$|\\?)',
  '(^|/)(delete|destroy|remove)(/|$|\\?)',
];

export function makeScope(cfg) {
  const base = new URL(cfg.baseUrl);
  const origins = new Set([base.origin, ...(cfg.allowedOrigins || []).map((o) => new URL(o).origin)]);
  const excludes = [...DEFAULT_EXCLUDES, ...(cfg.exclude || [])].map((p) => new RegExp(p, 'i'));
  const maxDepth = cfg.maxDepth ?? 4;

  const sameSite = (u) =>
    origins.has(u.origin) ||
    (cfg.includeSubdomains && (u.hostname === base.hostname || u.hostname.endsWith('.' + base.hostname)));

  return {
    origins,
    check(url, depth = 0) {
      let u;
      try {
        u = new URL(url);
      } catch {
        return { ok: false, reason: 'invalid' };
      }
      if (!/^https?:$/.test(u.protocol)) return { ok: false, reason: 'non-http' };
      if (!sameSite(u)) return { ok: false, reason: 'external' };
      if (DOWNLOAD_EXT.test(u.pathname + u.search)) return { ok: false, reason: 'download' };
      const target = u.pathname + u.search;
      if (excludes.some((re) => re.test(target) || re.test(u.hash.replace(/^#!?/, '')))) return { ok: false, reason: 'excluded' };
      if (depth > maxDepth) return { ok: false, reason: 'depth' };
      return { ok: true };
    },
  };
}
