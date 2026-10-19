// Credential resolution. Secrets come from environment variables (preferred) or a local JSON file
// that is git-ignored. Passwords are registered with the redactor and never logged.
import fs from 'node:fs';
import { readJson } from './util.mjs';
import { registerSecret } from './redact.mjs';

/** @returns {{username:string,password:string,source:string,warnings:string[]}|null} */
export function resolveCredentials(project, { credentialsFile } = {}) {
  const warnings = [];
  const meta = readJson(project.p.credentials, {}) || {};
  let username;
  let password;
  let source;

  if (credentialsFile) {
    const f = readJson(credentialsFile);
    if (!f) throw new Error(`Cannot read credentials file: ${credentialsFile}`);
    ({ username, password } = f);
    source = 'credentials-file';
  }
  if (!username && meta.username_env && process.env[meta.username_env]) {
    username = process.env[meta.username_env];
    source = 'environment';
  }
  if (!password && meta.password_env && process.env[meta.password_env]) {
    password = process.env[meta.password_env];
    source = 'environment';
  }
  if (!username && meta.username) {
    ({ username } = meta);
    source ||= 'credentials.json';
  }
  if (!password && meta.password) {
    ({ password } = meta);
    source = 'credentials.json';
    if (!meta.public_demo) warnings.push('Password stored in credentials.json (git-ignored). Prefer environment variables.');
  }
  if (!username || !password) return null;
  registerSecret(password);
  if (fs.existsSync(project.p.credentials) && process.platform !== 'win32') {
    try { fs.chmodSync(project.p.credentials, 0o600); } catch { /* best effort */ }
  }
  return { username, password, source, warnings };
}

/** Safe summary for reports: states how access was supplied, never the values. */
export function credentialSummary(project) {
  const m = readJson(project.p.credentials, {}) || {};
  return {
    access_type: m.access_type || 'unknown',
    credentials_source: m.credentials_source || 'unknown',
    verification_status: m.verification_status || 'not_yet_verified',
    last_verified_at: m.last_verified_at || null,
    source_url: m.source_url || null,
  };
}
