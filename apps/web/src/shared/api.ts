import {z} from 'zod';
import {errorSchema} from '../generated/platform';
export class ApiError extends Error{constructor(public readonly code:string,public readonly status=0){super(code);}}
export class PlatformClient{
  csrf='';
  private generation=0;private deniedReads=new Set<string>();
  constructor(private readonly expired?:()=>void,private readonly scopeChanged?:(code:string,path:string)=>void){}
  expireSession(){this.setCSRF('');this.expired?.();}
  setCSRF(value:string){if(value!==this.csrf){this.generation++;this.deniedReads.clear();}this.csrf=value;}
  async request<T>(path:string,schema:z.ZodType<T>,options:{method?:string;body?:unknown;bodySchema?:z.ZodType;signal?:AbortSignal;headers?:HeadersInit}={}):Promise<T>{
    const generation=this.generation;
    const method=options.method??'GET'; let body:unknown=options.body;
    if(options.bodySchema){try{body=z.decode(options.bodySchema,body);}catch{throw new ApiError('invalid_input');}}
    const headers=new Headers(options.headers);headers.set('Accept','application/json');
    if(body!==undefined)headers.set('Content-Type','application/json');
    if(method!=='GET'&&this.csrf)headers.set('X-CSRF-Token',this.csrf);
    let response:Response;
    try{response=await fetch(`/api/v1${path}`,{method,headers,credentials:'same-origin',cache:'no-store',body:body===undefined?undefined:JSON.stringify(body),signal:options.signal});}
    catch(error){if(error instanceof DOMException&&error.name==='AbortError')throw error;throw new ApiError('network');}
    if(response.status===401&&generation===this.generation)this.expireSession();
    let value:unknown;try{value=await response.json();}catch{throw new ApiError(response.status===401?'unauthenticated':'invalid_response',response.status);}
    if(!response.ok){const decoded=errorSchema.safeParse(value);const code=decoded.success?decoded.data.error.code:'invalid_response';if(generation===this.generation&&response.status===403&&(code==='forbidden'||method!=='GET'&&code==='csrf_rejected')){if(method!=='GET'||!this.deniedReads.has(path)){if(method==='GET')this.deniedReads.add(path);this.scopeChanged?.(code,path);}}throw new ApiError(code,response.status);}
    this.deniedReads.delete(path);
    try{const envelope=z.object({data:schema}).strict();return z.decode(envelope,value as z.input<typeof envelope>).data;}catch{throw new ApiError('invalid_response');}
  }
}
export function codeOf(error:unknown){return error instanceof ApiError?error.code:'unknown';}
