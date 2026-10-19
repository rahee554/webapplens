---
description: Check for a newer WebAppLens and update it (asks first)
argument-hint: [--yes]
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, WebSearch, WebFetch
---

Use the `webapp-research` skill. CLI: `node <skill-dir>/scripts/cli.mjs` (`<skill-dir>` = `${CLAUDE_PLUGIN_ROOT}/skills/webapp-research` for a plugin install).

1. `wr update-check --force --json`. Up to date or offline: say so and stop.
2. Update available: show current -> latest and the changelog link. Ask whether to update (skip the question only if the user already authorized updates).
3. On yes: `wr update` first to show the plan and install kind, then `wr update --yes`. Plugin installs are updated by Claude Code: tell the user to run `/plugin marketplace update webapplens` then `/plugin update webapplens@webapplens`; never edit plugin folders. Git installs use `git pull --ff-only`; copied installs are backed up outside the skills folder and refreshed.
4. After updating, run `wr doctor --json` and tell the user to restart the session so new instructions load.
