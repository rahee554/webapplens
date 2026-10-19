import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { initProject } from '../../skills/webapp-research/scripts/lib/project.mjs';
import { addObservation } from '../../skills/webapp-research/scripts/lib/evidence.mjs';
import { buildDashboard, writeDashboard } from '../../skills/webapp-research/scripts/lib/viewer.mjs';

test('dashboard embeds data safely (no script-tag breakout) and is a single self-contained file', () => {
  const { project } = initProject({ outRoot: fs.mkdtempSync(path.join(os.tmpdir(), 'wr-view-')), app: 'V', baseUrl: 'https://v.test' });
  addObservation(project, { type: 'observed', claim: '</script><img src=x onerror=alert(1)>' });
  const html = buildDashboard(project);
  assert.equal(html.split('</script>').length - 1, 1, 'only the template closes its script block');
  assert.ok(!html.includes('<img src=x'), 'raw markup from data is escaped inside the JSON');
  const m = html.match(/const D = (\{[\s\S]*?\});\nconst \$ =/);
  const data = JSON.parse(m[1]);
  assert.equal(data.observations[0].claim, '</script><img src=x onerror=alert(1)>', 'data round-trips exactly');
  assert.equal(data.manifest.application, 'V');
  assert.ok(fs.existsSync(writeDashboard(project)));
  assert.doesNotMatch(html, /https?:\/\/(?!www\.w3\.org)[^"' )]+\.(js|css)/, 'no external scripts or styles');
});
