#!/usr/bin/env node
// compile-axes.mjs — the WALK. Compiles a findings base into per-axis profiles
// over the flat axis roster (integration/scanner-contract.md): each axis carries
// its measured-by line, properties to preserve, severity-ranked risks (with
// file:line), and a posture line. The delegation axis leads with the computed
// attack chains. No single safe-to-run verdict — each axis carries its own
// posture. Axes are property-named and shared, so
// two scanners measuring one property corroborate in one section; provenance
// rides on each finding (`source`), and an axis no present scanner measures
// reads "not measured", never "clean". Scanner text is escaped at the boundary
// (it comes from an untrusted target repo).
//
// Usage:  node tools/compile-axes.mjs <run-dir> [--base <dir>]... [--stdout]
import { writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadFindings, loadAdapters, projectMulti, contributedBySources, rosterFor, orderAxes, axisTitle } from './project.mjs';
import { buildChains } from './chains.mjs';
import { sevRank, buildFixSpine } from './doctrine.mjs';

const arg = process.argv[2];
if (!arg) { console.error('usage: node tools/compile-axes.mjs <run-dir> [--base <dir>]... [--stdout]'); process.exit(2); }
const toStdout = process.argv.includes('--stdout');
const evalDir = existsSync(join(arg, 'eval')) ? join(arg, 'eval') : arg;
const extraBases = [];
for (let i = 2; i < process.argv.length; i++) if (process.argv[i] === '--base') extraBases.push(process.argv[++i]);

// ── load + union (dedup by id: fail loud on a conflicting body, drop identical) ──
let raw = loadFindings(arg);
for (const b of extraBases) raw = raw.concat(loadFindings(b));
const byId = new Map();
for (const f of raw) {
  if (byId.has(f.id)) {
    const prev = byId.get(f.id);
    if (JSON.stringify(prev) !== JSON.stringify(f)) { console.error(`ERROR: id ${f.id} appears twice with different bodies (--base collision)`); process.exit(1); }
    continue; // identical duplicate — drop
  }
  byId.set(f.id, f);
}
const findings = [...byId.values()];
if (!findings.length) { console.error(`no findings under ${arg}`); process.exit(2); }

const adapters = loadAdapters();
const { projected, unmapped, needsAxis } = projectMulti(findings, adapters);
if (unmapped.length) {
  console.error(`PROJECTION HALTED (fail-closed) — ${unmapped.length} unmapped:`);
  for (const u of unmapped) console.error(`  - ${u.id}: ${u.cat}`);
  process.exit(1);
}
const sources = [...new Set(projected.map((p) => p.source))].sort();
const contributed = contributedBySources(adapters, sources);
const roster = rosterFor(adapters, sources, projected);
// the full registry: axes ANY installed adapter contributes — the honesty baseline
// for "not measured this run" (a known axis whose measuring scanner did not run).
const registryAxes = orderAxes([...contributedBySources(adapters, Object.keys(adapters))]);
const notMeasured = registryAxes.filter((a) => !contributed.has(a));

