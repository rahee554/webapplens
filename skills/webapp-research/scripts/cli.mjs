#!/usr/bin/env node
// webapp-research CLI. Subcommands: doctor, init, crawl, report, audit, observe, classify, compare, validate-links
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { applyProfile, DEFAULT_OUT, initProject, openProject, PROFILES, resolveProjectDir } from './lib/project.mjs';
import { checkRequirements, runSetup } from './lib/setup.mjs';
import { buildQueries, demoLogin, probeDemo } from './lib/discovery.mjs';
import * as board from './lib/board.mjs';
import { probeUrls } from './lib/probe.mjs';
import { analyzeRequest } from './lib/intent.mjs';
import { projectStatus } from './lib/status.mjs';
import { writeSuggestions } from './lib/suggest.mjs';
import { proposeArchitecture } from './lib/architect.mjs';
import { renderRepoDocs, scanRepo } from './lib/repo.mjs';
import { deliver } from './lib/deliver.mjs';
import { checkUpdate, runUpdate, updateNotice } from './lib/update.mjs';
import { writeGenerated } from './lib/docs.mjs';
import { addObservation as observe } from './lib/evidence.mjs';
import { crawl } from './lib/crawler.mjs';
import { generateDocs, writeReports } from './lib/docs.mjs';
import { fullAudit } from './lib/coverage.mjs';
import { writeDashboard } from './lib/viewer.mjs';
import { validateLinks } from './lib/links.mjs';
import { addObservation, EVIDENCE_TYPES } from './lib/evidence.mjs';
import { classifyAction } from './lib/safety.mjs';
import { rankCandidates, renderComparison } from './lib/scoring.mjs';
import { readJson, writeJson, writeText } from './lib/util.mjs';
import { redactText } from './lib/redact.mjs';

const HELP = `webapp-research <command> [options]

  doctor [--json]                          Check Node, Playwright, Chromium (exit 1 + exact fixes if something is missing)
  setup [--yes] [--json]                   Show the install plan; with --yes install Playwright + Chromium and re-verify
                                           (agents: ask the user before --yes, unless auto mode)
  init <AppName> --url <baseUrl>           Create .webapplens/docs/<AppName>/ (options: --out, --mode A|B|C|D, --scope "text",
                                           --username-env NAME --password-env NAME, --login-path /login, --allow-origin URL)
  crawl <AppName|dir>                      Explore (read-only). Options: --max-pages N --max-depth N --max-per-template N
                                           --time-budget SEC --probe-openers --responsive --headed --credentials-file FILE
                                           --sandbox --allow-post REGEX --exclude REGEX  (resumes automatically)
  report <AppName|dir>                     Generate docs + reports + dashboard.html from collected data and print the audit
  viewer <AppName|dir>                     (Re)build only the interactive dashboard.html
  audit <AppName|dir> [--json]             Completeness metrics + link check (exit 1 if open issues and --strict)
  observe <AppName|dir> --type T --claim "..." [--route R001 --source URL --screenshot path --confidence high|medium|low]
                                           Record evidence. Types: ${Object.keys(EVIDENCE_TYPES).join(', ')}
  classify "<label>" [--role link|button|tab] [--type submit]   Safety category (A/B/C) of a control
  compare <candidates.json> [--top 5] [--out file.md]           Weighted ranking for product/demo discovery
  discover-queries "<topic>" [--marketplaces a,b] [--json]   Marketplace-aware web-search queries (CodeCanyon, GitHub, G2, ...)
  demo-probe <url> [--out DIR]             Read-only look at a PUBLIC page: login form? CAPTCHA? published demo credentials?
  demo-login <probe.json> [--index N] [--save-to App|dir]    ONE login attempt with a published credential; saves if verified
  board post|read|decide|summary <App|dir> Roundtable blackboard: --role R --type T --text "..." [--to R --ref M001 --round N]
                                           read: [--role R --since N --open]  decide: --ref M001 --decision "..." [--dissent R]
  accept <App|dir> <routeId> --reason "..."   Mark an expected failure/blocked route as accepted (stays listed, not an open issue)
  probe <App|dir> <url...> [--screenshot] [--text]   Read-only GET via the saved session + guards (never hand-write browser scripts)
  intent "<request text>"                  Minimum plan for a request: facets, exact commands, outputs, what is skipped, open questions
  status <App|dir>                         Compact project status (progress, coverage, open items, next steps) - use instead of re-reading reports
  suggest <App|dir>                        Evidence-based improvement suggestions (accessibility, usability, performance, design, passive security)
  architect <App|dir> [--stack laravel|prisma|django|sql|auto]   Proposed data model, API outline, baseline architecture (PROPOSED)
  repo-scan <folder> [--name N]            Analyse a local repo: stack, routes, data model, env var NAMES (never reads .env or keys)
  deliver <App|dir> [--to DIR] [--include-drafts] [--no-dashboard]   Publish client-ready docs to the project root (default docs/research/<App>)
  update-check [--force] [--json] [--quiet]   Is a newer WebAppLens available? (cached 24h, silent offline, changes nothing)
  update [--yes]                           Show the update plan; with --yes update (git pull, or copy over an installed copy)
  validate-links <dir>                     Check relative Markdown links

Precise scope: init/crawl accept --focus ui,stack,screenshots,forms,workflows,data-model,api,architecture,suggestions,docs (default: full).
Only the focused work runs; e.g. screenshots are captured only when asked for.
Profiles: init/crawl accept --profile quick|standard|deep|auto (or --auto). auto = recommended settings + automatic
re-crawl rounds while limits were the stop reason + read-only GraphQL allowed.
Global: --out <dir> (default .webapplens/docs, created in the current folder)`;

