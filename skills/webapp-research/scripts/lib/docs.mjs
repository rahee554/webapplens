// Documentation generator. Two kinds of files:
//   generated  - carry GEN marker, are rewritten on every `report` (facts straight from the data)
//   agent-owned - created once from a template with TODO(agent) markers; never overwritten
// The split lets agents write analysis without a re-run clobbering it.
import fs from 'node:fs';
import path from 'node:path';
import { relLink, slug, writeText } from './util.mjs';
import { TODO_MARK, scanTodos } from './links.mjs';
import { DEFINITIONS, fullAudit } from './coverage.mjs';
import { credentialSummary } from './credentials.mjs';
import { EVIDENCE_TYPES } from './evidence.mjs';
import { writeDashboard } from './viewer.mjs';

const GEN = '<!-- generated:webapp-research (rewritten by `report`; write analysis in agent-owned files) -->';
const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const list = (a) => (a.length ? a.map((x) => `- ${x}`).join('\n') : '- (none)');
const table = (head, rows) => (rows.length ? `| ${head.join(' | ')} |\n|${head.map(() => '---').join('|')}|\n${rows.map((r) => `| ${r.map(esc).join(' | ')} |`).join('\n')}` : '_None._');

function writeGenerated(file, body) {
  if (fs.existsSync(file) && !fs.readFileSync(file, 'utf8').includes('generated:webapp-research')) return false; // taken over by an agent
  writeText(file, `${GEN}\n\n${body.trim()}\n`);
  return true;
}
function writeOwned(file, body) {
  if (!fs.existsSync(file)) writeText(file, body.trim() + '\n');
}

const AGENT_DOCS = {
  'docs/product-overview.md': ['Product overview', 'In plain English: what the application is for, who uses it, and its main areas. Base every statement on routes/screenshots; mark anything unverified.'],
  'docs/ui-patterns.md': ['UI patterns', 'Layout, navigation, tables, forms, dialogs and consistency, with screenshot references and exact routes.'],
  'docs/user-guide.md': ['User guide', 'Step-by-step guides for the main tasks in very simple English. Do not describe steps that were not observed.'],
  'docs/technicals/architecture.md': ['Architecture (observed vs. likely)', 'Separate "Observed" from "Likely (inferred)". Never present a database schema or backend framework as confirmed without evidence.'],
  'docs/technicals/data-model.md': ['Data model (proposed)', 'Entities and relationships seen in the UI. Label every table/column as PROPOSED unless verified by official docs or public source.'],
  'docs/technicals/api-analysis.md': ['API analysis', 'Use docs/technicals/api-observed.md as evidence. Describe only calls that were seen; mark contracts as inferred.'],
  'docs/technicals/authentication.md': ['Authentication', 'Login flow, session handling and MFA/CAPTCHA behaviour as observed.'],
  'docs/technicals/authorization.md': ['Authorization & roles', 'Roles/permissions observed (e.g. 403 pages, hidden menu items). State which roles were actually tested.'],
  'docs/technicals/integrations.md': ['Integrations', 'External services (see limitations.md for external origins). Evidence required for each.'],
  'docs/technicals/design-system.md': ['Design system', 'Colours, typography, spacing, component conventions observed.'],
  'docs/technicals/workflows.md': ['Workflows (technical)', 'State transitions and prerequisites per workflow; link to docs/workflows/*.md.'],
  'docs/technicals/implementation-guide.md': ['Implementation guide', 'Acceptance criteria, form specs, route map and open questions so another developer or AI agent can build a comparable feature.'],
  'docs/technicals/unknowns.md': ['Unknowns & verification gaps', 'Everything that could not be verified, and what would verify it.'],
};

