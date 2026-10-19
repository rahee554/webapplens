// Cheap project status for agents: one small JSON instead of re-reading reports (saves tokens).
import fs from 'node:fs';
import { computeCoverage } from './coverage.mjs';
import { openItems, readBoard } from './board.mjs';

export function projectStatus(project) {
  const m = computeCoverage(project);
  const state = project.state();
  const cfg = project.config();
  const manifest = project.manifest();
  const board = readBoard(project);
  const next = [];
  if (state.queue.length) next.push(`resume the crawl (${state.queue.length} URL(s) queued; stop reason: ${state.stop_reason || 'n/a'})`);
  if (!fs.existsSync(project.p.techStack) || !JSON.parse(fs.readFileSync(project.p.techStack, 'utf8')).pages) { /* stack scan not run */ }
  if (m.unresolved_todos) next.push(`${m.unresolved_todos} documentation TODO(agent) marker(s) to resolve`);
  if (m.unexplored_nav.length) next.push(`${m.unexplored_nav.length} navigation target(s) not explored`);
  return {
    application: manifest.application,
    mode: manifest.mode,
    base_url: manifest.base_url,
    focus: cfg.focus || ['full'],
    state: { status: state.status, stop_reason: state.stop_reason, queue: state.queue.length, pages_visited: state.stats?.pages_visited || 0, updated_at: state.updated_at },
    routes: m.routes,
    forms: m.forms,
    controls: { catalogued: m.controls.catalogued, exercised: m.controls.exercised },
    screenshots: { files: m.screenshots.total_files, required: m.screenshots.required },
    docs: { unresolved_todos: m.unresolved_todos, workflows: m.workflows.documented, technical_complete: `${m.technical.docs_complete}/${m.technical.docs_total}` },
    roundtable: { messages: board.length, open_items: openItems(board).length },
    verdict: m.verdict,
    issues: m.issues,
    suggested_next_steps: next,
  };
}
