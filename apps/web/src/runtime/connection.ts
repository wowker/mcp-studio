import type {ConnectionInput} from '../generated/platform';
import type {ResolvedEnvironment} from './environment';
import {isFiniteJSON} from './environment';
export class RuntimeError extends Error {constructor(public readonly code:string){super(code);this.name='RuntimeError';}}
const reference=/\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}/gu;
const secretKey=/(^|[^a-z0-9])(authorization|proxy[-_]?authorization|cookie|set[-_]?cookie|password|passwd|secret|token|access[-_]?token|refresh[-_]?token|id[-_]?token|api[-_]?key|client[-_]?secret|credential|signature)([^a-z0-9]|$)/iu;
const tokenShape=/(bearer\s+[A-Za-z0-9._~+/=-]+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|sk-[A-Za-z0-9_-]{16,})/iu;
const secretLiteral=(value:string)=>tokenShape.test(value.replace(reference,''));
const unsafeEntry=(name:string,value:string)=>secretLiteral(value)||(secretKey.test(name)&&(![...value.matchAll(reference)].length||value.replace(reference,'').trim().replace(/^Bearer/u,'').trim()!==''));
export function interpolate(text:string,environment?:ResolvedEnvironment):{value:string;sensitive:boolean;errors:string[]} {
 let sensitive=false;const errors:string[]=[];
 const value=text.replace(reference,(_,name:string)=>{if(!environment)return 'reference';const r=environment.read(name);if(!r){errors.push('reference_missing');return '';}sensitive ||= r.sensitive;return typeof r.value==='string'?r.value:JSON.stringify(r.value)??'';});
 return {value,sensitive,errors};
}
export function validateConnection(c:ConnectionInput,environment?:ResolvedEnvironment):string[] {
 const errors:string[]=[];
 if(!c.name.trim()||c.name.length>120||/[\r\n\0]/u.test(c.name))errors.push('name_required');
 if(!Number.isInteger(c.timeoutMs)||c.timeoutMs<1000||c.timeoutMs>300000)errors.push('invalid_timeout');
 if(c.channel!=='browser'&&c.channel!=='agent')errors.push('invalid_channel');
 if(c.authMode!=='reference'&&c.authReferenceId)errors.push('invalid_auth_reference');
 if(c.authMode!=='oauth'&&(c.oauthClientId||c.oauthScopes.length))errors.push('invalid_oauth_configuration');
 if(c.oauthScopes.length>32||c.oauthClientId.length>2048||/[\r\n\0]/u.test(c.oauthClientId)||secretLiteral(c.oauthClientId))errors.push('invalid_oauth_configuration');
 if(c.oauthScopes.some(s=>!s.trim()||s.length>256||/[\s\0]/u.test(s)))errors.push('oauth_scope_invalid');
 if(c.headers.length>64||c.env.length>64||c.args.length>128)errors.push('configuration_limit');
 if(c.transport==='stdio'){
  if(c.endpoint||c.headers.length||c.authMode!=='none')errors.push('invalid_stdio_configuration');
  if(c.channel!=='agent')errors.push('stdio_requires_agent');
  if(!c.command.trim()||c.command.length>4096||/[\r\n;&|<>`\0]/u.test(c.command)||(c.command.includes(' ')&&!/^(\/|[A-Za-z]:[\\/])/u.test(c.command)))errors.push('command_required');
  if(!Array.isArray(c.args)||c.args.some(a=>typeof a!=='string'||a.includes('\0')||a.length>8192||secretLiteral(a)))errors.push('invalid_args');
  if(c.cwd&&!(/^(\/|[A-Za-z]:[\\/]|\\\\)/u.test(c.cwd))||/[\0\r\n]/u.test(c.cwd))errors.push('invalid_cwd');
  for(const e of c.env){if(!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(e.name))errors.push('invalid_env');if(unsafeEntry(e.name,e.value))errors.push('shared_secret');if(/[\r\n\0]/u.test(e.value)||e.value.length>8192)errors.push('invalid_env');errors.push(...interpolate(e.value,environment).errors);}
 }else{
  if(!['sse','streamable-http'].includes(c.transport))errors.push('invalid_transport');
  if(c.command||c.args.length||c.cwd||c.env.length)errors.push('invalid_http_configuration');
  if(c.endpoint.length>8192||/[\s\0]/u.test(c.endpoint)||secretLiteral(c.endpoint))errors.push('invalid_endpoint');
  const authority=/^[^:]+:\/\/[^/?#]*/u.exec(c.endpoint)?.[0]??'';if(authority.includes('{{'))errors.push('invalid_endpoint_reference');
  if(c.endpoint.includes('#'))errors.push('invalid_endpoint');
  const endpoint=interpolate(c.endpoint,environment);errors.push(...endpoint.errors);if(endpoint.sensitive)errors.push('sensitive_url');
  try{if(secretLiteral(endpoint.value)||secretLiteral(decodeURIComponent(endpoint.value)))errors.push('secret_url');}catch{errors.push('invalid_endpoint');}if(endpoint.value.includes('#')||/[\s\0]/u.test(endpoint.value))errors.push('invalid_endpoint');
  try{const u=new URL(endpoint.value);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.hash)errors.push('invalid_endpoint');for(const [k,v]of u.searchParams)if(secretKey.test(k)||secretLiteral(v))errors.push('secret_url');}catch{errors.push('invalid_endpoint');}
  const names=new Set<string>();
  for(const h of c.headers){const n=h.name.toLowerCase();if(names.has(n)||!/^[-!#$%&'*+.^_`|~0-9A-Za-z]+$/u.test(h.name)||/^(host|content-length|origin|referer|cookie|set-cookie|connection|sec-.*|proxy-.*)$/iu.test(h.name))errors.push('invalid_header');names.add(n);if(/[\r\n\0]/u.test(h.value))errors.push('invalid_header');if(unsafeEntry(h.name,h.value))errors.push('shared_secret');if(h.value.length>8192)errors.push('invalid_header');errors.push(...interpolate(h.value,environment).errors);}
 }
 if(c.authMode==='reference'&&!c.authReferenceId.trim())errors.push('reference_missing');
 if(c.authMode==='reference'&&environment){const r=environment.readDefinition(c.authReferenceId);if(!r||!r.sensitive)errors.push('reference_missing');}
 return [...new Set(errors)];
}
/** Returns ephemeral wire material; never put this object into UI state or persistence. */
export function resolveConnection(c:ConnectionInput,environment:ResolvedEnvironment,credential?:string):{endpoint:URL;headers:Headers} {
 const errors=validateConnection(c,environment);if(errors.length)throw new RuntimeError(errors[0]);
 const headers=new Headers();for(const h of c.headers){const value=interpolate(h.value,environment).value;try{headers.set(h.name,value);}catch{throw new RuntimeError('invalid_header');}}
 if(c.authMode==='reference'){const v=environment.readDefinition(c.authReferenceId)?.value;if(typeof v!=='string'||!v.trim())throw new RuntimeError('credential_missing');headers.set('Authorization',`Bearer ${v}`);}
 else if(c.authMode==='token'||c.authMode==='oauth'){if(!credential?.trim()||/[\r\n\0]/u.test(credential))throw new RuntimeError('credential_missing');headers.set('Authorization',`Bearer ${credential}`);}
 return {endpoint:new URL(interpolate(c.endpoint,environment).value),headers};
}
export function validateVariable(v:import('../generated/platform').VariableInput):string[]{
 if(!/^[A-Za-z_][A-Za-z0-9_]{0,127}$/u.test(v.name))return ['invalid_variable_name'];
 if(!['string','number','boolean','json'].includes(v.type))return ['invalid_variable_type'];
 if(v.sensitive)return v.valueJSON===''?[]:['shared_secret'];
 if(v.valueJSON.length>32768)return ['configuration_limit'];
 let value:unknown;try{value=JSON.parse(v.valueJSON);}catch{return ['invalid_value_json'];}
 if(!isFiniteJSON(value))return ['type_error'];
 const hasReference=(item:unknown):boolean=>typeof item==='string'?[...item.matchAll(reference)].length>0:Array.isArray(item)?item.some(hasReference):!!item&&typeof item==='object'?Object.values(item).some(hasReference):false;
 const hasRawSecret=(item:unknown):boolean=>typeof item==='string'?secretLiteral(item):Array.isArray(item)?item.some(hasRawSecret):!!item&&typeof item==='object'?Object.values(item).some(hasRawSecret):false;
 if(hasRawSecret(value))return ['shared_secret'];
 if(hasReference(value))return [];
 if(v.type==='json'||(v.type==='string'&&typeof value==='string')||(v.type==='number'&&typeof value==='number'&&Number.isFinite(value))||(v.type==='boolean'&&typeof value==='boolean'))return [];
 return ['type_error'];
}
