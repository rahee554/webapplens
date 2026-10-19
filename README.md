<div align="center">

<img src="assets/logo.png" alt="WebAppLens logo" width="560">

### A universal AI-agent skill that researches web applications — safely, with evidence.

Point **Claude Code**, **Codex** or any agent that can read Markdown and run a command at a SaaS, ERP, CRM, admin panel or product demo.
Get back a map of every reachable page, real screenshots, form and control inventories, an interactive dashboard, and documentation that a business owner **and** a developer can build from. Install it as a **Claude Code plugin** and drive it with `/webapplens:*` slash commands.

[![License: MIT](https://img.shields.io/badge/license-MIT-4f46e5.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A5%2022-3c873a.svg)](package.json)
[![Playwright](https://img.shields.io/badge/browser-Playwright%20%2F%20Chromium-45ba4b.svg)](https://playwright.dev)
[![Works with](https://img.shields.io/badge/works%20with-Claude%20Code%20%C2%B7%20Codex%20%C2%B7%20any%20agent-06b6d4.svg)](#-install)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-ff69b4.svg)](CONTRIBUTING.md)

Created by **Raheel Ahmad** &nbsp;·&nbsp; Powered by [**Artflow Studio**](https://artflow.pk) — Branding & IT Solutions

[**Landing page**](index.html) · [**User guide**](docs/user-guide.md) · [**Contributing**](CONTRIBUTING.md) · [**Roadmap**](docs/roadmap.md)

</div>

---

## Why WebAppLens?

Studying how a product works usually means days of clicking, screenshotting and note-taking — and the result is an opinion, not evidence. Ask a plain AI agent to “explore this app” and it improvises: it clicks Delete, forgets what it saw, and states guesses as facts.

WebAppLens gives the agent a **disciplined method and a safe toolbox**:

| Without it | With WebAppLens |
|---|---|
| Ad-hoc clicking, lost context when the chat ends | A crawler that checkpoints after every page and **resumes** |
| Risk of changing or deleting real data | A browser-level **mutation guard**: every non-GET request is aborted |
| “It probably uses PostgreSQL” | Every finding tagged **observed / inferred / hypothesis** with confidence caps |
| “Fully explored!” | Separate coverage metrics; **never** claims completeness |
| Notes only the author understands | Plain-English docs for owners + technical docs for developers and AI agents |

## What you get

<table>
<tr>
<td width="50%"><img src="assets/dashboard-overview.png" alt="WebAppLens dashboard overview"><br><sub><b>Interactive dashboard</b> — verdict, metrics with definitions, open issues.</sub></td>
<td width="50%"><img src="assets/dashboard-screenshots.png" alt="WebAppLens screenshot gallery"><br><sub><b>Screenshot gallery</b> — primary states, tabs, dialogs, mobile views.</sub></td>
</tr>
</table>

A research project's `dashboard.html` shows the verdict, metrics with their definitions, a filterable route table, a screenshot gallery (primary states, tabs, dialogs, mobile), a forms explorer, evidence and limits — one self-contained file, light and dark.

**See it in 30 seconds, no external site needed:**

```bash
npm install && npx playwright install chromium
npm run demo            # crawls the bundled fixture app and writes examples/research/DemoShop/
```

then open `examples/research/DemoShop/dashboard.html` in your browser.

> **About the demo.** `npm run demo` crawls **DemoShop — a small fixture app we wrote for the test-suite** ([`tests/fixtures/demo-app`](tests/fixtures/demo-app/server.mjs)), not a real product. It exists so the project can be tested without any external service. Demo and test output is git-ignored; run the tool on apps you are authorized to test, or on vendors’ public demos, to see real results.

Every research project is a folder you can read, share and commit. It lives in a **hidden `.webapplens/` folder in the root of the project being researched** (so it stays out of the way); commit it or ignore it, as you prefer. The CLI adds `.webapplens/.gitignore` for secrets and discovery probes.

```text
.webapplens/docs/<AppName>/
├── dashboard.html            ← interactive report (open in any browser)
├── README.md                 ← status + verdict + entry points
├── routes/                   ← route registry, forms.json, controls.json, route-inventory.md
├── screenshots/              ← all/ (pages) · modules/ (tabs) · interactions/ (dialogs, mobile) + manifest
├── docs/
│   ├── modules/*.md          ← plain-English page-by-page guides with screenshots
│   ├── forms-and-fields/     ← every field, type, required flag, options
│   ├── workflows/*.md        ← business workflows (observed vs inferred vs untested)
│   └── technicals/           ← architecture, data model (PROPOSED), API, auth, design system, implementation guide, unknowns
├── evidence/                 ← observations.jsonl (typed + confidence), network summary
├── reports/                  ← completeness, findings, unresolved items, roundtable summary
├── roundtable/               ← board.jsonl: the agents' shared blackboard (append-only)
└── crawlers/                 ← config, resumable state, failures, run manifest
```

## Features at a glance

- **Claude Code plugin** with namespaced slash commands (`/webapplens:research`, `audit`, `discover`, `compare`, `roundtable`, `setup`, `status`)
- **Smart preflight**: missing Node/Playwright/Chromium? The agent tells you exactly what, asks "May I install X?", installs and continues
- **Marketplace & demo discovery**: CodeCanyon/Envato, ThemeForest, SaaS directories, open-source catalogues and app stores, plus vendor-published demo credentials verified with a single login attempt
- **Roundtable**: agents collaborate on a shared blackboard in rounds, with a skeptic and recorded dissent
- **Auto mode**: recommended settings, stops only for what must stay human
- **Eleven role playbooks**, a resumable read-only crawler, evidence tagging and honest coverage

## Who benefits

| You are… | You get… |
|---|---|
| **Business owner / product manager** | A plain-English tour of a competitor or vendor product: what each module does, which fields matter, which workflows exist — with screenshots. |
| **Designer** | A catalogue of real navigation, table, form and dialog patterns with exact routes. |
| **Developer** | Route maps, form specs, observed API calls, proposed data model and acceptance criteria to build a comparable feature. |
| **AI coding agent** | An implementation guide it can follow without repeating the research. |
| **Analyst / consultant** | Evidence-tagged findings, a transparent product-comparison score and honest limits. |

## How it works

```mermaid
flowchart LR
  U([Your request]) --> P[Preflight<br/>doctor · ask to install]
  P --> O[Orchestrator<br/>classify · scope · plan]
  O --> D[Product discovery<br/>marketplaces + demo access]
  D --> B[Browser reconnaissance<br/>read-only Playwright crawl]
  B --> R[(Routes · forms · controls<br/>screenshots · evidence)]
  R --> W[Workflow analyst]
  R --> X[UI/UX analyst]
  R --> T[Technical analyst]
  W & X & T <--> BB{{Blackboard<br/>board.jsonl}}
  BB <--> RT[Roundtable moderator<br/>+ skeptic]
  RT --> G[Documentation engineer]
  G --> A{Completeness auditor}
  A -- gaps --> B
  A -- honest report --> OUT([dashboard.html + docs])
```

A deterministic **Node CLI** does browsing, bookkeeping and coverage maths. Eleven **role playbooks** (`skills/webapp-research/agents/`) guide the agent's judgement: orchestrator, product discovery, demo access, browser reconnaissance, workflow, UI/UX, technical, documentation, completeness audit, plus the roundtable moderator and the skeptic. Agents with sub-agents (Claude Code) delegate; single-agent tools (Codex, Cursor, …) play each role in sequence.

## 🚀 Install

One canonical skill folder — [`skills/webapp-research/`](skills/webapp-research/SKILL.md) — packaged as a Claude Code plugin, plus an installer that puts it where other agents look.

**Claude Code plugin (recommended):**

```text
/plugin marketplace add rahee554/webapplens
/plugin install webapplens@webapplens
/webapplens:setup        # checks Node, Playwright, Chromium and offers to install what is missing
```

**Or clone and use the installer:**

```bash
git clone https://github.com/<your-username>/webapplens && cd webapplens
npm install && npx playwright install chromium
```

| Platform | Command | Installs to |
|---|---|---|
| **Claude Code** (all projects, without the plugin) | `node scripts/install.mjs --platform claude --scope user --install-deps` | `~/.claude/skills/webapp-research` + the role sub-agents in `~/.claude/agents` |
| **Claude Code** (this project) | `node scripts/install.mjs --platform claude --scope project --install-deps` | `.claude/skills`, `.claude/agents` |
| **OpenAI Codex CLI** | `node scripts/install.mjs --platform codex --scope project --install-deps` | `.codex/skills/webapp-research` + pointer block in `AGENTS.md` |
| **Cursor · Gemini CLI · Copilot · Aider · others** | `node scripts/install.mjs --platform agents --scope project --install-deps` | `.agents/skills/webapp-research` + `AGENTS.md` pointer — or `--dest ./tools` and tell your agent to “follow `tools/webapp-research/SKILL.md`” |

<details><summary><b>PowerShell (Windows)</b></summary>

```powershell
git clone https://github.com/<your-username>/webapplens; cd webapplens
npm install; npx playwright install chromium
node scripts/install.mjs --platform claude --scope user --install-deps
node "$env:USERPROFILE\.claude\skills\webapp-research\scripts\cli.mjs" doctor

# credentials: this session only (never paste passwords into chat)
$env:SHOP_USERNAME = 'me@example.com'
$env:SHOP_PASSWORD = Read-Host -MaskInput 'Password'
```
</details>

<details><summary><b>npm package</b></summary>

```bash
npx webapplens install --platform claude --scope user --install-deps   # once published to npm
npx webapplens doctor
```
</details>

Verify: `node <skill-dir>/scripts/cli.mjs doctor` checks Node, Playwright and launches a real Chromium.

> Only the Claude Code and Codex/`.agents` layouts are covered by installer tests. Other tools’ conventions change quickly — the skill itself is just Markdown + a CLI, so if your agent can read `SKILL.md` and run `node`, it works. Found a better layout for your tool? [Open a platform-support issue](.github/ISSUE_TEMPLATE/platform_support.yml).

## Precise by design

WebAppLens does **only what you ask**. `intent` turns a request into the minimum plan before any browsing:

```bash
node skills/webapp-research/scripts/cli.mjs intent "only UI colours and tech stack of https://shop.test, no screenshots"
# facets: ui, stack, routes   · skipped: screenshots (excluded by you), architecture, suggestions, workflows, docs
```

Screenshots are captured only when asked, design/stack scans run only for `ui`/`stack`/`architecture`/`suggestions`, and missing details are asked **once, in one batch**. Prefer a conversation? `/webapplens:chat` runs a continuous session: intake questions, one stage at a time, a checkpoint with next-step options after each stage, until you say done. Prefer hands-off? `--auto` picks the recommended settings and stops only for credentials, CAPTCHA/MFA, risky actions or authorization questions.

## What else can it do?

| Need | Command | You get |
|---|---|---|
| **UI & theme research** | `/webapplens:ui <url>` | Palette by frequency, type scale, spacing grid, radii, shadows, button/input/card/table styles, breakpoints, CSS variables, dark mode, WCAG contrast estimate, `design-tokens.json` |
| **Tech-stack detection** | `/webapplens:stack <url>` | React / Vue / Laravel / WordPress / Odoo / Next.js … with confidence and the signals behind each (always *inferred*), plus passive security-header and cookie-flag observations |
| **Improvement suggestions** | `/webapplens:suggest <url>` | Accessibility, usability, design-consistency, performance, security-header and outdated-tech findings with evidence, severity, effort and quick wins |
| **Architecture designer** | `/webapplens:architect <url or folder>` | PROPOSED data model + ER diagram, API outline, starter schema (Laravel/Prisma/Django/SQL), baseline architecture, then an architecture proposal with roadmap |
| **Repo / folder analysis** | `/webapplens:repo <folder>` | Stack, routes and data model extracted from code, env var **names** (never values), tooling hygiene — documented for a client or developers |
| **Client-ready docs** | `/webapplens:deliver <App>` | Finished docs copied to `docs/research/<App>` in **your project root**; drafts, credentials and raw evidence stay in `.webapplens/` |
| **Competitor / product research** | `/webapplens:discover`, `compare` | Marketplace and vendor demos, verified published credentials, weighted ranking |
| **Docs for your own app** | `/webapplens:research <url \| product \| topic> [--auto]` | Research (modes A–D inferred; runs only what `intent` says) |
| `/webapplens:chat [topic]` | Continuous interactive session: questions, stages, checkpoints |
| `/webapplens:ui <url>` | UI and theme research |
| `/webapplens:stack <url>` | Tech-stack detection |
| `/webapplens:suggest <url \| App>` | Improvement suggestions |
| `/webapplens:architect <url \| folder> [stack]` | Proposed data model, API and architecture |
| `/webapplens:repo <folder>` | Analyse a local repository |
| `/webapplens:deliver <App>` | Client-ready docs into the project root |
| `/webapplens:audit <App>` | Completeness audit plus skeptic pass |
| `/webapplens:discover <topic>` | Products and demos (incl. marketplaces); one verified demo login |
| `/webapplens:compare <topic \| candidates.json>` | Weighted product ranking |
| `/webapplens:roundtable <App>` | Blackboard rounds on an existing project |
| `/webapplens:setup` | Requirements check and guided install |
| `/webapplens:status [App]` | Compact state, coverage, open items |
| `/webapplens:update` | Check for and apply updates (asks first) |

## ⚡ 60-second tour

Ask your agent in plain language:

| Mode | Example prompt |
|---|---|
| **A · Product** | *“Research Odoo and document how its inventory, sales and accounting modules work.”* |
| **B · Topic** | *“Research how SaaS apps implement role & permission management. Write it up for a Laravel developer.”* |
| **C · Your app** | *“Explore https://app.example.com with the account in `APP_USER`/`APP_PASS`. Document every page, form and workflow.”* |
| **D · Compare** | *“Find the 5 best school-management systems with public demos and compare attendance, fees and exams.”* |

Or drive the CLI yourself:

```bash
CLI="node skills/webapp-research/scripts/cli.mjs"
$CLI init "Acme" --url https://app.acme.test --username-env ACME_USER --password-env ACME_PASS
$CLI crawl "Acme" --probe-openers --responsive     # read-only, resumable (re-run to continue)
$CLI report "Acme"                                 # docs + reports + dashboard.html
$CLI audit "Acme"                                  # honest coverage + link check
$CLI observe "Acme" --type inferred --claim "Invoice numbers look sequential" --route R012
$CLI compare candidates.json --top 5               # transparent product scoring (Mode D)
$CLI doctor --json                                 # requirements check (+ install plan)
$CLI discover-queries "school management"          # marketplace-aware search queries
$CLI board read "Acme" --open                      # roundtable blackboard: open questions/objections
```

Try it without any external site: `npm run demo` (see above).

## Smart preflight / one-command setup

Before the first run the agent calls `doctor --json` (Node ≥ 22, the `playwright` module, a real Chromium launch). If something is missing it does **not** just stop:

1. it tells you exactly what is missing and shows the install commands,
2. asks "May I install X?",
3. runs `setup --yes` (`npm install --omit=dev` in the skill folder and `npx playwright install chromium`), re-verifies and carries on.

`setup` without `--yes` only prints the plan. In [auto mode](#auto-mode) Playwright and Chromium are installed without asking; a missing Node is never installed for you.

## Marketplace & demo discovery

Product discovery searches beyond vendor sites: **CodeCanyon/Envato and ThemeForest live previews, SaaS directories (G2, Capterra, Product Hunt, AlternativeTo), open-source catalogues (GitHub, SourceForge), WordPress/Shopify/Odoo app stores and AppSumo**. `discover-queries "<topic>"` prints site-restricted queries per marketplace (data in [`marketplaces.json`](skills/webapp-research/references/marketplaces.json)); your agent runs them with its web-search tool.

Demos and their credentials are found for you, within strict limits:

- `demo-probe <url>` opens the public page read-only and records login form / CAPTCHA / MFA / demo links and credentials **published in visible text**, with the source URL.
- Only vendor- or marketplace-**published** demo credentials are used, verified with **one** `demo-login` attempt. Never guessed, never from leaked lists, never past CAPTCHA/MFA.
- Verified credentials are stored in the project's git-ignored `credentials.json` with source URL, status and date.

Playbook, legal/ToS rules and what counts as published credentials: [`references/marketplaces.md`](skills/webapp-research/references/marketplaces.md).

## Roundtable (multi-agent collaboration)

Agents do not just hand files to each other; they discuss through a shared, append-only **blackboard** (`roundtable/board.jsonl`) in rounds:

1. **Independent analysis** — each analyst posts findings without being anchored by the others.
2. **Cross-review and objections** — peers and the **skeptic** challenge claims, evidence types and confidence.
3. **Synthesis and decisions** — the **roundtable moderator** closes every open item and records dissent instead of erasing it.

Message types: `proposal`, `objection`, `evidence`, `question`, `answer`, `decision`, `handoff`, `dissent`. Commands: `board post | read | decide | summary` (summary writes `reports/roundtable.md`). Protocol and an example transcript: [`references/roundtable.md`](skills/webapp-research/references/roundtable.md).

## Auto mode

Pick **interactive** (default: the agent asks about sandbox, scope, crawl profile, installs, extra rounds) or **auto** (`--auto`, or just say "auto"): the agent uses the recommended settings (`--profile auto`: deep limits, dialog openers, responsive captures, read-only GraphQL queries, automatic re-crawl while a limit was the stop reason) and decides on its own. It still stops for: missing credentials, CAPTCHA/MFA, any Category B/C action, authorization or legal ambiguity, and installing software that was not pre-authorized. Decision table: [`references/auto-mode.md`](skills/webapp-research/references/auto-mode.md).

## 🛡️ Safe by construction

Instructions can be ignored; code can’t. Safety is enforced in the browser layer:

| Category | Examples | Rule |
|---|---|---|
| **A · Observe** | open pages, switch tabs, search, filter, inspect forms | automatic, in scope |
| **B · Test** | create disposable records, submit to see validation | only in a **confirmed sandbox**, with cleanup |
| **C · Consequential** | delete, send, publish, approve, pay, invite | explicit approval, every time |

- **Mutation guard** aborts every non-GET request (lift only with `--sandbox`; read-only POST APIs like GraphQL need `--allow-post`).
- **Scope policy**: origin allow-list, depth/page/time limits; logout and delete links are never followed.
- **No bypassing**: CAPTCHA and MFA are detected and *refused*; no guessed or leaked credentials.
- **Untrusted content**: page text is data — prompt-injection attempts are logged, never obeyed.
- **Secrets**: env vars or a git-ignored file, never argv; redacted from logs and evidence; saved sessions live in git-ignored `.secrets/`.
- **Resumable & honest**: state checkpointed per page; coverage reported per metric; “fully explored” is never claimed.

Details: [`docs/security.md`](docs/security.md) · [`references/safety.md`](skills/webapp-research/references/safety.md).

## Evidence model

| Type | Meaning | Max confidence |
|---|---|---|
| `observed` | seen in the app | high |
| `verified_interaction` | an authorized action and its result | high |
| `official_docs` / `public_source` | vendor docs / public code | high |
| `inferred` | reasoned from UI behaviour | medium |
| `hypothesis` | needs verification | low |

The CLI enforces the caps, so a UI alone can never “confirm” a database schema or backend framework.

## Tested, not just described

`npm test` runs the test suite (unit + integration with a real Chromium against a local fixture app): URL/route templating and sampling, scope enforcement, A/B/C classification, redaction, resume after limits and after a simulated crash, mutation-guard blocking, login failure, form inventory, screenshot manifest, link validation, dashboard safety and installer layouts. Bugs found while building (DOM clobbering of `form.name`, false login detection on a password-change page) each have regression tests.

## Honest limitations

- Screenshots are **not pixel-redacted** — review before publishing.
- Dynamic routes are **sampled** (3 examples per template by default).
- Server-side validation and write workflows are **untested** outside a sandbox.
- Heavily custom SPAs (non-semantic click targets, in-place views) can be partly explored; POST-only read APIs need `--allow-post`.
- Chromium only for now. See the [roadmap](docs/roadmap.md).

## Documentation

[User guide](docs/user-guide.md) · [Architecture](docs/architecture.md) · [Crawler design](docs/crawler-design.md) · [Agent design](docs/agent-design.md) · [Data model](docs/data-model.md) · [Research methodology](docs/research-methodology.md) · [Security](docs/security.md) · [Setup](docs/setup.md) · [Troubleshooting](docs/troubleshooting.md) · [Roadmap](docs/roadmap.md)

## Contributing

WebAppLens is open source and built to be extended — new platform adapters, roles, inspector features, fixtures, docs and real-world compatibility reports are all welcome. Start with [**CONTRIBUTING.md**](CONTRIBUTING.md) (setup, repo tour, how to add a feature, PR checklist) and [`AGENTS.md`](AGENTS.md) if you use an AI agent to contribute. Please read the [Code of Conduct](CODE_OF_CONDUCT.md) and [Security policy](SECURITY.md).

## License

[MIT](LICENSE) © WebAppLens contributors.

---

<div align="center">

Created by **Raheel Ahmad** · Powered by [**Artflow Studio**](https://artflow.pk)

</div>

 Use it on applications you own or are authorized to test, or on public vendor demos.
