import {it,expect} from 'vitest';
import {canonicalJSON,frozenDigest} from './canonical';
it('canonicalizes by Unicode code points with exact strings and safe integer-only outer values',()=>{
 expect(canonicalJSON({'😀':1,'\ue000':2,a:'<>&\u2028',z:-0})).toBe('{"a":"<>&\u2028","z":0,"\ue000":2,"😀":1}');
 expect(()=>canonicalJSON({n:0.1})).toThrow('unsafe_digest_value');expect(()=>canonicalJSON({n:9007199254740992})).toThrow('unsafe_digest_value');expect(()=>canonicalJSON({text:'\ud800'})).toThrow('unsafe_digest_value');
});
it('hashes frozen versioned content without its digest field and preserves decimal JSON text',async()=>{
 const value={contractVersion:'1.2.0',requestJSON:'{"n":0.1}',b:false};expect(await frozenDigest(value)).toMatch(/^[a-f0-9]{64}$/);expect(await frozenDigest({...value,frozenDigest:'obsolete'})).toBe(await frozenDigest(value));expect(await frozenDigest({...value,requestJSON:'{"n":0.10}'})).not.toBe(await frozenDigest(value));
});
import cases from '../../../../../contracts/fixtures/recording-v1.json';
import {canonicalEnvelope} from './canonical';
for(const c of cases.canonical)it(`shared digest ${c.id}`,async()=>{
 if('error'in c){expect(()=>canonicalEnvelope(c.raw)).toThrow(c.error);return;}
 expect(canonicalEnvelope(c.raw)).toBe(c.expectedCanonical);expect(await frozenDigest(JSON.parse(c.raw) as unknown)).toBe(c.expectedDigest);
});
