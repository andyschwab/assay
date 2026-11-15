// ── variance --set measures agreement on which effects are opaque, beside the legibility row's status
// (#338, second slice; map/variance.mjs gapAgreement; yardstick/README.md, "An effect's facts,
// legible") ──
// Requirement agreement compares d-effect-facts-legible's status across blind runs. The fact the row
// reads is per candidate: which effects' facts no reader can determine. Two runs whose rows agree may
// name different effects opaque, and two whose rows part may agree on most gaps. So variance reports,
// over the candidates every sweep maps and answers, how many every sweep reads alike, a gap or
// legible, per qualifying question and on every one. Held over cut-down answered sets built here from
// the public flawed-webapp set (tests/sweeps/flawed-webapp-2026-11-15), two sweeps each:
//   (a) statuses agree, the gap list parts: sweeps 1 and 3 with sweep 3's person_act on POST /sync
//       answered no with evidence: both rows read unmet (a second gap holds the candidate), and the
//       gap agreement on person_act reads 6 of 7, naming the candidate and each sweep's reading;
//   (b) statuses part where the gap list parts: sweeps 1 and 2 read unmet and met, and gap agreement
//       per question gives person_act 3 of 7 and received_or_gone 4 of 7;
//   (c) a yes against a no is legible both ways: two answers that part and are both stated never part
//       the gap list (gapAgreement in process over the committed assay set's divergences);
//   (d) a question the bar does not list is never counted;
//   (e) the text report prints the figure under the legibility heading, beside the row's statuses.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, cpSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { computeCandidateAgreement, gapAgreement } from '../../map/variance.mjs';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'variance-gap-agreement';

const SRC = join(HERE, 'sweeps', 'flawed-webapp-2026-11-15');
const ASSAY_SET = join(HERE, 'sweeps', 'assay-2026-11-15');
const SYNC = 'route: POST /sync';

function writeSet(dir, sweeps) {
  mkdirSync(dir, { recursive: true });
  sweeps.forEach((s, i) => cpSync(join(SRC, s), join(dir, `sweep-${i + 1}`), { recursive: true }));
  writeFileSync(join(dir, 'SWEEP.yaml'), `target: "cut down from the public flawed-webapp set"\ntarget_commit: "fixture"\nmethod_commit: "fixture"\ndate: "2026-11-15"\nblind: true\nthreshold:\n  fact_presence: 1\n  candidate_agreement: 1\n  descriptor_agreement: 1\n  requirement_agreement: 1\nsweeps: [${sweeps.map((_, i) => `sweep-${i + 1}`).join(', ')}]\n`);
}

