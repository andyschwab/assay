// display.mjs — shared human display labels for the maintainer report.
// The YAML keeps the closed machine vocab (SCHEMA.md); these maps translate it
// for the reader. Used by compile-report.mjs (Markdown) and render-pdf.mjs (PDF).

export const DIM_LABEL = {
  'artifact-legibility': 'Artifact legibility',
  'context-economy': 'Context economy',
  'deterministic-gates': 'Deterministic gates',
  'verification': 'Verification affordances',
  'delegation': 'Delegation surface',
  'improvement-loop': 'Improvement loop',
  'multiplayer': 'Multiplayer',
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

// effect channel → short human name (the "What the app can do" rows)
export const CHANNEL_LABEL = {
  'email-send': 'Send email',
  'slack-notify': 'Post to Slack',
  'stripe-mutation': 'Change billing',
  'admin-mutation': 'Super-admin actions',
  'provider-api-read': 'Read connected systems',
  'cron-sync': 'Scheduled sync',
  'db-write': 'Write records',
  'db-wipe': 'Delete records',
  'db-migration': 'Change the schema',
  'data-export': 'Export to CSV',
  'credential-store': 'Store credentials',
  'digest-report': 'Weekly digest',
  'auth-bypass': 'Dev sign-in',
  'llm-tool-call': 'AI tools',
  'llm-context-read': 'AI context',
};

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
