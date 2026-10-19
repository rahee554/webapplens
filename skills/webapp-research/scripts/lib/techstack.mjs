// Tech-stack detection from passive, observable signals (response headers, cookie names, script/link URLs,
// meta tags, DOM markers, page globals). Markers are `observed`; a detected stack is an `inferred`
// conclusion whose confidence grows with the number of independent signals. No value is ever "verified"
// from the UI alone, and cookie VALUES are never read or stored.

/** Runs inside the page. Must stay self-contained. */
export function inPageSignals() {
  const has = (n) => { try { return window[n] !== undefined; } catch { return false; } };
  const globals = ['React', 'ReactDOM', '__REACT_DEVTOOLS_GLOBAL_HOOK__', 'Vue', '__VUE__', 'angular', 'getAllAngularRootElements', 'ng', 'Ember', 'Backbone', 'jQuery', 'Alpine', 'htmx', 'Livewire', 'Turbo', 'Stimulus', 'Inertia', '__NEXT_DATA__', '__NUXT__', '__remixContext', '__sveltekit', 'Shopify', 'wp', 'Drupal', 'odoo', 'Sentry', 'dataLayer', 'ga', 'gtag', '_paq', 'Intercom', 'Stripe', 'Chart', 'echarts', 'Highcharts', 'd3', 'Plotly', 'Swal', 'toastr', 'moment', 'dayjs', 'axios', '_', 'bootstrap', 'firebase', 'Auth0', 'Laravel', 'Echo', 'Pusher', 'FB', 'Cookiebot', 'Stencil', 'Mage'].filter(has);
  const q = (s) => { try { return !!document.querySelector(s); } catch { return false; } };
  const markers = [];
  const mark = (name, sel) => q(sel) && markers.push(name);
  mark('livewire', '[wire\\:id],[wire\\:click],[wire\\:model]'); mark('alpine', '[x-data]'); mark('turbo', '[data-turbo],turbo-frame');
  mark('stimulus', '[data-controller]'); mark('htmx', '[hx-get],[hx-post],[hx-trigger]'); mark('react-root', '[data-reactroot]'); mark('next-root', '#__next');
  mark('nuxt-root', '#__nuxt'); mark('vue-app', '[data-v-app]'); mark('vue-scoped', '[data-v-]'); mark('inertia', '#app[data-page]'); mark('angular-root', '[ng-version]');
  mark('angularjs', '[ng-app],[ng-controller]'); mark('svelte', '[class*=svelte-]'); mark('bootstrap5', '[data-bs-toggle]'); mark('bootstrap4', '[data-toggle]');
  mark('wp-block', '.wp-block-group,body.wordpress'); mark('csrf-meta', 'meta[name=csrf-token]'); mark('django-csrf', 'input[name=csrfmiddlewaretoken]');
  mark('aspnet-viewstate', 'input[name=__VIEWSTATE]'); mark('rails-authenticity', 'input[name=authenticity_token]'); mark('livewire-script', 'script[src*=livewire]');
  const prefixes = { Mui: 0, 'ant-': 0, chakra: 0, 'v-': 0, 'el-': 0, 'mat-': 0, 'p-': 0, 'q-': 0, 'bp': 0, 'ui-': 0, 'fa-': 0, 'bi-': 0 };
  let tw = 0, n = 0;
  for (const el of document.querySelectorAll('[class]')) {
    if (n++ > 3000) break;
    const cl = typeof el.className === 'string' ? el.className.split(/\s+/) : [];
    for (const c of cl) {
      for (const k of Object.keys(prefixes)) if (c.startsWith(k) && c.length > k.length) prefixes[k]++;
      if (/^(flex|grid|hidden|block|px-\d|py-\d|p-\d|m-\d|mt-\d|mb-\d|gap-\d|w-\d|h-\d|text-(xs|sm|base|lg|xl)|font-(bold|medium|semibold)|rounded(-\w+)?|bg-\w+-\d{3}|text-\w+-\d{3}|border-\w+-\d{3}|shadow(-\w+)?)$/.test(c)) tw++;
    }
  }
  const metas = {};
  for (const m of document.querySelectorAll('meta[name],meta[property]')) { const k = m.getAttribute('name') || m.getAttribute('property'); if (k && Object.keys(metas).length < 40) metas[k.toLowerCase()] = (m.getAttribute('content') || '').slice(0, 120); }
  const scripts = Array.from(document.scripts).map((s) => s.src).filter(Boolean).slice(0, 80);
  const links = Array.from(document.querySelectorAll('link[rel~=stylesheet],link[rel=preload],link[rel=modulepreload]')).map((l) => l.href).filter(Boolean).slice(0, 60);
  let html = '';
  try { html = document.documentElement.outerHTML.slice(0, 250000); } catch { /* ignore */ }
  const hits = [];
  for (const [name, re] of [['wp-content', /wp-content|wp-includes/], ['viewstate', /__VIEWSTATE/], ['csrfmiddlewaretoken', /csrfmiddlewaretoken/], ['authenticity_token', /authenticity_token/], ['drupal-settings', /Drupal\.settings|\/sites\/default\/files/], ['shopify-cdn', /cdn\.shopify\.com/], ['odoo-static', /\/web\/static\/(src|lib)/], ['magento', /Mage\.Cookies|\/static\/frontend\//], ['livewire', /wire:id|livewire\.js|livewire\/livewire/], ['vite-client', /\/@vite\/client/], ['laravel-vite', /\/build\/assets\//], ['next-static', /\/_next\/static/], ['nuxt-static', /\/_nuxt\//], ['webpack', /webpackJsonp|__webpack_require__|webpackChunk/], ['jquery-comment', /jQuery v?\d/], ['react-comment', /data-reactroot|__reactFiber/], ['gtm', /googletagmanager\.com/], ['ga', /google-analytics\.com|gtag\(/], ['hotjar', /hotjar\.com/], ['sentry', /sentry\.io|Sentry\.init/], ['intercom', /intercom\.io|Intercom\(/], ['stripe', /js\.stripe\.com/], ['recaptcha', /recaptcha/], ['firebase', /firebase(app|-app|io)/i], ['auth0', /auth0\.com/], ['okta', /okta(preview)?\.com/], ['cloudflare', /cdnjs\.cloudflare\.com|cloudflareinsights/]]) if (re.test(html)) hits.push(name);
  const versions = {};
  const ng = document.querySelector('[ng-version]'); if (ng) versions.angular = ng.getAttribute('ng-version');
  try { if (window.jQuery && window.jQuery.fn) versions.jquery = window.jQuery.fn.jquery; } catch { /* ignore */ }
  try { if (window.React && window.React.version) versions.react = window.React.version; } catch { /* ignore */ }
  try { if (window.Vue && window.Vue.version) versions.vue = window.Vue.version; } catch { /* ignore */ }
  try { if (window.bootstrap && window.bootstrap.Tooltip && window.bootstrap.Tooltip.VERSION) versions.bootstrap = window.bootstrap.Tooltip.VERSION; } catch { /* ignore */ }
  try { if (window.Alpine && window.Alpine.version) versions.alpine = window.Alpine.version; } catch { /* ignore */ }
  return { globals, markers, prefixes, tailwind: tw, metas, scripts, links, hits, versions, lang: document.documentElement.lang || '' };
}

const NOTABLE_HEADERS = ['server', 'x-powered-by', 'via', 'x-generator', 'x-aspnet-version', 'x-aspnetmvc-version', 'x-drupal-cache', 'x-served-by', 'cf-ray', 'x-vercel-id', 'x-amz-cf-id', 'x-nf-request-id', 'x-request-id', 'content-type', 'cache-control'];
const SECURITY_HEADERS = ['content-security-policy', 'strict-transport-security', 'x-frame-options', 'x-content-type-options', 'referrer-policy', 'permissions-policy', 'cross-origin-opener-policy'];

export const newTechAcc = () => ({ pages: 0, globals: [], markers: [], prefixes: {}, tailwind: 0, metas: {}, scripts: [], links: [], hits: [], versions: {}, headers: {}, security: { pages: 0, present: {} }, cookies: [], langs: [] });

const union = (a, b, cap = 200) => [...new Set([...a, ...b])].slice(0, cap);

/** Merge one page's signals into the accumulator. cookies: [{name,httpOnly,secure,sameSite}] (values never passed). */
export function mergeSignals(acc, sig, { headers = {}, cookies = [] } = {}) {
  acc.pages++;
  acc.globals = union(acc.globals, sig.globals);
  acc.markers = union(acc.markers, sig.markers);
  acc.hits = union(acc.hits, sig.hits);
  acc.scripts = union(acc.scripts, sig.scripts, 120);
  acc.links = union(acc.links, sig.links, 80);
  acc.tailwind = Math.max(acc.tailwind, sig.tailwind);
  for (const [k, n] of Object.entries(sig.prefixes)) acc.prefixes[k] = Math.max(acc.prefixes[k] || 0, n);
  for (const [k, v] of Object.entries(sig.metas)) if (!(k in acc.metas) && Object.keys(acc.metas).length < 40) acc.metas[k] = v;
  Object.assign(acc.versions, Object.fromEntries(Object.entries(sig.versions).filter(([, v]) => v)));
  if (sig.lang && !acc.langs.includes(sig.lang)) acc.langs.push(sig.lang);
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v)]));
  for (const h of NOTABLE_HEADERS) if (lower[h]) (acc.headers[h] ||= []).includes(lower[h].slice(0, 120)) || (acc.headers[h].length < 5 && acc.headers[h].push(lower[h].slice(0, 120)));
  if (Object.keys(lower).length) {
    acc.security.pages++;
    for (const h of SECURITY_HEADERS) if (lower[h]) acc.security.present[h] = (acc.security.present[h] || 0) + 1;
  }
  for (const c of cookies) if (c.name && !acc.cookies.some((x) => x.name === c.name)) acc.cookies.push({ name: c.name, httpOnly: !!c.httpOnly, secure: !!c.secure, sameSite: c.sameSite || null });
  return acc;
}

