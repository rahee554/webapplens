# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - Unreleased

### Added
- **Claude Code plugin**: `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`; install with `/plugin marketplace add rahee554/webapplens` and `/plugin install webapplens@webapplens`.
- **Slash commands** (`commands/`): `/webapplens:research`, `audit`, `discover`, `compare`, `roundtable`, `setup`, `status`.
- **Preflight**: `doctor --json` (checks with fixes and an install plan) and `setup [--yes]`; agents tell the user what is missing, ask "May I install X?" and then install and continue (auto mode installs Playwright/Chromium automatically).
- **Marketplace & demo discovery**: `discover-queries`, `references/marketplaces.json` and `references/marketplaces.md` (CodeCanyon/Envato, ThemeForest, GitHub, SourceForge, SaaS directories, app stores, vendor demos); `demo-probe` and `demo-login` (one login attempt, vendor-published credentials only, source URL and date recorded).
- **Roundtable**: shared append-only blackboard (`roundtable/board.jsonl`) with `board post|read|decide|summary`, new roles `roundtable-moderator` and `skeptic`, `references/roundtable.md`, and a `## Communication` section in every role playbook.
- **Auto mode**: `--profile quick|standard|deep|auto` and `--auto` on `init`/`crawl`; `references/auto-mode.md` (decision table and mandatory stops).
- **Precise scope**: `intent "<request>"` maps a request to the minimum facets, commands, outputs, skipped work and open questions; `init/crawl --focus ...` runs only what was asked (no screenshots unless requested, no unrelated doc templates, no screenshot coverage demanded). Negation ("no screenshots") is understood. `status` gives a compact project state so agents do not re-read reports.
- **UI & theme research** (`--focus ui`): computed-style scan -> `design-system-observed.md` and `design-tokens.json` (palette by frequency, type scale, spacing grid fit, radii, shadows, buttons/inputs/cards/tables, layout, breakpoints, CSS variables, dark mode, WCAG contrast estimate). Role names are inferred.
- **Tech-stack detection** (`--focus stack`): ~60 passive signatures (headers, cookie names only, script URLs, meta, DOM markers, globals) -> `tech-stack.md`; every technology is an inferred observation with confidence by independent signals; passive security header and cookie-flag observations.
- **Improvement suggester**: `suggest` -> `reports/suggestions.md` (accessibility, usability, design consistency, performance/reliability, passive security, outdated tech) with evidence, severity, effort and quick wins.
- **Repo/folder analysis**: `repo-scan` (stack, routes from code, data model from migrations/Prisma/SQL/Django/Rails, Eloquent relations, env var names; never reads `.env`, keys or credentials).
- **Architecture designer**: `architect` -> `proposed-schema.md` (PROPOSED entities, relations, CRUD API outline, starter schema for Laravel/Prisma/Django/SQL, ER diagram) and `architecture-baseline.md`.
- **Client deliverables**: `deliver` publishes finished docs from the `.webapplens` workspace to `docs/research/<App>` in the project root, withholds unfinished docs, never copies credentials/state/logs/evidence, flags secret-looking text, validates links.
- **Updates**: `VERSION` file, `update-check` (cached, silent offline, read-only), `update [--yes]` (plugin / git / copied installs), a plugin SessionStart hook, and a test that keeps all version files in sync (`scripts/sync-plugin.mjs`).
- **Roles and commands**: five new roles (`ui-researcher`, `tech-stack-analyst`, `improvement-suggester`, `solution-architect`, `repo-analyst`; sixteen total) and slash commands `/webapplens:chat|ui|stack|suggest|architect|repo|deliver|update`; the interactive chat session (`references/interactive-session.md`, `intake.md`).
- Dashboard tabs for Design (swatches, typography, buttons as rendered), Tech stack and Suggestions.
- `accept` (mark expected failed/blocked routes) and `probe` (read-only extra pages through the saved session and mutation guard).

### Changed
- Default output location is now the hidden `.webapplens/docs/<AppName>/` in the root of the researched project (discovery probes in `.webapplens/docs/_discovery/`); `--out` still overrides the parent.
- `SKILL.md` restructured (preflight, interaction mode, roundtable, marketplace discovery); role count is now sixteen.
- README, user guide, agent design, roadmap and landing page updated for the above.

## [Unreleased]

