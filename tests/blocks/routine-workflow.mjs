// ── routine/assay-routine.yml: the workflow template's own invariants ─────────
// Not run (no GitHub Actions runner here) — parsed as text, since it is a real
// GitHub Actions YAML file, not the constrained subset lib/yaml-min.mjs reads.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, negFailures } from '../harness.mjs';

export const label = 'routine-workflow';

export async function run() {
  const fail = (m) => negFailures.push('routine-workflow: ' + m);
  const yml = readFileSync(join(ROOT, 'routine', 'assay-routine.yml'), 'utf8');
  const lines = yml.split('\n');

  // every `uses:` pinned to a 40-hex commit SHA (a version tag or branch is refused).
  const usesLines = lines.filter((l) => /^\s*uses:\s*/.test(l));
  if (!usesLines.length) fail('the template must use at least one action');
  for (const l of usesLines) {
    const m = l.match(/uses:\s*([^\s#]+)/);
    const ref = m && m[1].split('@')[1];
    if (!ref || !/^[0-9a-f]{40}$/.test(ref)) fail(`"${l.trim()}" is not pinned to a 40-hex commit SHA`);
  }

  // permissions: read-only, and nothing broader than contents: read.
  const permIdx = lines.findIndex((l) => /^permissions:\s*$/.test(l));
  if (permIdx === -1) fail('the template must declare a top-level permissions: block');
  else {
    const block = [];
    for (let i = permIdx + 1; i < lines.length && /^\s{2}\S/.test(lines[i]); i++) block.push(lines[i].trim().split('#')[0].trim());
    const nonEmpty = block.filter(Boolean);
    if (nonEmpty.length !== 1 || nonEmpty[0] !== 'contents: read') fail(`permissions must be exactly "contents: read" and nothing broader (got ${JSON.stringify(nonEmpty)})`);
  }

  // timeout-minutes on every job.
  const jobsIdx = lines.findIndex((l) => /^jobs:\s*$/.test(l));
  if (jobsIdx === -1) fail('the template must declare a jobs: block');
  else {
    const jobNames = [];
    for (let i = jobsIdx + 1; i < lines.length; i++) {
      const m = lines[i].match(/^\s{2}(\S[^:]*):\s*$/);
      if (m) jobNames.push({ name: m[1], line: i });
    }
    if (!jobNames.length) fail('jobs: must declare at least one job');
    for (let j = 0; j < jobNames.length; j++) {
      const start = jobNames[j].line, end = j + 1 < jobNames.length ? jobNames[j + 1].line : lines.length;
      const body = lines.slice(start, end);
      if (!body.some((l) => /^\s{4}timeout-minutes:\s*\d+/.test(l))) fail(`job "${jobNames[j].name}" has no timeout-minutes`);
    }
  }

  // ASSAY_REF is a placeholder / a full SHA in the template, and the comment beside
  // it warns against a branch name — the steward fills in a real one before use.
  const refLine = lines.find((l) => /ASSAY_REF:/.test(l));
  if (!refLine) fail('the template must declare ASSAY_REF');
  else if (!/[0-9a-f]{40}/.test(refLine)) fail('ASSAY_REF must be a 40-hex placeholder (never a branch name) for the steward to replace');
  if (!/never a branch name/i.test(yml)) fail('the template must warn, in words, that ASSAY_REF is a commit SHA and never a branch name');

  if (!/schedule:/.test(yml) || !/workflow_dispatch:/.test(yml) || !/pull_request:/.test(yml)) fail('the template must trigger on schedule, workflow_dispatch and pull_request');

  // the pull-request baseline gate: the base branch is fetched, and --base-ref
  // is passed so the routine grades against it, never the working tree.
  if (!/git fetch origin/.test(yml)) fail('the template must fetch the base branch before running the routine on a pull request');
  if (!/--base-ref\s+"?origin\/\$\{?BASE_REF\}?"?/.test(yml)) fail('the template must pass --base-ref origin/<base branch> to routine/run.mjs on a pull request');

  // #48 (F-1203, F-418, F-419): the change's own code runs in one job, the gate in another.
  // The `target` job is the only one that runs the target's steps, and it hands forward only
  // fresh-clone's raw report; the `routine` job (the required check) needs it, runs from its
  // own fresh checkouts, ingests the handoff, and never runs the target's steps itself.
  {
    const jobBodies = new Map();
    const jIdx = lines.findIndex((l) => /^jobs:\s*$/.test(l));
    const heads = [];
    if (jIdx !== -1) for (let i = jIdx + 1; i < lines.length; i++) { const m = lines[i].match(/^\s{2}([\w-]+):\s*$/); if (m) heads.push({ name: m[1], line: i }); }
    for (let j = 0; j < heads.length; j++) jobBodies.set(heads[j].name, lines.slice(heads[j].line, j + 1 < heads.length ? heads[j + 1].line : lines.length).filter((l) => !/^\s*#/.test(l)).join('\n'));
    const targetJob = jobBodies.get('target'), gateJob = jobBodies.get('routine');
    if (!targetJob || !gateJob) fail(`the template must declare a "target" job and a "routine" (gate) job (got ${JSON.stringify([...jobBodies.keys()])})`);
    else {
      if (!/routine\/run\.mjs"?[^\n]*(?:\\\n[^\n]*)?--target-steps/.test(targetJob)) fail('the target job must run the target\'s steps (routine/run.mjs --target-steps)');
      if (/--base-ref|ratchet|--out\b/.test(targetJob)) fail('the target job must never validate, compile or ratchet — the gate runs in the routine job');
      if (!/upload-artifact/.test(targetJob)) fail('the target job must hand its raw report forward as an artifact');
      if (!/^\s{4}needs:\s*\[?\s*target\s*\]?\s*$/m.test(gateJob)) fail('the routine job must need the target job');
      if (/--target-steps/.test(gateJob)) fail('the routine (gate) job must never run the target\'s steps');
      if (!/download-artifact/.test(gateJob) || !/--handoff/.test(gateJob)) fail('the routine job must ingest the target job\'s handoff (download-artifact, --handoff)');
    }
  }
  // #48 (F-1222, F-428, F-429): no checkout leaves the job token (or a read token) in .git/config.
  {
    const checkoutAt = lines.map((l, i) => (/^\s*uses:\s*actions\/checkout@/.test(l) ? i : -1)).filter((i) => i > -1);
    if (checkoutAt.length < 2) fail(`expected the template's checkout steps (got ${checkoutAt.length})`);
    for (const i of checkoutAt) {
      const step = [];
      for (let k = i + 1; k < lines.length && !/^\s*-\s/.test(lines[k]); k++) step.push(lines[k]);
      if (!step.some((l) => /^\s*persist-credentials:\s*false\s*(#.*)?$/.test(l))) fail(`the checkout step at line ${i + 1} must set persist-credentials: false`);
    }
    // base_ref reaches a script through env, quoted — never expanded into the script text
    let inRun = false, runIndent = 0;
    lines.forEach((l, i) => {
      if (/^\s*#/.test(l)) return;
      const m = l.match(/^(\s*)(?:-\s*)?run:\s*(.*)$/);
      if (m) { inRun = true; runIndent = m[1].length; if (/\$\{\{\s*github\.base_ref/.test(m[2])) fail(`line ${i + 1} expands github.base_ref into a run script`); return; }
      if (inRun && l.trim() && (l.match(/^\s*/)[0].length <= runIndent)) inRun = false;
      if (inRun && /\$\{\{\s*github\.base_ref/.test(l)) fail(`line ${i + 1} expands github.base_ref into a run script; pass it through env and quote it`);
    });
  }

  // installation (routine/README.md "Installing it"): a push trigger so merged main
  // is measured the same day, and an optional gitleaks step that is pinned to a
  // release and checked against its published sha256 — commented out, never enabled
  // by default.
  if (!/^\s*push:\s*$/m.test(yml)) fail('the template must also trigger on push to the default branch');
  const gitleaksBlock = lines.filter((l) => /^\s*#.*gitleaks/i.test(l) || /GITLEAKS_/.test(l)).join('\n');
  if (!/GITLEAKS_VERSION/.test(gitleaksBlock) || !/GITLEAKS_SHA256/.test(gitleaksBlock)) fail('the optional gitleaks step must pin a version and a sha256 checksum');
  if (!/[0-9a-f]{64}/.test(gitleaksBlock)) fail('the optional gitleaks step must carry a real-shaped sha256 (64 hex chars)');
  if (!lines.some((l) => /^\s*#\s*-\s*name:\s*Install gitleaks/.test(l))) fail('the optional gitleaks install step must be commented out (never enabled by default)');

  const readme = readFileSync(join(ROOT, 'routine', 'README.md'), 'utf8');
  if (!/required status check/i.test(readme)) fail('routine/README.md must say to make the routine job a required status check');
  if (!/CODEOWNERS/.test(readme) || !/packet\//.test(readme) || !/\.github\/workflows\//.test(readme)) fail('routine/README.md must say to add CODEOWNERS entries for packet/ and .github/workflows/');
}
