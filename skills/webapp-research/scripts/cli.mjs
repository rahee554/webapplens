#!/usr/bin/env node
// webapp-research CLI. Subcommands: doctor, init, crawl, report, audit, observe, classify, compare, validate-links
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { initProject, openProject, resolveProjectDir } from './lib/project.mjs';
import { crawl } from './lib/crawler.mjs';
import { generateDocs, writeReports } from './lib/docs.mjs';
import { fullAudit } from './lib/coverage.mjs';
import { writeDashboard } from './lib/viewer.mjs';
import { validateLinks } from './lib/links.mjs';
import { addObservation, EVIDENCE_TYPES } from './lib/evidence.mjs';
import { classifyAction } from './lib/safety.mjs';
import { rankCandidates, renderComparison } from './lib/scoring.mjs';
import { loadPlaywright, openSession } from './lib/browser.mjs';
import { makeScope } from './lib/scope.mjs';
import { readJson, writeText } from './lib/util.mjs';
import { redactText } from './lib/redact.mjs';

const HELP = `webapp-research <command> [options]

  doctor                                   Check Node, Playwright and launch a real browser
  init <AppName> --url <baseUrl>           Create docs/references/<AppName>/ (options: --out, --mode A|B|C|D, --scope "text",
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
  validate-links <dir>                     Check relative Markdown links

Global: --out <dir> (default docs/references)`;

const { values: v, positionals } = parseArgs({
  allowPositionals: true,
  strict: false,
  options: {
    url: { type: 'string' }, out: { type: 'string', default: 'docs/references' }, mode: { type: 'string', default: 'C' }, scope: { type: 'string' },
    'username-env': { type: 'string' }, 'password-env': { type: 'string' }, 'login-path': { type: 'string' }, 'allow-origin': { type: 'string', multiple: true },
    'max-pages': { type: 'string' }, 'max-depth': { type: 'string' }, 'max-per-template': { type: 'string' }, 'time-budget': { type: 'string' },
    'probe-openers': { type: 'boolean' }, responsive: { type: 'boolean' }, headed: { type: 'boolean' }, sandbox: { type: 'boolean' },
    'credentials-file': { type: 'string' }, 'allow-post': { type: 'string', multiple: true }, exclude: { type: 'string', multiple: true },
    json: { type: 'boolean' }, strict: { type: 'boolean' }, type: { type: 'string' }, claim: { type: 'string' }, route: { type: 'string' }, source: { type: 'string' },
    screenshot: { type: 'string' }, confidence: { type: 'string' }, role: { type: 'string' }, top: { type: 'string', default: '5' }, password: { type: 'string' },
  },
});

const [cmd, ...rest] = positionals;
const num = (x) => (x === undefined ? undefined : Number(x));

async function main() {
  if (v.password) throw new Error('Never pass passwords on the command line (shell history). Use env vars via --password-env or --credentials-file.');
  switch (cmd) {
    case 'doctor': return doctor();
    case 'init': {
      const [app] = rest;
      if (!app || !v.url) throw new Error('usage: init <AppName> --url <baseUrl>');
      new URL(v.url);
      const config = { auth: {} };
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
      const overrides = {};
      if (v['max-pages']) overrides.maxPages = num(v['max-pages']);
      if (v['max-depth']) overrides.maxDepth = num(v['max-depth']);
      if (v['max-per-template']) overrides.maxPerTemplate = num(v['max-per-template']);
      if (v['time-budget']) overrides.timeBudgetSec = num(v['time-budget']);
      if (v['probe-openers']) overrides.probeOpeners = true;
      if (v.responsive) overrides.responsive = { enabled: true };
      if (v.sandbox) overrides.sandbox = true;
      if (v['allow-post']) overrides.allowPostPatterns = v['allow-post'];
      if (v.exclude) overrides.exclude = v.exclude;
      const res = await crawl(project, { overrides, credentialsFile: v['credentials-file'], headless: v.headed ? false : undefined });
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
      if (v.out && v.out !== 'docs/references') writeText(v.out, md); else console.log(md);
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

async function doctor() {
  const out = [];
  const ok = (name, detail) => out.push(`  ok   ${name}: ${detail}`);
  const bad = (name, detail) => { out.push(`  FAIL ${name}: ${detail}`); process.exitCode = 1; };
  const major = Number(process.versions.node.split('.')[0]);
  major >= 22 ? ok('node', process.versions.node) : bad('node', `${process.versions.node} (need >= 22)`);
  try {
    const pw = await loadPlaywright();
    ok('playwright', 'module found');
    const cfg = { viewport: { width: 800, height: 600 }, navTimeoutMs: 8000, headless: true };
    const s = await openSession(cfg, makeScope({ baseUrl: 'http://localhost/' }), {});
    await s.page.setContent('<title>doctor</title><h1>ok</h1>');
    const t = await s.page.title();
    await s.close();
    t === 'doctor' ? ok('chromium', 'launched and rendered a page') : bad('chromium', 'launched but did not render');
    void pw;
  } catch (e) {
    bad('browser', redactText(e.message).split('\n')[0] + ' — run: npx playwright install chromium');
  }
  console.log(`webapp-research doctor\n${out.join('\n')}`);
}

main().catch((e) => {
  console.error(`error: ${redactText(e.message)}`);
  process.exitCode = 1;
});
