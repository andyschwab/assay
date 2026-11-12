import { sync } from '../lib/sync.mjs';

// a test's own call is no effect channel of the product
await fetch('https://stub.invalid/reset', { method: 'POST' });
await sync([]);
