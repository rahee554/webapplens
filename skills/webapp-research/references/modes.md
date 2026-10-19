# Mode playbooks

## Mode A — existing product
1. `product-discovery`: official site, docs, pricing page, public demo. Record sources with `observe --type official_docs`.
2. `demo-access-researcher`: is there a vendor-published demo/sandbox? Record URL, access type, registration requirement, source URL, date checked. If none: say so; fall back to docs-only research (Mode B style) and mark the output "documentation-based, not observed".
3. With access: Mode C on the demo. Without: stop at documentation; do not invent screens.

## Mode B — topic / module across products
1. Pick 3–5 candidate products (discovery agent, Mode D scoring if the user wants a ranking).
2. For each product with a verified demo, a **narrow** crawl: `--max-pages 40`, start paths at the relevant module (`startPaths` in `crawlers/config.json`).
3. `workflow-analyst` + `technical-analyst` write one comparative doc per topic; per-product facts link to each project's evidence.
4. Deliver implementation-oriented docs (acceptance criteria, form specs, state transitions, open questions) in the stack the user names (e.g. Laravel).

## Mode C — credentialed app
1. Confirm: URL, scope, role of the account, **sandbox or production** (default: production, read-only).
2. `init` with `--username-env/--password-env`; user exports the variables. Alternative: `--credentials-file` (git-ignored JSON `{"username":"…","password":"…"}`).
3. `crawl` → `report` → loop (see SKILL.md §7). For SPAs with POST-based reads (GraphQL/JSON-RPC) add `--allow-post "graphql"` etc.; this is the only supported way to let POSTs through without `--sandbox`.
4. Login problems: set `auth.loginPath`, `auth.userSelector`, `auth.passwordSelector`, `auth.submitSelector` in `crawlers/config.json`. CAPTCHA/MFA → ask the user for an authenticated session or a test account without it; never bypass.

## Mode D — discover & compare
1. Search for candidates; prefer official sites/docs/demo pages.
2. Verify each demo: open the vendor's demo instructions, check the demo URL loads, note whether credentials are published (source URL + date) or registration is needed. `verification_status`: `verified` only if you actually reached a usable demo; otherwise `unverified`, `registration_required`, `expired`, `login_required`, `inaccessible`.
3. Fill `candidates.json` (see `templates/candidates.example.json`): 0–5 per criterion with evidence URLs.
4. `wr compare candidates.json --top 5 --out comparison.md`. Weights default to relevance 35 / coverage 25 / demo access 20 / docs 10 / researchability 10; override in the file when the user's priorities differ. Unverified demos are capped at 3 for demo access; candidates without evidence are flagged.
5. Fewer than 5 credible candidates → return fewer and say why. Never pad.
