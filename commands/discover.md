---
description: Find products and their public demos, including marketplace live previews and published demo credentials
argument-hint: <topic or category> [--marketplaces id,id] [--top N] [--auto]
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, WebSearch, WebFetch
---

Discover products and demos for: $ARGUMENTS

CLI: `node <skill-dir>/scripts/cli.mjs` (`<skill-dir>` = `${CLAUDE_PLUGIN_ROOT}/skills/webapp-research` when installed as a plugin). Playbook: `references/marketplaces.md`; roles: `agents/product-discovery.md`, `agents/demo-access-researcher.md`.

1. Preflight: `doctor --json`. `demo-probe` and `demo-login` need Playwright + Chromium. If missing, ask "May I install X?" with the exact commands (auto mode: `setup --yes`).
2. Generate queries: `discover-queries "<topic>" [--marketplaces id,id] --json`. Run them with WebSearch. Cover marketplaces (CodeCanyon/Envato, ThemeForest, SaaS directories, GitHub/open-source catalogues, app stores) and vendor sites. Public pages only; respect robots/ToS.
3. For each candidate record name, URL, source and kind in `candidates.json`; once a project exists (`init`), also `observe <project> --type official_docs --claim "..."` (cite the URL).
4. For each demo or live-preview URL: `demo-probe <url>`, then read `.webapplens/docs/_discovery/<host>-probe.json` (login form, CAPTCHA, MFA, demo links, credential candidates with source URL).
5. Credentials: only vendor- or marketplace-PUBLISHED demo credentials visible on public pages. Never guess, never use leaked lists, never bypass CAPTCHA/MFA. If the probe shows CAPTCHA or MFA, stop for that demo and report it.
6. Verify with exactly ONE attempt: `demo-login <probe.json> --index N`. Add `--save-to <App>` to store verified credentials (source URL, status, date) in the project's git-ignored `credentials.json`. If it fails, mark the demo `expired` or `login_required`; do not retry variations.
7. Interactive: show the shortlist and ask which products to research and whether to try each login. Auto: try each published credential once, continue with verified demos.
8. Fewer than N credible products: return fewer and say why. Then offer `/webapplens:compare`.

Outputs: `.webapplens/docs/_discovery/*-probe.json`, `candidates.json`, evidence in `evidence/observations.jsonl`. Never print or share credentials outside the project.
