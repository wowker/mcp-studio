import {it,expect} from 'vitest';import vectors from '../../../../contracts/fixtures/configuration-v1.json';import {validateConnection,validateVariable} from './connection';import type {ConnectionInput,VariableInput} from '../generated/platform';
for(const v of vectors.cases)it(`shared configuration ${v.kind}/${v.id}`,()=>{const errors=v.kind==='connection'?validateConnection(v.input as ConnectionInput):validateVariable(v.input as VariableInput);expect(errors.length===0).toBe(v.valid);});
it('refuses authority interpolation even when non-sensitive',()=>{
 const c=vectors.cases[0].input as ConnectionInput;expect(validateConnection({...c,endpoint:'https://{{HOST}}/mcp'})).toContain('invalid_endpoint_reference');
});
it('rejects shared HTTP-only fields on stdio and raw secrets mixed into reference headers',()=>{
 const c=vectors.cases[0].input as ConnectionInput;
 expect(validateConnection({...c,transport:'stdio',channel:'agent',command:'node'}).length).toBeGreaterThan(0);
 expect(validateConnection({...c,headers:[{name:'Authorization',value:'Bearer raw {{TOKEN}}'}]}).length).toBeGreaterThan(0);
 expect(validateConnection({...c,timeoutMs:500})).toContain('invalid_timeout');
});
it('bounds variable size and accepts nested reference expressions for later typed resolution',()=>{
 const v=vectors.cases.find(v=>v.id==='expression')?.input as VariableInput;
 expect(validateVariable({...v,type:'number',valueJSON:'{"nested":"{{REF}}"}'})).toEqual([]);
 expect(validateVariable({...v,valueJSON:JSON.stringify('x'.repeat(32769))})).toContain('configuration_limit');
});
