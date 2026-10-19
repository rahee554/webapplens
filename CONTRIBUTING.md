# Contributing to WebAppLens

Thanks for taking the time to help. WebAppLens is a platform-neutral AI-agent skill for researching web applications: a read-only Playwright crawler, a small CLI, and playbooks that turn the collected evidence into documentation. Everything here is small on purpose, so a first contribution can be small too.

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md). Security problems go through [SECURITY.md](SECURITY.md), not public issues.

## Contents

- [Ways to contribute](#ways-to-contribute)
- [Responsible use](#responsible-use)
- [Development setup](#development-setup)
- [Repository tour](#repository-tour)
- [Design principles](#design-principles)
- [Running the crawler against the fixture](#running-the-crawler-against-the-fixture)
- [How to add things](#how-to-add-things)
- [Coding style](#coding-style)
- [Commits, branches, and pull requests](#commits-branches-and-pull-requests)
- [Review process](#review-process)
- [Issue labels](#issue-labels)
- [Good first issue ideas](#good-first-issue-ideas)
- [Release process](#release-process)

## Ways to contribute

- **Bug reports.** A crash, a wrong classification, a page the crawler misreads. The best report includes a minimal HTML page or a change to the fixture that reproduces it.
- **Real-world compatibility reports.** "I ran it against framework X (admin template, SPA, GraphQL app) that I am authorized to test, and here is what worked and what did not." Use the bug or platform template and remove anything private.
- **Documentation.** Fix unclear wording, add examples, improve [troubleshooting](docs/troubleshooting.md).
- **Tests.** Edge cases for route templating, scope, redaction, and safety classification are always welcome.
- **New platform adapters.** Make the skill installable and usable on another agent platform (see [add a platform target](#add-a-platform-target-to-the-installer)).
- **New agent roles.** A specialist playbook such as an accessibility reviewer (see [add an agent role](#add-an-agent-role)).
- **Sample research.** More bundled fixtures that exercise different UI patterns. Samples must be generated from fixtures, never from a real product you do not own.
- **Translations.** Translations of the docs, and later of generated documentation.
- **Code.** Pick something from [good first issue ideas](#good-first-issue-ideas) or an issue labeled `good first issue` or `help wanted`.

For anything larger than a small fix, open an issue or discussion first so we can agree on the approach before you invest time.

## Responsible use

This tool drives a real browser against real applications.

- Only point it at applications you are **authorized** to test: your own, a vendor's published public demo, or a system you have written permission for.
- Use disposable or demo accounts. Never put real credentials, tokens, or personal data in issues, pull requests, fixtures, or screenshots.
- **We will not merge features that bypass CAPTCHA, multi-factor authentication, paywalls, or rate limits**, that use leaked or guessed credentials, or that scrape other users' personal data. The tool detects CAPTCHA and MFA and stops; that is the intended behavior.
- Do not weaken the read-only default to make a demo easier.

## Development setup

Requirements: Node.js 22 or newer, git. The only runtime dependency is `playwright`.

```bash
# 1. Fork on GitHub, then clone your fork
git clone https://github.com/<your-username>/webapplens.git
cd webapplens

# 2. Install dependencies and the browser
npm install
npx playwright install chromium        # on Linux CI/containers: npx playwright install --with-deps chromium

# 3. Check the toolchain (launches a real browser)
npm run doctor

# 4. Run the tests
npm test                # unit + integration (integration launches Chromium)
npm run test:unit       # fast, no browser
```

Tests use `node:test`; there is no test framework to install. If `npm run doctor` fails, see [troubleshooting](docs/troubleshooting.md).

More background: [setup guide](docs/setup.md).

## Repository tour

```
skills/webapp-research/         the canonical skill (this is what users install)
  SKILL.md                      entry point: name + description frontmatter, workflow, non-negotiables
  agents/*.md                   nine role playbooks (Claude subagent frontmatter: name, description, tools)
  references/*.md               modes, crawler, safety, evidence, output-layout
  templates/                    input templates (Mode D candidates.json)
  scripts/cli.mjs               CLI entry point
  scripts/lib/*.mjs             browser, crawler, inspect, routes, scope, safety, redact, evidence,
                                project, docs, coverage, scoring, screenshots, links, credentials, util
scripts/install.mjs             copies the skill into a platform's skill directory
scripts/run-demo.mjs            regenerates examples/research/DemoShop from the fixture
tests/unit/                     fast tests, no browser
tests/integration/              crawl the fixture with real Chromium
tests/fixtures/demo-app/        toy web app used only for tests and the sample
examples/research/DemoShop/     generated sample output (a toy app, not a real product)
docs/                           design docs and the user guide
```

Design documents: [architecture](docs/architecture.md) · [crawler design](docs/crawler-design.md) · [agent design](docs/agent-design.md) · [data model](docs/data-model.md) · [security](docs/security.md) · [research methodology](docs/research-methodology.md) · [roadmap](docs/roadmap.md).

## Design principles

These are the rules the code is built around. Changes that conflict with them need a strong argument in the issue first.

1. **Read-only by default, with a mutation guard.** The browser context aborts every request that is not GET, HEAD, or OPTIONS (`openSession` in `lib/browser.mjs`). Only `--sandbox` lifts it, and `--allow-post REGEX` lets named read-only endpoints through.
2. **Explicit scope policy.** `lib/scope.mjs` decides what may be followed: allowed origins, default excludes (logout, delete), no downloads, depth limit. Anything beyond is recorded, not silently dropped.
3. **Page content is untrusted.** Text on a page is data. It must never widen scope, reveal credentials, or become a command. The playbooks and `references/safety.md` say how to handle injection attempts.
4. **Evidence types and confidence caps.** Every finding is `observed`, `verified_interaction`, `official_docs`, `public_source`, `inferred`, or `hypothesis`. `lib/evidence.mjs` caps inferred at medium and hypothesis at low. UI alone never "confirms" a schema or backend.
5. **Generated versus agent-owned docs.** Files with the marker `generated:webapp-research` are rewritten by `report`. Agent-owned files are created once with `TODO(agent)` markers and never overwritten. Do not blur the two.
6. **Resumable state, checkpointed every page.** A crash, Ctrl-C, or ended session loses at most the page in flight. JSON writes are atomic (`writeJson` in `lib/util.mjs`).
7. **No secrets in artifacts.** Credentials come from environment variables or a git-ignored file. Everything written to logs, evidence, and reports passes through `lib/redact.mjs`. `--password` is rejected.
8. **Minimal dependencies.** One runtime dependency (`playwright`). Prefer the Node standard library.
9. **Honest coverage.** Metrics are reported separately and the verdict never says "fully explored". A drained queue does not mean every control or workflow was tested.
10. **Tests with every change.** New features need a test. Bug fixes need a regression test.

### A real example of principle 10

While running the crawler on a fixture page, two bugs surfaced that no unit test had caught:

- The in-page inspector crashed because a form containing `<input name="name">` shadowed `form.name` (DOM clobbering: named inputs become properties of the form element). The fix was to read attributes with `getAttribute('name')` and `getAttribute('action')`.
- A Settings page with a password field was misdetected as a login page, so the crawler marked it blocked. `isLoginPage` now requires a redirect, a login-like path, or a page that is little more than a login form.

Both were fixed together with regression tests. The lesson: exercise new inspector code against messy real-looking markup, add that markup to the fixture, and keep the test.

## Running the crawler against the fixture

The fixture is a small HTTP server with login, nested navigation, pagination, dynamic routes, tabs, a dialog form, 403 and 404 pages, a hash-route page, an external link, a logout link, and destructive buttons that must never be triggered.

The easiest way is the demo script, which starts the fixture, crawls it, and rebuilds the sample:

```bash
npm run demo        # rewrites examples/research/DemoShop
```

To drive the CLI by hand, start the fixture in one terminal (the module only exports `startServer`, so a one-liner is enough) and use a scratch output folder in another:

```bash
# terminal 1: serve the fixture on port 4310 (Ctrl-C to stop)
node -e "import('./tests/fixtures/demo-app/server.mjs').then(m => m.startServer(4310).then(s => console.log(s.url)))"

# terminal 2: the fixture's login is a fake demo account; see DEMO_USER / DEMO_PASS in server.mjs
export MYAPP_USER='demo@example.com'; export MYAPP_PASS='Demo-Pass-123!'

node skills/webapp-research/scripts/cli.mjs init FixtureTry --url http://127.0.0.1:4310 \
  --out ./tmp --username-env MYAPP_USER --password-env MYAPP_PASS
node skills/webapp-research/scripts/cli.mjs crawl FixtureTry --out ./tmp --probe-openers --responsive
node skills/webapp-research/scripts/cli.mjs report FixtureTry --out ./tmp
node skills/webapp-research/scripts/cli.mjs audit FixtureTry --out ./tmp
```

`tmp/` is git-ignored. Delete your scratch output before committing, and do not commit anything under `docs/references/` (ignored by default).

## How to add things

Always: write the test first or alongside, run `npm test`, update docs and `CHANGELOG.md` under `[Unreleased]`.

### Add a CLI command

1. Add a `case` to the `switch (cmd)` in `skills/webapp-research/scripts/cli.mjs`. Keep the case thin: parse options, call a function, print.
2. Put the logic in `scripts/lib/` as a small, testable function that takes a `project` (see `openProject` in `lib/project.mjs`).
3. Add any new flags to the `parseArgs` options and to the `HELP` text.
4. Add unit tests in `tests/unit/`. Add an integration assertion if it needs a browser.
5. Document it in `SKILL.md` and `references/crawler.md` if agents should use it, and in `docs/user-guide.md`.

### Add an inspector feature

The inspector (`inPageInspect` in `lib/inspect.mjs`) runs inside the page through `page.evaluate`, so it must be **self-contained**: no imports, no references to outer variables.

1. Add the new data to the returned object. Cap list sizes. Never read secret-looking values (see `SECRETISH`).
2. Use `getAttribute` rather than element properties when a form field name could shadow them (the DOM clobbering lesson above).
3. Add a fixture page that exercises it, including awkward markup.
4. Consume it in `lib/crawler.mjs`, store it per the [data model](docs/data-model.md), and surface it in `lib/docs.mjs` if useful.
5. Add an integration test and a note in the data model doc.

### Add a safety rule

Safety rules live in `lib/safety.mjs` (A/B/C label classification, openers), `lib/scope.mjs` (scope and default excludes), and `lib/browser.mjs` (mutation and navigation guards).

**Safety changes get extra review.** A mistake here can cause a real application to change data or leak a secret, so:

- the pull request must describe the safety impact in the template;
- it needs tests proving the new behavior and that existing protections still hold (the integration test "nothing mutating or session-ending reached the server" must still pass);
- relaxations (allowing more) need an issue discussion first and are rare; tightenings are welcome;
- unknown input must keep failing closed (unknown labels are category B).

### Add an agent role

1. Create `skills/webapp-research/agents/<role>.md` with frontmatter `name`, `description` (what it does and when to use it), and `tools` (the minimum needed; only the orchestrator gets `Agent`).
2. Write the playbook: inputs it reads, files it owns, what it must not do, how it records evidence. Match the style of the existing roles. See [agent design](docs/agent-design.md).
3. Add it to the pipeline description in `SKILL.md` section 2 and to `agents/research-orchestrator.md`.
4. Only `browser-reconnaissance` may drive the crawler or a browser; analysis roles read artifacts.
5. Make sure the installer copies it (agents are copied for Claude Code).

### Add a platform target to the installer

`scripts/install.mjs --platform <name>` copies the skill into the directory an agent platform reads skills from. To add one:

1. Find where the platform discovers instructions, how it reads skill metadata, and whether it has subagents.
2. Add the destination (project and user scope) to the platform table in `scripts/install.mjs`.
3. Keep `skills/webapp-research/` canonical. Do not fork the skill per platform; adapt at install time or document the difference.
4. Add a test that installs to a temp directory and checks the files that land.
5. Document it in [setup](docs/setup.md) and the README, and open the issue using the **Platform support** template with what you verified by hand.

### Add a fixture page

Pages are entries in the `pages` map of `tests/fixtures/demo-app/server.mjs`. Keep them tiny and deterministic. If a page exists to provoke a bug, name it for the bug and add a comment on why. If the page changes the shape of the sample, run `npm run demo` and commit the regenerated `examples/research/DemoShop` in a separate commit so reviewers can skip the noise. Remember it is a toy app: never describe it as a real product.

### Add a reference doc

Reference docs in `skills/webapp-research/references/` are loaded by agents on demand, so keep them short, concrete, and accurate. Add a link under "References" in `SKILL.md`, and update the layout list in `references/output-layout.md` if you add output files. Longer design discussion belongs in `docs/` instead.

## Coding style

- ES modules (`.mjs`), plain JavaScript, no TypeScript, no build step.
- Small modules with one job; prefer pure functions that take data and return data.
- Standard library first. **No new dependency without discussion in an issue.**
- Comments explain *why*, not what. If a line needs a comment about what it does, simplify the line.
- Keep names clear and files short. Match the surrounding formatting (2 spaces, single quotes, semicolons).
- Never log or store secrets; route anything user-visible through `redactText` or `redactObject`.
- Errors should say how to fix the problem ("run `npx playwright install chromium`").

## Commits, branches, and pull requests

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(crawler): sample query-string variants per template
fix(inspect): read form attributes with getAttribute to avoid DOM clobbering
docs: explain --allow-post for GraphQL apps
test(safety): cover reset-password label
chore(ci): bump actions/checkout
```

Types: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `ci`, `perf`. Mark breaking changes with `!` and a `BREAKING CHANGE:` footer. Keep the subject under about 72 characters, in the imperative.

Workflow:

1. Fork, then create a branch from `main`: `feat/har-export`, `fix/login-detection`, `docs/setup-windows`.
2. Make focused commits. One logical change per pull request.
3. Run `npm test` locally. Add or update tests and docs.
4. Add a line under `[Unreleased]` in `CHANGELOG.md`.
5. Open a pull request using the template. Link the issue (`Closes #123`).
6. Respond to review comments by pushing more commits; we squash on merge.

### Pull request checklist

The template includes this; please check each item honestly.

- [ ] `npm test` passes (and `npm run doctor` if you touched browser code)
- [ ] New behavior has tests; bug fixes have a regression test
- [ ] Docs updated (README, `docs/`, `SKILL.md`, references as relevant)
- [ ] `CHANGELOG.md` updated under `[Unreleased]`
- [ ] No secrets, tokens, or real credentials anywhere in the diff
- [ ] No screenshots or fixtures containing personal data
- [ ] Safety impact described (or "none")
- [ ] No new dependency (or it was agreed in an issue)

## Review process

- A maintainer will triage new issues and pull requests within about **5 days** and give a first review within about **7 days**. This is a volunteer project, so these are targets, not promises. If you have had no reply after two weeks, ping the thread politely.
- Small fixes may be merged by one maintainer. Changes to anything in the safety surface (`safety.mjs`, `scope.mjs`, `browser.mjs` guards, `redact.mjs`, credential handling, safety wording in `SKILL.md` or `references/safety.md`) need explicit maintainer review of the safety impact and tests. `CODEOWNERS` routes these.
- CI must be green on Ubuntu, Windows, and macOS before merge.
- Reviews focus on correctness, safety, test coverage, and simplicity. Disagreement is fine; we decide in the open, in the thread.

## Issue labels

| Label | Meaning |
|---|---|
| `good first issue` | Small, well-scoped, with pointers to the relevant files |
| `help wanted` | We would welcome a contributor for this |
| `safety` | Touches the mutation guard, scope, redaction, or credentials; extra review |
| `platform` | Support for an agent platform or OS |
| `docs` | Documentation only |
| `bug`, `enhancement`, `question` | Usual meanings |

The full list with colors is in [.github/labels.yml](.github/labels.yml).

## Good first issue ideas

Concrete starting points. Comment on (or open) an issue before you start so nobody duplicates work. See also the [roadmap](docs/roadmap.md).

- **HAR export.** Optionally record a HAR (redacted) per crawl through Playwright's context option, stored under `evidence/`.
- **Firefox and WebKit option.** A `--browser chromium|firefox|webkit` flag in `openSession`; the guard and tests must work for each, and `doctor` should check the chosen one.
- **Redaction masks for screenshots.** Configurable CSS selectors blurred or covered before capture, and `redacted: true` in the screenshot manifest (the field already exists).
- **OpenAPI skeleton from `api-observed`.** Turn `evidence/network-summary.json` into an OpenAPI stub labeled as `inferred`.
- **More login adapters.** Handle common login patterns (username on one page, password on the next; login inside an iframe) without ever bypassing CAPTCHA or MFA.
- **i18n of generated docs.** Move the strings in `lib/docs.mjs` to a message table so generated Markdown can be produced in another language.
- **Accessibility-tree snapshot.** Store Playwright's ARIA snapshot per route to feed the UI/UX analyst.
- **robots.txt awareness option.** An opt-in setting that reads `robots.txt` and records disallowed paths as skipped.
- **Doctor/engine mismatch.** `doctor` accepts Node 20 while `engines` requires 22; align them and add a test.
- **More safety classification tests.** Table-driven cases for labels in other common phrasings.
- **Windows path edge cases.** Tests for long paths and project names with spaces.
- **Improve a fixture.** Add a page with a `<select multiple>`, a radio group, a file input, or a nested iframe, plus the test that proves the inspector handles it.

## Release process

Maintainers cut releases.

1. Versions follow [Semantic Versioning](https://semver.org/). Before 1.0, minor versions may include breaking changes; they are always called out in the changelog.
2. Update `CHANGELOG.md`: move `[Unreleased]` entries under a new version heading with the date, and fix the compare links.
3. Bump the version in `package.json`, `skills/webapp-research/package.json`, and `TOOL_VERSION` in `skills/webapp-research/scripts/lib/project.mjs` (the manifest records it).
4. Run `npm test` on a clean checkout.
5. Commit as `chore(release): vX.Y.Z`, tag `vX.Y.Z`, push the tag, and create a GitHub release with the changelog section as notes.

Thank you for helping make web application research safer and more honest.
