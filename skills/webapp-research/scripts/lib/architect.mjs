// Architecture designer (deterministic starting point). Builds a PROPOSED data model, API outline and a
// baseline architecture diagram from what was observed (forms, tables, routes, form actions, XHR calls,
// detected stack) and, when a repo scan exists, from the code. Everything inferred is labelled PROPOSED or
// INFERRED; the solution-architect role refines it into docs/technicals/architecture-proposal.md.
import fs from 'node:fs';
import path from 'node:path';
import { readJson, writeText } from './util.mjs';
import { detectStack, newTechAcc } from './techstack.mjs';

const GEN = '<!-- generated:webapp-research (rewritten by `architect`; the solution-architect writes docs/technicals/architecture-proposal.md) -->';
export const singular = (w) => (/ies$/i.test(w) ? w.replace(/ies$/i, 'y') : /(ss|us)$/i.test(w) ? w : /(ses|xes|zes|ches|shes)$/i.test(w) ? w.replace(/es$/i, '') : w.replace(/s$/i, ''));
const pascal = (s) => String(s).replace(/[^A-Za-z0-9]+/g, ' ').trim().split(' ').filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join('');
const snake = (s) => String(s).replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase();
const SEARCHY = /^(q|query|search|s|filter|keyword|username|user|email_or_username|password|pw|remember|_token|csrf)$/i;

const typeOf = (f) => {
  const t = f.type;
  if (['email', 'tel', 'url', 'text', 'search', 'password', 'color'].includes(t)) return 'string';
  if (['textarea'].includes(t)) return 'text';
  if (['number', 'range'].includes(t)) return 'integer';
  if (['date'].includes(t)) return 'date';
  if (['datetime-local', 'time', 'month', 'week'].includes(t)) return 'datetime';
  if (['checkbox'].includes(t)) return 'boolean';
  if (['select', 'radio', 'select-multiple'].includes(t)) return f.options?.length ? 'enum' : 'string';
  if (['file'].includes(t)) return 'file';
  return 'string';
};

