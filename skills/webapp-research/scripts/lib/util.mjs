import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const slug = (s, max = 60) =>
  String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max).replace(/-+$/, '') || 'untitled';

export const shortHash = (s, n = 6) => crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, n);

export const nowIso = () => new Date().toISOString();

export const ensureDir = (d) => fs.mkdirSync(d, { recursive: true });

export function writeText(file, text) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, text);
}

/** Atomic write: a crash mid-write never leaves a truncated state file. */
export function writeJson(file, data) {
  ensureDir(path.dirname(file));
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(tmp, file);
}

export function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

export function appendJsonl(file, obj) {
  ensureDir(path.dirname(file));
  fs.appendFileSync(file, JSON.stringify(obj) + '\n');
}

export function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null; // tolerate a torn last line after a crash
      }
    })
    .filter(Boolean);
}

/** Relative POSIX link from one file to another (for Markdown). */
export const relLink = (fromFile, toFile) =>
  path.relative(path.dirname(fromFile), toFile).split(path.sep).join('/');

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
