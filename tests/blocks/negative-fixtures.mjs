// ── negative fixtures: each MUST validate RED ─────────────────────────────────
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'negative-fixtures';
export const gate = ['validate'];

// NEGATIVE fixtures: deliberately-malformed eval dirs that validate MUST reject. Pinning
// only green-over-valid-bases is false-green — a validator weakened to accept everything
// moves no positive invariant. Each targets ONE check and names the violation it must
// produce: the run must go red, the named violation must fire, and every violation must
// be that one — a fixture red for an unrelated reason proves nothing about its check
// (descriptors-drift once failed sixteen ways, fifteen of them stale mechanism drift, so
// removing the check it was built for would have left it red). [dir, what, expect, opts]
export const NEGATIVE = [
  ['bad-dimension', 'filename-dimension disagreement', /: dimension "[^"]+" in \S+ \(expected /],
  ['bad-aggregate', 'hand-inflated maturity aggregate', /:aggregate: aggregate \d+\/\d+ does not pool the measured rows/],
  ['bad-standing-watch', 'non-boolean standing_watch on an exposure', /standing_watch must be boolean/],
  // the run manifest (SCHEMA §5a): an integration that did not run must be RECORDED as
  // such, with a reason — never inferred absent. Found by a run that shipped a full
  // package with a queued code scanner never invoked and nothing recording the omission.
  ['no-manifest', 'no map/scanners.yaml — an adopted scanner with no recorded disposition', /^map\/scanners\.yaml: missing/],
  ['manifest-skip-no-reason', 'a scanner skipped with no reason (indistinguishable from an omission)', /skipped needs a reason/],
  ['manifest-ran-no-rows', 'a scanner recorded as ran with no rows and no explicit empty file', /status ran, but the base carries no rows/],
  ['manifest-rows-not-ran', 'rows present from a scanner the manifest records as skipped', /status skipped, but the base carries rows/],
  ['coverage-incomplete', 'a scanner coverage sidecar missing rows for domains the adapter lists', /coverage incomplete: no row for domain/],
  // the yardstick measurement (yardstick/README.md): a status the base does not recompute is drift, and a
  // claim-only row reading met is the exact laundering the two-file rule exists to prevent
  ['descriptors-drift', 'a yardstick.yaml whose statuses the base does not recompute (a claim row reads met)', /d-accounts-enumerated: requirement drift: file says met/],
  // no claim without evidence: `:1` names a line of no file (repo-census cited it at the root)
  ['evidence-no-path', 'an instrument finding whose evidence is ":1" — a line number with no path', /evidence ":1" cites no path/],
  // citation resolution: a cited file the target does not have (only checkable with --target)
  ['evidence-not-in-target', 'a finding citing a file the target does not have', /evidence path not found in target: lib\/sync\.mjs/, { target: 'target' }],
  // solution coverage (fail-closed): an unsupervised kind with no roadmap fix and no disposition
  ['solution-coverage-gap', 'an unsupervised kind with no fix and no disposition', /unsupervised kind "assistant-email" has no fix/],
  // maturity numbers re-derived from their sources: a counted row from the base, a sampled row
  // from map/censuses.yaml — a hand-inflated number with a re-pooled aggregate must not validate
  ['counted-drift', 'a counted maturity row the base does not compute', /deterministic-gates: counted drift: file says 2\/2, base computes 0\/2/],
  ['sampled-drift', 'a sampled maturity row its authored census does not record (a sample inflating the headline)', /artifact-legibility: sampled drift: file says 10\/10, map\/censuses\.yaml records 7\/10/],
  // one fixture per validator rule, so removing any rule turns the harness red (#52): the
  // closed vocabulary, the conditional-required facets (SCHEMA §4), the fail-closed
  // discovery rule, link resolution, the unprompted-gap axis rule, and evidence itself
  ['bad-polarity', 'a native finding whose polarity is outside the closed vocabulary', /: bad polarity "concern"/],
  ['effect-no-facet', 'subject_type effect with no effect facet', /: subject_type:effect requires an effect facet/],
  ['effect-no-fail-mode', 'a gated effect that states no fail_mode', /: effect\.fail_mode required when gate_type != none/],
  ['halt-no-preconditions', 'an unheld halt that leaves its preconditions to default', /: unheld-halt effect must state preconditions/],
  ['capability-not-boolean', 'a capabilities block holding a non-boolean', /: capabilities\.untrusted_input must be boolean/],
  ['link-unknown', 'a reaches link to a finding the run does not carry', /: reaches → unknown finding F-999/],
  ['unprompted-gap-no-axis', 'an unprompted gap with no axis', /^projection:F-001: unprompted GAP has no axis/],
  ['evidence-missing', 'a native finding with no evidence key', /: missing required key: evidence$/],
  ['external-evidence-missing', 'a scanner row with no evidence key', /: missing required key \(external finding\): evidence$/],
  ['evidence-not-path-line', 'evidence that is not a path:line string (a bare file, a map)', /: evidence (?:"lib\/agent\.mjs"|\{"path":"lib\/agent\.mjs","lines":"1"\}) is not a path:line citation/],
  ['evidence-line-past-end', 'a citation to a line the cited file does not have', /evidence line (?:9|2-7) is past the end of lib\/agent\.mjs \(3 lines\)/, { target: 'target' }],
  ['yardstick-id-set', 'a yardstick.yaml with one row duplicated and one missing (the count still matches)', /^yardstick\.yaml: carries no row for d-credentials-enumerated/],
  // the owner's triage overlay (owner/decisions.yaml) is validated, not trusted (#53, F-1231, F-617)
  ['decisions-not-a-list', 'an owner/decisions.yaml whose top level is a map', /^owner\/decisions\.yaml: expected a top-level list of decisions/],
  ['decisions-bad-action', 'a decision whose action is outside the closed set', /^owner\/decisions\.yaml\[0\]: bad action "waive"/],
  ['decisions-accept-no-reason', 'an accept with no reason', /^owner\/decisions\.yaml\[0\]: accept needs a reason/],
  ['decisions-by-email', 'a decision whose by is an email address', /^owner\/decisions\.yaml\[0\]: by must be a role or a handle/],
  ['decisions-bad-snooze', 'a snooze_until that is not a YYYY-MM-DD date', /^owner\/decisions\.yaml\[0\]: snooze_until must be a YYYY-MM-DD date/],
];

export async function run() {
  for (const [dir, what, expect, opts = {}] of NEGATIVE) {
    const fx = join(HERE, 'negative', dir);
    const args = [join(ROOT, 'map', 'validate.mjs'), fx, ...(opts.target ? ['--target', join(fx, opts.target)] : [])];
    let red = false, out = '';
    try { execFileSync(process.execPath, args, { stdio: 'pipe' }); }
    catch (e) { red = true; out = String(e.stdout || '') + String(e.stderr || ''); }
    if (!red) { negFailures.push(`negative/${dir} validated GREEN but must be RED (${what}) — the validator stopped catching this class`); continue; }
    const violations = out.split('\n').filter((l) => l.startsWith('  • ')).map((l) => l.slice(4));
    if (!violations.some((v) => expect.test(v))) negFailures.push(`negative/${dir} is red, but not for its reason (${what}): expected ${expect}, got ${violations.length ? violations.join(' | ') : 'no listed violation'}`);
    const stray = violations.filter((v) => !expect.test(v));
    if (stray.length) negFailures.push(`negative/${dir} is red for other reasons too, so it cannot prove its own check (${what}): ${stray.join(' | ')}`);
  }
}
