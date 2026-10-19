# Data model

Everything WebAppLens knows about a target is stored as JSON, JSONL, and Markdown inside one **research project** folder (default `docs/references/<AppName>/`). This page documents the files and their shapes as written by `skills/webapp-research/scripts/lib/`. Schema version: `1` (`SCHEMA_VERSION` in `lib/project.mjs`).

Related: [architecture](architecture.md) · [crawler design](crawler-design.md) · [security](security.md) · [output layout reference](../skills/webapp-research/references/output-layout.md) · [CONTRIBUTING](../CONTRIBUTING.md)

JSON files are written atomically and pretty-printed. All persisted strings pass through the redactor. Types below are informal; `?` means may be null.

## Folder layout

```
README.md  research-manifest.json  credentials.json  .secrets/storage-state.json  .gitignore
routes/      routes.json  forms.json  controls.json  route-inventory.md
screenshots/ all/  modules/  interactions/  manifest.json
crawlers/    config.json  state.json  failures.json  run-manifest.json
evidence/    observations.jsonl  network-summary.json
docs/        index.md  limitations.md  product-overview.md  ui-patterns.md  user-guide.md
             modules/  forms-and-fields/  workflows/  technicals/
reports/     completeness.md  findings.md  unresolved-items.md
logs/        research.log
```

## `research-manifest.json`

```json
{ "schema_version": 1, "tool_version": "0.1.0", "project_id": "demoshop-3f2a1c",
  "application": "DemoShop", "mode": "C", "scope": "all accessible modules",
  "base_url": "http://...", "created_at": "ISO-8601" }
```

## `crawlers/config.json` (defaults from `DEFAULT_CONFIG`)

| Key | Default | Meaning |
|---|---|---|
| `baseUrl` | (from `init`) | Origin and entry of the target |
| `startPaths` | `["/"]` | Seed URLs relative to `baseUrl` |
| `allowedOrigins` | `[]` | Extra origins in scope |
| `includeSubdomains` | `false` | Treat subdomains of the base host as in scope |
| `exclude` | `[]` | Extra regexes for URLs not to follow (added to the default logout/delete excludes) |
| `maxDepth` | `4` | Link depth limit; deeper links are registered as discovered |
| `maxPages` | `150` | Total pages across resumes |
| `maxPerTemplate` | `3` | Example URLs visited per route template |
| `timeBudgetSec` | `900` | Wall-clock budget for one `crawl` run |
| `delayMs` | `250` | Pause between pages |
| `navTimeoutMs` | `20000` | Navigation and default action timeout |
| `retries` | `2` | Navigation retries (exponential backoff) |
| `maxRestarts` | `3` | Browser restarts after a crash |
| `maxTabsPerPage` | `8` | Tabs clicked per page |
| `maxOpenersPerPage` | `6` | Opener buttons clicked per page (with `probeOpeners`) |
| `viewport` | `{width:1366,height:850}` | Desktop viewport |
| `headless` | `true` | Run without a window (`--headed` overrides) |
| `expandMenus` | `true` | Expand collapsed navigation groups |
| `clickTabs` | `true` | Click tabs and capture each |
| `probeOpeners` | `false` | Click Add/New/Create-style buttons to reveal dialogs |
| `responsive` | `{enabled:false,maxRoutes:5,width:390,height:844}` | Mobile screenshots for the first N routes |
| `sandbox` | `false` | Lifts the mutation guard; only with a confirmed disposable target |
| `allowPostPatterns` | `[]` | Regexes for read-only POST endpoints the guard lets through |
| `persistSession` | `true` | Save login session to `.secrets/storage-state.json` |
| `auth` | `{required:false,loginPath:"/login",userSelector:null,passwordSelector:null,submitSelector:null}` | Login configuration |

`crawl` flags override these for that run only; the file is not rewritten.

## `routes/routes.json`: array of routes

```json
{ "id": "R002", "key": "origin+template", "origin": "http://...", "template": "/customers/:id",
  "url": "first seen", "examples": ["urls visited or queued, max maxPerTemplate"],
  "results": { "<url>": "explored|partial|blocked|failed|in_progress" },
  "title": "string?", "module": "customers", "submodule": "string?",
  "parent": "R001?", "depth": 1, "discovery": "seed|nav|link|tab|opener|redirect",
  "auth_required": "boolean?", "access_status": "unknown|ok|login_required|forbidden|not_found|server_error|navigation_error|redirected_out_of_scope|exception",
  "status": "discovered|queued|in_progress|explored|partial|blocked|failed|needs_verification",
  "screenshots": ["screenshots/all/customers.png"],
  "controls": { "total": 12, "by_category": {"A":4,"B":7,"C":1}, "exercised": 2 },
  "forms": ["F49d9da"], "docs": ["docs/modules/customers.md"], "nav": ["normalized urls"],
  "notes": ["max 30"], "skipped_variants": 0, "last_inspected_at": "ISO?", "failure": "string?",
  "breadcrumbs": [], "headings": [], "tables": [], "pagination": {"present": true, "next": []},
  "has_search": true, "redirect_to": "url?", "responsive": true }
```

`status` is derived from `results` (see `deriveStatus`): all explored is `explored`; some explored or partial is `partial`; all blocked is `blocked`; otherwise `failed`. `needs_verification` is reserved for agents. `tables[]` items: `{caption, headers[], rows, sortable, row_actions[]}`.

