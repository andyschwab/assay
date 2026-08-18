// capabilities.mjs — build the "What the app can do" inventory from the effect findings.
// One row per distinct effect channel, aggregated across its findings, joined to the
// authored channel_notes (mechanism sentence + group). Used by compile-report.mjs
// (the appendix's human "What the app can do" section).
import { CHANNEL_LABEL, GROUP_ORDER, GROUP_LABEL, humanizeToken } from './display.mjs';
import { isHalt } from './doctrine.mjs';

// re-exported for existing importers; the definition lives in doctrine.mjs
export { isHalt };

const REV_RANK = { reversible: 0, 'reversible-with-window': 1, irreversible: 2 };
const TEL_RANK = { none: 0, unstructured: 1, 'structured-event': 2 };
const BLAST_RANK = { tenant: 0, fleet: 1, 'cross-tenant': 2 };
const worst = (a, b, rank) => (rank[b] > rank[a] ? b : a);

// returns [{ group, groupLabel, channels: [{ channel, label, what, findings, external,
//   reversibility, telemetry, blast, gates, halt }] }], only non-empty groups, in order
export function buildCapabilities(findings, channelNotes = {}) {
  const effects = findings.filter((f) => f.subject_type === 'effect' && f.effect);
  const byChannel = new Map();
  for (const f of effects) {
    const e = f.effect;
    const key = e.channel;
    if (!byChannel.has(key)) {
      byChannel.set(key, {
        channel: key,
        label: CHANNEL_LABEL[key] || humanizeToken(key),
        what: (channelNotes[key] && channelNotes[key].what) || '',
        group: (channelNotes[key] && channelNotes[key].group) || 'data',
        findings: [], external: false,
        reversibility: 'reversible', telemetry: 'structured-event', blast: 'tenant',
        gates: new Set(), halt: false,
      });
    }
    const row = byChannel.get(key);
    row.findings.push(f.id);
    if (e.external) row.external = true;
    row.reversibility = worst(row.reversibility, e.reversibility, REV_RANK);
    // telemetry: report the WEAKEST trace across the channel's findings (min rank)
    row.telemetry = (TEL_RANK[e.telemetry] < TEL_RANK[row.telemetry]) ? e.telemetry : row.telemetry;
    row.blast = worst(row.blast, e.blast_scope, BLAST_RANK);
    if (e.gate_type) row.gates.add(e.gate_type);
    if (isHalt(e)) row.halt = true;
  }
  const groups = GROUP_ORDER.map((g) => ({
    group: g, groupLabel: GROUP_LABEL[g],
    channels: [...byChannel.values()].filter((c) => c.group === g)
      .sort((a, b) => Number(b.halt) - Number(a.halt) || a.label.localeCompare(b.label)),
  })).filter((grp) => grp.channels.length);
  return groups;
}

// a one-line trace phrase for a channel row
export const tracePhrase = (telemetry) =>
  telemetry === 'structured-event' ? 'leaves a durable trace'
    : telemetry === 'unstructured' ? 'only throwaway logs'
      : 'no trace';

// human-facing capability counts, in KINDS (channels) — the intuitive unit for the report.
// A kind is "unguarded" if any of its sites is an unheld halt. (Per-site detail lives in
// the handoff.) Returns totals and per-group breakdowns aligned with the status-rail rows.
export function capabilityCounts(groups) {
  const chans = groups.flatMap((gr) => gr.channels);
  return {
    kinds: chans.length,
    unguarded: chans.filter((c) => c.halt).length,
    byGroup: Object.fromEntries(groups.map((gr) => [gr.group, {
      kinds: gr.channels.length,
      unguarded: gr.channels.filter((c) => c.halt).length,
    }])),
  };
}

const NUMWORD = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
export const numWord = (n) => NUMWORD[n] || String(n);
