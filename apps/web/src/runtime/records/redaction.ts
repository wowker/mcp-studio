import {compareUnicode} from './canonical';
import type {RedactionMarker} from '../../generated/platform';
export const redactionMarker=Object.freeze({'$redacted':true});
export const isRedactionMarker=(value:unknown):boolean=>!!value&&typeof value==='object'&&Object.keys(value).length===1&&Object.hasOwn(value,'$redacted')&&(value as Record<string,unknown>).$redacted===true;
export type RedactionOptions={sensitiveValues?:unknown[];projectPointers?:string[];additionalPointers?:string[];maxBytes?:number};
export type RedactionResult={value:unknown;markers:RedactionMarker[];omitted:boolean;reason?:string};
const escape=(part:string)=>part.replace(/~/gu,'~0').replace(/\//gu,'~1');
export function pointerParts(pointer:string):string[]{
 if(pointer==='')return [];
 if(!pointer.startsWith('/')||/~(?![01])/u.test(pointer))throw Error('invalid_pointer');
 return pointer.slice(1).split('/').map(part=>part.replace(/~1/gu,'/').replace(/~0/gu,'~'));
}
function exists(value:unknown,pointer:string):boolean{
 let current=value;
 for(const part of pointerParts(pointer)){
  if(!current||typeof current!=='object'||!Object.hasOwn(current,part))return false;
  if(Array.isArray(current)&&! /^(?:0|[1-9]\d*)$/u.test(part))return false;
  current=(current as Record<string,unknown>)[part];
 }
 return true;
}
// Union with the platform/Agent defaults: substring keys remain conservative;
// the browser's existing passwd/mobile aliases retain their exact-name boundary.
const secretField=/(?:authorization|credential|api[_-]?key|access[_-]?token|refresh[_-]?token|token|password|secret|cookie|email|phone|^passwd$|^mobile$)/iu;
export const sensitiveName=(name:string)=>secretField.test(name);
const secretText=/(?:[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}|\+?[0-9][0-9 -]{8,}[0-9]|Bearer[ \t\n\f\r]+[^ \t\n\f\r]+|Bearer\s+\S+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|sk-[A-Za-z0-9_-]{8,}|[A-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9.-]*[A-Z0-9])?\.[A-Z]{2,}|\b1[3-9]\d{9}\b)/iu;
function unsafeURL(text:string):boolean{
 const unsafeAddress=(address:string)=>{
  try{const url=new URL(address);return ['http:','https:'].includes(url.protocol)&&(/^https?:\/\/[^/?#]*@/iu.test(address)||!!url.username||!!url.password||Array.from(url.searchParams.keys()).some(key=>secretField.test(key)||/^signature$/iu.test(key)));}catch{return false;}
 };
 // The Go receiver also accepts whole HTTP-scheme references; keep embedded
 // browser URL protection as part of the shared conservative union.
 if(unsafeAddress(text))return true;
 for(const match of text.matchAll(/https?:\/\/[^\s"'<>]+/giu))if(unsafeAddress(match[0]))return true;
 return false;
}
/** Same engine serves snapshots, previews, default copy/export and platform upload. */
export function redact(value:unknown,options:RedactionOptions={}):RedactionResult{
 const markers:RedactionMarker[]=[];let visits=0,sourceVisits=0;
 const secrets:string[]=[];let sourceIncomplete=false;
 const collect=(input:unknown,depth=0)=>{
  if(input&&typeof input==='object'&&Object.keys(input).length===1&&Object.hasOwn(input,'$redacted')&&(input as Record<string,unknown>).$redacted===true)return;
  if(++sourceVisits>4096||depth>64){sourceIncomplete=true;return;}
  if(typeof input==='string'||typeof input==='number'||typeof input==='boolean'){if(String(input))secrets.push(String(input));}
  else if(Array.isArray(input))for(const child of input)collect(child,depth+1);
  else if(input&&typeof input==='object')for(const [key,child]of Object.entries(input)){collect(key,depth+1);collect(child,depth+1);}
 };
 for(const secret of options.sensitiveValues??[])collect(secret);
 const additional=new Set(options.additionalPointers??[]),project=new Set(options.projectPointers??[]);
 for(const path of additional)if(!exists(value,path))throw Error('invalid_pointer');
 for(const path of project)pointerParts(path);
 let gatherVisits=0;
 const gather=(input:unknown,path='',depth=0):void=>{
  if(++gatherVisits>65536||depth>64){sourceIncomplete=true;return;}
  if(additional.has(path)||project.has(path))collect(input);
  if(Array.isArray(input)){input.forEach((child,index)=>gather(child,`${path}/${index}`,depth+1));return;}
  if(input&&typeof input==='object')for(const [key,child]of Object.entries(input)){
   if(secretField.test(key))collect(child);else gather(child,`${path}/${escape(key)}`,depth+1);
  }
 };gather(value);
 const mark=(path:string,reason:RedactionMarker['reason'])=>{markers.push({path,reason});return redactionMarker;};
 const source=(text:string)=>secrets.some(secret=>text.includes(secret));
 const walk=(input:unknown,path:string,depth=0):unknown=>{
  if(++visits>65536||depth>64)throw Error('content_complexity');
  if(additional.has(path))return mark(path,'additional');
  if(project.has(path))return mark(path,'project');
  if(typeof input==='string'){
   if(source(input))return mark(path,'source');
   if(secretText.test(input)||unsafeURL(input))return mark(path,'default');
   return input;
  }
  if(typeof input==='number'||typeof input==='boolean'){
   if(typeof input==='number'&&!Number.isFinite(input))throw Error('unstructured_content');
   return source(String(input))?mark(path,'source'):input;
  }
  if(input===null)return null;
  if(Array.isArray(input))return input.map((child,index)=>walk(child,`${path}/${index}`,depth+1));
  if(!input||typeof input!=='object'||Object.getPrototypeOf(input)!==Object.prototype&&Object.getPrototypeOf(input)!==null)throw Error('unstructured_content');
  const object=input as Record<string,unknown>;
  if(['image','audio'].includes(String(object.type))||Object.hasOwn(object,'blob')){
   markers.push({path,reason:'omitted'});
   return {type:typeof object.type==='string'?object.type:'binary',mimeType:typeof object.mimeType==='string'&&!secretText.test(object.mimeType)&&!source(object.mimeType)?object.mimeType:'',omitted:'binary_content'};
  }
  for(const key of Object.keys(object))if(source(key)||secretText.test(key)||unsafeURL(key))return mark(path,'source');
  const result:Record<string,unknown>=Object.create(null) as Record<string,unknown>;
  for(const [key,child]of Object.entries(object))result[key]=secretField.test(key)?mark(`${path}/${escape(key)}`,'default'):walk(child,`${path}/${escape(key)}`,depth+1);
  return result;
 };
 if(sourceIncomplete)return {value:redactionMarker,markers:[{path:'',reason:'omitted'}],omitted:true,reason:'source_complexity'};
 let safe:unknown;
 try{safe=walk(value,'');if(new TextEncoder().encode(JSON.stringify(safe)).length>(options.maxBytes??10*1024*1024))throw Error('content_size');}
 catch(error){const reason=error instanceof Error?error.message:'unstructured_content';return {value:redactionMarker,markers:[{path:'',reason:'omitted'}],omitted:true,reason};}
 markers.sort((a,b)=>compareUnicode(a.path,b.path));
 return {value:safe,markers,omitted:false};
}
/** Only recorded structural markers remove parameters; literal mask-looking text is ordinary data. */
export function restoreRequest(value:unknown,markers:RedactionMarker[]):{value:Record<string,unknown>;missing:string[]}{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('invalid_request');
 const result:Record<string,unknown>=Object.create(null) as Record<string,unknown>,missing=new Set<string>();
 for(const marker of markers){const parts=pointerParts(marker.path);if(parts[0]==='request'&&parts.length>1)missing.add(parts[1]);else if(marker.path==='/request'||marker.path==='')for(const key of Object.keys(value))missing.add(key);}
 for(const [key,child]of Object.entries(value)){if(!missing.has(key))result[key]=structuredClone(child);}
 return {value:result,missing:[...missing].sort()};
}
