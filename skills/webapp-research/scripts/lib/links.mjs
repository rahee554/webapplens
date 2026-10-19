// Documentation hygiene: broken relative links and unresolved agent TODO markers.
import fs from 'node:fs';
import path from 'node:path';

export const TODO_MARK = '<!-- TODO(agent)';

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.secrets' || e.name === '.git') continue;
    const f = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(f);
    else if (e.name.endsWith('.md')) yield f;
  }
}

export function validateLinks(dir) {
  const broken = [];
  let checked = 0;
  for (const file of walk(dir)) {
    const text = fs.readFileSync(file, 'utf8').replace(/```[\s\S]*?```/g, '');
    for (const m of text.matchAll(/!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      const raw = m[1];
      if (/^([a-z]+:|#|\/\/)/i.test(raw)) continue;
      const target = decodeURI(raw.split('#')[0].split('?')[0]);
      if (!target) continue;
      checked++;
      if (!fs.existsSync(path.resolve(path.dirname(file), target))) broken.push({ file: path.relative(dir, file), link: raw });
    }
  }
  return { checked, broken };
}

export function scanTodos(dir) {
  const todos = [];
  for (const file of walk(dir)) {
    fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      if (line.includes(TODO_MARK)) todos.push({ file: path.relative(dir, file).split(path.sep).join('/'), line: i + 1, text: line.replace(/<!--|-->/g, '').replace('TODO(agent):', '').trim() });
    });
  }
  return todos;
}
