---
description: Architecture designer: proposed data model, API outline and architecture for a comparable system (from a live app and/or a repo)
argument-hint: <url | repo-path> [target stack, e.g. Laravel]
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, WebSearch, WebFetch
---

Use the `webapp-research` skill, roles `tech-stack-analyst` and `solution-architect`. Request: $ARGUMENTS

`<skill-dir>` = `${CLAUDE_PLUGIN_ROOT}/skills/webapp-research` when installed as a plugin (otherwise the folder holding SKILL.md). CLI: `node <skill-dir>/scripts/cli.mjs` (shown as `wr`).

**Start every run with:** `wr doctor --json` (if `ok` is false: list what is missing, show `install_plan`, ask "May I install <items>?" and on yes run `wr setup --yes`; in auto mode install directly) and `wr update-check --quiet` (if it prints an update notice, tell the user once; never update without their OK). Then `wr intent "$ARGUMENTS"` and do ONLY the plan it returns: no screenshots, architecture or docs unless they appear in its `facets`. Ask the `questions` it returns in ONE batch (AskUserQuestion if available), skip them in auto mode (use recommended defaults). Credentials: env vars or a git-ignored file, never typed in chat.

1. Live app: `wr init "<App>" --url <url> --focus architecture --profile standard`, `wr crawl "<App>" --probe-openers`, `wr report "<App>"`. Repo: `wr repo-scan <path> --name "<App>"` (can be combined).
2. Ask which target stack (Laravel, Node/Nest, Django, Rails, .NET or "recommend one") unless given. Then `wr architect "<App>" --stack <laravel|prisma|django|sql|auto>`.
3. Read `proposed-schema.md`, `architecture-baseline.md`, `tech-stack.md`. Write `docs/technicals/architecture-proposal.md`: context, assumptions, modules, refined data model, API outline, auth/roles, integrations, deployment, non-functional needs, risks, phased roadmap, open questions. Everything inferred stays labelled PROPOSED.
4. For this request convene `/webapplens:roundtable` (skeptic review) only if the user asks or the design is high-stakes.
