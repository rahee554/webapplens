---
description: Research a web app, product, topic or demo with the webapp-research skill (modes A-D, optional auto mode)
argument-hint: <url | product | topic> [--auto] [--profile quick|standard|deep|auto]
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, WebSearch, WebFetch
---

Use the `webapp-research` skill. Request: $ARGUMENTS

`<skill-dir>` is the plugin's `skills/webapp-research` folder (`${CLAUDE_PLUGIN_ROOT}/skills/webapp-research` when installed as a plugin). CLI: `node <skill-dir>/scripts/cli.mjs`.

0. **Precision first.** Run `wr doctor --json`, `wr update-check --quiet`, then `wr intent "$ARGUMENTS"` and do only the facets it returns (screenshots, architecture, docs etc. only when asked). Ask its `questions` in one batch. For a back-and-forth session use `/webapplens:chat`.
1. **Interaction mode.** `--auto` (or the user choosing auto) = auto mode: follow `references/auto-mode.md` and stop only for the cases listed there. Otherwise interactive: ask at each decision point.
2. **Preflight.** Run `doctor --json`. If `ok` is false: list what is missing (`checks[].detail`), show `install_plan`, and ask "May I install <items>?" with the exact commands. On yes (or in auto mode) run `setup --yes`, then re-run `doctor`. Do not continue without Node >= 22, Playwright and Chromium.
3. **Classify** from the arguments:
   - URL plus credentials/env vars -> Mode C (`init` -> `crawl`).
   - Named product -> Mode A (find official site/demo; Mode C if access exists).
   - Topic or module across products -> Mode B.
   - "top N", "find/compare products" -> Mode D (same as `/webapplens:discover` then `/webapplens:compare`).
4. **Scope.** Interactive: confirm URL, login needed, sandbox (default: production, read-only) and crawl profile (`quick|standard|deep`). Auto: `--profile auto`, read-only, no sandbox.
5. **Run** the loop in SKILL.md section 7: `init` -> `crawl` -> `report` -> analysis roles -> roundtable (the `/webapplens:roundtable` steps) -> `audit` -> fix gaps -> final report. Never ask for passwords in chat; credentials come from env vars or a git-ignored file.
6. **Stop and ask** (even in auto mode) on: missing credentials, CAPTCHA/MFA, any Category B/C action, authorization or legal ambiguity, installing software that was not pre-authorized.

Outputs: `.webapplens/docs/<AppName>/` (`dashboard.html`, `docs/`, `reports/`, `roundtable/board.jsonl`). Finish with coverage per metric, blocked/failed items, limits hit and what was not verified. Never say "fully explored".
