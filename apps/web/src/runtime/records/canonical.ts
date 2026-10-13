/** Digest envelopes contain safe integers; arbitrary payload numbers stay in frozen JSON strings. */
export function compareUnicode(a:string,b:string):number{
 const left=Array.from(a),right=Array.from(b);
 for(let i=0;i<Math.min(left.length,right.length);i++){const difference=left[i].codePointAt(0)!-right[i].codePointAt(0)!;if(difference)return difference;}
 return left.length-right.length;
}
function validUnicode(value:string):boolean{
 for(let i=0;i<value.length;i++){const c=value.charCodeAt(i);if(c>=0xd800&&c<=0xdbff){const next=value.charCodeAt(++i);if(!(next>=0xdc00&&next<=0xdfff))return false;}else if(c>=0xdc00&&c<=0xdfff)return false;}
 return true;
}
export function canonicalJSON(value:unknown):string{
 let visits=0;const active=new Set<object>();
 const visit=(item:unknown,depth=0):string=>{
  if(++visits>65536||depth>64)throw Error('unsafe_digest_value');
  if(item===null)return 'null';if(typeof item==='boolean')return String(item);
  if(typeof item==='string'){if(!validUnicode(item))throw Error('unsafe_digest_value');return JSON.stringify(item);}
  if(typeof item==='number'){if(!Number.isSafeInteger(item))throw Error('unsafe_digest_value');return String(Object.is(item,-0)?0:item);}
  if(!item||typeof item!=='object'||active.has(item))throw Error('unsafe_digest_value');
  active.add(item);try{
   if(Array.isArray(item)){if(Object.keys(item).length!==item.length)throw Error('unsafe_digest_value');return '['+item.map(child=>visit(child,depth+1)).join(',')+']';}
   if(Object.getPrototypeOf(item)!==Object.prototype&&Object.getPrototypeOf(item)!==null)throw Error('unsafe_digest_value');
   return '{'+Object.keys(item).sort(compareUnicode).map(key=>visit(key,depth+1)+':'+visit((item as Record<string,unknown>)[key],depth+1)).join(',')+'}';
  }finally{active.delete(item);}
 };return visit(value);
}
export async function frozenDigest(value:unknown):Promise<string>{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('unsafe_digest_value');
 const envelope:Record<string,unknown>=Object.create(null) as Record<string,unknown>;
 for(const [key,item]of Object.entries(value))if(key!=='frozenDigest')envelope[key]=item;
 const bytes=new TextEncoder().encode(canonicalJSON(envelope));
 const hashed=await crypto.subtle.digest('SHA-256',bytes);
 return Array.from(new Uint8Array(hashed),b=>b.toString(16).padStart(2,'0')).join('');
}
/** Validate duplicate keys before JSON.parse loses that information. Payload JSON strings remain opaque. */
export function parseStrictEnvelope(raw:string):Record<string,unknown>{
 let value:unknown;try{value=JSON.parse(raw);}catch{throw Error('unsafe_digest_value');}
 let position=0,visits=0;
 const whitespace=()=>{while(/\s/u.test(raw[position]??'')&&position<raw.length)position++;};
 const string=()=>{const start=position++;while(position<raw.length){const c=raw[position++];if(c==='\\'){position++;continue;}if(c==='"'){const decoded=JSON.parse(raw.slice(start,position)) as string;if(!validUnicode(decoded))throw Error('unsafe_digest_value');return decoded;}}throw Error('unsafe_digest_value');};
 const scan=(depth=0):void=>{
  if(++visits>65536||depth>64)throw Error('unsafe_digest_value');whitespace();const c=raw[position];
  if(c==='"'){string();return;}
  if(c==='{'){position++;whitespace();const keys=new Set<string>();if(raw[position]==='}'){position++;return;}for(;;){whitespace();const key=string();if(keys.has(key))throw Error('unsafe_digest_value');keys.add(key);whitespace();position++;scan(depth+1);whitespace();if(raw[position++]==='}')return;}}
  if(c==='['){position++;whitespace();if(raw[position]===']'){position++;return;}for(;;){scan(depth+1);whitespace();if(raw[position++]===']')return;}}
  const token=raw.slice(position).match(/^(?:true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/u)?.[0];if(!token)throw Error('unsafe_digest_value');position+=token.length;
 };scan();whitespace();if(position!==raw.length||!value||typeof value!=='object'||Array.isArray(value))throw Error('unsafe_digest_value');
 canonicalJSON(value);return value as Record<string,unknown>;
}
export function canonicalEnvelope(raw:string):string{
 const value=parseStrictEnvelope(raw);delete value.frozenDigest;return canonicalJSON(value);
}
