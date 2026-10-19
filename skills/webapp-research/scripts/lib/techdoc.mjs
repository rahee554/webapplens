import { securityObservations, summarizeStack } from './techstack.mjs';

const esc = (s) => String(s ?? '').replace(/\|/g, '\\|');
const tbl = (head, rows) => (rows.length ? `| ${head.join(' | ')} |\n|${head.map(() => '---').join('|')}|\n${rows.map((r) => `| ${r.map(esc).join(' | ')} |`).join('\n')}` : '_None._');

export function renderTechDoc(acc, detections, appName) {
  const sec = securityObservations(acc);
  const summary = summarizeStack(detections, acc);
  return `# Technology stack (detected) — ${appName}

Evidence: passive signals from ${acc.pages} page(s) — response headers, cookie **names** (values are never read), script/stylesheet URLs, meta tags, DOM markers and page globals. Each marker is **observed**; each technology below is an **inferred** conclusion. Confidence = number of independent signals (1 = low, 2 = medium, 3+ = high). A UI/headers scan can suggest but never prove the back-end stack; confirm with the team or source code.

## Summary (inferred)
${summary.map((l) => `- ${l}`).join('\n')}

## Detected technologies
${tbl(['Technology', 'Category', 'Confidence', 'Signals', 'Version'], detections.map((d) => [d.name, d.category, d.confidence, d.signals.join('; '), d.version || '']))}

## Observed server headers
${tbl(['Header', 'Values seen'], Object.entries(acc.headers).map(([k, v]) => [k, v.join(' | ')]))}

## Cookies (names and flags only)
${tbl(['Name', 'HttpOnly', 'Secure', 'SameSite'], acc.cookies.map((c) => [c.name, c.httpOnly, c.secure, c.sameSite || '—']))}

## Passive security posture (observations, not testing)
${sec.headers.length ? tbl(['Header missing on some pages', 'Pages missing', 'Pages scanned'], sec.headers.map((h) => [h.id, h.missing_on, h.of])) : '_All tracked security headers present on every scanned page (or no header data)._'}
${sec.weak_cookies.length ? `\nCookies without HttpOnly or Secure: ${sec.weak_cookies.map((c) => c.name).join(', ')} (session cookies should normally have both over HTTPS).` : ''}

## Third-party hosts referenced by scripts
${[...new Set(acc.scripts.map((s) => { try { return new URL(s).host; } catch { return null; } }).filter(Boolean))].slice(0, 20).join(', ') || 'none'}
`;
}
