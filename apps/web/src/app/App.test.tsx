import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {act,render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {App} from './App';
import {i18n} from '../shared/i18n';

const owner={user:{id:'user-owner',email:'owner@example.test',name:'Owner',verified:true},teams:[{id:'team-one',name:'Team one',role:'owner'}],csrf:'csrf-test',expiresAt:'2099-01-01T00:00:00Z'};
const project={id:'project-one',teamId:'team-one',name:'First project',description:'',role:'maintainer',canManage:true,canTakeover:false,canRead:true};
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(status===200?{data}:{error:{code:data}}),{status});
beforeEach(async()=>{history.replaceState({},'', '/'); await i18n.changeLanguage('en-US');});
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});

function network(overrides:Record<string,()=>Promise<Response>|Response>={}) {
  vi.stubGlobal('fetch',async(url:string,init?:RequestInit)=>{
    const path=url.replace('/api/v1','');
    const custom=overrides[`${init?.method??'GET'} ${path}`]; if(custom)return custom();
    if(path==='/bootstrap')return reply({initialized:true,mailConfigured:true});
    if(path==='/session')return reply(owner);
    if(path==='/teams/team-one/projects')return reply([project]);
    if(path==='/projects/project-one')return reply(project);
    if(path==='/projects/project-one/audit')return reply([]);
    return reply('not_found',404);
  });
}

describe('authenticated Shell',()=>{
  it('keeps page input and focus through language/theme/sidebar controls',async()=>{
    network(); const user=userEvent.setup(); render(<App/>);
    await screen.findByRole('heading',{name:'Projects'});
    await user.click(screen.getByRole('button',{name:'Create project'}));
    await user.type(screen.getByLabelText('Name'),'Unsaved project');
    const language=screen.getByLabelText('Language'); await user.selectOptions(language,'zh-CN');
    expect(document.activeElement).toBe(language);
    expect(screen.getByLabelText('名称')).toHaveProperty('value','Unsaved project');
    await user.click(screen.getByRole('button',{name:'切换主题'}));
    await user.click(screen.getByRole('button',{name:'收起侧栏'}));
    expect(screen.getByLabelText('名称')).toHaveProperty('value','Unsaved project');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(screen.getByRole('button',{name:'展开侧栏'})).toBeTruthy();
  });
  it('unmounts project context when session expires on a later request',async()=>{
    network({'GET /projects/project-one':()=>reply('unauthenticated',401)});
    const user=userEvent.setup(); render(<App/>);
    await user.click(await screen.findByRole('button',{name:'Open First project'}));
    await screen.findByRole('heading',{name:'Sign in'});
    expect(screen.queryByText('First project')).toBeNull();
    expect(screen.queryByRole('navigation',{name:'Project navigation'})).toBeNull();
    expect(localStorage.getItem('session')).toBeNull();
  });
  it('does not display content capabilities from a stale project response',async()=>{
    let release:(value:Response)=>void=()=>{};
    const first=new Promise<Response>(resolve=>{release=resolve;});
    const other={...project,id:'project-two',name:'Second project',role:'',canRead:false,canManage:true,canTakeover:true};
    network({'GET /teams/team-one/projects':()=>reply([project,other]),'GET /projects/project-one':()=>first,'GET /projects/project-two':()=>reply(other),'GET /projects/project-two/audit':()=>reply([])});
    const user=userEvent.setup();render(<App/>);
    await user.click(await screen.findByRole('button',{name:'Open First project'}));
    await user.selectOptions(screen.getByLabelText('Project'),'project-two');
    await screen.findByRole('heading',{name:'Project access'});
    release(reply(project));
    await waitFor(()=>expect(screen.queryByText('First project',{selector:'h1'})).toBeNull());
    expect(screen.queryByRole('navigation',{name:'Project navigation'})).toBeNull();
  });
});

it('rechecks project capability after a forbidden write without signing out',async()=>{
 let revoked=false;const member={id:'other',name:'Other',email:'other@example.test',teamRole:'member',projectRole:'developer'};
 network({'GET /projects/project-one':()=>reply(revoked?{...project,canRead:false,canManage:false,canTakeover:false,role:''}:project),'GET /projects/project-one/members':()=>reply([member]),'DELETE /projects/project-one/members/other':()=>{revoked=true;return reply('forbidden',403);}});
 const user=userEvent.setup();render(<App/>);await user.click(await screen.findByRole('button',{name:'Open First project'}));await user.click(await screen.findByRole('button',{name:'Members & invitations'}));await user.click(await screen.findByRole('button',{name:'Other'}));await user.click(screen.getByRole('button',{name:'Remove from project'}));await user.click(screen.getByRole('button',{name:'Confirm removal'}));await waitFor(()=>expect(screen.queryByRole('navigation',{name:'Project navigation'})).toBeNull());expect(screen.getByRole('button',{name:'Owner'})).toBeTruthy();expect(screen.queryByRole('heading',{name:'Sign in'})).toBeNull();
});


