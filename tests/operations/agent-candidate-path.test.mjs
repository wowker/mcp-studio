import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync,symlinkSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {prepareCandidateDirectory} from '../../packaging/candidate-path.mjs';

test('candidate output uses only a fresh absolute directory within real .runtime',()=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),'candidate-output-')));
 try{
 mkdirSync(join(root,'.runtime'));
 const output=join(root,'.runtime','isolated-verify');
 assert.equal(prepareCandidateDirectory(root,output),output);
 writeFileSync(join(output,'existing-deliverable'),'retained');
 assert.throws(()=>prepareCandidateDirectory(root,output));
 assert.equal(readFileSync(join(output,'existing-deliverable'),'utf8'),'retained');
 for(const invalid of ['relative',root,join(root,'outside'),join(root,'.runtime')])assert.throws(()=>prepareCandidateDirectory(root,invalid));
 mkdirSync(join(root,'outside'));symlinkSync(join(root,'outside'),join(root,'.runtime','link'));
 assert.throws(()=>prepareCandidateDirectory(root,join(root,'.runtime','link','escape')));
 assert.equal(prepareCandidateDirectory(root),join(root,'.runtime','distribution'));
 }finally{rmSync(root,{recursive:true,force:true});}
});
