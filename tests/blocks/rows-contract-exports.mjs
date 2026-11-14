// ── rows-contract-exports: views/rows.mjs is the one contract module for a view (#339) ──
// A consumer that builds its own view of a population imports views/rows.mjs,
// lib/run-layout.mjs and assay.mjs, and no other engine module (CONSUMERS.md, "Modules").
// Pinned:
//   (a) views/rows.mjs exports exactly the set CONSUMERS.md lists: no fewer (a consumer's
//       import breaks) and no more (a new export is contract only when the page says so);
//   (b) CONSUMERS.md § Modules names each export of the set on views/rows.mjs's row;
//   (c) a view built only from those two modules renders what the Intake view wrote: its
//       data file (counts, open, met, to_run, not_applicable, not_seen, contradictions),
//       joined contradictions, the packet the run carries, a quoted scalar and an escaped
//       page line.
import { spawnSync, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { HERE, ROOT, negFailures, copyFixtureFindings, copyFixtureScanners } from '../harness.mjs';

export const label = 'rows-contract-exports';

const ROWS_CONTRACT = ['CONTEXT_LABEL', 'basisNote', 'buildRows', 'contextText', 'joinContradictions', 'loadContradictions', 'loadMeasurement', 'loadRunPacket', 'loadYardstick', 'mdText', 'q', 'toYaml'];

export async function run() {
  const fail = (m) => negFailures.push('rows-contract-exports: ' + m);

  // (a)
  const mod = await import('../../views/rows.mjs');
  const got = Object.keys(mod).sort();
  const missing = ROWS_CONTRACT.filter((k) => !got.includes(k));
  const extra = got.filter((k) => !ROWS_CONTRACT.includes(k));
  if (missing.length || extra.length) fail(`views/rows.mjs exports exactly its contract set (missing ${missing.join(', ') || 'none'}; extra ${extra.join(', ') || 'none'})`);

  // (b)
  const page = readFileSync(join(ROOT, 'CONSUMERS.md'), 'utf8');
  const row = page.split('\n').find((l) => l.startsWith('| `views/rows.mjs` |')) || '';
  if (!row) fail('CONSUMERS.md § Modules lists views/rows.mjs as a contract module');
  for (const k of ROWS_CONTRACT) if (!row.includes('`' + k)) fail(`CONSUMERS.md's views/rows.mjs row names ${k}`);

  // (c) a consumer's view, in its own file, importing only the two contract modules
  const tmp = join(HERE, 'tmp-rows-contract'); rmSync(tmp, { recursive: true, force: true });
  const run = join(tmp, 'run');
  copyFixtureFindings('notesbox', run); copyFixtureScanners('notesbox', run);
  mkdirSync(join(run, 'owner'), { recursive: true });
  writeFileSync(join(run, 'owner', 'manifest.yaml'), [
    'packet: 1', 'yardstick: 0',
    'answered:', '  date: "2026-09-28"', '  by: founder', '  via: owner-prompt',
    'claims:', '  - id: d-secrets-out-of-history', '    state: satisfied', '    by: "a ci scan we trust"',
  ].join('\n') + '\n');
  try { execFileSync(process.execPath, [join(ROOT, 'yardstick', 'measure.mjs'), run, '--write'], { stdio: 'pipe' }); }
  catch (e) { fail(`measure --write must succeed (${String(e.stderr || e.message).split('\n').slice(-2).join(' | ')})`); rmSync(tmp, { recursive: true, force: true }); return; }
  const url = (p) => pathToFileURL(join(ROOT, p)).href;
  const viewFile = join(tmp, 'consumer-view.mjs');
  writeFileSync(viewFile, `import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { buildRows, toYaml, basisNote, contextText, joinContradictions, loadYardstick, loadContradictions, loadRunPacket, q, mdText } from '${url('views/rows.mjs')}';
import { viewPath, pagePath } from '${url('lib/run-layout.mjs')}';
const run = process.argv[2];
const reg = loadYardstick();
const built = buildRows(run, 'floor');
const contradictions = joinContradictions(loadContradictions(run), reg);
const packet = loadRunPacket(run);
const yaml = toYaml('consumer', 'run', reg.version, built, contradictions) + 'packet_answered_by: ' + q(packet?.answered?.by ?? 'unknown') + '\\n';
const dst = viewPath(run, 'consumer'); mkdirSync(dirname(dst), { recursive: true }); writeFileSync(dst, yaml);
const lines = [...built.open, ...built.met].map((r) => '- **' + r.id + '** ' + mdText(r.title) + basisNote(r) + contextText(r));
lines.push(...contradictions.map((c) => '- ' + mdText(c.title) + ': ' + c.claim + ' / ' + c.run_status));
lines.push(mdText('see [doc](https://example.invalid)'));
writeFileSync(pagePath(run, 'CONSUMER'), lines.join('\\n') + '\\n');
`);
  // the view file names no engine module but the two
  const imports = [...readFileSync(viewFile, 'utf8').matchAll(/from '([^']+)'/g)].map((m) => m[1]).filter((s) => !s.startsWith('node:'));
  for (const s of imports) if (!/\/views\/rows\.mjs$|\/lib\/run-layout\.mjs$/.test(s)) fail(`the consumer view imports only views/rows.mjs and lib/run-layout.mjs (got ${s})`);
  const r = spawnSync(process.execPath, [viewFile, run], { encoding: 'utf8' });
  if (r.status !== 0) fail(`a view built only from the contract modules runs (exit ${r.status}): ${String(r.stderr).split('\n').slice(0, 3).join(' | ')}`);
  else {
    const { parseYaml } = await import('../../lib/yaml-min.mjs');
    let doc = null;
    try { doc = parseYaml(readFileSync(join(run, 'views', 'consumer.yaml'), 'utf8')); } catch (e) { fail(`the consumer's data file reads back (${e.message})`); }
    if (doc) {
      for (const k of ['counts', 'open', 'met', 'to_run', 'not_applicable', 'not_seen', 'contradictions']) if (!(k in doc)) fail(`the consumer's data file carries ${k}, as the Intake view's did`);
      if (!(doc.contradictions || []).some((c) => c.id === 'd-secrets-out-of-history')) fail(`the consumer's data file carries the run's contradiction (got ${JSON.stringify(doc.contradictions)})`);
      if (doc.packet_answered_by !== 'founder') fail(`the consumer reads the run's packet through loadRunPacket and writes it with q (got ${JSON.stringify(doc.packet_answered_by)})`);
    }
    const md = readFileSync(join(run, 'CONSUMER.md'), 'utf8');
    if (!/: satisfied \/ unmet/.test(md)) fail('the consumer page names the contradiction joined to its title');
    if (md.includes('[doc](') || !md.includes('\\[doc\\]')) fail('mdText escapes a link on the consumer page');
  }
  rmSync(tmp, { recursive: true, force: true });
}
