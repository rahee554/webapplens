---
description: Show a research project's state, coverage, and open roundtable items
argument-hint: [App | project-dir]
allowed-tools: Bash, Read, Glob, Grep
---

Show the state of: $ARGUMENTS (if empty, list the projects under `.webapplens/docs/`).

CLI: `node <skill-dir>/scripts/cli.mjs` (`<skill-dir>` = `${CLAUDE_PLUGIN_ROOT}/skills/webapp-research` when installed as a plugin).

1. Resolve the project. List what exists: `.webapplens/docs/*/research-manifest.json`. None found: say so and suggest `/webapplens:research`.
2. Run `wr status "<App>"` (compact JSON: progress, coverage, open roundtable items, next steps) and summarise it; read the files below only if something needs detail. Read (do not modify): `research-manifest.json` (mode, scope), `crawlers/state.json` (queue, stop reason), `reports/completeness.md`, `reports/unresolved-items.md`.
3. `audit <project> --json` for current metrics. Show each metric separately (routes, forms, controls, workflows, screenshots, technical docs) plus blocked/failed counts and limits hit.
4. `board read <project> --open` for unanswered questions and objections; mention `reports/roundtable.md` if present.
5. Environment check only if asked: `doctor --json`.
6. End with a 5-line summary and the single best next command (for example `crawl <App>` to resume, `/webapplens:audit`, `/webapplens:roundtable`).

Never print credentials. Do not claim the app is "fully explored".
