---
description: UI and theme research: colours, typography, spacing, components, layout, breakpoints, contrast (no screenshots unless asked)
argument-hint: <url> [--screenshots]
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, WebSearch, WebFetch
---

Use the `webapp-research` skill, role `ui-researcher`. Request: $ARGUMENTS

`<skill-dir>` = `${CLAUDE_PLUGIN_ROOT}/skills/webapp-research` when installed as a plugin (otherwise the folder holding SKILL.md). CLI: `node <skill-dir>/scripts/cli.mjs` (shown as `wr`).

**Start every run with:** `wr doctor --json` (if `ok` is false: list what is missing, show `install_plan`, ask "May I install <items>?" and on yes run `wr setup --yes`; in auto mode install directly) and `wr update-check --quiet` (if it prints an update notice, tell the user once; never update without their OK). Then `wr intent "$ARGUMENTS"` and do ONLY the plan it returns: no screenshots, architecture or docs unless they appear in its `facets`. Ask the `questions` it returns in ONE batch (AskUserQuestion if available), skip them in auto mode (use recommended defaults). Credentials: env vars or a git-ignored file, never typed in chat.

1. `wr init "<App>" --url <url> --focus ui[,screenshots] --profile quick` (add credentials env names if login is needed), then `wr crawl "<App>"` and `wr report "<App>"`.
2. Read `docs/technicals/design-system-observed.md` and `design-tokens.json`; write `docs/technicals/design-system.md` and `docs/ui-patterns.md` (interpretation: token structure, component rules, inconsistencies). Colours/sizes are *observed*; role names are *inferred*.
3. Reply with the palette, type scale, spacing grid, component notes and contrast failures; offer screenshots or suggestions as next steps. Output: `.webapplens/docs/<App>/`. Use `/webapplens:deliver` for client-ready docs.