export async function run() {
  const fail = (m) => negFailures.push('variance-gap-agreement: ' + m);
  const tmp = mkdtempSync(join(tmpdir(), 'assay-gap-agreement-'));
  const variance = (...a) => spawnSync(process.execPath, [join(ROOT, 'assay.mjs'), 'variance', ...a], { encoding: 'utf8' });
  const json = (dir) => {
    const v = variance('--set', dir, '--json');
    try { return JSON.parse(v.stdout); } catch { fail(`variance --set ${dir} --json prints JSON (exit ${v.status}): ${(v.stdout + v.stderr).slice(0, 400)}`); return null; }
  };
  try {
    // (a) sweeps 1 and 3, sweep 3's person_act on POST /sync answered with evidence
    const a = join(tmp, 'agree-status');
    writeSet(a, ['sweep-1', 'sweep-3']);
    const triage = join(a, 'sweep-2', 'map', 'effect-triage.yaml');
    const before = readFileSync(triage, 'utf8');
    const from = '      person_act: { answer: not-determinable, evidence: ["server.mjs:47"] }';
    if (before.split(from).length !== 2) { fail(`(a) sweep-3's triage answers ${SYNC}'s person_act not-determinable at server.mjs:47 once (the committed set moved)`); return; }
    writeFileSync(triage, before.replace(from, '      person_act: { answer: no, evidence: ["server.mjs:47"] }'));
    const ja = json(a);
    if (ja) {
      const g = ja.candidates && ja.candidates.legibility;
      if (!g || !g.byQuestion) { fail(`(a) variance --set --json reports candidates.legibility (got ${JSON.stringify(ja.candidates && Object.keys(ja.candidates))})`); }
      else {
        if (JSON.stringify(g.row.statuses) !== JSON.stringify(['unmet', 'unmet'])) fail(`(a) the row's status agrees across the two sweeps, unmet / unmet (got ${JSON.stringify(g.row.statuses)})`);
        const div = ja.requirements.divergences.find((x) => x.id === 'd-effect-facts-legible');
        if (div) fail(`(a) requirement agreement counts the row as agreeing (got ${JSON.stringify(div)})`);
        const pa = g.byQuestion.person_act;
        if (!pa || pa.agree !== 6 || pa.of !== 7 || pa.pct !== 86) fail(`(a) gap agreement on person_act reads 6 of 7 (86%) where the statuses agree (got ${JSON.stringify(pa)})`);
        const want = { candidate: SYNC, question: 'person_act', reads: ['gap', 'legible'] };
        if (!g.divergences.some((x) => JSON.stringify(x) === JSON.stringify(want))) fail(`(a) the gap list names the candidate and question where the sweeps part, with each sweep's reading (want ${JSON.stringify(want)}, got ${JSON.stringify(g.divergences)})`);
        if (g.all.of !== 7 || g.all.agree !== 6) fail(`(a) 6 of the 7 candidates are read alike on every qualifying question (got ${JSON.stringify(g.all)})`);
      }
    }

    // (b) sweeps 1 and 2: the statuses part, and so does the gap list
    const b = join(tmp, 'part-status');
    writeSet(b, ['sweep-1', 'sweep-2']);
    const jb = json(b);
    const gb = jb && jb.candidates && jb.candidates.legibility;
    if (jb && !gb) fail('(b) variance --set --json reports candidates.legibility');
    if (gb) {
      const g = gb;
      if (JSON.stringify(g.row.statuses) !== JSON.stringify(['unmet', 'met'])) fail(`(b) the row parts, unmet / met (got ${JSON.stringify(g.row.statuses)})`);
      const pa = g.byQuestion.person_act, rog = g.byQuestion.received_or_gone;
      if (!pa || pa.agree !== 3 || pa.of !== 7) fail(`(b) gap agreement on person_act reads 3 of 7 (got ${JSON.stringify(pa)})`);
      if (!rog || rog.agree !== 4 || rog.of !== 7) fail(`(b) gap agreement on received_or_gone reads 4 of 7 (got ${JSON.stringify(rog)})`);
      if (g.all.agree !== 0) fail(`(b) no candidate is read alike on every qualifying question (got ${JSON.stringify(g.all)})`);
    }

    // (c) yes against no parts the answers, never the gap list
    const c = computeCandidateAgreement(['sweep-1', 'sweep-2', 'sweep-3'].map((s) => join(ASSAY_SET, s)));
    const ga = gapAgreement(c, ['refuses_unless']);
    const parted = c.answers.byAnswer.refuses_unless;
    if (!(parted.agree < parted.of)) fail(`(c) the committed assay set's lanes part on refuses_unless (got ${JSON.stringify(parted)})`);
    if (ga.byQuestion.refuses_unless.agree !== ga.byQuestion.refuses_unless.of) fail(`(c) answers that part yes against no are legible in every sweep, so the gap list agrees (got ${JSON.stringify(ga.byQuestion.refuses_unless)})`);

    // (d) a question below the bar is never counted
    const only = gapAgreement(c, ['person_act']);
    if (JSON.stringify(Object.keys(only.byQuestion)) !== JSON.stringify(['person_act'])) fail(`(d) gap agreement counts only the qualifying questions (got ${JSON.stringify(Object.keys(only.byQuestion))})`);
    const none = gapAgreement(c, []);
    if (none.compared !== 0 || none.all.of !== 0) fail(`(d) with no qualifying question nothing is counted (got ${JSON.stringify(none.all)})`);

    // (e) the text report
    const t = variance('--set', a);
    if (!t.stdout.includes('d-effect-facts-legible per sweep: unmet / unmet') || !t.stdout.includes('which effects are opaque') || !t.stdout.includes(`${SYNC.padEnd(40)} person_act: gap vs legible`)) fail(`(e) the text report prints the gap agreement under the legibility heading, beside the row's statuses (got ${t.stdout.slice(t.stdout.indexOf('where lanes part'), t.stdout.indexOf('where lanes part') + 600)})`);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
