#!/usr/bin/env node
// ingest.mjs — the INSTRUMENT intake: converts a deterministic tool's native
// output into port rows (integration/scanner-contract.md, instrument role).
//
// An instrument is a mechanical enumerator/verifier (a secrets scanner, a repo
// hygiene checker). It never contributes an axis; its rows feed existing ones.
// Two rules make the intake trustworthy (fail loud, never empty):
//
//   1. FAIL LOUD, NEVER EMPTY. The converter requires the tool's own exit code
//      and halts on anything outside the tool's documented success set — a tool
//      that crashed must never read as "0 findings". Malformed or truncated
//      input halts. A verified-clean run (success exit, empty report) writes an
//      explicit zero-findings file recording that the instrument ran.
//   2. NEVER COPY A SECRET. The gitleaks profile builds observations from rule
//      id + location only; the matched secret value is never written anywhere.
//
// Evidence: file:line where the tool reports one; a repo-level claim (most
// Scorecard checks) cites the archived raw report (run-relative `eval/raw/…`),
// which `validate.mjs --target` knows to skip (instrument evidence lives in the
// run, not the target).
//
// A PEER SCANNER with a machine report also comes in here: deep-code-review 1.72+
// writes findings-YYYY-MM-DD.yaml (block YAML: review / ground_truth / coverage /
// findings). It has no exit code — its fail-loud property is COMPLETENESS: the
// coverage map must carry a row for every domain the adapter's coverage_domains
// lists, every gap row a fix, every non-scanned row a note; anything less halts.
// The coverage rows are archived as eval/coverage-<scanner>.yaml so the renderers
// can say "partially measured" where the scanner itself said it looked partially.
//
// The FRESH-CLONE instrument (tools/fresh-clone.mjs) also comes in here: its JSON
// document records each declared step's status and each README command claim's
// presence; exits 0 and 1 are both successful runs (1 = a gap exists), a runner
// crash exits 2 and halts. Rows never carry step output — only command + exit code.
//
// The DEPENDENCY-SCAN instrument (tools/dependency-scan.mjs) also comes in here:
// its JSON document records each lockfile's audit status and one advisory row
// per (advisory id, package); exits 0 and 1 are both successful runs (1 = an
// advisory or a failed/not-supported lockfile exists), a runner crash exits 2
// and halts. A failed or not-supported lockfile is a gap row, never silence.
//
// Usage:
//   node tools/ingest.mjs <run-dir> --tool <gitleaks|scorecard|fresh-clone|dependency-scan> --raw <file> --exit <code> [--start F-7xx]
//   node tools/ingest.mjs <run-dir> --tool <gitleaks|scorecard|fresh-clone|repo-census> --raw <file> --exit <code> [--start F-7xx]
//   node tools/ingest.mjs <run-dir> --tool deep-code-review --raw <machine report .yaml> [--start F-8xx]
// Writes <run-dir>/eval/findings-9N-<tool>.yaml and archives the raw report to
// <run-dir>/eval/raw/<tool>.<json|yaml>. Without --start, ids begin at the profile floor or
// the next hundred above the run's highest existing id, whichever is higher (nextStart).
// Library: convert(tool, rawText, exitCode, startId), nextStart(runDir, tool).
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { isMain } from './doctrine.mjs';
import { parseYaml } from './yaml-min.mjs';
import { loadAdapter } from './project.mjs';

