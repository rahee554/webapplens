// Research project storage: directory layout, config/state persistence, logging, manifests.
import fs from 'node:fs';
import path from 'node:path';
import { appendJsonl, ensureDir, nowIso, readJson, readJsonl, shortHash, slug, writeJson, writeText } from './util.mjs';
import { redactText } from './redact.mjs';

export const TOOL_VERSION = '0.1.0';
export const SCHEMA_VERSION = 1;

export const DEFAULT_CONFIG = {
  baseUrl: '',
  startPaths: ['/'],
  allowedOrigins: [],
  includeSubdomains: false,
  exclude: [],
  maxDepth: 4,
  maxPages: 150,
  maxPerTemplate: 3,
  timeBudgetSec: 900,
  delayMs: 250,
  navTimeoutMs: 20000,
  retries: 2,
  maxRestarts: 3,
  maxTabsPerPage: 8,
  maxOpenersPerPage: 6,
  viewport: { width: 1366, height: 850 },
  headless: true,
  expandMenus: true,
  clickTabs: true,
  // Click "Add/New/Create" buttons to reveal dialogs. Off by default: opening is read-only in
  // intent, but a badly built button could still act. Non-GET requests are blocked either way.
  probeOpeners: false,
  responsive: { enabled: false, maxRoutes: 5, width: 390, height: 844 },
  // sandbox=true is the only way to lift the mutation guard (still limited by allowPostPatterns).
  sandbox: false,
  // Regexes for read-only POST endpoints (GraphQL, JSON-RPC search) the guard should let through.
  allowPostPatterns: [],
  persistSession: true,
  auth: { required: false, loginPath: '/login', userSelector: null, passwordSelector: null, submitSelector: null },
};

export function projectPaths(dir) {
  const j = (...p) => path.join(dir, ...p);
  return {
    dir,
    readme: j('README.md'),
    manifest: j('research-manifest.json'),
    credentials: j('credentials.json'),
    secrets: j('.secrets'),
    storageState: j('.secrets', 'storage-state.json'),
    routesJson: j('routes', 'routes.json'),
    routeInventory: j('routes', 'route-inventory.md'),
    formsJson: j('routes', 'forms.json'),
    controlsJson: j('routes', 'controls.json'),
    shots: j('screenshots'),
    shotsAll: j('screenshots', 'all'),
    shotsModules: j('screenshots', 'modules'),
    shotsInteractions: j('screenshots', 'interactions'),
    shotManifest: j('screenshots', 'manifest.json'),
    docs: j('docs'),
    technicals: j('docs', 'technicals'),
    config: j('crawlers', 'config.json'),
    state: j('crawlers', 'state.json'),
    failures: j('crawlers', 'failures.json'),
    runManifest: j('crawlers', 'run-manifest.json'),
    observations: j('evidence', 'observations.jsonl'),
    network: j('evidence', 'network-summary.json'),
    reports: j('reports'),
    log: j('logs', 'research.log'),
  };
}

export function initProject({ outRoot, app, baseUrl, mode = 'C', scopeText = 'all accessible modules', config = {} }) {
  const dir = path.join(outRoot, app);
  const p = projectPaths(dir);
  if (fs.existsSync(p.manifest)) return { dir, created: false, project: openProject(dir) };

  for (const d of [p.shotsAll, p.shotsModules, p.shotsInteractions, p.docs, p.technicals, path.dirname(p.config), path.dirname(p.observations), p.reports, path.dirname(p.log), path.dirname(p.routesJson)]) ensureDir(d);

  const merged = {
    ...DEFAULT_CONFIG,
    ...config,
    baseUrl,
    responsive: { ...DEFAULT_CONFIG.responsive, ...(config.responsive || {}) },
    auth: { ...DEFAULT_CONFIG.auth, ...(config.auth || {}) },
  };
  writeJson(p.config, merged);
  writeJson(p.manifest, {
    schema_version: SCHEMA_VERSION,
    tool_version: TOOL_VERSION,
    project_id: `${slug(app)}-${shortHash(app + nowIso())}`,
    application: app,
    mode,
    scope: scopeText,
    base_url: baseUrl,
    created_at: nowIso(),
  });
  writeJson(p.state, {
    project_id: null,
    status: 'initialized',
    started_at: null,
    updated_at: nowIso(),
    queue: [],
    done: [],
    skipped: {},
    external_origins: [],
    stats: { pages_visited: 0, restarts: 0 },
    stop_reason: null,
    agents: {},
  });
  writeJson(p.routesJson, []);
  writeJson(p.formsJson, []);
  writeJson(p.controlsJson, {});
  writeJson(p.failures, []);
  writeJson(p.shotManifest, []);
  writeJson(p.network, { api_calls: {}, per_route: {} });
  // Credentials template: environment-variable NAMES only, never values.
  const envBase = slug(app).toUpperCase().replace(/-/g, '_');
  writeJson(p.credentials, {
    application: app,
    base_url: baseUrl,
    access_type: 'user_supplied',
    credentials_source: 'user',
    source_url: null,
    verification_status: 'not_yet_verified',
    last_verified_at: null,
    username_env: `${envBase}_USERNAME`,
    password_env: `${envBase}_PASSWORD`,
    notes: 'Fill the environment variables named above. Do not paste passwords into this file.',
  });
  writeText(path.join(dir, '.gitignore'), '.secrets/\ncredentials.json\n*.local.json\n');
  const project = openProject(dir);
  project.log('info', `initialized project ${app} (${baseUrl})`);
  return { dir, created: true, project };
}

export function openProject(dir) {
  const p = projectPaths(dir);
  if (!fs.existsSync(p.manifest)) throw new Error(`Not a research project: ${dir} (missing research-manifest.json). Run \`init\` first.`);
  return {
    p,
    dir,
    manifest: () => readJson(p.manifest),
    config: () => readJson(p.config),
    saveConfig: (c) => writeJson(p.config, c),
    state: () => readJson(p.state),
    saveState: (s) => writeJson(p.state, { ...s, updated_at: nowIso() }),
    routes: () => readJson(p.routesJson, []),
    saveRoutes: (r) => writeJson(p.routesJson, r),
    forms: () => readJson(p.formsJson, []),
    saveForms: (f) => writeJson(p.formsJson, f),
    controls: () => readJson(p.controlsJson, {}),
    saveControls: (c) => writeJson(p.controlsJson, c),
    failures: () => readJson(p.failures, []),
    saveFailures: (f) => writeJson(p.failures, f),
    shots: () => readJson(p.shotManifest, []),
    saveShots: (s) => writeJson(p.shotManifest, s),
    observations: () => readJsonl(p.observations),
    log(level, msg) {
      ensureDir(path.dirname(p.log));
      fs.appendFileSync(p.log, `${nowIso()} [${level}] ${redactText(msg)}\n`);
    },
    appendObservation: (o) => appendJsonl(p.observations, o),
  };
}

export function resolveProjectDir(arg, outRoot) {
  if (fs.existsSync(path.join(arg, 'research-manifest.json'))) return path.resolve(arg);
  const cand = path.resolve(outRoot, arg);
  if (fs.existsSync(path.join(cand, 'research-manifest.json'))) return cand;
  throw new Error(`No research project found at "${arg}" or "${cand}".`);
}
