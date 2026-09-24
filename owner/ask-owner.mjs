#!/usr/bin/env node
// ask-owner.mjs — prints owner/ask-owner.md with {{WHAT_WE_FOUND}} filled in
// from a run's map, or "Nothing yet: ask everything." absent one (owner/PACKET.md
// Phase 3). The prompt's own body is written separately, by the orchestrator;
// this command only fills its one marker.
//
// Reads only structured, reliably-parseable sources — never prose (an
// observation that merely mentions a topic is not a measurement, the same rule
// yardstick/measure.mjs follows):
//   • repository/commit: the run's own copied packet (owner/manifest.yaml,
//     lib/run-layout.mjs packetManifestPath) if one exists, else repo-census's
//     archived raw report (map/raw/repo-census.json, target.path/target.head);
//   • the credential population: map/censuses.yaml's sampled measures under the
//     credential census's names (yardstick/requirements.yaml
//     d-credentials-enumerated) — the counted population (met of N), not
//     per-secret names or usage sites: that detail is map/enumerate.mjs's job,
//     and enumerate.mjs prints to stdout only — it is never persisted into a
//     run, so it is not a source this command can read reliably;
//   • external systems: every effect finding whose effect.external is true,
//     named by its channel;
//   • personal-data stores: any census sampled measure whose name mentions
//     "personal" — reported only when a census actually names one.
//
// Usage: node assay.mjs ask-owner [--run <run-dir>]
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseYaml } from '../lib/yaml-min.mjs';
import { isMain } from '../map/doctrine.mjs';
import { loadFindings } from '../map/project.mjs';
import { rawPath, censusesPath, packetManifestPath } from '../lib/run-layout.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)); // owner/
export const TEMPLATE_FILE = join(HERE, 'ask-owner.md');
export const MARKER = '{{WHAT_WE_FOUND}}';
export const NOTHING_YET = 'Nothing yet: ask everything.';

// the credential census's own measure names (yardstick/requirements.yaml d-credentials-enumerated)
const CREDENTIAL_MEASURES = ['credentials-below-boundary', 'credential-boundary', 'credential'];

function safeYaml(p) { try { return existsSync(p) ? parseYaml(readFileSync(p, 'utf8')) : null; } catch { return null; } }
function safeJson(p) { try { return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null; } catch { return null; } }

function repositoryLine(runDir) {
  const packet = safeYaml(packetManifestPath(runDir));
  if (packet && (packet.repository || packet.commit)) {
    return `- Repository: ${packet.repository || '(not named)'}, commit ${packet.commit || '(not recorded)'} — from this run's own packet.`;
  }
  const census = safeJson(rawPath(runDir, 'repo-census.json'));
  if (census && census.target && (census.target.path || census.target.head)) {
    return `- Repository: ${census.target.path || '(not named)'}, commit ${census.target.head || '(not recorded)'} — from repo-census.`;
  }
  return null;
}

function credentialLine(runDir) {
  const doc = safeYaml(censusesPath(runDir));
  if (!doc || !Array.isArray(doc.dimensions)) return null;
  for (const dim of doc.dimensions) {
    for (const s of dim.sampled || []) {
      if (s && CREDENTIAL_MEASURES.includes(s.name)) {
        return `- Credentials: the census counts ${s.met} of ${s.of} ${s.what || s.name}${s.method ? ` (${s.method})` : ''} — confirm the rest, and where each lives.`;
      }
    }
  }
  return null;
}

function externalSystemsLine(runDir) {
  let findings = [];
  try { findings = loadFindings(runDir); } catch { return null; }
  const channels = [...new Set(findings
    .filter((f) => f && f.subject_type === 'effect' && f.effect && f.effect.external === true)
    .map((f) => f.effect.channel).filter(Boolean))].sort();
  if (!channels.length) return null;
  return `- External systems reached: ${channels.join(', ')} — confirm the account, owner, and transfer path for each.`;
}

function personalDataLine(runDir) {
  const doc = safeYaml(censusesPath(runDir));
  if (!doc || !Array.isArray(doc.dimensions)) return null;
  const hits = [];
  for (const dim of doc.dimensions) for (const s of dim.sampled || []) if (s && /personal/i.test(String(s.name || ''))) hits.push(s);
  if (!hits.length) return null;
  return hits.map((s) => `- Personal data: the census names ${s.what || s.name} (${s.met} of ${s.of}) — confirm what it holds and about whom.`).join('\n');
}

// The `{{WHAT_WE_FOUND}}` block: what a run already shows, from sources this
// command reads reliably — or the honest absence.
export function buildWhatWeFound(runDir) {
  if (!runDir) return NOTHING_YET;
  const lines = [repositoryLine(runDir), credentialLine(runDir), externalSystemsLine(runDir), personalDataLine(runDir)].filter(Boolean);
  return lines.length ? lines.join('\n') : NOTHING_YET;
}

export function render(runDir) {
  const template = readFileSync(TEMPLATE_FILE, 'utf8');
  if (!template.includes(MARKER)) throw new Error(`${TEMPLATE_FILE} carries no ${MARKER} marker`);
  const found = buildWhatWeFound(runDir);
  return template.replace(MARKER, () => found);   // a function replacer: $-sequences in `found` are never special
}

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  const runIdx = args.indexOf('--run');
  const runDir = runIdx > -1 ? args[runIdx + 1] : null;
  let out;
  try { out = render(runDir); }
  catch (e) { console.error(`✗ assay ask-owner: ${e.message}`); process.exit(1); }
  process.stdout.write(out);
}
