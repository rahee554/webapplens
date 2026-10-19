// Evidence store. Every finding carries an evidence type + confidence so facts, inferences and
// hypotheses never get mixed up in the final documentation.
import { nowIso, shortHash } from './util.mjs';
import { redactObject } from './redact.mjs';

export const EVIDENCE_TYPES = {
  observed: 'Directly observed in the application',
  verified_interaction: 'Verified through an authorized interaction',
  official_docs: 'Confirmed by official documentation',
  public_source: 'Confirmed by public source code',
  inferred: 'Inferred from UI behavior',
  hypothesis: 'Hypothesis requiring further verification',
};
export const CONFIDENCE = ['high', 'medium', 'low'];

export function makeObservation(o) {
  if (!o || !o.claim) throw new Error('observation needs a claim');
  if (!EVIDENCE_TYPES[o.type]) throw new Error(`unknown evidence type "${o.type}". Use one of: ${Object.keys(EVIDENCE_TYPES).join(', ')}`);
  const confidence = o.confidence || (o.type === 'hypothesis' ? 'low' : o.type === 'inferred' ? 'medium' : 'high');
  if (!CONFIDENCE.includes(confidence)) throw new Error(`confidence must be one of ${CONFIDENCE.join(', ')}`);
  // Hypotheses/inferences can never claim "high" confidence.
  const capped = (o.type === 'hypothesis' && confidence !== 'low') || (o.type === 'inferred' && confidence === 'high') ? 'medium' : confidence;
  const base = {
    id: o.id || `O-${shortHash(o.type + o.claim + (o.route_id || '') + (o.source_url || ''), 8)}`,
    type: o.type,
    claim: o.claim,
    confidence: o.type === 'hypothesis' ? 'low' : capped,
    route_id: o.route_id || null,
    source_url: o.source_url || null,
    screenshot: o.screenshot || null,
    text: o.text ? String(o.text).slice(0, 300) : null,
    verification_status: o.verification_status || (['observed', 'verified_interaction', 'official_docs', 'public_source'].includes(o.type) ? 'verified' : 'unverified'),
    notes: o.notes || null,
    observed_at: o.observed_at || nowIso(),
  };
  return redactObject(base);
}

/** Append (idempotent by id) so retries do not duplicate evidence. */
export function addObservation(project, o) {
  const obs = makeObservation(o);
  if (project.observations().some((x) => x.id === obs.id)) return obs;
  project.appendObservation(obs);
  return obs;
}
