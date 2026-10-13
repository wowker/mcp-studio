import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {render,screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {I18nextProvider} from 'react-i18next';
import {IdentityPage} from './IdentityPage';
import {i18n} from '../../shared/i18n';
import {PlatformClient} from '../../shared/api';

beforeEach(async()=>{await i18n.changeLanguage('en-US');});afterEach(()=>vi.unstubAllGlobals());
function mount(mode='login',navigate=vi.fn()){
 render(<I18nextProvider i18n={i18n}><IdentityPage client={new PlatformClient()} session={null} initialized mailConfigured mode={mode} inviteId="old-invitation" navigate={navigate} authenticated={()=>{}} refreshSession={async()=>false} logout={async()=>{}} resetSession={()=>{}}/></I18nextProvider>);return navigate;
}
it('shows unavailable invitation state before sign-in and offers sign-in without that invitation',async()=>{
 vi.stubGlobal('fetch',async()=>new Response(JSON.stringify({error:{code:'not_found'}}),{status:404}));const navigate=mount(),user=userEvent.setup();await screen.findByRole('alert');expect(screen.queryByRole('button',{name:'Create invited account'})).toBeNull();await user.click(screen.getByRole('button',{name:'Sign in without invitation'}));expect(navigate).toHaveBeenCalledWith({page:'login',invite:''});
});
it('retains sign-in inputs while retrying the same invitation lookup',async()=>{
 let available=false;const calls:string[]=[];vi.stubGlobal('fetch',async(url:string)=>{calls.push(url);return available?new Response(JSON.stringify({data:{id:'old-invitation',projectName:'Invited project',emailHint:'n***@test',status:'pending',expiresAt:'2099-01-01T00:00:00Z'}})):new Response(JSON.stringify({error:{code:'network'}}),{status:503});});const user=userEvent.setup();mount();await screen.findByRole('alert');await user.type(screen.getByLabelText('Email'),'retained@test.invalid');await user.type(screen.getByLabelText('Password'),'retained-secret');available=true;await user.click(screen.getByRole('button',{name:'Retry'}));await screen.findByRole('button',{name:'Create invited account'});expect(screen.getByLabelText('Email')).toHaveProperty('value','retained@test.invalid');expect(screen.getByLabelText('Password')).toHaveProperty('value','retained-secret');expect(calls).toEqual(['/api/v1/invitations/old-invitation','/api/v1/invitations/old-invitation']);expect(localStorage.length).toBe(0);
});
