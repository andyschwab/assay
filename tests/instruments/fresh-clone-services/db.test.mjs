// The suite's core needs its database: like a template's test config, it refuses to run in
// CI without one, so a skipped database suite can never read green.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { query } from './db.mjs';

if (process.env.CI && !process.env.DATABASE_URL) throw new Error('DATABASE_URL is required in CI: the suite will not skip its database tests');

test('an item written to the migrated table reads back', async () => {
  await query(process.env.DATABASE_URL, "insert into items (name) values ('one')");
  const rows = await query(process.env.DATABASE_URL, 'select count(*) from items');
  assert.equal(rows[0][0], '1');
});
