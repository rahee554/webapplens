---
description: Detect the technology stack of a web app (frameworks, CMS, backend hints, hosting, libraries) from passive signals
argument-hint: <url>
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, WebSearch, WebFetch
---

Use the `webapp-research` skill, role `tech-stack-analyst`. Request: $ARGUMENTS

`<skill-dir>` = `${CLAUDE_PLUGIN_ROOT}/skills/webapp-research` when installed as a plugin (otherwise the folder holding SKILL.md). CLI: `node <skill-dir>/scripts/cli.mjs` (shown as `wr`).

**Start every run with:** `wr doctor --json` (if `ok` is false: list what is missing, show `install_plan`, ask "May I install <items>?" and on yes run `wr setup --yes`; in auto mode install directly) and `wr update-check --quiet` (if it prints an update notice, tell the user once; never update without their OK). Then `wr intent "$ARGUMENTS"` and do ONLY the plan it returns: no screenshots, architecture or docs unless they appear in its `facets`. Ask the `questions` it returns in ONE batch (AskUserQuestion if available), skip them in auto mode (use recommended defaults). Credentials: env vars or a git-ignored file, never typed in chat.

1. `wr init "<App>" --url <url> --focus stack --profile quick`, `wr crawl "<App>" --max-pages 12`, `wr report "<App>"`.
2. Read `docs/technicals/tech-stack.md`. Report each technology with its confidence and signals. Everything is *inferred* from headers, cookie names, script URLs, markers and globals; say plainly that the back end cannot be proven from a browser.
3. Mention passive security observations (missing headers, cookie flags) as observations, not tests. Offer `/webapplens:suggest` or `/webapplens:architect` as next steps.
