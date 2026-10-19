// Improvement suggester: turns measured evidence (a11y counts, performance timing, design consistency,
// passive security headers, tech stack, dead links, console errors) into prioritised, evidence-backed
// suggestions. Findings are observed facts; each `recommendation` is advice. Nothing here tests or attacks the app.
import fs from 'node:fs';
import path from 'node:path';
import { readJson, writeJson, writeText } from './util.mjs';
import { detectStack, newTechAcc, securityObservations } from './techstack.mjs';
import { inferRoles, newDesignAcc } from './design.mjs';

const SEV = { high: 0, medium: 1, low: 2 };

export function buildSuggestions(project) {
  const routes = project.routes().filter((r) => ['explored', 'partial'].includes(r.status));
  const allRoutes = project.routes();
  const forms = project.forms();
  const controls = Object.values(project.controls()).flat();
  const net = readJson(project.p.network, { per_route: {} });
  const tech = readJson(project.p.techStack, null) || newTechAcc();
  const design = readJson(project.p.designTokens, null) || newDesignAcc();
  const detections = detectStack(tech);
  const cfg = project.config();
  const items = [];
  const add = (category, severity, title, evidence, routeIds, recommendation, effort = 'M') => items.push({ category, severity, title, evidence, routes: [...new Set(routeIds)].slice(0, 12), recommendation, effort });
  const sum = (f) => routes.reduce((n, r) => n + (r.a11y ? f(r.a11y) : 0), 0);
  const where = (f) => routes.filter((r) => r.a11y && f(r.a11y)).map((r) => r.id);

  // --- accessibility ---
  const noAlt = sum((a) => a.images_no_alt);
  if (noAlt) add('accessibility', 'medium', 'Images without alt text', `${noAlt} <img> element(s) have no alt attribute`, where((a) => a.images_no_alt), 'Add meaningful alt text, or alt="" for decorative images.', 'S');
  const noLabel = sum((a) => a.inputs_no_label);
  if (noLabel) add('accessibility', 'high', 'Form fields without an accessible label', `${noLabel} visible field(s) have no <label>, aria-label or aria-labelledby`, where((a) => a.inputs_no_label), 'Associate every field with a visible <label for=...> (placeholders are not labels).', 'S');
  const noName = sum((a) => a.buttons_no_name + a.links_no_name);
  if (noName) add('accessibility', 'high', 'Buttons or links without an accessible name', `${noName} control(s) have no text or aria-label (icon-only controls?)`, where((a) => a.buttons_no_name + a.links_no_name), 'Give icon-only controls an aria-label and a tooltip.', 'S');
  if (routes.some((r) => r.a11y && !r.a11y.has_lang)) add('accessibility', 'medium', 'Missing page language', 'The <html> element has no lang attribute', where((a) => !a.has_lang), 'Set <html lang="..."> so screen readers pick the right voice.', 'S');
  if (routes.some((r) => r.a11y && !r.a11y.has_viewport)) add('usability', 'high', 'No responsive viewport meta tag', 'Pages without <meta name="viewport"> render as a zoomed-out desktop page on phones', where((a) => !a.has_viewport), 'Add <meta name="viewport" content="width=device-width, initial-scale=1">.', 'S');
  const badH1 = where((a) => a.h1_count !== 1);
  if (badH1.length) add('accessibility', 'low', 'Pages without exactly one main heading (h1)', `${badH1.length} page(s) have zero or several h1 elements`, badH1, 'Use one h1 per page describing its purpose.', 'S');
  if (routes.some((r) => r.a11y && !r.a11y.has_main)) add('accessibility', 'low', 'No main landmark', 'Some pages have no <main> / role="main"', where((a) => !a.has_main), 'Wrap the primary content in <main> so keyboard and screen-reader users can skip navigation.', 'S');
  const noTh = sum((a) => a.tables_no_headers);
  if (noTh) add('accessibility', 'medium', 'Tables without header cells', `${noTh} table(s) have no <th>`, where((a) => a.tables_no_headers), 'Use <th scope> for column/row headers.', 'S');
  const dup = sum((a) => a.duplicate_ids);
  if (dup) add('accessibility', 'low', 'Duplicate element ids', `${dup} duplicated id value(s) found`, where((a) => a.duplicate_ids), 'Ids must be unique; duplicates break label association and ARIA references.', 'S');
  const titles = {};
  for (const r of routes) titles[r.title || ''] = [...(titles[r.title || ''] || []), r.id];
  for (const [t, ids] of Object.entries(titles)) if (ids.length >= 3 || (!t && ids.length)) add('usability', 'low', t ? 'Many pages share the same title' : 'Pages without a title', `${ids.length} page(s) titled "${t}"`, ids, 'Give each page a unique, descriptive <title> (browser tabs, history, SEO).', 'S');
  if (design.contrast.checked && design.contrast.failures / design.contrast.checked > 0.05) add('accessibility', 'high', 'Low colour contrast', `${design.contrast.failures} of ${design.contrast.checked} sampled text elements are below WCAG AA (e.g. ${design.contrast.examples.slice(0, 2).map((e) => `${e.fg} on ${e.bg} = ${e.ratio}:1`).join('; ')})`, [], 'Darken text or lighten backgrounds to reach 4.5:1 (3:1 for large text).', 'M');

  // --- usability ---
  for (const r of allRoutes.filter((x) => x.status === 'failed' && x.access_status === 'not_found' && !x.accepted)) add('usability', 'medium', `Dead link to ${r.template}`, `Linked as "${r.discovered_label || '?'}" but returns 404`, [r.id], 'Fix the target, redirect it, or remove the link.', 'S');
  const longForms = forms.filter((f) => f.kind !== 'action' && f.fields.length > 12);
  if (longForms.length) add('usability', 'medium', 'Very long forms', `${longForms.length} form(s) have more than 12 fields (${longForms.map((f) => f.label).slice(0, 3).join(', ')})`, longForms.map((f) => f.route_id), 'Split into steps or sections, group related fields, mark required ones clearly.', 'M');
  const bigSelect = forms.flatMap((f) => f.fields.filter((x) => (x.options || []).length >= 30).map(() => f));
  if (bigSelect.length) add('usability', 'low', 'Long dropdown lists', `${bigSelect.length} select(s) with 30+ options`, bigSelect.map((f) => f.route_id), 'Use a searchable combobox / type-ahead for long lists.', 'M');
  const bigTables = routes.filter((r) => (r.tables || []).some((t) => t.rows >= 10) && !r.has_search);
  if (bigTables.length) add('usability', 'low', 'Large tables without search', `${bigTables.length} page(s) show 10+ rows and have no search box`, bigTables.map((r) => r.id), 'Add search and filters to long lists.', 'M');
  const unsortable = routes.filter((r) => (r.tables || []).some((t) => t.rows >= 5 && !t.sortable));
  if (unsortable.length) add('usability', 'low', 'Tables that cannot be sorted', `${unsortable.length} page(s) have tables without sortable headers`, unsortable.map((r) => r.id), 'Make key columns sortable.', 'S');
  const dangerous = forms.filter((f) => f.kind === 'action' && f.category === 'C');
  if (dangerous.length) add('usability', 'low', 'Destructive actions are one click away', `${dangerous.length} one-button action form(s) look destructive/consequential (${dangerous.map((f) => f.submit[0]).filter(Boolean).slice(0, 3).join(', ')})`, dangerous.map((f) => f.route_id), 'Verify they ask for confirmation, support undo, and respect permissions (not tested by this crawl).', 'S');
  const busy = routes.filter((r) => r.controls.total > 60);
  if (busy.length) add('usability', 'low', 'Pages with very many controls', `${busy.length} page(s) expose 60+ distinct controls`, busy.map((r) => r.id), 'Progressive disclosure: group secondary actions in menus.', 'M');
  const deep = allRoutes.filter((r) => r.depth >= 5);
  if (deep.length) add('usability', 'low', 'Deep navigation', `${deep.length} route(s) are 5+ clicks from the start page`, deep.map((r) => r.id), 'Flatten navigation or add shortcuts/breadcrumbs.', 'M');

  // --- design consistency ---
  const r2 = inferRoles(design);
  if (design.pages) {
    if (r2.distinct.sizes > 10) add('design', 'low', 'Too many font sizes', `${r2.distinct.sizes} distinct font sizes in use`, [], 'Adopt a type scale (e.g. 12/14/16/20/24/32).', 'M');
    if (r2.distinct.colors > 25) add('design', 'medium', 'Large colour palette', `${r2.distinct.colors} distinct text/background colours`, [], 'Consolidate into a palette of design tokens (primary, neutral ramp, semantic colours).', 'M');
    if (r2.distinct.radii > 5) add('design', 'low', 'Inconsistent corner radii', `${r2.distinct.radii} different radii`, [], 'Use 2–3 radius tokens.', 'S');
    if (design.components.buttons.length > 5) add('design', 'low', 'Many button styles', `${design.components.buttons.length} visually different button variants`, [], 'Define primary / secondary / tertiary / danger variants.', 'M');
    if (r2.grid4 < 70) add('design', 'low', 'Spacing is not on a 4/8px grid', `${r2.grid4}% of spacing values are multiples of 4px`, [], 'Use a spacing scale (4, 8, 12, 16, 24, 32…).', 'M');
    if (!Object.keys(design.cssVars).length) add('design', 'low', 'No CSS custom properties found', 'No readable :root variables (or styles are cross-origin)', [], 'Express colours, spacing and radii as CSS variables to enable theming and dark mode.', 'M');
    if (!design.darkMode) add('design', 'low', 'No dark mode detected', 'No prefers-color-scheme or color-scheme rules found', [], 'Consider a dark theme if users work long hours in the app.', 'L');
  }

  // --- performance & reliability ---
  const slow = routes.filter((r) => r.perf && (r.perf.load > 3000 || r.perf.ttfb > 800));
  if (slow.length) add('performance', 'medium', 'Slow pages', `${slow.length} page(s) with load > 3s or first byte > 800ms (e.g. ${slow[0].template}: load ${slow[0].perf.load}ms)`, slow.map((r) => r.id), 'Profile server response and bundle size; cache, compress, lazy-load.', 'L');
  const heavy = routes.filter((r) => r.perf && (r.perf.transfer_kb > 2000 || r.perf.requests > 80));
  if (heavy.length) add('performance', 'low', 'Heavy pages', `${heavy.length} page(s) transfer >2MB or make >80 requests`, heavy.map((r) => r.id), 'Bundle/minify, compress images, defer non-critical scripts.', 'M');
  const noisy = Object.entries(net.per_route || {}).filter(([, v]) => v.console_errors + v.page_errors + v.failed_requests > 0);
  if (noisy.length) add('reliability', 'medium', 'Console errors or failed requests', `${noisy.length} page(s) logged errors (e.g. ${noisy[0][0]}: ${noisy[0][1].console_errors} console, ${noisy[0][1].page_errors} script, ${noisy[0][1].failed_requests} failed requests)`, noisy.map(([id]) => id), 'Open DevTools on those pages and fix the errors; they often point to broken features.', 'M');

  // --- passive security observations ---
  const sec = securityObservations(tech);
  const isHttps = /^https:/.test(cfg.baseUrl);
  for (const h of sec.headers.filter((x) => x.id !== 'strict-transport-security' || isHttps)) add('security', ['content-security-policy', 'strict-transport-security'].includes(h.id) ? 'medium' : 'low', `Missing ${h.id} header`, `Absent on ${h.missing_on} of ${h.of} scanned page(s)`, [], `Set ${h.id} at the web server/proxy (passive observation; confirm intent with the team).`, 'S');
  if (isHttps && sec.weak_cookies.length) add('security', 'medium', 'Cookies without HttpOnly/Secure', `${sec.weak_cookies.map((c) => c.name).join(', ')}`, [], 'Mark session cookies HttpOnly and Secure (and SameSite).', 'S');
  const disclose = Object.entries(tech.headers).filter(([k, v]) => ['x-powered-by', 'server', 'x-aspnet-version'].includes(k) && v.some((x) => /\d+\.\d+/.test(x)));
  if (disclose.length) add('security', 'low', 'Server discloses software versions', disclose.map(([k, v]) => `${k}: ${v[0]}`).join('; '), [], 'Hide version banners to reduce fingerprinting.', 'S');
  if (!isHttps && !/localhost|127\.0\.0\.1/.test(cfg.baseUrl) && /^http:/.test(cfg.baseUrl)) add('security', 'high', 'Site served over plain HTTP', cfg.baseUrl, [], 'Serve over HTTPS and redirect HTTP.', 'M');

  // --- technology ---
  for (const d of detections) {
    if (d.name === 'AngularJS') add('technology', 'medium', 'AngularJS (end-of-life) detected', d.signals.join('; '), [], 'Plan a migration to a supported framework.', 'L');
    if (d.name === 'jQuery' && d.version && Number(d.version.split('.')[0]) < 3) add('technology', 'low', `Old jQuery ${d.version}`, 'jQuery < 3 has known issues and no support', [], 'Upgrade to jQuery 3.x or remove it.', 'M');
    if (d.name === 'Moment.js / Day.js' && d.signals.some((s) => /moment/.test(s))) add('technology', 'low', 'Moment.js is in maintenance mode', d.signals.join('; '), [], 'Prefer Day.js/date-fns/Temporal for new code.', 'M');
  }

  items.sort((a, b) => SEV[a.severity] - SEV[b.severity] || a.category.localeCompare(b.category));
  const counters = {};
  for (const it of items) { const k = it.category[0].toUpperCase(); counters[k] = (counters[k] || 0) + 1; it.id = `${k}${String(counters[k]).padStart(2, '0')}`; }
  const quickWins = items.filter((i) => i.effort === 'S' && i.severity !== 'low');
  return { generated_at: new Date().toISOString(), counts: { total: items.length, high: items.filter((i) => i.severity === 'high').length, medium: items.filter((i) => i.severity === 'medium').length, low: items.filter((i) => i.severity === 'low').length }, quick_wins: quickWins.map((i) => i.id), items, scope_note: `Based on ${routes.length} explored page(s); heuristics, not a full audit. Accessibility needs manual testing too.` };
}