// ── tool profiles ────────────────────────────────────────────────────────────
// okExits: the tool's documented success exits (anything else = tool error, halt).
// For gitleaks, 0 = clean and 1 = leaks found are both successful runs.
const PROFILES = {
  gitleaks: {
    file: 'findings-91-gitleaks.yaml',
    startId: 700,
    okExits: [0, 1],
    // the raw archive is LOCATION-ONLY: a gitleaks report carries the matched value in
    // Secret, Match and Line (and the author's name and email); none of it may enter a run
    archive(raw) {
      const leaks = JSON.parse(raw);
      return JSON.stringify(leaks.map((l) => Object.fromEntries(GITLEAKS_ARCHIVE_KEYS.filter((k) => l[k] !== undefined).map((k) => [k, k === 'Commit' ? String(l[k]).slice(0, 12) : l[k]]))), null, 1) + '\n';
    },
    convert(raw, startId) {
      const leaks = parseJson(raw, 'gitleaks');
      if (!Array.isArray(leaks)) throw new Error('gitleaks report must be a JSON array');
      return leaks.map((l, i) => {
        for (const k of ['RuleID', 'File', 'StartLine']) {
          if (l[k] === undefined || l[k] === null || l[k] === '') throw new Error(`gitleaks leak ${i} missing ${k} (truncated report?)`);
        }
        // NEVER touch l.Secret / l.Match — the matched value must not leave the raw file.
        return {
          id: fid(startId + i),
          source: 'gitleaks',
          native_id: `${l.RuleID}@${l.File}:${l.StartLine}`,
          native_category: 'secret',
          polarity: 'gap',
          observation: `Committed secret detected by rule ${l.RuleID} (${oneLine(l.Description || 'no description')}); the value is in the repository history at the cited location.`,
          evidence: [`${l.File}:${l.StartLine}`],
          fix: `Rotate the credential now (assume it is burned), then purge it from history; suppress via .gitleaksignore only after verifying it is a false positive, with the reason recorded.`,
        };
      });
    },
  },
  scorecard: {
    file: 'findings-92-scorecard.yaml',
    startId: 750,
    okExits: [0],
    // Score bands (the instrument profile's documented normalization):
    //   >= 8 strength · 4-7 gap Medium · 0-3 gap High · -1 (N/A) skipped, logged.
    convert(raw, startId) {
      const rep = parseJson(raw, 'scorecard');
      if (!rep || !Array.isArray(rep.checks)) throw new Error('scorecard report has no checks[] (truncated report?)');
      const rows = []; const skipped = [];
      let n = 0;
      for (const c of rep.checks) {
        if (!c || !c.name || typeof c.score !== 'number') throw new Error('scorecard check missing name/score (truncated report?)');
        if (c.score < 0) { skipped.push(c.name); continue; } // N/A — logged in the file header, never silent
        const detailPath = firstPath(c.details);
        const row = {
          id: fid(startId + n++),
          source: 'scorecard',
          native_id: `${c.name}:${c.score}`,
          native_category: c.name,
          polarity: c.score >= 8 ? 'strength' : 'gap',
          observation: `Scorecard ${c.name} scored ${c.score}/10: ${oneLine(c.reason || 'no reason given')}.`,
          evidence: [detailPath || 'eval/raw/scorecard.json:1'],
        };
        if (row.polarity === 'gap') {
          row.severity = c.score <= 3 ? 'High' : 'Medium';
          row.fix = `Raise the ${c.name} score: follow the check's remediation guidance${c.documentation && c.documentation.url ? ` (${c.documentation.url})` : ''}.`;
        }
        rows.push(row);
      }
      rows.skipped = skipped;
      return rows;
    },
  },
  'deep-code-review': {
    file: 'findings-93-deep-code-review.yaml',
    raw: 'deep-code-review.yaml',
    startId: 800,
    exitless: true,      // an LLM skill's machine report: completeness, not an exit code, is the fail-loud property
    convert(raw, startId) {
      let rep;
      try { rep = parseYaml(raw); }
      catch (e) { throw new Error(`deep-code-review machine report is not block-style YAML (fail-closed): ${e.message.slice(0, 80)}`); }
      if (!rep || typeof rep !== 'object' || Array.isArray(rep)) throw new Error('deep-code-review machine report must be a top-level map (review / ground_truth / coverage / findings)');
      const domains = loadAdapter('deep-code-review').coverage_domains || [];
      if (!domains.length) throw new Error('adapters/deep-code-review.yaml carries no coverage_domains — cannot judge completeness (fail-closed)');
      const cov = rep.coverage;
      if (!cov || typeof cov !== 'object' || Array.isArray(cov)) throw new Error('machine report has no coverage: map — a report that does not say what it looked at is not a report');
      const missing = domains.filter((l) => !cov[l] || typeof cov[l] !== 'object');
      if (missing.length) throw new Error(`coverage incomplete: no row for domain(s) ${missing.join(', ')} — absence of a row is not clean`);
      for (const [l, row] of Object.entries(cov)) {
        if (!COVERAGE_STATUS.includes(row.status)) throw new Error(`coverage.${l}: bad status "${row.status}" (scanned | partial | not-scanned | not-applicable)`);
        if (row.status !== 'scanned' && !(row.note && String(row.note).trim())) throw new Error(`coverage.${l}: ${row.status} needs a note — a skip without one is indistinguishable from an omission`);
      }
      if (!Array.isArray(rep.findings)) throw new Error('machine report findings: must be a list (an empty list with full coverage is a recorded clean run)');
      const rows = []; let n = 0;
      for (const f of rep.findings) {
        const at = `finding ${(f && f.id) || '#' + (n + 1)}`;
        if (!f || typeof f !== 'object') throw new Error(`${at}: not a map`);
        for (const k of ['id', 'area', 'polarity', 'observation', 'evidence']) if (f[k] === undefined || f[k] === null || f[k] === '') throw new Error(`${at}: missing ${k}`);
        if (!['gap', 'strength'].includes(f.polarity)) throw new Error(`${at}: bad polarity "${f.polarity}" (gap | strength)`);
        if (!Array.isArray(f.evidence) || !f.evidence.length) throw new Error(`${at}: evidence must be a non-empty list of file:line`);
        if (f.polarity === 'gap' && !f.severity) throw new Error(`${at}: a gap row needs a severity`);
        if (f.polarity === 'gap' && !(f.fix && String(f.fix).trim())) throw new Error(`${at}: a gap row needs a fix — a gap without one cannot be acted on`);
        const row = {
          id: fid(startId + n++),
          source: 'deep-code-review',
          native_id: String(f.id),
          native_category: String(f.area),
          polarity: f.polarity,
          observation: oneLine(f.observation),
          evidence: f.evidence.map((e) => String(e)),
        };
        if (f.title) row.title = oneLine(f.title);
        if (f.severity) row.severity = String(f.severity);
        if (f.fix) row.fix = oneLine(f.fix);
        if (f.confidence) {
          const c = String(f.confidence);
          row.confidence = DCR_CONFIDENCE[c] || 'unverified';   // the port vocab; unknown labels read as unverified, never confirmed
          row.native_confidence = c;
        }
        if (f.latent === true) row.latent = true;
        if (f.mechanism_unproven === true) row.mechanism_unproven = true;
        if (f.prior_id) { row.prior_native_id = String(f.prior_id); if (f.prior_status) row.prior_status = String(f.prior_status); }
        if (Array.isArray(f.compounds) && f.compounds.length) row.compounds_native = f.compounds.map(String);
        rows.push(row);
      }
      rows.coverage = {
        scanner: 'deep-code-review',
        review: (rep.review && typeof rep.review === 'object') ? rep.review : {},
        ground_truth: (rep.ground_truth && typeof rep.ground_truth === 'object') ? rep.ground_truth : {},
        coverage: cov,
        prior_not_rechecked: Array.isArray(rep.prior_not_rechecked) ? rep.prior_not_rechecked.map(String) : [],
      };
      return rows;
    },
  },
  'fresh-clone': {
    file: 'findings-94-fresh-clone.yaml',
    startId: 900,
    // 0 = every declared step passed and every README claim present, at the root AND
    // in every workspace; 1 = at least one step failed / timed out or a claim is
    // missing, anywhere. Both are successful RUNS. A crash of the runner itself exits
    // 2 and halts here.
    okExits: [0, 1],
    // Rows: one gap per step that failed / timed out; one gap per NOT-DECLARED lint,
    // typecheck, test, migrate (the floor descriptors are worded so absence is a gap,
    // never clean: no lint script is not a green lint); one gap per MISSING README
    // claim. A passing step yields no row — a clean run is the explicit empty file.
    // NEVER copy step output: the last-40-lines tail (which may echo environment
    // values) stays in the raw archive; rows carry the command and exit code only.
    //
    // WORKSPACES (#123, the fresh-clone half of #127): the same rows, once for the
    // root and once per entry in `rep.workspaces` — an npm-workspaces root is not one
    // repository, it is several, and each one's gap is its own row. A workspace row's
    // native_category stays the closed step name (install / build / … / readme-claim
    // — what the adapter maps on); the workspace is carried in `native_id`, prefixed
    // (`apps/x:install:failed`), so two workspaces failing the same step never collide.
    // Evidence is the workspace's own manifest or README (`apps/x/package.json:1`,
    // `apps/x/README.md:12`), never the root's. `rep.workspaces` is optional — a
    // document from before #127 (no key at all) converts exactly as it always has.
    convert(raw, startId, exitCode) {
      const rep = parseJson(raw, 'fresh-clone');
      if (!rep || typeof rep !== 'object' || Array.isArray(rep)) throw new Error('fresh-clone report must be a JSON object');
      if (rep.tool !== 'fresh-clone') throw new Error(`fresh-clone report carries tool "${rep.tool}" (truncated or not a fresh-clone report?)`);
      if (!Array.isArray(rep.steps) || !Array.isArray(rep.readme_claims)) throw new Error('fresh-clone report has no steps[] / readme_claims[] (truncated report?)');
      if (![0, 1].includes(rep.exit)) throw new Error(`fresh-clone report exit "${rep.exit}" is not 0 | 1 (truncated report?)`);
      if (exitCode !== undefined && exitCode !== null && Number(exitCode) !== rep.exit) throw new Error(`fresh-clone report says exit ${rep.exit} but the runner exited ${exitCode} — the document does not describe the run it is filed under`);
      if (rep.workspaces !== undefined && !Array.isArray(rep.workspaces)) throw new Error('fresh-clone report workspaces must be a list (truncated report?)');

      const rows = []; let n = 0;

      // one entry (root or workspace): validates its steps[] / readme_claims[] and
      // appends their gap rows. ctx carries everything that differs by entry.
      const emitEntry = (steps, readmeClaims, ctx) => {
        const seen = new Set();
        for (const s of steps) {
          if (!s || !FC_STEPS.includes(s.name)) throw new Error(`fresh-clone${ctx.errLabel} step "${s && s.name}" is not one of ${FC_STEPS.join(' | ')} (truncated report?)`);
          if (!FC_STEP_STATUS.includes(s.status)) throw new Error(`fresh-clone${ctx.errLabel} step ${s.name}: status "${s.status}" is not one of ${FC_STEP_STATUS.join(' | ')}`);
          if (seen.has(s.name)) throw new Error(`fresh-clone${ctx.errLabel} step ${s.name} appears twice`);
          seen.add(s.name);
          const cmd = s.command ? ` (\`${oneLine(s.command)}\`` + (Number.isInteger(s.exit_code) ? `, exit ${s.exit_code})` : ')') : '';
          let observation = null;
          if (s.status === 'failed') observation = `Fresh-clone step ${s.name}${ctx.inLabel} failed${cmd}${s.reason ? ': ' + oneLine(s.reason) : ''}; a clean checkout does not ${FC_VERB[s.name]}${ctx.inLabel}.`;
          else if (s.status === 'timed-out') observation = `Fresh-clone step ${s.name}${ctx.inLabel} timed out${cmd}${s.reason ? ' — ' + oneLine(s.reason) : ''}; a clean checkout does not ${FC_VERB[s.name]}${ctx.inLabel} within the run budget.`;
          else if (s.status === 'not-declared' && s.name === 'migrate' && !ctx.hasDbSignals) observation = null;   // no database in the tree: nothing to migrate, no gap
          else if (s.status === 'not-declared' && FC_FLOOR_STEPS.includes(s.name)) observation = `Fresh-clone step ${s.name} is not declared in a runnable form${ctx.inLabel}${s.reason ? ' (' + oneLine(s.reason) + ')' : ''}; nothing in the repository ${FC_DECLARES[s.name]}, so a clean checkout cannot ${FC_VERB[s.name]}${ctx.inLabel}.`;
          if (!observation) continue;
          rows.push({
            id: fid(startId + n++),
            source: 'fresh-clone',
            native_id: `${ctx.idPrefix}${s.name}:${s.status}`,
            native_category: s.name,
            polarity: 'gap',
            severity: (s.status === 'failed' || s.status === 'timed-out') && ['install', 'build', 'test'].includes(s.name) ? 'High' : 'Medium',
            observation,
            evidence: [ctx.manifest],
            fix: FC_FIX[s.name],
          });
        }
        for (const s of FC_STEPS) if (!seen.has(s)) throw new Error(`fresh-clone${ctx.errLabel} has no row for step ${s} — a step the runner did not record is not a pass (truncated report?)`);
        for (const c of readmeClaims) {
          if (!c || !Number.isInteger(c.line) || !c.command || !['present', 'missing'].includes(c.status)) throw new Error(`fresh-clone${ctx.errLabel} README claim missing line / command / status (truncated report?)`);
          if (c.status !== 'missing') continue;
          rows.push({
            id: fid(startId + n++),
            source: 'fresh-clone',
            native_id: `${ctx.idPrefix}readme-claim@${ctx.readme}:${c.line}`,
            native_category: 'readme-claim',
            polarity: 'gap',
            severity: 'Medium',
            observation: `README claims \`${oneLine(c.command)}\` (${ctx.readme}:${c.line})${ctx.inLabel} but the ${FC_CLAIM_NOUN[c.kind] || 'target'} it names does not exist in the tree; the README is not true of this checkout at that line.`,
            evidence: [`${ctx.readme}:${c.line}`],
            fix: `Make the README true: add the ${FC_CLAIM_NOUN[c.kind] || 'target'} the line claims, or correct the line to the command that exists; re-run fresh-clone and confirm the claim reads present.`,
          });
        }
      };

      const rootDbSignals = Array.isArray(rep.toolchain && rep.toolchain.database_signals) && rep.toolchain.database_signals.length > 0;
      emitEntry(rep.steps, rep.readme_claims, {
        idPrefix: '', inLabel: '', errLabel: '',
        manifest: (rep.toolchain && rep.toolchain.manifest) ? `${rep.toolchain.manifest}:1` : 'eval/raw/fresh-clone.json:1',
        readme: rep.readme || 'README.md',
        hasDbSignals: rootDbSignals,
      });

      for (const w of rep.workspaces || []) {
        if (!w || typeof w.path !== 'string' || !w.path) throw new Error('fresh-clone workspace entry missing path (truncated report?)');
        if (!Array.isArray(w.steps)) throw new Error(`fresh-clone workspace ${w.path} has no steps[] (truncated report?)`);
        if (!Array.isArray(w.readme_claims)) throw new Error(`fresh-clone workspace ${w.path} has no readme_claims[] (truncated report?)`);
        const wDbSignals = Array.isArray(w.toolchain && w.toolchain.database_signals) && w.toolchain.database_signals.length > 0;
        emitEntry(w.steps, w.readme_claims, {
          idPrefix: `${w.path}:`, inLabel: ` in workspace ${w.path}`, errLabel: ` workspace ${w.path}`,
          manifest: (w.toolchain && w.toolchain.manifest) ? `${w.path}/${w.toolchain.manifest}:1` : `${w.path}/package.json:1`,
          readme: `${w.path}/${w.readme || 'README.md'}`,
          hasDbSignals: wDbSignals,
        });
      }

      return rows;
    },
  },
  'dependency-scan': {
    file: 'findings-95-dependency-scan.yaml',
    startId: 950,
    // 0 = every lockfile in the tree audited with zero advisories; 1 = any advisory,
    // any failed lockfile, or any not-supported (pnpm/yarn) lockfile. Both are
    // successful RUNS. A crash of the runner itself exits 2 and halts.
    okExits: [0, 1],
    // Rows: one gap per advisory (category = its severity — critical | high |
    // moderate | low | info); one gap (category lockfile-failed) per lockfile npm
    // audit could not complete against (a tool error is never a clean lockfile);
    // one gap (category lockfile-unsupported) per pnpm-lock.yaml / yarn.lock (an
    // absent audit is a gap, never clean). A clean audited lockfile with no
    // advisories yields no row — a clean run is the explicit empty file.
    convert(raw, startId, exitCode) {
      const rep = parseJson(raw, 'dependency-scan');
      if (!rep || typeof rep !== 'object' || Array.isArray(rep)) throw new Error('dependency-scan report must be a JSON object');
      if (rep.tool !== 'dependency-scan') throw new Error(`dependency-scan report carries tool "${rep.tool}" (truncated or not a dependency-scan report?)`);
      if (!Array.isArray(rep.lockfiles)) throw new Error('dependency-scan report has no lockfiles[] (truncated report?)');
      if (![0, 1].includes(rep.exit)) throw new Error(`dependency-scan report exit "${rep.exit}" is not 0 | 1 (truncated report?)`);
      if (exitCode !== undefined && exitCode !== null && Number(exitCode) !== rep.exit) throw new Error(`dependency-scan report says exit ${rep.exit} but the runner exited ${exitCode} — the document does not describe the run it is filed under`);
      const rows = []; let n = 0;
      for (const lf of rep.lockfiles) {
        if (!lf || typeof lf.path !== 'string' || !lf.path) throw new Error('dependency-scan lockfile row missing path (truncated report?)');
        if (!DS_STATUS.includes(lf.status)) throw new Error(`dependency-scan lockfile ${lf.path}: status "${lf.status}" is not one of ${DS_STATUS.join(' | ')}`);
        const evidence = [`${lf.path}:1`];
        if (lf.status === 'failed') {
          rows.push({
            id: fid(startId + n++), source: 'dependency-scan',
            native_id: `lockfile-failed@${lf.path}`, native_category: 'lockfile-failed', polarity: 'gap', severity: 'Medium',
            observation: `dependency-scan could not audit ${lf.path}${Number.isInteger(lf.npm_exit_code) ? ` (npm audit exited ${lf.npm_exit_code})` : ''}${lf.reason ? ': ' + oneLine(lf.reason) : ''}; a tool error is never read as a clean lockfile.`,
            evidence,
            fix: `Fix what is blocking npm audit against ${lf.path} (registry reachability, a malformed lockfile, or an ENOLOCK workspace root npm cannot resolve) and re-run dependency-scan until it reads audited.`,
          });
          continue;
        }
        if (lf.status === 'not-supported') {
          rows.push({
            id: fid(startId + n++), source: 'dependency-scan',
            native_id: `lockfile-unsupported@${lf.path}`, native_category: 'lockfile-unsupported', polarity: 'gap', severity: 'Medium',
            observation: `${lf.path} is a ${lf.manager || 'non-npm'} lockfile; dependency-scan audits npm lockfiles only, so it was never checked${lf.reason ? ': ' + oneLine(lf.reason) : ''}.`,
            evidence,
            fix: `Audit ${lf.path} with its own package manager's vulnerability tool (${lf.manager === 'yarn' ? 'yarn npm audit' : 'pnpm audit'}), or restate it as an npm lockfile; the absence of an audit is a gap, not a clean lockfile.`,
          });
          continue;
        }
        // status === 'audited'
        if (!Array.isArray(lf.advisories)) throw new Error(`dependency-scan lockfile ${lf.path}: audited status but no advisories[] (truncated report?)`);
        for (const a of lf.advisories) {
          for (const k of ['id', 'package', 'severity']) if (!a || !a[k]) throw new Error(`dependency-scan advisory in ${lf.path} missing ${k} (truncated report?)`);
          if (!DS_SEVERITIES.includes(a.severity)) throw new Error(`dependency-scan advisory ${a.id}@${a.package}: severity "${a.severity}" is not one of ${DS_SEVERITIES.join(' | ')}`);
          rows.push({
            id: fid(startId + n++), source: 'dependency-scan',
            native_id: `${a.id}@${a.package}@${lf.path}`, native_category: a.severity, polarity: 'gap',
            severity: DS_SEVERITY_MAP[a.severity],
            observation: `${a.package}${a.installed ? ` (installed ${oneLine(a.installed)})` : ''} in ${lf.path} is vulnerable to ${a.id} (${a.severity}${a.range ? `, range ${oneLine(a.range)}` : ''})${a.url ? ` — ${a.url}` : ''}.`,
            evidence,
            fix: `Upgrade ${a.package} to a version outside ${a.range ? oneLine(a.range) : 'the vulnerable range'} (npm reports a fix available: ${a.fix_available ? 'yes' : 'no'}) and regenerate ${lf.path}; re-run dependency-scan and confirm the advisory is gone.`,
          });
        }
      }
      return rows;
    },
  },
  'repo-census': {
    file: 'findings-96-repo-census.yaml',
    startId: 960,
    // 0 = every check passed (or was not-applicable); 1 = at least one check is a gap.
    // Both are successful RUNS. A crash of the runner itself exits 2 and halts here.
    okExits: [0, 1],
    // Rows: one gap row per `gap` check, one strength row per `pass` check (so the
    // axis sees the evidence, not just the absence of a gap) — a `not-applicable`
    // check yields nothing. native_id is `<check name>@<location>` (location is the
    // check's detail.path, "." for the whole-repo checks); evidence is the check's
    // own evidence, which always carries at least one path:line (the runner falls
    // back to `<location>/:1` when a check has nothing more specific to cite).
    convert(raw, startId, exitCode) {
      const rep = parseJson(raw, 'repo-census');
      if (!rep || typeof rep !== 'object' || Array.isArray(rep)) throw new Error('repo-census report must be a JSON object');
      if (rep.tool !== 'repo-census') throw new Error(`repo-census report carries tool "${rep.tool}" (truncated or not a repo-census report?)`);
      if (!Array.isArray(rep.checks) || !rep.checks.length) throw new Error('repo-census report has no checks[] (truncated report?)');
      if (![0, 1].includes(rep.exit)) throw new Error(`repo-census report exit "${rep.exit}" is not 0 | 1 (truncated report?)`);
      if (exitCode !== undefined && exitCode !== null && Number(exitCode) !== rep.exit) throw new Error(`repo-census report says exit ${rep.exit} but the runner exited ${exitCode} — the document does not describe the run it is filed under`);
      const rows = []; let n = 0;
      for (const c of rep.checks) {
        if (!c || !RC_CHECKS.includes(c.name)) throw new Error(`repo-census check "${c && c.name}" is not one of ${RC_CHECKS.join(' | ')} (truncated report? unknown check?)`);
        if (!RC_STATUS.includes(c.status)) throw new Error(`repo-census check ${c.name}: status "${c.status}" is not one of ${RC_STATUS.join(' | ')}`);
        if (c.status === 'not-applicable') continue;
        if (typeof c.observation !== 'string' || !c.observation.trim()) throw new Error(`repo-census check ${c.name}: missing observation (truncated report?)`);
        const location = (c.detail && typeof c.detail.path === 'string' && c.detail.path) || '.';
        const nativeLoc = location === '.' ? 'root' : location;
        const evidence = Array.isArray(c.evidence) && c.evidence.length ? c.evidence.map(String) : [`${location}/:1`];
        const failOpen = Array.isArray(c.detail && c.detail.failOpen) ? c.detail.failOpen : [];
        if (c.status === 'gap') {
          rows.push({
            id: fid(startId + n++),
            source: 'repo-census',
            native_id: `${c.name}@${nativeLoc}`,
            native_category: c.name,
            polarity: 'gap',
            severity: c.name === 'ci-gate' && failOpen.length ? 'High' : 'Medium',
            observation: oneLine(c.observation),
            evidence,
            fix: RC_FIX[c.name],
          });
        } else if (c.status === 'pass') {
          rows.push({
            id: fid(startId + n++),
            source: 'repo-census',
            native_id: `${c.name}@${nativeLoc}`,
            native_category: c.name,
            polarity: 'strength',
            observation: oneLine(c.observation),
            evidence,
          });
        }
      }
      return rows;
    },
  },
};
const RC_CHECKS = ['architecture-page', 'agent-contract', 'runbook', 'ci-gate'];
const RC_STATUS = ['pass', 'gap', 'not-applicable'];
const RC_FIX = {
  'architecture-page': 'Add a page (ARCHITECTURE.md, docs/ARCHITECTURE.md, or a README "Architecture" section) that names every external service and data store the target depends on (database, queue, API, service, store, bucket, provider); a diagram is a bonus, not a substitute. Re-run repo-census and confirm it reads pass.',
  'agent-contract': 'Make the agent contract (AGENTS.md or CLAUDE.md) present-tense: move any Status / History / Changelog / Todo / Backlog section and dated changelog lines to a separate, co-located history file. Re-run repo-census and confirm it reads pass.',
  'runbook': 'Add the missing procedure(s) to the runbook (RUNBOOK.md, docs/RUNBOOK.md, or a README/doc "Runbook"/"Operations" section) — a heading or paragraph for restart, roll back, rotate a key/secret/credential, and restore from backup. Re-run repo-census and confirm it reads pass. (This decides presence only; run each procedure once and record that separately.)',
  'ci-gate': 'Add or fix a workflow that triggers on pull_request (or push to the default branch) and runs a test/lint/typecheck/build step with no `continue-on-error: true` on that step or its job. Re-run repo-census and confirm it reads pass.',
};
const COVERAGE_STATUS = ['scanned', 'partial', 'not-scanned', 'not-applicable'];
// the only gitleaks fields a run may keep (never Secret, Match, Line, Author, Email, Message)
const GITLEAKS_ARCHIVE_KEYS = ['RuleID', 'Description', 'File', 'StartLine', 'EndLine', 'StartColumn', 'EndColumn', 'Commit', 'Date', 'Fingerprint', 'Entropy', 'Tags'];
// dependency-scan vocab (the runner's closed sets; a report outside them is truncated or foreign)
const DS_STATUS = ['audited', 'failed', 'not-supported'];
const DS_SEVERITIES = ['critical', 'high', 'moderate', 'low', 'info'];
const DS_SEVERITY_MAP = { critical: 'Critical', high: 'High', moderate: 'Medium', low: 'Low', info: 'Low' };
// fresh-clone vocab (the runner's closed sets; a report outside them is truncated or foreign)
const FC_STEPS = ['install', 'build', 'lint', 'typecheck', 'test', 'migrate'];
const FC_STEP_STATUS = ['passed', 'failed', 'not-declared', 'timed-out', 'skipped'];
const FC_FLOOR_STEPS = ['lint', 'typecheck', 'test', 'migrate'];   // not declared ⇒ a gap (absence is not clean); migrate only where the tree carries database signals
const FC_VERB = { install: 'install its dependencies', build: 'build', lint: 'lint clean', typecheck: 'typecheck clean', test: 'run its tests', migrate: 'replay its migrations from empty' };
const FC_DECLARES = { lint: 'declares a lint gate', typecheck: 'declares a typecheck gate', test: 'declares a test command', migrate: 'declares a migration command that can run without a live database' };
const FC_FIX = {
  install: 'Make the install reproducible from a clean checkout: commit the lockfile, declare the toolchain (engines / .nvmrc / .tool-versions), and remove any dependency on machine-local state; re-run fresh-clone and confirm install passes.',
  build: 'Make the build pass from a clean checkout with the declared toolchain (no uncommitted generated files, no machine-local paths); re-run fresh-clone and confirm build passes.',
  lint: 'Declare a lint script in the package manifest that runs the linter and exits non-zero on a violation, and wire it into CI; re-run fresh-clone and confirm lint passes.',
  typecheck: 'Declare a typecheck script in the package manifest (tsc --noEmit or the stack equivalent) that exits non-zero on a type error, and wire it into CI; re-run fresh-clone and confirm typecheck passes.',
  test: 'Declare a test script that executes the suite\'s core on a clean machine without an unset variable silently skipping it, and make it pass; re-run fresh-clone and confirm test passes.',
  migrate: 'Declare a migration command that replays from an empty database, with a DATABASE_URL-free dry form (migrate:dry / migrate:check / --dry-run) the fresh-clone run can exercise; re-run fresh-clone and confirm migrate passes.',
};
const FC_CLAIM_NOUN = { 'npm-script': 'package script', 'npx-bin': 'binary (a dependency or own bin)', 'node-file': 'file', 'make-target': 'make target' };
// the scanner's confidence labels → the port's closed vocab (SCHEMA §2)
const DCR_CONFIDENCE = { CONFIRMED: 'confirmed', CORROBORATED: 'confirmed', PLAUSIBLE: 'plausible', unverified: 'unverified' };

