# Architecture designer (facets `architecture`, `data-model`)

Everything here is a **proposal**. A running UI never confirms a database schema, framework or API contract.

## Inputs

A crawl with `--focus architecture` (adds forms, API observation and the stack scan), or a `repo-scan` of the code. `architect` uses forms, tables, form actions, XHR/fetch calls and, when a repo scan exists, the code.

```bash
wr init "<App>" --url <url> --focus architecture --profile standard
wr crawl "<App>" && wr report "<App>"
wr architect "<App>" --stack laravel      # laravel | prisma | django | sql | auto
```

## What `architect` writes

| File | Content |
|---|---|
| `docs/technicals/proposed-schema.md` | PROPOSED entities, columns (type, nullable, options), relations; a CRUD API outline with **observed** calls separated from **PROPOSED** ones; a starter schema for the chosen stack; a Mermaid ER diagram |
| `docs/technicals/architecture-baseline.md` | inferred component diagram of what was observed (front end, server signals, APIs, third parties) and open architecture questions |

The starter schema is a convenience, not a migration to run unreviewed.

## What the `solution-architect` adds

Ask for the **target stack** unless given (Laravel, Node/Prisma, Django, plain SQL, "recommend one"), then write `docs/technicals/architecture-proposal.md`:

1. Context (what the app does, from observations)
2. Assumptions (each one listed; mirror in `unknowns.md`)
3. Modules (one per observed area, with responsibilities)
4. Data model refinement (from `proposed-schema.md`: keys, constraints, indexes, audit fields)
5. API outline (observed vs PROPOSED)
6. Authentication and roles (what was observed; what is proposed)
7. Integrations (observed third parties; proposed ones)
8. Deployment and environments
9. Non-functional requirements (performance, security, accessibility, backup, observability)
10. Risks
11. Phased roadmap (what to build first)
12. Open questions

Label every element **observed**, **inferred** or **PROPOSED**. The `skeptic` is convened for architecture work to challenge unsupported claims.

## Limits

Entity and column inference is heuristic: it follows form fields, table headings and route names, skips login and search-like forms, and uses simple singular/plural rules. Hidden fields, server-side validation, background jobs, permissions and anything behind unvisited pages are invisible to it.
