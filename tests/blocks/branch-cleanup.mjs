// ── .github/workflows/branch-cleanup.yml: merged agent branches go, and only those (#162) ──
// The workflow deletes refs no session may delete, so it is pinned here by running its own steps: the plan and the
// delete scripts are cut from the file and run with bash against a fake GitHub CLI that answers from recorded branch
// states (each branch's comparison with main, its merged and closed pull requests, the open ones that use it). The
// fake applies the step's own --jq with jq, as gh does; the runner and a Mac ship both, and a machine without them
// fails here, never skips. Pinned:
//   (a) a dispatch is a dry run unless a person turns it off, and nothing else triggers the workflow;
//   (b) the plan reads; only the delete job writes, and it runs only with dry_run off;
//   (c) planned: a branch under PREFIXES whose tip main holds, that a merged pull request came from, and that no open
//       pull request uses as head or base; a just-cut branch, one in flight, one merged elsewhere and one closed
//       unmerged are kept, and a branch under no prefix is never read;
//   (d) a plan that cannot read GitHub fails rather than plan nothing;
//   (e) the delete removes what the plan named, and refuses a name under no prefix before deleting anything.
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

// A recorded GitHub: each branch's comparison with main, its merged and closed pull requests, the open ones using it.
const BRANCHES = {
  main: { status: 'identical' },
  'work/2026-10-12': { status: 'behind', merged: 1 },                          // a slice's integration branch, merged
  'work/2026-10-12-106-iap-check': { status: 'behind', merged: 1 },            // an item's branch, merged
  'sweep/2026-10-10': { status: 'behind', merged: 1 },                         // a sweep set's branch, merged
  'claude/brave-turing-ab12cd': { status: 'identical', merged: 2 },           // a session's branch, merged twice, reset
  'work/2026-10-14c': { status: 'identical' },                                 // just cut from main, no pull request yet
  'work/2026-10-14b': { status: 'identical', merged: 1, openBase: 2 },         // merged once, items still target it
  'work/2026-10-14b-171-carry': { status: 'ahead', openHead: 1 },              // in flight
  'claude/quiet-hopper-ef34gh': { status: 'identical', merged: 1, openHead: 1 }, // merged, and a new pull request open
  'work/2026-10-13-160-reverted': { status: 'diverged', merged: 1 },           // merged elsewhere, tip not in main
  'work/2026-10-13-162-closed': { status: 'behind', closed: 1 },               // its pull request closed unmerged
  'feature/merged': { status: 'behind', merged: 1 },                           // merged, but under no prefix
};
const PLANNED = 'work/2026-10-12 work/2026-10-12-106-iap-check sweep/2026-10-10 claude/brave-turing-ab12cd';
const KEPT = ['work/2026-10-14c', 'work/2026-10-14b', 'work/2026-10-14b-171-carry', 'claude/quiet-hopper-ef34gh', 'work/2026-10-13-160-reverted', 'work/2026-10-13-162-closed'];

const FAKE_GH = `#!/usr/bin/env bash
echo "$*" >> "$GH_LOG"
[ -n "$GH_FAIL" ] && [[ "$*" == *"$GH_FAIL"* ]] && { echo "HTTP 502" >&2; exit 1; }
[[ " $* " == *" DELETE "* ]] && exit 0
jq=""; for ((i = 1; i < $#; i++)); do [ "\${!i}" = --jq ] && { j=$((i + 1)); jq=\${!j}; }; done
node -e '
const b = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); const a = process.argv.slice(2);
const url = a.find((x) => x.startsWith("repos/"));
const pr = (n, merged) => ({ number: n, merged_at: merged ? "2026-10-12T00:00:00Z" : null });
if (/\\/branches/.test(url)) console.log(JSON.stringify(Object.keys(b).map((name) => ({ name }))));
else if (/\\/compare\\//.test(url)) console.log(JSON.stringify({ status: b[url.split("...")[1]].status }));
else if (/\\/pulls\\?/.test(url)) {
  const q = new URLSearchParams(url.split("?")[1]);
  const r = b[q.has("head") ? q.get("head").replace(/^[^:]*:/, "") : q.get("base")] ?? {};
  const list = q.get("state") === "closed" ? [...Array(r.merged ?? 0)].map((_, i) => pr(i + 1, true)).concat([...Array(r.closed ?? 0)].map((_, i) => pr(50 + i, false)))
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
  const prefixes = (s.match(/^ {2}PREFIXES: ([^\n]+)$/m) || [])[1];
  if (!prefixes) { fail('the workflow names its PREFIXES once, in its env'); return; }

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
        env: { ...process.env, PATH: [join(dir, 'bin'), process.env.PATH].join(delimiter), GH_JSON: join(dir, 'gh.json'), GH_LOG: log, GITHUB_OUTPUT: out, GITHUB_REPOSITORY: 'org/app', PREFIXES: prefixes, ...env },
      });
      return { status: r.status, out: `${r.stdout}${r.stderr}`, output: readFileSync(out, 'utf8'), gh: readFileSync(log, 'utf8') };
    };

    // (c) the plan
    const p = step(planScript);
    if (p.status !== 0) fail(`the plan exits 0 over a readable GitHub (got ${p.status}: ${p.out.slice(0, 300)})`);
    if (p.output.trim() !== `merged=${PLANNED}`) fail(`the plan names exactly the merged branches under the prefixes (got ${JSON.stringify(p.output.trim())})`);
    for (const k of KEPT) if (!new RegExp(`kept[^\\n]*\\n(?:  [^\\n]*\\n)*  ${k.replace(/[/.]/g, '\\$&')}\\b`).test(p.out)) fail(`the plan lists ${k} as kept`);
    if (/feature\/merged/.test(p.out) || /feature\/merged/.test(p.gh.replace(/^.*\/branches.*$/m, ''))) fail('a branch under no prefix is never planned, listed or read');
    if (/DELETE/.test(p.gh)) fail('the plan deletes nothing');

    // (d) a failed read fails the plan
    for (const read of ['/branches', '/compare/', '/pulls?']) {
      const r = step(planScript, { GH_FAIL: read });
      if (r.status === 0 || r.output !== '') fail(`a plan that cannot read ${read} fails and plans nothing (got exit ${r.status}, output ${JSON.stringify(r.output)})`);
    }

    // (e) the delete
    const ok = step(deleteScript, { MERGED: PLANNED });
    const want = PLANNED.split(' ').map((b) => `api -X DELETE repos/org/app/git/refs/heads/${b} --silent`);
    if (ok.status !== 0 || JSON.stringify(ok.gh.trim().split('\n')) !== JSON.stringify(want)) fail(`the delete removes each planned branch, in order (got exit ${ok.status}: ${ok.gh.trim()})`);
    const bad = step(deleteScript, { MERGED: 'work/2026-10-12 main' });
    if (bad.status === 0 || bad.gh !== '') fail('the delete refuses a name under no prefix before deleting anything');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
