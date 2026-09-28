#!/usr/bin/env node
// intake.mjs — Intake: can this map be carried? The floor-tagged requirements
// (yardstick/requirements.yaml tags: [floor]) — the bar a repository must clear
// to be taken on at all. Reads ONLY the yardstick's measurement (yardstick.yaml)
// plus the yardstick (title/check/tier/topic) and the run manifest (what was
// not seen this run) — never findings directly.
//
// Writes views/intake.yaml (data) + INTAKE.md (plain, neutral: no prices, no
// verdict, no severity words) at the run root. Also carries "What the owner
// told us" — the run's own copied packet (owner/manifest.yaml, owner/PACKET.md),
// read for FACTS only; assay issues no verdict on any of it. Unknowns are
// shown as "unknown", never dropped — an owner's packet answering "unsure" is
// still an answer worth keeping visible.
//
// Usage: node assay.mjs intake <run-dir> [--stdout]
import { writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { buildRows, toYaml, basisNote, joinContradictions } from './floor-fleet.mjs';
import { loadYardstick, loadContradictions, loadRunPacket } from '../yardstick/measure.mjs';
import { isMain } from '../map/doctrine.mjs';
import { parseYaml } from '../lib/yaml-min.mjs';
import { viewPath, intakePagePath, prosePath as runProsePath } from '../lib/run-layout.mjs';

// ── "What the owner told us" — facts from the run's own packet, never a verdict ──
const yn3 = (v) => (v === 'yes' || v === 'no' ? v : 'unknown');
const orgLabel = (v) => (v === 'yes' ? 'organisational' : v === 'no' ? 'personal' : 'unknown');
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
  const transferable = { yes: 0, no: 0, unknown: 0 };
  for (const a of accounts) transferable[yn3(a.transferable)]++;
  const credentials = Array.isArray(custody.credentials) ? custody.credentials.filter(Boolean) : [];
  const lives = [...new Set(credentials.map((c) => c.lives).filter(Boolean))];
  const readers = [...new Set(credentials.flatMap((c) => (Array.isArray(c.readers) ? c.readers : [])))];
  const neverRotated = credentials.filter((c) => /^\s*never\s*$/i.test(String(c.rotated || ''))).length;
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
    credentials: { count: credentials.length, lives, never_rotated: neverRotated, readers },
    people: { build: roleList(people.build), deploy: roleList(people.deploy), restore: roleList(people.restore), restore_done: yn3(people.restore_done) },
    data: { personal: data.personal ?? 'unknown', leaves_via: Array.isArray(data.leaves_via) ? data.leaves_via : [] },
    money: { monthly: Array.isArray(money.monthly) ? money.monthly.map((m) => ({ provider: m.provider ?? 'unknown', amount: m.amount ?? 'unknown' })) : [], alerts: money.alerts ?? 'unknown' },
    handover: custody.handover ?? 'unknown',
    notes: packet.notes ?? null,
  };
}

// Let the owner's own credential count inform d-credentials-enumerated as a
// NOTE only, on whichever list (open/met/to_run) the run itself put the row —
// it never changes the row's run-decided status (yardstick/README.md: a claim
// never lets presence stand in for enforcement).
export function annotateCredentialsRow(built, owner) {
  if (!owner || !owner.credentials || !owner.credentials.count) return built;
  const n = owner.credentials.count;
  const suffix = ` (the owner listed ${n} credential${n === 1 ? '' : 's'})`;
  for (const list of [built.open, built.met, built.to_run]) {
    const row = list.find((r) => r.id === 'd-credentials-enumerated');
    if (row) row.note = `${row.note}${suffix}`;
  }
  return built;
}

