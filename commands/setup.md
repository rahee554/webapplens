---
description: Check requirements (Node, Playwright, Chromium) and install what is missing after asking
argument-hint: [--yes] [--auto]
allowed-tools: Bash, Read
---

Check and prepare the environment for the `webapp-research` skill. Arguments: $ARGUMENTS

CLI: `node <skill-dir>/scripts/cli.mjs` (`<skill-dir>` = `${CLAUDE_PLUGIN_ROOT}/skills/webapp-research` when installed as a plugin).

1. Run `doctor --json`. It checks Node >= 22, the `playwright` module and a real Chromium launch, and returns `{ok, checks:[{id,ok,detail,fix}], install_plan:[commands]}`.
2. If `ok` is true: report each check in one line and stop.
3. If `ok` is false: tell the user exactly what is missing (`detail`) and show the `install_plan` commands. A missing or old Node cannot be fixed by this skill: give the `fix` text and stop.
4. Ask: "May I install <Playwright / Chromium>? This runs: <exact commands>." Wait for yes. Skip the question only if `--yes` or `--auto` was given (pre-authorized).
5. On yes: `setup --yes` (runs `npm install --omit=dev` in the skill folder and `npx playwright install chromium`, then re-verifies). Without `--yes`, `setup` only prints the plan.
6. Run `doctor` again and report the result. If it still fails, show the failing check and its `fix`; do not retry in a loop. On Linux, missing system libraries may need `npx playwright install-deps chromium` (may need sudo: ask first).

Never install anything the user has not approved (or pre-authorized with `--yes` / `--auto`).
