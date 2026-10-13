import type {Variable} from '../generated/platform';
/** Finite, bounded JSON check for shared and personal values. */
export function isFiniteJSON(value:unknown):boolean {
 let steps=0;const seen=new Set<object>();
 const visit=(item:unknown,depth:number):boolean=>{
  if(depth>64||++steps>4096)return false;
  if(item===null||typeof item==='string'||typeof item==='boolean')return true;
  if(typeof item==='number')return Number.isFinite(item);
  if(typeof item!=='object'||!item)return false;
  if(seen.has(item))return false;seen.add(item);
  const valid=Array.isArray(item)?item.every(v=>visit(v,depth+1)):Object.getPrototypeOf(item)===Object.prototype||Object.getPrototypeOf(item)===null?Object.values(item).every(v=>visit(v,depth+1)):false;
  seen.delete(item);return valid;
 };
 return visit(value,0);
}
export function parseFiniteJSON(raw:string):unknown {
 let value:unknown;try{value=JSON.parse(raw);}catch{throw new Error('invalid_value_json');}
 if(!isFiniteJSON(value))throw new Error('invalid_value_json');return value;
}
export type Definition={id:string;name:string;type:'string'|'number'|'boolean'|'json';value:unknown;sensitive?:boolean;required?:boolean};
export type Layer={source:string;definitions:Definition[]};
export type EnvironmentInput={layers:Layer[];personal:Record<string,unknown>;targets?:string[]};
export type EnvironmentRow={name:string;status:string;source:string|null;sensitive:boolean;value?:unknown};
export type DefinitionMetadata={id:string;name:string;source:string;sensitive:boolean;type:Definition['type'];required:boolean};
export type ResolvedEnvironment={rows:EnvironmentRow[];error?:'duplicate_definition'|'resolution_limit';read(name:string):{value:unknown;sensitive:boolean}|undefined;readDefinition(id:string):{value:unknown;sensitive:boolean}|undefined;definition(name:string):DefinitionMetadata|undefined};
export function resolveEnvironment(input:EnvironmentInput):ResolvedEnvironment {
 const effective=new Map<string,Definition & {source:string}>();
 if(input.layers.reduce((n,l)=>n+l.definitions.length,0)>256)return {rows:[],error:'resolution_limit',read:()=>undefined,readDefinition:()=>undefined,definition:()=>undefined};
 for(const layer of input.layers){const seen=new Set<string>();for(const d of layer.definitions){if(seen.has(d.name))return {rows:[],error:'duplicate_definition',read:()=>undefined,readDefinition:()=>undefined,definition:()=>undefined};seen.add(d.name);effective.set(d.name,{...d,source:layer.source});}}
 const resolve=(name:string,active:Set<string>,depth=0,budget={steps:0}):EnvironmentRow=>{
  const d=effective.get(name);if(!d)return {name,status:'definition_missing',source:null,sensitive:false};
  const row:EnvironmentRow={name,status:'resolved',source:d.source,sensitive:!!d.sensitive};
  if(depth>64||++budget.steps>4096)return {...row,status:'resolution_limit'};
  if(active.has(name))return {...row,status:'cycle'};
  if(d.sensitive&&!Object.hasOwn(input.personal,d.id))return {...row,status:'personal_missing'};
  const next=new Set(active).add(name);
  const replace=(value:unknown,level=depth):unknown=>{
   if(level>64||++budget.steps>4096){row.status='resolution_limit';return undefined;}
   if(typeof value==='string')return value.replace(/\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}/gu,(_,dep:string)=>{const r=resolve(dep,next,depth+1,budget);row.sensitive ||= r.sensitive;if(r.status!=='resolved')row.status=r.status==='cycle'?'cycle':r.status==='resolution_limit'?'resolution_limit':'dependency_missing';return typeof r.value==='string'?r.value:JSON.stringify(r.value)??'';});
   if(Array.isArray(value))return value.map(v=>replace(v,level+1));
   if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,replace(v,level+1)]));
   return value;
  };
  const value=replace(d.sensitive?input.personal[d.id]:d.value);
  if(row.status==='resolved'&&d.required&&(value==null||(typeof value==='string'&&value.trim()==='')))row.status='required_empty';
  const valid=(d.type==='json'&&isFiniteJSON(value))||(d.type==='string'&&typeof value==='string')||(d.type==='number'&&typeof value==='number'&&Number.isFinite(value))||(d.type==='boolean'&&typeof value==='boolean');
  if(row.status==='resolved'&&!valid)row.status='type_error';
  return {...row,value};
 };
 const rows=(input.targets??[...effective.keys()]).map(name=>{const r=resolve(name,new Set());if(r.sensitive||r.status!=='resolved')delete r.value;return r;});
 const read=(name:string)=>{const r=resolve(name,new Set());return r.status==='resolved'?{value:r.value,sensitive:r.sensitive}:undefined;};
 return {rows,read,readDefinition(id){const d=[...effective.values()].find(v=>v.id===id);return d?read(d.name):undefined;},definition(name){const d=effective.get(name);return d?{id:d.id,name:d.name,source:d.source,sensitive:!!d.sensitive,type:d.type,required:!!d.required}:undefined;}};
}
export function buildLayers(variables:Variable[],projectId:string,connectionId:string,environmentId:string):Layer[]{
 const sources=[['base-project','',''],['environment-project','',environmentId],['base-connection',connectionId,''],['environment-connection',connectionId,environmentId]];
 return sources.filter((_,i)=>(environmentId!==''||i===0||i===2)&&(connectionId!==''||i<2)).map(([source,cid,eid])=>({source,definitions:variables.filter(v=>v.projectId===projectId&&v.connectionId===cid&&v.environmentId===eid).map(v=>{let value:unknown;try{value=v.sensitive?null:parseFiniteJSON(v.valueJSON);}catch{throw new Error('invalid_value_json');}return {id:v.id,name:v.name,type:v.type,sensitive:v.sensitive,required:v.required,value};})}));
}
