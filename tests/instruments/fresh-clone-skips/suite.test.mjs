// Known-answer suite for fresh-clone's test-count parse (issue #30): two tests that
// always run, three that skip themselves when DATABASE_URL is unset — which it always
// is under fresh-clone (map/child-env.mjs never passes it to a child).
import { test } from 'node:test';
import assert from 'node:assert/strict';

const needsDb = !process.env.DATABASE_URL && 'needs DATABASE_URL';

test('adds', () => assert.equal(1 + 1, 2));
test('joins', () => assert.equal(['a', 'b'].join(''), 'ab'));
test('reads a row', { skip: needsDb }, () => assert.fail('not reached without a database'));
test('writes a row', { skip: needsDb }, () => assert.fail('not reached without a database'));
test('migrates', { skip: needsDb }, () => assert.fail('not reached without a database'));
