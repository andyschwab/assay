#!/usr/bin/env node
// ingest.mjs — the INSTRUMENT intake: converts a deterministic tool's native
// output into port rows (map/scanners/CONTRACT.md, instrument role).
//
// An instrument is a mechanical enumerator/verifier (a secrets scanner, a repo
// hygiene checker). It never contributes an axis; its rows feed existing ones.
// Two rules make the intake trustworthy (fail loud, never empty):
//
//   1. FAIL LOUD, NEVER EMPTY. The converter requires the tool's own exit code,
//      as digits (an empty --exit is not 0), and halts on anything outside the
//      tool's documented success set or disagreeing with the report — a tool
//      that crashed must never read as "0 findings". Malformed or truncated
//      input halts. A verified-clean run (success exit, empty report) writes an
//      explicit zero-findings file recording that the instrument ran.
//   2. NEVER COPY A SECRET. The gitleaks profile builds observations from rule
//      id + location only; the matched secret value is never written anywhere.
//
// Evidence: file:line where the tool reports one; a repo-level claim (most
// Scorecard checks) cites the archived raw report (run-relative `map/raw/…`),
// which `validate.mjs --target` knows to skip (instrument evidence lives in the
// run, not the target).
//
// A PEER SCANNER with a machine report also comes in here: deep-code-review 1.128+
// (references/machine-report.md; the adapter's min_version) writes findings-YYYY-MM-DD.yaml (block YAML: review / ground_truth / coverage /
// findings). It has no exit code — its fail-loud property is COMPLETENESS: the
// coverage map must carry a row for every domain the adapter's coverage_domains
// lists, every gap row a fix, every non-scanned row a note; anything less halts.
// The coverage rows are archived as map/coverage/<scanner>.yaml so the renderers
// can say "partially measured" where the scanner itself said it looked partially.
//
// The FRESH-CLONE instrument (map/fresh-clone.mjs) also comes in here: its JSON
// document records each declared step's status and each README command claim's
// presence; exits 0 and 1 are both successful runs (1 = a gap exists), a runner
// crash exits 2 and halts. Rows never carry step output — only command + exit code.
//
// The DEPENDENCY-SCAN instrument (map/dependency-scan.mjs) also comes in here:
// its JSON document records each lockfile's audit status and one advisory row
// per (advisory id, package); exits 0 and 1 are both successful runs (1 = an
// advisory, a failed lockfile or one not run exists), a runner crash exits 2
// and halts. A failed lockfile is a gap row; a lockfile nothing audited (failed,
// or not run) is also a lockfile-not-audited fact — never silence, never clean.
//
// The STRUCTURE-SCAN instrument (map/structure-scan.mjs, CONTRACT §3e) also comes in
// here: its JSON document records each tool's status and version and the locations
// and counts read out of their reports; exits 0 and 1 are both successful runs, 2
// halts. A tool skipped or failed is a <category>-not-run fact, never 0 rows.
//
// Usage:
//   node assay.mjs ingest <run-dir> --tool <gitleaks|scorecard|fresh-clone|dependency-scan|repo-census|structure-scan> --raw <file> --exit <code> [--start F-7xx]
//   node assay.mjs ingest <run-dir> --tool deep-code-review --raw <machine report .yaml> [--start F-8xx]
// Writes <run-dir>/map/findings/<tool>.yaml and archives the raw report to
// <run-dir>/map/raw/<tool>.<json|yaml>. Without --start, ids begin at the profile floor or
// the next hundred above the run's highest existing id, whichever is higher (nextStart).
// Library: convert(tool, rawText, exitCode, startId), nextStart(runDir, tool).
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, readdirSync, realpathSync } from 'node:fs';
import { join, resolve, relative, sep, isAbsolute } from 'node:path';
import { isMain } from './doctrine.mjs';
import { parseYaml, q } from '../lib/yaml-min.mjs';
import { loadAdapters } from './project.mjs';
import { findingsDir, findingsPath, coverageDir, coveragePath, rawDir, rawPath as rawArtifactPath, scannersPath } from '../lib/run-layout.mjs';
import { setScannerRow, updateRunRecord } from './record.mjs';
import { stripUserinfo, EVIDENCE_IDS as RC_EVIDENCE_IDS, CHECK_NAMES as RC_CHECKS, CHECK_STATUS as RC_STATUS } from './repo-census.mjs';
import { STEPS as FC_STEPS, STEP_STATUS as FC_STEP_STATUS, CLAIM_STATUS as FC_CLAIM_STATUS } from './fresh-clone.mjs';
import { LOCK_STATUS, SEVERITIES as DS_SEVERITIES } from './dependency-scan.mjs';
import { TOOL_STATUS as SS_TOOL_STATUS, UNUSED_KINDS as SS_UNUSED_KINDS, HISTORY as SS_HISTORY, TEST_PATH as SS_TEST_PATH } from './structure-scan.mjs';

// The routine uploads the whole run, map/raw/ included, as a workflow artifact
// (routine/README.md), so a raw archive is minimised like gitleaks': a tail of a
// tool's own output, which may echo an environment value, is dropped (every key
// named in `keys`, at any depth), and the rest of the document is kept as is.
const dropKeys = (raw, keys) => JSON.parse(raw, (k, v) => (keys.includes(k) ? undefined : v));

