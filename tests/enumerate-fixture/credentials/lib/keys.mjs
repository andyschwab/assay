// secret-named constants: credential-suffixed names holding lists of identifier strings
const FIELD_KEYS = ['id', 'owner', 'text'];
export const ALL_KEYS = ['created_at', ...FIELD_KEYS];
export const cacheKeys = ['notes:v1', 'users:v1'];

export function check(row) {
  for (const k of Object.keys(row)) if (!ALL_KEYS.includes(k)) throw new Error(`unknown key "${k}" (${FIELD_KEYS.join(', ')})`);
  return cacheKeys;
}
