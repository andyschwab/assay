// ── static analysis as an instrument: Opengrep with the vendored taint rules (#232) ──
// The adapter's fail-loud block (map/scanners/INTAKE.md). Static analysis reached the map only
// through the code reviewer, as a report written for it to read; now it is an instrument of its
// own, run off its adapter, and it decides a floor row. Pinned with the real binary the gate
// requires (`tools install --run`):
//   (a) the adapter is an instrument whose binary is pinned by version and sha256 per platform;
//       its rules are the vendored MIT taint rules beside it, naming their source commit; every
//       vendored rule is mapped on code-security and decides d-untrusted-input-checked; each
//       expected control hit names a vendored rule and a line of a planted file;
//   (b) one finding: a planted flow over a target is one gap row at its file and line, relative
//       to the target; the archived envelope carries the control that fired and names no machine
//       path; the floor row reads unmet;
//   (c) a clean run: a target with no flow is ran with no row, beside a control that fired, and
//       the floor row reads met;
//   (d) a control that does not fire fails the run, naming the hit, and the target is not run; a
//       control that is not there fails it too, never ran with no control;
//   (e) a target's own rule file runs beside the vendored rules: its hit is a target-rule gap
//       keeping its rule id, and the vendored rules still decide the floor row;
//   (f) a tree in no language the rules read is one no-input fact, the tool not started, and the
//       floor row reads not-applicable, never met.
import { readFileSync, writeFileSync, existsSync, rmSync, mkdirSync, mkdtempSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runAdapterInstrument } from '../../map/start.mjs';
import { toolBlockProblems, pinnedTools } from '../../map/tools.mjs';
import { loadFindings, projectMulti } from '../../map/project.mjs';
import { measureRun } from '../../yardstick/measure.mjs';
import { parseYaml } from '../../lib/yaml-min.mjs';
import { ROOT, negFailures, adaptersOnce } from '../harness.mjs';

export const label = 'opengrep-instrument';

const ID = 'opengrep';
const FLOOR = 'd-untrusted-input-checked';
const ADAPTERS = join(ROOT, 'map', 'scanners', 'adapters');
const FLOW = "const { exec } = require('child_process');\nmodule.exports = (req, res) => {\n  exec('ls ' + req.query.dir, (e, out) => res.send(out));\n};\n";