// ---- signature table --------------------------------------------------------------------------------------
// rule kinds: header(name,re) cookie(re) global(name) marker(name) script(re) link(re) meta(name,re) hit(name) prefix(name,min) tailwind(min)
const H = (name, re) => ({ k: 'header', name, re });
const C = (re) => ({ k: 'cookie', re });
const G = (name) => ({ k: 'global', name });
const M = (name) => ({ k: 'marker', name });
const S = (re) => ({ k: 'script', re });
const L = (re) => ({ k: 'link', re });
const META = (name, re) => ({ k: 'meta', name, re });
const HIT = (name) => ({ k: 'hit', name });
const PFX = (name, min = 5) => ({ k: 'prefix', name, min });

export const SIGNATURES = [
  // front-end frameworks
  { name: 'React', cat: 'frontend framework', rules: [G('React'), G('ReactDOM'), M('react-root'), HIT('react-comment'), G('__REACT_DEVTOOLS_GLOBAL_HOOK__')] },
  { name: 'Next.js', cat: 'frontend framework', rules: [G('__NEXT_DATA__'), M('next-root'), HIT('next-static'), S(/\/_next\//)] },
  { name: 'Vue.js', cat: 'frontend framework', rules: [G('Vue'), G('__VUE__'), M('vue-app'), M('vue-scoped')] },
  { name: 'Nuxt', cat: 'frontend framework', rules: [G('__NUXT__'), M('nuxt-root'), HIT('nuxt-static')] },
  { name: 'Angular', cat: 'frontend framework', rules: [M('angular-root'), G('getAllAngularRootElements'), G('ng')] },
  { name: 'AngularJS', cat: 'frontend framework', rules: [G('angular'), M('angularjs')] },
  { name: 'Svelte / SvelteKit', cat: 'frontend framework', rules: [M('svelte'), G('__sveltekit')] },
  { name: 'Remix', cat: 'frontend framework', rules: [G('__remixContext')] },
  { name: 'Ember', cat: 'frontend framework', rules: [G('Ember')] },
  { name: 'Backbone', cat: 'frontend framework', rules: [G('Backbone')] },
  { name: 'jQuery', cat: 'js library', rules: [G('jQuery'), HIT('jquery-comment'), S(/jquery[-.\d]*(\.min)?\.js/i)] },
  { name: 'Alpine.js', cat: 'frontend framework', rules: [G('Alpine'), M('alpine')] },
  { name: 'htmx', cat: 'frontend framework', rules: [G('htmx'), M('htmx')] },
  { name: 'Livewire', cat: 'fullstack framework', rules: [G('Livewire'), M('livewire'), HIT('livewire'), M('livewire-script')] },
  { name: 'Inertia.js', cat: 'fullstack framework', rules: [G('Inertia'), M('inertia')] },
  { name: 'Hotwire (Turbo/Stimulus)', cat: 'frontend framework', rules: [G('Turbo'), M('turbo'), G('Stimulus'), M('stimulus')] },
  // build tooling
  { name: 'Webpack', cat: 'build tool', rules: [HIT('webpack')] },
  { name: 'Vite', cat: 'build tool', rules: [HIT('vite-client'), S(/\/assets\/index-[\w-]+\.js/), L(/\/assets\/index-[\w-]+\.css/)] },
  // UI libraries / CSS
  { name: 'Bootstrap', cat: 'ui library', rules: [M('bootstrap5'), M('bootstrap4'), G('bootstrap'), L(/bootstrap(\.min)?\.css/i), S(/bootstrap(\.bundle)?(\.min)?\.js/i)] },
  { name: 'Tailwind CSS', cat: 'ui library', rules: [{ k: 'tailwind', min: 25 }] },
  { name: 'Material UI', cat: 'ui library', rules: [PFX('Mui', 3)] },
  { name: 'Ant Design', cat: 'ui library', rules: [PFX('ant-', 3)] },
  { name: 'Chakra UI', cat: 'ui library', rules: [PFX('chakra', 3)] },
  { name: 'Vuetify', cat: 'ui library', rules: [PFX('v-', 8)] },
  { name: 'Element UI', cat: 'ui library', rules: [PFX('el-', 8)] },
  { name: 'Angular Material', cat: 'ui library', rules: [PFX('mat-', 5)] },
  { name: 'PrimeVue / PrimeNG / PrimeReact', cat: 'ui library', rules: [PFX('p-', 15)] },
  { name: 'Quasar', cat: 'ui library', rules: [PFX('q-', 8)] },
  { name: 'Font Awesome', cat: 'ui library', rules: [PFX('fa-', 3), L(/font-?awesome/i)] },
  // backends / platforms
  { name: 'Laravel (PHP)', cat: 'backend framework', rules: [C(/^laravel_session$/), C(/^XSRF-TOKEN$/), G('Laravel'), HIT('laravel-vite'), M('csrf-meta'), M('livewire')] },
  { name: 'Django (Python)', cat: 'backend framework', rules: [C(/^csrftoken$/), M('django-csrf'), C(/^sessionid$/)] },
  { name: 'Ruby on Rails', cat: 'backend framework', rules: [M('rails-authenticity'), C(/^_[\w-]+_session$/), H('x-request-id', /./)] },
  { name: 'ASP.NET', cat: 'backend framework', rules: [C(/^ASP\.NET_SessionId$/), C(/^\.AspNetCore\./), M('aspnet-viewstate'), HIT('viewstate'), H('x-aspnet-version', /./), H('x-powered-by', /asp\.net/i)] },
  { name: 'Java (Spring / Servlet)', cat: 'backend framework', rules: [C(/^JSESSIONID$/), H('x-application-context', /./)] },
  { name: 'Express (Node.js)', cat: 'backend framework', rules: [H('x-powered-by', /express/i), C(/^connect\.sid$/)] },
  { name: 'PHP', cat: 'language/runtime', rules: [H('x-powered-by', /php/i), C(/^PHPSESSID$/)] },
  { name: 'WordPress', cat: 'cms', rules: [HIT('wp-content'), META('generator', /wordpress/i), G('wp'), M('wp-block')] },
  { name: 'Drupal', cat: 'cms', rules: [HIT('drupal-settings'), META('generator', /drupal/i), G('Drupal'), H('x-drupal-cache', /./)] },
  { name: 'Odoo', cat: 'erp platform', rules: [HIT('odoo-static'), G('odoo'), C(/^session_id$/)] },
  { name: 'Magento', cat: 'ecommerce platform', rules: [HIT('magento'), G('Mage')] },
  { name: 'Shopify', cat: 'ecommerce platform', rules: [HIT('shopify-cdn'), G('Shopify')] },
  // servers / hosting
  { name: 'nginx', cat: 'web server', rules: [H('server', /nginx/i)] },
  { name: 'Apache', cat: 'web server', rules: [H('server', /apache/i)] },
  { name: 'Microsoft IIS', cat: 'web server', rules: [H('server', /iis/i)] },
  { name: 'Cloudflare', cat: 'cdn / hosting', rules: [H('server', /cloudflare/i), H('cf-ray', /./), HIT('cloudflare')] },
  { name: 'Vercel', cat: 'cdn / hosting', rules: [H('x-vercel-id', /./), H('server', /vercel/i)] },
  { name: 'Netlify', cat: 'cdn / hosting', rules: [H('x-nf-request-id', /./), H('server', /netlify/i)] },
  { name: 'AWS CloudFront', cat: 'cdn / hosting', rules: [H('x-amz-cf-id', /./), H('via', /cloudfront/i)] },
  // services
  { name: 'Google Analytics / Tag Manager', cat: 'analytics', rules: [HIT('ga'), HIT('gtm'), G('gtag'), G('dataLayer'), G('ga')] },
  { name: 'Hotjar', cat: 'analytics', rules: [HIT('hotjar')] },
  { name: 'Sentry', cat: 'monitoring', rules: [HIT('sentry'), G('Sentry')] },
  { name: 'Intercom', cat: 'support chat', rules: [HIT('intercom'), G('Intercom')] },
  { name: 'Stripe', cat: 'payments', rules: [HIT('stripe'), G('Stripe')] },
  { name: 'reCAPTCHA', cat: 'security', rules: [HIT('recaptcha')] },
  { name: 'Firebase', cat: 'baas', rules: [HIT('firebase'), G('firebase')] },
  { name: 'Auth0', cat: 'auth provider', rules: [HIT('auth0'), G('Auth0')] },
  { name: 'Okta', cat: 'auth provider', rules: [HIT('okta')] },
  { name: 'Laravel Echo / Pusher (realtime)', cat: 'realtime', rules: [G('Echo'), G('Pusher')] },
  { name: 'Chart.js', cat: 'charts', rules: [G('Chart')] },
  { name: 'ECharts', cat: 'charts', rules: [G('echarts')] },
  { name: 'Highcharts', cat: 'charts', rules: [G('Highcharts')] },
  { name: 'D3', cat: 'charts', rules: [G('d3')] },
  { name: 'Plotly', cat: 'charts', rules: [G('Plotly')] },
  { name: 'Axios', cat: 'js library', rules: [G('axios')] },
  { name: 'Moment.js / Day.js', cat: 'js library', rules: [G('moment'), G('dayjs')] },
  { name: 'SweetAlert2', cat: 'js library', rules: [G('Swal')] },
];

const VERSION_KEY = { 'React': 'react', 'Vue.js': 'vue', 'Angular': 'angular', 'jQuery': 'jquery', 'Bootstrap': 'bootstrap', 'Alpine.js': 'alpine' };

function matchRule(r, acc) {
  const lc = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.toLowerCase(), v]));
  switch (r.k) {
    case 'header': return (acc.headers[r.name] || []).some((v) => r.re.test(v)) ? `header ${r.name}` : null;
    case 'cookie': { const c = acc.cookies.find((x) => r.re.test(x.name)); return c ? `cookie name ${c.name}` : null; }
    case 'global': return acc.globals.includes(r.name) ? `global window.${r.name}` : null;
    case 'marker': return acc.markers.includes(r.name) ? `DOM marker ${r.name}` : null;
    case 'script': { const s = acc.scripts.find((x) => r.re.test(x)); return s ? `script ${s.replace(/^https?:\/\//, '').slice(0, 70)}` : null; }
    case 'link': { const s = acc.links.find((x) => r.re.test(x)); return s ? `stylesheet ${s.replace(/^https?:\/\//, '').slice(0, 70)}` : null; }
    case 'meta': return lc(acc.metas)[r.name] && r.re.test(lc(acc.metas)[r.name]) ? `meta ${r.name}="${lc(acc.metas)[r.name]}"` : null;
    case 'hit': return acc.hits.includes(r.name) ? `page source pattern ${r.name}` : null;
    case 'prefix': return (acc.prefixes[r.name] || 0) >= r.min ? `${acc.prefixes[r.name]} class names starting "${r.name}"` : null;
    case 'tailwind': return acc.tailwind >= r.min ? `${acc.tailwind} Tailwind-style utility classes` : null;
    default: return null;
  }
}

