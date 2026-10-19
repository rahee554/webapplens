---
description: Completeness audit plus skeptic pass on an existing research project
argument-hint: <App | project-dir> [--auto]
allowed-tools: Bash, Read, Write, Edit, Glob, Grep
---

Audit an existing project with the `webapp-research` skill. Target: $ARGUMENTS

CLI: `node <skill-dir>/scripts/cli.mjs` (`<skill-dir>` = `${CLAUDE_PLUGIN_ROOT}/skills/webapp-research` when installed as a plugin).

1. Resolve the project (`.webapplens/docs/<App>/` or the given directory). If it does not exist, say so and suggest `/webapplens:research`.
2. Preflight: `doctor --json`; only needed if a re-crawl is likely. If something is missing, ask "May I install X?" with the exact commands (auto mode: install via `setup --yes`).
3. Run `report <project>` then `audit <project> --json`; read `reports/completeness.md`, `reports/unresolved-items.md`, `crawlers/state.json`, `crawlers/failures.json`.
4. Follow `agents/completeness-auditor.md`: per-metric table (routes, forms, controls, workflows, screenshots, technical docs), blocked/failed routes with reasons, limits hit, ranked gaps with an owner and exact command each.
5. **Skeptic pass.** Follow `agents/skeptic.md`: check that claims match their evidence type and confidence, flag unsupported assertions (schemas, frameworks, API contracts stated as fact), and post each objection with `board post <project> --role skeptic --type objection --text "..."`.
6. Genuine dead links or expected blocked routes: `accept <project> <routeId> --reason "..."` (stays listed, stops counting as open). Never accept a real gap.
7. Interactive: ask before widening a crawl (`--probe-openers`, higher limits). Auto: apply the recommended widening and re-crawl while a limit was the stop reason; still stop for credentials, CAPTCHA/MFA and Category B/C.
8. Re-run `audit`. Report verdict, per-metric table, remaining gaps, open board items (`board read <project> --open`).

Outputs: `reports/completeness.md`, `reports/unresolved-items.md`, `roundtable/board.jsonl`.
