// ── instrument-port invariants (fail-loud intake; never copy a secret; bands) ───
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { projectMulti, contributedBySources } from '../../map/project.mjs';
import { nextStart } from '../../map/ingest.mjs';
import { HERE, ROOT, negFailures, viewSev, convert, adaptersOnce } from '../harness.mjs';

export const label = 'instrument-port';

export async function run() {
  const fail = (m) => negFailures.push('instrument-port: ' + m);
  const glRaw = readFileSync(join(HERE, 'instruments', 'gitleaks-sample.json'), 'utf8');
  const scRaw = readFileSync(join(HERE, 'instruments', 'scorecard-sample.json'), 'utf8');
  const mustThrow = (label, fn) => { let threw = false; try { fn(); } catch { threw = true; } if (!threw) fail(`${label} must halt (fail-loud intake)`); };
  mustThrow('a tool-error exit code', () => convert('gitleaks', '[]', 2));
  mustThrow('a missing exit code', () => convert('gitleaks', '[]', 'unknown'));
  mustThrow('malformed JSON', () => convert('gitleaks', 'not json {', 1));
  mustThrow('an unknown instrument name', () => convert('nonesuch', '[]', 0));
  mustThrow('a truncated leak (no File)', () => convert('gitleaks', '[{"RuleID":"x","StartLine":1}]', 1));
  if (convert('gitleaks', '[]', 0).length !== 0) fail('a verified-clean run (success exit, empty report) must convert to zero rows');
  const gl = convert('gitleaks', glRaw, 1);
  if (gl.length !== 2) fail(`gitleaks sample must yield 2 rows (got ${gl.length})`);
  if (JSON.stringify(gl).includes('AKIAFAKE') || JSON.stringify(gl).includes('sk-FAKE')) fail('a matched secret value leaked into the converted rows — the converter must never copy Secret/Match');
  const sc = convert('scorecard', scRaw, 0);
  const by = Object.fromEntries(sc.map((r) => [r.native_category, r]));
  if (by['Branch-Protection']?.polarity !== 'gap' || viewSev(by['Branch-Protection']) !== 'High') fail('a score-2 check must read gap, banded High by the view');
  if (by['CI-Tests']?.polarity !== 'strength') fail('a score-10 check must read strength');
  if (by['Dangerous-Workflow']?.evidence[0] !== '.github/workflows/deploy.yml:12') fail('a detail path must become the evidence');
  if (!sc.skipped || !sc.skipped.includes('Fuzzing')) fail('an N/A (-1) check must be skipped AND logged, never silent');
  // id width: a real history scan returns more rows than three digits hold (807 on the first
  // 200k-line target). Ids are F- plus three OR MORE digits; the validator must accept F-1000
  // and still reject a two-digit id. The converter pads to three and grows past it.
  const wide = convert('gitleaks', JSON.stringify(Array.from({ length: 5 }, (_, i) => ({ RuleID: 'r', File: 'a.ts', StartLine: i + 1 }))), 1, 'F-998');
  if (wide.map((r) => r.id).join(',') !== 'F-998,F-999,F-1000,F-1001,F-1002') fail(`ids must grow past three digits (got ${wide.map((r) => r.id).join(',')})`);
  {
    const tmp = join(HERE, '.tmp-idwidth'); rmSync(tmp, { recursive: true, force: true }); mkdirSync(join(tmp, 'map', 'findings'), { recursive: true });
    copyFileSync(join(HERE, 'sidecar-fixture', 'map', 'scanners.yaml'), join(tmp, 'map', 'scanners.yaml'));
    copyFileSync(join(HERE, 'sidecar-fixture', 'map', 'findings', 'repo-eval-delegation.yaml'), join(tmp, 'map', 'findings', 'repo-eval-delegation.yaml'));
    const row = (id) => `- id: ${id}\n  source: gitleaks\n  native_id: "r@a.ts:1"\n  native_category: "secret"\n  polarity: gap\n  observation: >\n    x\n  evidence: [a.ts:1]\n  fix: >\n    y\n`;
    const manifest = readFileSync(join(tmp, 'map', 'scanners.yaml'), 'utf8').replace(/gitleaks:[\s\S]*?(?=\n  \w|$)/, 'gitleaks:\n    status: ran');
    writeFileSync(join(tmp, 'map', 'scanners.yaml'), manifest);
    const runValidate = () => { try { execFileSync(process.execPath, [join(ROOT, 'map', 'validate.mjs'), tmp], { stdio: 'pipe' }); return true; } catch { return false; } };
    writeFileSync(join(tmp, 'map', 'findings', 'gitleaks.yaml'), row('F-1000'));
    if (!runValidate()) fail('a four-digit finding id (F-1000) must validate green — the id space is not capped at 999');
    writeFileSync(join(tmp, 'map', 'findings', 'gitleaks.yaml'), row('F-12'));
    if (runValidate()) fail('a two-digit finding id (F-12) must still validate red');
    rmSync(tmp, { recursive: true, force: true });
  }
  // id allocation (found on a real history scan: a gitleaks block of over a thousand rows ran past the
  // deep-code-review and fresh-clone floors and the validator went red on duplicate ids)
  {
    const tmp = join(HERE, '.tmp-nextstart'); rmSync(tmp, { recursive: true, force: true }); mkdirSync(join(tmp, 'map', 'findings'), { recursive: true });
    if (nextStart(tmp, 'deep-code-review').start !== 800) fail('an empty run starts deep-code-review at its floor F-800');
    const row = (n) => `- id: F-${n}\n  source: gitleaks\n  native_id: "r@a.ts:${n}"\n  native_category: "secret"\n  polarity: gap\n  observation: >\n    x\n  evidence: [a.ts:1]\n  fix: >\n    y\n`;
    writeFileSync(join(tmp, 'map', 'findings', 'gitleaks.yaml'), Array.from({ length: 807 }, (_, i) => row(700 + i)).join(''));
    const ns = nextStart(tmp, 'deep-code-review');
    if (ns.start !== 1600 || ns.highest !== 1506) fail(`with gitleaks rows to F-1506, deep-code-review must start at F-1600 (got F-${ns.start}, highest ${ns.highest})`);
    if (nextStart(tmp, 'gitleaks').start !== 700) fail('a re-ingest of the same tool ignores its own file and lands at its floor again');
    writeFileSync(join(tmp, 'map', 'findings', 'deep-code-review.yaml'), row(1600));
    if (nextStart(tmp, 'fresh-clone').start !== 1700) fail('fresh-clone must start above both existing blocks (F-1700)');
    rmSync(tmp, { recursive: true, force: true });
  }
  // the raw archive of a gitleaks report must be location-only: the CLI once copied the raw
  // report into map/raw/ verbatim, matched values and author identity included
  {
    const tmp = join(HERE, '.tmp-glarchive'); rmSync(tmp, { recursive: true, force: true }); mkdirSync(join(tmp, 'map', 'findings'), { recursive: true });
    execFileSync(process.execPath, [join(ROOT, 'map', 'ingest.mjs'), tmp, '--tool', 'gitleaks', '--raw', join(HERE, 'instruments', 'gitleaks-sample.json'), '--exit', '1'], { stdio: 'pipe' });
    const archived = readFileSync(join(tmp, 'map', 'raw', 'gitleaks.json'), 'utf8');
    if (archived.includes('AKIAFAKE') || archived.includes('sk-FAKE') || /"(Secret|Match|Line|Author|Email)"/.test(archived)) fail('the archived gitleaks report must carry locations only — never Secret, Match, Line, Author or Email');
    if (!/"RuleID"/.test(archived) || !/"File"/.test(archived) || !/"StartLine"/.test(archived)) fail('the archived gitleaks report must keep rule, file and line');
    rmSync(tmp, { recursive: true, force: true });
  }
  const proj = projectMulti([...gl, ...sc], adaptersOnce());
  if (proj.unmapped.length) fail(`instrument rows must all map (unmapped: ${proj.unmapped.map((u) => u.cat).join(', ')})`);
  if (proj.projected.find((p) => p.f.id === gl[0].id)?.axis !== 'code-security') fail('a gitleaks secret must land on code-security');
  if (proj.projected.find((p) => p.f.native_category === 'Branch-Protection')?.axis !== 'deterministic-gates') fail('Branch-Protection must land on the shared deterministic-gates axis');
  if (contributedBySources(adaptersOnce(), ['gitleaks', 'scorecard']).size !== 0) fail('instruments must contribute no axes');
  const rogue = projectMulti(convert('scorecard', JSON.stringify({ checks: [{ name: 'Brand-New-Check', score: 5, reason: 'x' }] }), 0), adaptersOnce());
  if (!rogue.unmapped.length) fail('an unknown Scorecard check must halt at projection (default: FAIL), never route silently');
}
