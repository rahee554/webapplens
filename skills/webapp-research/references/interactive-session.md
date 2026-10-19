# Interactive sessions

Use when the user wants a back-and-forth ("let's explore this together", `/webapplens:chat`). Otherwise do the one-off flow in `intake.md`. In **auto mode** you decide with the recommended defaults and stop only for the conditions in `auto-mode.md`; the checkpoints below still apply, but you do not wait for an answer.

## The loop

1. **Preflight**: `doctor --json` (ask to install), `update-check --quiet` (tell the user if an update exists; see `updates.md`).
2. **Intake**: `intent "<request>"`, then one batch of the questions that are still open (`intake.md`). Use the **AskUserQuestion** tool when the platform has it (options with a recommended default first); otherwise plain numbered questions. Confirm the plan in 3-6 lines.
3. **Run one stage** (a crawl, a scan, a document). Keep it to what was agreed.
4. **Checkpoint** (template below), then wait for the user.
5. **Act on the answer**: the next stage, a different focus, a deeper crawl, or stop. Repeat from 3.
6. **Stop** when the user says done, or when the only remaining steps need something you must not do (credentials, CAPTCHA/MFA, Category B/C actions, unclear authorization). End with the final report and one offer: `deliver` if client-ready docs may be wanted.

## Checkpoint template

```
Checkpoint: <stage>
Found:   <3-5 bullets, with numbers (pages, colours, technologies, issues)>
Cost:    <pages visited, time, anything skipped or limited>
Caveats: <evidence type; what was not verified>
Next:    1) <concrete step>  2) <concrete step>  3) <concrete step>  4) stop here / deliver
```

Offer 2-4 concrete next steps, each tied to a command or output (for example "capture screenshots of the 5 main pages", "run `suggest`", "propose a Laravel architecture"). Recommend one.

## Question style

- One batch per decision point, 1-4 questions, each with a default.
- Ask about outcomes ("Do you need screenshots?"), not tool flags.
- Never ask for passwords; ask for environment variable names.
- Do not re-ask what `status` or an earlier answer already settles.

## Using AskUserQuestion

When the tool exists: one call, up to four questions, each with 2-4 short options and the recommended one first; use multi-select for "which of these outputs". The tool adds an "other" choice, so do not add one. When it does not exist, write the same questions as a numbered list and say "reply with numbers, or 'defaults'".

## Resuming

A session can span days. On return: `status "<App>"` (compact JSON: progress, coverage, open items, next steps) and `board read <project> --open`. State lives in the project folder (`crawlers/state.json`, `reports/`), not in the chat. Summarise where things stand in 3 lines and offer the next steps; a crawl resumes where it stopped.

## Keep it cheap

Follow the token rules in `intake.md`: summaries over dumps, no re-reading, no repeated reports. A checkpoint is a summary, not a transcript of the artifacts.
