# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
