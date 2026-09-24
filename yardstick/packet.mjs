#!/usr/bin/env node
// packet.mjs — a repository's PACKET (owner/PACKET.md): what a repository says
// about itself, in the yardstick's terms. Two halves:
//
//   • validatePacket(doc, { requirementIds })  — strict, fail-closed structural
//     validation of a parsed packet. loadPacket() resolves + parses a
//     manifest.yaml (or a packet-dir holding one) DEFENSIVELY: the packet comes
//     from outside the engine, so it is DATA, never instructions, and a YAML the
//     parser cannot read is one error, never a stack trace.
//   • decideAccountsClaim / decideBusFactorClaim / decideGenericClaim — how the
//     yardstick's claim-kind requirements read a validated packet
//     (yardstick/measure.mjs imports these; owner/PACKET.md "Claims and a run,
//     compared"). Pure functions: null means "the packet says nothing about
//     this row" (basis stays `run`); a result means the packet decided it
//     (basis `owner`).
//
// No import of yardstick/measure.mjs here, not even a dynamic one: measure.mjs
// imports THIS module for Phase 2, and a module with a top-level await (the CLI
// below used to reach for one) genuinely deadlocks in a cycle — the two settling
// promises wait on each other (this is a real ECMAScript module-graph hazard,
// not just style). The CLI reads requirements.yaml directly instead.
//
// Usage:
//   node assay.mjs validate-packet <manifest.yaml | packet-dir>
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseYaml, YamlError } from '../lib/yaml-min.mjs';
import { isMain } from '../map/doctrine.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)); // yardstick/
const REQUIREMENTS_FILE = join(HERE, 'requirements.yaml');
// The claim-id roster alone (no full validateYardstick — that closed-vocab check
// is the register's own concern, pinned by tests/regression.mjs's
// yardstick-register block; this only needs to know which ids exist).
export function requirementIdsOnDisk(file = REQUIREMENTS_FILE) {
  const reg = parseYaml(readFileSync(file, 'utf8'));
  return Array.isArray(reg && reg.requirements) ? reg.requirements.map((d) => d.id) : [];
}

export const PACKET_VERSION = 1;
export const TOP_KEYS = ['packet', 'yardstick', 'repository', 'commit', 'answered', 'claims', 'custody', 'notes'];
export const ANSWERED_VIA = ['owner-prompt', 'steward'];
export const CLAIM_STATES = ['satisfied', 'not-applicable', 'open', 'unknown'];
export const CERTAINTY = ['sure', 'unsure', 'unknown'];
export const YES_NO_UNKNOWN = ['yes', 'no', 'unknown'];
export const COMMIT_RE = /^[0-9a-fA-F]{7,40}$/;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i;