// ── helpers ──────────────────────────────────────────────────────────────────
// Escape scanner-supplied text (from an untrusted target repo): neutralize HTML
// and markdown link/image injection so a crafted app/package name can't smuggle a
// link or tag into the report. (Handoff prompt-fencing is compile-handoff's job.)
const esc = (s) => String(s || '').replace(/\s+/g, ' ').trim()
  .replace(/[<>]/g, (c) => (c === '<' ? '&lt;' : '&gt;'))
  .replace(/!\[/g, '! [').replace(/\]\(/g, '] (');
// Keep the full sentence (incl. the "…so X" consequence); only ellipsize a genuinely long one.
const say = (s, n = 240) => { const t = esc(s); return t.length > n ? t.slice(0, n) + '…' : t; };
const ev1 = (f) => { const e = (f.evidence || [])[0]; return e ? String(e).replace(/^.*\//, '') : ''; };

// bucket by axis: primary + cross-listed (marked)
const by = Object.fromEntries(roster.map((a) => [a, []]));
for (const p of projected) {
  by[p.axis].push({ ...p, cross: false });
  for (const a of p.also) if (by[a]) by[a].push({ ...p, cross: true });
}
const primaries = (a) => by[a].filter((p) => !p.cross);
// who measures / feeds each axis (provenance on the section, identity on the finding)
const measuredBy = (a) => sources.filter((s) => (adapters[s]?.contributes || []).includes(a));
const fedBy = (a) => [...new Set(by[a].map((p) => p.source))].filter((s) => !measuredBy(a).includes(s));

// ── severity census + start-here ─────────────────────────────────────────────
const sevCount = {}; let unrated = 0;
for (const p of projected) { if (p.f.severity) sevCount[p.f.severity] = (sevCount[p.f.severity] || 0) + 1; else unrated++; }
const censusStr = ['Blocker', 'Critical', 'High', 'Medium', 'Low', 'Nit'].filter((s) => sevCount[s]).map((s) => `${sevCount[s]} ${s}`).join(' · ')
  + (unrated ? ` · ${unrated} unrated (repo-eval carries no severity)` : '');
const topRisks = projected.filter((p) => p.f.polarity === 'gap' && sevRank(p.f.severity) <= 2)
  .sort((a, b) => sevRank(a.f.severity) - sevRank(b.f.severity));

// ── render ───────────────────────────────────────────────────────────────────
const out = [];
out.push('---', 'type: doc', 'confidential: true', `title: "Axis walk (${sources.join(' + ')})"`, '---');
out.push(`# Axis walk — ${arg}`, '');
out.push('_No single safe-to-run verdict: one flat axis roster, each axis its own posture.');
out.push('Severity is a property; the go/no-go is the reader\'s._', '');
out.push(`**Scanners:** ${sources.join(', ')} · **${projected.length} findings** · **severity:** ${censusStr}.`, '');
if (topRisks.length) {
  out.push('**Start here** — the Critical & High across every axis:');
  for (const p of topRisks) out.push(`- ${p.f.id} _(${p.f.severity})_ [${p.axis}] — ${say(p.f.observation, 140)} \`${ev1(p.f)}\``);
  out.push('');
}

// Roster map — which scanners measure each axis. Coverage is a CAPABILITY the
// scanner declares (`contributes:`), never inferred from a count.
out.push('**The roster** _(an axis no present scanner measures is "not measured", never "clean")_:');
for (const a of roster) {
  const mb = measuredBy(a), fb = fedBy(a);
  out.push(`- \`${a}\` ← ${mb.length ? mb.join(', ') : '**(no present scanner measures this axis)**'}${fb.length ? ` · fed by ${fb.join(', ')}` : ''}`);
}
if (notMeasured.length) out.push(`- _not measured this run:_ ${notMeasured.map((a) => `\`${a}\``).join(', ')} _(known axes whose measuring scanner did not run)_`);
out.push('');

for (const a of roster) {
  const arr = by[a];
  const prim = primaries(a);
  const crossN = arr.length - prim.length;
  const mb = measuredBy(a), fb = fedBy(a);
  out.push(`## ${axisTitle(a)}`, '');
  out.push(`_Measured by ${mb.length ? mb.join(', ') : 'no present scanner'}${fb.length ? `; fed by ${fb.join(', ')}` : ''}._`, '');
  if (!mb.length && prim.length) {
    out.push(`> **Not measured** — no present scanner's own method covers this axis; the findings below were fed in by ${fb.join(', ')} and are real, but they are not a measure of the axis.`, '');
  }
  if (!prim.length) {
    out.push(crossN
      ? `> **No primary findings** — ${crossN} finding(s) touch it as a compound cross-link only.`
      : `> **No findings recorded** — the covering pass surfaced nothing, or this base predates the pass. Absence of findings is not a certified clean.`);
    out.push('');
    if (!crossN) continue;
  }
  const strengths = prim.filter((p) => p.f.polarity === 'strength');
  const gaps = prim.filter((p) => p.f.polarity === 'gap').sort((x, y) => sevRank(x.f.severity) - sevRank(y.f.severity));
  const facts = prim.filter((p) => p.f.polarity === 'fact');
  if (prim.length) out.push(`**${prim.length} findings** — ${strengths.length} held · ${gaps.length} open · ${facts.length} facts${crossN ? ` · +${crossN} cross-listed` : ''}.`, '');

  // the delegation axis leads with the computed attack chains (untrusted-input →
  // unguarded-effect; computed and ranked, never authored)
  if (a === 'delegation') {
    try {
      const ch = buildChains(findings);
      const live = ch.live?.length || 0;
      out.push(`**Attack chains (computed):** ${live} live` + (live ? ` — lead: ${esc(ch.live[0].entry?.label)} → ${esc(ch.live[0].headline?.label)}` : '') +
        `, ${ch.held?.length || 0} held, ${ch.contained?.length || 0} contained. _(untrusted-input → unguarded-effect; the safety floor)_`, '');
    } catch { /* chains optional */ }
  }
  if (strengths.length) {
    out.push('**Properties to preserve** _(don\'t regress these)_:');
    for (const p of strengths.slice(0, 5)) out.push(`- ${p.f.id} — ${say(p.f.observation)} \`${ev1(p.f)}\``);
    out.push('');
  }
  if (gaps.length) {
    out.push('**Risks open** _(severity-ranked)_:');
    for (const p of gaps) {
      const sev = p.f.severity ? ` _(${p.f.severity})_` : '';
      const src = p.source !== 'repo-eval' ? ` [${p.source}]` : '';
      out.push(`- ${p.f.id}${sev}${src} — ${say(p.f.observation)} \`${ev1(p.f)}\``);
    }
    out.push('');
  }
  if (crossN) {
    out.push('**Cross-listed here (primary elsewhere):**');
    for (const p of arr.filter((x) => x.cross)) out.push(`- ${p.f.id} _(primary: ${p.axis})_ — ${say(p.f.observation, 120)}`);
    out.push('');
  }
  const top = gaps[0];
  out.push(`_Posture: ${gaps.length} open · ${strengths.length} held` +
    (top ? ` · worst: ${top.f.id}${top.f.severity ? ' ' + top.f.severity : ''}` : '') + '._', '');
}

// ── not measured this run — the honesty register (never a dead gauge) ────────
if (notMeasured.length) {
  out.push('# Not measured this run', '');
  out.push('_Known axes whose measuring scanner did not run. Absence of findings there is');
  out.push('absence of looking, not health. The candidate roster for filling an axis is');
  // Name the roster, do not link it: view-axes.md ships in the run bundle and the
  // run travels with its subject (SCHEMA §5), so a bundle-root-absolute link into
  // the assay engine resolves nowhere but the engine repo.
  out.push('`integration/scanner-candidates.md` in the assay engine._', '');
  for (const a of notMeasured) {
    const owners = Object.values(adapters).filter((ad) => (ad.contributes || []).includes(a)).map((ad) => ad.scanner);
    out.push(`- **\`${a}\`** — measured by ${owners.join(', ')} (not run).`);
  }
  out.push('');
}

// ── open questions (unverified findings route to the owner) ──────────────────
const unverified = projected.filter((p) => p.f.confidence === 'unverified');
if (unverified.length) {
  out.push('# Open questions for the team', '', '_The read-only review could not settle these — route to an owner._', '');
  for (const p of unverified) out.push(`- ${p.f.id} [${p.axis}] — ${say(p.f.observation, 160)}`);
  out.push('');
}

// ── unclassified (needsAxis — never silently dropped) ────────────────────────
if (needsAxis.length) {
  out.push('# Unclassified findings _(awaiting a per-finding axis — excluded from the spine until re-homed)_', '');
  for (const n of needsAxis) out.push(`- ${n.id} — ${say(n.f?.observation, 160)}`);
  out.push('');
}

// ── remediation spine: severity-banded, DEDUPED (a human summary; the machine-actionable
// version with evidence + proof is handoff/REMEDIATION.md) ──
const spineMap = buildFixSpine(projected.filter((p) => p.f.polarity === 'gap'));
if (spineMap.size) {
  out.push('# Remediation spine (summary)', '');
  out.push('_Every actionable gap with a fix, grouped by axis then severity, quoting each scanner\'s');
  out.push('fix verbatim. Deduped across findings that share a fix. This is the human summary; the');
  out.push('machine-actionable version — with evidence paths and a proof step per fix — is `handoff/REMEDIATION.md`._', '');
  for (const a of roster) {
    const m = spineMap.get(a); if (!m) continue;
    const items = [...m.values()].sort((x, y) => sevRank(x.sev) - sevRank(y.sev));
    if (!items.length) continue;
    out.push(`## ${a}`);
    let band = null;
    for (const it of items) {
      const b = it.sev || 'unrated';
      if (b !== band) { band = b; out.push(`**${band}:**`); }
      out.push(`- ${it.ids.join(', ')} [${it.source}] — ${say(it.fix, 180)}`);
    }
    out.push('');
  }
}

const text = out.join('\n') + '\n';
if (toStdout) process.stdout.write(text);
else { const dst = join(evalDir, 'view-axes.md'); writeFileSync(dst, text); console.log(`wrote ${dst} (${projected.length} findings, ${roster.length} axes, scanners: ${sources.join(', ')})`); }
