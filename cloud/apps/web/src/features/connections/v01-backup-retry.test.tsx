import {afterEach,it,expect,vi} from 'vitest';
import {render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {I18nextProvider} from 'react-i18next';
import {i18n} from '../../shared/i18n';
import {ApiError} from '../../shared/api';
import {M2Memory} from './runtimeStore';
import {AgentBackupsPanel} from './AgentBackupsPanel';

afterEach(()=>vi.restoreAllMocks());

// This isolates the panel's recovery behavior at its external Agent boundary.
// Real OAuth/local persistence/platform reauthentication and retry are exercised
// separately by tests/e2e/v01-backup-retry.spec.ts.
it('retries a rejected backup with the retained scope and explicit consent, then shows only the accepted backup',async()=>{
 await i18n.changeLanguage('en-US');
 const scope={projectId:'p',connectionId:'c',kind:'oauth' as const,referenceId:''},backup={id:'accepted-backup',kind:'oauth',referenceId:'',sourceDigest:'f'.repeat(64),version:1,createdAt:'2026-10-14T00:00:00Z',updatedAt:'2026-10-14T00:00:00Z'};
 const memory=new M2Memory(),restored=vi.fn();
 const requests:{path:string;method?:string;body?:unknown}[]=[];
 let accepted=false,attempts=0;
 vi.spyOn(memory,'existingAgent').mockReturnValue({request:async(path:string,_schema:unknown,options?:{method?:string;body?:unknown})=>{
  requests.push({path,...options});
  if(path.startsWith('/v1/credentials/backups?'))return {backupsJSON:JSON.stringify(accepted?[backup]:[])};
  if(path==='/v1/credentials/backup'&&options?.method==='POST'){
   attempts++;
   if(attempts===1)throw new ApiError('reauthentication_failed');
   accepted=true;return {backupsJSON:JSON.stringify([backup])};
  }
  throw Error('Unexpected Agent operation');
 }} as never);
 render(<I18nextProvider i18n={i18n}><AgentBackupsPanel memory={memory} scope={scope} retention="local" restored={restored}/></I18nextProvider>);
 const user=userEvent.setup(),password=screen.getByLabelText('Reauthenticate with platform password'),confirm=screen.getByRole('checkbox');
 expect(screen.getByRole('button',{name:'Create personal backup'})).toHaveProperty('disabled',true);
 await user.click(screen.getByRole('button',{name:'Check personal backups'}));
 await screen.findByText('No personal backup exists.');
 await user.type(password,'wrong-fixture-password');await user.click(confirm);
 await user.click(screen.getByRole('button',{name:'Create personal backup'}));
 expect(await screen.findByRole('alert')).toHaveProperty('textContent',expect.stringContaining('reauthentication_failed'));
 expect(password).toHaveProperty('value','wrong-fixture-password');expect(confirm).toHaveProperty('checked',true);
 expect(screen.queryByRole('button',{name:'Restore personal backup'})).toBeNull();
 await user.clear(password);await user.type(password,'correct-fixture-password');
 await user.click(screen.getByRole('button',{name:'Create personal backup'}));
 await screen.findByRole('button',{name:'Restore personal backup'});
 await waitFor(()=>expect(screen.queryByRole('alert')).toBeNull());
 expect(screen.getByText('accepted-backup · oauth · 1')).toBeTruthy();
 expect(password).toHaveProperty('value','');expect(confirm).toHaveProperty('checked',false);
 expect(screen.getByRole('button',{name:'Create personal backup'})).toHaveProperty('disabled',true);
 expect(requests.filter(request=>request.path==='/v1/credentials/backup')).toEqual([
  {path:'/v1/credentials/backup',method:'POST',body:{...scope,password:'wrong-fixture-password',confirmed:true}},
  {path:'/v1/credentials/backup',method:'POST',body:{...scope,password:'correct-fixture-password',confirmed:true}},
 ]);
 expect(requests.every(request=>request.path==='/v1/credentials/backup'||request.path.startsWith('/v1/credentials/backups?'))).toBe(true);
 expect(restored).not.toHaveBeenCalled();expect(localStorage.length).toBe(0);
 memory.clear();
});
