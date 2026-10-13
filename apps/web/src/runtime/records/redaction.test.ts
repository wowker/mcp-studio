import {it,expect} from 'vitest';
import {redact,restoreRequest,redactionMarker} from './redaction';
it('protects nested source echoes, credentials, email, URLs and keeps explicit falsy values',()=>{
 const result=redact({secret:'prefix SENTINEL_PRIVATE suffix',headers:{Authorization:'Bearer arbitrary'},endpoint:'https://x.test/mcp?api_key=hidden',contact:'person@example.test',n:0,b:false,v:null,e:''},{sensitiveValues:['SENTINEL_PRIVATE']});
 expect(JSON.stringify(result)).not.toContain('SENTINEL_PRIVATE');expect(result.value).toEqual({secret:redactionMarker,headers:{Authorization:redactionMarker},endpoint:redactionMarker,contact:redactionMarker,n:0,b:false,v:null,e:''});expect(result.markers.map(x=>x.path)).toEqual(['/contact','/endpoint','/headers/Authorization','/secret']);
});
it('validates escaped pointers and protects schema-free binary data with metadata only',()=>{
 expect(redact({'a/b':{'~key':'private'},safe:0},{additionalPointers:['/a~1b/~0key']}).value).toEqual({'a/b':{'~key':redactionMarker},safe:0});expect(()=>redact({x:1},{additionalPointers:['/missing']})).toThrow('invalid_pointer');
 const result=redact({content:[{type:'image',mimeType:'image/png',data:'base64-private'}]});expect(JSON.stringify(result)).not.toContain('base64-private');expect(result.markers).toEqual([{path:'/content/0',reason:'omitted'}]);
});
it('restore omits marked top-level parameters and preserves literal marker-looking strings and explicit values',()=>{
 const r=restoreRequest({n:0,b:false,v:null,message:'[REDACTED]',nested:{private:redactionMarker}},[{path:'/request/nested/private',reason:'source'}]);expect(r).toEqual({value:{n:0,b:false,v:null,message:'[REDACTED]'},missing:['nested']});
});
it('rejects inherited JSON pointer paths and safely preserves __proto__ as own data',()=>{
 const v=JSON.parse('{"__proto__":{"x":1},"safe":false}') as unknown;
 expect(()=>redact(v,{additionalPointers:['/toString']})).toThrow('invalid_pointer');const r=redact(v);expect(JSON.stringify(r.value)).toBe('{"__proto__":{"x":1},"safe":false}');
});
import fixtureShape from '../../../../../contracts/fixtures/recording-v1.json';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
// Parse the JSON fixture rather than using Vite's object literal projection for __proto__.
const cases=JSON.parse(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)),'../../../../../contracts/fixtures/recording-v1.json'),'utf8')) as typeof fixtureShape;
for(const c of cases.redaction)it(`shared redaction ${c.id}`,()=>{
 if('error'in c){expect(()=>redact(c.value,c.options)).toThrow(c.error);return;}
 expect(redact(c.value,c.options)).toEqual(c.expected);
});
it('collects default and project secret sources before masking derived echoes without tainting existing typed markers',()=>{
 expect(redact({password:'opaque-business',echo:'prefix opaque-business suffix'}).value).toEqual({password:redactionMarker,echo:redactionMarker});
 expect(redact({private:'opaque-other',echo:'opaque-other'},{projectPointers:['/private']}).value).toEqual({private:redactionMarker,echo:redactionMarker});
 expect(redact({token:redactionMarker,ok:true}).value).toEqual({token:redactionMarker,ok:true});
});