export function generateDocs(project) {
  const { p } = project;
  const manifest = project.manifest();
  const routes = project.routes();
  const forms = project.forms();
  const controls = project.controls();
  const shots = project.shots();
  const obs = project.observations();
  const state = project.state();
  const network = JSON.parse(fs.readFileSync(p.network, 'utf8'));
  const written = [];
  const link = (from, rel) => relLink(from, path.join(p.dir, rel));
  const shotsOf = (r) => shots.filter((s) => s.route_id === r.id);

  // --- route inventory -------------------------------------------------
  writeGenerated(p.routeInventory, `# Route inventory — ${manifest.application}

${table(['ID', 'Route', 'Title', 'Module', 'Status', 'Access', 'Forms', 'Controls', 'Screenshot'], routes.map((r) => [
    r.id, `\`${r.template}\``, r.title || '', r.module + (r.submodule ? '/' + r.submodule : ''), r.status, r.access_status + (r.failure ? ` (${r.failure})` : ''), r.forms.length, `${r.controls.total}`,
    r.screenshots[0] ? `[view](${link(p.routeInventory, r.screenshots[0])})` : '—']))}

Statuses: discovered, queued, in_progress, explored, partial, blocked, failed, needs_verification.
Dynamic routes are shown as templates (\`:id\`); up to ${project.config().maxPerTemplate} example URLs per template are visited.`);

  // --- per-module docs (plain English) ---------------------------------
  const modules = [...new Set(routes.map((r) => r.module))].sort();
  for (const mod of modules) {
    const mr = routes.filter((r) => r.module === mod);
    const file = path.join(p.docs, 'modules', `${slug(mod)}.md`);
    const ffile = path.join(p.docs, 'forms-and-fields', `${slug(mod)}.md`);
    const modForms = forms.filter((f) => mr.some((r) => r.id === f.route_id));
    let md = `# ${mod === 'root' ? 'Home / general pages' : mod[0].toUpperCase() + mod.slice(1)}\n\n**Purpose:** This section groups ${mr.length} page(s) found under \`/${mod === 'root' ? '' : mod}\`. ${mr.filter((r) => r.status === 'explored').length} were fully opened and inspected.\n`;
    for (const r of mr) {
      const ctrl = controls[r.id] || [];
      md += `\n## ${r.title || r.template}\n\n- **Page address:** \`${r.template}\`  (route ${r.id}, status: ${r.status})\n`;
      if (r.status === 'blocked' || r.status === 'failed') { md += `- **Could not be opened:** ${r.failure || r.access_status}.\n`; r.docs = [path.relative(p.dir, file).split(path.sep).join('/')]; continue; }
      if (r.screenshots[0]) md += `- **Screenshot:** ![${esc(r.title || r.template)}](${link(file, r.screenshots[0])})\n`;
      const see = [];
      for (const t of r.tables || []) see.push(`A table${t.caption ? ` "${t.caption}"` : ''} with columns: ${t.headers.join(', ') || '(no headers)'} (${t.rows} row(s) on this view).`);
      if (r.has_search) see.push('A search box.');
      if (r.pagination?.present) see.push('Paging controls (next/previous pages).');
      for (const h of (r.headings || []).slice(0, 4)) see.push(`A heading: "${h}".`);
      md += `\n**What you can see:**\n${list(see)}\n`;
      const open = ctrl.filter((c) => c.category === 'A' && c.label).map((c) => c.label);
      const change = ctrl.filter((c) => c.category === 'B' && c.label).map((c) => c.label);
      const danger = ctrl.filter((c) => c.category === 'C' && c.label).map((c) => c.label);
      md += `\n**What you can do (safe, looking around):**\n${list([...new Set(open)])}\n`;
      if (change.length) md += `\n**Buttons that create or change information** (seen, not clicked): ${[...new Set(change)].join(', ')}.\n`;
      if (danger.length) md += `\n**Buttons with real-world effect** (seen, never clicked without approval): ${[...new Set(danger)].join(', ')}.\n`;
      const rf = modForms.filter((f) => f.route_id === r.id);
      if (rf.length) md += `\n**Forms on this page:**\n${list(rf.map((f) => `${f.label} — ${f.fields.length} field(s) ([details](${relLink(file, ffile)}#${slug(f.label + ' ' + f.id)}))`))}\n`;
      const extra = shotsOf(r).filter((s) => s.file !== r.screenshots[0]);
      if (extra.length) md += `\n**Other views captured:**\n${list(extra.map((s) => `${s.ui_state}: [screenshot](${link(file, s.file)})`))}\n`;
      if (r.notes?.length) md += `\n**Notes:** ${r.notes.slice(0, 5).join('; ')}.\n`;
      md += `\n**Not verified:** what happens after submitting a form or pressing a data-changing button.\n`;
      r.docs = [path.relative(p.dir, file).split(path.sep).join('/')];
    }
    writeGenerated(file, md);
    written.push(file);
    if (modForms.length) {
      let fm = `# Forms and fields — ${mod}\n\nFields were read from the page, not by submitting anything. "Required" comes from the page markup.\n`;
      for (const f of modForms) {
        fm += `\n## ${f.label} {#${slug(f.label + ' ' + f.id)}}\n\n- Route: ${f.route_id} · shown in: ${f.ui_state} · method: ${f.method || 'n/a'} · form id: ${f.id}\n- Submit buttons: ${f.submit.join(', ') || '(none)'}\n- Submission tested: ${f.submit_tested ? 'yes' : 'no'}\n\n${table(['Field', 'Type', 'Required', 'Default', 'Options / limits'], f.fields.map((x) => [x.label || x.name, x.type, x.required ? 'yes' : 'no', x.default ?? '', [x.options?.join(', '), x.maxlength && `max ${x.maxlength}`, x.pattern && `pattern ${x.pattern}`, x.min && `min ${x.min}`, x.max && `max ${x.max}`].filter(Boolean).join('; ')]))}\n`;
      }
      writeGenerated(ffile, fm);
    }
  }
  project.saveRoutes(routes); // persist route.docs references

  // --- technical (generated) -------------------------------------------
  writeGenerated(path.join(p.technicals, 'routes.md'), `# Routes (observed)

${table(['ID', 'Template', 'Parent', 'Found via', 'Depth', 'Auth required', 'Examples visited', 'Status'], routes.map((r) => [r.id, `\`${r.template}\``, r.parent || '—', r.discovery, r.depth, r.auth_required === null ? 'untested' : r.auth_required, r.examples.length + (r.skipped_variants ? ` (+${r.skipped_variants} sampled out)` : ''), r.status]))}

