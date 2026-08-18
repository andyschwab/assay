// display.mjs — shared human display labels for the maintainer report.
// The YAML keeps the closed machine vocab (SCHEMA.md); these maps translate it
// for the reader. Used by compile-report.mjs (Markdown) and render-pdf.mjs (PDF).

// AXIS_META — the ONE home for per-axis display vocabulary. Every axis label,
// full title (label — question), and short slug derives from this map; before
// consolidation the three lived in three files and could drift independently.
export const AXIS_META = {
  'artifact-legibility': { label: 'Artifact legibility', q: 'is the knowledge in reviewable artifacts?', short: 'legibility' },
  'context-economy': { label: 'Context economy', q: 'can a bounded context reach competence fast?', short: 'context' },
  'deterministic-gates': { label: 'Deterministic gates', q: 'what verifies a change cheaply and loudly?', short: 'gates' },
  'verification': { label: 'Verification affordances', q: 'can a change demonstrate itself beyond pass/fail?', short: 'verification' },
  'delegation': { label: 'Delegation surface', q: 'what can act, on what authority, behind what halt?', short: 'delegation' },
  'improvement-loop': { label: 'Improvement loop', q: 'do corrections compound?', short: 'improvement' },
  'multiplayer': { label: 'Multiplayer', q: 'can people and agents share context and access here?', short: 'multiplayer' },
  'code-correctness': { label: 'Code correctness', q: 'does it compute the right thing, reliably?', short: 'correctness' },
  'code-security': { label: 'Code security', q: 'safe against a human adversary?', short: 'security' },
};
export const axisTitle = (a) => (AXIS_META[a] ? `${AXIS_META[a].label} — ${AXIS_META[a].q}` : a);
export const axisShort = (a) => AXIS_META[a]?.short || a;
// dimension → label (the maturity/stat-strip cut; `unprompted` is a dimension, not an axis)
export const DIM_LABEL = {
  ...Object.fromEntries(Object.entries(AXIS_META).map(([k, v]) => [k, v.label])),
  'unprompted': 'Unprompted',
};

// (The deployment-stage / safe-to-run vocabulary — STAGE_LABEL/STAGE_DEF/STAGE_COVER/
// coverageStage — was retired with the safe-to-run gate; the appendix presents security
// findings as illuminated risks, not a level-of-use verdict.)

// who can trigger an exposure (closed vocab → reader phrasing)
export const WHO_LABEL = {
  'stranger-pre-auth': 'an unauthenticated stranger',
  'authorized-real-user': 'an authorized, signed-in user',
  'only-at-scale-or-adversarial': 'only at scale, or an adversary',
};

// effect channel → short human name. The label is AUTHORED PER RUN in
// report-prose.yaml's channel_notes (`label:`), because channels are free
// per-target slugs (SCHEMA §1) — a label dictionary baked into engine source
// either grows per engagement forever or silently mislabels the next target
// (this file used to carry one target's channels). Fallback: the humanized slug.
export const channelLabel = (channel, notes = {}) =>
  (notes[channel] && notes[channel].label) || humanizeToken(channel);

// capability groups — the human cut of the effect inventory, in reading order
export const GROUP_ORDER = ['outward', 'data', 'read', 'ai'];
// group labels stay product-neutral so the section is portable across targets
export const GROUP_LABEL = {
  outward: 'Reaches outside your company',
  data: 'Changes your data',
  read: 'Reads your connected systems',
  ai: 'The AI assistant',
};
// one plain line per group — why this group carries the risk it does
export const GROUP_INTRO = {
  outward: 'These can affect people and systems outside the app, so they carry the most risk and are the hardest to take back.',
  data: 'These change the app\'s own data. Most are recoverable, but a few delete records for good.',
  read: 'These only read from your connected systems. They cannot change anything on the other side.',
  ai: 'What the AI assistant itself can reach. Watch that its own actions stay bounded, since it acts on text it did not write.',
};

// machine token → readable words (kebab-case enum values in tables)
export const humanizeToken = (t) => String(t == null ? '' : t).replace(/-/g, ' ');
