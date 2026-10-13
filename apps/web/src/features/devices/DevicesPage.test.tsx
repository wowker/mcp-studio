import {afterEach,it,expect,vi} from 'vitest';
import {render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {I18nextProvider} from 'react-i18next';
import {i18n} from '../../shared/i18n';
import {DevicesPage} from './DevicesPage';
import {M2Memory} from '../connections/runtimeStore';
import {ApiError,PlatformClient} from '../../shared/api';
import {agentEn,agentZh} from './translations';
const session={user:{id:'u',email:'u@test.invalid',name:'User',verified:true},teams:[],csrf:'csrf',expiresAt:'2099-01-01T00:00:00Z'};
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
it('has complete Agent bilingual resources',()=>{expect(Object.keys(agentEn).sort()).toEqual(Object.keys(agentZh).sort());for(const value of Object.values(agentZh))expect(value.trim()).not.toBe('');});
it('requires local approval code and never approves natively from the web',async()=>{await i18n.changeLanguage('en-US');const paths:string[]=[];vi.stubGlobal('fetch',async(url:string)=>{paths.push(url);const data=url.endsWith('/status')?{contractVersion:'1.0.0',deviceId:'device',state:'unpaired',capabilities:['stdio'],vaultAvailable:true,queueRetention:'encrypted'}:url.endsWith('/agent/proofs')?{proof:'private-proof',userId:'u',deviceId:'device',origin:location.origin,expiresAt:'2099-01-01T00:00:00Z'}:{challengeId:'challenge',expiresAt:'2099-01-01T00:00:00Z',deviceId:'device',userId:'u',origin:location.origin,state:'pending',capabilities:['stdio']};return new Response(JSON.stringify({data}));});const memory=new M2Memory();render(<I18nextProvider i18n={i18n}><DevicesPage memory={memory} client={new PlatformClient()} session={session}/></I18nextProvider>);const user=userEvent.setup();await waitFor(()=>expect(screen.getByRole('button',{name:'Check device'})).toHaveProperty('disabled',false));await user.click(screen.getByRole('button',{name:'Check device'}));await user.click(await screen.findByRole('button',{name:'Start pairing'}));expect(await screen.findByLabelText('One-time code from local Agent')).toBeDefined();expect(screen.getByText(/Approve in the local Agent/)).toBeDefined();expect(paths.some(path=>path.includes('/approve'))).toBe(false);expect(document.body.textContent).not.toContain('private-proof');memory.clear();});

it('retains the in-memory pairing code after network failure while the same challenge remains pending',async()=>{
 await i18n.changeLanguage('en-US');const memory=new M2Memory(),confirm=vi.fn(async()=>{throw new ApiError('agent_offline');});const agent={getSnapshot:()=>({state:'pending',address:'http://127.0.0.1:45455',origin:location.origin,challenge:{challengeId:'same',expiresAt:'2099-01-01T00:00:00Z'}}),confirm,expireChallenge:vi.fn()};vi.spyOn(memory,'agent').mockResolvedValue(agent as never);
 const user=userEvent.setup();render(<I18nextProvider i18n={i18n}><DevicesPage memory={memory} client={new PlatformClient()} session={session}/></I18nextProvider>);await user.type(await screen.findByLabelText('One-time code from local Agent'),'fixture-code');await user.click(screen.getByRole('button',{name:'Confirm code'}));await screen.findByRole('alert');expect(screen.getByLabelText('One-time code from local Agent')).toHaveProperty('value','fixture-code');expect(confirm).toHaveBeenCalledOnce();expect(localStorage.length).toBe(0);memory.clear();
});