it('rechecks the server idle deadline after activity instead of expiring a valid session locally',async()=>{
 vi.useFakeTimers();history.replaceState({},'', '/?page=project&project=project-one');let requests=0;
 network({'GET /session':()=>reply({...owner,expiresAt:new Date(Date.now()+(requests++?2000:1000)).toISOString()})});
 await act(async()=>{render(<App/>);});expect(screen.getByRole('button',{name:'Owner'})).toBeTruthy();
 await act(async()=>{await vi.advanceTimersByTimeAsync(1000);});expect(screen.getByRole('button',{name:'Owner'})).toBeTruthy();expect(screen.getByRole('heading',{name:'First project'})).toBeTruthy();
});

it('loads projects only after mailbox verification enables the session',async()=>{
 let verified=false;network({'GET /session':()=>reply({...owner,user:{...owner.user,verified}}),'GET /teams/team-one/projects':()=>verified?reply([project]):reply('email_unverified',403),'POST /verification/confirm':()=>{verified=true;return reply({ok:true});}});
 const user=userEvent.setup();render(<App/>);await user.type(await screen.findByLabelText('Email code'),'fixture-verification');await user.click(screen.getByRole('button',{name:'Verify email'}));await screen.findByRole('heading',{name:'Projects'});expect(screen.getByRole('button',{name:'Open First project'})).toBeTruthy();
});

it('refreshes team permissions when forbidden changes leave the project maintainer role intact',async()=>{
 let downgraded=false;network({'GET /session':()=>reply({...owner,teams:[{...owner.teams[0],role:downgraded?'member':'owner'}]}),'GET /projects/project-one/members':()=>reply([{id:'other',name:'Other',email:'other@example.test',teamRole:'member',projectRole:'developer'}]),'PATCH /projects/project-one/members/other':()=>{downgraded=true;return reply('forbidden',403);}});
 const user=userEvent.setup();render(<App/>);await user.click(await screen.findByRole('button',{name:'Open First project'}));await user.click(await screen.findByRole('button',{name:'Members & invitations'}));expect(await screen.findByRole('button',{name:'Team members'})).toBeTruthy();await user.click(await screen.findByRole('button',{name:'Other'}));await user.selectOptions(screen.getByLabelText('Project role'),'viewer');await user.click(screen.getByRole('button',{name:'Save changes'}));await waitFor(()=>expect(screen.queryByRole('button',{name:'Team members'})).toBeNull());await screen.findByRole('navigation',{name:'Project navigation'});
});

it('refreshes stale CSRF for the same user and keeps the failed project draft',async()=>{
 network({'POST /teams/team-one/projects':()=>reply('csrf_rejected',403)});const user=userEvent.setup();render(<App/>);await user.click(await screen.findByRole('button',{name:'Create project'}));await user.type(screen.getByLabelText('Name'),'Retained draft');await user.click(screen.getByRole('button',{name:'Create project'}));await screen.findByRole('alert');expect(screen.getByLabelText('Name')).toHaveProperty('value','Retained draft');
});

it('keeps the old project hidden after a 401 and a different account signs in before its scope loads',async()=>{
 history.replaceState({},'', '/?page=project&project=project-one');let expired=false,otherUser=false;let release:(value:Response)=>void=()=>{};const pending=new Promise<Response>(resolve=>{release=resolve;});
 const second={...owner,user:{...owner.user,id:'user-second',name:'Second user'},teams:[{...owner.teams[0],role:'member'}]};
 network({'GET /session':()=>expired?reply('unauthenticated',401):reply(owner),'POST /login':()=>{otherUser=true;expired=false;return reply(second);},'GET /projects/project-one':()=>otherUser?pending:reply(project),'GET /teams/team-one/projects':()=>reply(otherUser?[]:[project])});
 const user=userEvent.setup();render(<App/>);await screen.findByRole('heading',{name:'First project'});expired=true;await act(async()=>{document.dispatchEvent(new Event('visibilitychange'));});await screen.findByRole('heading',{name:'Sign in'});await user.type(screen.getByLabelText('Email'),'second@example.test');await user.type(screen.getByLabelText('Password'),'Fixture-Password-12');await user.click(screen.getByRole('button',{name:'Sign in'}));await screen.findByRole('button',{name:'Second user'});expect(screen.queryByRole('heading',{name:'First project'})).toBeNull();expect(screen.queryByRole('navigation',{name:'Project navigation'})).toBeNull();release(reply({...project,canRead:false,canManage:false,canTakeover:false,role:''}));await screen.findByRole('heading',{name:'Project access'});
});

