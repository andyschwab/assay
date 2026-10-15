// ── .github/workflows/branch-cleanup.yml: merged branches with nothing new since their merge go, whatever their names (#162, #170) ──
// The workflow deletes refs no session may delete, so it is pinned here by running its own steps: the plan and the
// delete scripts are cut from the file and run with bash against a fake GitHub CLI that answers from recorded branch
// states (each branch's tip and protection, its comparison with main, the head commits of its merged pull requests, its
// closed ones, the open ones that use it). The fake applies the step's own --jq with jq, as gh does; the runner and a
// Mac ship both, and a machine without them fails here, never skips. Pinned:
//   (a) a dispatch is a dry run unless a person turns it off, and nothing else triggers the workflow;
//   (b) the plan reads; only the delete job writes, and it runs only with dry_run off;
//   (c) planned, whatever the name: a branch a merged pull request came from, with nothing new since (its tip is a merged
//       head, after a squash too, or main holds it), that no open pull request uses as head or base; kept: a branch with
//       a commit after its merge, a just-cut one, one in flight, one still a base, one closed unmerged; the default
//       branch, a protected branch and a KEEP name are never read past the listing, and KEEP's globs never expand
//       against files;
//   (d) a plan that cannot read GitHub fails rather than plan nothing;
//   (e) the delete removes what the plan named, skips a branch that moved or became protected since the plan, and
//       refuses the default branch, a KEEP name or an entry with no planned tip before deleting anything.
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { ROOT, negFailures } from '../harness.mjs';

export const label = 'branch-cleanup';

const FILE = join(ROOT, '.github', 'workflows', 'branch-cleanup.yml');

// A job's block: from its two-space key to the next one.
function job(s, name) {
  const at = s.indexOf(`\n  ${name}:\n`);
  if (at < 0) return null;
  const next = s.slice(at + 1).search(/\n {2}[\w-]+:\n/);
  return next < 0 ? s.slice(at) : s.slice(at, at + 1 + next);
}
// The `run: |` body of the step whose name starts with `name`, dedented, so it runs here as it runs there.
function stepScript(s, name) {
  const at = s.indexOf(`- name: ${name}`);
  if (at < 0) return null;
  const step = s.slice(at).split(/\n(?= {6}- )/)[0];
  const lines = step.slice(step.indexOf('run: |\n') + 'run: |\n'.length).split('\n');
  const indent = lines[0].length - lines[0].trimStart().length;
  const end = lines.findIndex((l) => l.trim() && l.length - l.trimStart().length < indent);
  return (end < 0 ? lines : lines.slice(0, end)).map((l) => l.slice(indent)).join('\n');
}

// A recorded GitHub: each branch's tip, protection and comparison with main, the head commits of its merged pull requests,
// its closed unmerged ones, and the open ones that use it as head or base.
const MAIN = 'm0';
const BRANCHES = {
  main: { tip: MAIN, status: 'identical' },                                              // the default branch
  'gh-pages': { tip: 'g1', status: 'diverged', merged: ['g1'] },                          // under KEEP by name
  'release/1.0': { tip: 'r1', status: 'behind', merged: ['r1'] },                         // under KEEP by glob
  'stable': { tip: 's1', status: 'behind', merged: ['s1'], protected: true },             // protected
  'work/2026-10-12': { tip: 'w1', status: 'behind', merged: ['w1'] },                     // merged, tip is the merged head
  'fix/squash-merged': { tip: 'f1', status: 'diverged', merged: ['f1'] },                 // squash-merged: main lacks its commits
  'claude/brave-turing-ab12cd': { tip: MAIN, status: 'identical', merged: ['c1', 'c2'] }, // merged twice, reset to main
  'work/2026-10-14b-170-item': { tip: 'i1', status: 'ahead', merged: ['i1'] },            // merged into its integration branch
  'feature/kept-working': { tip: 'k2', status: 'diverged', merged: ['k1'] },              // a commit after its merge
  'work/2026-10-14c': { tip: MAIN, status: 'identical' },                                 // just cut from main, no pull request yet
  'work/2026-10-14b': { tip: 'b1', status: 'behind', merged: ['b1'], openBase: 2 },       // merged once, items still target it
  'claude/quiet-hopper-ef34gh': { tip: 'q1', status: 'identical', merged: ['q1'], openHead: 1 }, // merged, a new pull request open
  'docs/closed-unmerged': { tip: 'd1', status: 'behind', closed: 1 },                     // its pull request closed unmerged
};
const PLANNED = 'work/2026-10-12@w1 fix/squash-merged@f1 claude/brave-turing-ab12cd@m0 work/2026-10-14b-170-item@i1';
const KEPT = ['feature/kept-working', 'work/2026-10-14c', 'work/2026-10-14b', 'claude/quiet-hopper-ef34gh', 'docs/closed-unmerged', 'stable', 'gh-pages', 'release/1.0', 'main'];
const UNREAD = ['main', 'gh-pages', 'release/1.0', 'stable'];   // never named in a call past the listing