export async function run() {
  const fail = (m) => negFailures.push('opengrep-instrument: ' + m);
  const adapters = adaptersOnce();
  const a = adapters[ID];
  if (!a) { fail(`(a) an adapter for ${ID} is adopted (map/scanners/adapters/${ID}.yaml)`); return; }

  // (a) the adapter, its pin, its rules and its control
  if (a.role !== 'instrument' || a.adopted === false) fail(`(a) ${ID} is an adopted instrument (got role ${a.role})`);
  const t = pinnedTools(adapters).find((x) => x.scanner === ID);
  if (!t) fail(`(a) ${ID} pins its binary in a tool: block`);
  else {
    for (const p of toolBlockProblems(t)) fail(`(a) tool: ${p}`);
    if (!t.fetch || !t.fetch['linux-x64'] || !t.fetch['darwin-arm64']) fail('(a) the binary is pinned by sha256 for linux-x64 and darwin-arm64, as the other instruments are');
  }
  const run = a.run || {};
  const rulesDir = join(ADAPTERS, String(run.rules?.dir || ''));
  const source = existsSync(join(rulesDir, 'SOURCE.md')) ? readFileSync(join(rulesDir, 'SOURCE.md'), 'utf8') : '';
  const licence = existsSync(join(rulesDir, 'LICENSE')) ? readFileSync(join(rulesDir, 'LICENSE'), 'utf8') : '';
  if (!/`[0-9a-f]{40}`/.test(source) || !/MIT/.test(licence)) fail(`(a) the vendored rules (${run.rules?.dir}) name their source commit and carry their MIT licence`);
  const ruleIds = existsSync(rulesDir) ? readdirSync(rulesDir).filter((f) => f.endsWith('.yml')).flatMap((f) => [...readFileSync(join(rulesDir, f), 'utf8').matchAll(/^- id: (\S+)$/gm)].map((m) => m[1])) : [];
  if (ruleIds.length < 14) fail(`(a) the vendored rule set carries the JavaScript and Python taint rules (got ${ruleIds.length})`);
  const decides = (a.decides || []).find((d) => d.requirement === FLOOR);
  const decided = new Set([].concat(decides?.category || []).map(String));
  for (const r of ruleIds) {
    if (a.map?.[r]?.axis !== 'code-security') fail(`(a) the vendored rule ${r} is mapped on code-security`);
    if (!decided.has(r)) fail(`(a) the vendored rule ${r} decides ${FLOOR}`);
  }
  if (!decides || decides.not_applicable_when !== 'no-input') fail(`(a) ${ID} decides ${FLOOR}, not applicable on a tree with nothing to read`);
  const control = run.control || {};
  if (!Array.isArray(control.expect) || !control.expect.length) fail('(a) the adapter carries a positive control with expected hits');
  for (const e of control.expect || []) {
    const m = String(e).match(/^(\S+) (\S+):(\d+)$/);
    if (!m) { fail(`(a) "${e}" reads <rule> <file>:<line>`); continue; }
    if (!ruleIds.includes(m[1])) fail(`(a) the control's ${m[1]} is a rule of the vendored set`);
    const file = join(ADAPTERS, String(control.dir), m[2]);
    if (!existsSync(file) || readFileSync(file, 'utf8').split('\n').length < Number(m[3])) fail(`(a) ${m[2]}:${m[3]} is a line of a planted file`);
  }

  // outside any repository: the tool honours an enclosing repository's .gitignore, and this one ignores tests/tmp-*
  const scratch = mkdtempSync(join(tmpdir(), 'assay-opengrep-'));
  const target = (name, files) => { const dir = join(scratch, name); for (const [f, body] of Object.entries(files)) { mkdirSync(join(dir, f, '..'), { recursive: true }); writeFileSync(join(dir, f), body); } return dir; };
  const draw = (name, dir, adapter = a) => {
    const out = join(scratch, `run-${name}`);
    mkdirSync(join(out, 'map', 'findings'), { recursive: true });
    const row = runAdapterInstrument(ID, adapter, dir, out, () => {});
    const findings = existsSync(join(out, 'map', 'findings', `${ID}.yaml`)) ? loadFindings(out) : [];
    const envText = existsSync(join(out, 'map', 'raw', `${ID}.json`)) ? readFileSync(join(out, 'map', 'raw', `${ID}.json`), 'utf8') : null;
    const floor = measureRun({ findings, manifest: { scanners: { [ID]: { status: row.status, reason: row.reason } } }, inputs: {}, coverage: {}, adapters }).find((r) => r.id === FLOOR);
    return { row, findings, envText, env: envText ? JSON.parse(envText) : null, floor };
  };
  const machine = (text) => [ROOT, ROOT.replace(/^\/+/, '').split('/').join('.'), scratch, scratch.replace(/^\/+/, '').split('/').join('.')].filter((m) => String(text).includes(m));
  const fired = (env) => env && env.control && env.control.expected === control.expect?.length && env.control.found === control.expect?.length && !(env.control.missing || []).length;
  try {
    // (b) one finding
    const b = draw('b', target('b', { 'routes/run.js': FLOW }));
    const gaps = b.findings.filter((f) => f.polarity === 'gap');
    if (b.row.status !== 'ran') fail(`(b) a run over a planted flow records ran (got ${JSON.stringify(b.row)})`);
    if (gaps.length !== 1 || gaps[0].native_category !== 'js-command-injection' || gaps[0].evidence?.[0] !== 'routes/run.js:3') fail(`(b) the planted flow is one js-command-injection gap at routes/run.js:3 (got ${JSON.stringify(gaps.map((f) => `${f.native_category} ${f.evidence}`))})`);
    if (gaps.some((f) => 'severity' in f)) fail('(b) an instrument row asserts no severity');
    const proj = projectMulti(gaps, adapters);
    if (proj.unmapped.length || proj.projected[0]?.axis !== 'code-security') fail(`(b) the gap lands on code-security (got ${JSON.stringify(proj.projected.map((p) => p.axis))}, unmapped ${proj.unmapped.map((u) => u.cat)})`);
    if (!fired(b.env)) fail(`(b) the archived envelope carries the control that fired (got ${JSON.stringify(b.env && b.env.control)})`);
    if (b.envText && machine(b.envText).length) fail(`(b) the archived envelope names no machine path (got ${machine(b.envText).join(', ')})`);
    if (b.floor?.status !== 'unmet') fail(`(b) ${FLOOR} reads unmet on the planted flow (got ${b.floor?.status}: ${b.floor?.note})`);

    // (c) a clean run, the control firing
    const c = draw('c', target('c', { 'index.js': "module.exports = () => 'a target with no flow';\n" }));
    if (c.row.status !== 'ran' || c.findings.length) fail(`(c) a target with no flow is ran with no row (got ${JSON.stringify(c.row)}, ${c.findings.length} row(s))`);
    if (!fired(c.env)) fail(`(c) the clean run comes with a control that fired (got ${JSON.stringify(c.env && c.env.control)})`);
    if (c.floor?.status !== 'met') fail(`(c) ${FLOOR} reads met on a clean run beside a control that fired (got ${c.floor?.status}: ${c.floor?.note})`);

    // (d) a control that does not fire
    const unmet = 'js-sqli routes/run.js:4';
    const strict = { ...a, run: { ...run, control: { ...control, expect: [...(control.expect || []), unmet] } } };
    const d = draw('d', target('d', { 'routes/run.js': FLOW }), strict);
    if (d.row.status !== 'failed' || !/positive control did not fire/.test(d.row.reason || '') || !(d.row.reason || '').includes(unmet) || d.findings.length || d.envText) fail(`(d) a hit the rules do not report fails the run, naming it, and the target is not run (got ${JSON.stringify(d.row)}, ${d.findings.length} row(s))`);
    const gone = { ...a, run: { ...run, control: { ...control, dir: 'opengrep/no-such-control' } } };
    const d2 = draw('d2', target('d2', { 'index.js': 'module.exports = 1;\n' }), gone);
    if (d2.row.status !== 'failed' || !/positive control did not fire/.test(d2.row.reason || '')) fail(`(d) a control that is not there fails the run (got ${JSON.stringify(d2.row)})`);

    // (e) the target's own rules, beside the vendored ones
    const own = 'rules:\n  - id: planted-own-rule\n    pattern: res.send(...)\n    message: the target\'s own rule\n    languages: [javascript]\n    severity: INFO\n';
    const e = draw('e', target('e', { 'routes/run.js': FLOW, [String((run.rules?.repo || [])[0] || '.semgrep.yml')]: own }));
    const byCat = (cat) => e.findings.filter((f) => f.native_category === cat);
    if (e.row.status !== 'ran' || byCat('target-rule').length !== 1 || !/^planted-own-rule@routes\/run\.js:3$/.test(byCat('target-rule')[0]?.native_id || '')) fail(`(e) the target's own rule lands one target-rule gap keeping its rule id (got ${JSON.stringify(e.findings.map((f) => f.native_id))})`);
    if (byCat('js-command-injection').length !== 1) fail('(e) the vendored rules still run beside the target\'s own');
    if (e.envText && machine(e.envText).length) fail(`(e) the archived envelope names no machine path (got ${machine(e.envText).join(', ')})`);

    // (f) nothing the rules read
    const f = draw('f', target('f', { 'README.md': '# a tree in no language the rules read\n', 'main.go': 'package main\n' }));
    const facts = f.findings.filter((x) => x.polarity === 'fact');
    if (f.row.status !== 'ran' || facts.length !== 1 || facts[0].native_category !== 'no-input' || f.env?.control || f.env?.no_input !== true) fail(`(f) a tree in no language the rules read is one no-input fact, the tool not started (got ${JSON.stringify(f.row)}, ${JSON.stringify(f.findings.map((x) => x.native_category))})`);
    if (f.floor?.status !== 'not-applicable') fail(`(f) ${FLOOR} reads not-applicable on a tree in no language the rules read, never met (got ${f.floor?.status}: ${f.floor?.note})`);
  } finally { rmSync(scratch, { recursive: true, force: true }); }

  // the floor row is one of the yardstick's, named for its property
  const reg = parseYaml(readFileSync(join(ROOT, 'yardstick', 'requirements.yaml'), 'utf8'));
  const row = reg.requirements.find((r) => r.id === FLOOR);
  if (!row || !(row.tags || []).includes('floor') || row.decide?.kind !== 'instrument' || row.topic !== 'code-security' || !(row.harm || []).length || !row.owner?.risk || !row.owner?.fix) fail(`(a) ${FLOOR} is a floor row on code-security, decided by an instrument, naming its harm, with an owner risk and fix`);
}