// ── tool profiles ────────────────────────────────────────────────────────────
// okExits: the tool's documented success exits (anything else = tool error, halt).
// For gitleaks, 0 = clean and 1 = leaks found are both successful runs.
const PROFILES = {
  gitleaks: {
    startId: 700,
    okExits: [0, 1],
    // the raw archive is LOCATION-ONLY: a gitleaks report carries the matched value in
    // Secret, Match and Line (and the author's name and email); none of it may enter a run
    archive(raw) {
      const leaks = JSON.parse(raw);
      return JSON.stringify(leaks.map((l) => Object.fromEntries(GITLEAKS_ARCHIVE_KEYS.filter((k) => l[k] !== undefined).map((k) => [k, k === 'Commit' ? String(l[k]).slice(0, 12) : l[k]]))), null, 1) + '\n';
    },
    convert(raw, startId, exitCode) {
      const leaks = parseJson(raw, 'gitleaks');
      if (!Array.isArray(leaks)) throw new Error('gitleaks report must be a JSON array');
      // the exit code and the report agree (F-304), as fresh-clone / dependency-scan / repo-census
      // already require: gitleaks exits 1 when it found leaks and 0 when it found none, so an
      // exit 1 over an empty array (a truncated or foreign report) is not a verified-clean run
      if ((exitCode === 1) !== (leaks.length > 0)) throw new Error(`gitleaks exited ${exitCode} but its report holds ${leaks.length} leak(s) — the report does not describe the run it is filed under (exit 1 means leaks found, 0 none)`);
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
    startId: 750,
    okExits: [0],
    // >= 8 strength · 0-7 gap · -1 (N/A) skipped, logged. The gap's severity band is the
    // view's (views/severity.mjs), read from the score in native_id; the row asserts none.
    convert(raw, startId) {
      const rep = parseJson(raw, 'scorecard');
      if (!rep || !Array.isArray(rep.checks)) throw new Error('scorecard report has no checks[] (truncated report?)');
      const rows = /** @type {any} */ ([]); const skipped = [];
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
          evidence: [detailPath || 'map/raw/scorecard.json:1'],
        };
        if (row.polarity === 'gap') {
          row.fix = `Raise the ${c.name} score: follow the check's remediation guidance${c.documentation && c.documentation.url ? ` (${c.documentation.url})` : ''}.`;
        }
        rows.push(row);
      }
      rows.skipped = skipped;
      return rows;
    },
  },
  'fresh-clone': {
    startId: 900,
    // 0 = every declared step passed and every README claim present, at the root AND
    // in every workspace; 1 = at least one step failed / timed out or a claim is
    // missing, anywhere. Both are successful RUNS. A crash of the runner itself exits
    // 2 and halts here.
    okExits: [0, 1],
    // Rows: one `<step>-not-run` FACT per step that was SKIPPED (install broke, so it never
    // ran; the requirements' not_measured_when reads it as not measured, never met);
    // one gap per step that failed / timed out; one gap per NOT-DECLARED lint,
    // typecheck, test, migrate (the floor descriptors are worded so absence is a gap,
    // never clean: no lint script is not a green lint); one gap per MISSING README
    // claim. A passing step yields no row — a clean run is the explicit empty file —
    // except a test step that passed with tests skipped (its `tests` counts, #30): it
    // keeps its status and yields one `test:skipped` gap stating the skipped share.
    // A workspace step COVERED by a passing root step (fresh-clone's covered_by names
    // it) yields no row either: the root's own row already carries that step.
    // NEVER copy step output: the last-40-lines tail (which may echo environment
    // values) stays in the runner's own document; rows carry the command and exit
    // code only, and the archive drops the tails and a URL target's userinfo.
    archive(raw) {
      const rep = dropKeys(raw, ['output_tail']);
      if (rep.target && typeof rep.target.path === 'string') rep.target.path = stripUserinfo(rep.target.path);
      return JSON.stringify(rep, null, 2) + '\n';
    },
    //
    // WORKSPACES: the same rows, once for the
    // root and once per entry in `rep.workspaces` — an npm-workspaces root is not one
    // repository, it is several, and each one's gap is its own row. A workspace row's
    // native_category stays the closed step name (install / build / … / readme-claim
    // — what the adapter maps on); the workspace is carried in `native_id`, prefixed
    // (`apps/x:install:failed`), so two workspaces failing the same step never collide.
    // Evidence is the workspace's own manifest or README (`apps/x/package.json:1`,
    // `apps/x/README.md:12`), never the root's. `rep.workspaces` is optional — a
    // document from before workspace support (no key at all) converts exactly as it always has.
    convert(raw, startId, exitCode) {
      const rep = parseJson(raw, 'fresh-clone');
      if (!rep || typeof rep !== 'object' || Array.isArray(rep)) throw new Error('fresh-clone report must be a JSON object');
      if (rep.tool !== 'fresh-clone') throw new Error(`fresh-clone report carries tool "${rep.tool}" (truncated or not a fresh-clone report?)`);
      if (!Array.isArray(rep.steps) || !Array.isArray(rep.readme_claims)) throw new Error('fresh-clone report has no steps[] / readme_claims[] (truncated report?)');
      if (![0, 1].includes(rep.exit)) throw new Error(`fresh-clone report exit "${rep.exit}" is not 0 | 1 (truncated report?)`);
      if (exitCode !== undefined && exitCode !== null && Number(exitCode) !== rep.exit) throw new Error(`fresh-clone report says exit ${rep.exit} but the runner exited ${exitCode} — the document does not describe the run it is filed under`);
      if (rep.workspaces !== undefined && !Array.isArray(rep.workspaces)) throw new Error('fresh-clone report workspaces must be a list (truncated report?)');
      // app (#35): the directory the runner ran in, relative to its root — every path the
      // document names for that entry (manifest, test config, workspaces) is relative to
      // it, so rows prefix it; `readme` is already named from the root
      if (rep.app !== undefined && !(rep.app && typeof rep.app.path === 'string' && rep.app.path && !rep.app.path.split('/').includes('..'))) throw new Error('fresh-clone report app must carry a path inside the tree (truncated report?)');
      const appDir = rep.app ? `${rep.app.path}/` : '';

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
          // covered: a step this workspace does not declare, reached by a PASSING root step
          // (or, for migrate, owned by the package that declares it) — no row, but only with
          // the covering command recorded; a bare "covered" is unprovable and halts
          if (s.status === 'covered') {
            const by = s.covered_by;
            if (!by || typeof by.path !== 'string' || !by.path || typeof by.command !== 'string' || !by.command) throw new Error(`fresh-clone${ctx.errLabel} step ${s.name}: covered with no covered_by path + command — coverage that names no covering step is not evidence (truncated report?)`);
            continue;
          }
          // skipped (#30, F-1202): the step never ran (install broke), so it is neither a gap nor
          // clean — a fact the fresh-clone requirements' not_measured_when names, so their
          // category reads not measured instead of met by the silence of a step that did not run
          if (s.status === 'skipped') {
            rows.push({
              id: fid(startId + n++),
              source: 'fresh-clone',
              native_id: `${ctx.idPrefix}${s.name}-not-run`,
              native_category: `${s.name}-not-run`,
              polarity: 'fact',
              observation: `Fresh-clone step ${s.name}${ctx.inLabel} did not run${s.reason ? ': ' + oneLine(s.reason) : ''}; nothing was measured about whether a clean checkout can ${FC_VERB[s.name]}${ctx.inLabel}.`,
              evidence: [ctx.manifest],
            });
            continue;
          }
          // test counts (#30): the runner's own summary, or `unparsed`; a passed step that
          // skipped tests keeps its status (the exit code is honest) and gets one row of its own
          if (s.name === 'test' && s.tests !== undefined && s.tests !== 'unparsed') {
            const t = s.tests;
            if (!t || typeof t !== 'object' || !['passed', 'skipped', 'failed', 'total'].every((k) => Number.isInteger(t[k]) && t[k] >= 0)) throw new Error(`fresh-clone${ctx.errLabel} step test: tests must be 'unparsed' or {passed, skipped, failed, total} counts (truncated report?)`);
            if (s.status === 'passed' && t.skipped > 0) {
              const total = Math.max(t.total, t.passed + t.skipped + t.failed);
              rows.push({
                id: fid(startId + n++),
                source: 'fresh-clone',
                native_id: `${ctx.idPrefix}test:skipped`,
                native_category: 'test',
                polarity: 'gap',
                observation: `Fresh-clone step test${ctx.inLabel} passed, but ${t.skipped} of ${total} tests (${Math.round(100 * t.skipped / total)}%) were skipped in a clean checkout (\`${oneLine(s.command || 'test')}\`); the pass covers the ${t.passed + t.failed} that ran, not the suite.`,
                evidence: [s.test_config ? `${ctx.dir}${s.test_config}:1` : ctx.manifest],
                fix: ctx.hasDbSignals ? FC_FIX_SKIPPED_DB : FC_FIX_SKIPPED,
              });
            }
          }
          const cmd = s.command ? ` (\`${oneLine(s.command)}\`` + (Number.isInteger(s.exit_code) ? `, exit ${s.exit_code})` : ')') : '';
          let observation = null;
          if (s.status === 'failed') observation = `Fresh-clone step ${s.name}${ctx.inLabel} failed${cmd}${s.reason ? ': ' + oneLine(s.reason) : ''}; a clean checkout does not ${FC_VERB[s.name]}${ctx.inLabel}.`;
          else if (s.status === 'timed-out') observation = `Fresh-clone step ${s.name}${ctx.inLabel} timed out${cmd}${s.reason ? ' — ' + oneLine(s.reason) : ''}; a clean checkout does not ${FC_VERB[s.name]}${ctx.inLabel} within the run budget.`;
          else if (s.status === 'not-declared' && s.name === 'migrate' && !ctx.hasDbSignals) {
            // no database anywhere in the tree: never a gap, and never silently met either —
            // record the fact that was looked for and not found (yardstick/requirements.yaml
            // d-schema-versioned's not_applicable_when: no-database-signal, decided only from
            // this record, never a packet claim).
            rows.push({
              id: fid(startId + n++),
              source: 'fresh-clone',
              native_id: `${ctx.idPrefix}no-database-signal`,
              native_category: 'no-database-signal',
              polarity: 'fact',
              observation: `No database signal (file or dependency) found${ctx.inLabel} — the migrate step is not applicable, not merely undeclared.`,
              evidence: [ctx.manifest],
            });
            observation = null;
          }
          else if (s.status === 'not-declared' && FC_FLOOR_STEPS.includes(s.name)) observation = `Fresh-clone step ${s.name} is not declared in a runnable form${ctx.inLabel}${s.reason ? ' (' + oneLine(s.reason) + ')' : ''}; nothing in the repository ${FC_DECLARES[s.name]}, so a clean checkout cannot ${FC_VERB[s.name]}${ctx.inLabel}.`;
          if (!observation) continue;
          rows.push({
            id: fid(startId + n++),
            source: 'fresh-clone',
            native_id: `${ctx.idPrefix}${s.name}:${s.status}`,
            native_category: s.name,
            polarity: 'gap',
            observation,
            evidence: [ctx.manifest],
            fix: FC_FIX[s.name],
          });
        }
        for (const s of FC_STEPS) if (!seen.has(s)) throw new Error(`fresh-clone${ctx.errLabel} has no row for step ${s} — a step the runner did not record is not a pass (truncated report?)`);
        for (const c of readmeClaims) {
          if (!c || !Number.isInteger(c.line) || !c.command || !FC_CLAIM_STATUS.includes(c.status)) throw new Error(`fresh-clone${ctx.errLabel} README claim missing line / command / status (truncated report?)`);
          if (c.status === 'present') continue;
          if (c.status !== 'missing') throw new Error(`fresh-clone${ctx.errLabel} README claim: ingest has no case for status "${c.status}"`);
          rows.push({
            id: fid(startId + n++),
            source: 'fresh-clone',
            native_id: `${ctx.idPrefix}readme-claim@${ctx.readme}:${c.line}`,
            native_category: 'readme-claim',
            polarity: 'gap',
            observation: `README claims \`${oneLine(c.command)}\` (${ctx.readme}:${c.line})${ctx.inLabel} but the ${FC_CLAIM_NOUN[c.kind] || 'target'} it names does not exist in the tree; the README is not true of this checkout at that line.`,
            evidence: [`${ctx.readme}:${c.line}`],
            fix: `Make the README true: add the ${FC_CLAIM_NOUN[c.kind] || 'target'} the line claims, or correct the line to the command that exists; re-run fresh-clone and confirm the claim reads present.`,
          });
        }
      };

      // the root's "no database signal" is a claim about the whole tree: a monorepo whose
      // database dependency sits in a workspace (apps/web → @prisma/client) has one, and
      // reading only the root manifest would record a false not-applicable fact
      const hasSignals = (tc) => Array.isArray(tc && tc.database_signals) && tc.database_signals.length > 0;
      const rootDbSignals = hasSignals(rep.toolchain) || (Array.isArray(rep.workspaces) && rep.workspaces.some((w) => w && hasSignals(w.toolchain)));
      emitEntry(rep.steps, rep.readme_claims, {
        idPrefix: '', inLabel: rep.app ? ` in ${rep.app.path}` : '', errLabel: '', dir: appDir,
        manifest: (rep.toolchain && rep.toolchain.manifest) ? `${appDir}${rep.toolchain.manifest}:1` : 'map/raw/fresh-clone.json:1',
        readme: rep.readme || 'README.md',
        hasDbSignals: rootDbSignals,
      });

      for (const w of rep.workspaces || []) {
        if (!w || typeof w.path !== 'string' || !w.path) throw new Error('fresh-clone workspace entry missing path (truncated report?)');
        if (!Array.isArray(w.steps)) throw new Error(`fresh-clone workspace ${w.path} has no steps[] (truncated report?)`);
        if (!Array.isArray(w.readme_claims)) throw new Error(`fresh-clone workspace ${w.path} has no readme_claims[] (truncated report?)`);
        const wp = `${appDir}${w.path}`;
        const wDbSignals = Array.isArray(w.toolchain && w.toolchain.database_signals) && w.toolchain.database_signals.length > 0;
        emitEntry(w.steps, w.readme_claims, {
          idPrefix: `${wp}:`, inLabel: ` in workspace ${wp}`, errLabel: ` workspace ${wp}`, dir: `${wp}/`,
          manifest: (w.toolchain && w.toolchain.manifest) ? `${wp}/${w.toolchain.manifest}:1` : `${wp}/package.json:1`,
          readme: `${wp}/${w.readme || 'README.md'}`,
          hasDbSignals: wDbSignals,
        });
      }

      return rows;
    },
  },
  'dependency-scan': {
    startId: 950,
    // a failed audit's stderr tail (which may echo environment values) stays out of map/raw/
    archive: (raw) => JSON.stringify(dropKeys(raw, ['stderr_tail']), null, 2) + '\n',
    // 0 = every lockfile in the tree audited with zero advisories; 1 = any advisory,
    // any failed lockfile, or any lockfile not run. Both are
    // successful RUNS. A crash of the runner itself exits 2 and halts.
    okExits: [0, 1],
    // Rows: one gap per advisory (category = its severity — critical | high |
    // moderate | low | info), from npm, pnpm or yarn audit alike; one gap (category
    // lockfile-failed) per lockfile an audit could not complete against (a tool
    // error is never a clean lockfile); and for every lockfile nothing audited —
    // failed, or not-run because its package manager is unavailable (the
    // instrument's limit, so no gap against the target) — one FACT
    // (lockfile-not-audited) that holds d-dependencies-known-clean at not-measured.
    // A clean audited lockfile with no advisories yields no row — a clean run is
    // the explicit empty file.
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
        const mgr = lf.manager || 'npm';
        // a lockfile nothing audited is never clean: one FACT row per such lockfile, which
        // holds d-dependencies-known-clean at not-measured (decide.not_measured_when) unless a
        // real critical advisory elsewhere already decides it — without it, a run whose only
        // lockfile went unaudited read "met" (no critical rows)
        const notAudited = (why) => rows.push({
          id: fid(startId + n++), source: 'dependency-scan',
          native_id: `lockfile-not-audited@${lf.path}`, native_category: 'lockfile-not-audited', polarity: 'fact',
          observation: `${lf.path} (${mgr}) was not audited: ${why}. Nothing read it for advisories, so it is not known clean.`,
          evidence,
        });
        if (lf.status === 'failed') {
          const code = Number.isInteger(lf.npm_exit_code) ? lf.npm_exit_code : Number.isInteger(lf.exit_code) ? lf.exit_code : null;
          rows.push({
            id: fid(startId + n++), source: 'dependency-scan',
            native_id: `lockfile-failed@${lf.path}`, native_category: 'lockfile-failed', polarity: 'gap',
            observation: `dependency-scan could not audit ${lf.path}${code !== null ? ` (${mgr} audit exited ${code})` : ''}${lf.reason ? ': ' + oneLine(lf.reason) : ''}; a tool error is never read as a clean lockfile.`,
            evidence,
            fix: `Fix what is blocking ${mgr} audit against ${lf.path} (registry reachability, a malformed lockfile, or a workspace root the package manager cannot resolve) and re-run dependency-scan until it reads audited.`,
          });
          notAudited(`the ${mgr} audit failed${lf.reason ? ' (' + oneLine(lf.reason) + ')' : ''}`);
          continue;
        }
        if (lf.status === 'not-run' || lf.status === 'not-supported') {
          // the instrument's limit (its package manager unavailable, an unsupported lockfile
          // format), not the target's: a fact, never a gap severity-rated against the repository
          notAudited(lf.reason ? oneLine(lf.reason) : `dependency-scan did not run ${mgr} audit on it`);
          continue;
        }
        if (lf.status !== 'audited') throw new Error(`dependency-scan lockfile ${lf.path}: ingest has no case for status "${lf.status}"`);
        if (!Array.isArray(lf.advisories)) throw new Error(`dependency-scan lockfile ${lf.path}: audited status but no advisories[] (truncated report?)`);
        for (const a of lf.advisories) {
          for (const k of ['id', 'package', 'severity']) if (!a || !a[k]) throw new Error(`dependency-scan advisory in ${lf.path} missing ${k} (truncated report?)`);
          if (!DS_SEVERITIES.includes(a.severity)) throw new Error(`dependency-scan advisory ${a.id}@${a.package}: severity "${a.severity}" is not one of ${DS_SEVERITIES.join(' | ')}`);
          rows.push({
            id: fid(startId + n++), source: 'dependency-scan',
            native_id: `${a.id}@${a.package}@${lf.path}`, native_category: a.severity, polarity: 'gap',
            observation: `${a.package}${a.installed ? ` (installed ${oneLine(a.installed)})` : ''} in ${lf.path} is vulnerable to ${a.id} (${a.severity}${a.range ? `, range ${oneLine(a.range)}` : ''})${a.url ? ` — ${a.url}` : ''}.`,
            evidence,
            fix: `Upgrade ${a.package} to a version outside ${a.range ? oneLine(a.range) : 'the vulnerable range'} (${mgr} audit reports a fix available: ${a.fix_available ? 'yes' : 'no'}) and regenerate ${lf.path}; re-run dependency-scan and confirm the advisory is gone.`,
          });
        }
      }
      // manifests: a package.json declaring dependencies with no lockfile covering it
      // is a FACT, not a gap — zero lockfiles audited is never clean, but it is not the
      // same claim as a known advisory either. Decides d-dependencies-known-clean
      // not-measured via decide.not_measured_when: no-lockfile (yardstick/measure.mjs).
      if (rep.manifests !== undefined) {
        if (!Array.isArray(rep.manifests)) throw new Error('dependency-scan report manifests must be a list (truncated report?)');
        for (const m of rep.manifests) {
          if (!m || typeof m.path !== 'string' || !m.path) throw new Error('dependency-scan manifest row missing path (truncated report?)');
          if (m.status !== 'no-lockfile') throw new Error(`dependency-scan manifest ${m.path}: status "${m.status}" is not "no-lockfile" (truncated report?)`);
          rows.push({
            id: fid(startId + n++), source: 'dependency-scan',
            native_id: `no-lockfile@${m.path}`, native_category: 'no-lockfile', polarity: 'fact',
            observation: m.unparseable === true
              ? `${m.path} could not be parsed as JSON, so it may declare dependencies, and no lockfile (npm, pnpm, or yarn) covers it — no lockfile: nothing audited it.`
              : `${m.path} declares dependencies but no lockfile (npm, pnpm, or yarn) covers it — no lockfile: nothing to audit.`,
            evidence: [`${m.path}:1`],
          });
        }
      }
      // noManifest: zero package.json anywhere in the tree — a different fact from "a
      // manifest with no lockfile": there is no dependency graph at all. Decides
      // d-dependencies-known-clean not-applicable via decide.not_applicable_when: no-manifest.
      if (rep.noManifest === true) {
        rows.push({
          id: fid(startId + n++), source: 'dependency-scan',
          native_id: 'no-manifest', native_category: 'no-manifest', polarity: 'fact',
          observation: 'No package.json anywhere in the tree — there is no dependency graph to audit.',
          evidence: ['./:1'],
        });
      }
      return rows;
    },
  },
  'repo-census': {
    startId: 960,
    // 0 = every check passed (or was not-applicable); 1 = at least one check is a gap.
    // Both are successful RUNS. A crash of the runner itself exits 2 and halts here.
    okExits: [0, 1],
    // Rows: one gap row per `gap` check, one strength row per `pass` check (so the
    // axis sees the evidence, not just the absence of a gap), one FACT row (its own
    // `<check>-unverifiable` category) per `not-measured` check (the checkout could
    // not confirm a transcript's commit either way — never silently "clean"), and one
    // FACT row (its own `<check>-not-applicable` category) per `not-applicable` check
    // (no deployment signal in the tree — the yardstick reads the row not-applicable
    // from it; dropping it would read met by silence). native_id is `<check name>@<location>` (location is the
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
        if (typeof c.observation !== 'string' || !c.observation.trim()) throw new Error(`repo-census check ${c.name}: missing observation (truncated report?)`);
        const location = (c.detail && typeof c.detail.path === 'string' && c.detail.path) || '.';
        const nativeLoc = location === '.' ? 'root' : location;
        // a census before assay PR #15 cited the root as ":1" (a line of no file); an archived
        // raw report from then re-ingests with the root named, "./:1", never an empty path
        const evidence = Array.isArray(c.evidence) && c.evidence.length ? c.evidence.map((e) => String(e).replace(/^:(\d+)$/, './:$1')) : [`${location}/:1`];
        const failOpen = Array.isArray(c.detail && c.detail.failOpen) ? c.detail.failOpen : [];
        if (c.status === 'gap') {
          rows.push({
            id: fid(startId + n++),
            source: 'repo-census',
            native_id: `${c.name}@${nativeLoc}`,
            native_category: c.name,
            polarity: 'gap',
            ...(c.name === 'ci-gate' && failOpen.length ? { fail_open: true } : {}),
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
        } else if (c.status === 'not-measured') {
          // a FACT row, in its own category (never the check's own — a category the
          // yardstick decides must carry no rows for its not_measured_when condition
          // to fire; see yardstick/measure.mjs and yardstick/requirements.yaml's six
          // evidence-<id> rows): the checkout could not confirm the transcript's
          // commit either way (no .git, or too shallow), so nothing was decided.
          rows.push({
            id: fid(startId + n++),
            source: 'repo-census',
            native_id: `${c.name}@${nativeLoc}`,
            native_category: `${c.name}-unverifiable`,
            polarity: 'fact',
            observation: oneLine(c.observation),
            evidence,
          });
        } else if (c.status === 'not-applicable') {
          // a FACT row, in its own category (same reason as -unverifiable): the census
          // looked for a deployment signal anywhere in the tree and found none.
          rows.push({
            id: fid(startId + n++),
            source: 'repo-census',
            native_id: `${c.name}@${nativeLoc}`,
            native_category: `${c.name}-not-applicable`,
            polarity: 'fact',
            observation: oneLine(c.observation),
            evidence,
          });
        }
      }
      return rows;
    },
  },
  'structure-scan': {
    startId: 970,
    // the document already holds each tool's report less code text; a failed tool's own
    // reason stays, and nothing else is copied out of it into a row
    archive: (raw) => JSON.stringify(dropKeys(raw, ['fragment']), null, 2) + '\n',
    // 0 = every tool ran (or is not-applicable) and nothing was found; 1 = a finding, or a
    // tool skipped or failed. Both are successful RUNS. A crash of the runner exits 2 and halts.
    // jscpd itself is run with no --threshold / --exit-code, so its findings never change
    // its exit (its success set is 0); knip's is 0 clean, 1 issues — the runner holds both.
    okExits: [0, 1],
    // Rows: one gap per clone pair (`duplicate`, both locations as evidence, line and token
    // counts in detail), one gap per unused file / export / dependency (`unused`), one gap
    // per stale artifact (`stale-artifact`); one FACT per tool that did not run
    // (`duplicate-not-run`, `unused-not-run`: skipped or failed, with the reason), and one
    // FACT when there is no package.json knip can run in (`unused-not-applicable`, its reason) — never silence, never
    // clean. Every finding row's detail carries churn_90d (commits touching its file, the
    // larger of a pair's two) or, with no history to read, `history: shallow | none`; a pair
    // with both copies under a test path says `test: true`. A jscpd that ran with its totals
    // recorded yields one FACT (`duplicate-statistics`: lines, duplicated lines, percentage,
    // source files) — the denominator, never a verdict.
    // Rows carry locations and counts only, never a severity (the views band) and never code.
    convert(raw, startId, exitCode) {
      const rep = parseJson(raw, 'structure-scan');
      if (!rep || typeof rep !== 'object' || Array.isArray(rep)) throw new Error('structure-scan report must be a JSON object');
      if (rep.tool !== 'structure-scan') throw new Error(`structure-scan report carries tool "${rep.tool}" (truncated or not a structure-scan report?)`);
      if (![0, 1].includes(rep.exit)) throw new Error(`structure-scan report exit "${rep.exit}" is not 0 | 1 (truncated report?)`);
      if (exitCode !== undefined && exitCode !== null && Number(exitCode) !== rep.exit) throw new Error(`structure-scan report says exit ${rep.exit} but the runner exited ${exitCode} — the document does not describe the run it is filed under`);
      if (!rep.tools || typeof rep.tools !== 'object') throw new Error('structure-scan report has no tools record (truncated report?)');
      for (const k of ['duplicates', 'unused', 'stale']) if (!Array.isArray(rep[k])) throw new Error(`structure-scan report has no ${k}[] (truncated report?)`);
      if (!SS_HISTORY.includes(rep.history)) throw new Error(`structure-scan report history "${rep.history}" is not one of ${SS_HISTORY.join(' | ')}`);
      for (const t of ['jscpd', 'knip']) {
        const s = rep.tools[t];
        if (!s || !SS_TOOL_STATUS.includes(s.status)) throw new Error(`structure-scan tool ${t}: status "${s && s.status}" is not one of ${SS_TOOL_STATUS.join(' | ')}`);
        if (s.status !== 'ran' && !(typeof s.reason === 'string' && s.reason.trim())) throw new Error(`structure-scan tool ${t} is ${s.status} with no reason — a skip without one is indistinguishable from an omission`);
      }
      if (rep.tools.jscpd.status !== 'ran' && rep.duplicates.length) throw new Error('structure-scan report lists duplicates from a jscpd that did not run');
      if (rep.tools.knip.status !== 'ran' && rep.unused.length) throw new Error('structure-scan report lists unused items from a knip that did not run');
      const found = rep.duplicates.length + rep.unused.length + rep.stale.length;
      const notRun = ['jscpd', 'knip'].some((t) => ['skipped', 'failed'].includes(rep.tools[t].status));
      if ((found > 0 || notRun) !== (rep.exit === 1)) throw new Error(`structure-scan report exit ${rep.exit} disagrees with its own content (${found} finding(s), ${notRun ? 'a tool not run' : 'every tool ran'})`);
      const churn = (rep.churn && typeof rep.churn === 'object') ? rep.churn : {};
      const detailFor = (files, extra) => ({ ...extra, ...(rep.history === 'full' ? { churn_90d: Math.max(0, ...files.map((f) => Number.isInteger(churn[f]) ? churn[f] : 0)) } : { history: rep.history }) });
      const loc = (x, at) => {
        if (!x || typeof x.file !== 'string' || !x.file || !Number.isInteger(x.start)) throw new Error(`structure-scan ${at} missing file / start line (truncated report?)`);
        return x;
      };
      const rows = []; let n = 0;
      for (const d of rep.duplicates) {
        const a = loc(d && d.a, 'duplicate first location'), b = loc(d && d.b, 'duplicate second location');
        rows.push({
          id: fid(startId + n++), source: 'structure-scan',
          native_id: `duplicate@${a.file}:${a.start}-${a.end}@${b.file}:${b.start}-${b.end}`, native_category: 'duplicate', polarity: 'gap',
          observation: `${a.file}:${a.start}-${a.end} and ${b.file}:${b.start}-${b.end} carry the same block${Number.isInteger(d.lines) ? ` (${d.lines} lines` + (Number.isInteger(d.tokens) ? `, ${d.tokens} tokens)` : ')') : ''}, found by jscpd ${rep.tools.jscpd.version || ''}`.trimEnd() + '; a change to one copy has to be made twice.',
          evidence: [`${a.file}:${a.start}`, `${b.file}:${b.start}`],
          fix: 'Extract the duplicated block into one function or module both locations call (or delete the copy that is not used); re-run structure-scan and confirm the pair is gone.',
          detail: detailFor([a.file, b.file], { lines: d.lines, tokens: d.tokens, ...(SS_TEST_PATH.test(a.file) && SS_TEST_PATH.test(b.file) ? { test: true } : {}) }),
        });
      }
      // knip's files, exports, types and members are evidence only where the target names its
      // entry points (#121): with no knip configuration the row stays, flagged unconfigured.
      if (rep.unused.length && !(rep.tools.knip.config === null || (typeof rep.tools.knip.config === 'string' && rep.tools.knip.config))) throw new Error('structure-scan report lists unused items but its knip record does not say whether the target configures knip (config: a file name or null)');
      for (const u of rep.unused) {
        if (!u || typeof u.file !== 'string' || !u.file || typeof u.name !== 'string' || !SS_UNUSED_KINDS.includes(u.kind)) throw new Error('structure-scan unused item missing file / name / a known kind (truncated report?)');
        const line = Number.isInteger(u.line) ? u.line : 1;
        rows.push({
          id: fid(startId + n++), source: 'structure-scan',
          native_id: `unused-${u.kind}@${u.file}:${u.name}`, native_category: 'unused', polarity: 'gap',
          observation: `${SS_UNUSED_NOUN[u.kind]} \`${oneLine(u.name)}\` in ${u.file} is not used anywhere in the project, found by knip ${rep.tools.knip.version || ''}`.trimEnd() + '.',
          evidence: [`${u.file}:${line}`],
          fix: `Remove the unused ${SS_UNUSED_NOUN[u.kind].toLowerCase()} (or, when it is a public entry point, declare it in knip's configuration); re-run structure-scan and confirm it no longer reads unused.`,
          detail: detailFor([u.file], { kind: u.kind, name: u.name, ...(rep.tools.knip.config === null && SS_ENTRY_KINDS.includes(u.kind) ? { unconfigured: true } : {}) }),
        });
      }
      for (const s of rep.stale) {
        if (!s || typeof s.file !== 'string' || !s.file || typeof s.pattern !== 'string') throw new Error('structure-scan stale artifact missing file / pattern (truncated report?)');
        rows.push({
          id: fid(startId + n++), source: 'structure-scan',
          native_id: `stale-artifact@${s.file}`, native_category: 'stale-artifact', polarity: 'gap',
          observation: `${s.file} is tracked under a name that says it is abandoned (${s.pattern}${s.newer ? `, beside ${s.newer}` : ''}).`,
          evidence: [`${s.file}:1`],
          fix: 'Delete the stale file (version history keeps it), or rename it if it is still live; re-run structure-scan and confirm it is gone.',
          detail: detailFor([s.file], { pattern: s.pattern, ...(s.newer ? { newer: s.newer } : {}) }),
        });
      }
      const st = rep.tools.jscpd.status === 'ran' ? rep.tools.jscpd.statistics : undefined;
      if (st !== undefined) {
        if (!st || !['lines', 'duplicated_lines', 'percentage', 'sources'].every((k) => typeof st[k] === 'number' && Number.isFinite(st[k]))) throw new Error('structure-scan jscpd statistics missing lines / duplicated_lines / percentage / sources (truncated report?)');
        rows.push({
          id: fid(startId + n++), source: 'structure-scan',
          native_id: 'duplicate-statistics', native_category: 'duplicate-statistics', polarity: 'fact',
          observation: `jscpd ${rep.tools.jscpd.version || ''}`.trimEnd() + ` read ${st.sources} source file(s), ${st.lines} line(s), of which ${st.duplicated_lines} (${st.percentage}%) sit in a clone pair; lockfiles, data files, prose and generated output are out of its scope.`,
          evidence: ['map/raw/structure-scan.json:1'],
          detail: { lines: st.lines, duplicated_lines: st.duplicated_lines, percentage: st.percentage, sources: st.sources },
        });
      }
      for (const [t, cat, what] of [['jscpd', 'duplicate', 'duplicated code'], ['knip', 'unused', 'unused files, exports and dependencies']]) {
        const s = rep.tools[t];
        if (s.status === 'skipped' || s.status === 'failed') {
          rows.push({
            id: fid(startId + n++), source: 'structure-scan',
            native_id: `${cat}-not-run`, native_category: `${cat}-not-run`, polarity: 'fact',
            observation: `${t} ${s.status}: ${oneLine(s.reason)}. Nothing measured ${what} in this run, so none found is not none present.`,
            evidence: ['map/raw/structure-scan.json:1'],
          });
        } else if (s.status === 'not-applicable') {
          rows.push({
            id: fid(startId + n++), source: 'structure-scan',
            native_id: `${cat}-not-applicable`, native_category: `${cat}-not-applicable`, polarity: 'fact',
            observation: `${t} not applicable: ${oneLine(s.reason)}. There is no JavaScript project for it to read ${what} from.`,
            evidence: ['./:1'],
          });
        }
      }
      return rows;
    },
  },
};
const RC_FIX = {
  'architecture-page': 'Add a page (ARCHITECTURE.md, docs/ARCHITECTURE.md, or a README "Architecture" section) that names every external service and data store the target depends on (database, queue, API, service, store, bucket, provider); a diagram is a bonus, not a substitute. Re-run repo-census and confirm it reads pass.',
  'agent-contract': 'Make the agent contract (AGENTS.md or CLAUDE.md) present-tense: move any Status / History / Changelog / Todo / Backlog section and dated changelog lines to a separate, co-located history file. Re-run repo-census and confirm it reads pass.',
  'runbook': 'Add the missing procedure(s) to the runbook (RUNBOOK.md, docs/RUNBOOK.md, or a README/doc "Runbook"/"Operations" section) — a heading or paragraph for restart, roll back, rotate a key/secret/credential, and restore from backup. Re-run repo-census and confirm it reads pass. (This decides presence only; run each procedure once and record that separately.)',
  'ci-gate': 'Add or fix a workflow that triggers on pull_request (or push to the default branch) and runs a test/lint/typecheck/build step with no `continue-on-error: true` on that step or its job. Re-run repo-census and confirm it reads pass.',
  ...Object.fromEntries(RC_EVIDENCE_IDS.map((id) => [`evidence-${id}`,
    `Run the procedure; a person or CI writes this file from its real output — an agent must never write it. The resulting transcript at ops/evidence/${id}.md (or docs/evidence/${id}.md) needs the required frontmatter keys (owner/evidence/README.md), a body with a fenced code block and at least 5 non-empty lines, a commit that resolves in the checkout's history, and a date inside the freshness window. Re-run repo-census and confirm it reads pass.`])),
};
const COVERAGE_STATUS = ['scanned', 'partial', 'not-scanned', 'not-applicable'];
// the only gitleaks fields a run may keep (never Secret, Match, Line, Author, Email, Message)
const GITLEAKS_ARCHIVE_KEYS = ['RuleID', 'Description', 'File', 'StartLine', 'EndLine', 'StartColumn', 'EndColumn', 'Commit', 'Date', 'Fingerprint', 'Entropy', 'Tags'];
// the instruments' closed vocabularies are imported from the producers above (#80); a report
// outside them is truncated or foreign. not-supported: dependency-scan documents from before 0.2.0
const DS_STATUS = [...LOCK_STATUS, 'not-supported'];
// the unused kinds knip can only read right when it knows the entry points; a declared
// dependency nothing imports is unused whatever the dispatch style
const SS_ENTRY_KINDS = ['files', 'exports', 'types', 'enumMembers', 'namespaceMembers', 'classMembers'];
const SS_UNUSED_NOUN = { files: 'File', dependencies: 'Dependency', devDependencies: 'Dev dependency', optionalPeerDependencies: 'Optional peer dependency', exports: 'Export', types: 'Exported type', enumMembers: 'Enum member', namespaceMembers: 'Namespace member', classMembers: 'Class member' };
// not declared ⇒ a gap (absence is not clean, the same rule lint/typecheck/test
// already held — undeclared meant met for build alone until this fixed the
// inconsistency); migrate only where the tree carries database signals (see
// hasDbSignals below — with none anywhere, it is not-applicable, never a gap).
const FC_FLOOR_STEPS = ['build', 'lint', 'typecheck', 'test', 'migrate'];
const FC_VERB = { install: 'install its dependencies', build: 'build', lint: 'lint clean', typecheck: 'typecheck clean', test: 'run its tests', migrate: 'replay its migrations from empty' };
const FC_DECLARES = { build: 'declares a build step', lint: 'declares a lint gate', typecheck: 'declares a typecheck gate', test: 'declares a test command', migrate: 'declares a migration command that can run without a live database' };
const FC_FIX = {
  install: 'Make the install reproducible from a clean checkout: commit the lockfile, declare the toolchain (engines / .nvmrc / .tool-versions), and remove any dependency on machine-local state; re-run fresh-clone and confirm install passes.',
  build: 'Make the build pass from a clean checkout with the declared toolchain (no uncommitted generated files, no machine-local paths); re-run fresh-clone and confirm build passes.',
  lint: 'Declare a lint script in the package manifest that runs the linter and exits non-zero on a violation, and wire it into CI; re-run fresh-clone and confirm lint passes.',
  typecheck: 'Declare a typecheck script in the package manifest (tsc --noEmit or the stack equivalent) that exits non-zero on a type error, and wire it into CI; re-run fresh-clone and confirm typecheck passes.',
  test: 'Declare a test script that executes the suite\'s core on a clean machine without an unset variable silently skipping it, and make it pass; re-run fresh-clone and confirm test passes.',
  migrate: 'Declare a migration command that replays from an empty database, with a DATABASE_URL-free dry form (migrate:dry / migrate:check / --dry-run) the fresh-clone run can exercise; re-run fresh-clone and confirm migrate passes.',
};
const FC_FIX_SKIPPED = 'Make the skipped tests run from a clean checkout: give them what they skip without (a service, a variable, a fixture) through a declared script the clean clone can run, or CI\'s service container, and stop gating them on an unset variable; re-run fresh-clone and confirm the test step reports no skipped tests.';
const FC_FIX_SKIPPED_DB = 'Make the skipped tests run from a clean checkout: they need a database, so declare a test:db script that starts one (a container or an embedded database) and points the suite at it, or give CI a database service container; re-run fresh-clone and confirm the test step reports no skipped tests.';
const FC_CLAIM_NOUN = { 'npm-script': 'package script', 'npx-bin': 'binary (a dependency or own bin)', 'node-file': 'file', 'make-target': 'make target' };
// the scanner's confidence labels → the port's closed vocab (SCHEMA §2)
const DCR_CONFIDENCE = { CONFIRMED: 'confirmed', CORROBORATED: 'confirmed', PLAUSIBLE: 'plausible', unverified: 'unverified' };
const DCR_PRIOR_STATUS = ['fixed', 'still-open', 'changed'];
// dotted numeric versions ("1.128.0"): true when a sorts before b
const versionBelow = (a, b) => {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  if (pa.some(Number.isNaN)) throw new Error(`machine report skill_version "${a}" is not a dotted version`);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d < 0; }
  return false;
};

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

