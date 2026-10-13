import type {ResolvedEnvironment} from '../environment';
export const copyJSON=<T>(value:T):T=>value===undefined?value:JSON.parse(JSON.stringify(value)) as T;
export function freezeEnvironment(environment:ResolvedEnvironment):ResolvedEnvironment{
 const rows=copyJSON(environment.rows),values=new Map(rows.map(row=>[row.name,copyJSON(environment.read(row.name))])),definitions=new Map(rows.map(row=>[row.name,copyJSON(environment.definition(row.name))]));
 return {rows,error:environment.error,read:name=>copyJSON(values.get(name)),definition:name=>copyJSON(definitions.get(name)),readDefinition:id=>{const name=[...definitions].find(([,definition])=>definition?.id===id)?.[0];return name===undefined?undefined:copyJSON(values.get(name));}};
}
/** Private comparison includes ephemeral values; it must never enter a Run or UI. */
export function environmentFingerprint(environment:ResolvedEnvironment):string{return JSON.stringify({error:environment.error,rows:environment.rows.map(row=>({row,definition:environment.definition(row.name),resolved:environment.read(row.name)}))});}
export function deepFreeze<T>(value:T):T{if(value&&typeof value==='object'){Object.freeze(value);for(const child of Object.values(value))deepFreeze(child);}return value;}