\`\`\`mermaid
flowchart TD
${routes.slice(0, 80).map((r) => `  ${r.id}["${esc(r.template).replace(/"/g, "'")}"]${r.parent ? `\n  ${r.parent} --> ${r.id}` : ''}`).join('\n')}
\`\`\``);

  writeGenerated(path.join(p.technicals, 'modules.md'), `# Modules (observed)

${modules.map((m) => `## ${m}\n${list(routes.filter((r) => r.module === m).map((r) => `${r.id} \`${r.template}\` — ${r.title || 'untitled'} (${r.status}; ${r.forms.length} form(s), ${r.controls.total} control(s))`))}`).join('\n\n')}`);

  const api = Object.entries(network.api_calls).sort((a, b) => b[1].count - a[1].count);
  writeGenerated(path.join(p.technicals, 'api-observed.md'), `# Observed XHR/fetch calls

Only requests the page itself made while being browsed (read-only crawl; non-GET requests were blocked by the mutation guard unless allow-listed). This is evidence of calls, **not** an API contract.

${table(['Call (method + origin + path template)', 'Count', 'Statuses', 'Seen on routes'], api.map(([k, v]) => [k, v.count, Object.entries(v.statuses).map(([s, n]) => `${s}×${n}`).join(' '), v.routes.join(', ')]))}

## Requests blocked by the safety guard
${table(['Route', 'Method', 'URL', 'Reason'], (network.blocked || []).map((b) => [b.route_id, b.method, b.url, b.reason || 'mutating request']))}`);

  writeGenerated(path.join(p.technicals, 'evidence-and-confidence.md'), `# Evidence and confidence

${table(['Evidence type', 'Meaning', 'Count'], Object.entries(EVIDENCE_TYPES).map(([k, v]) => [k, v, obs.filter((o) => o.type === k).length]))}

## Findings
${table(['ID', 'Type', 'Confidence', 'Claim', 'Route', 'Source'], obs.slice(0, 300).map((o) => [o.id, o.type, o.confidence, o.claim, o.route_id || '', o.source_url || '']))}${obs.length > 300 ? `\n\n_${obs.length - 300} more in evidence/observations.jsonl_` : ''}`);

  // --- limitations (generated, honest) ---------------------------------
  const cs = credentialSummary(project);
  writeGenerated(path.join(p.docs, 'limitations.md'), `# Limitations of this research

- **Read-only crawl.** No form was submitted. Requests with methods other than GET/HEAD/OPTIONS were blocked (${(network.blocked || []).length} blocked).
- **Access:** ${cs.access_type} (source: ${cs.credentials_source}; verification: ${cs.verification_status}). Only the permissions of that one account were seen; other roles are unverified.
- **Blocked/failed routes:** ${routes.filter((r) => ['blocked', 'failed'].includes(r.status)).map((r) => `${r.template} (${r.failure})`).join('; ') || 'none'}.
- **Skipped on purpose:** ${Object.entries(state.skipped || {}).map(([k, v]) => `${k}: ${v}`).join(', ') || 'nothing'}.
- **External services linked (not crawled):** ${(state.external_origins || []).join(', ') || 'none'}.
- **Links skipped as consequential:** ${(state.skipped_links || []).map((l) => `"${l.label}"`).join(', ') || 'none'}.
- **Dynamic routes** are sampled (${project.config().maxPerTemplate} example(s) per template), so individual record pages are not exhaustively covered.
- Screenshots are not pixel-redacted; review before publishing.`);

  // --- agent-owned templates -------------------------------------------
  for (const [rel, [title, hint]] of Object.entries(AGENT_DOCS)) {
    writeOwned(path.join(p.dir, rel), `# ${title} — ${manifest.application}\n\n${TODO_MARK}: ${hint} -->\n`);
  }

  // --- docs index + README ---------------------------------------------
  const rel = (f) => path.relative(p.dir, f).split(path.sep).join('/');
  const docsIndexLines = [
    '## Plain-English documentation',
    ...['product-overview', 'user-guide', 'ui-patterns', 'limitations'].map((n) => `- [${n}](${n}.md)`),
    ...modules.map((m) => `- Module: [${m}](modules/${slug(m)}.md)`),
    ...(fs.existsSync(path.join(p.docs, 'workflows')) ? fs.readdirSync(path.join(p.docs, 'workflows')).map((f) => `- Workflow: [${f}](workflows/${f})`) : []),
    '',
    '## Technical documentation',
    ...fs.readdirSync(p.technicals).map((f) => `- [${f}](technicals/${f})`),
  ];
  writeGenerated(path.join(p.docs, 'index.md'), `# ${manifest.application} — documentation index\n\n${docsIndexLines.join('\n')}`);

  // Two passes: README/reports link to each other, so link validation needs them to exist first.
  writeDashboard(project); // placeholder so the README link resolves during validation
  writeStatusFiles(project, manifest, fullAudit(project));
  const audit = fullAudit(project);
  writeStatusFiles(project, manifest, audit);
  writeDashboard(project);
  return audit;
}

