import {it,expect} from 'vitest';
import type {ConnectionInput} from '../generated/platform';
import {validateConnection,resolveConnection} from './connection';
import {resolveEnvironment} from './environment';
export const config:ConnectionInput={name:'fixture',transport:'streamable-http',channel:'browser',endpoint:'https://mcp.example/mcp?public=1',command:'',args:[],cwd:'',headers:[],env:[],timeoutMs:1000,environmentId:'',authMode:'none',authReferenceId:'',oauthClientId:'',oauthScopes:[]};
it('accepts public query while rejecting embedded credentials, fragments and known secret query keys',()=>{
 expect(validateConnection(config)).toEqual([]);
 for(const endpoint of ['https://u:p@mcp.example/mcp','https://mcp.example/mcp#part','https://mcp.example/mcp?access_token=private'])expect(validateConnection({...config,endpoint}).length).toBeGreaterThan(0);
 expect(validateConnection({...config,headers:[{name:'Authorization',value:'Bearer raw-secret'}]})).toContain('shared_secret');
});
it('rejects sensitive derived endpoint and resolves sensitive reference into headers only',()=>{
 const env=resolveEnvironment({layers:[{source:'base-project',definitions:[{id:'s',name:'S',type:'string',value:null,sensitive:true}]}],personal:{s:'synthetic'},targets:['S']});
 expect(validateConnection({...config,endpoint:'https://mcp.example/mcp?public={{S}}'},env)).toContain('sensitive_url');
 const c=resolveConnection({...config,headers:[{name:'Authorization',value:'Bearer {{S}}'}]},env);
 expect(c.headers.get('Authorization')).toBe('Bearer synthetic');
});
it('validates stdio configuration without executing it and requires Agent',()=>{
 expect(validateConnection({...config,transport:'stdio'})).toContain('stdio_requires_agent');
 expect(validateConnection({...config,transport:'stdio',channel:'agent',command:'node',cwd:'relative'})).toContain('invalid_cwd');
 expect(validateConnection({...config,transport:'stdio',channel:'agent',endpoint:'',command:'node',cwd:'/tmp'})).toEqual([]);
});
it('rejects a fragment inserted by a non-sensitive resolved endpoint reference',()=>{
 const env=resolveEnvironment({layers:[{source:'base-project',definitions:[{id:'p',name:'PATH',type:'string',value:'mcp#'}]}],personal:{}});expect(validateConnection({...config,endpoint:'https://mcp.example/{{PATH}}'},env)).toContain('invalid_endpoint');
});
it('rejects recognized secrets assembled through public URL references or percent encoding',()=>{
 const env=resolveEnvironment({layers:[{source:'base-project',definitions:[{id:'p',name:'PREFIX',type:'string',value:'sk-'},{id:'s',name:'SUFFIX',type:'string',value:'a'.repeat(24)}]}],personal:{}});
 expect(validateConnection({...config,endpoint:'https://mcp.example/{{PREFIX}}{{SUFFIX}}'},env)).toContain('secret_url');expect(validateConnection({...config,endpoint:'https://mcp.example/%73%6b-'+('a'.repeat(24))})).toContain('secret_url');
});
