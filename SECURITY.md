# Security policy

WebAppLens drives a real browser against web applications and handles credentials, so security reports are taken seriously.

## Supported versions

| Version | Supported |
|---|---|
| 0.1.x (latest) | Yes |
| anything older | No |

Until 1.0, only the latest minor release receives security fixes.

## Reporting a vulnerability

Please **do not** open a public issue for a vulnerability.

Use GitHub private vulnerability reporting: open `https://github.com/<your-username>/webapplens/security/advisories/new` (the repository's **Security** tab, **Report a vulnerability**).

Include, where you can:

* what you did, what you expected, and what happened;
* the WebAppLens version (`package.json`) and Node version;
* a minimal reproduction, ideally against the bundled fixture (`tests/fixtures/demo-app/server.mjs`) rather than a real third-party site;
* the impact in your own words.

Never include real credentials, session tokens, or personal data in a report. Use throwaway values.

## What counts as a vulnerability

In scope:

* **Mutation guard bypass.** Any way the crawler causes a non-GET/HEAD/OPTIONS request to reach a server without `--sandbox` or an explicit `--allow-post` match.
* **Scope escape.** The crawler navigating to, or sending requests to, an origin outside `baseUrl` and `allowedOrigins`, or following links the scope policy should exclude (logout, delete, downloads).
* **Secret leakage into artifacts.** A password, token, cookie, JWT, or API key appearing in logs, evidence, reports, generated docs, `credentials.json`, command lines, or error messages. Screenshots are known not to be pixel-redacted (see below).
* **Prompt-injection handling gaps.** Skill or agent instructions that let text on a crawled page widen scope, reveal credentials, or cause commands to run.
* **Unsafe credential handling.** For example, accepting a password on the command line, or writing secrets outside `.secrets/` or environment variables.
* **Path traversal or arbitrary file write** from crafted page content, route names, or config values (for example via screenshot or doc file names).
* **Installer issues** (`scripts/install.mjs`) that write outside the intended destination.

Out of scope:

* Vulnerabilities in the applications you point the crawler at.
* Vulnerabilities in Playwright, Chromium, or Node.js themselves; report those upstream.
* Screenshots containing personal data visible on the page. They are not pixel-redacted by design and the docs say so; reviewing them before publishing is the user's job. Ideas for improving this are welcome as feature requests.
* Using the tool against systems you are not authorized to test.
* Denial of service of your own machine through very large `--max-pages` values.

## Response targets

These are best-effort targets for a volunteer-run project, not guarantees.

| Step | Target |
|---|---|
| Acknowledge your report | within 3 days |
| Initial assessment (accepted, needs info, or declined) | within 7 days |
| Fix or mitigation for confirmed high-severity issues | within 30 days |
| Public advisory and release | after a fix ships; coordinated with you |

We will credit reporters in the advisory and `CHANGELOG.md` unless you prefer to stay anonymous.

## Safe harbour

If you make a good-faith effort to follow this policy, we will not pursue or support legal action against you for your research. Good faith means you: test only against your own machine, the bundled fixture, or systems you are authorized to test; avoid privacy violations and data destruction; do not exploit an issue beyond what is needed to demonstrate it; and give us reasonable time to fix it before disclosure. This policy covers this repository only and cannot grant permission on behalf of third parties.

## Security design in brief

* Browsing is read-only by default: the browser context aborts every request that is not GET, HEAD, or OPTIONS.
* A scope policy limits navigation to allowed origins and skips logout, delete, and download links.
* Controls are classified A (safe), B (controlled testing), C (consequential); unknown labels are treated as B.
* Secrets come from environment variables or a git-ignored file, are registered with a central redactor, and are scrubbed from logs, evidence, and reports. `--password` is rejected.
* Page content is untrusted data, never instructions.
* CAPTCHA and MFA are detected and reported, never bypassed.

Full details: [skills/webapp-research/references/safety.md](skills/webapp-research/references/safety.md) and [docs/security.md](docs/security.md).