const FAKE_GH = `#!/usr/bin/env bash
echo "$*" >> "$GH_LOG"
[ -n "$GH_FAIL" ] && [[ "$*" == *"$GH_FAIL"* ]] && { echo "HTTP 502" >&2; exit 1; }
[[ " $* " == *" DELETE "* ]] && exit 0
jq=""; for ((i = 1; i < $#; i++)); do [ "\${!i}" = --jq ] && { j=$((i + 1)); jq=\${!j}; }; done
node -e '
const b = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); const a = process.argv.slice(2);
const url = a.find((x) => x.startsWith("repos/"));
const moved = process.env.GH_MOVED || "";
const pr = (n, merged, sha) => ({ number: n, merged_at: merged ? "2026-10-12T00:00:00Z" : null, head: { sha: sha ?? "x" } });
if (/\\/branches\\?/.test(url)) console.log(JSON.stringify(Object.entries(b).map(([name, r]) => ({ name, protected: r.protected === true, commit: { sha: r.tip } }))));
else if (/\\/branches\\//.test(url)) { const name = url.split("/branches/")[1]; const r = b[name]; console.log(JSON.stringify({ name, protected: r.protected === true, commit: { sha: name === moved ? "moved1" : r.tip } })); }
else if (/\\/compare\\//.test(url)) console.log(JSON.stringify({ status: b[url.split("...")[1]].status }));
else if (/\\/pulls\\?/.test(url)) {
  const q = new URLSearchParams(url.split("?")[1]);
  const r = b[q.has("head") ? q.get("head").replace(/^[^:]*:/, "") : q.get("base")] ?? {};
  const list = q.get("state") === "closed" ? (r.merged ?? []).map((sha, i) => pr(i + 1, true, sha)).concat([...Array(r.closed ?? 0)].map((_, i) => pr(50 + i, false)))
    : [...Array((q.has("head") ? r.openHead : r.openBase) ?? 0)].map((_, i) => pr(90 + i, false));
  console.log(JSON.stringify(list));
} else console.log(JSON.stringify({ default_branch: "main" }));
' "$GH_JSON" "$@" | jq -r "$jq"
`;

