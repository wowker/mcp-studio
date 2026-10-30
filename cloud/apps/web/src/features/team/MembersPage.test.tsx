import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {act,render,screen,waitFor,within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {MembersPage} from './MembersPage';
import {PlatformClient} from '../../shared/api';
import {i18n} from '../../shared/i18n';
import type {Session,Project,Team} from '../../generated/platform';
const team:Team={id:'t',name:'Team',role:'owner'};
const session:Session={user:{id:'owner',email:'owner@example.test',name:'Owner',verified:true},teams:[team],csrf:'csrf',expiresAt:'2099-01-01T00:00:00Z'};
const project:Project={id:'p',teamId:'t',name:'Project',description:'',role:'maintainer',canManage:true,canTakeover:false,canRead:true};
beforeEach(async()=>{await i18n.changeLanguage('en-US');});afterEach(()=>vi.unstubAllGlobals());
it('retains failed invitation inputs and default 7 day scope',async()=>{
 let payload:unknown;vi.stubGlobal('fetch',async(url:string,init:RequestInit)=>{if(init?.method==='POST'){payload=JSON.parse(String(init.body));return new Response(JSON.stringify({error:{code:'mail_failed'}}),{status:503});}return new Response(JSON.stringify({data:[]}));});
 const user=userEvent.setup();render(<MembersPage client={new PlatformClient()} session={session} team={team} project={project} refreshProject={()=>{}}/>);
 await user.click(await screen.findByRole('button',{name:'Invite member'}));
 await user.type(screen.getByLabelText('Email'),'invitee@example.test');
 await user.click(screen.getByRole('button',{name:'Send invitation'}));
 await screen.findByRole('alert');
 expect(screen.getByLabelText('Email')).toHaveProperty('value','invitee@example.test');
 expect(payload).toEqual({email:'invitee@example.test',teamRole:'member',projectRole:'developer',days:7});
});
it('requires scope confirmation before deleting another project member',async()=>{
 let deleted='';vi.stubGlobal('fetch',async(url:string,init:RequestInit)=>{if(init?.method==='DELETE'){deleted=url;return new Response(JSON.stringify({data:{ok:true}}));}return new Response(JSON.stringify({data:url.endsWith('/members')?[{id:'other',name:'Other',email:'other@example.test',teamRole:'member',projectRole:'developer'}]:[]}));});
 const user=userEvent.setup();render(<MembersPage client={new PlatformClient()} session={session} team={team} project={project} refreshProject={()=>{}}/>);
 await user.click(await screen.findByRole('button',{name:'Other'}));
 await user.click(screen.getByRole('button',{name:'Remove from project'}));
 expect(deleted).toBe('');expect(screen.getByText(/Team and other project memberships remain/)).toBeTruthy();
 await user.click(screen.getByRole('button',{name:'Confirm removal'}));
 await screen.findByRole('button',{name:'Other'});
 expect(deleted).toBe('/api/v1/projects/p/members/other');
});

it.each(['project','team'] as const)('cancelling %s removal sends no mutation and retains the member role and scope',async(scope)=>{
 const writes:{url:string;method:string}[]=[],refresh=vi.fn();
 const member={id:'other',name:'Other',email:'other@example.test',teamRole:'member',projectRole:'developer'};
 vi.stubGlobal('fetch',async(url:string,init?:RequestInit)=>{
  const method=init?.method??'GET';if(method!=='GET')writes.push({url,method});
  return new Response(JSON.stringify({data:[member]}));
 });
 const user=userEvent.setup();render(<MembersPage client={new PlatformClient()} session={session} team={team} project={project} refreshProject={refresh}/>);
 if(scope==='team')await user.click(screen.getByRole('button',{name:'Team members'}));
 await user.click(await screen.findByRole('button',{name:'Other'}));
 const removeName=scope==='project'?'Remove from project':'Remove from team';
 await user.click(screen.getByRole('button',{name:removeName}));
 const notice=scope==='project'?'Remove Other from Project only. Team and other project memberships remain.':'Remove Other from the team and every team project. Pending invitations will be revoked.';
 const confirmation=screen.getByText(notice).parentElement!;
 expect(writes).toEqual([]);
 await user.click(within(confirmation).getByRole('button',{name:'Cancel'}));
 expect(screen.queryByRole('button',{name:'Confirm removal'})).toBeNull();
 expect(screen.queryByText(notice)).toBeNull();
 expect(writes).toEqual([]);expect(refresh).not.toHaveBeenCalled();
 expect(screen.getByLabelText(scope==='project'?'Project role':'Team role')).toHaveProperty('value',scope==='project'?'developer':'member');
 expect(screen.getByRole('heading',{name:'Other'})).toBeTruthy();
 await user.click(screen.getByRole('button',{name:'Cancel'}));
 expect(await screen.findByRole('button',{name:'Other'})).toBeTruthy();
 expect(screen.getByRole('button',{name:scope==='project'?'Project members':'Team members'}).getAttribute('aria-current')).toBe('page');
 expect(writes).toEqual([]);expect(refresh).not.toHaveBeenCalled();
});

it('reports when the selected member disappears after a successful role refresh',async()=>{
 let changed=false;vi.stubGlobal('fetch',async(_url:string,init?:RequestInit)=>{if(init?.method==='PATCH'){changed=true;return new Response(JSON.stringify({data:{ok:true}}));}return new Response(JSON.stringify({data:changed?[]:[{id:'other',name:'Other',email:'other@example.test',teamRole:'member',projectRole:'developer'}]}));});
 const user=userEvent.setup();render(<MembersPage client={new PlatformClient()} session={session} team={team} project={project} refreshProject={()=>{}}/>);await user.click(await screen.findByRole('button',{name:'Other'}));await user.selectOptions(screen.getByLabelText('Project role'),'viewer');await user.click(screen.getByRole('button',{name:'Save changes'}));await screen.findByRole('alert');expect(screen.queryByText('No members.')).toBeNull();await user.click(screen.getByRole('button',{name:'Back to members'}));expect(await screen.findByText('No members.')).toBeTruthy();
});

it('clears a no-match member search without resetting the current project scope',async()=>{
 vi.stubGlobal('fetch',async()=>new Response(JSON.stringify({data:[{id:'other',name:'Other',email:'other@example.test',teamRole:'member',projectRole:'developer'}]})));
 const user=userEvent.setup();render(<MembersPage client={new PlatformClient()} session={session} team={team} project={project} refreshProject={()=>{}}/>);await screen.findByRole('button',{name:'Other'});await user.type(screen.getByLabelText('Search members or invitations'),'absent');expect(screen.getByText('No members match this search.')).toBeTruthy();expect(screen.queryByText('No members.')).toBeNull();await user.click(screen.getByRole('button',{name:'Clear search'}));expect(screen.getByRole('button',{name:'Other'})).toBeTruthy();
});

it('records an invitation fact only after successful creation in the same identity and project',async()=>{
 const sent=vi.fn(),invitation={id:'new-invite',projectId:'p',email:'invitee@example.test',teamRole:'member',projectRole:'developer',status:'pending',expiresAt:'2099-01-01T00:00:00Z',delivery:'sent'};
 vi.stubGlobal('fetch',async(_url:string,init?:RequestInit)=>new Response(JSON.stringify({data:init?.method==='POST'?invitation:[]})));
 const user=userEvent.setup();render(<MembersPage client={new PlatformClient()} session={session} team={team} project={project} refreshProject={()=>{}} onInvitationSent={sent}/>);expect(sent).not.toHaveBeenCalled();await user.click(await screen.findByRole('button',{name:'Invite member'}));await user.type(screen.getByLabelText('Email'),'invitee@example.test');expect(sent).not.toHaveBeenCalled();await user.click(screen.getByRole('button',{name:'Send invitation'}));await waitFor(()=>expect(sent).toHaveBeenCalledExactlyOnceWith({projectId:'p',userId:'owner',invitationId:'new-invite',delivery:'sent'}));
});

it('does not record delayed invitation success for a different current project',async()=>{
 let release:(response:Response)=>void=()=>{};const pending=new Promise<Response>(resolve=>{release=resolve;}),sent=vi.fn(),client=new PlatformClient();vi.stubGlobal('fetch',async(_url:string,init?:RequestInit)=>init?.method==='POST'?pending:new Response(JSON.stringify({data:[]})));
 const user=userEvent.setup(),view=render(<MembersPage client={client} session={session} team={team} project={project} refreshProject={()=>{}} onInvitationSent={sent}/>);await user.click(await screen.findByRole('button',{name:'Invite member'}));await user.type(screen.getByLabelText('Email'),'invitee@example.test');await user.click(screen.getByRole('button',{name:'Send invitation'}));view.rerender(<MembersPage client={client} session={session} team={team} project={{...project,id:'other'}} refreshProject={()=>{}} onInvitationSent={sent}/>);
 await act(async()=>{release(new Response(JSON.stringify({data:{id:'old-invite',projectId:'p',email:'invitee@example.test',teamRole:'member',projectRole:'developer',status:'pending',expiresAt:'2099-01-01T00:00:00Z',delivery:'sent'}})));await pending;});expect(sent).not.toHaveBeenCalled();
});

it('does not record delayed invitation success after management permission is revoked',async()=>{
 let release:(response:Response)=>void=()=>{};const pending=new Promise<Response>(resolve=>{release=resolve;}),sent=vi.fn(),client=new PlatformClient();vi.stubGlobal('fetch',async(_url:string,init?:RequestInit)=>init?.method==='POST'?pending:new Response(JSON.stringify({data:[]})));
 const user=userEvent.setup(),view=render(<MembersPage client={client} session={session} team={team} project={project} refreshProject={()=>{}} onInvitationSent={sent}/>);await user.click(await screen.findByRole('button',{name:'Invite member'}));await user.type(screen.getByLabelText('Email'),'invitee@example.test');await user.click(screen.getByRole('button',{name:'Send invitation'}));view.rerender(<MembersPage client={client} session={session} team={team} project={{...project,role:'viewer',canManage:false}} refreshProject={()=>{}} onInvitationSent={sent}/>);await screen.findByRole('alert');
 await act(async()=>{release(new Response(JSON.stringify({data:{id:'old-invite',projectId:'p',email:'invitee@example.test',teamRole:'member',projectRole:'developer',status:'pending',expiresAt:'2099-01-01T00:00:00Z',delivery:'sent'}})));await pending;});expect(sent).not.toHaveBeenCalled();expect(screen.queryByRole('button',{name:'Send invitation'})).toBeNull();
});
