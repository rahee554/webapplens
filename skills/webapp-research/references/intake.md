# Intake: precise scope and token discipline

Rule for agents: **do only what was asked, ask only what is missing (one batch), prefer summaries over dumps, never read big files whole.** Research that was not requested costs tokens, time and target load, and buries the answer.

## 1. Map the request to facets

```bash
wr intent "<the user's request, verbatim>" [--name App --url https://...]
```

`intent` is deterministic keyword matching. It returns `facets`, `excluded` (things the user said no to), `plan.commands`, `plan.outputs`, `plan.roles`, `plan.skipped` (what will NOT be done) and `questions` (what is still worth asking). It is a starting point: you may override it, but say so. Negation is understood ("no screenshots", "without the architecture").

| Facet | Means | Work it gates |
|---|---|---|
| `routes` | map pages and navigation | always present when crawling |
| `screenshots` | page, tab, dialog and mobile captures | screenshots only when asked; coverage does not demand them otherwise |
| `ui` | colours, type, spacing, components, layout | computed-style design scan |
| `stack` | technology stack from passive signals | tech scan |
| `forms`, `workflows`, `api` | form inventory, business workflows, observed XHR | templates and docs for these only |
| `data-model` | inferred entities (PROPOSED) | `architect` |
| `architecture` | architecture proposal | pulls in data-model, api, stack |
| `suggestions` | improvement suggestions | pulls in ui, stack; `suggest` |
| `docs` | client-facing documentation | doc templates |
| `repo` | a local folder | `repo-scan` |
| `discover` | products, marketplaces, demos, comparison | discovery commands |
| `full` | everything (only when explicitly asked) | no gating |

`init` / `crawl` take the result as `--focus a,b,c`. Doc templates are created only for requested areas.

## 2. Ask only what is missing

Ask in **one batch**. Use the AskUserQuestion tool when the platform has it; otherwise numbered plain questions with a recommended default. Skip anything the request or the project already answers (check `status`).

| Question | Ask when | Answer maps to |
|---|---|---|
| Which app (URL) or local folder? | no target in the request | `--url` / `repo-scan <folder>` |
| What do you need? (UI, stack, screenshots, architecture, docs, improvements, everything) | no facet detected | `--focus` |
| Login needed? Demo/sandbox or production? | the app looks private | env var names (never passwords); production stays read-only; `--sandbox` only if confirmed disposable |
| Which target stack for the proposal? | `architecture` and none named | `architect --stack laravel\|prisma\|django\|sql\|auto` |
| Who reads the docs? (client, designer, developers, AI agent) | `docs`, `architecture` | tone and depth of agent-owned docs |
| How thorough? (quick / standard / deep) | more than a narrow facet, interactive mode | `--profile` |
| Client-ready copy in the project root? | once, at the end | `deliver` |
| One-off, interactive session or auto? | once, at the start | `interactive-session.md`, `auto-mode.md` |

Never ask for a password in chat. Never ask something the user already said.

## 3. Profile defaults

`intent` suggests `quick` for up to 3 facets, `standard` beyond that. Interactive: offer it. Auto: `--profile auto`.

## 4. Token-discipline rules

1. Run `status <App>` (compact JSON) or `audit <App> --json` instead of re-reading reports.
2. Read the generated summary documents, not `evidence/*.json`, `routes/*.json` or `observations.jsonl` whole; use Grep for one record.
3. Open screenshots one at a time and only when the question needs them.
4. Do not re-run `report`/`audit` when nothing changed; do not repeat a finished crawl (it resumes by itself).
5. Post short board messages; one hand-off per role.
6. Report in a table or a few lines; link to files instead of pasting them.

## 5. Examples (request to plan)

Commands are shown without the `node <skill-dir>/scripts/cli.mjs` prefix.

**1. "Only the UI colours and the tech stack of https://app.example.com, no screenshots"**
- Facets `ui`, `stack` (+ `routes`); excluded: `screenshots`. Profile `quick`.
- `init "App" --url https://app.example.com --focus ui,stack --profile quick` -> `crawl "App"` -> `report "App"`.
- Roles `ui-researcher`, `tech-stack-analyst`. Outputs `docs/technicals/design-system-observed.md`, `design-tokens.json`, `tech-stack.md`.
- Skipped: screenshots (user said no), architecture, suggestions, workflows, docs. Questions: login?

**2. "Take screenshots of every page"**
- Facet `screenshots` (+ `routes`). `init ... --focus screenshots --profile quick` -> `crawl` -> `report`.
- Output: `screenshots/` and the dashboard gallery. No design scan, no stack scan, no templates. Questions: login? sandbox or production?

**3. "Propose an architecture for this app in Laravel"**
- Facets `architecture` (+ `data-model`, `api`, `stack`, `forms`, `routes`). Profile `standard`.
- `init ... --focus stack,architecture,data-model,api,forms` -> `crawl` -> `report` -> `architect "App" --stack laravel`.
- Roles `solution-architect` (and `tech-stack-analyst`); `skeptic` is convened for architecture. Confirm that Laravel is the **target** stack, not a guess about the app's current one.

**4. "Improve this app"**
- Facets `suggestions` (+ `ui`, `stack`, `routes`). Profile `standard`.
- `init ... --focus ui,stack,suggestions` -> `crawl` -> `report` -> `suggest "App"`; the `improvement-suggester` writes `docs/improvement-plan.md`.
- Output: `reports/suggestions.md` with severity, effort and quick wins. Skipped: architecture, workflows, docs, screenshots.

**5. "Scan this repo and document it for the client"**
- Facets `repo`, `docs`. Ask for the folder path and the audience.
- `repo-scan <folder> --name "App"` -> `repo-analyst` reads `docs/repo/*.md` and writes the reader-facing summary -> `deliver "App"`.
- `intent` may also list a crawl command because of the `docs` facet; skip it when there is no URL. Evidence type is `public_source`.
