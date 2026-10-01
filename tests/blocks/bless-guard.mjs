// ── bless refuses a red tree (#52) ────────────────────────────────────────────
// --bless pins scores; it must never read green over a failing invariant. Probed on a
// scratch golden: a unit/negative failure or a scorer error refuses (exit 1, nothing
// written); only a tree that holds is blessed.
import { readFileSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { negFailures, verdict } from '../harness.mjs';

export const label = 'bless-guard';

export async function run() {
  const fail = (m) => negFailures.push('bless-guard: ' + m);
  const tmp = mkdtempSync(join(tmpdir(), 'assay-bless-'));
  const g = join(tmp, 'golden.json');
  const SENTINEL = '{"sentinel":true}\n';
  for (const [what, nf, sc] of [['a unit/negative failure', ['planted failure'], { a: { recall: 1 } }], ['a scorer error', [], { a: { error: 'planted scorer error' } }]]) {
    writeFileSync(g, SENTINEL);
    const r = verdict({ bless: true, negFailures: nf, current: { _score: sc }, goldenPath: g });
    if (r.exit !== 1) fail(`--bless over ${what} must exit 1 (got ${r.exit})`);
    if (readFileSync(g, 'utf8') !== SENTINEL) fail(`--bless over ${what} must write nothing (golden.json was rewritten)`);
    if (!r.err.some((l) => /planted/.test(l))) fail(`--bless over ${what} must print what is red`);
  }
  writeFileSync(g, SENTINEL);
  const ok = verdict({ bless: true, negFailures: [], current: { _score: { a: { recall: 1 } } }, goldenPath: g });
  if (ok.exit !== 0 || JSON.stringify(JSON.parse(readFileSync(g, 'utf8'))) !== JSON.stringify({ _score: { a: { recall: 1 } } })) fail('--bless over a tree that holds must write the scores and exit 0');
  rmSync(tmp, { recursive: true, force: true });
}