function writeStatusFiles(project, manifest, audit) {
  const { p } = project;
  writeGenerated(p.readme, `# ${manifest.application} — research project

- Base URL: ${manifest.base_url} · Mode: ${manifest.mode} · Scope: ${manifest.scope}
- Created ${manifest.created_at} · tool ${manifest.tool_version}
- **Status:** ${audit.verdict}

Start here: [**interactive dashboard**](dashboard.html) · [documentation index](docs/index.md) · [route inventory](routes/route-inventory.md) · [completeness report](reports/completeness.md) · [unresolved items](reports/unresolved-items.md)

Screenshots live in \`screenshots/\` (\`all/\` primary page state, \`modules/\` tabs & sections, \`interactions/\` dialogs & responsive views); see \`screenshots/manifest.json\`.`);

  writeReports(project, audit);
}

export function writeReports(project, m = fullAudit(project)) {
  const { p } = project;
  const routes = project.routes();
  const obs = project.observations();
  const pc = (v) => (v === null ? 'n/a' : `${v}%`);
  writeGenerated(path.join(p.reports, 'completeness.md'), `# Completeness report

**Verdict:** ${m.verdict}

## Metrics
${table(['Metric', 'Value', 'Definition'], [
    ['Routes explored / total', `${m.routes.explored} / ${m.routes.total} (${pc(m.routes.route_coverage_pct)})`, DEFINITIONS.route_coverage],
    ['Accessible coverage', pc(m.routes.accessible_coverage_pct), DEFINITIONS.accessible_coverage],
    ['Partial / blocked / failed / remaining', `${m.routes.partial} / ${m.routes.blocked} / ${m.routes.failed} / ${m.routes.remaining}`, 'Tracked separately so access restrictions never disappear'],
    ['Screenshot coverage', `${m.screenshots.covered} / ${m.screenshots.required} (${pc(m.screenshots.coverage_pct)}); ${m.screenshots.total_files} files`, DEFINITIONS.screenshot_coverage],
    ['Documentation coverage', pc(m.documentation.coverage_pct), DEFINITIONS.documentation_coverage],
    ['Forms inventoried', `${m.forms.inventoried} (${m.forms.fields} fields); submit-tested: ${m.forms.submit_tested}`, DEFINITIONS.forms],
    ['Controls catalogued', `${m.controls.catalogued} (A ${m.controls.by_category.A} / B ${m.controls.by_category.B} / C ${m.controls.by_category.C}); exercised: ${m.controls.exercised}`, DEFINITIONS.controls],
    ['Workflows documented', m.workflows.documented, DEFINITIONS.workflows],
    ['Technical docs complete', `${m.technical.docs_complete} / ${m.technical.docs_total}`, DEFINITIONS.technical_docs],
    ['Evidence records', `${m.technical.observations} ${JSON.stringify(m.technical.by_evidence_type)}`, 'See technicals/evidence-and-confidence.md'],
  ])}

Sampling: ${m.routes.sampled_variants_skipped} URL variant(s) of dynamic routes were intentionally not visited (limit ${m.limits.config.maxPerTemplate} per template).

## Open issues
${list(m.issues)}

## Documentation links
${m.links.checked} relative link(s) checked, ${m.links.broken.length} broken.
${list(m.links.broken.map((b) => `${b.file} → ${b.link}`))}

## Navigation targets not explored
${list(m.unexplored_nav)}

## Run limits
Stop reason: ${m.limits.stop_reason}; queue remaining: ${m.limits.queue_remaining}; config: ${JSON.stringify(m.limits.config)}.`);

  const grouped = {};
  for (const o of obs) (grouped[o.type] ||= []).push(o);
  writeGenerated(path.join(p.reports, 'findings.md'), `# Findings\n\n${Object.keys(EVIDENCE_TYPES).filter((t) => grouped[t]).map((t) => `## ${EVIDENCE_TYPES[t]} (${t})\n${list(grouped[t].slice(0, 100).map((o) => `[${o.confidence}] ${o.claim}${o.route_id ? ` — ${o.route_id}` : ''}${o.source_url ? ` (${o.source_url})` : ''}`))}`).join('\n\n') || '_No findings recorded._'}`);

  const todos = scanTodos(p.dir);
  writeGenerated(path.join(p.reports, 'unresolved-items.md'), `# Unresolved items

## Routes needing attention
${list(routes.filter((r) => ['partial', 'failed', 'blocked', 'needs_verification', 'discovered', 'queued'].includes(r.status)).map((r) => `${r.id} \`${r.template}\` — ${r.status}${r.failure ? `: ${r.failure}` : ''}${r.notes?.length ? ` (${r.notes.slice(0, 2).join('; ')})` : ''}`))}

## Documentation still to be written
${list(todos.map((t) => `${t.file}:${t.line} — ${t.text}`))}

## Unverified (not tested)
- Form submission behaviour, validation messages from the server, success/error states.
- Data-changing (B) and consequential (C) controls were not clicked.
- Other user roles and permissions.`);
}
