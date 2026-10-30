import type {SchemaIssue,SchemaValidation} from '../../runtime/schema';
export type Schema=Record<string,unknown>;
export type ArgumentDraft={value:unknown;raw:string;parseError:boolean;skipped:Record<string,boolean>;omitted:Record<string,unknown>;touched:Record<string,boolean>;texts:Record<string,string>;expanded:Record<string,boolean>;branches:Record<string,number>;errors:SchemaIssue[];validation?:SchemaValidation;revision:number};
export const pointer=(parent:string,key:string|number)=>`${parent}/${String(key).replace(/~/gu,'~0').replace(/\//gu,'~1')}`;
export const pathParts=(path:string)=>path===''?[]:path.slice(1).split('/').map(key=>key.replace(/~1/gu,'/').replace(/~0/gu,'~'));
export const object=(value:unknown):value is Schema=>!!value&&typeof value==='object'&&!Array.isArray(value);
export function readArgument(value:unknown,path:string):unknown{for(const key of pathParts(path)){if(!value||typeof value!=='object'||!Object.hasOwn(value,key))return undefined;value=(value as Record<string,unknown>)[key];}return value;}
/** Display eligibility never changes validation semantics; unsupported shapes remain local JSON. */
export function displaySchema(schema:unknown,root:unknown,seen=new Set<unknown>()):Schema|null{
 if(!object(schema)||seen.has(schema))return null;seen.add(schema);
 if(typeof schema.$ref==='string'){
  if(!schema.$ref.startsWith('#/'))return null;const referenced=readArgument(root,schema.$ref.slice(1));const resolved=displaySchema(referenced,root,seen);if(!resolved)return null;
  if(Object.keys(schema).some(key=>!['$ref','title','description'].includes(key)))return null;return {...resolved,...(schema.title?{title:schema.title}:{}),...(schema.description?{description:schema.description}:{})};
 }
 if(Object.keys(schema).some(key=>['anyOf','allOf','not','if','then','else','dependentSchemas','patternProperties','propertyNames','unevaluatedProperties','unevaluatedItems','prefixItems','contains','contentSchema'].includes(key)))return null;
 if(schema.additionalProperties!==undefined&&typeof schema.additionalProperties!=='boolean')return null;
 if(schema.oneOf!==undefined){if(!Array.isArray(schema.oneOf)||!schema.oneOf.length)return null;const types=schema.oneOf.map(branch=>object(branch)?branch.type:undefined);const distinctTypes=types.every(type=>typeof type==='string')&&new Set(types).size===types.length&&!(types.includes('number')&&types.includes('integer'));if(!distinctTypes&&!branchDiscriminator(schema.oneOf))return null;return schema;}
 const types=Array.isArray(schema.type)?schema.type:[schema.type];if(types.length>2||types.length===2&&!types.includes('null'))return null;
 if(!types.every(type=>['object','array','string','integer','number','boolean','null',undefined].includes(type as string|undefined)))return null;
 if(schema.type===undefined&&!schema.enum&&!Object.hasOwn(schema,'const')&&!schema.properties)return null;
 return schema;
}
function seed(schema:unknown,root:unknown,path:string,skipped:Record<string,boolean>,depth=0):unknown{
 const display=displaySchema(schema,root);if(!display||depth>32)return undefined;
 if(display.type==='object'||display.properties){const value:Schema={};const required=Array.isArray(display.required)?display.required:[];for(const [name,child] of Object.entries(object(display.properties)?display.properties:{})){const childPath=pointer(path,name);skipped[childPath]=!required.includes(name);const childValue=seed(child,root,childPath,skipped,depth+1);if(required.includes(name)&&childValue!==undefined)Object.defineProperty(value,name,{value:childValue,writable:true,enumerable:true,configurable:true});}return value;}
 if(display.type==='array')return [];return undefined;
}
export function createArgumentDraft(schema:unknown):ArgumentDraft{const skipped:Record<string,boolean>={};const value=seed(schema,schema,'',skipped)??{};return {value,raw:JSON.stringify(value,null,2),parseError:false,skipped,omitted:{},touched:{},texts:{},expanded:{},branches:{},errors:[],revision:0};}
function write(value:unknown,path:string,next:unknown):unknown{const parts=pathParts(path);if(parts.length===0)return next;const root=value&&typeof value==='object'?structuredClone(value):{};let parent=root as Schema;parts.forEach((part,index)=>{if(index===parts.length-1){if(next===undefined){if(Array.isArray(parent))parent.splice(Number(part),1);else delete parent[part];}else Object.defineProperty(parent,part,{value:structuredClone(next),enumerable:true,writable:true,configurable:true});}else{if(!Object.hasOwn(parent,part)||!parent[part]||typeof parent[part]!=='object')Object.defineProperty(parent,part,{value:/^\d+$/u.test(parts[index+1])?[]:{},enumerable:true,writable:true,configurable:true});parent=parent[part] as Schema;}});return root;}
export function setArgument(draft:ArgumentDraft,path:string,value:unknown,touch=true):ArgumentDraft{const next=write(draft.value,path,value);const errors=draft.errors.filter(issue=>issue.path!==path&&!issue.path.startsWith(`${path}/`)&&!path.startsWith(`${issue.path}/`));return {...draft,value:next,raw:JSON.stringify(next,null,2),parseError:false,touched:touch?{...draft.touched,[path]:true}:draft.touched,errors,validation:errors.length&&draft.validation?{...draft.validation,valid:false,errors}:undefined,revision:draft.revision+1};}
export function schemaAtPath(schema:unknown,path:string,draft?:ArgumentDraft):unknown{let current=schema,at='';for(const key of pathParts(path)){const display=displaySchema(current,schema);if(!display)return current;if(Array.isArray(display.oneOf))current=display.oneOf[draft?.branches[at]??0];else current=display;const node=object(current)?current:{};current=node.type==='array'?node.items:object(node.properties)?node.properties[key]:undefined;at=pointer(at,key);}return current;}
export function enableArgument(draft:ArgumentDraft,schema:unknown,path:string,enabled:boolean):ArgumentDraft{let skipped={...draft.skipped,[path]:!enabled};let value=readArgument(draft.value,path);const omitted={...draft.omitted};if(!enabled){if(value!==undefined)omitted[path]=structuredClone(value);value=undefined;}else if(value===undefined){value=Object.hasOwn(omitted,path)?structuredClone(omitted[path]):seed(schemaAtPath(schema,path,draft),schema,path,skipped);}const next=setArgument(draft,path,value,false);return {...next,skipped,omitted};}
export function setRawArgumentDraft(draft:ArgumentDraft,raw:string):ArgumentDraft{try{const value:unknown=JSON.parse(raw);return {...draft,raw,value,parseError:false,touched:{...draft.touched,'':true},skipped:{},omitted:{},texts:{},errors:[],validation:undefined,revision:draft.revision+1};}catch{return {...draft,raw,parseError:true,errors:[],validation:undefined,revision:draft.revision+1};}}
export const canShowForm=(draft:ArgumentDraft)=>!draft.parseError;
export function branchDiscriminator(branches:unknown[]):string|undefined{const first=object(branches[0])?branches[0]:{};for(const name of Object.keys(object(first.properties)?first.properties:{})){const sets=branches.map(branch=>{if(!object(branch)||branch.type!=='object'||!Array.isArray(branch.required)||!branch.required.includes(name)||!object(branch.properties)||!object(branch.properties[name]))return undefined;const prop=branch.properties[name];return Object.hasOwn(prop,'const')?[JSON.stringify(prop.const)]:Array.isArray(prop.enum)?prop.enum.map(value=>JSON.stringify(value)):undefined;});if(sets.every(set=>set&&set.length)&&new Set(sets.flat()).size===sets.flat().length)return name;}return undefined;}
export function removeArgumentArrayItem(draft:ArgumentDraft,path:string,index:number):ArgumentDraft{const value=readArgument(draft.value,path);if(!Array.isArray(value)||index<0||index>=value.length)return draft;const next=[...value];next.splice(index,1);const base=pathParts(path);const reindex=<T,>(values:Record<string,T>):Record<string,T>=>{const out:Record<string,T>={};for(const [key,value] of Object.entries(values)){const parts=pathParts(key);if(parts.length>base.length&&base.every((part,at)=>parts[at]===part)&&/^\d+$/u.test(parts[base.length])){const item=Number(parts[base.length]);if(item===index)continue;if(item>index)parts[base.length]=String(item-1);out[parts.reduce((at,part)=>pointer(at,part),'')]=value;}else out[key]=value;}return out;};return {...setArgument(draft,path,next),texts:reindex(draft.texts),skipped:reindex(draft.skipped),omitted:reindex(draft.omitted),touched:{...reindex(draft.touched),[path]:true},expanded:reindex(draft.expanded),branches:reindex(draft.branches)};}
export function replaceArgumentBranch(draft:ArgumentDraft,path:string,schema:unknown,index:number):ArgumentDraft{
 const initial=createArgumentDraft(schema),changed=setArgument(draft,path,initial.value);
 const outside=<T,>(entries:Record<string,T>)=>Object.fromEntries(Object.entries(entries).filter(([key])=>key!==path&&!key.startsWith(`${path}/`))) as Record<string,T>;
 const skipped=outside(draft.skipped);for(const [key,value]of Object.entries(initial.skipped))skipped[`${path}${key}`]=value;
 return {...changed,texts:outside(draft.texts),skipped:{...skipped,[path]:false},omitted:outside(draft.omitted),expanded:{...outside(draft.expanded),[path]:draft.expanded[path]??true},touched:{...outside(draft.touched),[path]:true},branches:{...outside(draft.branches),[path]:index}};
}
/** Check editor-only state before execution; the last parseable value cannot bypass malformed text. */
export function draftLocalIssues(schema:unknown,draft:ArgumentDraft):SchemaIssue[]{
 if(draft.parseError)return [{path:'',code:'json_syntax'}];
 const active=(path:string)=>{let at='';if(draft.skipped[at])return false;for(const part of pathParts(path)){at=pointer(at,part);if(draft.skipped[at])return false;}return true;};
 const issues:SchemaIssue[]=[];
 for(const [path,text]of Object.entries(draft.texts)){
  if(!active(path))continue;const node=displaySchema(schemaAtPath(schema,path,draft),schema),type=Array.isArray(node?.type)?node.type.find(value=>value!=='null'):node?.type;
  if(type==='number'||type==='integer'){if(!/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/u.test(text)||!Number.isFinite(Number(text)))issues.push({path,code:'input_incomplete'});}
  else try{JSON.parse(text);}catch{issues.push({path,code:'json_syntax'});}
 }
 for(const [path,skipped]of Object.entries(draft.skipped))if(!skipped&&active(path)&&readArgument(draft.value,path)===undefined&&!issues.some(issue=>issue.path===path))issues.push({path,code:'input_incomplete'});
 return issues;
}
