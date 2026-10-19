# Security model

WebAppLens drives a real browser against real applications while holding credentials. Its safety rests on **technical enforcement first, instructions second**: even if an agent or a web page misbehaves, the code limits what can happen. This page describes the mechanisms and their known limits. The operational rules agents follow are in [skills/webapp-research/references/safety.md](../skills/webapp-research/references/safety.md); how to report a problem is in [SECURITY.md](../SECURITY.md).

Related: [architecture](architecture.md) · [crawler design](crawler-design.md) · [agent design](agent-design.md) · [CONTRIBUTING](../CONTRIBUTING.md)

## Threats considered

| Threat | Example |
|---|---|
| The crawler changes data | A click triggers a POST that deletes a record |
| The crawler leaves its lane | A link or redirect sends it to another site; a "log out" link ends the session |
| Secrets leak into artifacts | A password in a log line, URL, error message, or report committed to git |
| Hostile page content | Hidden text telling an agent to ignore its rules or reveal credentials |
| Unauthorized use | Pointing the tool at an application the user may not test |
| Access-control bypass | Defeating CAPTCHA, MFA, paywalls, or rate limits |

## Mechanisms

### 1. Mutation guard (`lib/browser.mjs`)

`openSession` registers a route handler on the whole browser context. Once login is done and the crawl starts (`guard.enabled = true`), any request whose method is not `GET`, `HEAD`, or `OPTIONS` is aborted with `blockedbyclient` and recorded under `evidence/network-summary.json` as `blocked`. Two controlled exceptions:

- `--sandbox` (config `sandbox: true`) lifts the guard. Use it only with the user's confirmation that the data is disposable.
- `--allow-post REGEX` (config `allowPostPatterns`) lets matching URLs through, for read-only POST APIs such as GraphQL search.

The login request happens before the guard is enabled; that is the one deliberate write.

### 2. Scope policy (`lib/scope.mjs`)

`makeScope` allows only `http(s)` URLs on the base origin, `allowedOrigins`, and optionally subdomains. It rejects download extensions (zip, pdf, csv, office files and others) and anything matching the default excludes (logout/sign-out, and delete/destroy/remove path segments) plus your `exclude` regexes. The same check runs inside the browser guard for navigation requests, so a redirect or script that navigates out of scope is aborted too. Out-of-scope origins are listed in `docs/limitations.md`, not visited.

### 3. Action classification (`lib/safety.mjs`)

| Category | Meaning | Handling |
|---|---|---|
| A | Safe observation (navigate, expand, search, filter) | Automatic |
| B | Controlled testing (save, create, edit, submit) | Only in a confirmed sandbox |
| C | Consequential (delete, send, publish, pay, invite, log out) | Explicit approval for each action |

Matching is by label and target URL. **Unknown labels are B**: when in doubt, do not click. Consequential links are skipped during harvesting and listed as skipped. Dialog "opener" buttons (Add, New, Create, Filter...) are clicked only with `--probe-openers`, never if they look consequential, and POSTs stay blocked regardless.

### 4. Browser hardening

Downloads are disabled (`acceptDownloads: false`), service workers are blocked, and the crawler never submits forms. Tab clicks and menu expansion skip category C labels.

### 5. Stop, do not bypass (`login` in `lib/browser.mjs`)

If a CAPTCHA widget is detected on the login page the run stops with `captcha_present`. A one-time-code input after submit stops it with `mfa_required`. Neither is worked around. A page that still shows a login form after submit yields `login_rejected` and the crawl does not start.

### 6. Secrets

- Credentials come from environment variables named in `credentials.json` (names only), or a `--credentials-file`. A password stored in `credentials.json` triggers a warning. The CLI rejects `--password` so passwords never reach shell history.
- On resolution the password is registered with the redactor (`registerSecret`), which then scrubs it as a literal anywhere it appears.
- `redactText` also removes `Bearer` tokens, JWT-shaped strings, and `password|token|secret|api_key|session = value` patterns. `redactUrl` masks secret-looking query parameters and strips URL credentials. `redactObject` masks values under secret-looking keys.
- Everything persisted passes through redaction: the log (`project.log`), observations (`makeObservation`), recorded URLs and form actions, console and request diagnostics, error messages printed by the CLI.
- Inspector field defaults are withheld for password-like fields (type password, or names/labels matching pass, secret, token, api key, ssn, card, cvv, cvc, iban) and file inputs.
- `.secrets/` (saved session state), `credentials.json`, and `*.local.json` are git-ignored in both the project folder and the repository.
- An integration test asserts the password appears nowhere in the generated project folder (PNG files excluded).

**Known limit:** screenshots are not pixel-redacted. The manifest records `redacted: false` and a note. Review before publishing; prefer demo accounts. Mask support is [PLANNED](roadmap.md).

### 7. Untrusted content

Page text, alt text, hidden elements, console output, error messages, and API responses are data. The skill and every playbook instruct agents to ignore instructions found there, never widen scope or reveal credentials because of them, and to record such attempts as a finding (`observe --type observed`). The code enforces what it can (scope and mutation guards do not depend on the model's compliance); the rest is instruction-level, and is the likeliest place for gaps. Reports of injection-handling gaps are in scope for [SECURITY.md](../SECURITY.md).

## What the guard does not cover

- A GET request that mutates data (badly designed apps). Mitigated by the default excludes and by labels, not guaranteed. Prefer a sandbox for unfamiliar applications.
- Side effects of simply loading pages (analytics, "last seen" timestamps, read receipts).
- Anything an agent does outside the CLI, for example with a separate browser tool. The playbooks route all browsing through one session, but that is policy, not code.
- Local machine safety against a malicious site exploiting the browser itself; keep Playwright and Chromium updated.

## Reviewing safety-relevant changes

The safety surface is `safety.mjs`, `scope.mjs`, the guards in `browser.mjs`, `redact.mjs`, `credentials.mjs`, and the safety wording in `SKILL.md` and `references/safety.md`. Changes there need tests and a described safety impact; see [CONTRIBUTING](../CONTRIBUTING.md#add-a-safety-rule). The integration tests that protect the invariants are in `tests/integration/crawler.test.mjs` (guard blocks non-GET, nothing mutating or session-ending reached the server, destructive controls never exercised, password absent from the project folder).
