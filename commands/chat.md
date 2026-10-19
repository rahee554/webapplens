---
description: Start a continuous interactive research session: the agent asks questions, works in stages, checkpoints, and keeps going until you say done
argument-hint: [what you want to research]
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, WebSearch, WebFetch
---

Use the `webapp-research` skill. Follow `references/interactive-session.md` and `references/intake.md`. Opening request: $ARGUMENTS

`<skill-dir>` = `${CLAUDE_PLUGIN_ROOT}/skills/webapp-research` when installed as a plugin (otherwise the folder holding SKILL.md). CLI: `node <skill-dir>/scripts/cli.mjs` (shown as `wr`).

**Start every run with:** `wr doctor --json` (if `ok` is false: list what is missing, show `install_plan`, ask "May I install <items>?" and on yes run `wr setup --yes`; in auto mode install directly) and `wr update-check --quiet` (if it prints an update notice, tell the user once; never update without their OK). Then `wr intent "$ARGUMENTS"` and do ONLY the plan it returns: no screenshots, architecture or docs unless they appear in its `facets`. Ask the `questions` it returns in ONE batch (AskUserQuestion if available), skip them in auto mode (use recommended defaults). Credentials: env vars or a git-ignored file, never typed in chat.

Session loop:
1. **Intake** (one batch, <= 4 questions, only what `intent` could not infer): target (URL/folder), what they need (UI/theme, stack, screenshots, architecture, workflows, suggestions, docs, everything), access (login? sandbox or production), audience. Use AskUserQuestion when available; otherwise a numbered list.
2. **Plan in 3-5 lines**: facets to run, what is skipped (and can be added), rough cost (pages/profile).
3. **Work one stage at a time.** After each stage send a checkpoint: what was found (3 bullets), what is unverified, and 2-4 concrete next steps ("add screenshots", "architecture for Laravel", "improvement plan", "deliver client docs"). Wait for the user's choice.
4. Use `wr status "<App>"` to resume or recap; do not re-read reports.
5. Stop only when the user says done; then summarise outputs, coverage per metric and limits. Auto mode: pick the recommended next step yourself and stop only for the cases in `references/auto-mode.md`.
