#!/usr/bin/env node
// ask-owner.mjs — prints owner/ask-owner.md with {{WHAT_WE_FOUND}} filled in
// from a run's map, or "Nothing yet: ask everything." absent one. The prompt's
// own body is the hand-written owner/ask-owner.md (owner/PACKET.md names it);
// this command only fills its one marker — in plain words, for a non-engineer
// owner: never a local filesystem path, never scanner jargon, singular/plural
// said right.
//
// Reads only structured, reliably-parseable sources — never prose (an
// observation that merely mentions a topic is not a measurement, the same rule
// yardstick/measure.mjs follows):
//   • repository: the run's own copied packet (owner/manifest.yaml,
//     lib/run-layout.mjs packetManifestPath) if it names one, else
//     repo-census's archived raw report's target.remote (map/raw/repo-census.json
//     — never target.path, which is a path on the machine that ran the scan, not
//     something to hand an owner); with only a commit known, the commit alone;
//   • the credential population: map/censuses.yaml's sampled measures under the
//     credential census's names (yardstick/requirements.yaml
//     d-credentials-enumerated) — the counted population (met of N), not
//     per-secret names or usage sites: that detail is map/enumerate.mjs's job,
//     and enumerate.mjs prints to stdout only — it is never persisted into a
//     run, so it is not a source this command can read reliably;
//   • external systems: every effect finding whose effect.external is true,
//     counted and named in words (our internal channel slugs mean nothing to
//     an owner), up to five examples;
//   • personal-data stores: any census sampled measure whose name mentions
//     "personal" — reported only when a census actually names one, in plain
//     words, never as a "met of N" count.
//
// A steward can replace the whole auto-filled block with `--found <file>`: a
// markdown file (optionally with a leading YAML frontmatter block, stripped
// before use) inserted verbatim. It is swept for the same shapes
// validate-packet refuses (a secret, an email address) and refused for a
// template marker of its own ("{{"), one plain line, exit 1 — the file is
// still data from outside the engine, even when a person wrote it by hand.
//
// Usage: node assay.mjs ask-owner [--run <run-dir>] [--found <file>]
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseYaml } from '../lib/yaml-min.mjs';
import { isMain } from '../map/doctrine.mjs';
import { loadFindings } from '../map/project.mjs';
import { rawPath, censusesPath, packetManifestPath } from '../lib/run-layout.mjs';
import { secretShape, emailShape } from '../yardstick/packet.mjs';
import { stripUserinfo } from '../map/repo-census.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)); // owner/
export const TEMPLATE_FILE = join(HERE, 'ask-owner.md');
export const MARKER = '{{WHAT_WE_FOUND}}';
export const NOTHING_YET = 'Nothing yet: ask everything.';

// the credential census's own measure names (yardstick/requirements.yaml d-credentials-enumerated)
const CREDENTIAL_MEASURES = ['credentials-below-boundary', 'credential-boundary', 'credential'];

function safeYaml(p) { try { return existsSync(p) ? parseYaml(readFileSync(p, 'utf8')) : null; } catch { return null; } }
function safeJson(p) { try { return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null; } catch { return null; } }

// Repository line: the run's own packet if it names one; else repo-census's
// recorded remote; else, with only a commit known, the commit alone. NEVER
// target.path — a local filesystem path means nothing to an owner and is
// never printed here.
function repositoryLine(runDir) {
  const packet = safeYaml(packetManifestPath(runDir));
  if (packet && (packet.repository || packet.commit)) {
    const repo = packet.repository ? stripUserinfo(String(packet.repository)) : '(not named)';
    return `- Repository: ${repo}, commit ${packet.commit || '(not recorded)'} — from this run's own packet.`;
  }
  const census = safeJson(rawPath(runDir, 'repo-census.json'));
  if (census && census.target && census.target.remote) {
    return `- Repository: ${stripUserinfo(String(census.target.remote))}, commit ${census.target.head || '(not recorded)'} — from repo-census.`;
  }
  if (census && census.target && census.target.head) {
    return `- The commit we read: ${census.target.head}.`;
  }
  return null;
}

// Credentials, in plain words: how many the code uses, how many are traced,
// and what remains to confirm — singular/plural said right, and when
// everything is already traced, the only open question is whether one exists
// that the code does not show.
export function creditSentence(of, met) {
  const noun = (n) => `${n} credential${n === 1 ? '' : 's'}`;
  if (of > 0 && met >= of) {
    return `- Credentials: the code uses ${noun(of)}; we traced where all ${of} of them are held and what they can reach. Please confirm whether any credential is in use that the code does not show.`;
  }
  const remaining = Math.max(of - met, 0);
  return `- Credentials: the code uses ${noun(of)}; we traced where ${met} of them are held and what they can reach. Please confirm the other ${remaining}, and where each one lives.`;
}
function credentialLine(runDir) {
  const doc = safeYaml(censusesPath(runDir));
  if (!doc || !Array.isArray(doc.dimensions)) return null;
  for (const dim of doc.dimensions) {
    for (const s of dim.sampled || []) {
      if (s && CREDENTIAL_MEASURES.includes(s.name)) return creditSentence(Number(s.of) || 0, Number(s.met) || 0);
    }
  }
  return null;
}

