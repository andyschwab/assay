// identifiers and constants whose names happen to end in _KEY / _TOKENS
export const PRO_PRICE_KEY = 'price_pro_monthly';
export const MAX_OUTPUT_TOKENS = 4096;
const CACHE_KEY: string = 'pricing:v2';
export const LABELS = { THEME_KEY: 'theme' };
export function cached(store) {
  return store.get(CACHE_KEY);
}
// a literal default here, but read from the environment in lib/config.ts: a credential
export const SEARCH_API_KEY = 'search_default';