const fid = (n) => `F-${String(n).padStart(3, '0')}`;
const oneLine = (s) => String(s).replace(/\s+/g, ' ').trim();
function parseJson(raw, tool) {
  try { return JSON.parse(raw); }
  catch (e) { throw new Error(`${tool} raw report is not valid JSON (fail-closed): ${e.message.slice(0, 80)}`); }
}
// pull a file:line (or bare path) out of a Scorecard details line, if one exists
function firstPath(details) {
  if (!Array.isArray(details)) return null;
  for (const d of details) {
    const m = String(d).match(/([\w./-]+\.\w+):(\d+)/);
    if (m) return `${m[1]}:${m[2]}`;
  }
  return null;
}

// ── convert (library) ────────────────────────────────────────────────────────
// opts.stripPrefix: an absolute target-root prefix to strip from tool-reported
// paths, so evidence lands target-relative (what `validate.mjs --target` checks).
export function convert(tool, rawText, exitCode, startId = null, opts = {}) {
  const p = PROFILES[tool];
  if (!p) throw new Error(`unknown instrument "${tool}" (profiles: ${Object.keys(PROFILES).join(', ')})`);
  if (!p.exitless) {
    const code = Number(exitCode);
    if (!Number.isInteger(code)) throw new Error(`--exit must be the tool's actual exit code (fail-loud: a run without one cannot be trusted)`);
    if (!p.okExits.includes(code)) throw new Error(`${tool} exited ${code}, outside its success set [${p.okExits.join(', ')}] — a tool error must never read as "0 findings"`);
  }
  const start = startId ? Number(String(startId).replace(/^F-/, '')) : p.startId;
  const rows = p.convert(rawText, start, p.exitless ? null : Number(exitCode));
  if (opts.stripPrefix) {
    const pre = opts.stripPrefix.endsWith('/') ? opts.stripPrefix : opts.stripPrefix + '/';
    const strip = (s) => String(s).split(pre).join('');
    for (const r of rows) { r.evidence = r.evidence.map(strip); r.native_id = strip(r.native_id); }
  }
  return rows;
}

