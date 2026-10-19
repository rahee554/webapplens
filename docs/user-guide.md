<p align="center"><img src="../assets/logo.svg" width="360" alt="WebAppLens"></p>

# WebAppLens user guide

A friendly, complete guide for business owners, designers and developers. If you only want the 60-second version, read the [README](../README.md) first.

**Contents**

1. [What WebAppLens is for](#1-what-webapplens-is-for)
2. [Prerequisites](#2-prerequisites)
3. [Installation](#3-installation)
4. [Using it from your agent](#4-using-it-from-your-agent) (slash commands, preflight, auto mode, marketplaces, roundtable)
5. [Supplying credentials safely](#5-supplying-credentials-safely)
6. [Running the CLI directly](#6-running-the-cli-directly)
7. [Reading the output folder](#7-reading-the-output-folder)
8. [Resuming and tuning limits](#8-resuming-and-tuning-limits)
9. [The safety model](#9-the-safety-model)
10. [Troubleshooting](#10-troubleshooting)
11. [FAQ](#11-faq)
12. [Glossary](#12-glossary)
13. [Contributing](#13-contributing)

---

## 1. What WebAppLens is for

WebAppLens is a **platform-neutral agent skill** (`skills/webapp-research/`: a `SKILL.md`, a Node command-line tool, and sixteen role playbooks in `skills/webapp-research/agents/`). It works as a Claude Code plugin or skill with role subagents, with OpenAI Codex CLI, and with any other coding agent that can read a Markdown instruction file and run shell commands. Together they study a web application the way a careful analyst would: they open it, click around safely, take screenshots, list every page, form and button, and then write up what they found.

The result is two layers of documentation:

- **Plain-English layer**: what each module does, how a user completes common tasks, what the screens look like. For people who do not code.
- **Technical layer**: routes, form fields, observed network calls, authentication, a suggested data model and an implementation guide. For developers and AI coding agents.

Every claim is tagged with the **kind of evidence** behind it and a **confidence level**, so you can tell "we saw this" from "we guess this".

### How you benefit: concrete scenarios

| Scenario | Before | After |
|---|---|---|
| **A business owner wants a lighter alternative to a big ERP.** | Sit through sales demos; take notes by hand; forget half of it. | Point it at the public demo. Get a module-by-module guide with screenshots and a list of what could not be verified. |
| **A designer needs a reference for "good" inventory screens.** | Hundreds of manual screenshots with no structure. | Screenshots organised per route, tabs and dialogs, plus a mobile view and a UI-patterns summary. |
| **A developer must rebuild a legacy admin panel nobody documented.** | Click through every page, guess the forms, read minified JS. | A route inventory, every form with its fields, the API calls seen in the browser, and a suggested data model marked as hypothesis. |
| **A team wants an AI coding agent to build a comparable product.** | The agent hallucinates features. | Hand it the research folder: structured files with evidence tags, so it builds from facts and flags guesses. |
| **An analyst must pick three products to study.** | Gut feeling and a spreadsheet. | Mode D ranks candidates with a transparent weighted score and caps scores for demos nobody verified. |

WebAppLens does **not** copy source code, bypass logins, or replace legal review. It documents what is visible to an authorized user.

---

## 2. Prerequisites

| Need | Details |
|---|---|
| **Node.js 22 or newer** | `node --version`. Declared in `package.json` as `>=22`. |
| **Git** | To clone the repository. |
| **An AI coding agent** | Claude Code, Codex CLI or another agent. Only needed for the natural-language workflow (modes A to D). The CLI works without any agent. |
| **About 300 MB disk** | For the Chromium browser that Playwright downloads. |
| **Network access** | To reach the app you research, and for your agent's own model calls. |

The only npm dependency is `playwright` (about version 1.58). Data is stored as JSON, JSONL and Markdown files. There is no database.

---

## 3. Installation

WebAppLens is **platform-neutral**: the skill is plain Markdown plus a Node CLI. The canonical copy lives in `skills/webapp-research/` in this repository:

```
skills/webapp-research/
  SKILL.md        the instructions any agent reads first
  agents/         sixteen role playbooks (research-orchestrator.md, skeptic.md, roundtable-moderator.md, ...)
  references/     auto-mode.md, roundtable.md, marketplaces.md/.json, modes, safety, evidence, ...
  scripts/        cli.mjs and its libraries
  package.json    the single dependency (playwright)
```

A small installer, `scripts/install.mjs`, copies it to wherever your agent platform looks for skills. Every route ends with `doctor`, which launches a real browser to prove everything works.

### The installer in one table

```bash
git clone https://github.com/<your-username>/webapplens.git
cd webapplens
node scripts/install.mjs --platform claude --dry-run     # preview, writes nothing
```

Run it from the project you want to equip (it installs into the **current directory** by default).

| Option | Effect |
|---|---|
| `--platform claude` | Skill to `.claude/skills/webapp-research/`, role files to `.claude/agents/`. |
| `--platform codex` | Skill to `.codex/skills/webapp-research/`, plus a pointer block in `AGENTS.md`. |
| `--platform agents` | Skill to `.agents/skills/webapp-research/` (cross-tool convention), plus a pointer block in `AGENTS.md`. |
| `--platform all` | All three of the above. |
| `--dest DIR` | Copy the skill to `DIR/webapp-research/` and nothing else (use for any custom layout). |
| `--scope project\|user` | `project` (default) installs under the current directory; `user` installs under your home directory. No `AGENTS.md` pointer is written for `user` scope. |
| `--install-deps` | Also runs `npm install --omit=dev` inside the installed skill folder. |
| `--dry-run` | Print what would happen, copy nothing. |

The `AGENTS.md` pointer is a short block between `<!-- webapplens:start -->` and `<!-- webapplens:end -->` markers. It is **idempotent**: re-running the installer replaces that block instead of duplicating it, and leaves the rest of your `AGENTS.md` alone. After installing without `--install-deps`, the installer prints the next step:

```bash
cd <installed skill folder> && npm install && npx playwright install chromium && node scripts/cli.mjs doctor
```

**What is tested.** The installer's Claude Code and generic/Codex layouts are covered by this repository's tests. Other platforms' conventions change over time and were not tested; for them use the generic route (3c).

### 3.0 Claude Code plugin (recommended for Claude Code)

```text
/plugin marketplace add rahee554/webapplens
/plugin install webapplens@webapplens
/webapplens:setup
```

The plugin bundles the slash commands (`commands/`), the `webapp-research` skill and the role subagents. `/webapplens:setup` runs the requirements check and, with your OK, installs what is missing (see [Preflight](#preflight-and-one-command-setup)). The sections below are for installing without the plugin.

### 3a. Claude Code (manual install)

**Project-level** (only that project can use it): from your project root,

```bash
node /path/to/webapplens/scripts/install.mjs --platform claude
cd .claude/skills/webapp-research
npm install
npx playwright install chromium
node scripts/cli.mjs doctor
```

**User-level** (every project): `node /path/to/webapplens/scripts/install.mjs --platform claude --scope user`, then run the `cd ~/.claude/skills/webapp-research` sequence above from there.

Or manually: copy `skills/webapp-research/` to `.claude/skills/webapp-research/` and the files from `skills/webapp-research/agents/` to `.claude/agents/`.

Alternatively, run Claude Code inside a clone of this repository after `node scripts/install.mjs --platform claude` there.

### 3b. OpenAI Codex CLI

```bash
node /path/to/webapplens/scripts/install.mjs --platform codex --install-deps
cd .codex/skills/webapp-research
npx playwright install chromium
node scripts/cli.mjs doctor
```

This puts the skill under `.codex/skills/webapp-research/` and adds a block to `AGENTS.md` telling the agent to read `.codex/skills/webapp-research/SKILL.md` when asked to research a web app. Then ask Codex in plain language, for example "Research the app at https://demo.example.com, read-only, and document it".

### 3c. Any other agent (Cursor, Gemini CLI, Copilot agent, Aider, Windsurf, and so on)

Everything the agent needs is Markdown plus a command-line tool, so any agent that can **read an instruction file** and **run shell commands** can use it:

1. Install the skill somewhere in your project: `node scripts/install.mjs --platform agents --install-deps` (installs `.agents/skills/webapp-research/` and an `AGENTS.md` pointer), or `--dest some/folder` for a layout of your choice.
2. Make sure the agent's own instruction file mentions it. Many tools read `AGENTS.md` natively. For others, paste the same two sentences into that tool's file (for example `GEMINI.md`, `.cursor/rules`, `.github/copilot-instructions.md`, `CONVENTIONS.md` for Aider, or Windsurf rules):

   > When asked to research, explore, map or document a web application, read `.agents/skills/webapp-research/SKILL.md` and follow it. The CLI is `node .agents/skills/webapp-research/scripts/cli.mjs`.

3. Run `npx playwright install chromium` and `doctor` once in the skill folder.

Be aware: those file names and conventions are different per tool and change often, and only the Claude Code and generic/Codex layouts are covered by this project's tests. If your tool does not pick up the instruction file, just tell it in the chat: "Read `<path>/SKILL.md` and follow it."

### 3d. npm (work inside this repository)

```bash
git clone https://github.com/<your-username>/webapplens.git
cd webapplens
npm install
npx playwright install chromium
npm test          # runs unit and integration tests (starts Chromium)
npm run doctor    # same as: node skills/webapp-research/scripts/cli.mjs doctor
npm run demo      # crawls the bundled test fixture app and rebuilds examples/research/DemoShop/
```

`npm install` prints a reminder to run `npx playwright install chromium`. Do not skip it: the Playwright package does not include the browser itself. Inside the repository the CLI is `node skills/webapp-research/scripts/cli.mjs`.

### 3e. Windows PowerShell (copy-paste block)

User-level Claude Code install, then a check:

```powershell
git clone https://github.com/<your-username>/webapplens.git
Set-Location webapplens
node scripts\install.mjs --platform claude --scope user
Set-Location "$env:USERPROFILE\.claude\skills\webapp-research"
npm install
npx playwright install chromium
node scripts\cli.mjs doctor
```

No Node? You can copy by hand instead of running the installer:

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.claude\skills" | Out-Null
New-Item -ItemType Directory -Force "$env:USERPROFILE\.claude\agents" | Out-Null
Copy-Item -Recurse -Force skills\webapp-research "$env:USERPROFILE\.claude\skills\"
Copy-Item -Recurse -Force skills\webapp-research\agents\* "$env:USERPROFILE\.claude\agents\"
```

Setting environment variables for credentials (see [section 5](#5-supplying-credentials-safely)):

```powershell
# Lasts only for this PowerShell window:
$env:ACME_USERNAME = 'demo@example.com'
$env:ACME_PASSWORD = 'your-password'

# Persists for your Windows user (open a NEW terminal afterwards to see it):
[Environment]::SetEnvironmentVariable('ACME_USERNAME', 'demo@example.com', 'User')
[Environment]::SetEnvironmentVariable('ACME_PASSWORD', 'your-password', 'User')
```

`$env:NAME = '...'` only lasts for the current session. Persisted values are stored in your user profile in plain text, so use them only for throwaway or test accounts.

### 3f. macOS / Linux (bash equivalent)

```bash
git clone https://github.com/<your-username>/webapplens.git
cd webapplens
node scripts/install.mjs --platform claude --scope user
cd ~/.claude/skills/webapp-research
npm install && npx playwright install chromium
node scripts/cli.mjs doctor

# credentials for the current shell only
export ACME_USERNAME='demo@example.com'
read -rs -p 'Password: ' ACME_PASSWORD && export ACME_PASSWORD   # keeps it out of history
```

On Linux, if Chromium fails to start because of missing system libraries, run `npx playwright install-deps chromium` (may need `sudo`).

### What `doctor` prints

```
webapp-research doctor
  ok   node: 22.x.x
  ok   playwright: module found
  ok   chromium: launched and rendered a page
```

Any `FAIL` line says what to fix. See [Troubleshooting](#10-troubleshooting).

---

## 4. Using it from your agent

Open your agent in the project where you installed the skill and describe the job in normal language. In Claude Code you can also type `/webapp-research` to invoke the skill explicitly. In Codex or another agent, say "use the webapp-research skill" or "read `<path>/SKILL.md` and follow it" if it does not pick the skill up by itself.

### How the roles are driven

The work is split into sixteen roles, each described in `skills/webapp-research/agents/<role>.md`: `research-orchestrator`, `product-discovery`, `demo-access-researcher`, `browser-reconnaissance`, `workflow-analyst`, `ui-ux-analyst`, `technical-analyst`, `documentation-engineer`, `completeness-auditor`, `roundtable-moderator`, `skeptic`, `ui-researcher`, `tech-stack-analyst`, `improvement-suggester`, `solution-architect` and `repo-analyst`. Every role reads the shared blackboard before it starts and posts a hand-off when it is done (see [Roundtable](#roundtable)).

- **Claude Code (with subagents).** The installer copies the role files to `.claude/agents/`. Claude Code subagents cannot start other subagents, so the **main Claude session** (or a session started with `claude --agent research-orchestrator`) acts as the orchestrator and hands independent work to the specialists. Only `browser-reconnaissance` drives the crawler, so there is one browser session at a time.
- **Platforms without subagents (Codex, Cursor, Gemini CLI, Aider, ...).** The **single agent plays each role in sequence**: it reads `agents/research-orchestrator.md` to plan the job, then reads the matching role file as it reaches each step (discovery, reconnaissance, workflow analysis, UI analysis, technical analysis, documentation, completeness audit) and does that role's work itself before moving on. Nothing is lost except parallelism; the CLI, the evidence rules and the completeness audit are identical.

### The four modes

| Mode | Use it when | Example prompt |
|---|---|---|
| **A. Existing product** | You know the product and want it documented. | `/webapp-research Research Odoo Inventory through its public demo at https://demo.odoo.com. Document every module and screen. Read-only.` |
| **B. Topic or module across products** | You care about one capability (say, approval workflows or invoicing), not one product. | `Research how SaaS HR tools handle leave requests. Pick three products with accessible demos and document the leave-request flow in each.` |
| **C. Your credentials** | You have a test account for an app you are allowed to explore. | `Explore https://staging.acme.test with my test account. The username and password are in env vars ACME_USERNAME and ACME_PASSWORD. Do not submit any forms.` |
| **D. Discover and compare** | You do not know which product to study yet. | `Find open-source CRMs with a free public demo. Rank them for research suitability and show the scoring.` |

### Slash commands (Claude Code plugin)

| Command | Use it to |
|---|---|
| `/webapplens:research <url \| product \| topic> [--auto] [--profile quick\|standard\|deep\|auto]` | Run a full research job. The mode (A to D) is inferred from your arguments. |
| `/webapplens:audit <App \| dir>` | Run the completeness audit plus a skeptic pass on an existing project. |
| `/webapplens:discover <topic> [--marketplaces id,id]` | Find products and public demos (including marketplaces) and verify published demo credentials with one login attempt. |
| `/webapplens:compare <topic \| candidates.json> [--top N]` | Mode D scoring and ranking. |
| `/webapplens:roundtable <App \| dir>` | Convene the blackboard rounds (analysis, cross-review, decisions) on an existing project. |
| `/webapplens:setup [--yes]` | Check requirements and install what is missing after asking. |
| `/webapplens:status [App \| dir]` | Show state, coverage per metric and open board items. |

On other agents there are no slash commands: say what you want in plain language and the agent follows `SKILL.md`.

### Preflight and one-command setup

Before the first run the agent calls `doctor --json`. If something is missing it does not just stop: it tells you exactly what is missing, shows the install commands and asks **"May I install X?"**. After your yes it runs `setup --yes` (which does `npm install --omit=dev` in the skill folder and `npx playwright install chromium`, then re-verifies) and continues. In auto mode it installs Playwright and Chromium without asking. A missing or too-old Node is never installed for you: you get the fix instructions. By hand:

```bash
webapp-research doctor --json      # {ok, checks:[{id,ok,detail,fix}], install_plan:[commands]}
webapp-research setup              # prints the plan only
webapp-research setup --yes        # installs, then re-verifies
```

### Interactive and auto mode

Interactive is the default: the agent asks at decision points (sandbox or production, scope, crawl profile, installs, trying published demo credentials, extra roundtable rounds). Auto mode (`--auto`, or tell the agent "auto") uses the recommended settings, equivalent to `--profile auto`: deep limits, dialog openers, responsive captures and tabs on, read-only GraphQL queries allowed, and automatic re-crawl rounds while a limit was the stop reason.

Auto mode still stops and asks for: missing credentials, CAPTCHA or MFA, any Category B or C action, authorization or legal ambiguity, and installing software that was not pre-authorized. It records the assumptions it made in the final report. The full decision table is in [`references/auto-mode.md`](../skills/webapp-research/references/auto-mode.md).

### Marketplace and demo discovery

Modes A, B and D also search marketplaces for products and their public demos: CodeCanyon/Envato and ThemeForest live previews, SaaS directories (G2, Capterra, Product Hunt, AlternativeTo), open-source catalogues (GitHub, SourceForge), WordPress, Shopify and Odoo app stores, AppSumo and vendor sites.

```bash
webapp-research discover-queries "school management" --marketplaces codecanyon,github,vendor-demo --json
webapp-research demo-probe https://demo.example.com/login          # writes .webapplens/docs/_discovery/demo.example.com-probe.json
webapp-research demo-login .webapplens/docs/_discovery/demo.example.com-probe.json --index 0 --save-to SchoolDemo
```

The agent runs the printed queries with its web-search tool. The probe records, from public visible text only, the login form, CAPTCHA/MFA presence, demo links and any demo credentials with the page they came from. `demo-login` makes **exactly one** attempt, refuses when CAPTCHA or MFA is present, and with `--save-to` stores the verified credentials in that project's git-ignored `credentials.json` with source URL, verification status and date.

Rules: public pages only; respect robots and each site's terms; only vendor- or marketplace-published demo credentials; never guessed, never from leaked lists, never past CAPTCHA/MFA; credentials never leave the project. Details: [`references/marketplaces.md`](../skills/webapp-research/references/marketplaces.md).

### Roundtable

The roundtable is how agents collaborate. They share an append-only blackboard at `<project>/roundtable/board.jsonl`:

1. **Independent analysis**: each analyst posts findings (`evidence`, `proposal`) without reading the others first.
2. **Cross-review and objections**: everyone reads the board; the `skeptic` challenges claims, evidence types and confidence; owners `answer`.
3. **Synthesis and decisions**: the `roundtable-moderator` closes every open item with a `decision` and records `dissent` instead of hiding disagreement.

```bash
webapp-research board post Acme --role skeptic --type objection --to technical-analyst --text "Multi-tenancy is stated as fact; evidence?"
webapp-research board read Acme --open          # unanswered questions and objections
webapp-research board decide Acme --ref 4 --decision "Label as hypothesis, low" --dissent skeptic
webapp-research board summary Acme              # writes reports/roundtable.md
```

Run it with `/webapplens:roundtable <App>` or as part of `/webapplens:research`. Protocol and an example transcript: [`references/roundtable.md`](../skills/webapp-research/references/roundtable.md).

### Mode D scoring

Candidates are scored 0 to 5 on five criteria, weighted and converted to a 0-100 total:

| Criterion | Weight |
|---|---|
| Relevance to your need | 35 |
| Coverage of the modules you care about | 25 |
| Demo access | 20 |
| Documentation available | 10 |
| Researchability (can it be crawled safely?) | 10 |

Every non-zero score should cite an evidence URL; otherwise the candidate is flagged. A demo-access score above 3 is **capped at 3 unless the demo was actually verified**. Fewer than the requested number of credible candidates produces a short list, not filler. You can reproduce a ranking with the [`compare` command](#compare).

### Tips for good prompts

- Give the **URL**, the **mode** or intent, and the **scope** ("only the Sales module").
- Say whether you are authorized to test the app.
- Say how much time you are willing to spend ("a quick pass, about 30 pages").
- Ask for the output you need: "business-owner summary first".

---

## 5. Supplying credentials safely

Rules the tool follows:

- Passwords are **never** accepted on the command line. `--password` is rejected on purpose, because command lines end up in shell history.
- Passwords are registered with a redactor and removed from logs and evidence.
- The login session is saved to `<project>/.secrets/storage-state.json`, which is git-ignored.
- The tool will not bypass CAPTCHA or multi-factor prompts.

### Option 1: environment variables (preferred)

Each research project has a `credentials.json` that holds **only the names** of the variables, never the values:

```json
{
  "username_env": "ACME_USERNAME",
  "password_env": "ACME_PASSWORD"
}
```

Create the project with the names you want, set the variables, then crawl:

```bash
node skills/webapp-research/scripts/cli.mjs init Acme --url https://staging.acme.test \
     --mode C --username-env ACME_USERNAME --password-env ACME_PASSWORD --login-path /login
export ACME_USERNAME='tester@acme.test'
export ACME_PASSWORD='...'          # PowerShell: $env:ACME_PASSWORD = '...'
node skills/webapp-research/scripts/cli.mjs crawl Acme
```

If you do not pass `--username-env/--password-env`, `init` generates names from the app name, such as `ACME_USERNAME` and `ACME_PASSWORD`.

### Option 2: a credentials file

```bash
node skills/webapp-research/scripts/cli.mjs crawl Acme --credentials-file ./my-creds.json
```

where the file looks like `{ "username": "...", "password": "..." }`. Keep it outside the repository or make sure it matches the `.gitignore` rules (`**/credentials.json`, `*.local.json`). Order of precedence: credentials file, then environment variables, then plain values inside the project's `credentials.json` (works, but prints a warning; avoid it).

### Option 3: an existing session

If a site uses CAPTCHA or MFA, log in yourself in a Playwright browser, save the storage state to `<project>/.secrets/storage-state.json`, and re-run `crawl`. Sessions are reused automatically when present.

Use a **test or demo account** with the least privilege that is useful. Never use an administrator account on a production system.

---

## 6. Running the CLI directly

The CLI is `node skills/webapp-research/scripts/cli.mjs <command>` (inside this repository; after an installer run use the installed path instead, for example `node .claude/skills/webapp-research/scripts/cli.mjs`, `.codex/skills/...` or `.agents/skills/...`). In the examples below it is shortened to `webapp-research`. Commands write into `.webapplens/docs/` by default; change that with `--out <dir>` (a global option). Run the commands from the folder where you want that directory to live.

```bash
alias webapp-research='node skills/webapp-research/scripts/cli.mjs'
```

(PowerShell: `function webapp-research { node skills/webapp-research/scripts/cli.mjs @args }`)

### doctor

Checks Node (22 or newer), the Playwright module and launches a real Chromium page. With `--json` it prints `{ok, checks:[{id,ok,detail,fix}], install_plan:[shell commands]}`.

```bash
webapp-research doctor
webapp-research doctor --json
```

### setup

Prints the install plan. With `--yes` it runs `npm install --omit=dev` in the skill folder and `npx playwright install chromium`, then re-verifies. Without `--yes` it installs nothing: the agent must ask you first (unless in auto mode).

```bash
webapp-research setup [--yes] [--json]
```

### discover-queries, demo-probe, demo-login

```bash
webapp-research discover-queries "<topic>" [--marketplaces id,id] [--json]   # queries from references/marketplaces.json
webapp-research demo-probe <url> [--out DIR]                                  # default out .webapplens/docs
webapp-research demo-login <probe.json> [--index N] [--save-to <App|dir>]     # one login attempt; prints {ok, reason}
```

See [Marketplace and demo discovery](#marketplace-and-demo-discovery).

### board

```bash
webapp-research board post <App|dir> --role R --type proposal|objection|evidence|question|answer|decision|handoff|dissent --text "..." [--to role] [--ref ID] [--round N]
webapp-research board read <App|dir> [--role R] [--since N] [--open]
webapp-research board decide <App|dir> --ref ID --decision "..." [--dissent role]
webapp-research board summary <App|dir>
```

The blackboard file is `<project>/roundtable/board.jsonl`. `--open` shows unanswered questions and objections.

### accept

Marks an expected failed or blocked route (for example a genuine dead link) as accepted, so it no longer counts as an open issue but stays listed.

```bash
webapp-research accept Acme R031 --reason "genuine 404: dead link in the footer"
```

### probe

Read-only GET of extra pages through the saved session and the mutation guard. This is the safe way to inspect pages the crawl missed; do not hand-write browser scripts.

```bash
webapp-research probe Acme https://app.acme.test/reports/12 --screenshot --text
```

### init

Creates `.webapplens/docs/<AppName>/` with config, empty registries and a credentials template.

```bash
webapp-research init DemoShop --url http://127.0.0.1:4310
webapp-research init Acme --url https://staging.acme.test --mode C --scope "Sales and Inventory only" \
    --username-env ACME_USERNAME --password-env ACME_PASSWORD --login-path /login \
    --allow-origin https://cdn.acme.test
```

| Flag | Meaning |
|---|---|
| `--url` | Base URL (required). |
| `--out` | Parent folder for research projects (default `.webapplens/docs`). |
| `--mode A\|B\|C\|D` | Research mode label stored in the manifest (default `C`). |
| `--scope "text"` | Human-readable scope, stored in the manifest. |
| `--username-env`, `--password-env` | Names of env vars holding the credentials. |
| `--login-path` | Login page path (default `/login`). |
| `--allow-origin URL` | Extra origin the crawl may visit (repeatable). |

Running `init` again on an existing project does nothing harmful ("Already exists").

### crawl

Explores the app read-only and **resumes automatically**.

```bash
webapp-research crawl DemoShop
webapp-research crawl DemoShop --max-pages 300 --max-depth 5 --time-budget 1800
webapp-research crawl DemoShop --probe-openers --responsive
webapp-research crawl Acme --credentials-file ./my-creds.json --headed
webapp-research crawl Shop --allow-post "/graphql$" --exclude "/billing" --exclude "/export"
webapp-research crawl Sandbox --sandbox        # only for environments you may modify
```

| Flag | Meaning |
|---|---|
| `--max-pages N` | Stop after N pages (default 150). |
| `--max-depth N` | Link depth from the start page (default 4). |
| `--max-per-template N` | Examples visited per dynamic route such as `/customers/:id` (default 3). |
| `--time-budget SEC` | Time limit per run (default 900). |
| `--profile quick\|standard\|deep\|auto` | Choose a limit set. `auto` = recommended settings: deep limits, openers + responsive + tabs on, read-only GraphQL queries allowed, automatic re-crawl rounds while a limit was the stop reason. Also accepted by `init`. |
| `--auto` | Alias of `--profile auto`. |
| `--probe-openers` | Also click "Add / New / Create / Edit / Filters" buttons to reveal dialogs. Off by default. POSTs stay blocked. |
| `--responsive` | Also capture a mobile-size screenshot for a few routes. |
| `--headed` | Show the browser window (useful for watching it work). |
| `--credentials-file FILE` | JSON file with `username` and `password`. |
| `--sandbox` | Lift the mutation guard. Only for throwaway environments. |
| `--allow-post REGEX` | Let matching POST URLs through (for read-only APIs such as GraphQL). Repeatable. |
| `--exclude REGEX` | Skip matching URLs. Repeatable. |

The command prints a JSON summary such as `{"status":"paused","stop_reason":"max_pages",...}`. If it paused, run the same command again.

### report

Rebuilds all generated Markdown (index, route inventory, completeness report, module pages, screenshot links) **and `dashboard.html`** from the collected data and prints the audit.

```bash
webapp-research report DemoShop
```

Files you or the agents author by hand (for example `docs/workflows/*.md`) are not overwritten; generated files carry a `generated:webapp-research` comment on the first line.

### viewer

Rebuilds **only** the interactive `dashboard.html` (handy after adding evidence or screenshots). Prints the path it wrote.

```bash
webapp-research viewer DemoShop
```

### audit

Completeness metrics plus a Markdown link check. Writes `reports/completeness.md`.

```bash
webapp-research audit DemoShop
webapp-research audit DemoShop --json       # machine-readable
webapp-research audit DemoShop --strict     # exit code 1 if any open issue (good for CI)
```

### observe

Records one piece of evidence.

```bash
webapp-research observe DemoShop --type observed \
    --claim "The Customers list shows name, email and Edit/Delete actions" \
    --route R002 --source http://127.0.0.1:4310/customers \
    --screenshot screenshots/all/customers.png --confidence high
```

Types: `observed`, `verified_interaction`, `official_docs`, `public_source`, `inferred`, `hypothesis`. Confidence: `high`, `medium`, `low`. If you omit confidence it defaults sensibly (high, medium for inferred, low for hypothesis). Inferences cannot be `high` and hypotheses are always `low`.

### classify

Shows how the tool would categorise a control (A, B or C, see [section 9](#9-the-safety-model)).

```bash
webapp-research classify "Delete customer"          # C
webapp-research classify "Save" --type submit       # B
webapp-research classify "Next" --role link         # A
```

### compare

Ranks product candidates for Mode D from a JSON file.

```bash
webapp-research compare candidates.json --top 5
webapp-research compare candidates.json --top 3 --out comparison.md
```

Minimal `candidates.json`:

```json
{
  "candidates": [
    {
      "name": "ExampleCRM",
      "website": "https://example-crm.test",
      "modules": ["Contacts", "Deals"],
      "scores": { "relevance": 5, "coverage": 4, "demo_access": 5, "docs": 3, "researchability": 4 },
      "evidence": {
        "relevance": ["https://example-crm.test/features"],
        "coverage": ["https://example-crm.test/features"],
        "demo_access": ["https://demo.example-crm.test"],
        "docs": ["https://docs.example-crm.test"],
        "researchability": ["https://demo.example-crm.test"]
      },
      "demo": { "url": "https://demo.example-crm.test", "access_type": "public", "registration_required": false, "verification_status": "verified" },
      "limitations": "Reports module is disabled in the demo"
    }
  ]
}
```

Scores are 0 to 5. You may add a `"weights"` object to change the defaults (35/25/20/10/10); weights are re-normalised. Missing evidence URLs and unverified demos show up in a Flags column.

### validate-links

Checks that relative Markdown links in a folder are not broken.

```bash
webapp-research validate-links .webapplens/docs/DemoShop
```

Prints `N links checked, M broken` and exits with code 1 if any are broken.

---

## 7. Reading the output folder

Everything for one app lives in `.webapplens/docs/<AppName>/`. `.webapplens/` is a hidden folder in the root of the project you are researching from; commit it or ignore it as you prefer (the CLI writes `.webapplens/.gitignore` for `_discovery/`, `**/.secrets/` and `**/credentials.json`). The roundtable blackboard is `roundtable/board.jsonl` and its summary `reports/roundtable.md`. Generate a ready example with `npm run demo` (writes `examples/research/DemoShop/`, git-ignored). To be clear about it: that folder is **real output of the tool**, but of a **small fixture app we built for the test suite** (`tests/fixtures/demo-app`), not a real product. Use it to see the shape of the results, not as research about any actual software.

### The interactive dashboard (`dashboard.html`)

The `report` command also writes `dashboard.html` into the project folder. It is a **self-contained interactive page**: open it by double-clicking the file in any browser, no server or internet needed. It contains:

- a **verdict banner** with the careful completeness wording;
- **metric cards**, each with its definition;
- a **filterable routes table**;
- a **screenshot gallery** with a lightbox for full-size viewing;
- a **forms explorer**;
- an **evidence list** with type and confidence;
- **limits and open items**;
- **light and dark** themes.

Run `viewer <AppName>` to rebuild only this page (see the [CLI reference](#viewer)). A ready example is `examples/research/DemoShop/dashboard.html` (open it locally after cloning; GitHub shows HTML files as source). Because the dashboard embeds your screenshots and data, review it as you would the rest of the folder before sharing.

| Path | What it is | Who it is for |
|---|---|---|
| `README.md` | Status and links to start from. | Everyone |
| `dashboard.html` | Interactive viewer of everything below (rebuilt by `report` or `viewer`). | Everyone |
| `docs/index.md` | Table of contents of the generated docs. | Everyone |
| `docs/product-overview.md` | What the product is and does, in plain words. | Owners, designers |
| `docs/user-guide.md` | How a user works with the product. | Owners |
| `docs/modules/*.md` | One page per module, with screenshots. | Everyone |
| `docs/workflows/*.md` | Step-by-step task descriptions (authored by the workflow analyst). | Owners, developers |
| `docs/forms-and-fields/*.md` | Every form and its fields (type, required or optional). | Developers, designers |
| `docs/ui-patterns.md` | Layout, navigation and component patterns seen. | Designers |
| `docs/limitations.md` | What could not be done or verified. | Everyone |
| `docs/technicals/*.md` | Architecture, routes, data model, authentication, authorization, observed API, design system, integrations, implementation guide, unknowns, evidence and confidence. | Developers, AI agents |
| `routes/route-inventory.md` | Table of every route with status, access, forms, controls and a screenshot link. | Everyone |
| `routes/routes.json`, `forms.json`, `controls.json` | The same data in machine-readable form. | AI agents, scripts |
| `screenshots/all/` | One main screenshot per explored route. | Everyone |
| `screenshots/modules/` | Tabs and sections of a page. | Designers |
| `screenshots/interactions/` | Opened dialogs and mobile (`--mobile`) views. | Designers |
| `screenshots/manifest.json` | Index of every screenshot. | Scripts |
| `evidence/observations.jsonl` | One evidence record per line: claim, type, confidence, source. | Auditors, AI agents |
| `evidence/network-summary.json` | API calls seen in the browser. | Developers |
| `reports/completeness.md` | Coverage metrics and open issues. | Everyone |
| `reports/findings.md`, `unresolved-items.md` | Highlights and the to-do list. | Everyone |
| `crawlers/` | Config, resumable state, failures, run manifest. | Tool |
| `.secrets/`, `credentials.json` | Session and credential names. **Git-ignored. Never share.** | Nobody |
| `logs/research.log` | Run log (secrets redacted). | Debugging |

Files starting with `<!-- generated:webapp-research ... -->` are rewritten by the `report` command. Do not hand-edit those; write your own notes in separate files.

### The completeness report

It deliberately shows **separate numbers** rather than one flattering percentage:

- **Routes explored / total**: blocked and failed routes stay in the denominator.
- **Accessible coverage**: explored plus partial routes, out of all routes that were not blocked.
- **Partial / blocked / failed / remaining**: access restrictions never disappear into the average.
- **Screenshot coverage**, **documentation coverage**.
- **Forms inventoried** and **submit-tested** (usually 0 outside a sandbox).
- **Controls catalogued** with their A/B/C category and how many were actually **exercised**.
- **Workflows documented** and **technical docs complete** (docs with no unresolved `TODO(agent)` marker).
- **Sampling note**: how many dynamic-route variants were intentionally skipped.

The **verdict** is worded carefully. For example, "QUEUE EXHAUSTED, WITH OPEN ITEMS: every discovered in-scope URL was visited ... This does not mean every control or workflow was tested." It will never say "fully explored".

### Evidence types and confidence

| Evidence type | Meaning | Typical confidence |
|---|---|---|
| `observed` | Seen directly in the app. | high |
| `verified_interaction` | Confirmed by an authorized interaction (for example in a sandbox). | high |
| `official_docs` | Stated in the vendor's documentation. | high |
| `public_source` | Confirmed by public source code. | high |
| `inferred` | Deduced from UI behaviour. Never "high". | medium |
| `hypothesis` | A proposal that needs checking. Always "low". | low |

When building from this research, trust `observed` and `verified_interaction` most, and treat `hypothesis` items (such as a suggested database schema) as starting points.

---

## 8. Resuming and tuning limits

**Resume.** The crawler saves its state after every page. If it stops (page limit, time budget, Ctrl+C, a crash), run the **same command** again and it continues where it left off. To go further, add higher limits:

```bash
webapp-research crawl Acme --max-pages 400 --time-budget 3600
```

**Why a crawl stops.** The JSON summary shows `stop_reason`: `queue_exhausted` (nothing left to visit), `max_pages`, `time_budget`, or `interrupted`.

**Limits and defaults.**

| Setting | Flag | Default |
|---|---|---|
| Pages per project | `--max-pages` | 150 |
| Link depth | `--max-depth` | 4 |
| Examples per dynamic route | `--max-per-template` | 3 |
| Time per run (seconds) | `--time-budget` | 900 |

Command-line limits apply to that run. For permanent changes, or for options that have no flag (delay between pages, navigation timeout, viewport, login selectors, `maxOpenersPerPage`, retries), edit `.webapplens/docs/<AppName>/crawlers/config.json`. If login fails on an unusual form, set `auth.userSelector`, `auth.passwordSelector` and `auth.submitSelector` there.

**Large sites.** Start small (`--max-pages 50`), read the route inventory, then use `--exclude` to skip noisy areas (help centres, exports, blogs) and raise the limit.

---

## 9. The safety model

WebAppLens assumes it could be wrong about what a button does, so it protects you in layers.

| Layer | What it does |
|---|---|
| **Mutation guard** | In the browser, every request that is not GET, HEAD or OPTIONS is aborted. This is the main protection. |
| **Sandbox switch** | `--sandbox` lifts the guard. Use it only on an environment you may change. |
| **Read-only POST allow-list** | GraphQL and some search APIs use POST for reading. `--allow-post REGEX` lets only matching URLs through. |
| **Action categories** | Each control is classified before anything is clicked (table below). |
| **Link rules** | Logout, sign-out and delete links are never followed. |
| **Origin allow-list** | The crawl stays on the app's own origin (plus any `--allow-origin`). External links are only recorded. |
| **CAPTCHA and MFA** | Detected, reported, never bypassed. |
| **Untrusted content** | Text on a website is treated as data, not as instructions to the agents (prompt-injection defence). |
| **Secrets** | Env vars or git-ignored file; never on the command line; redacted from logs and evidence. |

### Action categories

| Category | Meaning | Examples | What happens |
|---|---|---|---|
| **A: safe** | Only reads or navigates. | View, search, filter, next page, tabs, menus, close. | Done automatically. |
| **B: controlled** | Creates or changes data, or unknown. | Save, add, create, edit, import, upload, submit. | Not submitted in normal runs. Needs a sandbox or explicit authorization. Unknown labels land here ("when in doubt, do not click"). |
| **C: consequential** | Hard to undo or affects other people or money. | Delete, remove, send, publish, approve, pay, invite, archive, log out. | Never automatic. Needs explicit approval. |

Try it: `webapp-research classify "Place order"`.

---

## 10. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `Playwright not found` | `npm install` not run in the skill folder (or repo root). | `cd` to the folder with `package.json` and run `npm install`. As a fallback, `npm i -g playwright`. |
| `Executable doesn't exist` / browser not installed | Chromium was never downloaded. | `npx playwright install chromium`. On Linux also `npx playwright install-deps chromium`. |
| `doctor` shows `FAIL node` | Node too old. | Install Node 22 or newer. |
| Login rejected | Wrong or expired credentials, or an unusual login form. | Check the env vars are set in the **same terminal**; check `--login-path`; set `auth.*Selector` in `crawlers/config.json`; try `--headed` to watch. |
| `captcha_present` | The login has a CAPTCHA. | By design it is not bypassed. Log in yourself, save the session to `.secrets/storage-state.json`, or use a demo without CAPTCHA. |
| `mfa_required` | Multi-factor prompt. | Same as above, or use a test account without MFA. |
| App shows empty lists or "cannot load" (GraphQL / POST-only apps) | The mutation guard also blocks read-only POST APIs. | Add `--allow-post "/graphql"` (a regex matching only the read endpoint). Avoid `--sandbox` unless safe. |
| Pages marked `blocked` (403) | The account lacks permission. | Reported as blocked on purpose; it stays in the metrics. Use a role with access if you are allowed to. |
| Pages marked `failed` (404, timeouts) | Dead link or slow server. | Check `crawlers/failures.json`; raise `navTimeoutMs` in `config.json`. |
| Crawl keeps stopping | Hit a limit. | Re-run the same command; raise `--max-pages` / `--time-budget`. |
| Huge site, crawl crawling forever | Too many sections. | Start with `--max-pages 50`, then `--exclude` noisy paths. |
| Few routes in a single-page app | Navigation uses non-semantic click targets (divs). | Expected limitation. Add `--probe-openers`, add known URLs to `startPaths` in `config.json`, and note gaps in the report. |
| Windows `EPERM` / `EBUSY` / path-too-long | A terminal or editor has the folder open, antivirus is scanning, or the path is very long. | Close programs using the folder, run from a shorter path (such as `C:\work\`), re-run. Do not `cd` into a folder you are about to delete. |
| `Not a research project` | Wrong working directory or name. | Run from the folder that contains `.webapplens/docs/`, or pass the full directory, or use `--out`. |
| Screenshots look blank | Page needed more time to render. | Raise `navTimeoutMs`/`delayMs` in `config.json`. |

---

## 11. FAQ

**Is it legal to use?**
Only research applications you own, have written permission to test, or that publish a demo meant for public use. Respect each site's terms of service and robots rules. WebAppLens is a technical tool, not legal advice. Do not use it to copy proprietary content or code.

**Does it send my data anywhere?**
No. Crawling, storage and report generation happen on your machine, in local files. The only outside traffic is (1) requests to the app you research and (2) your AI agent's own model calls when you use it (so the text of pages and files the agent reads is processed by that model provider, as in any agent session). Using only the CLI sends nothing to any model.

**Can it bypass a login, CAPTCHA or MFA?**
No. You supply a legitimate account; CAPTCHA and MFA are detected and reported, never bypassed.

**Will it change or delete data in the app?**
Not in normal runs: every non-GET request is blocked in the browser and delete/logout links are never followed. In a `--sandbox` run, that guard is lifted, so only do that on disposable environments.

**Does "complete" mean everything was tested?**
Never. Coverage is split into separate metrics and the verdict avoids "fully explored". Dynamic routes are sampled, and forms are not submit-tested outside a sandbox.

**Can I share the research folder?**
Read it first. Screenshots are **not redacted at pixel level**, so they can contain personal data from the app. `.secrets/` and `credentials.json` are git-ignored; the research output in `.webapplens/docs/` is yours to commit or ignore; review screenshots before committing.

**Can I run it on a schedule or in CI?**
Yes for the CLI: `audit --strict` exits with code 1 when issues are open, and `validate-links` exits 1 on broken links.

**Where is the database?**
There is none. Everything is JSON, JSONL and Markdown files that you can diff and commit.

---

## 12. Glossary

| Term | Meaning |
|---|---|
| **Agent / subagent / role** | A specialist role described in `skills/webapp-research/agents/*.md`. Claude Code can run roles as subagents; other platforms play them one after another. |
| **Skill** | A bundle of instructions and scripts an agent loads on demand (`skills/webapp-research/`, installed by `scripts/install.mjs`). |
| **AGENTS.md** | A plain instruction file read by Codex and many other agents; the installer adds a short pointer block to it. |
| **Dashboard** | `dashboard.html`, the self-contained interactive viewer written next to a project's README. |
| **Orchestrator** | The main session (or `research-orchestrator`) that delegates to subagents. |
| **Mode A / B / C / D** | Existing product / topic across products / your credentials / discover and compare. |
| **Route** | A page address inside the app, such as `/customers`. |
| **Route template** | A route with a variable part, written `/customers/:id`. |
| **Sampling** | Visiting only a few examples (default 3) of each route template. |
| **Control** | A clickable or interactive element: button, link, tab, menu. |
| **Opener** | A button that usually opens a dialog or form (Add, New, Edit, Filters). |
| **Mutation guard** | Browser-level block on every non-GET/HEAD/OPTIONS request. |
| **Sandbox** | A disposable environment where changes are acceptable; `--sandbox` lifts the guard. |
| **A / B / C category** | Safe / controlled / consequential action. |
| **Evidence type** | How we know a claim: observed, verified_interaction, official_docs, public_source, inferred, hypothesis. |
| **Confidence** | high, medium or low trust in a claim. |
| **Coverage** | Separate metrics describing how much of the app was reached; never a promise of completeness. |
| **Storage state** | A saved browser login session, kept in `.secrets/storage-state.json`. |
| **SPA** | Single-page application: pages change without full reloads. |
| **GraphQL** | An API style that uses POST even for reads; needs `--allow-post`. |
| **Prompt injection** | Text on a web page trying to give instructions to an AI. WebAppLens treats page text as untrusted data. |
| **Resume** | Re-running the same `crawl` command to continue from saved state. |

---

## 13. Contributing

Want to improve WebAppLens? See [CONTRIBUTING.md](../CONTRIBUTING.md) for how to set up, run the tests and submit changes.

## Precise scope, specialist research and delivery (0.2.0)

**Precise scope.** `intent "<request>"` prints the minimum facets, commands, outputs, what is skipped and the questions still worth asking. `init`/`crawl --focus ui,stack,screenshots,forms,workflows,data-model,api,architecture,suggestions,docs` runs only those scans (default `full`). Example: "only UI colours and tech stack, no screenshots" -> `--focus ui,stack`, no screenshots captured, no screenshot coverage demanded.

**Interactive chat.** `/webapplens:chat` asks a short batch of questions, works one stage at a time and checkpoints with 2-4 next-step options until you say done. `--auto` decides with recommended defaults and still stops for credentials, CAPTCHA/MFA, risky actions and authorization questions. `wr status "<App>"` resumes or recaps cheaply.

**Specialist commands.**

| Command | Result |
|---|---|
| `wr suggest "<App>"` | `reports/suggestions.md` and `evidence/suggestions.json` |
| `wr architect "<App>" --stack laravel\|prisma\|django\|sql\|auto` | `docs/technicals/proposed-schema.md`, `architecture-baseline.md` (PROPOSED) |
| `wr repo-scan <folder> --name "<App>"` | `docs/repo/*.md`, `evidence/repo-scan.json` |
| `wr deliver "<App>" [--to DIR] [--include-drafts] [--no-dashboard]` | client-ready docs in `docs/research/<App>` |
| `wr update-check [--force] [--json] [--quiet]`, `wr update [--yes]` | version check / update |

**UI and stack research** happen during `crawl` (focus `ui` / `stack`) and appear as `docs/technicals/design-system-observed.md`, `design-tokens.json`, `tech-stack.md` and as Design / Tech stack / Suggestions tabs in `dashboard.html`. The design scan samples computed styles; colour roles are inferred. Stack detection is passive and every technology is inferred.

**Workspace vs deliverables.** `.webapplens/` holds the agent's state, evidence, drafts and credential references. `deliver` copies only finished docs (no `TODO(agent)` markers), screenshots, the suggestions and coverage reports and the dashboard into your project root, rebuilds README/index for exactly that set, flags secret-looking text for review and validates links.

**Updating.** Plugin: `/plugin marketplace update webapplens` then `/plugin update webapplens@webapplens`. Other installs: the agent runs `update-check`, tells you, and asks before `update --yes` (git installs `git pull --ff-only`; copied installs are backed up to `~/.webapplens/backups`, refreshed, and `npm install` is re-run).
