// Builds the sample research project in examples/research/DemoShop by crawling the bundled
// fixture app. Everything in that folder is real output of the tool (plus one workflow doc
// derived from the inventoried dialog form, labelled as such).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer, DEMO_USER, DEMO_PASS } from '../tests/fixtures/demo-app/server.mjs';
import { initProject } from '../skills/webapp-research/scripts/lib/project.mjs';
import { crawl } from '../skills/webapp-research/scripts/lib/crawler.mjs';
import { generateDocs } from '../skills/webapp-research/scripts/lib/docs.mjs';
import { addObservation } from '../skills/webapp-research/scripts/lib/evidence.mjs';
import { writeText } from '../skills/webapp-research/scripts/lib/util.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'examples', 'research');
// Clear children, not the folder itself (a shell sitting inside it blocks removal on Windows).
const target = path.join(out, 'DemoShop');
if (fs.existsSync(target)) for (const e of fs.readdirSync(target)) fs.rmSync(path.join(target, e), { recursive: true, force: true });

const app = await startServer(4310).catch(() => startServer(0));
process.env.DEMOSHOP_USERNAME = DEMO_USER;
process.env.DEMOSHOP_PASSWORD = DEMO_PASS;
try {
  const { project } = initProject({ outRoot: out, app: 'DemoShop', baseUrl: app.url, mode: 'C', scopeText: 'entire accessible application (bundled fixture)', config: { probeOpeners: true, responsive: { enabled: true, maxRoutes: 3 }, delayMs: 50, auth: { required: true } } });
  console.log(await crawl(project, {}));

  // One example of agent-authored analysis, derived strictly from inventoried data.
  const dlg = project.forms().find((f) => f.in_dialog);
  const route = project.routes().find((r) => r.id === dlg?.route_id);
  if (dlg) {
    writeText(path.join(project.p.docs, 'workflows', 'add-customer.md'), `# Add a customer

**Status of evidence:** the form was *observed* (opened, not submitted). What happens after Save is **not verified**.

1. Open **Customers** (\`${route.template}\`).
2. Select **Add Customer**. A dialog named "${dlg.label}" opens.
3. Fill in the fields:
${dlg.fields.map((f) => `   - **${f.label}** (${f.type}${f.required ? ', required' : ', optional'})`).join('\n')}
4. Select **${dlg.submit.join(' / ') || 'Save'}** — *only in a sandbox*; the research run blocked this request.

Screenshot: ![Add customer dialog](../../screenshots/interactions/customers--dialog-add-customer.png)
`);
    addObservation(project, { type: 'inferred', claim: 'Customers have a name, email and type; email is validated in the browser (type=email).', route_id: route.id, confidence: 'medium', notes: 'Derived from form fields only; server-side rules unknown.' });
    addObservation(project, { type: 'hypothesis', claim: 'A customer table likely exists with name/email/type columns.', route_id: route.id, notes: 'Proposed schema only; not verified.' });
  }
  const audit = generateDocs(project);
  console.log(audit.verdict);
  console.log('Mutating requests that reached the server:', app.stats.mutations.length, '| logout hits:', app.stats.logoutHits);
} finally {
  await app.close();
}
