---
description: Evidence-based improvement suggestions: accessibility, usability, design consistency, performance, passive security, outdated tech
argument-hint: <url | App>
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, WebSearch, WebFetch
---

Use the `webapp-research` skill, role `improvement-suggester`. Request: $ARGUMENTS

`<skill-dir>` = `${CLAUDE_PLUGIN_ROOT}/skills/webapp-research` when installed as a plugin (otherwise the folder holding SKILL.md). CLI: `node <skill-dir>/scripts/cli.mjs` (shown as `wr`).

**Start every run with:** `wr doctor --json` (if `ok` is false: list what is missing, show `install_plan`, ask "May I install <items>?" and on yes run `wr setup --yes`; in auto mode install directly) and `wr update-check --quiet` (if it prints an update notice, tell the user once; never update without their OK). Then `wr intent "$ARGUMENTS"` and do ONLY the plan it returns: no screenshots, architecture or docs unless they appear in its `facets`. Ask the `questions` it returns in ONE batch (AskUserQuestion if available), skip them in auto mode (use recommended defaults). Credentials: env vars or a git-ignored file, never typed in chat.

1. New target: `wr init "<App>" --url <url> --focus suggestions --profile standard`, `wr crawl "<App>"`. Existing project: skip to 2.
2. `wr suggest "<App>"`, then read `reports/suggestions.md`.
3. Write `docs/improvement-plan.md`: group by theme, order by severity then effort (quick wins first), say how to verify each fix. Add only strategy that the evidence supports.
4. Reply with the top 5 findings, counts by severity, and quick wins. These are heuristics, not a full audit: accessibility also needs manual testing.