### Added
- Community and governance files: `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, issue and pull request templates, CI workflow, Dependabot, CODEOWNERS, label definitions.
- Design documentation under `docs/`: architecture, security, crawler design, agent design, data model, research methodology, setup, troubleshooting, roadmap.

## [0.1.0] - 2026-10-19

Initial release.

### Added
- **Skill** `skills/webapp-research/` with `SKILL.md` (name and description frontmatter), five reference documents (`modes`, `crawler`, `safety`, `evidence`, `output-layout`), and a Mode D `candidates.example.json` template.
- **Crawler** built on Playwright (Chromium): resumable queue checkpointed after every page; route templating (`/customers/:id`) with sampling of dynamic routes; hash-route support; SPA-friendly navigation expansion (`aria-expanded` groups); tab clicking; optional dialog probing (`--probe-openers`) and mobile-viewport screenshots (`--responsive`); automatic browser restart after a crash; time, page, and depth budgets; form-based login with saved session in `.secrets/`.
- **In-page inspector** that inventories links, controls, forms and fields (type, required, options, constraints, current validity), tables, pagination, dialogs, breadcrumbs, and technology markers, with secret-looking field defaults withheld.
- **CLI** (`skills/webapp-research/scripts/cli.mjs`) with commands `doctor`, `init`, `crawl`, `report`, `audit`, `observe`, `classify`, `compare`, `validate-links`.
- **Safety model**: mutation guard that aborts non-GET/HEAD/OPTIONS requests (lifted only by `--sandbox`, narrowed by `--allow-post`); scope policy (allowed origins, default excludes for logout/delete links, downloads skipped); A/B/C action classification where unknown labels count as B; CAPTCHA and MFA detection that stops instead of bypassing; downloads disabled and service workers blocked.
- **Secret handling**: environment-variable or git-ignored credentials, `--password` rejected, central redaction (`lib/redact.mjs`) applied to logs, evidence, and URLs, with the login password registered as a literal secret.
- **Evidence model**: six evidence types (`observed`, `verified_interaction`, `official_docs`, `public_source`, `inferred`, `hypothesis`) with confidence levels and enforced caps; idempotent JSONL observation store.
- **Documentation generation**: generated files (marked `generated:webapp-research`) for route inventory, per-module pages, form and field tables, technical route/module/API-observed/evidence pages, limitations, README and index; agent-owned documents created once with `TODO(agent)` markers; relative-link validation.
- **Coverage audit** with separate metrics for routes, accessible routes, screenshots, documentation, forms, controls, workflows, and technical docs; verdict wording that never claims a site is fully explored.
- **Mode D scoring** (`compare`): transparent weighted ranking with evidence requirements and a cap on unverified demo access.
- **Nine role playbooks** in `skills/webapp-research/agents/`: research-orchestrator, product-discovery, demo-access-researcher, browser-reconnaissance, workflow-analyst, ui-ux-analyst, technical-analyst, documentation-engineer, completeness-auditor.
- **Tests**: unit tests (routes, scope, safety classification, storage, evidence, redaction, credentials, screenshots, coverage, link validation, scoring) and integration tests against a bundled fixture app with a real Chromium (authenticated crawl, mutation guard, form inventory, resume, crash recovery, failure handling, secret scan).
- **Fixture app** `tests/fixtures/demo-app/server.mjs` and a regenerated sample research project at `examples/research/DemoShop` (`npm run demo`). The fixture is a toy app for tests, not a real product.
- **Installer** `scripts/install.mjs` for Claude Code, OpenAI Codex CLI, and generic agent skill directories.
- **Platform neutrality**: the skill relies only on Markdown instructions and a shell-invoked Node CLI, so any agent that can read Markdown and run commands can use it; Claude Code subagent frontmatter is used for the role playbooks.
- Documentation: `README.md` and `docs/user-guide.md`.

### Fixed
- Inspector crash when a form contained `<input name="name">` (DOM clobbering shadowed `form.name`); attributes are now read with `getAttribute`. Regression test added.
- A Settings page with a password field was misdetected as a login page; login detection now also requires a redirect, a login-like path, or a form that is little more than a login form. Regression test added.

[Unreleased]: https://github.com/<your-username>/webapplens/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/<your-username>/webapplens/releases/tag/v0.1.0
