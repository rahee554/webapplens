# Output layout (`.webapplens/docs/<AppName>/`)

Owner: **tool** = written by the CLI during crawl · **gen** = rewritten by `report` (has `generated:webapp-research` marker) · **agent** = created once from a template with `TODO(agent)` markers, then yours.

```
README.md                      gen   status, verdict, entry points
dashboard.html                 gen   interactive report (open in a browser; self-contained)
research-manifest.json         tool  id, mode, scope, versions
credentials.json               user  env-var NAMES only (git-ignored); never put passwords in reports
.secrets/storage-state.json    tool  saved session (git-ignored)
routes/routes.json             tool  route registry (id, template, status, screenshots, nav…)
routes/forms.json              tool  every form/fields inventory (ids F…)
routes/controls.json           tool  controls per route with A/B/C category + exercised flag
routes/route-inventory.md      gen
screenshots/all|modules|interactions/*.png   tool   + screenshots/manifest.json
docs/index.md, limitations.md  gen
docs/modules/<module>.md       gen   plain-English page descriptions with screenshots
docs/forms-and-fields/<module>.md  gen
docs/product-overview.md, ui-patterns.md, user-guide.md   agent
docs/workflows/*.md            agent (workflow-analyst)
docs/technicals/routes.md, modules.md, api-observed.md, evidence-and-confidence.md   gen
docs/technicals/architecture|data-model|api-analysis|authentication|authorization|integrations|design-system|workflows|implementation-guide|unknowns.md   agent
crawlers/config.json           user  limits, scope, auth selectors
crawlers/state.json            tool  queue, done list, skipped counts, stop reason (resume point)
crawlers/failures.json, run-manifest.json   tool
evidence/observations.jsonl    tool/agents via `observe`
evidence/network-summary.json  tool  XHR/fetch templates, per-route console/network errors, blocked requests
reports/completeness.md, findings.md, unresolved-items.md   gen
reports/roundtable.md          gen   `board summary` output (decisions, dissent, open items)
roundtable/board.jsonl         tool/agents via `board post|decide` (append-only blackboard)
logs/research.log              tool  redacted
```

Route statuses: `discovered, queued, in_progress, explored, partial, blocked, failed, needs_verification`.

Outside a project: `.webapplens/docs/_discovery/<host>-probe.json` (from `demo-probe`, git-ignored via `.webapplens/.gitignore`). `.webapplens/` is a hidden folder in the root of the project being researched; `--out DIR` changes the parent (default `.webapplens/docs`).