export function inferModel(project) {
  const routes = project.routes();
  const forms = project.forms();
  const entities = new Map();
  const ensure = (name, source) => { if (!entities.has(name)) entities.set(name, { name, table: snake(name) + 's', columns: new Map(), sources: new Set(), from: 'observed UI' }); entities.get(name).sources.add(source); return entities.get(name); };

  for (const f of forms) {
    if (f.kind === 'action' || /^get$/i.test(f.method || '') || !f.fields.length) continue;
    const real = f.fields.filter((x) => !SEARCHY.test(x.name || '') && !SEARCHY.test(snake(x.label || '')));
    if (real.length < 1 || (f.fields.some((x) => x.type === 'password') && real.length <= 1)) continue; // login-like
    const route = routes.find((r) => r.id === f.route_id);
    const base = route && route.module !== 'root' ? route.module : f.label;
    const e = ensure(pascal(singular(base)), `${f.route_id} ${f.label}`);
    for (const x of real) {
      const n = snake(x.label || x.name);
      if (!n) continue;
      const prev = e.columns.get(n) || {};
      e.columns.set(n, { name: n, type: typeOf(x), nullable: !(x.required || prev.nullable === false), options: x.options && x.options.length ? x.options : prev.options, source: 'form field', max: x.maxlength || prev.max });
    }
  }
  for (const r of routes) for (const t of r.tables || []) {
    const e = [...entities.values()].find((x) => x.table === snake(r.module) || x.name === pascal(singular(r.module)));
    if (!e) continue;
    for (const h of t.headers) { const n = snake(h); if (n && !/^(actions?|#|select)$/.test(n) && !e.columns.has(n)) e.columns.set(n, { name: n, type: 'string', nullable: true, source: 'table column', note: 'type unknown' }); }
  }

  // code wins when a repo scan exists
  const scan = readJson(project.p.repoScan, null);
  if (scan) for (const c of scan.entities || []) {
    const name = pascal(singular(c.name));
    const e = entities.get(name) || ensure(name, `code ${c.source}`);
    e.from = 'source code';
    e.table = c.name;
    e.columns = new Map(c.columns.map((col) => [col.name, { name: col.name, type: col.type, nullable: !!col.nullable, fk: col.fk, source: 'code' }]));
  }

  const names = [...entities.keys()];
  const relations = [];
  for (const e of entities.values()) for (const c of e.columns.values()) {
    const base = c.name.replace(/_id$/, '');
    const target = names.find((n) => snake(n) === base);
    if (target && target !== e.name && (c.name.endsWith('_id') || c.type === 'enum' || c.type === 'string' || c.fk)) { relations.push({ from: e.name, to: target, via: c.name, kind: 'belongs to (inferred)' }); c.fk = snake(target); }
  }
  return { entities: [...entities.values()].map((e) => ({ ...e, columns: [...e.columns.values()], sources: [...e.sources] })), relations };
}

export function inferEndpoints(project, model) {
  const routes = project.routes().filter((r) => ['explored', 'partial'].includes(r.status));
  const forms = project.forms();
  const network = readJson(project.p.network, { api_calls: {} });
  const rows = [];
  for (const r of routes) rows.push({ method: 'GET', path: r.template, source: `observed page ${r.id}`, note: r.title || '' });
  for (const f of forms) if (f.action_template && f.method) rows.push({ method: f.method, path: f.action_template.replace(/^https?:\/\/[^/]+/, ''), source: `observed form action ${f.id}${f.kind === 'action' ? ' (never submitted)' : ''}`, note: f.label });
  for (const [k, v] of Object.entries(network.api_calls || {})) { const [m, rest] = k.split(' '); rows.push({ method: m, path: rest.replace(/^https?:\/\/[^/]+/, ''), source: `observed XHR/fetch ×${v.count}`, note: Object.keys(v.statuses).join('/') }); }
  const have = new Set(rows.map((r) => `${r.method} ${r.path}`));
  for (const e of model.entities) {
    const p = '/' + e.table;
    for (const [m, pp, note] of [['GET', p, 'list'], ['GET', `${p}/:id`, 'detail'], ['POST', p, 'create'], ['PUT', `${p}/:id`, 'update'], ['DELETE', `${p}/:id`, 'delete (needs approval flow)']]) if (!have.has(`${m} ${pp}`)) rows.push({ method: m, path: pp, source: 'PROPOSED (CRUD convention)', note: `${e.name} ${note}` });
  }
  const seen = new Set();
  return rows.filter((r) => { const k = `${r.method} ${r.path} ${r.source.split(' ')[0]}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

const SQLISH = { string: 'varchar(255)', text: 'text', integer: 'integer', date: 'date', datetime: 'timestamp', boolean: 'boolean', enum: 'varchar(40)', file: 'varchar(255) -- path/URL' };
const laravelType = { string: 'string', text: 'text', integer: 'integer', date: 'date', datetime: 'dateTime', boolean: 'boolean', enum: 'string', file: 'string' };
const prismaType = { string: 'String', text: 'String', integer: 'Int', date: 'DateTime', datetime: 'DateTime', boolean: 'Boolean', enum: 'String', file: 'String' };
const djangoType = { string: 'CharField(max_length=255', text: 'TextField(', integer: 'IntegerField(', date: 'DateField(', datetime: 'DateTimeField(', boolean: 'BooleanField(', enum: 'CharField(max_length=40', file: 'FileField(' };

function skeleton(stack, model) {
  const out = [];
  for (const e of model.entities.slice(0, 25)) {
    const cols = e.columns.filter((c) => c.name !== 'id');
    if (stack === 'laravel') out.push(`Schema::create('${e.table}', function (Blueprint $table) {\n    $table->id();\n${cols.map((c) => `    $table->${c.fk ? 'foreignId' : laravelType[c.type] || 'string'}('${c.fk ? c.name.replace(/_id$/, '') + '_id' : c.name}')${c.nullable ? '->nullable()' : ''}${c.fk ? `->constrained('${c.fk}s')` : ''};`).join('\n')}\n    $table->timestamps();\n});`);
    else if (stack === 'prisma') out.push(`model ${e.name} {\n  id Int @id @default(autoincrement())\n${cols.map((c) => `  ${c.name} ${prismaType[c.type] || 'String'}${c.nullable ? '?' : ''}`).join('\n')}\n  createdAt DateTime @default(now())\n}`);
    else if (stack === 'django') out.push(`class ${e.name}(models.Model):\n${cols.map((c) => `    ${c.name} = models.${djangoType[c.type] || 'CharField(max_length=255'}${c.nullable ? ', null=True, blank=True' : ''})`).join('\n') || '    pass'}`);
    else out.push(`${e.table}(\n  id integer primary key,\n${cols.map((c) => `  ${c.name} ${SQLISH[c.type] || 'varchar(255)'}${c.nullable ? '' : ' not null'}`).join(',\n')},\n  created_at timestamp\n);`);
  }
  return { lang: { laravel: 'php', prisma: 'prisma', django: 'python' }[stack] || 'sql', code: out.join('\n\n') };
}

const esc = (s) => String(s ?? '').replace(/\|/g, '\\|');
const tbl = (head, rows) => (rows.length ? `| ${head.join(' | ')} |\n|${head.map(() => '---').join('|')}|\n${rows.map((r) => `| ${r.map(esc).join(' | ')} |`).join('\n')}` : '_None._');

/** Writes proposed-schema.md and architecture-baseline.md (generated). Returns counts. */
export function proposeArchitecture(project, { stack = 'auto' } = {}) {
  const model = inferModel(project);
  const endpoints = inferEndpoints(project, model);
  const tech = readJson(project.p.techStack, null) || newTechAcc();
  const detections = detectStack(tech).filter((d) => d.confidence !== 'low');
  const scan = readJson(project.p.repoScan, null);
  const names = [...(scan?.stack || []).map((s) => s.name), ...detections.map((d) => d.name)];
  const chosen = stack !== 'auto' ? stack : /Laravel/i.test(names.join()) ? 'laravel' : /Prisma/.test(names.join()) ? 'prisma' : /Django/.test(names.join()) ? 'django' : 'sql';
  const sk = skeleton(chosen, model);
  const routes = project.routes();
  const modules = [...new Set(routes.filter((r) => r.status !== 'failed').map((r) => r.module).filter((m) => m !== 'root'))];
  const ext = project.state().external_origins || [];
  const app = project.manifest().application;
  const idn = (s) => String(s).replace(/\W/g, '_');

  const er = [];
  for (const e of model.entities) er.push(`  ${idn(e.name)} {\n    int id\n${e.columns.slice(0, 14).map((c) => `    ${idn(c.type)} ${idn(c.name)}`).join('\n')}\n  }`);
  for (const r of model.relations) er.push(`  ${idn(r.to)} ||--o{ ${idn(r.from)} : "${idn(r.via)}"`);

  const schemaMd = `${GEN}

# Proposed data model & API outline — ${app}

> **PROPOSED, not confirmed.** Entities and columns are inferred from form fields, table headers${scan ? ' and the scanned source code' : ''}. Types, constraints and relations the UI cannot show (indexes, uniqueness, soft deletes, audit columns, multi-tenancy) are unknown. Validate with the team or source before building.

## Entities (${model.entities.length})
${model.entities.map((e) => `### ${e.name} (table \`${e.table}\`, basis: ${e.from})\nSources: ${e.sources.join('; ') || 'n/a'}\n\n${tbl(['Column', 'Type', 'Nullable', 'Notes'], [['id', 'integer (pk)', 'no', 'assumed'], ...e.columns.map((c) => [c.name, c.type + (c.options ? ` (${c.options.slice(0, 6).join(' | ')}${c.options.length > 6 ? ' …' : ''})` : ''), c.nullable ? 'yes' : 'no', [c.source, c.fk && `fk → ${c.fk}`, c.note, c.max && `max ${c.max}`].filter(Boolean).join('; ')]), ['created_at / updated_at', 'timestamp', 'no', 'assumed']])}`).join('\n\n') || '_No data-entry forms or tables were inventoried, so no entities could be inferred. Crawl with --probe-openers or use repo-scan._'}

## Relations (inferred)
${tbl(['From', 'To', 'Via column', 'Kind'], model.relations.map((r) => [r.from, r.to, r.via, r.kind]))}

\`\`\`mermaid
erDiagram
${er.join('\n') || '  EMPTY { string none }'}
\`\`\`

## API outline
Rows marked *observed* were seen in the app; *PROPOSED* rows follow a CRUD convention and are only a starting point.

${tbl(['Method', 'Path', 'Basis', 'Note'], endpoints.slice(0, 200).map((e) => [e.method, e.path, e.source, e.note]))}

## Starter schema (${chosen}) — PROPOSED
\`\`\`${sk.lang}
${sk.code || '-- nothing to generate'}
\`\`\`
`;
  writeText(path.join(project.p.technicals, 'proposed-schema.md'), schemaMd);

  const mermaid = `flowchart LR
  U([Users / browsers]) --> FE[Web UI${detections.filter((d) => /frontend|ui library/.test(d.category)).length ? ': ' + detections.filter((d) => /frontend/.test(d.category)).map((d) => d.name).join(', ') : ''}]
  FE --> BE[Application / API${detections.filter((d) => /backend/.test(d.category)).length ? ': ' + detections.filter((d) => /backend/.test(d.category)).map((d) => d.name).join(', ') : ' (stack unknown)'}]
  BE --> DB[(Database - engine unknown)]
${modules.slice(0, 12).map((m) => `  BE --- M_${idn(m)}[${m} module]`).join('\n')}
${ext.slice(0, 6).map((o, i) => `  BE -.-> X${i}[[${new URL(o).host}]]`).join('\n')}`;
  const baseline = `${GEN}

# Baseline architecture (inferred) — ${app}

Evidence: observed modules/routes, detected technologies and external origins. **Inferred** — the back end, database and deployment cannot be seen from the browser. Use this as the starting point for \`architecture-proposal.md\`.

\`\`\`mermaid
${mermaid}
\`\`\`

## Observed building blocks
- Modules (from routes): ${modules.join(', ') || 'n/a'}
- Detected technologies: ${detections.map((d) => `${d.name} (${d.confidence})`).join(', ') || 'none with confidence'}
- External origins linked: ${ext.join(', ') || 'none'}
- Observed API calls: ${Object.keys(readJson(project.p.network, { api_calls: {} }).api_calls || {}).length}
${scan ? `- Source scan: ${scan.stack.map((s) => s.name).join(', ')}; ${scan.routes.length} route(s), ${scan.entities.length} entity(ies) in code` : '- No source scan attached (run `repo-scan` if code is available).'}

## Open architecture questions
- Authentication/authorization model and roles (only the tested account was seen)
- Multi-tenancy, data retention and audit requirements
- Background jobs, notifications and integrations behind the UI
- Hosting, scaling and environments
`;
  writeText(path.join(project.p.technicals, 'architecture-baseline.md'), baseline);
  return { entities: model.entities.length, relations: model.relations.length, endpoints: endpoints.length, stack: chosen };
}
