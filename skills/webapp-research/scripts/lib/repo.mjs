// Local repository / folder analysis: stack from manifests, routes, data model (migrations, Prisma, SQL, Django,
// Rails schema), environment variable NAMES, tooling and a tree summary. Strictly read-only; secrets are never
// read: `.env` files, keys and credential files are skipped (only `.env.example`-style templates are parsed,
// and only for variable names). Extraction is heuristic regex, so results are `public_source` evidence of what
// the code says, not proof of runtime behaviour.
import fs from 'node:fs';
import path from 'node:path';
import { readJson } from './util.mjs';

const IGNORE_DIRS = new Set(['node_modules', 'vendor', '.git', 'dist', 'build', '.next', '.nuxt', '.output', 'coverage', '__pycache__', '.venv', 'venv', 'env', '.idea', '.vscode', '.webapplens', 'target', 'bin', 'obj', '.gradle', '.cache', 'storage', 'public/build']);
const SECRET_FILE = /(^\.env(\.|$)(?!example|sample|template|dist)|\.pem$|\.key$|\.p12$|\.pfx$|id_rsa|id_ed25519|credentials|secrets?\.(json|ya?ml)$|\.keystore$)/i;
const ENV_TEMPLATE = /^\.env\.(example|sample|template|dist)$/i;
const MAX_FILES = 20000;
const MAX_READ = 300 * 1024;

function walk(root) {
  const files = [];
  const stack = [root];
  let truncated = false;
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { if (!IGNORE_DIRS.has(e.name) && !e.name.startsWith('.cache')) stack.push(full); continue; }
      if (!e.isFile()) continue;
      if (files.length >= MAX_FILES) { truncated = true; break; }
      files.push(full);
    }
  }
  return { files, truncated };
}

const read = (f) => {
  try {
    const st = fs.statSync(f);
    if (st.size > MAX_READ * 4) return '';
    return fs.readFileSync(f, 'utf8').slice(0, MAX_READ);
  } catch { return ''; }
};

const DEP_MAP = {
  react: ['React', 'frontend framework'], 'react-dom': ['React', 'frontend framework'], next: ['Next.js', 'frontend framework'], vue: ['Vue.js', 'frontend framework'], nuxt: ['Nuxt', 'frontend framework'],
  '@angular/core': ['Angular', 'frontend framework'], svelte: ['Svelte', 'frontend framework'], '@sveltejs/kit': ['SvelteKit', 'frontend framework'], '@remix-run/react': ['Remix', 'frontend framework'],
  alpinejs: ['Alpine.js', 'frontend framework'], htmx: ['htmx', 'frontend framework'], '@inertiajs/react': ['Inertia.js', 'fullstack'], '@inertiajs/vue3': ['Inertia.js', 'fullstack'],
  express: ['Express', 'backend framework'], '@nestjs/core': ['NestJS', 'backend framework'], fastify: ['Fastify', 'backend framework'], koa: ['Koa', 'backend framework'], hono: ['Hono', 'backend framework'],
  tailwindcss: ['Tailwind CSS', 'ui'], bootstrap: ['Bootstrap', 'ui'], '@mui/material': ['Material UI', 'ui'], antd: ['Ant Design', 'ui'], '@chakra-ui/react': ['Chakra UI', 'ui'], 'shadcn-ui': ['shadcn/ui', 'ui'],
  prisma: ['Prisma', 'orm'], '@prisma/client': ['Prisma', 'orm'], typeorm: ['TypeORM', 'orm'], sequelize: ['Sequelize', 'orm'], mongoose: ['Mongoose (MongoDB)', 'orm'], drizzle: ['Drizzle ORM', 'orm'], 'drizzle-orm': ['Drizzle ORM', 'orm'],
  pg: ['PostgreSQL client', 'database'], mysql2: ['MySQL client', 'database'], redis: ['Redis client', 'database'], ioredis: ['Redis client', 'database'],
  jest: ['Jest', 'testing'], vitest: ['Vitest', 'testing'], playwright: ['Playwright', 'testing'], cypress: ['Cypress', 'testing'], '@playwright/test': ['Playwright', 'testing'],
  vite: ['Vite', 'build'], webpack: ['Webpack', 'build'], typescript: ['TypeScript', 'language'], 'socket.io': ['Socket.IO', 'realtime'], graphql: ['GraphQL', 'api'], '@apollo/client': ['Apollo Client', 'api'], trpc: ['tRPC', 'api'],
  'laravel/framework': ['Laravel', 'backend framework'], 'livewire/livewire': ['Livewire', 'fullstack'], 'inertiajs/inertia-laravel': ['Inertia.js', 'fullstack'], 'filament/filament': ['Filament', 'admin panel'],
  'laravel/sanctum': ['Laravel Sanctum', 'auth'], 'laravel/passport': ['Laravel Passport', 'auth'], 'spatie/laravel-permission': ['Spatie Permission', 'auth'], 'phpunit/phpunit': ['PHPUnit', 'testing'], 'pestphp/pest': ['Pest', 'testing'],
  'symfony/framework-bundle': ['Symfony', 'backend framework'], django: ['Django', 'backend framework'], flask: ['Flask', 'backend framework'], fastapi: ['FastAPI', 'backend framework'], sqlalchemy: ['SQLAlchemy', 'orm'],
  rails: ['Ruby on Rails', 'backend framework'], 'spring-boot-starter-web': ['Spring Boot', 'backend framework'], 'Microsoft.AspNetCore.App': ['ASP.NET Core', 'backend framework'],
};

