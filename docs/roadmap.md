# Roadmap

What exists, and what might come next. Items marked **PLANNED** are ideas we intend to pursue but have not built; nothing here is a commitment or a date. Priorities change with feedback, so open an issue or discussion to argue for something.

Related: [architecture](architecture.md#implemented-versus-planned) · [crawler design](crawler-design.md) · [security](security.md) · [CONTRIBUTING](../CONTRIBUTING.md#good-first-issue-ideas)

## Principles for deciding

1. Safety and honesty come before breadth. A feature that makes the tool do more to a target needs a stronger case than one that makes it safer or its reports more accurate.
2. Stay small: one runtime dependency, files instead of services.
3. Platform neutrality: the skill stays plain Markdown plus a Node CLI.
4. Never add features whose purpose is to bypass CAPTCHA, MFA, paywalls, or rate limits. Those are out of scope permanently.

## Implemented in 0.2.0 (unreleased)

- Claude Code plugin packaging (`.claude-plugin/`) and `/webapplens:*` slash commands
- `doctor --json` and `setup [--yes]` (preflight with ask-to-install)
- Marketplace discovery: `discover-queries` and `references/marketplaces.json`
- Public demo probing and single-attempt demo login with published credentials (`demo-probe`, `demo-login`)
- Roundtable blackboard (`board post|read|decide|summary`) with `roundtable-moderator` and `skeptic` roles (sixteen roles in total)
- Auto mode (`--profile quick|standard|deep|auto`, `--auto`) and `references/auto-mode.md`
- `accept` for expected failed/blocked routes and `probe` for read-only extra pages
- Research output moved to the hidden `.webapplens/docs/<AppName>/` folder

## Implemented (0.1.0)

- Read-only, resumable Chromium crawler with mutation guard and scope policy
- Inspector for links, controls, forms and fields, tables, pagination, dialogs, technology markers
- Screenshots (full page, tabs, dialogs, mobile) and manifest
- XHR/fetch summary and per-route diagnostics
- Evidence types with confidence caps, central redaction
- Generated and agent-owned documentation, coverage audit, link validation
- Mode D weighted comparison
- Nine role playbooks, installer for Claude Code, Codex CLI, and generic agent directories
- Unit and integration tests, CI on Ubuntu, Windows, macOS

## Near term (PLANNED)

| Item | Why | Notes |
|---|---|---|
| Align `doctor` Node check with `engines` (22) | `doctor` currently accepts Node 20 | Small fix with a test; good first issue |
| Screenshot redaction masks | Screenshots may show personal data; the manifest has `redacted` but no masks yet | Config of CSS selectors covered before capture; must default to safe |
| HAR export (redacted) | Better evidence of calls than the summary | Opt-in; redact headers and bodies by default |
| Accessibility-tree snapshots | Richer input for the UI/UX analyst | Stored per route as text |
| robots.txt awareness option | Some owners express crawl preferences there | Opt-in; record skipped paths in limitations |
| More tests for classification phrasing | Unknown labels fail closed, but coverage of real phrasing helps | Table-driven |

## Medium term (PLANNED)

| Item | Why | Notes |
|---|---|---|
| Firefox and WebKit (`--browser`) | Rendering and compatibility differences | The guard and tests must pass per browser; `doctor` checks the chosen one |
| OpenAPI skeleton from observed calls | Faster start for an API analysis | Output labeled `inferred`, never a contract |
| More login adapters | Multi-step logins, iframe logins, SSO redirects | Never bypass CAPTCHA or MFA; stop and report |
| Translated generated documentation | Reach non-English readers | Message table in `lib/docs.mjs`; agent-owned docs follow the user's language |
| Additional platform targets in the installer | Wider adoption | Driven by `platform` issue reports with hand-verified details |
| Better SPA discovery | Apps that never change URL | Opt-in click exploration within category A only |

## Exploring (PLANNED, uncertain)

- Diffing two research runs of the same app to show what changed
- Optional authenticated-session import helpers for sites with MFA (the user logs in; the tool reuses the session), with clear warnings
- Role comparison: crawl the same app with two roles and diff what each can see
- An additional agent role such as an accessibility reviewer
- Packaging as an npm package or release artifact

## Not planned

- CAPTCHA, MFA, paywall, or rate-limit bypass
- Guessing or reusing leaked credentials
- Automatic form submission or data-changing actions outside a confirmed sandbox workflow driven by a person
- Replacing the file-based project format with a database or server

## How to help

Pick an item above or from the [good first issue ideas](../CONTRIBUTING.md#good-first-issue-ideas), and comment on the matching issue before starting. If you would like something added, open a feature request and say which problem it solves.
