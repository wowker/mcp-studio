import {registerSchema,unregisterSchema,validate,setShouldValidateSchema,setShouldValidateFormat,type SchemaObject,type OutputUnit} from '@hyperjump/json-schema/draft-2020-12';
import '@hyperjump/json-schema/draft-07';
import {BASIC,addKeyword} from '@hyperjump/json-schema/experimental';
import * as Instance from '@hyperjump/json-schema/instance/experimental';
import {removeUriSchemePlugin,value as schemaValue} from '@hyperjump/browser';
import type {Json} from '@hyperjump/json-pointer';
import {atPointer,escapePointer,checkProfile,jsonLimit,exceedsComplexity,type SchemaProfile} from './profile';
import {unsupported,type SchemaIssue,type SchemaValidation} from './types';
for(const scheme of ['http','https','file'])removeUriSchemePlugin(scheme);
setShouldValidateSchema(true);setShouldValidateFormat(false);
// The library's epsilon can accept values that are not mathematical multiples.
// Public keyword replacement keeps all other formal interpreter semantics intact.
const decimal=(number:number):{coefficient:bigint;scale:number}=>{const [mantissa,exponent='0']=number.toString().toLowerCase().split('e');return {coefficient:BigInt(mantissa.replace('.','')),scale:(mantissa.split('.')[1]?.length??0)-Number(exponent)};};
addKeyword<number>({
 id:'https://json-schema.org/keyword/multipleOf',
 compile:async schema=>schemaValue<number>(schema),
 interpret:(multiple,instance)=>{
  if(Instance.typeOf(instance)!=='number')return true;if(!(multiple>0))return false;
  const numerator=decimal(Instance.value<number>(instance)),denominator=decimal(multiple),scale=Math.max(numerator.scale,denominator.scale);
  return (numerator.coefficient*10n**BigInt(scale-numerator.scale))%(denominator.coefficient*10n**BigInt(scale-denominator.scale))===0n;
 },
});
let sequence=0;
function normalize(errors:OutputUnit[],profile:SchemaProfile,value:unknown):SchemaIssue[]{
 const issues:SchemaIssue[]=[];const aggregates=errors.filter(e=>/\/(?:anyOf|oneOf)$/u.test(e.keyword));
 for(const error of errors){
  const path=decodeURIComponent(error.instanceLocation.replace(/^#/u,''));const code=error.keyword.split('/').at(-1)??'schema';
  if(['allOf','if','then','else','$ref','$dynamicRef','dependentSchemas'].includes(code))continue;
  if(aggregates.some(a=>a!==error&&error.absoluteKeywordLocation.startsWith(a.absoluteKeywordLocation+'/')))continue;
  const location=new URL(error.absoluteKeywordLocation),source=profile.resources.get(location.href.split('#')[0]);const keywordValue=atPointer(source,decodeURIComponent(location.hash));const instance=atPointer(value,path);
  const add=(p:string)=>issues.push({path:p,code});
  if(code==='required'&&Array.isArray(keywordValue)&&instance&&typeof instance==='object'){for(const key of keywordValue)if(typeof key==='string'&&!Object.hasOwn(instance,key))add(path+'/'+escapePointer(key));}
  else if((code==='dependentRequired'||code==='dependencies')&&keywordValue&&typeof keywordValue==='object'&&instance&&typeof instance==='object'){for(const [trigger,required]of Object.entries(keywordValue)){if(Object.hasOwn(instance,trigger)&&Array.isArray(required))for(const key of required)if(typeof key==='string'&&!Object.hasOwn(instance,key))add(path+'/'+escapePointer(key));}}
  else if((code==='additionalProperties'||code==='unevaluatedProperties')&&instance&&typeof instance==='object'&&!Array.isArray(instance)){
   const schema=atPointer(source,decodeURIComponent(location.hash).replace(/\/[^/]+$/u,''));const properties=schema&&typeof schema==='object'?'properties'in schema?(schema as Record<string,unknown>).properties:undefined:undefined;
   const known=new Set(properties&&typeof properties==='object'?Object.keys(properties):[]);
   if(code==='unevaluatedProperties'&&schema&&typeof schema==='object'){for(const branch of Array.isArray((schema as Record<string,unknown>).allOf)?(schema as Record<string,unknown>).allOf as unknown[]:[]){if(branch&&typeof branch==='object'&&'properties'in branch&&branch.properties&&typeof branch.properties==='object')for(const key of Object.keys(branch.properties))known.add(key);}}
   const patterns=schema&&typeof schema==='object'&&(schema as Record<string,unknown>).patternProperties;for(const key of Object.keys(instance))if(!known.has(key)&&!(patterns&&typeof patterns==='object'&&Object.keys(patterns).some(p=>new RegExp(p,'u').test(key))))add(path+'/'+escapePointer(key));
  }else add(path);
 }
 return [...new Map(issues.map(issue=>[issue.path+'\0'+issue.code,issue])).values()].sort((a,b)=>a.path.localeCompare(b.path)||a.code.localeCompare(b.code));
}
/** Interpreter entry for isolated Worker jobs and Node tests. Never call on the UI thread. */
export async function validateWithInterpreter(schema:unknown,value:unknown):Promise<SchemaValidation>{
 const uri='https://mcp-studio.invalid/schema/job-'+(++sequence),profile=checkProfile(schema,uri);if(profile.failure)return profile.failure;
 const limit=jsonLimit(value,'request');if(limit)return {supported:true,valid:false,errors:[{path:'',code:limit}]};
 if(exceedsComplexity(profile,value))return unsupported('schema_complexity');
 try{
  registerSchema(schema as SchemaObject|boolean,uri,profile.dialect);const checker=await validate(uri);const result=checker(value as Json,BASIC);
  return {supported:true,valid:result.valid,errors:result.valid?[]:normalize(result.errors??[],profile,value)};
 }catch{return unsupported('invalid_schema');}finally{unregisterSchema(uri);}
}