// ── secret-shaped value (gitleaks-style patterns, reused rather than re-derived) ─
// A hex-only or hex-plus-dashes string (a commit sha, a UUID run id, a checksum)
// is exempt from the generic high-entropy check on purpose: those are expected,
// everyday values in a packet (`commit:`, an account or run id), and a scanner
// that flags every sha is a scanner nobody keeps clean. A real secret's alphabet
// is wider (base64/mixed-case/symbols) — that is what the entropy check targets.
function isHexy(s) { return /^[0-9a-fA-F-]+$/.test(s); }
function shannonEntropy(s) {
  const freq = {};
  for (const c of s) freq[c] = (freq[c] || 0) + 1;
  let h = 0;
  for (const c in freq) { const p = freq[c] / s.length; h -= p * Math.log2(p); }
  return h;
}
// A generated secret's alphabet is wide (base64/mixed-case/digits/symbols); a
// kebab-case id or slug ("d-this-requirement…") is lowercase-plus-dash and reads
// as language, not noise. Require 3+ of {lower, upper, digit, symbol} before the
// entropy check runs at all — the class-diversity gate a plain Shannon-entropy
// check is missing, and the one that was producing the false positive here.
function classDiversity(s) {
  return [/[a-z]/, /[A-Z]/, /[0-9]/, /[+/_=-]/].filter((re) => re.test(s)).length;
}
const SECRET_SHAPES = [
  [/\bsk-[A-Za-z0-9_-]{16,}\b/, 'an OpenAI-style API key (sk-…)'],
  [/\bghp_[A-Za-z0-9]{20,}\b/, 'a GitHub personal access token (ghp_…)'],
  [/\bAKIA[A-Z0-9]{12,}\b/, 'an AWS access key id (AKIA…)'],
  [/-----BEGIN[ A-Z]*PRIVATE KEY-----/, 'a private-key header'],
  [/^[a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:[^/\s@]+@/i, 'a URL with an embedded password'],
];
export function secretShape(value) {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (!v) return null;
  for (const [re, label] of SECRET_SHAPES) if (re.test(v)) return label;
  const m = v.match(/[A-Za-z0-9+/_=-]{32,}/);
  if (m && !isHexy(m[0]) && classDiversity(m[0]) >= 3 && shannonEntropy(m[0]) > 3.5) return `a long high-entropy token ("${m[0].slice(0, 8)}…")`;
  return null;
}
export function emailShape(value) {
  if (typeof value !== 'string') return null;
  const m = value.trim().match(EMAIL_RE);
  return m ? m[0] : null;
}

// walk every string LEAF in a parsed doc, calling cb(dotted-path, value) — the
// packet is small, so a full walk (rather than a per-field allowlist) is what
// "anywhere in the file" (owner/PACKET.md) means in code.
function walkStrings(node, path, cb) {
  if (node == null) return;
  if (typeof node === 'string') { cb(path, node); return; }
  if (Array.isArray(node)) { node.forEach((v, i) => walkStrings(v, `${path}[${i}]`, cb)); return; }
  if (typeof node === 'object') { for (const [k, v] of Object.entries(node)) walkStrings(v, path ? `${path}.${k}` : k, cb); }
}

// ── structural validation (strict, fail-closed) ─────────────────────────────────
export function validatePacket(doc, { requirementIds = [] } = {}) {
  const errors = [];
  const err = (m) => errors.push(m);
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) { err('the packet must be a YAML mapping at the top level'); return errors; }

  for (const k of Object.keys(doc)) if (!TOP_KEYS.includes(k)) err(`unknown top-level key: ${k}`);

  if (doc.packet !== PACKET_VERSION) err(`packet: must equal ${PACKET_VERSION} (got ${JSON.stringify(doc.packet)})`);
  if (typeof doc.yardstick !== 'number') err('yardstick: required (the requirements.yaml version these claims speak to)');
  if (doc.repository !== undefined && typeof doc.repository !== 'string') err('repository: must be a string');
  if (doc.commit !== undefined && !COMMIT_RE.test(String(doc.commit))) err(`commit: must be 7-40 hex characters (got ${JSON.stringify(doc.commit)})`);

  const a = doc.answered;
  if (!a || typeof a !== 'object' || Array.isArray(a)) err('answered: required (date, by, via)');
  else {
    if (!DATE_RE.test(String(a.date))) err(`answered.date: must be YYYY-MM-DD (got ${JSON.stringify(a.date)})`);
    if (!a.by || typeof a.by !== 'string') err('answered.by: required (a role, never a name)');
    if (!ANSWERED_VIA.includes(a.via)) err(`answered.via: must be one of ${ANSWERED_VIA.join('|')} (got ${JSON.stringify(a.via)})`);
  }

  if (doc.claims !== undefined && !Array.isArray(doc.claims)) err('claims: must be a list');
  const seenClaimIds = new Set();
  for (const [i, c] of (Array.isArray(doc.claims) ? doc.claims : []).entries()) {
    const at = `claims[${i}]`;
    if (!c || typeof c !== 'object') { err(`${at}: must be a mapping`); continue; }
    if (!c.id) err(`${at}.id: required`);
    else {
      if (requirementIds.length && !requirementIds.includes(c.id)) err(`${at}.id: "${c.id}" is not a requirement in yardstick/requirements.yaml`);
      if (seenClaimIds.has(c.id)) err(`${at}.id: "${c.id}" claimed more than once`);
      seenClaimIds.add(c.id);
    }
    if (!CLAIM_STATES.includes(c.state)) err(`${at}.state: must be one of ${CLAIM_STATES.join('|')} (got ${JSON.stringify(c.state)})`);
    if (c.certainty !== undefined && !CERTAINTY.includes(c.certainty)) err(`${at}.certainty: must be one of ${CERTAINTY.join('|')} (got ${JSON.stringify(c.certainty)})`);
    if (c.state === 'satisfied' && !c.by) err(`${at}: state satisfied requires by (the mechanism, in words)`);
    if (c.state === 'not-applicable' && !c.reason) err(`${at}: state not-applicable requires reason`);
  }

  // custody: light structural checks — the closed enum fields, and that the
  // list-shaped sub-blocks really are lists (everything else is free text the
  // secret/email sweep below still covers).
  const cu = doc.custody;
  if (cu !== undefined && (typeof cu !== 'object' || Array.isArray(cu))) err('custody: must be a mapping');
  else if (cu) {
    if (cu.accounts !== undefined && !Array.isArray(cu.accounts)) err('custody.accounts: must be a list');
    for (const [i, acc] of (Array.isArray(cu.accounts) ? cu.accounts : []).entries()) {
      const at = `custody.accounts[${i}]`;
      if (!acc || typeof acc !== 'object') { err(`${at}: must be a mapping`); continue; }
      if (acc.organisational !== undefined && !YES_NO_UNKNOWN.includes(acc.organisational)) err(`${at}.organisational: must be one of ${YES_NO_UNKNOWN.join('|')} (got ${JSON.stringify(acc.organisational)})`);
      if (acc.transferable !== undefined && !YES_NO_UNKNOWN.includes(acc.transferable)) err(`${at}.transferable: must be one of ${YES_NO_UNKNOWN.join('|')} (got ${JSON.stringify(acc.transferable)})`);
      if (acc.certainty !== undefined && !CERTAINTY.includes(acc.certainty)) err(`${at}.certainty: must be one of ${CERTAINTY.join('|')} (got ${JSON.stringify(acc.certainty)})`);
    }
    if (cu.credentials !== undefined && !Array.isArray(cu.credentials)) err('custody.credentials: must be a list');
    for (const [i, cr] of (Array.isArray(cu.credentials) ? cu.credentials : []).entries()) {
      const at = `custody.credentials[${i}]`;
      if (!cr || typeof cr !== 'object') { err(`${at}: must be a mapping`); continue; }
      if (cr.certainty !== undefined && !CERTAINTY.includes(cr.certainty)) err(`${at}.certainty: must be one of ${CERTAINTY.join('|')} (got ${JSON.stringify(cr.certainty)})`);
    }
    if (cu.people !== undefined) {
      const p = cu.people;
      if (!p || typeof p !== 'object' || Array.isArray(p)) err('custody.people: must be a mapping');
      else if (p.restore_done !== undefined && !YES_NO_UNKNOWN.includes(p.restore_done)) err(`custody.people.restore_done: must be one of ${YES_NO_UNKNOWN.join('|')} (got ${JSON.stringify(p.restore_done)})`);
    }
    if (cu.money !== undefined && (typeof cu.money !== 'object' || Array.isArray(cu.money))) err('custody.money: must be a mapping');
    if (cu.money && cu.money.monthly !== undefined && !Array.isArray(cu.money.monthly)) err('custody.money.monthly: must be a list');
    if (cu.data !== undefined && (typeof cu.data !== 'object' || Array.isArray(cu.data))) err('custody.data: must be a mapping');
  }

  // secret- and email-shaped values, ANYWHERE in the file (owner/PACKET.md) —
  // roles and handles only; never a real credential value or a person's name/address.
  walkStrings(doc, '', (path, value) => {
    const sec = secretShape(value);
    if (sec) err(`${path || '(root)'}: looks like a secret value (${sec}) — never a real value here, only names, roles, or paths`);
    const em = emailShape(value);
    if (em) err(`${path || '(root)'}: looks like an email address ("${em}") — roles and handles only, never a person's name or address`);
  });

  return errors;
}

