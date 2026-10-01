#!/usr/bin/env node
// owner.mjs — Owner: what is true of this application? A fourth view of the
// same measurement Intake and Maintain read (yardstick.yaml), joined with the
// register's `owner:` block on every requirement (yardstick/requirements.yaml
// — yardstick/README.md documents the field). Reads ONLY the yardstick's
// measurement, the yardstick (title/check/tier/topic/owner) and the run
// manifest (what was not looked at this run) — never findings directly, and
// it decides nothing a run/census/facet/claim did not already decide
// (floor-fleet.mjs's buildRows, the same helper Intake and Maintain use).
//
// This is the register for a person who built the app with an AI and is not
// an engineer: consequence first, plain words, a term explained in a short
// clause the first time, no stack names, no tool names, no score, no grade,
// no verdict — the tier order (custody, safety, reproducibility,
// verification, legibility, operability) IS the priority. assay states no
// opinion of its own about tone; the register lives once, in
// yardstick/requirements.yaml's owner.risk / owner.fix on every row, and this
// view only renders it next to the same measurement every other view reads.
//
// Writes views/owner.yaml (data) + OWNER.md (plain) at the run root.
//
// Usage: node assay.mjs owner <run-dir> [--stdout]
import { writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { buildRows } from './floor-fleet.mjs';
import { loadFindings } from '../map/project.mjs';
import { loadYardstick } from '../yardstick/measure.mjs';
import { isMain } from '../map/doctrine.mjs';
import { parseYaml, q as yq } from '../lib/yaml-min.mjs';
import { viewPath, ownerPagePath, prosePath as runProsePath } from '../lib/run-layout.mjs';
import { mdText, mdCode } from '../lib/display.mjs';

// Plain-language gloss for each tier, used only in the lead paragraph — never
// a substitute for the tier id, which still rides at the end (yardstick/README.md
// tiers; meaning first, id last, so the owner reads the plain words first).
export const TIER_GLOSS = {
  custody: 'who controls this app and its accounts',
  safety: 'whether something destructive could happen unnoticed',
  reproducibility: 'whether it runs anywhere but the one machine it was built on',
  verification: 'whether anything other than a person would catch a regression',
  legibility: 'whether someone else could find their way in',
  operability: "whether you'd notice, and could afford, what it's doing",
};

// ── build: join buildRows()'s three buckets with the register's owner fields ──
// `where` is what the owner can open: each deciding finding's evidence paths
// (file:line, from the map), never the finding id alone — an id means nothing to
// a person who did not write the engine. Ids ride beside it in `findings` for
// anyone technical who wants the map row.
function ownerRow(r, status, byId, evidenceById) {
  const d = byId.get(r.id);
  const o = (d && d.owner) || {};
  const findings = r.findings || [];
  const where = [...new Set(findings.flatMap((id) => evidenceById.get(id) || []))];
  const out = { id: r.id, tier: r.tier, topic: r.topic, title: r.title, status, risk: o.risk || '', fix: o.fix || '', where, findings, check: r.check };
  if (r.decided_by) out.decided_by = r.decided_by;
  out.reason = r.note;
  return out;
}

// floor: the same population Intake reads (tags: [floor]). beyond_floor: every
// requirement NOT tagged floor, regardless of fleet/ai-operating — no single
// tag names that population, so buildRows takes a predicate here (its one
// other caller shape, alongside the string tags Intake/Maintain pass).
export function buildOwner(runDir) {
  const reg = loadYardstick();
  const byId = new Map(reg.requirements.map((d) => [d.id, d]));
  const evidenceById = new Map(loadFindings(runDir).map((f) => [f.id, Array.isArray(f.evidence) ? f.evidence.map(String) : []]));
  const floorBuilt = buildRows(runDir, 'floor');
  const beyondBuilt = buildRows(runDir, (d) => !(d.tags || []).includes('floor'));
  if (!floorBuilt || !beyondBuilt) return null;
  const group = (built) => ({
    open: built.open.map((r) => ownerRow(r, r.status, byId, evidenceById)),
    not_measured: built.to_run.map((r) => ownerRow(r, 'not-measured', byId, evidenceById)),
    met: built.met.map((r) => ownerRow(r, 'met', byId, evidenceById)),
    // decided from the map as not applying to this repository (no database, so nothing
    // to migrate); listed, never folded into met, never dropped — the same bucket
    // Intake carries, so the two views cannot disagree on a row
    not_applicable: (built.not_applicable || []).map((r) => ownerRow(r, 'not-applicable', byId, evidenceById)),
  });
  return { floor: group(floorBuilt), beyond_floor: group(beyondBuilt), not_looked_at: floorBuilt.not_seen, reg };
}

// ── YAML (yaml-min's constrained block-only subset — decide: is the load-bearing precedent for a nested map inside a list item) ──
const q = (s) => yq(s == null ? '' : s);
function rowYaml(r, pad) {
  const L = [`${pad}- id: ${r.id}`, `${pad}  tier: ${r.tier}`, `${pad}  topic: ${r.topic}`, `${pad}  title: ${q(r.title)}`, `${pad}  status: ${r.status}`];
  L.push(`${pad}  risk: ${q(r.risk)}`, `${pad}  fix: ${q(r.fix)}`);
  L.push(`${pad}  where: [${(r.where || []).map(q).join(', ')}]`, `${pad}  findings: [${(r.findings || []).join(', ')}]`, `${pad}  check: ${q(r.check)}`);
  if (r.decided_by) L.push(`${pad}  decided_by: ${r.decided_by}`);
  L.push(`${pad}  reason: ${q(r.reason)}`);
  return L.join('\n');
}
function groupYaml(name, g) {
  const L = [`${name}:`];
  for (const key of ['open', 'not_measured', 'met', 'not_applicable']) {
    L.push(`  ${key}:`);
    for (const r of g[key]) L.push(rowYaml(r, '    '));
  }
  return L.join('\n');
}
export function toYaml(runId, yardstickVersion, built) {
  const L = [`# owner.yaml — GENERATED by views/owner.mjs. Do not hand-edit.`, `view: owner`, `run: ${runId}`, `yardstick: ${yardstickVersion}`];
  L.push('counts:');
  for (const g of ['floor', 'beyond_floor']) for (const k of ['open', 'not_measured', 'met', 'not_applicable']) L.push(`  ${g}_${k}: ${built[g][k].length}`);
  L.push(groupYaml('floor', built.floor));
  L.push(groupYaml('beyond_floor', built.beyond_floor));
  L.push('not_looked_at:');
  for (const r of built.not_looked_at) L.push(`  - scanner: ${r.scanner}`, `    status: ${r.status}`, `    reason: ${q(r.reason)}`);
  return L.join('\n') + '\n';
}

// ── the page ──────────────────────────────────────────────────────────────────
const whereText = (r) => (r.where && r.where.length ? r.where.map(mdCode).join(', ')
  : r.findings && r.findings.length ? `map rows ${r.findings.join(', ')} (no file cited)` : mdText(r.reason));

export function renderMd(runId, built, { confidential = false, name, date, commit } = /** @type {any} */ ({})) {
  const { floor, beyond_floor, not_looked_at } = built;
  const out = [];
  out.push('---', 'type: doc', ...(confidential ? ['confidential: true'] : []), `title: "What is true of ${name}, ${date}"`, '---', '');
  out.push(`# What is true of ${name}, ${date}${commit ? `, commit ${commit}` : ''}`, '');

  const floorTotal = floor.open.length + floor.met.length + floor.not_measured.length;
  const tierOrder = ['custody', 'safety', 'reproducibility', 'verification', 'legibility', 'operability'];
  const worstTier = tierOrder.find((t) => floor.open.some((r) => r.tier === t));
  const custodyOrSafetyOpen = floor.open.some((r) => r.tier === 'custody' || r.tier === 'safety');
  const lead = [];
  lead.push(`${floor.open.length} open, ${floor.met.length} met, ${floor.not_measured.length} could-not-tell floor requirement${floorTotal === 1 ? '' : 's'} of ${floorTotal}.`);
  // reassure only about what was decided (F-1217): without a packet the custody rows are
  // claim-only and always could-not-tell, and "nothing is open" would read as "all is well"
  const untold = ['custody', 'safety'].filter((t) => floor.not_measured.some((r) => r.tier === t));
  if (!custodyOrSafetyOpen && !untold.length) lead.push("Nothing about who controls this app, or about something destructive happening unnoticed, is open right now.");
  else if (!custodyOrSafetyOpen) lead.push(`${untold.map((t) => TIER_GLOSS[t]).join(', and ').replace(/^./, (c) => c.toUpperCase())} could not be told this run, so nothing here says ${untold.length > 1 ? 'they are' : 'it is'} in order.`);
  if (worstTier) lead.push(`The most pressing open group is about ${TIER_GLOSS[worstTier]} (${worstTier}).`);
  else if (floor.open.length === 0 && floor.not_measured.length === 0) lead.push('Nothing on the floor is open.');
  out.push(lead.join(' '), '');

  out.push('## Fix in this order', '');
  if (floor.open.length) {
    floor.open.forEach((r, i) => {
      out.push(`### ${i + 1}. ${r.title}`, '');
      out.push(`What could happen: ${r.risk || mdText(r.reason)}`, '');
      out.push(`Where: ${whereText(r)}`, '');
      out.push(`What to do: ${r.fix || 'no fix recorded yet — see the check'}`, '');
      out.push(`How to know it is fixed: ${r.check}`, '');
    });
  } else out.push('_Nothing open on the floor._', '');

  out.push('## Could not tell', '');
  if (floor.not_measured.length) {
    for (const r of floor.not_measured) {
      const asQuestion = r.decided_by === 'owner';
      const titlePart = asQuestion ? `${r.title.replace(/\.$/, '')}?` : `${r.title}.`;
      out.push(`- **${titlePart}** ${mdText(r.reason)} What would tell: ${r.check}`);
    }
  } else out.push('_Every floor requirement was measured this run._');
  out.push('');

  out.push('## Holds', '');
  if (floor.met.length) {
    for (const r of floor.met) out.push(`- **${r.title}.** ${mdText(r.reason)}`);
  } else out.push('_Nothing on the floor is met yet._');
  out.push('');

  if (floor.not_applicable.length) {
    out.push('## Does not apply', '');
    out.push('_Decided from the code itself, not assumed: these requirements have nothing to apply to in this app (for example, no database, so nothing to migrate). They are not counted as met._', '');
    for (const r of floor.not_applicable) out.push(`- **${r.title}.** ${mdText(r.reason)}`);
    out.push('');
  }

  out.push('## Beyond the floor', '');
  const bfTotal = beyond_floor.open.length + beyond_floor.met.length + beyond_floor.not_measured.length + beyond_floor.not_applicable.length;
  out.push(`_The same measurement, for the ${bfTotal} requirement${bfTotal === 1 ? '' : 's'} beyond the floor — what a steward's routines watch, and the AI-operating layer._`, '');
  out.push('### Open', '');
  if (beyond_floor.open.length) {
    for (const r of beyond_floor.open) out.push(`- **${r.title}** _(${r.tier})_ — ${r.risk || mdText(r.reason)} Where: ${whereText(r)}. What to do: ${r.fix} How to know it is fixed: ${r.check}`);
  } else out.push('_Nothing open._');
  out.push('');
  out.push('### Could not tell', '');
  if (beyond_floor.not_measured.length) {
    for (const r of beyond_floor.not_measured) out.push(`- **${r.title}** — ${mdText(r.reason)} What would tell: ${r.check}`);
  } else out.push('_Nothing left to run._');
  out.push('');
  out.push('### Holds', '');
  if (beyond_floor.met.length) {
    for (const r of beyond_floor.met) out.push(`- **${r.title}** — ${mdText(r.reason)}`);
  } else out.push('_Nothing met yet._');
  out.push('');
  if (beyond_floor.not_applicable.length) {
    out.push('### Does not apply', '');
    for (const r of beyond_floor.not_applicable) out.push(`- **${r.title}** — ${mdText(r.reason)}`);
    out.push('');
  }

  out.push('## What was not looked at', '');
  if (not_looked_at.length) {
    for (const r of not_looked_at) out.push(`- **${r.scanner}** — ${r.status}: ${mdText(r.reason)}`);
  } else out.push('_Every adopted scanner ran; nothing was skipped or failed this run._');
  out.push('');

  out.push('---', `_assay evaluation engine. Run \`${runId}\`._`);
  return out.join('\n') + '\n';
}

if (isMain(import.meta.url)) {
  const runDir = process.argv[2];
  if (!runDir) { console.error('usage: node assay.mjs owner <run-dir> [--stdout]'); process.exit(2); }
  const built = buildOwner(runDir);
  if (!built) { console.error(`no yardstick measurement under ${runDir} — run: node assay.mjs measure ${runDir} --write`); process.exit(2); }
  const runId = basename(runDir);
  const yamlOut = toYaml(runId, built.reg.version, built);

  let prose = null, proseConfidential = false;
  try { const pp = runProsePath(runDir); if (existsSync(pp)) { prose = parseYaml(readFileSync(pp, 'utf8')); proseConfidential = prose?.confidential === true; } } catch {}
  const name = (prose && (prose.target_short || prose.target)) || runId;
  const date = (runId.match(/(\d{4}-\d{2}-\d{2})/) || [])[1] || new Date().toISOString().slice(0, 10);
  const commit = prose && typeof prose.commit === 'string' ? prose.commit : null;
  const mdOut = renderMd(runId, built, { confidential: process.argv.includes('--confidential') || proseConfidential, name, date, commit });

  if (process.argv.includes('--stdout')) { process.stdout.write(mdOut); }
  else {
    const yamlDst = viewPath(runDir, 'owner');
    mkdirSync(dirname(yamlDst), { recursive: true });
    writeFileSync(yamlDst, yamlOut);
    writeFileSync(ownerPagePath(runDir), mdOut);
    console.log(`wrote ${yamlDst} + ${ownerPagePath(runDir)} (floor: ${built.floor.open.length} open · ${built.floor.met.length} met · ${built.floor.not_measured.length} could not tell)`);
  }
}
