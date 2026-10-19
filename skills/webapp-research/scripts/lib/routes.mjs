// URL normalization, route templating and the route registry.
const ID_SEG = /^(\d+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{24}|[0-9a-f]{32,})$/i;
// Query keys whose values vary per request (paging, sorting, searching) do not define a new route.
const VOLATILE_KEYS = /^(page|p|pg|offset|start|limit|per_?page|page_?size|sort|sort_?by|order|order_?by|dir|q|query|search|s|keyword|filter)$/i;
const TRACKING = /^(utm_|fbclid|gclid|_ga|mc_)/i;

export function normalizeUrl(input, base) {
  let u;
  try {
    u = new URL(input, base);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(u.protocol)) return null;
  // Only hash *routes* (#/x, #!/x) are navigation; plain anchors are the same page.
  if (!/^#!?\//.test(u.hash)) u.hash = '';
  for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
  u.searchParams.sort();
  let p = u.pathname.replace(/\/{2,}/g, '/');
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  u.pathname = p;
  return u.toString();
}

const templSegs = (p) => p.split('/').map((s) => (ID_SEG.test(s) ? ':id' : s)).join('/');

/** "/customers/42?tab=billing&page=2" -> "/customers/:id?tab=billing" */
export function routeTemplate(normUrl) {
  const u = new URL(normUrl);
  const keep = [...u.searchParams.entries()].filter(([k]) => !VOLATILE_KEYS.test(k));
  const qs = keep.length ? '?' + keep.map(([k, v]) => `${k}=${v}`).join('&') : '';
  const hash = /^#!?\//.test(u.hash) ? '#' + templSegs(u.hash.slice(1)) : '';
  return templSegs(u.pathname) + qs + hash;
}

/** Template for any URL (e.g. a form action): ids become :id, volatile query keys dropped. */
export function templateOfUrl(url, base) {
  const n = normalizeUrl(url, base);
  return n ? routeTemplate(n) : String(url);
}

export function moduleOf(normUrl) {
  const u = new URL(normUrl);
  const parts = (u.pathname === '/' && /^#!?\//.test(u.hash) ? u.hash.replace(/^#!?/, '') : u.pathname)
    .split('/')
    .filter((s) => s && s !== ':id' && !ID_SEG.test(s));
  return { module: parts[0] || 'root', submodule: parts[1] || null };
}

export const STATUSES = ['discovered', 'queued', 'in_progress', 'explored', 'partial', 'blocked', 'failed', 'needs_verification'];

/** Route status derived from the outcome of every sampled example URL. */
export function deriveStatus(route) {
  const res = Object.values(route.results || {});
  if (!res.length) return route.status;
  if (res.every((r) => r === 'explored')) return 'explored';
  if (res.includes('explored') || res.includes('partial')) return 'partial';
  if (res.includes('in_progress')) return 'in_progress';
  if (res.every((r) => r === 'blocked')) return 'blocked';
  return res.includes('blocked') ? 'blocked' : 'failed';
}

export class RouteRegistry {
  constructor(routes = [], opts = {}) {
    this.routes = routes;
    this.maxPerTemplate = opts.maxPerTemplate ?? 3;
    this.byKey = new Map(routes.map((r) => [r.key, r]));
    this.seq = routes.length;
  }

  /** @returns {{route, visit:boolean, reason?:string}} visit=true means the caller should queue this URL */
  add(url, meta = {}) {
    const norm = normalizeUrl(url);
    if (!norm) return { route: null, visit: false, reason: 'invalid' };
    const u = new URL(norm);
    const template = routeTemplate(norm);
    const key = u.origin + template;
    const existing = this.byKey.get(key);
    if (existing) {
      if (existing.examples.includes(norm)) return { route: existing, visit: false, reason: 'duplicate' };
      if (existing.examples.length >= this.maxPerTemplate) {
        existing.skipped_variants = (existing.skipped_variants || 0) + 1;
        return { route: existing, visit: false, reason: 'sampled' };
      }
      existing.examples.push(norm);
      return { route: existing, visit: true };
    }
    const { module, submodule } = moduleOf(norm);
    const route = {
      id: `R${String(++this.seq).padStart(3, '0')}`,
      key,
      origin: u.origin,
      template,
      url: norm,
      examples: [norm],
      results: {},
      title: null,
      module,
      submodule,
      parent: meta.parent ?? null,
      depth: meta.depth ?? 0,
      discovery: meta.via || 'seed',
      discovered_label: meta.label || null,
      auth_required: null,
      access_status: 'unknown',
      status: 'discovered',
      screenshots: [],
      controls: { total: 0, by_category: { A: 0, B: 0, C: 0 }, exercised: 0 },
      forms: [],
      docs: [],
      nav: [],
      notes: [],
      skipped_variants: 0,
      last_inspected_at: null,
      failure: null,
    };
    this.routes.push(route);
    this.byKey.set(key, route);
    return { route, visit: true };
  }

  findByUrl(url) {
    const norm = normalizeUrl(url);
    if (!norm) return null;
    return this.byKey.get(new URL(norm).origin + routeTemplate(norm)) || null;
  }

  get(id) {
    return this.routes.find((r) => r.id === id) || null;
  }

  setResult(route, url, result) {
    route.results[url] = result;
    route.status = deriveStatus(route);
  }
}
