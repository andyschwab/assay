// run-layout.mjs — the ONE module that knows the path of every run artifact.
//
// A run is laid out the way the engine itself is: the MAP (what scanners
// produced), the YARDSTICK measurement, the VIEWS, and what the OWNER
// supplied. Nothing else in the engine builds a run path by hand — every
// reader and writer calls one of these.
//
//   <run>/
//     INDEX.md  INTAKE.md  MAINTAIN.md  IMPROVE.md     the pages
//     handoff/                                          Improve's fix prompts
//     map/
//       scanners.yaml                                   the run record
//       findings/<scanner>.yaml                         one file per scanner
//       findings/repo-eval-<pass>.yaml                  the built-in scanner, one file per pass
//       coverage/<scanner>.yaml                         a peer scanner's coverage record
//       censuses.yaml                                   the counted populations
//       backlog.yaml                                    the engine's own optimization backlog (computed half)
//       terrain.md                                      the built-in scanner's terrain pass
//       native/<scanner>.md                              a scanner's own report, kept verbatim
//       raw/                                             instrument outputs as archived
//     yardstick.yaml                                    the measurement
//     views/
//       intake.yaml  maintain.yaml  improve.yaml
//       improve/axes.md  leverage.md  maturity.md  maturity-grades.yaml
//               security.md  security-gate.yaml  prose.yaml  synthesis.md
//     owner/
//       decisions.yaml                                  the owner's triage overlay
import { join } from 'node:path';

// ── the pages ────────────────────────────────────────────────────────────────
export const pagePath = (run, name) => join(run, `${name}.md`);
export const indexPath = (run) => pagePath(run, 'INDEX');
export const intakePagePath = (run) => pagePath(run, 'INTAKE');
export const maintainPagePath = (run) => pagePath(run, 'MAINTAIN');
export const improvePagePath = (run) => pagePath(run, 'IMPROVE');

// ── handoff/ ─────────────────────────────────────────────────────────────────
export const handoffDir = (run) => join(run, 'handoff');

// ── map/ ─────────────────────────────────────────────────────────────────────
export const mapDir = (run) => join(run, 'map');
export const scannersPath = (run) => join(mapDir(run), 'scanners.yaml');
export const findingsDir = (run) => join(mapDir(run), 'findings');
export const findingsPath = (run, scanner) => join(findingsDir(run), `${scanner}.yaml`);
export const repoEvalPassName = (pass) => `repo-eval-${pass}`;
export const repoEvalPassPath = (run, pass) => findingsPath(run, repoEvalPassName(pass));
export const coverageDir = (run) => join(mapDir(run), 'coverage');
export const coveragePath = (run, scanner) => join(coverageDir(run), `${scanner}.yaml`);
export const censusesPath = (run) => join(mapDir(run), 'censuses.yaml');
export const backlogPath = (run) => join(mapDir(run), 'backlog.yaml');
export const terrainPath = (run) => join(mapDir(run), 'terrain.md');
export const nativeDir = (run) => join(mapDir(run), 'native');
export const nativeReportPath = (run, scanner) => join(nativeDir(run), `${scanner}.md`);
export const rawDir = (run) => join(mapDir(run), 'raw');
export const rawPath = (run, file) => join(rawDir(run), file);
// Every findings file in map/findings/ is a scanner's own YAML (one per scanner,
// or one per repo-eval pass): a plain "every .yaml under this dir" listing, with
// no numbering and no merged-file fallback — the layout IS the contract.
export const isFindingsFile = (name) => name.endsWith('.yaml');
export const REPO_EVAL_PASS_PREFIX = 'repo-eval-';
export const isRepoEvalPassFile = (name) => name.startsWith(REPO_EVAL_PASS_PREFIX);

// ── the yardstick's measurement of one run ──────────────────────────────────
export const yardstickPath = (run) => join(run, 'yardstick.yaml');

// ── views/ ───────────────────────────────────────────────────────────────────
export const viewsDir = (run) => join(run, 'views');
export const viewPath = (run, view) => join(viewsDir(run), `${view}.yaml`); // intake | maintain | improve
export const improveDir = (run) => join(viewsDir(run), 'improve');
export const improvePath = (run, file) => join(improveDir(run), file);
export const prosePath = (run) => improvePath(run, 'prose.yaml');
export const axesPath = (run) => improvePath(run, 'axes.md');
export const leveragePath = (run) => improvePath(run, 'leverage.md');
export const maturityPath = (run) => improvePath(run, 'maturity.md');
export const maturityGradesPath = (run) => improvePath(run, 'maturity-grades.yaml');
export const securityPath = (run) => improvePath(run, 'security.md');
export const securityGatePath = (run) => improvePath(run, 'security-gate.yaml');
export const synthesisPath = (run) => improvePath(run, 'synthesis.md');

// ── owner/ ───────────────────────────────────────────────────────────────────
export const ownerDir = (run) => join(run, 'owner');
export const decisionsPath = (run) => join(ownerDir(run), 'decisions.yaml');
// the run's copy of a repository's own packet (yardstick/README.md, owner/PACKET.md):
// `measure --packet <dir>` copies <dir>/manifest.yaml here so a re-compile reads the
// SAME packet without the flag, and reproduces without reaching back outside the run.
export const packetManifestPath = (run) => join(ownerDir(run), 'manifest.yaml');
