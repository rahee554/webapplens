# Updates

The version lives in `skills/webapp-research/VERSION`. `package.json`, `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` carry the same number; a unit test keeps them equal.

## Checking

```bash
wr update-check [--force] [--json] [--quiet]
```

Reads the latest `VERSION` from GitHub (`rahee554/webapplens`, `main`), caches the answer for 24 hours in `~/.webapplens/update-check.json`, is silent when offline and **changes nothing**. `--quiet` prints only when an update exists; `--json` returns `{current, latest, update_available, offline, notes_url, notice}`; `--force` skips the cache.

The plugin ships `hooks/hooks.json` with a `SessionStart` hook that runs `update-check --quiet`, so Claude is told at session start when an update exists and prints nothing otherwise. The hook file format should be verified against the current Claude Code hooks documentation; it is not covered by an automated test.

## What the agent does

1. Run `update-check --quiet` at preflight (once per session).
2. If it prints a notice: **tell the user** the current and latest versions and the changelog link, and ask whether to update now. Do not update silently.
3. On yes: `update` first (it prints the plan and changes nothing), then `update --yes`.
4. **Auto mode** still does not update, unless the user pre-authorized updates. Mention the available update in the final report instead.
5. Offline or failed check: continue; never block research on it.

## What `update` does, by install kind

| Install | Behaviour |
|---|---|
| Claude Code plugin | Prints the plugin commands and never touches plugin folders: `/plugin marketplace update webapplens`, then `/plugin update webapplens@webapplens` |
| Git checkout | `git pull --ff-only`, then `npm install --omit=dev` in the skill folder |
| Plain copy (installer, `.claude/skills`, `.codex/skills`, `.agents/skills`) | Downloads the GitHub tarball, validates `SKILL.md` and `VERSION` and that the version is newer, backs the old files up **outside** the skills folder (`~/.webapplens/backups`, so a backup never registers as a duplicate skill), copies the new files over (keeping `node_modules`), refreshes sibling role files in `../../agents`, runs `npm install --omit=dev` |

`update` without `--yes` shows the plan and changes nothing. A failed validation aborts without changes.

## Manual alternatives

- `git pull` in a clone, then `npm install`.
- Re-run the installer from a fresh clone: `npx webapplens install ...` (or `node scripts/install.mjs --platform ... --scope ...`).