/** Pure: turns accumulated signals into detections [{name, category, signals[], confidence, version?}]. */
export function detectStack(acc) {
  const out = [];
  for (const t of SIGNATURES) {
    const matched = t.rules.map((r) => matchRule(r, acc)).filter(Boolean);
    const unique = [...new Set(matched)];
    if (!unique.length) continue;
    // Weak single signals for generic things (e.g. a lone "ga" global) stay "low".
    const confidence = unique.length >= 3 ? 'high' : unique.length === 2 ? 'medium' : 'low';
    const vk = VERSION_KEY[t.name];
    out.push({ name: t.name, category: t.cat, signals: unique, confidence, version: (vk && acc.versions[vk]) || null });
  }
  const order = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => order[a.confidence] - order[b.confidence] || a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
}

/** Inferred full-stack summary: combines detections into plain statements (all marked as inference). */
export function summarizeStack(detections, acc) {
  const by = (cat) => detections.filter((d) => d.category === cat && d.confidence !== 'low').map((d) => d.name + (d.version ? ` ${d.version}` : ''));
  const laravel = detections.find((d) => d.name.startsWith('Laravel'));
  const lines = [];
  if (by('frontend framework').length) lines.push(`Front-end: ${by('frontend framework').join(', ')}`);
  if (by('backend framework').length) lines.push(`Back-end (inferred): ${by('backend framework').join(', ')}`);
  if (by('cms').concat(by('erp platform'), by('ecommerce platform')).length) lines.push(`Platform: ${by('cms').concat(by('erp platform'), by('ecommerce platform')).join(', ')}`);
  if (by('ui library').length) lines.push(`UI: ${by('ui library').join(', ')}`);
  if (by('web server').concat(by('cdn / hosting')).length) lines.push(`Serving: ${by('web server').concat(by('cdn / hosting')).join(', ')}`);
  if (laravel && detections.some((d) => d.name === 'Livewire' || d.name === 'Inertia.js')) lines.push('Likely a Laravel app using a server-driven UI layer (Livewire/Inertia) - inferred from several markers, not confirmed');
  if (!lines.length) lines.push('No confident stack signals found (heavily bundled or custom stack, or too few pages scanned)');
  return lines;
}

/** Findings about passive security headers / cookie flags (defensive observations, not testing). */
export function securityObservations(acc) {
  const out = [];
  const n = acc.security.pages;
  if (n) {
    for (const h of SECURITY_HEADERS) {
      const c = acc.security.present[h] || 0;
      if (c < n) out.push({ id: h, missing_on: n - c, of: n });
    }
  }
  const weak = acc.cookies.filter((c) => !c.httpOnly || !c.secure);
  return { headers: out, cookies: acc.cookies, weak_cookies: weak };
}