// ── scope (#35, from #37): the root an instrument ran at, against the run's target ──
// fresh-clone, dependency-scan and repo-census name their root (`target.path`) and cite
// paths relative to it. Run in a directory inside the run's target (fresh-clone
// <target>/app), their evidence is rebased onto the target (`package.json:1` →
// `app/package.json:1`), which is what `validate --target` reads. Run at a root that is
// neither the target nor inside it, the rows are kept as written and the scope is
// returned `outside` for the caller to warn on: a component-scoped run over a subtree
// is normal, so this never halts. A URL root names no place here and is not compared.
const SCOPED = ['fresh-clone', 'dependency-scan', 'repo-census'];
function scopeOf(tool, rawText, target) {
  if (!target || !SCOPED.includes(tool)) return null;
  let root = null;
  try { root = JSON.parse(rawText).target.path; } catch { return null; }
  if (typeof root !== 'string' || !root || /^(?:[a-z][\w+.-]*:\/\/|[\w.-]+@[\w.-]+:)/i.test(root)) return null;
  const real = (p) => { try { return realpathSync(p); } catch { return resolve(p); } };
  const rel = relative(real(target), real(root)).split(sep).join('/');
  const at = { root: resolve(root), target: resolve(target) };
  if (!rel) return { ...at, relation: 'same', prefix: null };
  if (rel === '..' || rel.startsWith('../') || isAbsolute(rel)) return { ...at, relation: 'outside', prefix: null };
  return { ...at, relation: 'inside', prefix: rel };
}
// a run-relative raw-report citation stays; the instrument's own root (`./:1`) becomes the prefix's
const rebase = (prefix) => (e) => String(e).startsWith('map/raw/') ? e : String(e).startsWith('./:') ? `${prefix}/${String(e).slice(2)}` : `${prefix}/${String(e).replace(/^\.\//, '')}`;

