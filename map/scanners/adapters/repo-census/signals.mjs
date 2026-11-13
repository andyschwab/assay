// signals.mjs — the repo census's reader of one application's operability declarations
// (#311): the replaceable part. The census (map/repo-census.mjs) names no format; it loads
// the reader its adapter names (adapters/repo-census.yaml `signals.reader`) and reads what
// it returns against the three interfaces yardstick/README.md states by property (a signal
// declaration, a health report, a routing policy). A different application format is a
// different reader with the same return shape (map/scanners/CONTRACT.md §3d), never a change
// to the census.
//
// The format read here is a foundation template's, three YAML files at the application root:
//
//   ops/signals.yaml   schedule: the jobs the application schedules itself
//                        - name: nightly-sync
//                          cron: "0 3 * * *"
//                      signals: one declaration per signal
//                        - name: nightly-sync-ran
//                          watches: job nightly-sync      # job <name> | effect <path> | cost <account>
//                          expect: "runs every 24h and touches at least one row"
//                          evidence: "the sync run log"
//                          runbook: "RUNBOOK.md#nightly-sync"
//   ops/health.yaml    the health report's schema
//                        report: "GET /health"            # where the report is served
//                        signals:
//                          - name: nightly-sync-ran
//                            fields: [last_success, last_count, since]
//   ops/routing.yaml   the routing policy
//                        routes:
//                          - signal: nightly-sync-ran
//                            class: record                # record | digest | notify
//                            to: maintainer               # a destination role
//                            budget: "1 per day"
//
// readSignals(dir) → { files, jobs, declarations, health, policy, problems }, every entry citing
// `file:line` in the tree, each problem naming the interface it concerns (declarations | health |
// policy) — the shape map/scanners/CONTRACT.md §3d states; citing
// `file:line` in the tree. A file that is absent is null (or no entries); a file present but
// unreadable is a problem, never an absence. Read-only, zero network, never throws on input.
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parseYaml } from '../../../../lib/yaml-min.mjs';

export const FORMAT = 'ops/signals.yaml, ops/health.yaml and ops/routing.yaml';
const FILES = { signals: 'ops/signals.yaml', health: 'ops/health.yaml', routing: 'ops/routing.yaml' };
// the interface each file states (map/scanners/CONTRACT.md §3d): a problem names the one it concerns
const INTERFACE = { [FILES.signals]: 'declarations', [FILES.health]: 'health', [FILES.routing]: 'policy' };
const WATCHES = /^(job|effect|cost)\s+(\S.*)$/;

const isFile = (p) => { try { return statSync(p).isFile(); } catch { return false; } };
const text = (v) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
// the line a list entry's key sits on: the first `<key>: <value>` line at or after `from`
function lineOf(lines, key, value, from = 0) {
  const want = String(value);
  for (let i = from; i < lines.length; i++) {
    const m = lines[i].match(new RegExp(`^\\s*(?:-\\s+)?${key}\\s*:\\s*(.*)$`));
    if (m && m[1].replace(/\s+#.*$/, '').trim().replace(/^["']|["']$/g, '') === want) return i + 1;
  }
  return 1;
}

function load(dir, rel, problems) {
  const p = join(dir, rel);
  if (!isFile(p)) return null;
  const src = readFileSync(p, 'utf8');
  let doc;
  try { doc = parseYaml(src); }
  catch (e) { problems.push({ interface: INTERFACE[rel], file: rel, at: `${rel}:1`, what: `${rel} is not readable YAML: ${e.message}` }); return null; }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) { problems.push({ interface: INTERFACE[rel], file: rel, at: `${rel}:1`, what: `${rel} is not a mapping of keys` }); return null; }
  return { doc, lines: src.split('\n') };
}
// the index of a top-level key's line, so an entry is looked for under its own key
const keyAt = (lines, key) => Math.max(0, lines.findIndex((l) => new RegExp(`^${key}\\s*:`).test(l)));
const list = (v, rel, key, problems) => {
  if (v === undefined || v === null) return [];
  if (Array.isArray(v)) return v;
  problems.push({ interface: INTERFACE[rel], file: rel, at: `${rel}:1`, what: `${rel}: ${key} must be a list` });
  return [];
};

export function readSignals(dir) {
  const problems = [];
  const files = [];
  const out = { files, jobs: [], declarations: [], health: null, policy: null, problems };

  const sig = load(dir, FILES.signals, problems);
  if (sig) {
    files.push(FILES.signals);
    for (const j of list(sig.doc.schedule, FILES.signals, 'schedule', problems)) {
      const name = text(j?.name);
      if (!name) { problems.push({ interface: 'declarations', file: FILES.signals, at: `${FILES.signals}:1`, what: `${FILES.signals}: a schedule entry carries no name` }); continue; }
      out.jobs.push({ name, at: `${FILES.signals}:${lineOf(sig.lines, 'name', name, keyAt(sig.lines, 'schedule'))}`, how: `scheduled in ${FILES.signals}${text(j.cron) ? ` (${text(j.cron)})` : ''}` });
    }
    for (const s of list(sig.doc.signals, FILES.signals, 'signals', problems)) {
      const name = text(s?.name);
      const at = `${FILES.signals}:${name ? lineOf(sig.lines, 'name', name, keyAt(sig.lines, 'signals')) : 1}`;
      const w = text(s?.watches).match(WATCHES);
      out.declarations.push({
        name: name || null,
        watches: w ? { kind: w[1], target: w[2].trim() } : null,
        expect: text(s?.expect) || null, evidence: text(s?.evidence) || null, runbook: text(s?.runbook) || null,
        at,
      });
    }
  }

  const health = load(dir, FILES.health, problems);
  if (health) {
    files.push(FILES.health);
    const at = `${FILES.health}:1`;
    out.health = {
      at, report: text(health.doc.report) || null,
      signals: list(health.doc.signals, FILES.health, 'signals', problems).map((s) => {
        const name = text(s?.name);
        return { name: name || null, fields: Array.isArray(s?.fields) ? s.fields.map(String) : [], at: `${FILES.health}:${name ? lineOf(health.lines, 'name', name) : 1}` };
      }),
    };
  }

  const routing = load(dir, FILES.routing, problems);
  if (routing) {
    files.push(FILES.routing);
    out.policy = {
      at: `${FILES.routing}:1`,
      routes: list(routing.doc.routes, FILES.routing, 'routes', problems).map((r) => {
        const signal = text(r?.signal);
        return { signal: signal || null, class: text(r?.class) || null, to: text(r?.to) || null, budget: text(r?.budget) || null, at: `${FILES.routing}:${signal ? lineOf(routing.lines, 'signal', signal) : 1}` };
      }),
    };
  }
  return out;
}
