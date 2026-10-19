# Setup

How to install WebAppLens for development and for use with an agent. For a task-oriented walkthrough, see the [user guide](user-guide.md).

Related: [troubleshooting](troubleshooting.md) · [architecture](architecture.md) · [CONTRIBUTING](../CONTRIBUTING.md)

## Requirements

| Need | Version |
|---|---|
| Node.js | 22 or newer (`engines` in `package.json`) |
| npm | Bundled with Node |
| Playwright | `~1.58.2` (the single dependency) |
| Browser | Chromium, downloaded by Playwright |
| OS | Windows, macOS, Linux (CI covers all three) |

Linux containers and CI need system libraries for Chromium: use `npx playwright install --with-deps chromium`.

## Develop on this repository

```bash
git clone https://github.com/<your-username>/webapplens.git
cd webapplens
npm install
npx playwright install chromium
npm run doctor     # launches a real Chromium and renders a page
npm test           # unit + integration tests
npm run demo       # rebuild examples/research/DemoShop from the bundled fixture
```

`npm install` prints a reminder about the browser download; Playwright does not ship the browser inside the npm package.

Faster loops: `npm run test:unit` runs without a browser; `npm run test:integration` runs only the Chromium tests.

## Use the skill in another project

The canonical skill is the folder `skills/webapp-research/`. The installer copies it where an agent platform looks for skills:

```bash
node scripts/install.mjs --platform claude              # Claude Code
node scripts/install.mjs --platform codex               # OpenAI Codex CLI
node scripts/install.mjs --platform agents              # generic agent skills directory
node scripts/install.mjs --platform claude --scope user # personal install instead of project
node scripts/install.mjs --platform claude --dest ./some/dir
```

| Option | Meaning |
|---|---|
| `--platform claude\|codex\|agents` | Which platform layout to use |
| `--scope project\|user` | Install for the current project, or for your user account |
| `--dest DIR` | Override the destination directory |

For Claude Code the installer also copies the role playbooks to `.claude/agents`. Run `node scripts/install.mjs --help` for the exact destinations your version uses.

After installing, install the dependency inside the installed skill folder and verify:

```bash
cd <installed skill folder>        # contains package.json and scripts/
npm install
npx playwright install chromium
node scripts/cli.mjs doctor
```

If you prefer not to use the installer, copy `skills/webapp-research/` by hand to the platform's skills directory (and the `agents/*.md` files to its subagents directory if it has one). The skill locates Playwright through normal module resolution, and falls back to a global `npm i -g playwright`.

## Other agent platforms

No installer target is needed for an agent that can read Markdown and run shell commands: point it at `skills/webapp-research/SKILL.md` (for example from your project's agent instructions file) and let it call `node <skill-dir>/scripts/cli.mjs ...`. If you get another platform working, please tell us with the **Platform support** issue template so it can become a first-class target.

## Credentials

Never paste a password into chat or the command line (`--password` is rejected). Set environment variables named in the project's `credentials.json`:

```bash
# macOS / Linux, current shell only
export DEMOSHOP_USERNAME='...'
export DEMOSHOP_PASSWORD='...'
```

```powershell
# Windows PowerShell, current window only
$env:DEMOSHOP_USERNAME = '...'
$env:DEMOSHOP_PASSWORD = '...'
```

`init` derives default names from the app name (`DEMOSHOP_USERNAME` for an app called "DemoShop"); override with `--username-env` and `--password-env`. Alternative: `--credentials-file` pointing to a git-ignored JSON file `{"username":"...","password":"..."}`.

## First run

```bash
node skills/webapp-research/scripts/cli.mjs doctor
node skills/webapp-research/scripts/cli.mjs init "MyApp" --url https://app.example.com \
  --username-env MYAPP_USER --password-env MYAPP_PASS
node skills/webapp-research/scripts/cli.mjs crawl "MyApp" --max-pages 50
node skills/webapp-research/scripts/cli.mjs report "MyApp"
node skills/webapp-research/scripts/cli.mjs audit "MyApp"
```

Output lands in `.webapplens/docs/MyApp/` (a hidden folder in the root of the project being researched; the CLI adds `.webapplens/.gitignore` for secrets and discovery probes). Only run against applications you are authorized to test.

## Windows notes

- Keep paths short; very long paths can break Playwright and Windows tools.
- A shell whose working directory is inside a research folder blocks deleting it (`EPERM`); `cd` out first.
- The Bash examples above work in Git Bash; the PowerShell variants set environment variables for the current window only.
