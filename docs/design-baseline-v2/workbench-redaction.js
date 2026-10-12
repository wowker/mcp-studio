/* Design examples only. Production must enforce its own allowlist and data policies. */
window.workbenchRedaction=(()=>{
 const marker='[REDACTED]',sensitive=/authorization|password|passwd|secret|token|api[_-]?key|cookie|email|phone|mobile|id[_-]?card/i;
 const pointer=(path,key)=>path+'/'+String(key).replace(/~/g,'~0').replace(/\//g,'~1');
 function sanitize(source,extraPaths=[]) {
  const paths=new Set(),known=new Set();
  const extras=new Set(extraPaths);
  function collect(value,path=''){if(!value||typeof value!=='object')return;for(const [key,item]of Object.entries(value)){const p=pointer(path,key);if(sensitive.test(key)||extras.has(p)){if(typeof item==='string'&&item.length>=6&&item!==marker)known.add(item);}else collect(item,p);}}
  collect(source);
  function walk(value,path='') {
   if(extras.has(path)){paths.add(path);return marker;}
   if(Array.isArray(value))return value.map((v,i)=>walk(v,pointer(path,i)));
   if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>{const p=pointer(path,key);if(sensitive.test(key)&&item!==null){paths.add(p);return[key,marker];}return[key,walk(item,p)];}));
   if(typeof value!=='string')return value;
   if(value===marker){paths.add(path);return marker;}
   let output=value;
   if(/^[\s]*[\[{]/.test(value))try{const parsed=JSON.parse(value);if(parsed&&typeof parsed==='object'){const before=paths.size,clean=walk(parsed,path);if(paths.size>before)output=JSON.stringify(clean);}}catch{/* An ordinary non-JSON string. */}
   output=output.replace(/\bBearer\s+(?!\[REDACTED\])[^\s"'<>]+/gi,'Bearer '+marker)
    .replace(/(\b(?:authorization|cookie|set-cookie)\s*:\s*)[^\r\n]+/gi,'$1'+marker)
    .replace(/([?&](?:access_token|refresh_token|token|api_key|secret|password)=)[^&#\s"']*/gi,'$1'+marker)
    .replace(/(https?:\/\/)[^\s/@:]+:[^\s/@]+@/gi,'$1'+marker+'@');
   for(const secret of known)output=output.split(secret).join(marker).split(encodeURIComponent(secret)).join(marker);
   if(output!==value||output.includes(marker))paths.add(path);
   return output;
  }
  const value=walk(source);return {value,paths:[...paths].sort()};
 }
 function snapshot(record){return {incomplete:record.incomplete,truncated:record.truncated,omitted:record.omitted,id:record.id,name:record.name,note:record.note,scope:record.scope,ownerId:record.ownerId,sourceRunId:record.sourceRunId,savedAt:record.savedAt,projectId:record.projectId,serverId:record.serverId,tool:record.tool,actor:record.actor,profile:record.profile,date:record.date,time:record.time,duration:record.duration,status:record.status,transport:record.transport||'http',endpoint:record.endpoint,configRevision:record.configRevision,arguments:record.arguments,response:record.response,hasResponse:record.hasResponse??(record.status==='succeeded'||record.response!=null),protocol:record.protocol,headers:record.headers};}
 const prepare=record=>sanitize(snapshot(record),record.redactionPaths||[]);
 function restore(record){const clean=prepare(record),args={},omitted=[];for(const [key,value]of Object.entries(clean.value.arguments||{})){if(JSON.stringify(value).includes(marker)){omitted.push(key);continue;}args[key]=structuredClone(value);}return {arguments:args,omitted};}
 function exists(source,path){if(!/^\/(?:[^~]|~[01])+$/.test(path))return false;let value=source;for(const part of path.slice(1).split('/').map(x=>x.replace(/~1/g,'/').replace(/~0/g,'~'))){if(value===null||typeof value!=='object'||!Object.hasOwn(value,part))return false;value=value[part];}return true;}
 return {marker,sanitize,snapshot,prepare,restore,exists};
})();