// ── convert (library) ────────────────────────────────────────────────────────
// opts.stripPrefix: an absolute target-root prefix to strip from tool-reported
// paths, so evidence lands target-relative (what `validate.mjs --target` checks).
// opts.target: the run's target root; the rows carry `scope` (scopeOf) and are rebased
// when the instrument ran inside it.
export function convert(tool, rawText, exitCode, startId = null, opts = {}) {
  const p = profileOf(tool);
  if (!p.exitless) {
    // the raw digits only (F-1215): Number('') and Number(' ') are 0, so `--exit "$code"` with
    // an unset variable would file an empty report as a verified-clean run; 0x1, 1e0, 1.0 and
    // +1 are not what a shell's $? prints either
    if (!/^\d+$/.test(String(exitCode))) throw new Error(`--exit must be the tool's actual exit code, as digits (got ${JSON.stringify(exitCode)}; fail-loud: a run without one cannot be trusted)`);
    const code = Number(exitCode);
    if (!p.okExits.includes(code)) throw new Error(`${tool} exited ${code}, outside its success set [${p.okExits.join(', ')}] — a tool error must never read as "0 findings"`);
  }
  const start = startId ? Number(String(startId).replace(/^F-/, '')) : p.startId;
  const rows = p.convert(rawText, start, p.exitless ? null : Number(exitCode));
  if (opts.stripPrefix) {
    const pre = opts.stripPrefix.endsWith('/') ? opts.stripPrefix : opts.stripPrefix + '/';
    const strip = (s) => String(s).split(pre).join('');
    for (const r of rows) { r.evidence = r.evidence.map(strip); r.native_id = strip(r.native_id); }
  }
  const scope = scopeOf(tool, rawText, opts.target);
  if (scope) {
    rows.scope = scope;
    if (scope.relation === 'inside') for (const r of rows) r.evidence = r.evidence.map(rebase(scope.prefix));
  }
  return rows;
}

