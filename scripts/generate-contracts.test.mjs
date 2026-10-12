import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
test('versioned platform contract generates stable Go and TypeScript boundaries',()=>{
 const r=spawnSync(process.execPath,['scripts/generate-contracts.mjs','--check'],{encoding:'utf8'});
 assert.equal(r.status,0,r.stderr+r.stdout);
 const ts=readFileSync('apps/web/src/generated/platform.ts','utf8');
 assert.match(ts,/sessionSchema/);assert.match(ts,/projectSchema/);
 const spec=JSON.parse(readFileSync('contracts/platform/openapi.json','utf8'));
 assert.equal(Object.keys(spec.paths).length,24);
 assert.equal(spec.paths['/api/v1/projects/{projectId}/takeover'].post.security[0].sessionCookie.length,0);
});