// ── id allocation: above the base's highest id, never inside another block ──
// Each profile has a documented floor (gitleaks 700, scorecard 750, deep-code-review
// 800, fresh-clone 900, dependency-scan 950). A real history scan can run past the next floor (Scout's
// gitleaks block was F-700..F-1866), so the default start is the profile floor OR the
// next hundred above the highest id already in the run's OTHER findings files,
// whichever is higher. The profile's own file is excluded so a re-ingest of the same
// tool lands where it did before instead of drifting upward on every run.
export function nextStart(runDir, tool) {
  const p = PROFILES[tool];
  if (!p) throw new Error(`unknown instrument "${tool}"`);
  const evalDir = existsSync(join(runDir, 'eval')) ? join(runDir, 'eval') : runDir;
  let max = 0; const seenIn = [];
  if (existsSync(evalDir)) {
    for (const f of readdirSync(evalDir)) {
      if (!/^findings-\d\d-.*\.yaml$/.test(f) || f === p.file) continue;
      const m = readFileSync(join(evalDir, f), 'utf8').match(/^-\s+id:\s*F-(\d+)/gm) || [];
      for (const s of m) { const n = Number(s.replace(/^-\s+id:\s*F-/, '')); if (n > max) { max = n; } }
      if (m.length) seenIn.push(f);
    }
  }
  const above = max ? Math.ceil((max + 1) / 100) * 100 : 0;
  const start = Math.max(p.startId, above);
  return { start, floor: p.startId, highest: max, reason: start === p.startId ? `the profile floor (highest existing id F-${max} is below it)` : `the next hundred above the base's highest id F-${max} (in ${seenIn.join(', ')}); the profile floor is F-${p.startId}` };
}