const { values: v, positionals } = parseArgs({
  allowPositionals: true,
  strict: false,
  options: {
    url: { type: 'string' }, out: { type: 'string', default: DEFAULT_OUT }, mode: { type: 'string', default: 'C' }, scope: { type: 'string' },
    'username-env': { type: 'string' }, 'password-env': { type: 'string' }, 'login-path': { type: 'string' }, 'allow-origin': { type: 'string', multiple: true },
    'max-pages': { type: 'string' }, 'max-depth': { type: 'string' }, 'max-per-template': { type: 'string' }, 'time-budget': { type: 'string' },
    'probe-openers': { type: 'boolean' }, responsive: { type: 'boolean' }, headed: { type: 'boolean' }, sandbox: { type: 'boolean' },
    'credentials-file': { type: 'string' }, 'allow-post': { type: 'string', multiple: true }, exclude: { type: 'string', multiple: true },
    json: { type: 'boolean' }, text: { type: 'string' }, stack: { type: 'string' }, name: { type: 'string' }, to: { type: 'string' }, force: { type: 'boolean' }, quiet: { type: 'boolean' },
    focus: { type: 'string' }, 'include-drafts': { type: 'boolean' }, 'no-dashboard': { type: 'boolean' }, strict: { type: 'boolean' }, type: { type: 'string' }, claim: { type: 'string' }, route: { type: 'string' }, source: { type: 'string' },
    screenshot: { type: 'string' }, yes: { type: 'boolean' }, auto: { type: 'boolean' }, profile: { type: 'string' }, marketplaces: { type: 'string' },
    index: { type: 'string' }, 'save-to': { type: 'string' }, role: { type: 'string' }, to: { type: 'string' }, ref: { type: 'string' }, round: { type: 'string' },
    since: { type: 'string' }, open: { type: 'boolean' }, decision: { type: 'string' }, dissent: { type: 'string' }, reason: { type: 'string' }, confidence: { type: 'string' }, top: { type: 'string', default: '5' }, password: { type: 'string' },
  },
});

const [cmd, ...rest] = positionals;
const num = (x) => (x === undefined ? undefined : Number(x));

