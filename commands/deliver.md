---
description: Publish client-ready documentation from the .webapplens agent workspace into the project root (docs/research/<App>)
argument-hint: <App> [--to DIR] [--include-drafts]
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, WebSearch, WebFetch
---

Use the `webapp-research` skill. Request: $ARGUMENTS

`<skill-dir>` = `${CLAUDE_PLUGIN_ROOT}/skills/webapp-research` when installed as a plugin. CLI: `node <skill-dir>/scripts/cli.mjs` (`wr`).

`.webapplens/` is the agent workspace; the client gets curated docs in the project root.
1. Ask once: where should it go (default `docs/research/<App>`) and who is the audience? Skip in auto mode.
2. `wr audit "<App>"`. If unresolved `TODO(agent)` markers remain, finish them first (right role) or tell the user they will be withheld.
3. `wr deliver "<App>" [--to DIR]`. Report: files copied, drafts withheld, files flagged for review (secret-looking text), broken links (must be none).
4. Remind the user: screenshots are not pixel-redacted; review before sharing. Credentials, state, logs and raw evidence are never copied.
