// ── a run that carries the retired scanner id is brought forward, never misread (#188) ──
// The built-in judgment scanner was renamed practice-review. A run drawn before the
// rename names it repo-eval in its file names and text. Pinned by turning a fixture run
// back into that shape:
//   (a) validate halts naming migrate-run, never as a missing scanner;
//   (b) Since over it as a baseline halts the same way;
//   (c) migrate-run without --write says what it would rename and changes nothing;
//   (d) with --write, the run is byte for byte the fixture it was made from;
//   (e) a rename that would land on an existing path is refused, and nothing is written.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync, cpSync, readdirSync, statSync, renameSync } from 'node:fs';
import { join, relative, dirname, basename } from 'node:path';
import { HERE, ROOT, negFailures } from '../harness.mjs';

export const label = 'migrate-run-retired-id';

const OLD = 'repo-eval', NEW = 'practice-review';

const walk = (dir) => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
const snapshot = (dir) => Object.fromEntries(walk(dir).map((f) => [relative(dir, f), readFileSync(f, 'utf8')]));

export async function run() {
  const fail = (m) => negFailures.push('migrate-run-retired-id: ' + m);
  const tmp = join(HERE, 'tmp-migrate-retired'); rmSync(tmp, { recursive: true, force: true });
  const fx = join(HERE, 'fixtures', 'notesbox');
  const old = join(tmp, 'old'), cur = join(tmp, 'cur');
  cpSync(fx, old, { recursive: true }); cpSync(fx, cur, { recursive: true });
  const cli = (script, args) => spawnSync(process.execPath, [join(ROOT, script), ...args], { encoding: 'utf8' });
  try {
    const want = snapshot(fx);
    if (!Object.keys(want).some((f) => basename(f).startsWith(NEW))) fail(`the fixture carries ${NEW} pass files to turn back`);
    // the run as an earlier engine wrote it: the old id in text and in file names
    for (const f of walk(old)) {
      const t = readFileSync(f, 'utf8'); if (t.includes(NEW)) writeFileSync(f, t.split(NEW).join(OLD));
      if (basename(f).includes(NEW)) renameSync(f, join(dirname(f), basename(f).split(NEW).join(OLD)));
    }
    const made = snapshot(old);
    // (a)
    const v = cli('map/validate.mjs', [old]);
    if (v.status === 0 || !/migrate-run/.test(v.stderr) || /unknown|no adapter/i.test(v.stderr)) fail(`(a) validate halts naming migrate-run (got ${v.status}: ${v.stderr.split('\n').slice(0, 3).join(' | ')})`);
    // (b)
    for (const d of [old, cur]) cli('yardstick/measure.mjs', [d, '--write']);
    const s = cli('views/since.mjs', [cur, '--previous', old]);
    if (s.status === 0 || !/migrate-run/.test(s.stderr)) fail(`(b) Since over the old run halts naming migrate-run (got ${s.status}: ${s.stderr.split('\n')[0]})`);
    rmSync(join(old, 'yardstick.yaml')); rmSync(join(cur, 'yardstick.yaml'), { force: true });
    // (c)
    const dry = cli('map/migrate-run.mjs', [old]);
    if (dry.status !== 0 || !/would rename the retired scanner id/.test(dry.stdout)) fail(`(c) a dry run says what it would rename (got ${dry.status}: ${dry.stdout}${dry.stderr})`);
    if (JSON.stringify(snapshot(old)) !== JSON.stringify(made)) fail('(c) a dry run changes nothing');
    // (e)
    const clash = join(old, 'map', 'findings', `${NEW}-context.yaml`);
    writeFileSync(clash, '[]\n');
    const r = cli('map/migrate-run.mjs', [old, '--write']);
    if (r.status === 0 || !/would land on/.test(r.stderr)) fail(`(e) a rename onto an existing path is refused (got ${r.status}: ${r.stderr})`);
    rmSync(clash);
    if (JSON.stringify(snapshot(old)) !== JSON.stringify(made)) fail('(e) a refused migration writes nothing');
    // (d)
    const w = cli('map/migrate-run.mjs', [old, '--write']);
    if (w.status !== 0) fail(`(d) --write exits 0 (got ${w.status}: ${w.stderr})`);
    const got = snapshot(old);
    const diff = [...new Set([...Object.keys(want), ...Object.keys(got)])].filter((k) => want[k] !== got[k]);
    if (diff.length) fail(`(d) the migrated run is byte for byte the fixture (differs: ${diff.slice(0, 5).join(', ')})`);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
