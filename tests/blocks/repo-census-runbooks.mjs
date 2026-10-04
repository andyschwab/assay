// ── repo-census finds a runbook under a plural or directory name (issue #28) ──
// tests/instruments/repo-census-runbooks-target carries a root RUNBOOKS.md covering
// all four procedures: the runbook check must read it and pass. With its Restart
// section removed it must gap naming the file and restart, never "No runbook found".
// A runbooks/ or docs/runbooks/ directory is read whole (every .md in it).
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'repo-census-runbooks';

export async function run() {
  const fail = (m) => negFailures.push('repo-census-runbooks: ' + m);
  const fx = join(HERE, 'instruments', 'repo-census-runbooks-target');
  const tmp = join(HERE, 'tmp-repo-census-runbooks'); rmSync(tmp, { recursive: true, force: true });
  const runbookOf = (dir) => {
    const out = join(dir, '..', `${dir.split(/[/\\]/).pop()}.json`);
    try { execFileSync(process.execPath, [join(ROOT, 'map', 'repo-census.mjs'), dir, '--out', out, '--as-of', '2026-09-28'], { stdio: 'pipe' }); }
    catch { /* gaps elsewhere exit 1; the JSON is what is read */ }
    try { return JSON.parse(readFileSync(out, 'utf8')).checks.find((c) => c.name === 'runbook'); } catch { return null; }
  };
  const withoutRestart = (text) => text.replace(/^## Restart\n[\s\S]*?(?=^## )/m, '');
  const full = readFileSync(join(fx, 'RUNBOOKS.md'), 'utf8');
  try {
    // root RUNBOOKS.md, all four procedures -> pass, citing the file
    const a = join(tmp, 'root-all'); mkdirSync(a, { recursive: true }); cpSync(fx, a, { recursive: true });
    const rbA = runbookOf(a);
    if (rbA?.status !== 'pass' || rbA.evidence[0] !== 'RUNBOOKS.md:1' || !/^RUNBOOKS\.md carries/.test(rbA.observation)) fail(`a root RUNBOOKS.md covering all four procedures must pass, citing it (got ${JSON.stringify(rbA)})`);

    // root RUNBOOKS.md without restart -> gap naming the file and restart, not "No runbook found"
    const b = join(tmp, 'root-no-restart'); mkdirSync(b, { recursive: true }); cpSync(fx, b, { recursive: true });
    if (withoutRestart(full) === full || /\brestart/i.test(withoutRestart(full))) throw new Error('the fixture\'s Restart section could not be removed');
    writeFileSync(join(b, 'RUNBOOKS.md'), withoutRestart(full));
    const rbB = runbookOf(b);
    if (rbB?.status !== 'gap' || rbB.evidence[0] !== 'RUNBOOKS.md:1' || !/^RUNBOOKS\.md is missing .*\brestart\b/.test(rbB.observation) || JSON.stringify(rbB.missing) !== '["restart"]') fail(`a root RUNBOOKS.md without restart must gap naming the file and restart only (got ${JSON.stringify(rbB)})`);

    // a runbooks/ directory: every .md read, the procedures split across files -> pass, citing each
    const c = join(tmp, 'dir-root'); mkdirSync(join(c, 'runbooks'), { recursive: true });
    writeFileSync(join(c, 'runbooks', 'deploy.md'), withoutRestart(full));
    writeFileSync(join(c, 'runbooks', 'restart.md'), '# Restart\n\nTo restart the service, redeploy the current image.\n');
    const rbC = runbookOf(c);
    if (rbC?.status !== 'pass' || JSON.stringify(rbC.evidence) !== '["runbooks/deploy.md:1","runbooks/restart.md:1"]') fail(`a runbooks/ directory must be read whole and cite every file (got ${JSON.stringify(rbC)})`);

    // docs/runbooks/ directory, restart missing -> gap naming the directory
    const d = join(tmp, 'dir-docs'); mkdirSync(join(d, 'docs', 'runbooks'), { recursive: true });
    writeFileSync(join(d, 'docs', 'runbooks', 'ops.md'), withoutRestart(full));
    const rbD = runbookOf(d);
    if (rbD?.status !== 'gap' || rbD.evidence[0] !== 'docs/runbooks/ops.md:1' || !/^docs\/runbooks\/ is missing .*\brestart\b/.test(rbD.observation)) fail(`a docs/runbooks/ directory without restart must gap naming it (got ${JSON.stringify(rbD)})`);

    // docs/RUNBOOKS.md is found too
    const e = join(tmp, 'docs-plural'); mkdirSync(join(e, 'docs'), { recursive: true });
    writeFileSync(join(e, 'docs', 'RUNBOOKS.md'), full);
    const rbE = runbookOf(e);
    if (rbE?.status !== 'pass' || rbE.evidence[0] !== 'docs/RUNBOOKS.md:1') fail(`docs/RUNBOOKS.md must be found (got ${JSON.stringify(rbE)})`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
