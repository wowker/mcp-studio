import {it,expect,vi} from 'vitest';
import {MemoryVault} from './vault';
it('isolates credentials by user project and connection and expires without persistence',()=>{
 const v=new MemoryVault();const s={userId:'u',projectId:'p',connectionId:'c'};
 v.setCredential(s,'synthetic',10);expect(v.getCredential(s,9)).toBe('synthetic');expect(v.getCredential({...s,connectionId:'other'},9)).toBeUndefined();expect(v.getCredential({...s,userId:'other'},9)).toBeUndefined();expect(v.getCredential(s,10)).toBeUndefined();
 expect(localStorage.length).toBe(0);expect(sessionStorage.length).toBe(0);expect(JSON.stringify(v)).not.toContain('synthetic');
});
it('revokes project values by definition identity and notifies sessions',()=>{
 const v=new MemoryVault();const s={userId:'u',projectId:'p',connectionId:'c'};const f=vi.fn();v.subscribe(f);v.setVariable('u','p','definition','private');v.setCredential(s,'token');v.revokeProject('u','p');expect(v.getPersonal('u','p')).toEqual({});expect(v.getCredential(s)).toBeUndefined();expect(f).toHaveBeenCalled();v.clear();
});
it('retains safe original resource metadata with OAuth credential identity',()=>{const v=new MemoryVault(),s={userId:'u',projectId:'p',connectionId:'c'};v.setCredential(s,'private',undefined,'https://mcp.example/mcp');expect(v.getCredentialResource(s)).toBe('https://mcp.example/mcp');v.removeCredential(s);expect(v.getCredentialResource(s)).toBeUndefined();});
it('reactively expires without requiring a render read and cleans prior expiry timers',async()=>{
 vi.useFakeTimers();vi.setSystemTime(0);try{const v=new MemoryVault(),s={userId:'u',projectId:'p',connectionId:'c'},changed=vi.fn();v.subscribe(changed);v.setCredential(s,'first',10);v.setCredential(s,'replacement',30);changed.mockClear();await vi.advanceTimersByTimeAsync(11);expect(v.getCredential(s)).toBe('replacement');expect(changed).not.toHaveBeenCalled();await vi.advanceTimersByTimeAsync(20);expect(changed).toHaveBeenCalledOnce();expect(v.getCredential(s)).toBeUndefined();v.setCredential(s,'later',100);v.clear();expect(vi.getTimerCount()).toBe(0);}finally{vi.useRealTimers();}
});
it('does not synchronously notify subscribers when expiry is observed during rendering',async()=>{
 const v=new MemoryVault(),s={userId:'u',projectId:'p',connectionId:'c'},changed=vi.fn();v.subscribe(changed);v.setCredential(s,'expired',1);changed.mockClear();expect(v.getCredential(s,2)).toBeUndefined();expect(changed).not.toHaveBeenCalled();await Promise.resolve();expect(changed).toHaveBeenCalledOnce();v.clear();
});
it('emits scoped secret-free invalidations for idle expiry, replacement and removal',async()=>{
 vi.useFakeTimers();vi.setSystemTime(0);try{const v=new MemoryVault(),a={userId:'u',projectId:'p',connectionId:'a'},b={...a,connectionId:'b'},invalidated=vi.fn();v.subscribeInvalidation(invalidated);v.setCredential(a,'synthetic-a',10);v.setCredential(b,'synthetic-b',100);await vi.advanceTimersByTimeAsync(11);expect(invalidated.mock.calls).toEqual([[a,'expired']]);expect(v.getCredential(b)).toBe('synthetic-b');v.setCredential(b,'replacement');expect(invalidated.mock.calls.at(-1)).toEqual([b,'replaced']);v.removeCredential(b);expect(invalidated.mock.calls.at(-1)).toEqual([b,'removed']);expect(JSON.stringify(invalidated.mock.calls)).not.toContain('synthetic');v.clear();}finally{vi.useRealTimers();}
});
it('revokes only matching credential scopes, clears remaining scopes and unsubscribes',()=>{
 const v=new MemoryVault(),a={userId:'u',projectId:'p',connectionId:'a'},b={...a,projectId:'q'},c={...a,userId:'other'},invalidated=vi.fn();const stop=v.subscribeInvalidation(invalidated);for(const s of [a,b,c])v.setCredential(s,'synthetic');v.revokeProject('u','p');expect(invalidated.mock.calls).toEqual([[a,'revoked']]);v.clear();expect(invalidated.mock.calls).toEqual([[a,'revoked'],[b,'cleared'],[c,'cleared']]);stop();v.setCredential(a,'new');v.removeCredential(a);expect(invalidated).toHaveBeenCalledTimes(3);
});
it('queues render-observed expiry invalidation without disconnecting a newer replacement',async()=>{
 const v=new MemoryVault(),scope={userId:'u',projectId:'p',connectionId:'c'},invalidated=vi.fn();v.subscribeInvalidation(invalidated);v.setCredential(scope,'expired',1);v.getCredential(scope,2);expect(invalidated).not.toHaveBeenCalled();await Promise.resolve();expect(invalidated.mock.calls).toEqual([[scope,'expired']]);invalidated.mockClear();v.setCredential(scope,'expired-again',1);v.getCredential(scope,2);v.setCredential(scope,'new');expect(invalidated.mock.calls).toEqual([[scope,'replaced']]);invalidated.mockClear();await Promise.resolve();expect(invalidated).not.toHaveBeenCalled();v.clear();
});
