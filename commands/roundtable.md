---
description: Convene the multi-agent roundtable (blackboard rounds) on an existing research project
argument-hint: <App | project-dir> [--rounds N] [--auto]
allowed-tools: Bash, Read, Write, Edit, Glob, Grep
---

Run the roundtable on: $ARGUMENTS

CLI: `node <skill-dir>/scripts/cli.mjs` (`<skill-dir>` = `${CLAUDE_PLUGIN_ROOT}/skills/webapp-research` when installed as a plugin). Protocol: `references/roundtable.md`. Blackboard: `<project>/roundtable/board.jsonl` (append-only).

1. Resolve the project; it must have crawl output (`report` done). Otherwise run `/webapplens:research` first.
2. Moderator: follow `agents/roundtable-moderator.md`. Skeptic: `agents/skeptic.md`. Participants: `workflow-analyst`, `ui-ux-analyst`, `technical-analyst`, `documentation-engineer`, `completeness-auditor` as needed (single-agent platforms: play each role in turn).
3. **Round 1, independent analysis.** Each analyst reads the artifacts and `board read <project> --open`, then posts findings: `board post <project> --role R --type evidence|proposal --text "..." --round 1`. Post before reading other analysts' round-1 posts.
4. **Round 2, cross-review and objections.** Everyone runs `board read <project>`; the skeptic posts `objection` / `question` messages (`--to role`); owners reply with `answer` or `evidence`.
5. **Round 3, synthesis and decisions.** The moderator lists `board read <project> --open` and resolves each item: `board decide <project> --ref ID --decision "..." [--dissent role]`. Unresolved disagreement is recorded as dissent, never erased.
6. Apply decisions to agent-owned docs (`docs/technicals/unknowns.md` for open disagreements); record evidence with `observe` using the right type.
7. `board summary <project>` writes `reports/roundtable.md`.
8. Interactive: ask before starting extra rounds. Auto: up to 3 rounds, stop early when `board read --open` is empty; escalate to the user only for the stop conditions in `references/auto-mode.md`.

Every agent posts a `handoff` when done. Never put credentials on the board.
