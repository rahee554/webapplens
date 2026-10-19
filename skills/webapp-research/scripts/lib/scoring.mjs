// Transparent product ranking for Mode D (discovery / demo comparison).
// Scores are 0-5 per criterion and every non-zero score must cite evidence URLs, otherwise the
// candidate is flagged. A demo-access score above 3 requires a *verified* demo.
export const DEFAULT_WEIGHTS = { relevance: 0.35, coverage: 0.25, demo_access: 0.2, docs: 0.1, researchability: 0.1 };

export function rankCandidates(data, { top = 5 } = {}) {
  const raw = { ...DEFAULT_WEIGHTS, ...(data.weights || {}) };
  const sum = Object.values(raw).reduce((a, b) => a + b, 0);
  const weights = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v / sum]));

  const ranked = (data.candidates || []).map((c) => {
    const flags = [];
    const scores = { ...c.scores };
    for (const k of Object.keys(weights)) {
      const v = Number(scores[k] ?? 0);
      if (!(v >= 0 && v <= 5)) throw new Error(`${c.name}: score "${k}" must be 0-5`);
      scores[k] = v;
      if (v > 0 && !(c.evidence?.[k]?.length)) flags.push(`no evidence URL for ${k}`);
    }
    if (scores.demo_access > 3 && c.demo?.verification_status !== 'verified') {
      scores.demo_access = 3;
      flags.push('demo_access capped at 3: demo not verified');
    }
    const total = Math.round(Object.entries(weights).reduce((a, [k, w]) => a + w * (scores[k] / 5) * 100, 0) * 10) / 10;
    return { ...c, scores, total, flags };
  });
  ranked.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  return { weights, ranked: ranked.slice(0, top), considered: ranked.length, short_list_note: ranked.length < top ? `Only ${ranked.length} credible candidate(s) supplied; no filler added.` : null };
}

export function renderComparison(result) {
  const esc = (s) => String(s ?? '').replace(/\|/g, '\\|');
  const rows = result.ranked.map((c, i) => `| ${i + 1} | ${esc(c.name)} | ${c.total} | ${esc(c.website)} | ${esc((c.modules || []).join(', '))} | ${esc(c.demo?.url || '—')} | ${esc(c.demo?.access_type || '—')} | ${esc(c.demo?.registration_required ? 'yes' : 'no')} | ${esc(c.demo?.verification_status || 'unverified')} | ${esc(c.limitations || '')} | ${esc(c.flags.join('; '))} |`);
  return `# Product comparison

Weights: ${Object.entries(result.weights).map(([k, v]) => `${k} ${Math.round(v * 100)}%`).join(', ')}. Score = Σ weight × (criterion score / 5) × 100.

| # | Product | Score | Website | Modules | Demo URL | Access | Registration | Verification | Limitations | Flags |
|---|---|---|---|---|---|---|---|---|---|---|
${rows.join('\n')}
${result.short_list_note ? `\n> ${result.short_list_note}\n` : ''}`;
}
