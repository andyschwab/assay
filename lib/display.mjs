// display.mjs — shared human display labels for the maintainer report.
// The YAML keeps the closed machine vocab (map/SCHEMA.md); these maps translate it
// for the reader. Used by views/improve/report.mjs; mdText and mdCode (below) by every
// view that prints text from the evaluated repository.

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
// views/improve/prose.yaml's channel_notes (`label:`), because channels are free
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

// machine token → readable words (kebab-case enum values in tables)
const humanizeToken = (t) => String(t == null ? '' : t).replace(/-/g, ' ');

// Text from outside the engine (a packet answer, a scanner observation, a run reason)
// reaches the Markdown views as data. mdText makes it inert: one line, and a backslash
// before every character that could open a link, an image, an HTML tag, emphasis, a
// code span or a table cell. Rendered, it reads as written.
export const mdText = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().replace(/[\\`*_[\]<>|]/g, '\\$&');
// mdCode renders a path as one code span no backtick inside it can close: the delimiter
// is one backtick longer than the longest run in the path, padded with a space when the
// path starts or ends with a backtick or a space (CommonMark code spans).
export const mdCode = (s) => {
  const t = String(s == null ? '' : s).replace(/\s+/g, ' ');
  const fence = '`'.repeat(Math.max(0, ...(t.match(/`+/g) || []).map((m) => m.length)) + 1);
  const pad = /^[` ]|[` ]$/.test(t) ? ' ' : '';
  return `${fence}${pad}${t}${pad}${fence}`;
};