// ── YAML emit (the schema's constrained subset: block style, folded scalars) ─
function toYaml(rows, tool, exitCode, skipped, startNote) {
  const esc = (s) => oneLine(s);
  const q = (s) => `"${esc(s).replace(/"/g, "'")}"`;
  const p = PROFILES[tool];
  const out = p.exitless
    ? [`# ${p.file} — peer-scanner rows ingested by tools/ingest.mjs from the scanner's machine report.`,
       `# Scanner: ${tool} · ${rows.length} row(s) · coverage archived at eval/coverage-${tool}.yaml (one row per domain).`]
    : [`# ${p.file} — instrument rows ingested by tools/ingest.mjs.`,
       `# Instrument: ${tool} · exit code ${exitCode} (verified in its success set) · ${rows.length} row(s).`];
  if (skipped && skipped.length) out.push(`# Skipped as N/A by the tool (score -1), logged so the absence is visible: ${skipped.join(', ')}.`);
  if (startNote) out.push(`# Ids start at ${startNote}.`);
  out.push(`# Raw report archived at eval/raw/${p.raw || tool + '.json'}. Regenerate with ingest.mjs; never hand-edit.`, '');
  for (const r of rows) {
    out.push(`- id: ${r.id}`);
    out.push(`  source: ${r.source}`);
    out.push(`  native_id: "${esc(r.native_id).replace(/"/g, "'")}"`);
    out.push(`  native_category: "${esc(r.native_category).replace(/"/g, "'")}"`);
    out.push(`  polarity: ${r.polarity}`);
    if (r.severity) out.push(`  severity: ${r.severity}`);
    out.push(`  observation: >`, `    ${esc(r.observation)}`);
    out.push(`  evidence: [${r.evidence.join(', ')}]`);
    if (r.fix) out.push(`  fix: >`, `    ${esc(r.fix)}`);
    // peer-scanner extension fields (the port keeps the scanner's own labels beside the mapped ones)
    if (r.title) out.push(`  title: ${q(r.title)}`);
    if (r.confidence) out.push(`  confidence: ${r.confidence}`);
    if (r.native_confidence) out.push(`  native_confidence: ${r.native_confidence}`);
    if (r.latent) out.push(`  latent: true`);
    if (r.mechanism_unproven) out.push(`  mechanism_unproven: true`);
    if (r.prior_native_id) out.push(`  prior_native_id: ${q(r.prior_native_id)}`);
    if (r.prior_status) out.push(`  prior_status: ${r.prior_status}`);
    if (r.compounds_native) out.push(`  compounds_native: [${r.compounds_native.map((x) => esc(x)).join(', ')}]`);
  }
  return out.join('\n') + '\n';
}