const oq = (s) => `"${String(s == null ? '' : s).replace(/"/g, '\\"')}"`;
const flow = (arr) => `[${(arr || []).map((s) => oq(s)).join(', ')}]`;
export function ownerYaml(owner) {
  if (!owner) return 'owner: null\n';
  const L = ['owner:'];
  L.push(...(owner.answered ? ['  answered:', `    date: ${oq(owner.answered.date)}`, `    by: ${oq(owner.answered.by)}`, `    via: ${oq(owner.answered.via)}`] : ['  answered: null']));
  L.push('  accounts:', `    count: ${owner.accounts.count}`, `    personal: ${owner.accounts.personal}`, `    organisational: ${owner.accounts.organisational}`);
  L.push('    transferable:', `      yes: ${owner.accounts.transferable.yes}`, `      no: ${owner.accounts.transferable.no}`, `      unknown: ${owner.accounts.transferable.unknown}`);
  if (owner.accounts.rows.length) {
    L.push('    rows:');
    for (const r of owner.accounts.rows) L.push(`      - what: ${oq(r.what)}`, `        provider: ${oq(r.provider)}`, `        owner_role: ${oq(r.owner_role)}`, `        personal_or_organisational: ${r.personal_or_organisational}`, `        transferable: ${r.transferable}`);
  } else L.push('    rows: []');
  L.push('  credentials:', `    count: ${owner.credentials.count}`, `    lives: ${flow(owner.credentials.lives)}`, `    never_rotated: ${owner.credentials.never_rotated}`, `    readers: ${flow(owner.credentials.readers)}`);
  L.push('  people:');
  L.push(`    build: ${owner.people.build === null ? 'null' : flow(owner.people.build)}`);
  L.push(`    deploy: ${owner.people.deploy === null ? 'null' : flow(owner.people.deploy)}`);
  L.push(`    restore: ${owner.people.restore === null ? 'null' : flow(owner.people.restore)}`);
  L.push(`    restore_done: ${owner.people.restore_done}`);
  L.push('  data:', `    personal: ${oq(owner.data.personal)}`, `    leaves_via: ${flow(owner.data.leaves_via)}`);
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
  const roleLine = (v) => (v === null ? 'unknown' : v.length ? v.join(', ') : 'nobody');
  const a = owner.accounts;
  out.push(`- **Accounts** — ${a.count} total: ${a.personal} personal, ${a.organisational} organisational. Transferable: ${a.transferable.yes} yes, ${a.transferable.no} no, ${a.transferable.unknown} unknown.`);
  for (const r of a.rows) out.push(`  - ${r.what} (${r.provider}) — owner: ${r.owner_role}, ${r.personal_or_organisational}, transferable: ${r.transferable}.`);
  const c = owner.credentials;
  out.push(`- **Credentials** — ${c.count} total. Lives: ${c.lives.length ? c.lives.join(', ') : 'unknown'}. Never rotated: ${c.never_rotated}. Readers: ${c.readers.length ? c.readers.join(', ') : 'unknown'}.`);
  const p = owner.people;
  out.push(`- **People** — build: ${roleLine(p.build)}. deploy: ${roleLine(p.deploy)}. restore: ${roleLine(p.restore)}. Restore ever done: ${p.restore_done}.`);
  const d = owner.data;
  out.push(`- **Data** — personal data: ${d.personal}. Leaves via: ${d.leaves_via.length ? d.leaves_via.join(', ') : 'unknown'}.`);
  const m = owner.money;
  out.push(`- **Money** — ${m.monthly.length ? m.monthly.map((x) => `${x.provider}: ${x.amount}`).join('; ') : 'unknown'}. Alerts: ${m.alerts}.`);
  out.push(`- **Handover** — ${owner.handover}.`);
  if (owner.notes) out.push(`- **Notes** — ${owner.notes}`);
  out.push('');
  if (owner.answered) out.push(`_Answered ${owner.answered.date} by ${owner.answered.by}, via ${owner.answered.via}._`, '');
  return out;
}

