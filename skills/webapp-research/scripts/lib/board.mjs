// Roundtable blackboard: an append-only log through which roles talk to each other.
// Each message has a type; questions/objections stay "open" until something replies to them
// (answer/decision/dissent with ref = the message id). Rounds: 1 analysis, 2 cross-review, 3 synthesis.
import path from 'node:path';
import { appendJsonl, nowIso, readJsonl, writeText } from './util.mjs';
import { redactText } from './redact.mjs';

export const MESSAGE_TYPES = ['proposal', 'evidence', 'question', 'answer', 'objection', 'decision', 'dissent', 'handoff'];
const OPENERS = new Set(['question', 'objection']);
const CLOSERS = new Set(['answer', 'decision', 'dissent']);

const boardFile = (project) => path.join(project.p.dir, 'roundtable', 'board.jsonl');
const normRole = (r) => String(r || '').trim().toLowerCase();

export function readBoard(project) {
  return readJsonl(boardFile(project));
}

export function post(project, { role, type, text, to, ref, round }) {
  role = normRole(role);
  if (!role) throw new Error('board post needs --role');
  if (!MESSAGE_TYPES.includes(type)) throw new Error(`--type must be one of: ${MESSAGE_TYPES.join(', ')}`);
  if (!text || !String(text).trim()) throw new Error('board post needs --text');
  const msgs = readBoard(project);
  if (ref && !msgs.some((m) => m.id === ref)) throw new Error(`--ref ${ref} does not exist on the board`);
  const seq = msgs.length + 1;
  const msg = {
    id: `M${String(seq).padStart(3, '0')}`, seq, ts: nowIso(), round: Number(round) || (msgs.length ? msgs[msgs.length - 1].round : 1),
    role, type, to: to ? normRole(to) : null, ref: ref || null, text: redactText(String(text)).slice(0, 2000),
  };
  appendJsonl(boardFile(project), msg);
  return msg;
}

/** Questions/objections with no later answer/decision/dissent that references them. */
export function openItems(msgs) {
  const closed = new Set(msgs.filter((m) => CLOSERS.has(m.type) && m.ref).map((m) => m.ref));
  return msgs.filter((m) => OPENERS.has(m.type) && !closed.has(m.id));
}

export function read(project, { role, since = 0, open = false } = {}) {
  let msgs = readBoard(project);
  if (open) msgs = openItems(msgs);
  if (role) {
    const r = normRole(role);
    msgs = msgs.filter((m) => m.role === r || m.to === r || (open && !m.to));
  }
  return msgs.filter((m) => m.seq > Number(since));
}

/** Records a decision (and optional dissent) about a message; also closes that message. */
export function decide(project, { ref, decision, dissent }) {
  if (!ref || !decision) throw new Error('board decide needs --ref and --decision');
  const d = post(project, { role: 'roundtable-moderator', type: 'decision', text: decision, ref });
  const dis = dissent ? post(project, { role: dissent, type: 'dissent', text: `Dissent recorded on ${ref}: ${decision}`, ref: d.id }) : null;
  return { decision: d, dissent: dis };
}

export function summary(project) {
  const msgs = readBoard(project);
  const roles = [...new Set(msgs.map((m) => m.role))];
  const byId = Object.fromEntries(msgs.map((m) => [m.id, m]));
  const open = openItems(msgs);
  const line = (m) => `- **${m.id}** [${m.role}${m.to ? ` → ${m.to}` : ''}${m.ref ? `, re ${m.ref}` : ''}] ${m.text}`;
  const rounds = [...new Set(msgs.map((m) => m.round))].sort((a, b) => a - b);
  const md = `# Roundtable summary

${msgs.length} message(s) from ${roles.length} role(s): ${roles.join(', ') || 'none'}.

## Decisions
${msgs.filter((m) => m.type === 'decision').map((m) => `${line(m)}${m.ref && byId[m.ref] ? `\n  - about ${m.ref}: ${byId[m.ref].text}` : ''}`).join('\n') || '_None recorded._'}

## Recorded dissent
${msgs.filter((m) => m.type === 'dissent').map(line).join('\n') || '_None._'}

## Open questions and objections
${open.map(line).join('\n') || '_None open._'}

## Transcript
${rounds.map((r) => `### Round ${r}\n${msgs.filter((m) => m.round === r).map((m) => `${line(m)} _(${m.type})_`).join('\n')}`).join('\n\n') || '_Empty board._'}
`;
  const file = path.join(project.p.reports, 'roundtable.md');
  writeText(file, `<!-- generated:webapp-research (rewritten by \`board summary\`) -->\n\n${md}`);
  return { file, messages: msgs.length, open: open.length };
}