// External systems, in words: our internal effect-channel slugs (e.g.
// "email-send") mean nothing to an owner, so this reports a count and turns up
// to five example slugs into words (hyphens to spaces) instead of dumping them.
function externalSystemsLine(runDir) {
  let findings = [];
  try { findings = loadFindings(runDir); } catch { return null; }
  const channels = [...new Set(findings
    .filter((f) => f && f.subject_type === 'effect' && f.effect && f.effect.external === true)
    .map((f) => f.effect.channel).filter(Boolean))].sort();
  if (!channels.length) return null;
  const examples = channels.slice(0, 5).map((c) => c.replace(/-/g, ' '));
  return `- The code sends, writes or publishes to ${channels.length} place${channels.length === 1 ? '' : 's'} outside itself (for example ${examples.join(', ')}). Please confirm which account each one uses.`;
}

// Personal data, in plain words — never a "met of N" census count, which
// reads as jargon to an owner.
function personalDataLine(runDir) {
  const doc = safeYaml(censusesPath(runDir));
  if (!doc || !Array.isArray(doc.dimensions)) return null;
  const hits = [];
  for (const dim of doc.dimensions) for (const s of dim.sampled || []) if (s && /personal/i.test(String(s.name || ''))) hits.push(s);
  if (!hits.length) return null;
  return hits.map((s) => `- Personal data: the code appears to store personal data (for example, ${s.what || s.name}). Please confirm what it holds and about whom.`).join('\n');
}

// The `{{WHAT_WE_FOUND}}` block: what a run already shows, from sources this
// command reads reliably — or the honest absence.
export function buildWhatWeFound(runDir) {
  if (!runDir) return NOTHING_YET;
  const lines = [repositoryLine(runDir), credentialLine(runDir), externalSystemsLine(runDir), personalDataLine(runDir)].filter(Boolean);
  return lines.length ? lines.join('\n') : NOTHING_YET;
}

// ── --found <file>: a steward's own write-up, replacing the block wholesale ──
// A leading closed frontmatter block (a "---" line, keys, a closing "---"
// line) is stripped before use — some repositories require one on every
// markdown file — leaving only the body, with leading/trailing blank lines
// trimmed. The result is still swept for a secret or an email address (the
// same shapes validate-packet refuses) and for a stray "{{" of its own.
export function stripLeadingFrontmatter(text) {
  const lines = text.split('\n');
  if ((lines[0] || '').trim() !== '---') return text;
  let end = -1;
  for (let i = 1; i < lines.length; i++) if (lines[i].trim() === '---') { end = i; break; }
  if (end === -1) return text; // no closing fence — not a real frontmatter block; leave it as-is
  return lines.slice(end + 1).join('\n');
}
function trimBlankEdges(text) {
  const lines = text.split('\n');
  let start = 0, end = lines.length;
  while (start < end && lines[start].trim() === '') start++;
  while (end > start && lines[end - 1].trim() === '') end--;
  return lines.slice(start, end).join('\n');
}
export function buildFoundOverride(foundFile) {
  let raw;
  try { raw = readFileSync(foundFile, 'utf8'); }
  catch (e) { throw new Error(`--found ${foundFile}: cannot read it (${e.message})`); }
  if (raw.includes('{{')) throw new Error(`--found ${foundFile}: contains "{{" — no nested template markers in a --found file`);
  const sec = secretShape(raw);
  if (sec) throw new Error(`--found ${foundFile}: looks like a secret value (${sec}) — never a real value here`);
  const em = emailShape(raw);
  if (em) throw new Error(`--found ${foundFile}: looks like an email address ("${em}") — roles and handles only, never a person's name or address`);
  return trimBlankEdges(stripLeadingFrontmatter(raw));
}

export function render(runDir, foundOverride = null) {
  const template = readFileSync(TEMPLATE_FILE, 'utf8');
  if (!template.includes(MARKER)) throw new Error(`${TEMPLATE_FILE} carries no ${MARKER} marker`);
  const found = foundOverride !== null ? foundOverride : buildWhatWeFound(runDir);
  // only the part the owner receives: from the "Paste this whole message" line down (the
  // frontmatter and the sender's note above it stay with us)
  const start = template.indexOf('**Paste this whole message');
  const body = start > -1 ? template.slice(start) : template;
  return body.replace(MARKER, () => found);   // a function replacer: $-sequences in `found` are never special
}

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  const runIdx = args.indexOf('--run');
  const runDir = runIdx > -1 ? args[runIdx + 1] : null;
  const foundIdx = args.indexOf('--found');
  const foundFile = foundIdx > -1 ? args[foundIdx + 1] : null;
  let out;
  try {
    const override = foundFile ? buildFoundOverride(foundFile) : null;
    out = render(runDir, override);
  }
  catch (e) { console.error(`✗ assay ask-owner: ${e.message}`); process.exit(1); }
  process.stdout.write(out);
}
