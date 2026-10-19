// Client delivery: publishes the curated, client-facing documentation from the agent workspace
// (.webapplens/docs/<App>) into the project root (default docs/research/<App>). The workspace holds agent
// state, credentials references, logs and raw evidence; none of that is copied. Unfinished docs (with
// TODO(agent) markers) are NOT delivered unless explicitly requested, so clients never receive placeholders.
import fs from 'node:fs';
import path from 'node:path';
import { nowIso, writeText } from './util.mjs';
import { redactText } from './redact.mjs';
import { fullAudit } from './coverage.mjs';
import { TODO_MARK, validateLinks } from './links.mjs';

const COPY_TREES = ['docs', 'screenshots'];
const COPY_FILES = ['routes/route-inventory.md', 'reports/suggestions.md', 'reports/completeness.md', 'reports/roundtable.md', 'dashboard.html'];
const NEVER = /(credentials|\.secrets|storage-state|state\.json|board\.jsonl|research\.log|observations\.jsonl|probe\.json)/i;

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(f);
    else yield f;
  }
}

export function deliver(project, { to, includeDrafts = false, withDashboard = true, root = process.cwd() } = {}) {
  const app = project.manifest().application;
  const dest = path.resolve(root, to || path.join('docs', 'research', app));
  const src = project.p.dir;
  if (path.resolve(dest).startsWith(path.resolve(src) + path.sep)) throw new Error('Destination must not be inside the .webapplens workspace.');
  fs.mkdirSync(dest, { recursive: true });
  const copied = [];
  const drafts = [];
  const flagged = [];

  const copyFile = (rel) => {
    const from = path.join(src, rel);
    if (!fs.existsSync(from) || NEVER.test(rel)) return;
    const isText = /\.(md|json|html|txt)$/.test(rel);
    if (isText && /\.md$/.test(rel)) {
      const text = fs.readFileSync(from, 'utf8');
      if (!includeDrafts && text.includes(TODO_MARK)) { drafts.push(rel); return; }
      if (redactText(text) !== text) flagged.push(rel);
    }
    const to2 = path.join(dest, rel);
    fs.mkdirSync(path.dirname(to2), { recursive: true });
    fs.copyFileSync(from, to2);
    copied.push(rel);
  };

  for (const tree of COPY_TREES) {
    const root2 = path.join(src, tree);
    if (fs.existsSync(root2)) for (const f of walk(root2)) copyFile(path.relative(src, f).split(path.sep).join('/'));
  }
  for (const f of COPY_FILES) if (withDashboard || f !== 'dashboard.html') copyFile(f);

  // docs/index.md and README.md are rebuilt for the delivered set so they never link to withheld files.
  const docsDelivered = copied.filter((f) => f.startsWith('docs/') && f.endsWith('.md') && f !== 'docs/index.md');
  const group = (re) => docsDelivered.filter((f) => re.test(f));
  const link = (f) => `- [${f.replace(/^docs\//, '')}](${f.replace(/^docs\//, '')})`; // index.md lives inside docs/
  const audit = fullAudit(project);
  writeText(path.join(dest, 'docs', 'index.md'), `# ${app} — documentation index

${[['Overview & guides', /^docs\/(product-overview|user-guide|ui-patterns|limitations)\.md$/], ['Modules', /^docs\/modules\//], ['Forms and fields', /^docs\/forms-and-fields\//], ['Workflows', /^docs\/workflows\//], ['Technical', /^docs\/technicals\//], ['Source repository analysis', /^docs\/repo\//]].map(([t, re]) => (group(re).length ? `## ${t}\n${group(re).map(link).join('\n')}` : '')).filter(Boolean).join('\n\n')}
`);
  const sections = [['Suggestions', copied.filter((f) => f === 'reports/suggestions.md')], ['Route inventory', copied.filter((f) => f === 'routes/route-inventory.md')], ['Coverage report', copied.filter((f) => f === 'reports/completeness.md')], ['Interactive dashboard', copied.filter((f) => f === 'dashboard.html')]].filter(([, l]) => l.length);
  writeText(path.join(dest, 'README.md'), `# ${app} — research deliverable

Prepared ${nowIso().slice(0, 10)} by WebAppLens · scope: ${project.manifest().scope} · target: ${project.manifest().base_url}

## At a glance
| Area | Result |
|---|---|
| Pages explored | ${audit.routes.explored} of ${audit.routes.total} discovered (${audit.routes.blocked} blocked, ${audit.routes.failed} failed) |
| Screenshots | ${audit.screenshots.total_files} |
| Forms inventoried | ${audit.forms.inventoried} |
| Documents delivered | ${docsDelivered.length} |

Start with [documentation index](docs/index.md).${sections.length ? '\n\n' + sections.map(([t, l]) => `- **${t}:** [${l[0]}](${l[0]})`).join('\n') : ''}

## How to read this
Findings are tagged by evidence: *observed* (seen in the application), *inferred* (reasoned from behaviour) and *hypothesis/proposed* (needs verification). Technology, data-model and architecture sections are **inferred or proposed** unless stated otherwise. See [limitations](docs/limitations.md) for what was not verified.
${drafts.length ? `\n## Not included (still in progress)\n${drafts.map((d) => `- ${d}`).join('\n')}\n` : ''}`);
  const links = validateLinks(dest);
  return { to: dest, copied: copied.length, drafts_withheld: drafts, flagged_for_review: flagged, broken_links: links.broken, links_checked: links.checked };
}
