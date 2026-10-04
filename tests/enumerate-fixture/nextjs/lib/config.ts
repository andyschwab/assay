import { SEARCH_API_KEY } from './pricing';
// credentials: read from the environment, so each is a credential-census member
export const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
// a hardcoded password stays a candidate whatever its value looks like
export const ADMIN_PASSWORD = 'hunter2';
// a hardcoded key whose value is not identifier-shaped stays a candidate
export const LEGACY_API_KEY = 'Qm9Lx7TzR2';
export const searchKey = process.env.SEARCH_API_KEY || SEARCH_API_KEY;
