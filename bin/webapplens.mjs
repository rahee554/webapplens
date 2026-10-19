#!/usr/bin/env node
// `npx webapplens install --platform codex` installs the skill; anything else goes to the skill CLI.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [first, ...rest] = process.argv.slice(2);
const script = first === 'install' ? path.join(root, 'scripts', 'install.mjs') : path.join(root, 'skills', 'webapp-research', 'scripts', 'cli.mjs');
const args = first === 'install' ? rest : process.argv.slice(2);
process.exit(spawnSync(process.execPath, [script, ...args], { stdio: 'inherit' }).status ?? 1);