const esc = (s) => String(s ?? '').replace(/\|/g, '\\|');

export function renderSuggestions(result, appName) {
  const cats = [...new Set(result.items.map((i) => i.category))];
  const row = (i) => `| ${i.id} | ${i.severity} | ${i.effort} | **${esc(i.title)}** — ${esc(i.evidence)} | ${esc(i.recommendation)} | ${i.routes.join(', ') || '—'} |`;
  return `# Improvement suggestions — ${appName}

${result.scope_note} Evidence is measured from the crawl (observed); recommendations are advice. Effort: S small, M medium, L large.

**${result.counts.total} suggestion(s):** ${result.counts.high} high, ${result.counts.medium} medium, ${result.counts.low} low. Quick wins (small effort, medium/high impact): ${result.quick_wins.join(', ') || 'none'}.

${cats.map((c) => `## ${c[0].toUpperCase() + c.slice(1)}\n| ID | Severity | Effort | Finding (evidence) | Recommendation | Routes |\n|---|---|---|---|---|---|\n${result.items.filter((i) => i.category === c).map(row).join('\n')}`).join('\n\n') || '_No suggestions: nothing crossed a threshold._'}
`;
}

export function writeSuggestions(project) {
  const result = buildSuggestions(project);
  writeJson(project.p.suggestions, result);
  const file = path.join(project.p.reports, 'suggestions.md');
  writeText(file, `<!-- generated:webapp-research (rewritten by \`suggest\`/\`report\`) -->\n\n${renderSuggestions(result, project.manifest().application)}`);
  return { file, ...result.counts };
}
