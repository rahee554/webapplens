# AGENTS.md

Instructions for AI coding agents (Claude Code, Codex, Cursor, Gemini CLI, Copilot, …) working **in this repository**. For *using* the skill on a web app, read `skills/webapp-research/SKILL.md`.

## What this repo is
WebAppLens: a platform-neutral agent skill (`skills/webapp-research/`) that researches web applications — a read-only Playwright crawler + CLI + evidence-tagged documentation generator. Plain Markdown + Node (>= 22), one dependency (`playwright`).

## Commands
```bash
npm install && npx playwright install chromium   # setup
npm run doctor                                    # verify Node + Chromium
npm run test:unit                                 # fast, no browser
npm test                                          # unit + integration (launches Chromium, ~1 min)
npm run demo                                      # regenerate examples/research/DemoShop from the fixture app
node scripts/install.mjs --platform claude|codex|agents --scope project   # install the skill for a platform
```

## Layout
- `skills/webapp-research/SKILL.md` – the skill entry point (front matter: `name`, `description`)
- `skills/webapp-research/agents/*.md` – nine role playbooks
- `skills/webapp-research/scripts/cli.mjs`, `scripts/lib/*.mjs` – CLI and libraries (no TypeScript, ESM)
- `skills/webapp-research/references/`, `templates/` – on-demand docs and templates (incl. dashboard template)
- `tests/unit`, `tests/integration`, `tests/fixtures/demo-app` – `node:test` suites and a local fixture web app
- `examples/research/DemoShop` – sample output of the tool on the **fixture app** (a toy app, not a real product)
- `docs/` – guides and design docs; `assets/` – logo

## Rules for changes
1. **Safety is a feature.** Do not weaken the read-only mutation guard, scope policy, redaction, CAPTCHA/MFA refusal or untrusted-content handling. Safety changes need a regression test and explicit mention in the PR.
2. **No secrets in artifacts.** Passwords only via env vars or a git-ignored file; never via argv; everything written goes through `lib/redact.mjs`.
3. **Honest claims.** Never write "fully explored", never present UI-derived schemas/frameworks as confirmed. Evidence types/confidence caps live in `lib/evidence.mjs`.
4. **Tests first for bugs.** Reproduce on the fixture app (`tests/fixtures/demo-app/server.mjs`), then fix. Every new feature gets a test.
5. **Generated vs agent-owned docs**: files with the `generated:webapp-research` marker are rewritten by `report`; `TODO(agent)` markers flag unfinished analysis.
6. Keep dependencies minimal; discuss before adding any. Match the surrounding style (small modules, comments explain *why*).
7. Windows: do not delete a directory a shell is sitting in (EPERM); clear its children instead.

See `CONTRIBUTING.md` for the full workflow.