function depsFrom(root, files) {
  const deps = [];
  const add = (name, version, source) => deps.push({ name, version: String(version || '').slice(0, 30), source });
  for (const f of files) {
    const base = path.basename(f);
    const rel = path.relative(root, f);
    if (rel.split(path.sep).length > 3) continue; // manifests in the root and first-level apps only
    if (base === 'package.json') { const j = readJson(f, null); if (j) for (const k of ['dependencies', 'devDependencies']) for (const [n, v] of Object.entries(j[k] || {})) add(n, v, rel); }
    else if (base === 'composer.json') { const j = readJson(f, null); if (j) for (const k of ['require', 'require-dev']) for (const [n, v] of Object.entries(j[k] || {})) add(n, v, rel); }
    else if (base === 'requirements.txt') for (const l of read(f).split('\n')) { const m = l.trim().match(/^([A-Za-z0-9_.-]+)\s*(?:[=<>~!]=?\s*([\w.*-]+))?/); if (m && !l.startsWith('#')) add(m[1].toLowerCase(), m[2], rel); }
    else if (base === 'pyproject.toml') for (const m of read(f).matchAll(/^\s*["']?([A-Za-z0-9_.-]+)["']?\s*=\s*["'][^"']*["']/gm)) add(m[1].toLowerCase(), '', rel);
    else if (base === 'Gemfile') for (const m of read(f).matchAll(/^\s*gem\s+['"]([\w.-]+)['"](?:\s*,\s*['"]([^'"]+)['"])?/gm)) add(m[1], m[2], rel);
    else if (base === 'go.mod') for (const m of read(f).matchAll(/^\s*([\w./-]+)\s+v([\w.+-]+)/gm)) add(m[1], m[2], rel);
    else if (base === 'pom.xml') for (const m of read(f).matchAll(/<artifactId>([\w.-]+)<\/artifactId>/g)) add(m[1], '', rel);
    else if (/\.csproj$/.test(base)) for (const m of read(f).matchAll(/<PackageReference\s+Include="([\w.]+)"(?:\s+Version="([\w.*-]+)")?/g)) add(m[1], m[2], rel);
  }
  return deps;
}

function stackFrom(deps, files, root) {
  const found = new Map();
  for (const d of deps) {
    const hit = DEP_MAP[d.name];
    if (hit && !found.has(hit[0])) found.set(hit[0], { name: hit[0], category: hit[1], evidence: `${d.name}${d.version ? '@' + d.version : ''} in ${d.source}`, version: d.version });
  }
  const has = (re) => files.some((f) => re.test(path.relative(root, f).split(path.sep).join('/')));
  if (has(/^artisan$/) && !found.has('Laravel')) found.set('Laravel', { name: 'Laravel', category: 'backend framework', evidence: 'artisan file present' });
  if (has(/(^|\/)manage\.py$/) && !found.has('Django')) found.set('Django', { name: 'Django', category: 'backend framework', evidence: 'manage.py present' });
  if (has(/(^|\/)config\/routes\.rb$/) && !found.has('Ruby on Rails')) found.set('Ruby on Rails', { name: 'Ruby on Rails', category: 'backend framework', evidence: 'config/routes.rb present' });
  if (has(/(^|\/)Dockerfile$|docker-compose\.ya?ml$/)) found.set('Docker', { name: 'Docker', category: 'tooling', evidence: 'Dockerfile / compose file present' });
  if (has(/^\.github\/workflows\/.+\.ya?ml$/)) found.set('GitHub Actions', { name: 'GitHub Actions', category: 'ci', evidence: '.github/workflows present' });
  if (has(/^\.gitlab-ci\.yml$/)) found.set('GitLab CI', { name: 'GitLab CI', category: 'ci', evidence: '.gitlab-ci.yml present' });
  if (has(/(^|\/)prisma\/schema\.prisma$/)) found.set('Prisma', { name: 'Prisma', category: 'orm', evidence: 'schema.prisma present' });
  return [...found.values()];
}

const clean = (s) => s.replace(/['"`]/g, '');

function routesFrom(root, files) {
  const out = [];
  const rel = (f) => path.relative(root, f).split(path.sep).join('/');
  for (const f of files) {
    const r = rel(f);
    if (/^routes\/(web|api)\.php$/.test(r)) {
      for (const m of read(f).matchAll(/Route::(get|post|put|patch|delete|any|resource|apiResource|view|match)\(\s*(?:\[[^\]]*\]\s*,\s*)?['"]([^'"]+)['"](?:\s*,\s*([^)]*))?/g)) out.push({ method: m[1].toUpperCase(), path: '/' + m[2].replace(/^\//, ''), handler: (m[3] || '').replace(/\s+/g, ' ').trim().slice(0, 70), file: r, framework: 'Laravel' });
    } else if (/\.(js|ts|mjs|cjs)$/.test(r) && !/\.(test|spec)\./.test(r) && !/\.d\.ts$/.test(r)) {
      const t = read(f);
      if (/express|router|fastify|hono|koa/i.test(t)) for (const m of t.matchAll(/\b(?:app|router|server|api|fastify)\.(get|post|put|patch|delete|all)\(\s*['"`]([^'"`]+)['"`]/g)) out.push({ method: m[1].toUpperCase(), path: m[2], handler: '', file: r, framework: 'Node' });
      for (const m of t.matchAll(/\bpath\s*[:=]\s*['"]([^'"]+)['"]/g)) if (/router|Route|routes/i.test(t.slice(Math.max(0, m.index - 300), m.index))) out.push({ method: 'PAGE', path: m[1].startsWith('/') ? m[1] : '/' + m[1], handler: '', file: r, framework: 'SPA router' });
    } else if (/(^|\/)urls\.py$/.test(r)) {
      for (const m of read(f).matchAll(/\b(?:re_)?path\(\s*r?['"]([^'"]*)['"]\s*,\s*([\w.]+)/g)) out.push({ method: 'ANY', path: '/' + m[1], handler: m[2], file: r, framework: 'Django' });
    } else if (/(^|\/)config\/routes\.rb$/.test(r)) {
      for (const m of read(f).matchAll(/^\s*(resources?|get|post|put|patch|delete|root)\s+:?['"]?([\w/:#-]+)/gm)) out.push({ method: m[1].toUpperCase(), path: '/' + m[2].replace(/^\//, ''), handler: '', file: r, framework: 'Rails' });
    }
    const page = r.match(/^(?:src\/)?pages\/(.+)\.(tsx|jsx|js|ts|vue)$/);
    if (page && !/^_|api\//.test(page[1])) out.push({ method: 'PAGE', path: '/' + page[1].replace(/index$/, '').replace(/\[(\w+)\]/g, ':$1').replace(/\/$/, ''), handler: '', file: r, framework: 'file-based pages' });
    const app = r.match(/^(?:src\/)?app\/(.+\/)?page\.(tsx|jsx|js|ts)$/);
    if (app) out.push({ method: 'PAGE', path: '/' + (app[1] || '').replace(/\[(\w+)\]/g, ':$1').replace(/\/$/, ''), handler: '', file: r, framework: 'Next app router' });
    const api = r.match(/^(?:src\/)?(?:pages\/api|app\/api)\/(.+?)(?:\/route)?\.(ts|js)$/);
    if (api) out.push({ method: 'API', path: '/api/' + api[1].replace(/\[(\w+)\]/g, ':$1'), handler: '', file: r, framework: 'Next API' });
  }
  const seen = new Set();
  return out.filter((r) => { const k = `${r.method} ${r.path} ${r.file}`; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 600);
}

function entitiesFrom(root, files) {
  const ents = [];
  const rel = (f) => path.relative(root, f).split(path.sep).join('/');
  for (const f of files) {
    const r = rel(f);
    const t = /(migrations|schema|models|entities|prisma|\.sql$)/i.test(r) ? read(f) : '';
    if (!t) continue;
    if (/database\/migrations\/.+\.php$/.test(r)) {
      for (const m of t.matchAll(/Schema::(?:create|table)\(\s*['"](\w+)['"][\s\S]*?function[\s\S]*?\{([\s\S]*?)\n\s*\}\s*\);/g)) {
        const cols = [];
        for (const c of m[2].matchAll(/\$table->(\w+)\(\s*(?:['"](\w+)['"])?([^;]*?);/g)) {
          const type = c[1];
          if (['timestamps', 'softDeletes', 'rememberToken', 'id'].includes(type) && !c[2]) { cols.push({ name: type === 'id' ? 'id' : type, type: type === 'id' ? 'bigint (pk)' : 'timestamp' }); continue; }
          if (!c[2] || ['index', 'unique', 'primary', 'foreign', 'dropColumn'].includes(type)) continue;
          cols.push({ name: c[2], type: type === 'foreignId' ? 'bigint (fk)' : type, nullable: /nullable\(/.test(c[3]) || undefined, fk: (c[3].match(/constrained\(\s*['"](\w+)['"]/) || [])[1] || (type === 'foreignId' ? c[2].replace(/_id$/, '') : undefined) });
        }
        ents.push({ name: m[1], source: r, kind: 'laravel migration', columns: cols });
      }
    } else if (/schema\.prisma$/.test(r)) {
      for (const m of t.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
        const cols = [];
        for (const l of m[2].split('\n')) { const c = l.trim().match(/^(\w+)\s+(\w+)(\[\])?(\?)?\s*(.*)$/); if (c && !l.trim().startsWith('@@') && !l.trim().startsWith('//')) cols.push({ name: c[1], type: c[2] + (c[3] || ''), nullable: !!c[4] || undefined, rel: /@relation/.test(c[5]) ? c[2] : undefined, pk: /@id/.test(c[5]) || undefined }); }
        ents.push({ name: m[1], source: r, kind: 'prisma model', columns: cols });
      }
    } else if (/\.sql$/i.test(r)) {
      for (const m of t.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"\[]?(\w+)[`"\]]?\s*\(([\s\S]*?)\)\s*(?:ENGINE|;|$)/gi)) {
        const cols = [];
        for (const l of m[2].split(/,\s*\n/)) { const c = l.trim().match(/^[`"\[]?(\w+)[`"\]]?\s+([A-Za-z]+(?:\([\d, ]+\))?)(.*)$/); if (c && !/^(PRIMARY|KEY|UNIQUE|CONSTRAINT|FOREIGN|INDEX)$/i.test(c[1])) cols.push({ name: c[1], type: c[2], nullable: !/NOT NULL/i.test(c[3]) || undefined, pk: /PRIMARY KEY/i.test(c[3]) || undefined }); }
        ents.push({ name: m[1], source: r, kind: 'sql', columns: cols });
      }
    } else if (/models(\.py|\/.+\.py)$/.test(r)) {
      for (const m of t.matchAll(/^class\s+(\w+)\(([^)]*Model[^)]*)\):([\s\S]*?)(?=^class\s|\Z)/gm)) {
        const cols = [];
        for (const c of m[3].matchAll(/^\s{4}(\w+)\s*=\s*models\.(\w+)\(([^)]*)\)/gm)) cols.push({ name: c[1], type: c[2], fk: /ForeignKey|OneToOne/.test(c[2]) ? (c[3].match(/['"]?(\w+)['"]?/) || [])[1] : undefined, nullable: /null=True/.test(c[3]) || undefined });
        ents.push({ name: m[1], source: r, kind: 'django model', columns: cols });
      }
    } else if (/db\/schema\.rb$/.test(r)) {
      for (const m of t.matchAll(/create_table\s+"(\w+)"[^\n]*do\s*\|t\|([\s\S]*?)\n\s*end/g)) {
        const cols = [];
        for (const c of m[2].matchAll(/t\.(\w+)\s+"(\w+)"([^\n]*)/g)) cols.push({ name: c[2], type: c[1], nullable: !/null:\s*false/.test(c[3]) || undefined, fk: c[1] === 'references' ? c[2] : undefined });
        ents.push({ name: m[1], source: r, kind: 'rails schema', columns: cols });
      }
    }
  }
  // Eloquent relationships give explicit relations
  const rels = [];
  for (const f of files) {
    if (!/app\/Models\/\w+\.php$/.test(rel(f))) continue;
    const model = path.basename(f, '.php');
    for (const m of read(f).matchAll(/function\s+(\w+)\s*\([^)]*\)[^{]*\{\s*return\s+\$this->(hasMany|belongsTo|hasOne|belongsToMany|morphMany)\(\s*(\w+)::class/g)) rels.push({ from: model, kind: m[2], to: m[3], via: m[1] });
  }
  return { entities: ents.slice(0, 300), relations: rels.slice(0, 300) };
}

function envNames(root, files) {
  const names = [];
  for (const f of files) {
    if (!ENV_TEMPLATE.test(path.basename(f))) continue;
    for (const l of read(f).split('\n')) { const m = l.match(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=/); if (m) names.push({ name: m[1], file: path.relative(root, f).split(path.sep).join('/') }); }
  }
  return names;
}

export function scanRepo(dir, { name } = {}) {
  const root = path.resolve(dir);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new Error(`Not a folder: ${dir}`);
  const all = walk(root);
  let skippedSecrets = 0;
  const files = all.files.filter((f) => { if (SECRET_FILE.test(path.basename(f))) { skippedSecrets++; return false; } return true; });
  const ext = {};
  let bytes = 0;
  for (const f of files) { const e = path.extname(f).toLowerCase() || '(none)'; ext[e] = (ext[e] || 0) + 1; try { bytes += fs.statSync(f).size; } catch { /* ignore */ } }
  const tops = {};
  for (const f of files) { const p = path.relative(root, f).split(path.sep); const k = p.length > 1 ? p[0] : '(root files)'; tops[k] = (tops[k] || 0) + 1; }
  const deps = depsFrom(root, files);
  const pkg = readJson(path.join(root, 'package.json'), null);
  const rel = (re) => files.some((f) => re.test(path.relative(root, f).split(path.sep).join('/')));
  const data = entitiesFrom(root, files);
  let todo = 0;
  for (const f of files.filter((x) => /\.(js|ts|tsx|jsx|php|py|rb|go|java|cs|vue|svelte)$/.test(x)).slice(0, 2500)) todo += (read(f).match(/\b(TODO|FIXME|HACK)\b/g) || []).length;
  const result = {
    name: name || path.basename(root),
    scanned_at: new Date().toISOString(),
    root_name: path.basename(root),
    totals: { files: files.length, bytes, by_extension: Object.fromEntries(Object.entries(ext).sort((a, b) => b[1] - a[1]).slice(0, 15)), top_level: Object.fromEntries(Object.entries(tops).sort((a, b) => b[1] - a[1]).slice(0, 20)), truncated: all.truncated, secret_files_skipped: skippedSecrets },
    stack: stackFrom(deps, files, root),
    dependencies: deps.slice(0, 120),
    scripts: pkg?.scripts || {},
    routes: routesFrom(root, files),
    entities: data.entities,
    relations: data.relations,
    env_vars: envNames(root, files),
    tooling: { tests: rel(/(^|\/)(tests?|__tests__|spec)\//), docs: rel(/^(docs?|documentation)\//), readme: rel(/^README(\.md)?$/i), docker: rel(/Dockerfile|docker-compose/), ci: rel(/^\.github\/workflows\/|^\.gitlab-ci\.yml$|^Jenkinsfile$/) , license: rel(/^LICENSE/i), todo_markers: todo },
    limits: 'Heuristic regex extraction over source files; dynamic routes, generated code and runtime configuration are not evaluated. .env files and key/credential files are never read; only variable NAMES from template files are listed.',
  };
  return result;
}

const esc = (s) => String(s ?? '').replace(/\|/g, '\\|');
const tbl = (head, rows) => (rows.length ? `| ${head.join(' | ')} |\n|${head.map(() => '---').join('|')}|\n${rows.map((r) => `| ${r.map(esc).join(' | ')} |`).join('\n')}` : '_None found._');
const idn = (s) => String(s).replace(/\W/g, '_');

export function renderRepoDocs(scan) {
  const overview = `# Repository overview — ${scan.name}

Source: local folder scan (${scan.totals.files} files, ${(scan.totals.bytes / 1024 / 1024).toFixed(1)} MB${scan.totals.truncated ? ', truncated at the file cap' : ''}). Evidence type: **public_source** (what the code says, not what runs). ${scan.limits}

## Stack (from manifests and files)
${tbl(['Technology', 'Category', 'Evidence'], scan.stack.map((s) => [s.name, s.category, s.evidence]))}

## Structure
${tbl(['Top-level folder', 'Files'], Object.entries(scan.totals.top_level))}

File types: ${Object.entries(scan.totals.by_extension).map(([e, n]) => `${e} ${n}`).join(', ')}

## Tooling & hygiene
- Tests: ${scan.tooling.tests ? 'present' : 'none found'} · CI: ${scan.tooling.ci ? 'present' : 'none found'} · Docker: ${scan.tooling.docker ? 'present' : 'none found'} · Docs folder: ${scan.tooling.docs ? 'present' : 'none'} · README: ${scan.tooling.readme ? 'present' : 'missing'} · License: ${scan.tooling.license ? 'present' : 'missing'} · TODO/FIXME markers: ${scan.tooling.todo_markers}
- Secret-looking files skipped (never read): ${scan.totals.secret_files_skipped}

## Scripts
${Object.entries(scan.scripts).map(([k, v]) => `- \`${k}\`: \`${v}\``).join('\n') || '_No package.json scripts._'}

## Environment variables (names only, from template files)
${scan.env_vars.length ? scan.env_vars.map((e) => `- \`${e.name}\` (${e.file})`).join('\n') : '_No .env.example-style template found._'}

## Main dependencies
${tbl(['Package', 'Version', 'From'], scan.dependencies.slice(0, 40).map((d) => [d.name, d.version, d.source]))}
`;
  const routes = `# Routes found in code — ${scan.name}

${tbl(['Method', 'Path', 'Handler', 'File', 'Framework'], scan.routes.map((r) => [r.method, r.path, r.handler, r.file, r.framework]))}
`;
  const er = scan.entities.slice(0, 40);
  const names = new Set(er.map((e) => e.name));
  const lines = [];
  for (const e of er) lines.push(`  ${idn(e.name)} {\n${e.columns.slice(0, 12).map((c) => `    ${idn(String(c.type).split(' ')[0]) || 'string'} ${idn(c.name)}`).join('\n')}\n  }`);
  for (const e of er) for (const c of e.columns) { const target = c.fk && names.has(c.fk) ? c.fk : c.rel && names.has(c.rel) ? c.rel : null; if (target) lines.push(`  ${idn(target)} ||--o{ ${idn(e.name)} : "${idn(c.name)}"`); }
  for (const r of scan.relations) if (names.has(r.from) && names.has(r.to)) lines.push(`  ${idn(r.from)} ||--o{ ${idn(r.to)} : "${r.kind}"`);
  const data = `# Data model found in code — ${scan.name}

Extracted from migrations / schema files (${scan.entities.length} table(s)/model(s)). Heuristic; check against the live database before relying on it.

\`\`\`mermaid
erDiagram
${lines.join('\n') || '  EMPTY { string none }'}
\`\`\`

${scan.entities.slice(0, 60).map((e) => `## ${e.name}\nSource: \`${e.source}\` (${e.kind})\n\n${tbl(['Column', 'Type', 'Notes'], e.columns.map((c) => [c.name, c.type, [c.pk && 'pk', c.nullable && 'nullable', c.fk && `fk → ${c.fk}`, c.rel && `relation → ${c.rel}`].filter(Boolean).join(', ')]))}`).join('\n\n') || '_No migrations, Prisma, SQL, Django or Rails schema files found._'}

${scan.relations.length ? `## Eloquent relationships\n${tbl(['From', 'Relation', 'To', 'Method'], scan.relations.map((r) => [r.from, r.kind, r.to, r.via]))}` : ''}
`;
  return { overview, routes, data };
}
