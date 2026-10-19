// Central redaction. Everything written to logs, evidence and reports goes through here.
export const SECRET_KEY = /(pass(word)?|pwd|secret|token|api[-_]?key|authorization|cookie|session|csrf|xsrf|credential)/i;
export const SECRETISH_FIELD = /(pass|secret|token|api.?key|ssn|card|cvv|cvc|iban|pin\b)/i;

const PATTERNS = [
  [/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]'],
  [/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/g, '[REDACTED_JWT]'],
  [/((?:password|passwd|pwd|token|secret|api[_-]?key|session(?:id)?)\s*[=:]\s*)("[^"]*"|'[^']*'|[^\s&,;]+)/gi, '$1[REDACTED]'],
];

const registered = new Set();

/** Register a literal secret (e.g. the login password) so it is scrubbed wherever it appears. */
export function registerSecret(s) {
  if (s && String(s).length >= 3) registered.add(String(s));
}
export const clearSecrets = () => registered.clear();

export function redactText(text, extra = []) {
  let out = String(text ?? '');
  for (const s of [...registered, ...extra]) if (s && s.length >= 3) out = out.split(s).join('[REDACTED]');
  for (const [re, rep] of PATTERNS) out = out.replace(re, rep);
  return out;
}

export function redactUrl(u) {
  try {
    const x = new URL(u);
    for (const k of [...x.searchParams.keys()]) if (SECRET_KEY.test(k)) x.searchParams.set(k, 'REDACTED');
    x.username = '';
    x.password = '';
    return redactText(x.toString());
  } catch {
    return redactText(u);
  }
}

export function redactObject(v) {
  if (typeof v === 'string') return redactText(v);
  if (Array.isArray(v)) return v.map(redactObject);
  if (v && typeof v === 'object') {
    const out = {};
    for (const [k, val] of Object.entries(v)) {
      out[k] = SECRET_KEY.test(k) && typeof val === 'string' && val ? '[REDACTED]' : redactObject(val);
    }
    return out;
  }
  return v;
}