export async function run() {
  const fail = (m) => negFailures.push('branch-cleanup: ' + m);
  const s = readFileSync(FILE, 'utf8');

  // (a) by hand only, a dry run by default
  const on = s.match(/^on:\n((?: [^\n]*\n)+)/m);
  const triggers = on ? on[1].match(/^ {2}\w+:/gm) : null;
  if (JSON.stringify(triggers) !== JSON.stringify(['  workflow_dispatch:'])) fail(`the workflow runs on workflow_dispatch alone (got ${JSON.stringify(triggers)})`);
  if (!/\n {6}dry_run:\n(?: {8}[^\n]*\n)*? {8}type: boolean\n(?: {8}[^\n]*\n)*? {8}default: true\n/.test(s)) fail('dry_run is a boolean that defaults to true');

  // (b) the plan reads; the delete job alone writes, and only with dry_run off
  if (!/^permissions: \{ contents: read \}/m.test(s)) fail('the workflow\'s default permissions are contents: read');
  const plan = job(s, 'plan'), del = job(s, 'delete');
  if (!plan || /write/.test(plan)) fail('a plan job exists and holds no write permission');
  if (!del || !/\n {4}if: \$\{\{ !inputs\.dry_run [^\n]*\}\}\n/.test(del)) fail('the delete job runs only when dry_run is off');
  if (!del || !/\n {4}permissions: \{ contents: write \}\n/.test(del)) fail('the delete job holds contents: write');
  const writes = s.split('\n').map((l) => l.replace(/(^|\s)#.*$/, '')).join('\n').match(/: write\b/g) || [];
  if (writes.length !== 1) fail(`exactly one write permission in the file, the delete job's (got ${writes.length})`);
  if (/PREFIXES/.test(s)) fail('the workflow plans by fact, never by a branch-name prefix');
  const keepList = (s.match(/^ {2}KEEP: ([^#\n]+?)\s*(?:#[^\n]*)?$/m) || [])[1];
  if (!keepList) { fail('the workflow names its KEEP patterns once, in its env'); return; }

  for (const tool of ['bash', 'jq']) if (spawnSync(tool, ['--version']).status !== 0) { fail(`${tool} is not on PATH: the steps cannot run here`); return; }
  const planScript = stepScript(s, 'Plan'), deleteScript = stepScript(s, 'Delete');
  if (!planScript || !deleteScript) { fail('the plan and delete steps exist, named "Plan…" and "Delete…"'); return; }

  const dir = mkdtempSync(join(tmpdir(), 'branch-cleanup-'));
  try {
    mkdirSync(join(dir, 'bin'));
    writeFileSync(join(dir, 'gh.json'), JSON.stringify(BRANCHES));
    writeFileSync(join(dir, 'bin', 'gh'), FAKE_GH);
    chmodSync(join(dir, 'bin', 'gh'), 0o755);
    const step = (script, env = {}) => {
      const out = join(dir, 'output'), log = join(dir, 'gh.log');
      writeFileSync(out, ''); writeFileSync(log, '');
      const r = spawnSync('bash', ['-c', script], {
        encoding: 'utf8', cwd: dir,
        env: { ...process.env, PATH: [join(dir, 'bin'), process.env.PATH].join(delimiter), GH_JSON: join(dir, 'gh.json'), GH_LOG: log, GITHUB_OUTPUT: out, GITHUB_REPOSITORY: 'org/app', KEEP: keepList, ...env },
      });
      return { status: r.status, out: `${r.stdout}${r.stderr}`, output: readFileSync(out, 'utf8'), gh: readFileSync(log, 'utf8') };
    };

    // (c) the plan, run where a file would match KEEP's glob if it were expanded (release/other, not release/1.0)
    mkdirSync(join(dir, 'release')); writeFileSync(join(dir, 'release', 'other'), '');
    const p = step(planScript);
    if (p.status !== 0) fail(`the plan exits 0 over a readable GitHub (got ${p.status}: ${p.out.slice(0, 300)})`);
    if (p.output.trim() !== `merged=${PLANNED}`) fail(`the plan names exactly the merged branches with nothing new, each at its tip (got ${JSON.stringify(p.output.trim())})`);
    for (const k of KEPT) if (!new RegExp(`kept[^\\n]*\\n(?:  [^\\n]*\\n)*  ${k.replace(/[/.]/g, '\\$&')} \\(`).test(p.out)) fail(`the plan lists ${k} as kept, with why`);
    const reads = p.gh.split('\n').filter((l) => !/\/branches\?/.test(l) && !/^api repos\/org\/app --jq/.test(l)).join('\n');
    for (const u of UNREAD) if (new RegExp(`(?::|base=|\\.\\.\\.)${u.replace(/[/.]/g, '\\$&')}(?:&|\\s|$)`).test(reads)) fail(`${u} is never read past the listing`);
    if (/DELETE/.test(p.gh)) fail('the plan deletes nothing');

    // (d) a failed read fails the plan
    for (const read of ['/branches?', '/compare/', '/pulls?']) {
      const r = step(planScript, { GH_FAIL: read });
      if (r.status === 0 || r.output !== '') fail(`a plan that cannot read ${read} fails and plans nothing (got exit ${r.status}, output ${JSON.stringify(r.output)})`);
    }

    // (e) the delete
    const deletes = (gh) => gh.trim().split('\n').filter((l) => / DELETE /.test(` ${l} `));
    const ok = step(deleteScript, { MERGED: PLANNED });
    const want = PLANNED.split(' ').map((e) => `api -X DELETE repos/org/app/git/refs/heads/${e.split('@')[0]} --silent`);
    if (ok.status !== 0 || JSON.stringify(deletes(ok.gh)) !== JSON.stringify(want)) fail(`the delete removes each planned branch, in order (got exit ${ok.status}: ${ok.gh.trim()})`);
    const moved = step(deleteScript, { MERGED: PLANNED, GH_MOVED: 'fix/squash-merged' });
    if (moved.status !== 0 || deletes(moved.gh).some((l) => l.includes('fix/squash-merged')) || deletes(moved.gh).length !== want.length - 1) fail(`the delete skips a branch that moved since the plan and deletes the rest (got exit ${moved.status}: ${moved.gh.trim()})`);
    for (const bad of ['work/2026-10-12@w1 main@m0', 'work/2026-10-12@w1 release/1.0@r1', 'work/2026-10-12@w1 fix/squash-merged']) {
      const r = step(deleteScript, { MERGED: bad });
      if (r.status === 0 || deletes(r.gh).length) fail(`the delete refuses ${JSON.stringify(bad.split(' ')[1])} before deleting anything`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
