import {afterEach, describe, expect, it, vi} from 'vitest';
import {PlatformClient, ApiError} from './api';
import {acceptedSchema, loginRequestSchema} from '../generated/platform';

afterEach(() => vi.unstubAllGlobals());
describe('platform boundary', () => {
  it('rejects extra response fields instead of accepting wire drift', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({data:{ok:true, secret:'not-allowed'}})));
    await expect(new PlatformClient().request('/logout', acceptedSchema, {method:'POST'})).rejects.toMatchObject({code:'invalid_response'});
  });
  it('sends Cookie credentials and in-memory CSRF on authenticated writes', async () => {
    let captured: RequestInit | undefined;
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {captured=init; return new Response(JSON.stringify({data:{ok:true}}));});
    const client=new PlatformClient(); client.setCSRF('session-csrf');
    await client.request('/logout', acceptedSchema, {method:'POST'});
    expect(captured?.credentials).toBe('same-origin');
    expect(new Headers(captured?.headers).get('X-CSRF-Token')).toBe('session-csrf');
    expect(localStorage.length).toBe(0);
  });
  it('clears session before surfacing a 401 and masks server details', async () => {
    let invalidated=false;
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({error:{code:'unauthenticated'}}),{status:401}));
    const client=new PlatformClient(() => {invalidated=true;}); client.setCSRF('old-csrf');
    await expect(client.request('/session',acceptedSchema)).rejects.toBeInstanceOf(ApiError);
    expect(invalidated).toBe(true);
    expect(client.csrf).toBe('');
  });
  it('rejects invalid outbound requests before a network call',async () => {
    const network=vi.fn(); vi.stubGlobal('fetch',network);
    await expect(new PlatformClient().request('/login',acceptedSchema,{method:'POST',body:{email:'a'},bodySchema:loginRequestSchema})).rejects.toMatchObject({code:'invalid_input'});
    expect(network).not.toHaveBeenCalled();
  });
});

it('rechecks scope only for forbidden and refreshes CSRF without clearing protected-member input',async()=>{
 const notices:string[]=[];const client=new PlatformClient(undefined,code=>notices.push(code));
 for(const code of ['protected_member','csrf_rejected','forbidden']){vi.stubGlobal('fetch',async()=>new Response(JSON.stringify({error:{code}}),{status:403}));await expect(client.request('/projects/p/members/u',acceptedSchema,{method:'PATCH'})).rejects.toMatchObject({code});}
 expect(notices).toEqual(['csrf_rejected','forbidden']);
});

it('does not let delayed errors from an old identity invalidate the new session or permissions',async()=>{
 for(const status of [401,403]){let release:(value:Response)=>void=()=>{};vi.stubGlobal('fetch',()=>new Promise<Response>(resolve=>{release=resolve;}));const expired=vi.fn(),changed=vi.fn();const client=new PlatformClient(expired,changed);client.setCSRF('old-identity');const pending=client.request('/projects/p',acceptedSchema,{method:'PATCH'});client.setCSRF('new-identity');release(new Response(JSON.stringify({error:{code:status===401?'unauthenticated':'forbidden'}}),{status}));await expect(pending).rejects.toMatchObject({status});expect(expired).not.toHaveBeenCalled();expect(changed).not.toHaveBeenCalled();expect(client.csrf).toBe('new-identity');}
});

it('still invalidates a current request after refreshing the same session CSRF',async()=>{
 let release:(value:Response)=>void=()=>{};vi.stubGlobal('fetch',()=>new Promise<Response>(resolve=>{release=resolve;}));const expired=vi.fn();const client=new PlatformClient(expired);client.setCSRF('same-session');const pending=client.request('/session',acceptedSchema);client.setCSRF('same-session');release(new Response(JSON.stringify({error:{code:'unauthenticated'}}),{status:401}));await expect(pending).rejects.toMatchObject({status:401});expect(expired).toHaveBeenCalledOnce();
});

it('sends the saved object ETag for conditional writes without altering CSRF',async()=>{
 let captured:RequestInit|undefined;vi.stubGlobal('fetch',async(_url:string,init:RequestInit)=>{captured=init;return new Response(JSON.stringify({data:{ok:true}}));});const client=new PlatformClient();client.setCSRF('current');await client.request('/projects/p/connections/c',acceptedSchema,{method:'PATCH',headers:{'If-Match':'"connection-2"'}});expect(new Headers(captured?.headers).get('If-Match')).toBe('"connection-2"');expect(new Headers(captured?.headers).get('X-CSRF-Token')).toBe('current');
});

it('refreshes revoked content permission on a current GET without a repeated denial loop',async()=>{const changed=vi.fn();const client=new PlatformClient(undefined,changed);client.setCSRF('same-identity');vi.stubGlobal('fetch',async()=>new Response(JSON.stringify({error:{code:'forbidden'}}),{status:403}));for(let i=0;i<2;i++)await expect(client.request('/projects/p/variables',acceptedSchema)).rejects.toMatchObject({code:'forbidden'});expect(changed).toHaveBeenCalledTimes(1);});

it('identifies the denied object project so a different project run is not revoked',async()=>{const changed=vi.fn();vi.stubGlobal('fetch',async()=>new Response(JSON.stringify({error:{code:'forbidden'}}),{status:403}));await expect(new PlatformClient(undefined,changed).request('/projects/owned/record-uploads',acceptedSchema,{method:'POST'})).rejects.toMatchObject({code:'forbidden'});expect(changed).toHaveBeenCalledWith('forbidden','/projects/owned/record-uploads');});