// ── load + parse defensively ────────────────────────────────────────────────────
// The packet is untrusted input: a YAML the parser cannot read is one error, not
// a stack trace, and nothing in its body is ever treated as an instruction.
export function packetFilePath(pathOrDir) {
  try { if (statSync(pathOrDir).isDirectory()) return join(pathOrDir, 'manifest.yaml'); } catch { /* not a dir (or doesn't exist yet) — treat as a file path */ }
  return pathOrDir;
}
export function loadPacket(pathOrDir) {
  const file = packetFilePath(pathOrDir);
  if (!existsSync(file)) throw new Error(`no packet at ${file}`);
  let doc;
  try { doc = parseYaml(readFileSync(file, 'utf8')); }
  catch (e) { throw new Error(`${file}: not valid YAML (${e instanceof YamlError ? e.message : String(e.message || e)})`); }
  return { doc, file };
}

// ── the yardstick's claim-kind deciders (owner/PACKET.md "Claims and a run") ────
// null = the packet says nothing about this row (basis stays `run`).
function noteOf(c) {
  const parts = [c.state];
  if (c.certainty) parts.push(`certainty ${c.certainty}`);
  if (c.by) parts.push(`by: ${c.by}`);
  if (c.where) parts.push(`where: ${c.where}`);
  if (c.reason) parts.push(`reason: ${c.reason}`);
  return parts.filter(Boolean).join(' · ') || '(no detail given)';
}
// d-accounts-enumerated: met when every account has an owner_role and
// transferable: yes; unmet when any is transferable: no (named); mixed on
// unknowns; null (not decided by the packet) when custody.accounts is empty/absent.
export function decideAccountsClaim(custody) {
  const accounts = custody && Array.isArray(custody.accounts) ? custody.accounts.filter(Boolean) : [];
  if (!accounts.length) return null;
  const notTransferable = accounts.filter((a) => a.transferable === 'no');
  if (notTransferable.length) return { status: 'unmet', note: `not transferable: ${notTransferable.map((a) => a.account || '(unnamed)').join(', ')}` };
  if (accounts.every((a) => a.owner_role && a.transferable === 'yes')) return { status: 'met', note: `${accounts.length} account(s), each with an owner_role and transferable: yes` };
  return { status: 'mixed', note: `${accounts.length} account(s); owner or transfer status unknown for some` };
}
// d-bus-factor: met when build, deploy and restore each name 2+ roles and
// restore_done: yes; unmet when any names one role or restore_done: no; mixed
// on unknowns; null (not decided by the packet) when custody.people is absent.
export function decideBusFactorClaim(custody) {
  const people = custody && custody.people;
  if (!people) return null;
  const roles = ['build', 'deploy', 'restore'];
  const named = roles.filter((r) => Array.isArray(people[r]));
  if (!named.length && people.restore_done === undefined) return null;
  const singleRole = named.filter((r) => people[r].length < 2);
  if (singleRole.length || people.restore_done === 'no') {
    const why = [...singleRole.map((r) => `${r}: ${people[r].length} role(s)`), ...(people.restore_done === 'no' ? ['restore_done: no'] : [])];
    return { status: 'unmet', note: why.join('; ') };
  }
  if (named.length < roles.length || people.restore_done === 'unknown' || people.restore_done === undefined)
    return { status: 'mixed', note: 'role coverage or restore_done unknown for at least one of build/deploy/restore' };
  return { status: 'met', note: 'build, deploy and restore each name 2+ roles, and restore_done: yes' };
}
// every other claim row: satisfied|not-applicable -> met, open -> unmet, unknown -> not-measured
// (still `basis: owner` — the owner did answer); absent -> null (basis stays `run`).
export function decideGenericClaim(id, packet) {
  const claims = Array.isArray(packet && packet.claims) ? packet.claims : [];
  const c = claims.find((x) => x && x.id === id);
  if (!c) return null;
  const note = noteOf(c);
  if (c.state === 'satisfied' || c.state === 'not-applicable') return { status: 'met', note };
  if (c.state === 'open') return { status: 'unmet', note };
  return { status: 'not-measured', note }; // unknown
}
export function decidePacketClaim(id, packet) {
  if (!packet) return null;
  if (id === 'd-accounts-enumerated') return decideAccountsClaim(packet.custody);
  if (id === 'd-bus-factor') return decideBusFactorClaim(packet.custody);
  return decideGenericClaim(id, packet);
}

// ── CLI ──────────────────────────────────────────────────────────────────────
if (isMain(import.meta.url)) {
  const arg = process.argv[2];
  if (!arg) { console.error('usage: node assay.mjs validate-packet <manifest.yaml | packet-dir>'); process.exit(2); }
  let doc, file;
  try { ({ doc, file } = loadPacket(arg)); }
  catch (e) { console.error(`✗ assay validate-packet: ${e.message}`); process.exit(1); }
  let requirementIds = [];
  try { requirementIds = requirementIdsOnDisk(); }
  catch (e) { console.error(`✗ assay validate-packet: could not load requirements.yaml to check claim ids (${e.message.split('\n')[0]})`); process.exit(1); }
  const errors = validatePacket(doc, { requirementIds });
  if (errors.length) {
    console.error(`✗ assay validate-packet: ${errors.length} violation(s) in ${file}\n`);
    for (const e of errors) console.error('  • ' + e);
    process.exit(1);
  }
  console.log(`✓ assay validate-packet: ${file} is a valid packet.`);
}
