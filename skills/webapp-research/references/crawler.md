# Crawler reference

## Commands & flags
`crawl <App|dir>`: `--max-pages N` (total across resumes, default 150) · `--max-depth N` (4) · `--max-per-template N` (3 example URLs per dynamic route) · `--time-budget SEC` (900) · `--probe-openers` · `--responsive` · `--headed` · `--credentials-file F` · `--sandbox` · `--allow-post REGEX` (repeatable) · `--exclude REGEX` (repeatable).
Flags override `crawlers/config.json` for that run only (config is not rewritten); edit the file for permanent changes.

## What one visit does
goto (retries, backoff) → classify outcome (login redirect, 401/403 → `blocked`; 404/5xx → `failed`; redirect → follows target) → expand collapsed nav groups (`aria-expanded=false`) → inspect DOM (links, controls, forms, tables, pagination, dialogs, tech markers) → primary screenshot → click tabs (screenshots in `modules/`) → with `--probe-openers`, click "Add/New/Create/Filter…" buttons to reveal dialogs (screenshots in `interactions/`; forms inside are inventoried) → optional mobile screenshot → record diagnostics (console errors, failed requests, XHR/fetch calls) → checkpoint.

Never done: submitting forms, clicking Category B/C controls, following logout/delete links, leaving the allowed origins.

## Scope
`baseUrl` origin + `allowedOrigins` (+ subdomains if `includeSubdomains`). Excluded by default: logout/sign-out and `/delete|destroy|remove` paths, downloads (zip, pdf, csv, office…). External origins are listed in `docs/limitations.md`, not crawled. Links beyond `maxDepth` are registered as `discovered` (visible in the report), not silently dropped.

## Routes
Dynamic segments (numbers, UUIDs, hex ids) become `:id`; paging/sort/search query keys are ignored for identity. Up to `maxPerTemplate` examples per template are visited; the rest are counted as `sampled`. Hash routes (`#/x`) count as routes; plain anchors don't.

## Tips
- SPA that renders in place and never changes URL: raise `--max-pages`, use `--probe-openers`, and have the analyst drive the Playwright MCP/browser tools for the remaining states; record what you did via `observe`.
- Menus not opening: nav toggles must expose `aria-expanded`; otherwise add the URLs to `startPaths`.
- Long pages: screenshots are full-page; huge tables are truncated by the browser, not by the tool.
- Rate limiting: increase `delayMs`.
- Crashes: the crawler restarts the browser up to `maxRestarts` times, re-using `.secrets/storage-state.json`; just re-run `crawl` to resume after anything else.
- Pausing: Ctrl-C stops after the current page and keeps state.

## Known blind spots (check before trusting numbers)
- Sampled dynamic routes list forms per example URL under one route (e.g. three "Update" forms for `/customers/:id/edit`); titles/headings come from the last example, the screenshot from the first.
- Row-level forms that only contain a button (e.g. a per-row Delete form) may be missing from `forms.json`; the control inventory still lists the button with its category.
- Hidden inputs (CSRF tokens) are deliberately not recorded.
- Plain lists (`<ul>`) are not captured as content, only tables; read the screenshot.
- A hash route that renders after load can be screenshotted before it paints; re-check such pages by hand.
- Navigation toggles repeat on every page, inflating the control count; GET search forms are labelled category B by their submit button although searching is read-only.
- `state.skipped` counters count links per page visit, not unique links.
- 404/403 pages: 403 gets a screenshot, 404 does not; the dead link's label is not stored with the route.

## Troubleshooting
| Symptom | Fix |
|---|---|
| `Playwright not found` | `npm install` in the skill dir; `npx playwright install chromium` |
| `Login failed (login_rejected)` | check env vars; set `auth.*` selectors; check for MFA/CAPTCHA |
| `captcha_present` / `mfa_required` | not bypassed by design — use a test account without it |
| everything `blocked: login_required` | session expired or wrong account; delete `.secrets/storage-state.json` and re-run |
| app shows empty data after crawl | POST-based reads were blocked: `--allow-post "<regex>"` |
| `EPERM` deleting a research folder on Windows | a shell has it as its cwd; leave the folder first |
