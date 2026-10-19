---
description: Analyse a local repository/folder: stack, routes, data model, env var names, tooling; document it
argument-hint: <folder> [--for client|developers]
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, WebSearch, WebFetch
---

Use the `webapp-research` skill, role `repo-analyst`. Request: $ARGUMENTS

`<skill-dir>` = `${CLAUDE_PLUGIN_ROOT}/skills/webapp-research` when installed as a plugin (otherwise the folder holding SKILL.md). CLI: `node <skill-dir>/scripts/cli.mjs` (shown as `wr`).

**Start every run with:** `wr doctor --json` (if `ok` is false: list what is missing, show `install_plan`, ask "May I install <items>?" and on yes run `wr setup --yes`; in auto mode install directly) and `wr update-check --quiet` (if it prints an update notice, tell the user once; never update without their OK). Then `wr intent "$ARGUMENTS"` and do ONLY the plan it returns: no screenshots, architecture or docs unless they appear in its `facets`. Ask the `questions` it returns in ONE batch (AskUserQuestion if available), skip them in auto mode (use recommended defaults). Credentials: env vars or a git-ignored file, never typed in chat.

1. `wr repo-scan <folder> --name "<App>"`. It never reads `.env`, keys or credential files (only variable NAMES from `.env.example` style templates).
2. Read `docs/repo/repo-overview.md`, `routes-from-code.md`, `data-model-from-code.md`. Verify two or three extracted items against the real files before trusting them (extraction is regex-based; dynamic routes and generated code are not evaluated).
3. Write a summary for the stated audience; evidence type is `public_source`. If a live URL also exists, combine with `/webapplens:research` and compare code vs running app.
4. Offer `/webapplens:architect` (proposal) and `/webapplens:deliver` (client docs in the project root).
