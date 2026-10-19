// Interaction safety classification.
//   A = safe observation (auto-allowed)
//   B = controlled testing (sandbox / explicit authorization + cleanup plan)
//   C = consequential (explicit approval, never automatic)
// Unknown labels are treated as B: when in doubt, don't click.
const C_RE = /\b(delete|remove|destroy|erase|purge|wipe|send|email|publish|approve|reject|pay|payment|charge|refund|invite|archive|deactivate|disable account|revoke|reset password|log ?out|sign ?out|transfer|place order|confirm|cancel (subscription|order|plan)|ban|block|terminate|void|post to)\b/i;
const B_RE = /\b(save|submit|create|add|new|update|edit|upload|import|apply|register|sign ?up|generate|run|start|assign|set|change|rename|duplicate|clone|reply|comment|book|schedule|enable)\b/i;
const A_RE = /\b(view|open|show|hide|details?|next|prev(ious)?|back|search|find|filter|sort|expand|collapse|close|cancel|dismiss|tab|menu|more|page|first|last|refresh|reload|help|home|dashboard|overview|toggle|columns?)\b|^\d+$|^[‹›«»<>]+$/i;

const RANK = { A: 0, B: 1, C: 2 };
const worst = (a, b) => (RANK[a] >= RANK[b] ? a : b);

/**
 * @param {string} label visible/accessible name
 * @param {{role?:string, type?:string, method?:string, href?:string}} ctx
 */
export function classifyAction(label = '', ctx = {}) {
  const text = String(label).trim();
  let cat;
  let reason;
  if (C_RE.test(text)) [cat, reason] = ['C', 'label suggests a consequential action'];
  else if (ctx.href && C_RE.test(ctx.href.replace(/^https?:\/\/[^/]+/, ''))) [cat, reason] = ['C', 'target URL suggests a consequential action'];
  else if (ctx.role === 'link' || ctx.role === 'tab' || ctx.role === 'menuitem') [cat, reason] = ['A', 'navigation control'];
  else if (ctx.toggle) [cat, reason] = ['A', 'disclosure control (aria-expanded)'];
  else if (B_RE.test(text)) [cat, reason] = ['B', 'label suggests creating or changing data'];
  else if (A_RE.test(text)) [cat, reason] = ['A', 'label suggests read-only interaction'];
  else [cat, reason] = ['B', 'unknown label; not assumed safe'];

  // A submit button of a GET form (search/filter) only reads; any other submit may write.
  if (ctx.type === 'submit' && !/^get$/i.test(ctx.method || '')) [cat, reason] = [worst(cat, 'B'), 'form submit control'];
  if (ctx.method && !/^(GET|HEAD|OPTIONS)$/i.test(ctx.method)) [cat, reason] = [worst(cat, 'B'), `HTTP ${ctx.method}`];
  return { category: cat, reason };
}

/** Buttons that normally just open a dialog/form; clicked only when probeOpeners is on, and POSTs stay blocked regardless. */
export const OPENER_RE = /^(\+\s*)?(add|new|create|filters?|columns?|edit|view|details?|open)\b/i;
export const isOpener = (label, ctx = {}) =>
  OPENER_RE.test(String(label).trim()) && ctx.type !== 'submit' && !C_RE.test(label);

export const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** True only if the body is parseable JSON whose every operation is a GraphQL query (no mutation/subscription). */
export function isReadOnlyGraphql(body) {
  let parsed;
  try { parsed = JSON.parse(body || ''); } catch { return false; }
  const ops = Array.isArray(parsed) ? parsed : [parsed];
  return ops.length > 0 && ops.every((o) => o && typeof o.query === 'string' && !/(^|[\s}{)])(mutation|subscription)\b/i.test(o.query.replace(/#.*$/gm, '')));
}