async function main() {
  if (v.password) throw new Error('Never pass passwords on the command line (shell history). Use env vars via --password-env or --credentials-file.');
  switch (cmd) {
    case 'doctor': {
      const r = await checkRequirements();
      if (v.json) console.log(JSON.stringify(r, null, 2)); else printChecks(r);
      if (!r.ok) {
        if (!v.json) console.log('\nSomething is missing. Fix with: `setup` (shows the plan) or `setup --yes` (installs). Agents: tell the user what is missing and ask before installing, unless auto mode.');
        process.exitCode = 1;
      }
      return;
    }
    case 'setup': {
      const r = await runSetup({ yes: v.yes });
      if (v.json) console.log(JSON.stringify(r, null, 2));
      else {
        printChecks(r);
        console.log(`\n${r.message}`);
        if (!v.yes && r.install_plan.length) r.install_plan.forEach((st) => console.log(`  (in ${st.cwd}) ${st.cmd}    # ${st.why}`));
      }
      if (!r.ok) process.exitCode = 1;
      return;
    }
    case 'discover-queries': {
      const topic = rest.join(' ').trim();
      if (!topic) throw new Error('usage: discover-queries "<topic>" [--marketplaces codecanyon,github]');
      const q = buildQueries(topic, v.marketplaces ? v.marketplaces.split(',') : undefined);
      if (v.json) console.log(JSON.stringify(q, null, 2));
      else q.forEach((m) => { console.log(`# ${m.name} (${m.id})`); m.queries.forEach((x) => console.log(`  ${x}`)); });
      return;
    }
    case 'demo-probe': {
      if (!rest[0]) throw new Error('usage: demo-probe <url> [--out DIR]');
      const { file, probe } = await probeDemo(rest[0], { outDir: v.out, headless: v.headed ? false : true });
      console.log(JSON.stringify({ file, final_url: probe.final_url, status: probe.status, title: probe.title, login_form: probe.login_form, captcha: probe.captcha, mfa: probe.mfa, iframes: probe.iframes, links: probe.links.length, credential_candidates: probe.credential_candidates.map((c, i) => ({ index: i, username: c.username, source_url: c.source_url })) }, null, 2));
      return;
    }
    case 'demo-login': {
      if (!rest[0]) throw new Error('usage: demo-login <probe.json> [--index N] [--save-to App|dir]');
      const r = await demoLogin(rest[0], { index: Number(v.index || 0), saveTo: v['save-to'], outRoot: v.out });
      console.log(JSON.stringify(r));
      if (!r.ok) process.exitCode = 1;
      return;
    }
    case 'board': {
      const [sub, target] = rest;
      const project = open(target);
      if (sub === 'post') console.log(JSON.stringify(board.post(project, { role: v.role, type: v.type, text: v.text, to: v.to, ref: v.ref, round: v.round })));
      else if (sub === 'read') {
        const msgs = board.read(project, { role: v.role, since: v.since, open: v.open });
        if (v.json) console.log(JSON.stringify(msgs, null, 2));
        else console.log(msgs.map((m) => `${m.id} r${m.round} [${m.role}${m.to ? '→' + m.to : ''}] (${m.type}${m.ref ? ' re ' + m.ref : ''}) ${m.text}`).join('\n') || '(no messages)');
      } else if (sub === 'decide') console.log(JSON.stringify(board.decide(project, { ref: v.ref, decision: v.decision, dissent: v.dissent })));
      else if (sub === 'summary') console.log(JSON.stringify(board.summary(project)));
      else throw new Error('usage: board post|read|decide|summary <App|dir> ...');
      return;
    }
    case 'intent': {
      const text = rest.join(' ').trim();
      if (!text) throw new Error('usage: intent "<what the user asked for>" [--name App --url https://...]');
      console.log(JSON.stringify(analyzeRequest(text, { app: v.name, target: v.url }), null, 2));
      return;
    }
    case 'status': {
      console.log(JSON.stringify(projectStatus(open(rest[0])), null, 2));
      return;
    }
    case 'suggest': {
      console.log(JSON.stringify(writeSuggestions(open(rest[0]))));
      return;
    }
    case 'architect': {
      const r = proposeArchitecture(open(rest[0]), { stack: v.stack || 'auto' });
      console.log(JSON.stringify(r));
      return;
    }
    case 'repo-scan': {
      if (!rest[0]) throw new Error('usage: repo-scan <folder> [--name N]');
      const name = v.name || path.basename(path.resolve(rest[0]));
      let project;
      try { project = openProject(resolveProjectDir(name, v.out)); } catch { project = initProject({ outRoot: v.out, app: name, baseUrl: `repo://${name}`, mode: 'R', scopeText: 'local repository analysis' }).project; }
      const scan = scanRepo(rest[0], { name });
      writeJson(project.p.repoScan, scan);
      const docs = renderRepoDocs(scan);
      const dir = path.join(project.p.docs, 'repo');
      writeGenerated(path.join(dir, 'repo-overview.md'), docs.overview);
      writeGenerated(path.join(dir, 'routes-from-code.md'), docs.routes);
      writeGenerated(path.join(dir, 'data-model-from-code.md'), docs.data);
      observe(project, { type: 'public_source', claim: `Repository ${scan.name}: ${scan.stack.map((s) => s.name).join(', ') || 'no recognised stack'}; ${scan.routes.length} route(s), ${scan.entities.length} table(s)/model(s) found in code.`, confidence: 'high' });
      console.log(JSON.stringify({ project: project.dir, files: scan.totals.files, stack: scan.stack.map((s) => s.name), routes: scan.routes.length, entities: scan.entities.length, env_vars: scan.env_vars.length, secret_files_skipped: scan.totals.secret_files_skipped, docs: dir }));
      return;
    }
    case 'deliver': {
      const r = deliver(open(rest[0]), { to: v.to, includeDrafts: v['include-drafts'], withDashboard: !v['no-dashboard'], root: process.cwd() });
      console.log(JSON.stringify(r, null, 2));
      if (r.broken_links.length) process.exitCode = 1;
      return;
    }
    case 'update-check': {
      const r = await checkUpdate({ force: v.force });
      const note = updateNotice(r);
      if (v.json) console.log(JSON.stringify({ ...r, notice: note }, null, 2));
      else if (note) console.log(note);
      else if (!v.quiet) console.log(r.offline && !r.latest ? `WebAppLens ${r.current} (could not check for updates: offline)` : `WebAppLens ${r.current} is up to date${r.latest ? ` (latest ${r.latest})` : ''}.`);
      return;
    }
    case 'update': {
      const r = await runUpdate({ yes: v.yes });
      console.log(JSON.stringify(r, null, 2));
      return;
    }
    case 'accept': {
      const project = open(rest[0]);
      if (!rest[1] || !v.reason) throw new Error('usage: accept <App|dir> <routeId> --reason "..."');
      const routes = project.routes();
      const r = routes.find((x) => x.id === rest[1]);
      if (!r) throw new Error(`no route ${rest[1]}`);
      r.accepted = { reason: v.reason, at: new Date().toISOString() };
      project.saveRoutes(routes);
      console.log(`accepted ${r.id} ${r.template}: ${v.reason}`);
      return;
    }
    case 'probe': {
      const project = open(rest[0]);
      // --screenshot / --text are flags here; the generic option parser may have swallowed the next URL as their value.
      const urls = rest.slice(1);
      for (const k of ['screenshot', 'text']) if (typeof v[k] === 'string' && v[k] !== 'true') urls.push(v[k]);
      const out = await probeUrls(project, urls, { screenshot: v.screenshot !== undefined, text: v.text !== undefined, credentialsFile: v['credentials-file'], headless: v.headed ? false : undefined });
      console.log(JSON.stringify(out, null, 2));
      return;
    }
    case 'init': {
      const [app] = rest;
      if (!app || !v.url) throw new Error('usage: init <AppName> --url <baseUrl>');
      new URL(v.url);
      const prof = v.profile || (v.auto ? 'auto' : undefined);
      const config = { ...(prof ? { ...PROFILES[prof], profile: prof } : {}), auth: {} };
      if (v.focus) config.focus = v.focus.split(',').map((x) => x.trim()).filter(Boolean);
      if (prof && !PROFILES[prof]) throw new Error(`Unknown profile "${prof}". Use: ${Object.keys(PROFILES).join(', ')}.`);
      if (v['login-path']) config.auth.loginPath = v['login-path'];
      if (v['allow-origin']) config.allowedOrigins = v['allow-origin'];
      const { dir, created, project } = initProject({ outRoot: v.out, app, baseUrl: v.url, mode: v.mode, scopeText: v.scope, config });
      if (created && (v['username-env'] || v['password-env'])) {
        const c = readJson(project.p.credentials);
        if (v['username-env']) c.username_env = v['username-env'];
        if (v['password-env']) c.password_env = v['password-env'];
        fs.writeFileSync(project.p.credentials, JSON.stringify(c, null, 2) + '\n');
      }
      console.log(created ? `Created ${dir}` : `Already exists: ${dir}`);
      console.log(`credentials: ${project.p.credentials} (env var names only; git-ignored)`);
      return;
    }
    case 'crawl': {
      const project = open(rest[0]);
      const prof = v.profile || (v.auto ? 'auto' : undefined) || project.config().profile;
      const overrides = prof ? applyProfile({ responsive: {} }, prof) : {};
      delete overrides.auth;
      if (v.focus) overrides.focus = v.focus.split(',').map((x) => x.trim()).filter(Boolean);
      if (v['max-pages']) overrides.maxPages = num(v['max-pages']);
      if (v['max-depth']) overrides.maxDepth = num(v['max-depth']);
      if (v['max-per-template']) overrides.maxPerTemplate = num(v['max-per-template']);
      if (v['time-budget']) overrides.timeBudgetSec = num(v['time-budget']);
      if (v['probe-openers']) overrides.probeOpeners = true;
      if (v.responsive) overrides.responsive = { enabled: true };
      if (v.sandbox) overrides.sandbox = true;
      if (v['allow-post']) overrides.allowPostPatterns = v['allow-post'];
      if (v.exclude) overrides.exclude = v.exclude;
      const progress = (e) => process.stderr.write(`  [${e.done}] ${e.url}  (queue ${e.queue})
`);
      let res = await crawl(project, { overrides, credentialsFile: v['credentials-file'], headless: v.headed ? false : undefined, onProgress: progress });
      // Auto mode: if only a limit stopped us, widen it and continue (the crawl resumes where it left off).
      for (let round = 1; round <= (overrides.autoRounds || 0) && res.status === 'paused' && ['max_pages', 'time_budget'].includes(res.stop_reason); round++) {
        overrides.maxPages = Math.ceil((overrides.maxPages || project.config().maxPages) * 1.5);
        overrides.timeBudgetSec = Math.ceil((overrides.timeBudgetSec || project.config().timeBudgetSec) * 1.5);
        console.error(`auto: ${res.stop_reason} reached with ${res.queue} URL(s) queued; round ${round}: maxPages=${overrides.maxPages}`);
        res = await crawl(project, { overrides, credentialsFile: v['credentials-file'], headless: v.headed ? false : undefined, onProgress: progress });
      }
      console.log(JSON.stringify(res));
      if (res.status === 'paused') console.log(`Paused (${res.stop_reason}). Re-run the same command to resume, optionally with higher limits.`);
      return;
    }
    case 'report': {
      const m = generateDocs(open(rest[0]));
      printAudit(m);
      return;
    }
    case 'viewer': {
      console.log(writeDashboard(open(rest[0])));
      return;
    }
    case 'audit': {
      const project = open(rest[0]);
      const m = fullAudit(project);
      writeReports(project, m);
      if (v.json) console.log(JSON.stringify(m, null, 2)); else printAudit(m);
      if (v.strict && m.issues.length) process.exitCode = 1;
      return;
    }
    case 'observe': {
      const project = open(rest[0]);
      const o = addObservation(project, { type: v.type, claim: v.claim, route_id: v.route, source_url: v.source, screenshot: v.screenshot, confidence: v.confidence });
      console.log(JSON.stringify(o));
      return;
    }
    case 'classify': {
      console.log(JSON.stringify(classifyAction(rest.join(' '), { role: v.role, type: v.type })));
      return;
    }
    case 'compare': {
      const data = readJson(rest[0]);
      if (!data) throw new Error('cannot read candidates file');
      const md = renderComparison(rankCandidates(data, { top: num(v.top) }));
      if (v.out && v.out !== DEFAULT_OUT) writeText(v.out, md); else console.log(md);
      return;
    }
    case 'validate-links': {
      const r = validateLinks(rest[0] || '.');
      console.log(`${r.checked} links checked, ${r.broken.length} broken`);
      r.broken.forEach((b) => console.log(`  ${b.file} -> ${b.link}`));
      if (r.broken.length) process.exitCode = 1;
      return;
    }
    default:
      console.log(HELP);
      if (cmd && cmd !== 'help') process.exitCode = 1;
  }
}

const open = (arg) => {
  if (!arg) throw new Error('missing <AppName|dir>');
  return openProject(resolveProjectDir(arg, v.out));
};

function printAudit(m) {
  console.log(`\n${m.verdict}`);
  console.log(`routes: ${m.routes.explored}/${m.routes.total} explored (${m.routes.partial} partial, ${m.routes.blocked} blocked, ${m.routes.failed} failed, ${m.routes.remaining} remaining)`);
  console.log(`screenshots: ${m.screenshots.covered}/${m.screenshots.required} · forms: ${m.forms.inventoried} · controls: ${m.controls.catalogued} (${m.controls.exercised} exercised) · workflows: ${m.workflows.documented}`);
  m.issues.forEach((i) => console.log(`  ! ${i}`));
}

function printChecks(r) {
  console.log('webapp-research requirements');
  for (const c of r.checks) console.log(`  ${c.ok ? 'ok  ' : 'FAIL'} ${c.id}: ${c.detail}${c.fix ? `  -> fix: ${c.fix}` : ''}`);
}

main().catch((e) => {
  console.error(`error: ${redactText(e.message)}`);
  process.exitCode = 1;
});
