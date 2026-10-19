// Coverage metrics with explicit definitions. There is deliberately no single "percent complete":
// route coverage says nothing about whether every control or workflow was exercised.
import fs from 'node:fs';
import path from 'node:path';
import { normalizeUrl, routeTemplate } from './routes.mjs';
import { scanTodos, validateLinks } from './links.mjs';

export const DEFINITIONS = {
  route_coverage: 'explored routes / all discovered in-scope routes (blocked and failed routes stay in the denominator)',
  accessible_coverage: '(explored + partial routes) / (all routes - blocked routes)',
  screenshot_coverage: 'explored routes (excluding pure redirects) with at least one existing screenshot file / those routes',
  documentation_coverage: 'explored routes referenced by at least one generated or authored doc that exists / explored routes',
  forms: 'forms inventoried (fields read from the DOM). "submit-tested" counts only forms actually submitted in an authorized sandbox',
  controls: 'controls catalogued with a safety category (A/B/C). "exercised" counts controls actually clicked (tabs, menus, openers)',
  workflows: 'markdown files in docs/workflows/ (authored by the workflow analyst)',
  technical_docs: 'agent-owned technical docs with no unresolved TODO(agent) marker / total technical docs',
};

const countFiles = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.md') && !/^README/i.test(f)).length : 0);

export function computeCoverage(project) {
  const { p } = project;
  const routes = project.routes();
  const forms = project.forms();
  const controls = project.controls();
  const state = project.state();
  const cfg = project.config();
  const obs = project.observations();
  const by = (s) => routes.filter((r) => r.status === s);
  const explored = by('explored');
  const partial = by('partial');
  const blocked = by('blocked');
  const failed = by('failed');
  const remaining = routes.filter((r) => ['discovered', 'queued', 'in_progress'].includes(r.status));

  const shootable = explored.filter((r) => !r.redirect_to);
  const withShot = shootable.filter((r) => r.screenshots.some((s) => fs.existsSync(path.join(p.dir, s))));
  const withDocs = explored.filter((r) => r.docs.some((d) => fs.existsSync(path.join(p.dir, d))));

  // Blocked/failed routes are reported on their own, so they are not "unexplored navigation".
  const exploredTemplates = new Set(routes.filter((r) => ['explored', 'partial', 'blocked', 'failed'].includes(r.status)).map((r) => r.key));
  const navTargets = new Set();
  for (const r of routes) for (const n of r.nav || []) navTargets.add(n);
  const unexplored_nav = [...navTargets].filter((n) => {
    const norm = normalizeUrl(n);
    return norm && !exploredTemplates.has(new URL(norm).origin + routeTemplate(norm));
  });

  const allControls = Object.values(controls).flat();
  const tdir = p.technicals;
  const techFiles = fs.existsSync(tdir) ? fs.readdirSync(tdir).filter((f) => f.endsWith('.md')) : [];
  const todos = scanTodos(p.dir);
  const techWithTodo = new Set(todos.filter((t) => t.file.startsWith('docs/technicals/')).map((t) => t.file));

  const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);
  const limitsHit = ['max_pages', 'time_budget', 'interrupted'].includes(state.stop_reason) || state.queue.length > 0;
  const m = {
    routes: {
      total: routes.length, explored: explored.length, partial: partial.length, blocked: blocked.length, failed: failed.length, remaining: remaining.length,
      route_coverage_pct: pct(explored.length, routes.length),
      accessible_coverage_pct: pct(explored.length + partial.length, routes.length - blocked.length),
      sampled_variants_skipped: routes.reduce((n, r) => n + (r.skipped_variants || 0), 0),
    },
    screenshots: { required: shootable.length, covered: withShot.length, coverage_pct: pct(withShot.length, shootable.length), total_files: project.shots().length },
    documentation: { explored_routes_documented: withDocs.length, coverage_pct: pct(withDocs.length, explored.length) },
    forms: { inventoried: forms.length, fields: forms.reduce((n, f) => n + f.fields.length, 0), submit_tested: forms.filter((f) => f.submit_tested).length },
    controls: {
      catalogued: allControls.length,
      by_category: { A: allControls.filter((c) => c.category === 'A').length, B: allControls.filter((c) => c.category === 'B').length, C: allControls.filter((c) => c.category === 'C').length },
      exercised: allControls.filter((c) => c.exercised).length,
    },
    workflows: { documented: countFiles(path.join(p.docs, 'workflows')) },
    technical: {
      observations: obs.length,
      by_evidence_type: obs.reduce((a, o) => ((a[o.type] = (a[o.type] || 0) + 1), a), {}),
      docs_total: techFiles.length,
      docs_complete: techFiles.filter((f) => !techWithTodo.has(`docs/technicals/${f}`)).length,
    },
    unexplored_nav,
    unresolved_todos: todos.length,
    limits: { stop_reason: state.stop_reason, queue_remaining: state.queue.length, skipped: state.skipped, external_origins: state.external_origins, config: { maxPages: cfg.maxPages, maxDepth: cfg.maxDepth, maxPerTemplate: cfg.maxPerTemplate, timeBudgetSec: cfg.timeBudgetSec } },
  };

  const issues = [];
  if (limitsHit) issues.push(`Crawl stopped early (${state.stop_reason}); ${state.queue.length} URL(s) still queued. Resume with a higher limit.`);
  if (remaining.length) issues.push(`${remaining.length} route(s) discovered but not explored.`);
  if (unexplored_nav.length) issues.push(`${unexplored_nav.length} navigation target(s) not explored.`);
  if (m.screenshots.coverage_pct !== null && m.screenshots.coverage_pct < 100) issues.push('Some explored routes lack a screenshot.');
  if (m.documentation.coverage_pct !== null && m.documentation.coverage_pct < 100) issues.push('Some explored routes are not documented (run `report`).');
  if (m.forms.inventoried && !m.workflows.documented) issues.push('Forms exist but no workflow documents have been written.');
  if (todos.length) issues.push(`${todos.length} unresolved TODO(agent) marker(s) in documentation.`);
  if (partial.length + failed.length) issues.push(`${partial.length} partial and ${failed.length} failed route(s).`);

  // Wording is deliberately conservative: a drained queue is not "fully explored".
  m.verdict = limitsHit || remaining.length
    ? 'INCOMPLETE: crawl limits or unexplored routes remain.'
    : issues.length
      ? 'QUEUE EXHAUSTED, WITH OPEN ITEMS: every discovered in-scope URL was visited, but see issues below. This does not mean every control or workflow was tested.'
      : 'QUEUE EXHAUSTED: every discovered in-scope URL was visited within the configured scope. This does not mean every control or workflow was tested.';
  m.issues = issues;
  return m;
}

export function fullAudit(project) {
  const m = computeCoverage(project);
  m.links = validateLinks(project.p.dir);
  if (m.links.broken.length) m.issues.push(`${m.links.broken.length} broken documentation link(s).`);
  return m;
}
