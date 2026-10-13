import {unsupported,type SchemaValidation} from './types';
export const DRAFT2020='https://json-schema.org/draft/2020-12/schema';
export const DRAFT07='http://json-schema.org/draft-07/schema#';
export const escapePointer=(key:string)=>key.replace(/~/gu,'~0').replace(/\//gu,'~1');
export const atPointer=(value:unknown,pointer:string):unknown=>{let node=value;for(const key of pointer.replace(/^#/u,'').split('/').slice(1)){if(!node||typeof node!=='object')return undefined;node=(node as Record<string,unknown>)[key.replace(/~1/gu,'/').replace(/~0/gu,'~')];}return node;};
const baseKeywords='$schema $id $ref $comment title description default examples readOnly writeOnly type enum const multipleOf maximum exclusiveMaximum minimum exclusiveMinimum maxLength minLength pattern maxItems minItems uniqueItems maxProperties minProperties required properties patternProperties additionalProperties propertyNames allOf anyOf oneOf not if then else contains format contentMediaType contentEncoding definitions'.split(' ');
const keywords2020=new Set([...baseKeywords,...'$defs $anchor $dynamicRef $dynamicAnchor $vocabulary prefixItems items unevaluatedItems unevaluatedProperties minContains maxContains dependentRequired dependentSchemas deprecated contentSchema'.split(' ')]);
const keywords07=new Set([...baseKeywords,...'items additionalItems dependencies'.split(' ')]);
const formats=new Set('date-time date time duration email idn-email hostname idn-hostname ipv4 ipv6 uri uri-reference iri iri-reference uuid uri-template json-pointer relative-json-pointer regex'.split(' '));
const maps=new Set('$defs definitions properties patternProperties dependentSchemas'.split(' '));
const singles=new Set('additionalProperties propertyNames not if then else contains unevaluatedItems unevaluatedProperties additionalItems contentSchema'.split(' '));
const arrays=new Set('allOf anyOf oneOf prefixItems'.split(' '));
const vocabularies=new Set(['core','applicator','unevaluated','validation','meta-data','format-annotation','content'].map(name=>'https://json-schema.org/draft/2020-12/vocab/'+name));
export function jsonLimit(value:unknown,kind:'schema'|'request'):string|undefined{
 let visits=0;const seen=new Set<object>();let failure:string|undefined;
 const walk=(item:unknown,depth:number):void=>{
  if(failure)return;if(depth>64||++visits>4096){failure=kind+'_limit';return;}
  if(item===null||typeof item==='string'||typeof item==='boolean')return;
  if(typeof item==='number'){if(!Number.isFinite(item))failure='invalid_json';return;}
  if(typeof item!=='object'||seen.has(item)){failure='invalid_json';return;}
  if(!Array.isArray(item)&&Object.getPrototypeOf(item)!==Object.prototype&&Object.getPrototypeOf(item)!==null){failure='invalid_json';return;}
  seen.add(item);for(const child of Array.isArray(item)?item:Object.values(item))walk(child,depth+1);seen.delete(item);
 };
 try{walk(value,0);if(!failure&&new TextEncoder().encode(JSON.stringify(value)).length>1048576)failure=kind+'_limit';}catch{failure='invalid_json';}
 return failure;
}
export type SchemaProfile={dialect:string;resources:Map<string,unknown>;cost:number;failure?:SchemaValidation};
export function checkProfile(schema:unknown,uri:string):SchemaProfile{
 const resources=new Map<string,unknown>([[uri,schema]]);const profile:SchemaProfile={dialect:DRAFT2020,resources,cost:1};
 const fail=(reason:string)=>{profile.failure??=unsupported(reason);};
 const limit=jsonLimit(schema,'schema');if(limit){fail(limit==='invalid_json'?'invalid_schema':limit);return profile;}
 if(schema&&typeof schema==='object'&&!Array.isArray(schema)&&'$schema'in schema){const dialect=(schema as Record<string,unknown>).$schema;if(dialect===DRAFT07||dialect===DRAFT07.slice(0,-1))profile.dialect=DRAFT07;else if(dialect!==DRAFT2020)fail('unsupported_dialect');}
 const refs:{target:string;owner:object}[]=[],anchors=new Map<string,unknown>(),sameInstance=new Map<object,unknown[]>();
 const pattern=(value:unknown)=>{
  if(typeof value!=='string'){fail('invalid_schema');return;}
  if(value.length>256||value.includes('(?')||value.includes('[[:')||/\\[1-9]|\\k[<{]|\\[pP]\{|\\[ucxsS]/u.test(value)){fail('unsupported_pattern');return;}
  let escaped=false,inClass=false;for(const char of value){if(escaped){escaped=false;continue;}if(char==='\\'){escaped=true;continue;}if(char==='[')inClass=true;else if(char===']')inClass=false;else if(char==='.'&&!inClass){fail('unsupported_pattern');return;}}
  try{new RegExp(value,'u');}catch{fail('invalid_schema');}
 };
 const walk=(node:unknown,base:string,dialect:string):void=>{
  if(typeof node==='boolean')return;if(!node||typeof node!=='object'||Array.isArray(node)){fail('invalid_schema');return;}
  const row=node as Record<string,unknown>;
  if('$schema'in row){if(row.$schema===DRAFT07||row.$schema===DRAFT07.slice(0,-1))dialect=DRAFT07;else if(row.$schema===DRAFT2020)dialect=DRAFT2020;else fail('unsupported_dialect');}
  if('$id'in row){try{if(typeof row.$id!=='string')throw Error();base=new URL(row.$id,base).href.split('#')[0];if(resources.has(base)&&resources.get(base)!==node)fail('invalid_schema');resources.set(base,node);}catch{fail('invalid_schema');}}
  const edges:unknown[]=[];sameInstance.set(node,edges);
  for(const key of ['$anchor','$dynamicAnchor'])if(typeof row[key]==='string')anchors.set(base+'#'+row[key],node);
  const keywords=dialect===DRAFT07?keywords07:keywords2020;
  for(const [key,child]of Object.entries(row)){
   if(!keywords.has(key)){fail('unsupported_keyword');continue;}
   if(key==='$vocabulary'){if(!child||typeof child!=='object'||Array.isArray(child)||Object.keys(child).some(v=>!vocabularies.has(v)))fail('unsupported_vocabulary');}
   if(key==='$ref'||key==='$dynamicRef'){try{if(typeof child!=='string')throw Error();refs.push({target:new URL(child,base).href,owner:node});}catch{fail('invalid_schema');}}
   if(['not','if','then','else'].includes(key))edges.push(child);
   if(['allOf','anyOf','oneOf'].includes(key)&&Array.isArray(child))edges.push(...child);
   if(key==='dependentSchemas'&&child&&typeof child==='object'&&!Array.isArray(child))edges.push(...Object.values(child));
   if(key==='dependencies'&&child&&typeof child==='object'&&!Array.isArray(child))edges.push(...Object.values(child).filter(sub=>!Array.isArray(sub)));
   if(key==='format'&&(typeof child!=='string'||!formats.has(child)))fail('unsupported_format');
   if(key==='pattern')pattern(child);
   if(maps.has(key)&&child&&typeof child==='object'&&!Array.isArray(child)){for(const [name,sub]of Object.entries(child)){if(key==='patternProperties')pattern(name);walk(sub,base,dialect);}}
   else if(singles.has(key))walk(child,base,dialect);
   else if(arrays.has(key)&&Array.isArray(child))for(const sub of child)walk(sub,base,dialect);
   else if(key==='items'){if(Array.isArray(child))for(const sub of child)walk(sub,base,dialect);else walk(child,base,dialect);}
   else if(key==='dependencies'&&child&&typeof child==='object'&&!Array.isArray(child))for(const sub of Object.values(child))if(!Array.isArray(sub))walk(sub,base,dialect);
  }
 };
 walk(schema,uri,profile.dialect);
 for(const ref of refs){const url=new URL(ref.target),resource=resources.get(url.href.split('#')[0]);if(resource===undefined){fail('remote_reference');continue;}const target=url.hash?url.hash.startsWith('#/')?atPointer(resource,decodeURIComponent(url.hash)):anchors.get(url.href):resource;if(target===undefined){fail('invalid_schema');continue;}sameInstance.get(ref.owner)?.push(target);}
 const memo=new Map<object,number>(),active=new Set<object>();
 const cost=(node:unknown):number=>{if(!node||typeof node!=='object')return 1;if(active.has(node)){fail('schema_complexity');return 100001;}const cached=memo.get(node);if(cached!==undefined)return cached;active.add(node);let total=1;for(const child of sameInstance.get(node)??[]){total=Math.min(100001,total+cost(child));if(total>100000)break;}active.delete(node);memo.set(node,total);return total;};
 for(const node of sameInstance.keys())profile.cost=Math.max(profile.cost,cost(node));if(profile.cost>100000)fail('schema_complexity');return profile;
}
export function exceedsComplexity(profile:SchemaProfile,value:unknown):boolean{
 let nodes=0;const count=(item:unknown)=>{nodes++;if(Array.isArray(item))for(const child of item)count(child);else if(item&&typeof item==='object')for(const child of Object.values(item))count(child);};count(value);return profile.cost*nodes>100000;
}
