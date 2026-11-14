#!/usr/bin/env node
// owner.mjs — Owner: what is true of this application? A fourth view of the
// same measurement Intake and Maintain read (yardstick.yaml), joined with the
// register's `owner:` block on every requirement (yardstick/requirements.yaml
// — yardstick/README.md documents the field). Reads ONLY the yardstick's
// measurement, the yardstick (title/check/tier/topic/owner) and the run
// manifest (what was not looked at this run) — never findings directly, and
// it decides nothing a run/census/facet/claim did not already decide
// (views/rows.mjs's buildRows, the one way a view of a population is built).
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
import { buildRows, CONTEXT_LABEL, joinContradictions } from './rows.mjs';
import { loadFindings } from '../map/project.mjs';
import { loadYardstick, loadContradictions, loadRunPacket } from '../yardstick/measure.mjs';
import { isMain } from '../map/doctrine.mjs';
import { parseYaml, q as yq } from '../lib/yaml-min.mjs';
import { viewPath, ownerPagePath, prosePath as runProsePath } from '../lib/run-layout.mjs';
import { mdText, mdCode } from '../lib/display.mjs';
import { severityOf } from './severity.mjs';
import { HOTSPOT_AXIS, hotspotOrder, hotspotNote } from './hotspot.mjs';

// Plain-language gloss for each tier, used only in the lead paragraph — never
// a substitute for the tier id, which still rides at the end (yardstick/README.md
// tiers; meaning first, id last, so the owner reads the plain words first).
const TIER_GLOSS = {
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
// anyone technical who wants the map row. On the code-maintainability topic the
// findings (and so the places) take the hotspot lens's order, and the row carries
// the lens's note (views/hotspot.mjs).
export function ownerRow(r, status, byId, findingById) {
  const d = byId.get(r.id);
  const o = (d && d.owner) || {};
  let findings = r.findings || [], lens = null;
  if (r.topic === HOTSPOT_AXIS) {
    const known = findings.filter((id) => findingById.has(id)).map((id) => { const f = findingById.get(id); return { ...f, severity: severityOf(f) }; });
    if (known.length) {
      findings = [...hotspotOrder(known).map((f) => f.id), ...findings.filter((id) => !findingById.has(id))];
      lens = hotspotNote(known);
    }
  }
  const evidenceOf = (id) => { const f = findingById.get(id); return f && Array.isArray(f.evidence) ? f.evidence.map(String) : []; };
  const where = [...new Set(findings.flatMap(evidenceOf))];
  // what was seen in place (#260): on a met row, the observations of the strengths it cites, so
  // the owner reads what holds, not only that nothing was found missing
  const seen = status === 'met' ? findings.map((id) => findingById.get(id)).filter((f) => f && f.polarity === 'strength' && f.observation).map((f) => String(f.observation).trim()) : [];
  const out = { id: r.id, tier: r.tier, topic: r.topic, title: r.title, status, risk: o.risk || '', fix: o.fix || '', where, findings, seen, check: r.check };
  if (lens) out.lens = lens;
  // a claim row's context (#262): what the run saw on its population, in the owner's words, kept
  // apart from findings/where/seen so it never reads as what the status rests on
  if (r.context && r.context.length) {
    out.context = r.context;
    out.context_seen = r.context.map((id) => findingById.get(id)).filter((f) => f && f.observation).map((f) => String(f.observation).trim());
  }
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
  const findingById = new Map(loadFindings(runDir).map((f) => [f.id, f]));
  const floorBuilt = buildRows(runDir, 'floor');
  const beyondBuilt = buildRows(runDir, (d) => !(d.tags || []).includes('floor'));
  if (!floorBuilt || !beyondBuilt) return null;
  const group = (built) => ({
    open: built.open.map((r) => ownerRow(r, r.status, byId, findingById)),
    not_measured: built.to_run.map((r) => ownerRow(r, 'not-measured', byId, findingById)),
    met: built.met.map((r) => ownerRow(r, 'met', byId, findingById)),
    // decided from the map as not applying to this repository (no database, so nothing
    // to migrate); listed, never folded into met, never dropped — the same bucket
    // Intake carries, so the two views cannot disagree on a row
    not_applicable: (built.not_applicable || []).map((r) => ownerRow(r, 'not-applicable', byId, findingById)),
  });
  // what the run's own packet said (#339): the claims this run contradicts, joined to their titles,
  // and the packet's custody facts; both read off the run, never decided here
  const contradictions = joinContradictions(loadContradictions(runDir), reg);
  const packet = buildOwnerBlock(loadRunPacket(runDir));
  return { floor: group(floorBuilt), beyond_floor: group(beyondBuilt), not_looked_at: floorBuilt.not_seen, contradictions, packet, reg };
}

// ── the owner's packet: what a repository's own packet says about itself ──────
// Facts only, never a verdict (owner/PACKET.md). Shown on OWNER.md as "What the owner
// told us" and written to owner.yaml as `packet:` (views/README.md).
const t = mdText;
const yn3 = (v) => (v === 'yes' || v === 'no' || v === 'unsure' ? v : 'unknown');   // the packet's four answers; 'unsure' is the owner's partial knowledge, never folded into unknown
const orgLabel = (v) => (v === 'yes' ? 'organisational' : v === 'no' ? 'personal' : v === 'unsure' ? 'personal or organisational: unsure' : 'personal or organisational: unknown');
// a role list: undefined/absent -> null ("unknown" — the packet never spoke to
// it); [] -> [] ("nobody can", owner/PACKET.md's own placeholder-free convention);
// a filled list -> itself.
const roleList = (v) => (Array.isArray(v) ? v : null);

// buildOwnerBlock(packet) — the run's own copied packet (yardstick/measure.mjs
// loadRunPacket), reduced to the facts owner/PACKET.md's custody: block carries.
// null when the run has no packet at all. Every sub-object is present even when
// the packet is silent on it, so a consumer never has to guess a missing shape.
export function buildOwnerBlock(packet) {
  if (!packet) return null;
  const custody = packet.custody || {};
  const accounts = Array.isArray(custody.accounts) ? custody.accounts.filter(Boolean) : [];
  const transferable = { yes: 0, no: 0, unsure: 0, unknown: 0 };
  for (const a of accounts) transferable[yn3(a.transferable)]++;
  const credentials = Array.isArray(custody.credentials) ? custody.credentials.filter(Boolean) : [];
  const lives = [...new Set(credentials.map((c) => c.lives).filter(Boolean))];
  const readers = [...new Set(credentials.flatMap((c) => (Array.isArray(c.readers) ? c.readers : [])))];
  const neverRotated = credentials.filter((c) => /^\s*never\b/i.test(String(c.rotated || ''))).length;
  const rotationUnknown = credentials.filter((c) => !c.rotated || /^\s*unknown\b/i.test(String(c.rotated))).length;
  const people = custody.people || {};
  const data = custody.data || {};
  const money = custody.money || {};
  return {
    answered: packet.answered ? { date: packet.answered.date ?? 'unknown', by: packet.answered.by ?? 'unknown', via: packet.answered.via ?? 'unknown' } : null,
    accounts: {
      count: accounts.length,
      personal: accounts.filter((a) => a.organisational === 'no').length,
      organisational: accounts.filter((a) => a.organisational === 'yes').length,
      transferable,
      rows: accounts.map((a) => ({
        what: a.account ?? 'unknown', provider: a.provider ?? 'unknown', owner_role: a.owner_role ?? 'unknown',
        personal_or_organisational: orgLabel(a.organisational), transferable: yn3(a.transferable),
      })),
    },
    credentials: {
      count: credentials.length, lives, never_rotated: neverRotated, rotation_unknown: rotationUnknown, readers,
      rows: credentials.map((c) => ({ name: c.name ?? 'unknown', lives: c.lives ?? 'unknown', readers: Array.isArray(c.readers) ? c.readers : null, rotated: c.rotated ?? 'unknown' })),
    },
    people: { build: roleList(people.build), deploy: roleList(people.deploy), restore: roleList(people.restore), restore_done: yn3(people.restore_done) },
    data: { personal: data.personal ?? 'unknown', leaves_via: Array.isArray(data.leaves_via) ? data.leaves_via : [] },
    money: { monthly: Array.isArray(money.monthly) ? money.monthly.map((m) => ({ provider: m.provider ?? 'unknown', amount: m.amount ?? 'unknown' })) : [], alerts: money.alerts ?? 'unknown' },
    handover: custody.handover ?? 'unknown',
    notes: packet.notes ?? null,
  };
}

const oq = (s) => yq(s == null ? '' : s);
// a free-text list as a block sequence at `indent`: a flow list's commas split an item on read-back
const seq = (arr, indent) => ((arr || []).length ? (arr || []).map((s) => `\n${indent}- ${oq(s)}`).join('') : ' []');
// key: the block's name in the file it is written to (owner.yaml writes it as `packet:`)
export function ownerYaml(owner, key = 'owner') {
  if (!owner) return `${key}: null\n`;
  const L = [`${key}:`];
  L.push(...(owner.answered ? ['  answered:', `    date: ${oq(owner.answered.date)}`, `    by: ${oq(owner.answered.by)}`, `    via: ${oq(owner.answered.via)}`] : ['  answered: null']));
  L.push('  accounts:', `    count: ${owner.accounts.count}`, `    personal: ${owner.accounts.personal}`, `    organisational: ${owner.accounts.organisational}`);
  L.push('    transferable:', `      yes: ${owner.accounts.transferable.yes}`, `      no: ${owner.accounts.transferable.no}`, `      unsure: ${owner.accounts.transferable.unsure}`, `      unknown: ${owner.accounts.transferable.unknown}`);
  if (owner.accounts.rows.length) {
    L.push('    rows:');
    for (const r of owner.accounts.rows) L.push(`      - what: ${oq(r.what)}`, `        provider: ${oq(r.provider)}`, `        owner_role: ${oq(r.owner_role)}`, `        personal_or_organisational: ${oq(r.personal_or_organisational)}`, `        transferable: ${oq(r.transferable)}`);
  } else L.push('    rows: []');
  L.push('  credentials:', `    count: ${owner.credentials.count}`, `    lives:${seq(owner.credentials.lives, '      ')}`, `    never_rotated: ${owner.credentials.never_rotated}`, `    rotation_unknown: ${owner.credentials.rotation_unknown}`, `    readers:${seq(owner.credentials.readers, '      ')}`);
  if (owner.credentials.rows.length) {
    L.push('    rows:');
    for (const r of owner.credentials.rows) L.push(`      - name: ${oq(r.name)}`, `        lives: ${oq(r.lives)}`, `        readers:${r.readers === null ? ' null' : seq(r.readers, '          ')}`, `        rotated: ${oq(r.rotated)}`);
  } else L.push('    rows: []');
  L.push('  people:');
  L.push(`    build:${owner.people.build === null ? ' null' : seq(owner.people.build, '      ')}`);
  L.push(`    deploy:${owner.people.deploy === null ? ' null' : seq(owner.people.deploy, '      ')}`);
  L.push(`    restore:${owner.people.restore === null ? ' null' : seq(owner.people.restore, '      ')}`);
  L.push(`    restore_done: ${oq(owner.people.restore_done)}`);
  L.push('  data:', `    personal: ${oq(owner.data.personal)}`, `    leaves_via:${seq(owner.data.leaves_via, '      ')}`);
  if (owner.money.monthly.length) {
    L.push('  money:', '    monthly:');
    for (const m of owner.money.monthly) L.push(`      - provider: ${oq(m.provider)}`, `        amount: ${oq(m.amount)}`);
    L.push(`    alerts: ${oq(owner.money.alerts)}`);
  } else L.push('  money:', '    monthly: []', `    alerts: ${oq(owner.money.alerts)}`);
  L.push(`  handover: ${oq(owner.handover)}`);
  L.push(`  notes: ${owner.notes == null ? 'null' : oq(owner.notes)}`);
  return L.join('\n') + '\n';
}

export function renderOwnerSection(owner) {
  const out = ['## What the owner told us', ''];
  out.push("_What a repository's own packet says about itself — facts only; assay computes no verdict");
  out.push('here (owner/PACKET.md). Unknowns are shown as unknown, never dropped._', '');
  if (!owner) {
    out.push("_No owner's packet yet: the owner prompt (`assay.mjs ask-owner`) collects these._", '');
    return out;
  }
  const roleLine = (v) => (v === null ? 'unknown' : v.length ? v.map(t).join(', ') : 'nobody');
  const a = owner.accounts;
  out.push(`- **Accounts** — ${a.count} total: ${a.personal} personal, ${a.organisational} organisational. Transferable: ${a.transferable.yes} yes, ${a.transferable.no} no, ${a.transferable.unsure} unsure, ${a.transferable.unknown} unknown.`);
  for (const r of a.rows) out.push(`  - ${t(r.what)} (${t(r.provider)}) — owner: ${t(r.owner_role)}, ${r.personal_or_organisational}, transferable: ${r.transferable}.`);
  const c = owner.credentials;
  out.push(`- **Credentials** — ${c.count} total. Never rotated: ${c.never_rotated}; rotation unknown: ${c.rotation_unknown}.`);
  for (const r of c.rows) out.push(`  - ${t(r.name)} — lives: ${t(r.lives)}; readers: ${r.readers === null ? 'unknown' : r.readers.length ? r.readers.map(t).join(', ') : 'nobody'}; rotated: ${t(r.rotated)}.`);
  const p = owner.people;
  out.push(`- **People** — build: ${roleLine(p.build)}. deploy: ${roleLine(p.deploy)}. restore: ${roleLine(p.restore)}. Restore ever done: ${p.restore_done}.`);
  const d = owner.data;
  out.push(`- **Data** — personal data: ${t(d.personal)}. Leaves via: ${d.leaves_via.length ? d.leaves_via.map(t).join(', ') : 'unknown'}.`);
  const m = owner.money;
  out.push(`- **Money** — ${m.monthly.length ? m.monthly.map((x) => `${t(x.provider)}: ${t(x.amount)}`).join('; ') : 'unknown'}. Alerts: ${t(m.alerts)}.`);
  out.push(`- **Handover** — ${t(owner.handover)}.`);
  if (owner.notes) out.push(`- **Notes** — ${t(owner.notes)}`);
  out.push('');
  if (owner.answered) out.push(`_Answered ${t(owner.answered.date)} by ${t(owner.answered.by)}, via ${t(owner.answered.via)}._`, '');
  return out;
}

// ── YAML (yaml-min's constrained block-only subset — decide: is the load-bearing precedent for a nested map inside a list item) ──
const q = (s) => yq(s == null ? '' : s);
function rowYaml(r, pad) {
  const L = [`${pad}- id: ${r.id}`, `${pad}  tier: ${r.tier}`, `${pad}  topic: ${r.topic}`, `${pad}  title: ${q(r.title)}`, `${pad}  status: ${r.status}`];
  L.push(`${pad}  risk: ${q(r.risk)}`, `${pad}  fix: ${q(r.fix)}`);
  L.push(`${pad}  where: [${(r.where || []).map(q).join(', ')}]`, `${pad}  findings: [${(r.findings || []).join(', ')}]`);
  // free text: a block sequence, since a flow list's commas would split an item on read-back
  L.push((r.seen || []).length ? [`${pad}  seen:`, ...r.seen.map((x) => `${pad}    - ${q(x)}`)].join('\n') : `${pad}  seen: []`);
  L.push(`${pad}  check: ${q(r.check)}`);
  if (r.context && r.context.length) {
    L.push(`${pad}  context: [${r.context.join(', ')}]`);
    L.push(r.context_seen.length ? [`${pad}  context_seen:`, ...r.context_seen.map((x) => `${pad}    - ${q(x)}`)].join('\n') : `${pad}  context_seen: []`);
  }
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
  // a packet claim of satisfied this run found unmet: the claim, the run's status and its findings
  L.push((built.contradictions || []).length ? 'contradictions:' : 'contradictions: []');
  for (const c of built.contradictions || []) L.push(`  - id: ${c.id}`, `    title: ${q(c.title)}`, `    claim: ${c.claim}`, `    run_status: ${c.run_status}`, `    findings: [${(c.findings || []).join(', ')}]`);
  return L.join('\n') + '\n' + ownerYaml(built.packet ?? null, 'packet');
}

// ── the page ──────────────────────────────────────────────────────────────────
// a met row's cited strengths, in the owner's words: what was seen in place, then where
const seenText = (r) => (r.seen && r.seen.length ? `${/[.!?]$/.test(String(r.reason || '').trim()) ? '' : '.'} Seen in place: ${r.seen.map((x) => mdText(x).replace(/\.$/, '')).join('; ')}. Where: ${whereText(r)}.` : '');
// a claim row's context (#262), labelled so it never reads as met or unmet
const contextSeenText = (r) => (r.context && r.context.length ? ` ${CONTEXT_LABEL}: ${(r.context_seen.length ? r.context_seen.map((x) => mdText(x).replace(/\.$/, '')).join('; ') : r.context.join(', '))}.` : '');
const whereText = (r) => (r.where && r.where.length ? r.where.map(mdCode).join(', ') + (r.lens ? ` (${r.lens})` : '')
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
      out.push(`- **${titlePart}** ${mdText(r.reason)} What would tell: ${r.check}${contextSeenText(r)}`);
    }
  } else out.push('_Every floor requirement was measured this run._');
  out.push('');

  out.push('## Holds', '');
  if (floor.met.length) {
    for (const r of floor.met) out.push(`- **${r.title}.** ${mdText(r.reason)}${seenText(r)}${contextSeenText(r)}`);
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
    for (const r of beyond_floor.not_measured) out.push(`- **${r.title}** — ${mdText(r.reason)} What would tell: ${r.check}${contextSeenText(r)}`);
  } else out.push('_Nothing left to run._');
  out.push('');
  out.push('### Holds', '');
  if (beyond_floor.met.length) {
    for (const r of beyond_floor.met) out.push(`- **${r.title}** — ${mdText(r.reason)}${seenText(r)}${contextSeenText(r)}`);
  } else out.push('_Nothing met yet._');
  out.push('');
  if (beyond_floor.not_applicable.length) {
    out.push('### Does not apply', '');
    for (const r of beyond_floor.not_applicable) out.push(`- **${r.title}** — ${mdText(r.reason)}`);
    out.push('');
  }

  // a claim from the owner's own packet this run found the mechanism absent for: never silently
  // overwritten, the claim and the run's own status stand side by side (owner/PACKET.md)
  const contradictions = built.contradictions || [];
  out.push('## Where this run disagrees with what you told us', '');
  out.push("_Your packet said these hold; this run found what they need missing. Neither is overwritten: the claim and what the run found stand side by side._", '');
  if (contradictions.length) {
    for (const c of contradictions) out.push(`- **${mdText(c.title)}** _(${c.id})_ — you said: ${c.claim}. This run: ${c.run_status}${c.findings && c.findings.length ? ` (map rows ${c.findings.join(', ')})` : ''}.`);
  } else out.push('_None._');
  out.push('');

  out.push(...renderOwnerSection(built.packet ?? null));

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