## `routes/forms.json`: array of forms

```json
{ "id": "F49d9da", "route_id": "R002", "ui_state": "page | dialog:Add Customer",
  "label": "Add customer", "action": "url?", "method": "POST", "in_dialog": true,
  "fields": [ { "label": "Email", "name": "email", "type": "email", "required": true,
                "placeholder": "", "default": null, "disabled": false, "readonly": false,
                "visible": true, "options": ["select/radio options"], "maxlength": "40",
                "invalid_now": "browser validation message" } ],
  "submit": ["Save"],
  "client_validation": { "required": ["Email"], "invalid_now": [ { "field": "Email", "message": "..." } ] },
  "submit_tested": false, "inspected_at": "ISO" }
```

The id is `F` plus a 6-hex hash of the route template, action, and field names, so re-inspection updates rather than duplicates. A pseudo-form labelled "Standalone controls (search/filters)" collects fields outside any `<form>`. Optional field attributes: `minlength, maxlength, min, max, pattern, step, accept, autocomplete`. Defaults are `null` for password-like, secret-like, and file fields. `submit_tested` stays `false` unless an authorized sandbox interaction set it.

## `routes/controls.json`: object keyed by route id

```json
{ "R002": [ { "label": "Add Customer", "role": "button", "type": "null|submit|button",
              "disabled": false, "in_dialog": false, "nav": false,
              "category": "A|B|C", "exercised": false } ] }
```

Up to 300 per route, de-duplicated by `role|label`. `exercised` is true only for controls the crawler actually clicked (tabs, openers).

## `crawlers/state.json`

```json
{ "project_id": null, "status": "initialized|running|paused|completed",
  "started_at": "ISO?", "updated_at": "ISO",
  "queue": [ { "url": "...", "depth": 1, "parent": "R001", "via": "link" } ],
  "done": ["urls"], "skipped": { "external": 25, "sampled_variant": 38 },
  "skipped_links": [ { "url": "...", "label": "Log out" } ],
  "external_origins": ["https://..."],
  "stats": { "pages_visited": 18, "restarts": 0, "responsive": 3 },
  "stop_reason": "queue_exhausted|max_pages|time_budget|interrupted|null", "agents": {} }
```

This is the resume point. `failures.json` is an array of `{route_id, url, access, reason, at}`. `run-manifest.json` is `{runs:[{run_id, started_at, ended_at, pages_visited_total, stop_reason, restarts, headless, limits, authenticated}]}`.

## `evidence/observations.jsonl`: one JSON object per line

```json
{ "id": "O-e92f3707", "type": "observed", "claim": "...", "confidence": "high|medium|low",
  "route_id": "R001?", "source_url": "?", "screenshot": "path?", "text": "<=300 chars?",
  "verification_status": "verified|unverified", "notes": "?", "observed_at": "ISO" }
```

`type` is one of `observed`, `verified_interaction`, `official_docs`, `public_source`, `inferred`, `hypothesis`. Rules enforced by `makeObservation`: a claim is required; default confidence is high (observed-like), medium (inferred), low (hypothesis); inferred cannot be high; hypothesis is always low; `verification_status` is `verified` for the four evidence-backed types and `unverified` otherwise. The id is a hash of type, claim, route, and source, so re-recording is idempotent. A torn last line (crash) is ignored on read.

## `evidence/network-summary.json`

```json
{ "api_calls": { "GET http://host/api/customers/:id": { "count": 3, "statuses": {"200": 3}, "routes": ["R002"] } },
  "per_route": { "R002": { "console_errors": 0, "page_errors": 0, "failed_requests": 0,
                           "bad_responses": [ { "url": "...", "status": 404 } ], "samples": ["console error text"] } },
  "blocked": [ { "route_id": "R002", "method": "POST", "url": "...", "at": "ISO", "reason": "out of scope (navigation only)" } ] }
```

Only XHR/fetch requests the page made are counted. This is evidence of calls, not an API contract. `blocked` holds up to 100 requests aborted by the guard.

## `screenshots/manifest.json`: array

```json
{ "file": "screenshots/all/home.png", "route_id": "R001", "url": "...", "module": "root",
  "ui_state": "default|tab Name|dialog Name|mobile", "captured_at": "ISO",
  "viewport": { "width": 1366, "height": 850 }, "full_page": true, "related_docs": [],
  "redacted": false, "redaction_note": "No automated pixel redaction; ..." }
```

File names are deterministic from the route template and UI state (`customers--dialog-add-customer.png`), with a short hash suffix on collision between different routes. Recapturing overwrites and upserts the entry.

## `credentials.json` (git-ignored)

Env-var **names** only: `application, base_url, access_type, credentials_source, source_url, verification_status, last_verified_at, username_env, password_env, notes`. Never put a password here.

## Markdown ownership

Generated files start with `<!-- generated:webapp-research ... -->` and are rewritten by `report`. Agent-owned files contain `<!-- TODO(agent): ... -->` until written. See [agent design](agent-design.md).

## Coverage metrics (computed, not stored)

`audit --json` returns routes (total, explored, partial, blocked, failed, remaining, coverage percentages, sampled variants), screenshots, documentation, forms, controls (by category and exercised), workflows, technical docs, unexplored navigation, limits, links, `issues[]`, and a `verdict`. Definitions live in `DEFINITIONS` in `lib/coverage.mjs`.
