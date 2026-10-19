// Self-contained HTML dashboard for a research project: dashboard.html next to README.md.
// Data is embedded as JSON; screenshots/docs are linked by relative path, so the folder stays portable.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFINITIONS, fullAudit } from './coverage.mjs';
import { scanTodos } from './links.mjs';
import { readJson, writeText } from './util.mjs';
import { inferRoles } from './design.mjs';
import { detectStack, newTechAcc, securityObservations, summarizeStack } from './techstack.mjs';

const TEMPLATE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'templates', 'dashboard.template.html');

function docList(project) {
  const { p } = project;
  const out = [];
  const add = (rel, kind) => {
    if (!fs.existsSync(path.join(p.dir, rel))) return;
    const first = fs.readFileSync(path.join(p.dir, rel), 'utf8').split('\n').find((l) => /^#\s/.test(l));
    out.push({ path: rel, kind, title: (first || rel).replace(/^#\s*/, '') });
  };
  add('docs/index.md', 'Index');
  add('routes/route-inventory.md', 'Routes');
  add('reports/completeness.md', 'Report');
  add('reports/unresolved-items.md', 'Report');
  for (const [dir, kind] of [['docs/modules', 'Module'], ['docs/forms-and-fields', 'Forms'], ['docs/workflows', 'Workflow'], ['docs/technicals', 'Technical']]) {
    const d = path.join(p.dir, dir);
    if (fs.existsSync(d)) for (const f of fs.readdirSync(d).sort()) if (f.endsWith('.md')) add(`${dir}/${f}`, kind);
  }
  return out;
}

const top = (m, n = 10) => Object.entries(m || {}).sort((a, b) => b[1] - a[1]).slice(0, n);

function extras(project) {
  const d = readJson(project.p.designTokens, null);
  const t = readJson(project.p.techStack, null);
  const sg = readJson(project.p.suggestions, null);
  const design = d && d.pages ? { pages: d.pages, roles: inferRoles(d), colors: top(d.colors, 10), backgrounds: top(d.backgrounds, 10), borders: top(d.borders, 6), fonts: top(d.fonts, 5), sizes: top(d.sizes, 12), radii: top(d.radii, 6), shadows: top(d.shadows, 4), spacing: top(d.spacing, 10), buttons: d.components.buttons.slice(0, 6), cssVars: Object.entries(d.cssVars).slice(0, 40), breakpoints: Object.keys(d.breakpoints).map(Number).sort((a, b) => a - b), contrast: d.contrast, darkMode: d.darkMode } : null;
  let tech = null;
  if (t && t.pages) { const det = detectStack(t); tech = { pages: t.pages, summary: summarizeStack(det, t), detections: det, headers: t.headers, cookies: t.cookies, security: securityObservations(t) }; }
  return { design, tech, suggestions: sg };
}

export function buildDashboard(project) {
  const audit = fullAudit(project);
  const routes = project.routes();
  const byId = Object.fromEntries(routes.map((r) => [r.id, r]));
  const state = project.state();
  const network = readJson(project.p.network, { blocked: [] });
  const data = {
    manifest: project.manifest(),
    audit,
    definitions: DEFINITIONS,
    routes: routes.map((r) => ({
      id: r.id, template: r.template, title: r.title, module: r.module, submodule: r.submodule, status: r.status,
      access: r.access_status, failure: r.failure, forms: r.forms.length, controls: r.controls.total,
      examples: r.examples.length, skipped: r.skipped_variants || 0, shot: r.screenshots[0] || null,
    })),
    shots: project.shots().map((s) => ({ file: s.file, route: byId[s.route_id]?.template || s.route_id, ui_state: s.ui_state, viewport: s.viewport, captured_at: s.captured_at })),
    forms: project.forms().map((f) => ({ id: f.id, label: f.label, route: byId[f.route_id]?.template || f.route_id, ui_state: f.ui_state, fields: f.fields, submit: f.submit || [], submit_tested: f.submit_tested })),
    observations: project.observations(),
    blocked: network.blocked || [],
    skippedLinks: state.skipped_links || [],
    todos: scanTodos(project.p.dir),
    docs: docList(project),
    ...extras(project),
  };
  // "</script>" inside embedded JSON would end the script block early.
  const json = JSON.stringify(data).replace(/</g, () => String.raw`\u003c`).replace(/[\u2028\u2029]/g, ' ');
  return fs.readFileSync(TEMPLATE, 'utf8').replace('/*__DATA__*/null', () => json);
}

export function writeDashboard(project) {
  const file = path.join(project.p.dir, 'dashboard.html');
  writeText(file, buildDashboard(project));
  return file;
}