it('hides a stale personal authorization form after content GET permission revocation',async()=>{
 history.replaceState({},'', '/?page=servers&project=project-one&connection=c');let revoked=false;const connection={id:'c',projectId:'project-one',version:1,etag:'"v1"',name:'Service',transport:'streamable-http',channel:'browser',endpoint:'https://example.test/mcp',command:'',args:[],cwd:'',headers:[],env:[],timeoutMs:30000,environmentId:'',authMode:'token',authReferenceId:'',oauthClientId:'',oauthScopes:[]};
 network({'GET /projects/project-one':()=>reply(revoked?{...project,role:'',canRead:false,canManage:false}:project),'GET /projects/project-one/connections':()=>revoked?reply('forbidden',403):reply([connection]),'GET /projects/project-one/environments':()=>reply([]),'GET /projects/project-one/variables':()=>reply([])});
 const user=userEvent.setup();render(<App/>);await user.type(await screen.findByLabelText('Personal access token'),'transient-personal');await user.click(screen.getByRole('button',{name:'Save for this session'}));await screen.findByText('Authorized, waiting to connect');revoked=true;await user.click(screen.getByRole('button',{name:'Environment preview'}));await screen.findByRole('heading',{name:'Project access'});expect(screen.queryByLabelText('Personal access token')).toBeNull();expect(screen.queryByRole('heading',{name:'Personal authorization'})).toBeNull();expect(document.body.textContent).not.toContain('transient-personal');expect(JSON.stringify(localStorage)).not.toContain('transient-personal');
});

it('keeps another project tool document when switching through a Viewer project',async()=>{
 history.replaceState({},'', '/?page=tools&project=project-one&connection=c');
 const viewer={...project,id:'project-viewer',name:'Viewer project',role:'viewer',canManage:false};const connection={id:'c',projectId:'project-one',version:1,etag:'"v1"',name:'Service',transport:'streamable-http',channel:'browser',endpoint:'https://example.test/mcp',command:'',args:[],cwd:'',headers:[],env:[],timeoutMs:30000,environmentId:'',authMode:'none',authReferenceId:'',oauthClientId:'',oauthScopes:[]};
 const runtimeStore=await import('../features/connections/runtimeStore');const original=runtimeStore.M2Memory.prototype.existingRuntime;const tool={name:'retained.lookup',inputSchema:{type:'object' as const}};const runtime={getSnapshot:()=>({status:'connected' as const}),listTools:async()=>[tool]};let owned:import('../features/connections/runtimeStore').M2Memory|undefined;
 const spy=vi.spyOn(runtimeStore.M2Memory.prototype,'existingRuntime').mockImplementation(function(this:import('../features/connections/runtimeStore').M2Memory,projectId,connectionId){owned=this;return projectId==='project-one'?runtime as never:original.call(this,projectId,connectionId);});
 try{
  network({'GET /teams/team-one/projects':()=>reply([project,viewer]),'GET /projects/project-viewer':()=>reply(viewer),'GET /projects/project-one/connections':()=>reply([connection]),'GET /projects/project-viewer/connections':()=>reply([{...connection,projectId:'project-viewer'}])});const user=userEvent.setup();render(<App/>);await user.click(await screen.findByRole('button',{name:'Open retained.lookup'}));const scope=owned!.tools.scope('project-one','c'),tab=scope.selected!;act(()=>scope.updateDraft(tab.id,{raw:'{"zero":0}',mode:'raw'}));await user.selectOptions(screen.getByLabelText('Project'),'project-viewer');await screen.findByRole('heading',{name:'Viewer project'});await user.selectOptions(screen.getByLabelText('Project'),'project-one');await user.click(await screen.findByRole('button',{name:'Tools'}));await screen.findByRole('tab',{name:'retained.lookup'});expect(owned!.tools.scope('project-one','c').selected?.draft.raw).toBe('{"zero":0}');
 }finally{spy.mockRestore();}
});
