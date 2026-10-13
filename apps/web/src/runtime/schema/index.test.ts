import {it,expect,vi,afterEach} from 'vitest';
import {validateToolInput} from './index';
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
it('fails safely if a browser Worker is unavailable instead of validating on the UI thread',async()=>{vi.stubGlobal('Worker',undefined);expect(await validateToolInput({type:'object'},{})).toMatchObject({supported:false,valid:false,reason:'schema_worker_unavailable'});});
it('runs each job in its own Worker and terminates after its actual response',async()=>{
 const workers:FakeWorker[]=[];class FakeWorker{onmessage:((event:{data:unknown})=>void)|null=null;onerror:(()=>void)|null=null;terminated=false;postMessage(data:unknown){expect(data).toEqual({schema:{type:'object'},value:{}});queueMicrotask(()=>this.onmessage?.({data:{supported:true,valid:true,errors:[]}}));}terminate(){this.terminated=true;}constructor(){workers.push(this);}}
 vi.stubGlobal('Worker',FakeWorker);expect((await validateToolInput({type:'object'},{})).valid).toBe(true);expect((await validateToolInput({type:'object'},{})).valid).toBe(true);expect(workers).toHaveLength(2);expect(workers.every(w=>w.terminated)).toBe(true);
});
it('terminates a nonresponding job at the bounded CPU budget and returns no instance data',async()=>{
 vi.useFakeTimers();const terminate=vi.fn();vi.stubGlobal('Worker',class{onmessage=null;onerror=null;postMessage(){}terminate=terminate;});const pending=validateToolInput({type:'string',pattern:'(a+)+$'},'private-instance');await vi.advanceTimersByTimeAsync(1500);expect(await pending).toEqual({supported:false,valid:false,errors:[],reason:'schema_validation_timeout'});expect(terminate).toHaveBeenCalledOnce();
});
it('terminates a failed worker without leaking its raw exception',async()=>{const terminate=vi.fn();vi.stubGlobal('Worker',class{onmessage=null;onerror:(()=>void)|null=null;postMessage(){queueMicrotask(()=>this.onerror?.());}terminate=terminate;});expect(await validateToolInput({},{})).toMatchObject({reason:'schema_worker_failed',errors:[]});expect(terminate).toHaveBeenCalledOnce();});
it('rejects oversized jobs before creating a worker',async()=>{const worker=vi.fn();vi.stubGlobal('Worker',worker);expect((await validateToolInput({},'x'.repeat(1048577))).errors).toEqual([{path:'',code:'request_limit'}]);expect(worker).not.toHaveBeenCalled();});