// ── the coverage sidecar (block YAML; the scanner's own account of what it looked at) ─
export function coverageYaml(c) {
  const esc = (s) => oneLine(s).replace(/"/g, "'");
  const scalar = (v) => (typeof v === 'number' || typeof v === 'boolean') ? String(v) : (v === null || v === undefined) ? 'null' : `"${esc(v)}"`;
  const out = [
    `# coverage-${c.scanner}.yaml — the scanner's OWN coverage account, archived by tools/ingest.mjs.`,
    `# One row per domain in the scanner's taxonomy: scanned | partial | not-scanned | not-applicable.`,
    `# Renderers read it: an axis this scanner contributes is fully measured only where every`,
    `# mapped domain was scanned; otherwise the axis reads "partially measured", with the note.`,
    `scanner: ${c.scanner}`,
  ];
  const emitMap = (name, m, indent) => {
    const pad = ' '.repeat(indent);
    out.push(`${pad}${name}:`);
    for (const [k, v] of Object.entries(m)) {
      if (v && typeof v === 'object' && !Array.isArray(v)) emitMap(k, v, indent + 2);
      else if (Array.isArray(v)) { out.push(`${pad}  ${k}:`); for (const x of v) out.push(`${pad}    - ${scalar(x)}`); if (!v.length) out[out.length - 1] = `${pad}  ${k}: []`; }
      else out.push(`${pad}  ${k}: ${scalar(v)}`);
    }
  };
  emitMap('review', c.review || {}, 0);
  emitMap('ground_truth', c.ground_truth || {}, 0);
  emitMap('coverage', c.coverage || {}, 0);
  out.push(`prior_not_rechecked: [${(c.prior_not_rechecked || []).map(esc).join(', ')}]`);
  return out.join('\n') + '\n';
}

// ── CLI ──────────────────────────────────────────────────────────────────────
if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  const runDir = args[0];
  const opt = (name) => { const i = args.indexOf(name); return i > -1 ? args[i + 1] : null; };
  const tool = opt('--tool'), rawPath = opt('--raw'), exit = opt('--exit'), start = opt('--start'), stripPrefix = opt('--strip-prefix');
  const exitless = tool && PROFILES[tool] && PROFILES[tool].exitless;
  if (!runDir || !tool || !rawPath || (exit === null && !exitless)) {
    console.error('usage: node tools/ingest.mjs <run-dir> --tool <gitleaks|scorecard|fresh-clone|dependency-scan> --raw <file> --exit <code> [--start F-7xx] [--strip-prefix <target-root>]');
    console.error('usage: node tools/ingest.mjs <run-dir> --tool <gitleaks|scorecard|fresh-clone|repo-census> --raw <file> --exit <code> [--start F-7xx] [--strip-prefix <target-root>]');
    console.error('       node tools/ingest.mjs <run-dir> --tool deep-code-review --raw <machine report .yaml> [--start F-8xx]');
    process.exit(2);
  }
  const evalDir = existsSync(join(runDir, 'eval')) ? join(runDir, 'eval') : runDir;
  const rawText = readFileSync(rawPath, 'utf8');
  let rows, startNote = null;
  let startId = start;
  if (!startId) {
    const ns = nextStart(runDir, tool);
    startId = `F-${ns.start}`;
    startNote = `F-${ns.start}: ${ns.reason}`;
  } else startNote = `${startId}: given on the command line (--start)`;
  try { rows = convert(tool, rawText, exit, startId, { stripPrefix }); }
  catch (e) { console.error(`✗ ingest halted: ${e.message}`); process.exit(1); }
  mkdirSync(join(evalDir, 'raw'), { recursive: true });
  const rawDst = join(evalDir, 'raw', PROFILES[tool].raw || `${tool}.json`);
  if (PROFILES[tool].archive) writeFileSync(rawDst, PROFILES[tool].archive(rawText));
  else copyFileSync(rawPath, rawDst);
  const dst = join(evalDir, PROFILES[tool].file);
  writeFileSync(dst, toYaml(rows, tool, exit, rows.skipped, startNote));
  if (rows.coverage) writeFileSync(join(evalDir, `coverage-${tool}.yaml`), coverageYaml(rows.coverage));
  console.log(`✓ ingested ${rows.length} ${tool} row(s) → ${dst}${rows.coverage ? ` + coverage-${tool}.yaml (${Object.keys(rows.coverage.coverage).length} domain rows)` : ''}${rows.skipped && rows.skipped.length ? ` (${rows.skipped.length} N/A check(s) logged in header)` : ''}${rows.length === 0 ? ` — verified-clean run (${exitless ? 'full coverage, empty findings' : 'success exit, empty report'}), recorded explicitly` : ''}`);
}
