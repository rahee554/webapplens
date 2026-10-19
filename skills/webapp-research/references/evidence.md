# Evidence & confidence

| Type | Use when | Max confidence |
|---|---|---|
| `observed` | you saw it in the app (page, label, field, status code) | high |
| `verified_interaction` | you did something authorized and saw the result | high |
| `official_docs` | vendor documentation states it (cite URL) | high |
| `public_source` | public source code shows it (cite file/URL) | high |
| `inferred` | reasoned from UI behaviour | medium |
| `hypothesis` | plausible, needs verification | low |

The CLI enforces the caps. Record findings as you go:

```bash
wr observe "<App>" --type observed --claim "Invoices can be filtered by status" --route R012 --screenshot screenshots/all/invoices.png
wr observe "<App>" --type inferred --claim "Invoice numbers appear sequential per year" --route R012 --confidence medium
wr observe "<App>" --type hypothesis --claim "Likely a multi-tenant schema with tenant_id on every table"
```

Rules of thumb
- UI alone never *confirms* a database schema, backend framework, API contract or infrastructure. Use `inferred`/`hypothesis` and put proposals under "Proposed", not "Observed".
- Library markers (`ng-version`, `__NEXT_DATA__`, generator meta) are `observed` markers, not proof of the whole stack.
- Facts, assumptions, recommendations and unknowns live in separate sections of the docs; `docs/technicals/unknowns.md` lists what would verify each gap.
- Observations are idempotent (same type+claim+route+source → one record) and redacted automatically.
- `docs/technicals/evidence-and-confidence.md` is regenerated from `evidence/observations.jsonl` by `report`.