// ── ingest formats a scanner's adapter selects (CONTRACT.md §3) ───────────────
// A scanner with no built-in profile above is ingested by the format its adapter's
// `ingest:` names; the adapter supplies what the format needs to know about the
// scanner (the review.tool value it accepts, the id floor), so the core names none.
// machine-report: a reviewer's machine report (block YAML: review / ground_truth /
// coverage / findings), checked complete against the adapter's coverage_domains.
const FORMATS = {
  'machine-report': (id, adapter) => ({
    raw: `${id}.yaml`,
    startId: Number(adapter.ingest.start_id),
    exitless: true,      // an LLM skill's machine report: completeness, not an exit code, is the fail-loud property
    convert(raw, startId) {
      let rep;
      try { rep = parseYaml(raw); }
      catch (e) { throw new Error(`${id} machine report is not block-style YAML (fail-closed): ${e.message.slice(0, 80)}`); }
      if (!rep || typeof rep !== 'object' || Array.isArray(rep)) throw new Error(`${id} machine report must be a top-level map (review / ground_truth / coverage / findings)`);
      const domains = adapter.coverage_domains || [];
      if (!domains.length) throw new Error(`adapters/${id}.yaml carries no coverage_domains — cannot judge completeness (fail-closed)`);
      // the run header says which scanner and which contract wrote the file; a report
      // from another tool, or from before the machine-report format existed, halts
      const head = (rep.review && typeof rep.review === 'object') ? rep.review : null;
      if (!head) throw new Error('machine report has no review: header — the file does not say which scanner or skill version wrote it');
      if (head.tool !== adapter.ingest.tool) throw new Error(`machine report review.tool is "${head.tool}", not ${adapter.ingest.tool} (adapters/${id}.yaml ingest.tool)`);
      if (!head.skill_version) throw new Error('machine report review.skill_version is missing — the contract a report follows is read from its version');
      if (adapter.min_version && versionBelow(String(head.skill_version), String(adapter.min_version))) throw new Error(`machine report skill_version ${head.skill_version} predates the machine-report contract (${adapter.min_version}+)`);
      const cov = rep.coverage;
      if (!cov || typeof cov !== 'object' || Array.isArray(cov)) throw new Error('machine report has no coverage: map — a report that does not say what it looked at is not a report (a public committed copy withholds coverage; ingest the out-of-tree report)');
      const missing = domains.filter((l) => !cov[l] || typeof cov[l] !== 'object');
      if (missing.length) throw new Error(`coverage incomplete: no row for domain(s) ${missing.join(', ')} — absence of a row is not clean`);
      for (const [l, row] of Object.entries(cov)) {
        if (!COVERAGE_STATUS.includes(row.status)) throw new Error(`coverage.${l}: bad status "${row.status}" (scanned | partial | not-scanned | not-applicable)`);
        if (row.status !== 'scanned' && !(row.note && String(row.note).trim())) throw new Error(`coverage.${l}: ${row.status} needs a note — a skip without one is indistinguishable from an omission`);
      }
      if (!Array.isArray(rep.findings)) throw new Error('machine report findings: must be a list (an empty list with full coverage is a recorded clean run)');
      const rows = /** @type {any} */ ([]); let n = 0;
      for (const f of rep.findings) {
        const at = `finding ${(f && f.id) || '#' + (n + 1)}`;
        if (!f || typeof f !== 'object') throw new Error(`${at}: not a map`);
        for (const k of ['id', 'area', 'polarity', 'observation', 'evidence']) if (f[k] === undefined || f[k] === null || f[k] === '') throw new Error(`${at}: missing ${k}`);
        if (!['gap', 'strength'].includes(f.polarity)) throw new Error(`${at}: bad polarity "${f.polarity}" (gap | strength)`);
        if (!Array.isArray(f.evidence) || !f.evidence.length) throw new Error(`${at}: evidence must be a non-empty list of file:line`);
        if (f.polarity === 'gap' && !f.severity) throw new Error(`${at}: a gap row needs a severity`);
        if (f.polarity === 'gap' && !(f.fix && String(f.fix).trim())) throw new Error(`${at}: a gap row needs a fix — a gap without one cannot be acted on`);
        if (f.polarity === 'strength' && f.severity) throw new Error(`${at}: a strength row carries no severity (never file a strength as a ${f.severity})`);
        if (String(f.confidence) === 'unverified' && !(f.resolves_with && String(f.resolves_with).trim())) throw new Error(`${at}: an unverified row needs resolves_with — the artifact that would settle it`);
        if (f.prior_status && !f.prior_id) throw new Error(`${at}: prior_status without prior_id — the row it re-verifies is not named`);
        if (f.prior_status && !DCR_PRIOR_STATUS.includes(String(f.prior_status))) throw new Error(`${at}: bad prior_status "${f.prior_status}" (${DCR_PRIOR_STATUS.join(' | ')})`);
        if (f.prior_status === 'fixed' && f.polarity !== 'strength') throw new Error(`${at}: a prior finding re-verified fixed is filed as a strength row, not a ${f.polarity}`);
        const row = {
          id: fid(startId + n++),
          source: id,
          native_id: String(f.id),
          native_category: String(f.area),
          polarity: f.polarity,
          observation: oneLine(f.observation),
          evidence: f.evidence.map((e) => String(e)),
        };
        if (f.title) row.title = oneLine(f.title);
        if (f.tag) row.native_tag = oneLine(f.tag);
        if (f.severity) row.severity = String(f.severity);
        if (f.fix) row.fix = oneLine(f.fix);
        if (f.confidence) {
          const c = String(f.confidence);
          row.confidence = DCR_CONFIDENCE[c] || 'unverified';   // the port vocab; unknown labels read as unverified, never confirmed
          row.native_confidence = c;
        }
        if (f.latent === true) row.latent = true;
        if (f.mechanism_unproven === true) row.mechanism_unproven = true;
        if (f.resolves_with) row.resolves_with = oneLine(f.resolves_with);
        if (f.prior_id) { row.prior_native_id = String(f.prior_id); if (f.prior_status) row.prior_status = String(f.prior_status); }
        if (Array.isArray(f.compounds) && f.compounds.length) row.compounds_native = f.compounds.map(String);
        rows.push(row);
      }
      rows.coverage = {
        scanner: id,
        review: (rep.review && typeof rep.review === 'object') ? rep.review : {},
        ground_truth: (rep.ground_truth && typeof rep.ground_truth === 'object') ? rep.ground_truth : {},
        coverage: cov,
        prior_not_rechecked: Array.isArray(rep.prior_not_rechecked) ? rep.prior_not_rechecked.map(String) : [],
      };
      return rows;
    },
  }),
};

