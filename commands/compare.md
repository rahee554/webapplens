---
description: Mode D - score and rank candidate products with the transparent weighted model
argument-hint: <topic | candidates.json> [--top N] [--auto]
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, WebSearch, WebFetch
---

Compare products with the `webapp-research` skill (Mode D). Input: $ARGUMENTS

CLI: `node <skill-dir>/scripts/cli.mjs` (`<skill-dir>` = `${CLAUDE_PLUGIN_ROOT}/skills/webapp-research` when installed as a plugin). Playbook: `references/modes.md` (Mode D).

1. If the argument is an existing `candidates.json`, use it. Otherwise run the `/webapplens:discover` steps first (marketplaces included) to build the shortlist.
2. Fill `candidates.json` from `<skill-dir>/templates/candidates.example.json`: scores 0-5 per criterion (relevance 35, coverage 25, demo access 20, docs 10, researchability 10), each with evidence URLs. No invented ratings.
3. `verification_status` is `verified` only if you reached a usable demo this session (one `demo-login` attempt at most); otherwise `unverified`, `registration_required`, `expired`, `login_required` or `inaccessible`. Unverified demo access is capped at 3.
4. Recommended: run `/webapplens:roundtable` on the scores so the skeptic challenges them before the ranking is final.
5. `compare candidates.json --top N --out comparison.md` (default N = 5). Fewer credible candidates than N: return fewer and say why; never pad.
6. Interactive: show the ranking and ask whether to weight criteria differently (`weights` in the file) or research the winner (Mode C). Auto: keep default weights and stop after delivering the ranking unless a follow-up crawl was requested.

Outputs: `comparison.md`, `candidates.json`. Flag candidates without evidence and unverified demos.
