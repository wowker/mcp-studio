import {validateWithInterpreter} from './interpreter';
import {unsupported} from './types';
const scope=globalThis as unknown as {onmessage:((event:MessageEvent<{schema:unknown;value:unknown}>)=>void)|null;postMessage:(value:unknown)=>void};
scope.onmessage=event=>{void validateWithInterpreter(event.data.schema,event.data.value).then(result=>scope.postMessage(result),()=>scope.postMessage(unsupported('schema_worker_failed')));};
