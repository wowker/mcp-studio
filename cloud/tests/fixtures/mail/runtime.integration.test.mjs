import test from 'node:test';
import assert from 'node:assert/strict';
import { withTestSchema, queryTestDatabase } from '../../../scripts/test-runtime.mjs';

const database = process.env.MCP_STUDIO_TEST_DATABASE_URL;
test('test database schema is created then only its own schema is dropped after failure', async () => {
  let created;
  await assert.rejects(withTestSchema(database, async scoped => {
    const url = new URL(scoped);
    created = url.searchParams.get('search_path');
    assert.match(created ?? '', /^e2e_[a-f0-9]{24}$/);
    assert.equal(await queryTestDatabase(database, `SELECT count(*) FROM pg_namespace WHERE nspname='${created}'`), '1');
    throw new Error('synthetic callback failure');
  }), /synthetic callback failure/);
  assert.equal(await queryTestDatabase(database, `SELECT count(*) FROM pg_namespace WHERE nspname='${created}'`), '0');
});

test('concurrent isolated schemas do not remove each other', async () => {
  await withTestSchema(database, async first => {
    const firstName = new URL(first).searchParams.get('search_path');
    await withTestSchema(database, async second => {
      assert.notEqual(new URL(second).searchParams.get('search_path'), firstName);
      assert.equal(await queryTestDatabase(database, `SELECT count(*) FROM pg_namespace WHERE nspname='${firstName}'`), '1');
    });
    assert.equal(await queryTestDatabase(database, `SELECT count(*) FROM pg_namespace WHERE nspname='${firstName}'`), '1');
  });
});