export function renderMd(runId, built, confidential = false, contradictions = [], owner = null) {
  const { open, met, to_run, not_seen } = built;
  const out = [];
  out.push('---', 'type: doc', ...(confidential ? ['confidential: true'] : []), `title: "Intake — ${runId}"`, '---', '');
  out.push(`# Intake — ${runId}`, '');
  out.push('_Can this map be carried? The floor: the requirements a repository must clear to be taken');
  out.push('on at all. Plain and neutral — what is open, what is met, what is still to run, what was not');
  out.push('seen. No prices, no verdict._', '');
  out.push(`**${open.length} open · ${met.length} met · ${to_run.length} to run** of ${open.length + met.length + to_run.length} floor requirements.`, '');

  out.push('## Open', '');
  if (open.length) {
    for (const r of open) out.push(`- **${r.id}** _(${r.tier}/${r.topic})_ — ${r.title}. Today: ${r.status}${basisNote(r)}${r.of != null ? ` (${r.met} of ${r.of})` : ''} — ${r.note}. Proving check: ${r.check}.`);
  } else out.push('_Nothing open._');
  out.push('');

  out.push('## Met', '');
  if (met.length) {
    for (const r of met) out.push(`- **${r.id}** _(${r.tier}/${r.topic})_ — ${r.title}. ${r.note} (met${basisNote(r)}).`);
  } else out.push('_Nothing met yet._');
  out.push('');

  out.push('## To run', '');
  if (to_run.length) {
    for (const r of to_run) out.push(`- **${r.id}** _(${r.tier}/${r.topic})_ — ${r.title}. Decided by ${r.decided_by}. Proving check: ${r.check}. ${r.note}`);
  } else out.push('_Nothing left to run._');
  out.push('');

  out.push('## Contradicted claims', '');
  out.push("_A repository's own packet said satisfied; this run found the mechanism absent. Never silently");
  out.push("overwritten — the claim, the run's own status, and its findings all stand, side by side._", '');
  if (contradictions.length) {
    for (const c of contradictions) out.push(`- **${c.id}** _(claimed satisfied)_ — ${c.title}. This run: ${c.run_status}${c.findings.length ? ` (${c.findings.join(', ')})` : ''}.`);
  } else out.push('_None._');
  out.push('');

  out.push('## Not seen this run', '');
  if (not_seen.length) {
    for (const r of not_seen) out.push(`- **${r.scanner}** — ${r.status}: ${r.reason}`);
  } else out.push('_Every adopted scanner ran._');
  out.push('');

  out.push(...renderOwnerSection(owner));

  out.push('---', `_assay evaluation engine. Run \`${runId}\`._`);
  return out.join('\n') + '\n';
}

if (isMain(import.meta.url)) {
  const runDir = process.argv[2];
  if (!runDir) { console.error('usage: node assay.mjs intake <run-dir> [--stdout]'); process.exit(2); }
  const built = buildRows(runDir, 'floor');
  if (!built) { console.error(`no yardstick measurement under ${runDir} — run: node assay.mjs measure ${runDir} --write`); process.exit(2); }
  const reg = loadYardstick();
  const runId = basename(runDir);
  const contradictions = joinContradictions(loadContradictions(runDir), reg);
  const owner = buildOwnerBlock(loadRunPacket(runDir));
  annotateCredentialsRow(built, owner);
  const yamlOut = toYaml('intake', runId, reg.version, built, contradictions) + ownerYaml(owner);
  // run-level confidentiality, the same rule as the Improve writers: the flag or views/improve/prose.yaml
  let proseConfidential = false;
  try { const pp = runProsePath(runDir); if (existsSync(pp)) proseConfidential = parseYaml(readFileSync(pp, 'utf8'))?.confidential === true; } catch {}
  const mdOut = renderMd(runId, built, process.argv.includes('--confidential') || proseConfidential, contradictions, owner);
  if (process.argv.includes('--stdout')) { process.stdout.write(mdOut); }
  else {
    const yamlDst = viewPath(runDir, 'intake');
    mkdirSync(dirname(yamlDst), { recursive: true });
    writeFileSync(yamlDst, yamlOut);
    writeFileSync(intakePagePath(runDir), mdOut);
    console.log(`wrote ${yamlDst} + ${intakePagePath(runDir)} (${built.open.length} open · ${built.met.length} met · ${built.to_run.length} to run · ${contradictions.length} contradicted)`);
  }
}
