# Roundtable protocol (multi-agent collaboration)

Agents do not talk through chat. They communicate through a shared **blackboard**: an append-only log at `<project>/roundtable/board.jsonl`. Anything an agent needs another agent to know goes on the board; anything an agent needs to know starts with reading it.

On single-agent platforms one agent plays every role in turn and uses the same board, so the reasoning stays recorded and challengeable.

## Roles

| Role | Job on the board |
|---|---|
| `roundtable-moderator` | Opens rounds, assigns questions, keeps it short, closes each item with `decide`, records dissent, writes the summary |
| `skeptic` | Challenges claims; checks evidence type and confidence; hunts unsupported assertions; never edits docs |
| `workflow-analyst`, `ui-ux-analyst`, `technical-analyst` | Post findings and proposals; answer questions addressed to them |
| `documentation-engineer` | Posts terminology/structure questions; applies decisions to the docs |
| `completeness-auditor` | Posts gap evidence from `audit` |
| `product-discovery`, `demo-access-researcher`, `browser-reconnaissance`, `research-orchestrator` | Post handoffs and evidence; the orchestrator escalates to the user |

## Rounds

1. **Independent analysis.** Each analyst reads the artifacts and `board read <project> --open`, works alone, and posts `evidence` / `proposal` messages with `--round 1`. Nobody reads others' round-1 posts first, to avoid anchoring.
2. **Cross-review and objections.** Everyone reads the whole board. The skeptic and peers post `objection` / `question` (use `--to role` and `--ref ID`); owners reply with `answer` or more `evidence`.
3. **Synthesis and decisions.** The moderator goes through `board read <project> --open` and closes each item with `board decide`. A disagreement that stays is recorded with `--dissent role`, not deleted. `board summary` writes `reports/roundtable.md`.

Stop early when `--open` is empty. Default maximum: 3 rounds.

## Message types

`proposal` · `objection` · `evidence` · `question` · `answer` · `decision` · `handoff` · `dissent`

Rules: one claim per message; say the evidence type and confidence (`observed` / `inferred` / ...); cite a route ID, screenshot or URL; no credentials ever; messages are never edited - post a new one that references the old (`--ref`).

## Commands

```bash
wr board post <App|dir> --role technical-analyst --type proposal --text "..." [--to role] [--ref ID] [--round N]
wr board read <App|dir> [--role R] [--since N] [--open]     # --open = unanswered questions/objections
wr board decide <App|dir> --ref ID --decision "..." [--dissent role]
wr board summary <App|dir>                                  # writes reports/roundtable.md
```

Every agent: read `board read <project> --open` before starting; post a `handoff` when finished (what was done, files, open questions).

## Decisions and dissent

A `decision` closes the referenced item and names the winning position and why (prefer stronger evidence types). If someone still disagrees, the moderator records `--dissent <role>` so the report shows "decided X; dissent: skeptic believes Y". Open disagreements also go to `docs/technicals/unknowns.md`. The skeptic may block a "confirmed" label (raise `objection`), but the moderator decides.

## Example transcript (school-management research, abridged)

```text
#1  R1 technical-analyst  evidence  [observed R014] Form F031 "Fee collection" has fields student, term, amount, method; no API call seen on page load.
#2  R1 workflow-analyst   proposal  [inferred, medium] Fee flow: Student -> Fee invoice -> Payment -> Receipt. Receipt step seen only as a menu item (R022), not opened.
#3  R1 ui-ux-analyst      evidence  [observed R014, screenshots/all/fees.png] Fees table has status filter, term filter, no bulk actions.
#4  R2 skeptic            objection (to technical-analyst, ref #1) "Multi-tenant per school" in architecture.md is stated as fact. Evidence? Only a school-name header was observed.
#5  R2 technical-analyst  answer    (ref #4) Agree: downgrade to hypothesis/low. Only the header text is observed; no tenant id in URLs or XHR.
#6  R2 skeptic            question  (to workflow-analyst, ref #2) Is "Receipt" a separate record or a print view of the payment?
#7  R2 workflow-analyst   answer    (ref #6) Unknown without opening R022 (needs a Category B submit to create a payment). Listing as untested.
#8  R3 moderator          decision  (ref #4) architecture.md: multi-tenancy under "Likely (inferred)" as hypothesis/low.
#9  R3 moderator          decision  (ref #6) Receipt documented as "untested"; added to unknowns.md with the sandbox step that would verify it.
#10 R3 documentation-engineer handoff Applied #8-#9 to docs/technicals/architecture.md and unknowns.md; validate-links clean; no open questions.
```
