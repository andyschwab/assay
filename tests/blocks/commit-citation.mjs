// ── a commit is citable: commit:<sha>, checked against the target's history (#304) ──
// A reviewer's Nit about a commit subject cited `git:<sha>`; validate refused it as "not a
// path:line citation", and the whole report failed closed. The schema now has one commit form,
// commit:<sha> (SCHEMA.md §1), and a reviewer that writes its own names it on its adapter
// (ingest.commit_citation), which ingest files as commit:<sha>. Pinned:
//   (a) a reviewer report citing a commit of the target in its own form is ingested as
//       commit:<sha> and validates against the target;
//   (b) a well-formed sha that is not in the target's history fails validate --target;
//   (c) a malformed sha fails validate, naming the form, with or without --target.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { loadAdapters, adoptedAdapters } from '../../map/project.mjs';
import { parseYaml } from '../../lib/yaml-min.mjs';
import { ROOT, negFailures } from '../harness.mjs';

export const label = 'commit-citation';

export async function run() {
  const fail = (m) => negFailures.push('commit-citation: ' + m);
  const adapters = loadAdapters();
  const reviewer = Object.entries(adapters).find(([, a]) => a.ingest && a.ingest.format === 'machine-report' && a.ingest.commit_citation);
  if (!reviewer) { fail('a reviewer adapter names the form it cites a commit in (ingest.commit_citation)'); return; }
  const [tool, adapter] = reviewer;
  const own = String(adapter.ingest.commit_citation);
  const sample = readFileSync(join(ROOT, 'tests', 'instruments', 'deep-code-review-sample.yaml'), 'utf8');
  const scratch = mkdtempSync(join(tmpdir(), 'assay-commit-cite-'));
  const git = (cwd, ...a) => spawnSync('git', ['-C', cwd, ...a], { encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 'a', GIT_AUTHOR_EMAIL: 'a@example.invalid', GIT_COMMITTER_NAME: 'a', GIT_COMMITTER_EMAIL: 'a@example.invalid' } });
  try {
    // the target: every path the sample cites, long enough for its lines, in one commit
    const target = join(scratch, 'target'); mkdirSync(target);
    for (const p of new Set([...sample.matchAll(/^\s+- ([\w./-]+):\d+$/gm)].map((m) => m[1]))) {
      mkdirSync(join(target, dirname(p)), { recursive: true });
      writeFileSync(join(target, p), 'x\n'.repeat(600));
    }
    git(target, 'init', '-q'); git(target, 'add', '-A'); git(target, 'commit', '-q', '-m', 'planted');
    const sha = git(target, 'rev-parse', 'HEAD').stdout.trim();
    if (!/^[0-9a-f]{40}$/.test(sha)) { fail(`the planted target has a commit (got ${JSON.stringify(sha)})`); return; }

    // a run with the reviewer ran, its report citing `cite` in place of the strength row's line
    const ingested = (name, cite) => {
      const dir = join(scratch, name);
      mkdirSync(join(dir, 'map', 'findings'), { recursive: true });
      const rows = Object.keys(adoptedAdapters(adapters)).map((id) => [`  ${id}:`, ...(id === tool ? ['    status: skipped', '    reason: "ingest records it ran"'] : ['    status: skipped', '    reason: "not in this block"'])].join('\n'));
      writeFileSync(join(dir, 'map', 'scanners.yaml'), `engine: block\ningest_ids_from: 10000\nscanners:\n${rows.join('\n')}\n`);
      const raw = join(scratch, `${name}.yaml`);
      writeFileSync(raw, sample.replace('      - api/mw/tenant.ts:31\n', `      - "${cite}"\n`));
      const r = spawnSync(process.execPath, [join(ROOT, 'assay.mjs'), 'ingest', dir, '--tool', tool, '--raw', raw, '--model', 'a-model'], { encoding: 'utf8' });
      if (r.status !== 0) fail(`${name}: the report ingests (got ${r.status}: ${r.stderr.trim().split('\n').slice(-2).join(' | ')})`);
      return dir;
    };
    const validate = (dir, extra = []) => spawnSync(process.execPath, [join(ROOT, 'assay.mjs'), 'validate', dir, ...extra], { encoding: 'utf8' });
    const bullets = (r) => (r.stderr + r.stdout).split('\n').filter((l) => /•/.test(l)).slice(0, 3).join(' | ');

    // (a)
    const a = ingested('a', `${own}${sha.slice(0, 7)}`);
    const rows = parseYaml(readFileSync(join(a, 'map', 'findings', `${tool}.yaml`), 'utf8')) || [];
    const cited = rows.find((r) => (r.evidence || []).includes(`commit:${sha.slice(0, 7)}`));
    if (!cited) fail(`(a) a commit cited as ${own}<sha> is filed as commit:<sha> (got ${JSON.stringify(rows.map((r) => r.evidence))})`);
    const va = validate(a, ['--target', target]);
    if (va.status !== 0) fail(`(a) a finding citing a commit of the target's history validates against it (got ${va.status}: ${bullets(va)})`);

    // (b)
    const gone = 'deadbeef'.repeat(5);
    const vb = validate(ingested('b', `${own}${gone}`), ['--target', target]);
    if (vb.status !== 1 || !vb.stderr.includes(`evidence commit:${gone} is not a commit in the target's history`)) fail(`(b) a sha not in the target's history fails validate --target (got ${vb.status}: ${bullets(vb)})`);

    // (c)
    const c = ingested('c', `${own}not-a-sha`);
    for (const extra of [[], ['--target', target]]) {
      const vc = validate(c, extra);
      if (vc.status !== 1 || !vc.stderr.includes('evidence "commit:not-a-sha" is not a commit citation (commit:<sha>, 7 to 40 lowercase hex digits)')) fail(`(c) a malformed sha fails validate${extra.length ? ' --target' : ''}, naming the form (got ${vc.status}: ${bullets(vc)})`);
    }
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}
