# Troubleshooting

Start with `node skills/webapp-research/scripts/cli.mjs doctor` (or `npm run doctor` in this repository). It checks Node, finds Playwright, launches Chromium, and renders a page. Most problems show up there.

Related: [setup](setup.md) · [crawler design](crawler-design.md) · [security](security.md) · [user guide](user-guide.md#10-troubleshooting) · [CONTRIBUTING](../CONTRIBUTING.md)

## Installation and environment

| Symptom | Cause | Fix |
|---|---|---|
| `Playwright not found` | Dependencies not installed in the skill or repo folder | Run `npm install` where `package.json` is; as a fallback `npm i -g playwright` |
| `Executable doesn't exist` / browser not installed | Chromium not downloaded | `npx playwright install chromium` |
| Browser fails to start on Linux or in a container | Missing system libraries | `npx playwright install --with-deps chromium` |
| `doctor` reports `FAIL node` | Node too old | Install Node 22 or newer. (`doctor` currently accepts 20, but the project requires 22; tests and CI use 22.) |
| `Not a research project` | Wrong directory or name | Run from the folder that contains `.webapplens/docs/`, pass the full project directory, or use `--out` |
| `EPERM` / `EBUSY` deleting a research folder (Windows) | A shell or editor has it open | Leave the folder, close programs using it, retry |

## Login

| Symptom | Cause | Fix |
|---|---|---|
| `This project requires login but no credentials were found` | `auth.required` is true and env vars are unset | Export the variables named in `credentials.json`, in the **same terminal**, or pass `--credentials-file` |
| `Login failed (login_rejected)` | Wrong credentials or unusual form | Check variables, set `--login-path` or `auth.userSelector` / `passwordSelector` / `submitSelector` in `crawlers/config.json`, try `--headed` |
| `captcha_present` | CAPTCHA on the login page | Not bypassed by design. Use a test account without it or supply an authenticated session in `.secrets/storage-state.json` |
| `mfa_required` | One-time-code prompt | Same as above |
| `no_password_field` / `no_username_field` | Login is not at `/login` or uses custom inputs | Set `auth.loginPath` and selectors |
| Everything is `blocked: login_required` | Session expired or wrong account | Delete `.secrets/storage-state.json` and re-run |
| A Settings-style page marked as login | A visible password field alone should not count; if you see this, the page may be little more than a login-like form | Open an issue with a minimal HTML snippet |

## Crawl results

| Symptom | Cause | Fix |
|---|---|---|
| Crawl stops with `max_pages` or `time_budget` | Limits hit (this is normal) | Re-run the same command to resume; raise `--max-pages` or `--time-budget` |
| Very few routes in a single-page app | Navigation uses non-semantic click targets or never changes the URL | Add `--probe-openers`, list known URLs in `startPaths`, have an analyst drive the app and record findings with `observe` |
| Menus do not expand | Toggles do not expose `aria-expanded` | Add the URLs to `startPaths` |
| Empty data or "cannot load" after crawl | The app reads data with POST (GraphQL, JSON-RPC) and the mutation guard blocked it | `--allow-post "<regex matching only the read endpoint>"`. Avoid `--sandbox` unless the data is disposable |
| Routes `blocked` with HTTP 403 | The account lacks permission | Expected and kept in the metrics; use a role with access if you are allowed |
| Routes `failed` (404, 5xx, timeout) | Dead link, server error, slow server | Read `crawlers/failures.json`; raise `navTimeoutMs`; raise `delayMs` for rate limiting |
| Dynamic pages seem under-covered | Sampling: `maxPerTemplate` examples per template | Raise `--max-per-template` if you need more |
| Links you expected were skipped | Default excludes (logout, delete), consequential labels, downloads, external origins | See `docs/limitations.md` in the project; adjust `exclude` or `allowedOrigins` if in scope |
| Screenshots blank or half-rendered | Page needed more time | Raise `navTimeoutMs` and `delayMs` |
| Browser died mid-crawl | Crash | The crawler restarts up to `maxRestarts`; otherwise re-run to resume |
| Ctrl-C | Interrupt | State is kept; re-run to resume |

## Reports and docs

| Symptom | Fix |
|---|---|
| A generated file lost my edits | Generated files (marker `generated:webapp-research`) are rewritten by `report`. Write analysis in agent-owned files, or delete the marker line to take a file over |
| Audit lists `TODO(agent)` items | Agent-owned docs still contain placeholders; fill them with evidence-backed text |
| Broken documentation links | `validate-links <dir>` lists them; re-run `report` after moving files |
| Verdict says INCOMPLETE | Limits hit or discovered routes remain; see `reports/completeness.md` |

## Tests

| Symptom | Fix |
|---|---|
| Integration tests fail to launch a browser | `npx playwright install chromium` (add `--with-deps` on Linux) |
| Port already in use | The demo script falls back to a free port; tests start the fixture on a free port too. Close other processes using 4310 |
| Tests pass locally, fail on CI Windows or macOS | Look for path separators, line endings, and timing; open a draft PR early |

## Still stuck

Open an issue using the bug template with the output of `doctor`, the exact command, and redacted lines from `logs/research.log`. Never include credentials. Security-sensitive problems: [SECURITY.md](../SECURITY.md).