// The profile `tool` is ingested by: a built-in instrument profile, else the format
// its adapter's `ingest:` selects. Unknown is an error, listing what is known.
export function profileOf(tool) {
  if (Object.hasOwn(PROFILES, tool)) return PROFILES[tool];
  const adapter = loadAdapters()[tool];
  const spec = adapter && adapter.ingest;
  if (spec) {
    const make = Object.hasOwn(FORMATS, spec.format) ? FORMATS[spec.format] : null;
    if (!make) throw new Error(`adapters/${tool}.yaml ingest.format "${spec.format}" is not a format ingest reads (${Object.keys(FORMATS).join(', ')})`);
    if (!spec.tool) throw new Error(`adapters/${tool}.yaml ingest: needs tool, the report's review.tool value it accepts`);
    if (!/^\d+$/.test(String(spec.start_id ?? ''))) throw new Error(`adapters/${tool}.yaml ingest: needs start_id, the id floor, as digits`);
    return make(tool, adapter);
  }
  const known = [...Object.keys(PROFILES), ...Object.values(loadAdapters()).filter((a) => a.ingest).map((a) => a.scanner)];
  throw new Error(`unknown instrument "${tool}" (profiles: ${known.join(', ')})`);
}

// ── id allocation: above the base's highest id, never inside another block ──
// Each profile has a documented floor (gitleaks 700, scorecard 750, deep-code-review
// 800, fresh-clone 900, dependency-scan 950, repo-census 960, structure-scan 970). A real history scan can run past the next floor (a real
// history scan's gitleaks block ran F-700..F-1866), so the default start is the profile floor OR the
// next hundred above the highest id already in the run's OTHER findings files,
// whichever is higher. The profile's own file is excluded so a re-ingest of the same
// tool lands where it did before instead of drifting upward on every run.
export function nextStart(runDir, tool) {
  const p = profileOf(tool);
  const fd = findingsDir(runDir);
  const ownFile = `${tool}.yaml`;
  let max = 0; const seenIn = [];
  if (existsSync(fd)) {
    for (const f of readdirSync(fd)) {
      if (!f.endsWith('.yaml') || f === ownFile) continue;
      const m = readFileSync(join(fd, f), 'utf8').match(/^-\s+id:\s*F-(\d+)/gm) || [];
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
  const p = profileOf(tool);
  const file = `map/findings/${tool}.yaml`;
  const out = p.exitless
    ? [`# ${file} — peer-scanner rows ingested by assay.mjs ingest from the scanner's machine report.`,
       `# Scanner: ${tool} · ${rows.length} row(s) · coverage archived at map/coverage/${tool}.yaml (one row per domain).`]
    : [`# ${file} — instrument rows ingested by assay.mjs ingest.`,
       `# Instrument: ${tool} · exit code ${exitCode} (verified in its success set) · ${rows.length} row(s).`];
  if (skipped && skipped.length) out.push(`# Skipped as N/A by the tool (score -1), logged so the absence is visible: ${skipped.join(', ')}.`);
  if (startNote) out.push(`# Ids start at ${startNote}.`);
  out.push(`# Raw report archived at map/raw/${p.raw || tool + '.json'}. Regenerate with ingest.mjs; never hand-edit.`, '');
  for (const r of rows) {
    out.push(`- id: ${r.id}`);
    out.push(`  source: ${r.source}`);
    out.push(`  native_id: ${q(esc(r.native_id))}`);
    out.push(`  native_category: ${q(esc(r.native_category))}`);
    out.push(`  polarity: ${r.polarity}`);
    if (r.severity) out.push(`  severity: ${r.severity}`);
    if (r.fail_open) out.push(`  fail_open: true`);
    out.push(`  observation: >`, `    ${esc(r.observation)}`);
    out.push(`  evidence: [${r.evidence.map((e) => q(esc(e))).join(', ')}]`);   // quoted: a path may hold a comma or a ` #`
    if (r.fix) out.push(`  fix: >`, `    ${esc(r.fix)}`);
    // instrument facts beside the row (counts, churn), block style, scalars only
    if (r.detail) { out.push('  detail:'); for (const [k, v] of Object.entries(r.detail)) if (v !== null && v !== undefined) out.push(`    ${k}: ${typeof v === 'number' ? v : q(esc(v))}`); }
    // peer-scanner extension fields (the port keeps the scanner's own labels beside the mapped ones)
    if (r.title) out.push(`  title: ${q(esc(r.title))}`);
    if (r.native_tag) out.push(`  native_tag: ${q(esc(r.native_tag))}`);
    if (r.confidence) out.push(`  confidence: ${r.confidence}`);
    if (r.native_confidence) out.push(`  native_confidence: ${r.native_confidence}`);
    if (r.latent) out.push(`  latent: true`);
    if (r.mechanism_unproven) out.push(`  mechanism_unproven: true`);
    if (r.resolves_with) out.push(`  resolves_with: ${q(esc(r.resolves_with))}`);
    if (r.prior_native_id) out.push(`  prior_native_id: ${q(esc(r.prior_native_id))}`);
    if (r.prior_status) out.push(`  prior_status: ${r.prior_status}`);
    if (r.compounds_native) out.push(`  compounds_native: [${r.compounds_native.map((x) => q(esc(x))).join(', ')}]`);
  }
  return out.join('\n') + '\n';
}

// ── the coverage sidecar (block YAML; the scanner's own account of what it looked at) ─
function coverageYaml(c) {
  const scalar = (v) => (typeof v === 'number' || typeof v === 'boolean') ? String(v) : (v === null || v === undefined) ? 'null' : q(oneLine(v));
  const out = [
    `# map/coverage/${c.scanner}.yaml — the scanner's OWN coverage account, archived by assay.mjs ingest.`,
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
  out.push(`prior_not_rechecked: [${(c.prior_not_rechecked || []).map((x) => q(oneLine(x))).join(', ')}]`);
  return out.join('\n') + '\n';
}

// ── CLI ──────────────────────────────────────────────────────────────────────
if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  const runDir = args[0];
  const opt = (name) => { const i = args.indexOf(name); return i > -1 ? args[i + 1] : null; };
  const tool = opt('--tool'), rawPath = opt('--raw'), exit = opt('--exit'), start = opt('--start'), stripPrefix = opt('--strip-prefix'), model = opt('--model');
  // the run's target root: --target, else the one the run record holds (`assay start` writes it)
  let target = opt('--target');
  if (!target && existsSync(scannersPath(runDir))) { try { const t = parseYaml(readFileSync(scannersPath(runDir), 'utf8')).target; if (typeof t === 'string' && t) target = t; } catch { /* validate reports a malformed record */ } }
  let profile = null;
  try { profile = tool ? profileOf(tool) : null; } catch { /* convert reports an unknown tool */ }
  const exitless = !!(profile && profile.exitless);
  if (!runDir || !tool || !rawPath || (exit === null && !exitless)) {
    console.error('usage: node assay.mjs ingest <run-dir> --tool <gitleaks|scorecard|fresh-clone|dependency-scan> --raw <file> --exit <code> [--start F-7xx] [--strip-prefix <target-root>] [--target <run target root>] [--model <id>]');
    console.error('usage: node assay.mjs ingest <run-dir> --tool <gitleaks|scorecard|fresh-clone|repo-census|structure-scan> --raw <file> --exit <code> [--start F-7xx] [--strip-prefix <target-root>] [--target <run target root>] [--model <id>]');
    console.error('       node assay.mjs ingest <run-dir> --tool deep-code-review --raw <machine report .yaml> [--start F-8xx] [--model <id>]');
    process.exit(2);
  }
  const rawText = readFileSync(rawPath, 'utf8');
  let rows, startNote = null;
  let startId = start;
  if (!startId) {
    const ns = nextStart(runDir, tool);
    startId = `F-${ns.start}`;
    startNote = `F-${ns.start}: ${ns.reason}`;
  } else startNote = `${startId}: given on the command line (--start)`;
  try { rows = convert(tool, rawText, exit, startId, { stripPrefix, target }); }
  catch (e) { console.error(`✗ ingest halted: ${e.message}`); process.exit(1); }
  if (rows.scope && rows.scope.relation === 'outside') console.error(`⚠ ingest: ${tool} ran at ${rows.scope.root}, which is not the run's target (${rows.scope.target}) nor inside it — its rows are ingested as the instrument wrote them, and a result drawn over another scope can be confidently wrong; re-run ${tool} at the target, or at a directory inside it, unless this scope was intended.`);
  if (rows.scope && rows.scope.relation === 'inside') console.log(`· ${tool} ran at ${rows.scope.prefix}/ inside the run's target: evidence rebased onto the target (${rows.scope.prefix}/…)`);
  mkdirSync(findingsDir(runDir), { recursive: true });
  mkdirSync(rawDir(runDir), { recursive: true });
  const rawDst = rawArtifactPath(runDir, profile.raw || `${tool}.json`);
  if (profile.archive) writeFileSync(rawDst, profile.archive(rawText));
  else copyFileSync(rawPath, rawDst);
  const dst = findingsPath(runDir, tool);
  writeFileSync(dst, toYaml(rows, tool, exit, rows.skipped, startNote));
  if (rows.coverage) { mkdirSync(coverageDir(runDir), { recursive: true }); writeFileSync(coveragePath(runDir, tool), coverageYaml(rows.coverage)); }
  console.log(`✓ ingested ${rows.length} ${tool} row(s) → ${dst}${rows.coverage ? ` + map/coverage/${tool}.yaml (${Object.keys(rows.coverage.coverage).length} domain rows)` : ''}${rows.skipped && rows.skipped.length ? ` (${rows.skipped.length} N/A check(s) logged in header)` : ''}${rows.length === 0 ? ` — verified-clean run (${exitless ? 'full coverage, empty findings' : 'success exit, empty report'}), recorded explicitly` : ''}`);

  // Keep the run record current: a run started with `assay start` (or the
  // routine) already carries map/scanners.yaml, listing this tool as not yet
  // run — a successful ingest IS that tool running, so flip its row to ran
  // here rather than leaving a person to remember `record` afterward. A run
  // with no scanners.yaml (e.g. the routine's own sequencing, which writes the
  // manifest only after every instrument has been ingested) is untouched —
  // exactly today's behavior.
  const mPath = scannersPath(runDir);
  if (existsSync(mPath)) {
    updateRunRecord(mPath, (before) => setScannerRow(before, tool, 'ran', { model: model ?? undefined }).text);
    console.log(`✓ recorded ${tool} ran in map/scanners.yaml`);
  }
}
