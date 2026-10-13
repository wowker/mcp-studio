import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {render,screen,waitFor,within,act} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {I18nextProvider} from 'react-i18next';
import {i18n} from '../../shared/i18n';
import {PlatformClient} from '../../shared/api';
import {M2Memory} from '../connections/runtimeStore';
import {ToolsPage} from './ToolsPage';
import {redact} from '../../runtime/records/redaction';
const project={id:'p',teamId:'team',name:'Project',description:'',role:'developer' as const,canRead:true,canManage:false,canTakeover:false};
const session={user:{id:'u',email:'u@example.test',name:'User',verified:true},teams:[{id:'team',name:'Team',role:'member' as const}],csrf:'test',expiresAt:'2099-01-01T00:00:00Z'};
const connection={id:'c',projectId:'p',version:1,etag:'"v1"',name:'Real service',transport:'streamable-http',channel:'browser',endpoint:'https://example.test/mcp',command:'',args:[],cwd:'',headers:[],env:[],timeoutMs:30000,environmentId:'',authMode:'none',authReferenceId:'',oauthClientId:'',oauthScopes:[]};
const tool={name:'inventory.lookup',description:'Read stock',inputSchema:{type:'object' as const,properties:{count:{type:'integer'}}}};
const snapshot={status:'connected' as const};
let memory:M2Memory;let listTools:ReturnType<typeof vi.fn>;
beforeEach(async()=>{await i18n.changeLanguage('en-US');memory=new M2Memory();listTools=vi.fn(async()=>[tool]);const runtime={getSnapshot:()=>memory.operationGeneration===0?snapshot:{status:'disconnected'},listTools,captureSanitizer:()=>(value:unknown)=>redact(value)};vi.spyOn(memory,'existingRuntime').mockReturnValue(runtime as never);vi.stubGlobal('fetch',async()=>new Response(JSON.stringify({data:[connection]})));});
afterEach(()=>{memory.clear();vi.unstubAllGlobals();vi.restoreAllMocks();});
function setup(role='developer'){const user=userEvent.setup();const props={client:new PlatformClient(()=>{}),project:{...project,role:role as 'developer'},session,memory,connectionId:'c',navigate:vi.fn(),scopeRevision:0};const rendered=render(<I18nextProvider i18n={i18n}><ToolsPage {...props}/></I18nextProvider>);return {user,...rendered,props};}
it('lists the real session catalog, searches it, and opens independent documents with keyboard navigation',async()=>{
 const {user}=setup();await user.click(await screen.findByRole('button',{name:'Open inventory.lookup'}));expect(screen.getByRole('tab',{name:'inventory.lookup'}).getAttribute('aria-selected')).toBe('true');expect(within(screen.getByRole('tabpanel')).getByText('Read stock')).toBeTruthy();
 await user.click(screen.getByRole('button',{name:'New tab for inventory.lookup'}));const tabs=screen.getAllByRole('tab');expect(tabs).toHaveLength(2);tabs[1].focus();await user.keyboard('{Home}');expect(tabs[0]).toBe(document.activeElement);await user.keyboard('{End}');expect(tabs[1]).toBe(document.activeElement);expect(screen.getByText('Not executed')).toBeTruthy();
 await user.type(screen.getByLabelText('Search tools'),'missing');expect(screen.getByText('No matching tools.')).toBeTruthy();await user.click(screen.getByRole('button',{name:'Clear search'}));expect(screen.getByRole('button',{name:'Open inventory.lookup'})).toBeTruthy();
});
it('tab menu targets its own document, preserves selected identity, and returns focus on Escape',async()=>{
 const {user}=setup();await user.click(await screen.findByRole('button',{name:'Open inventory.lookup'}));await user.click(screen.getByRole('button',{name:'New tab for inventory.lookup'}));const tabs=screen.getAllByRole('tab'),menus=screen.getAllByRole('button',{name:'Tab actions for inventory.lookup'});await user.click(menus[0]);await user.click(screen.getByRole('menuitem',{name:'Pin tab'}));expect(tabs[1].getAttribute('aria-selected')).toBe('true');await user.click(menus[0]);await user.keyboard('{Escape}');expect(document.activeElement).toBe(menus[0]);expect(screen.queryByRole('menu')).toBeNull();
 await user.click(menus[1]);await user.click(screen.getByRole('menuitem',{name:'Close other tabs'}));expect(screen.getAllByRole('tab')).toHaveLength(2);
});
it('retains list errors and retries without creating or calling a Tool',async()=>{
 listTools.mockRejectedValueOnce(new Error('private upstream failure'));const {user}=setup();await screen.findByRole('alert');expect(document.body.textContent).not.toContain('private upstream failure');await user.click(screen.getByRole('button',{name:'Retry'}));await screen.findByRole('button',{name:'Open inventory.lookup'});expect(screen.queryByRole('tab')).toBeNull();
});
it('does not fetch upstream tools for a Viewer or a disconnected runtime',async()=>{
 setup('viewer');await screen.findByText('Your role allows viewing only.');expect(listTools).not.toHaveBeenCalled();expect(screen.queryByRole('button',{name:'Open inventory.lookup'})).toBeNull();
});
it('does not publish a late catalog after root memory revocation',async()=>{
 let release:(value:typeof tool[])=>void=()=>{};listTools.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));setup();await waitFor(()=>expect(listTools).toHaveBeenCalled());await act(async()=>{memory.revoke();release([tool]);});expect(screen.queryByRole('button',{name:'Open inventory.lookup'})).toBeNull();
});
it('closing a focused document returns focus to a surviving tab and the catalog after the last close',async()=>{
 const {user}=setup();await user.click(await screen.findByRole('button',{name:'Open inventory.lookup'}));await user.click(screen.getByRole('button',{name:'New tab for inventory.lookup'}));const closes=screen.getAllByRole('button',{name:'Close tab for inventory.lookup'});closes[1].focus();await user.keyboard('{Enter}');expect(screen.getByRole('tab',{name:'inventory.lookup'})).toBe(document.activeElement);screen.getByRole('button',{name:'Close tab for inventory.lookup'}).focus();await user.keyboard('{Enter}');expect(screen.getByRole('button',{name:'Open inventory.lookup'})).toBe(document.activeElement);
});
it('shows a deleted remembered selection as unavailable and lets the user choose a remaining connection',async()=>{
 memory.selected.set('p','deleted');const {user,rerender,props}=setup();rerender(<I18nextProvider i18n={i18n}><ToolsPage {...props} connectionId=""/></I18nextProvider>);await screen.findByRole('alert');expect(screen.queryByText('No services yet. Create a saved configuration before connecting.')).toBeNull();expect(screen.getByRole('option',{name:'Real service'})).toBeTruthy();expect(screen.getByLabelText('Service')).toHaveProperty('value','deleted');await user.selectOptions(screen.getByLabelText('Service'),'c');await screen.findByRole('button',{name:'Open inventory.lookup'});expect(memory.selected.get('p')).toBe('c');
});
it('keeps an open saved-result editor attached to its original Tab when switching documents',async()=>{
 const {user}=setup();await user.click(await screen.findByRole('button',{name:'Open inventory.lookup'}));const tab=memory.tools.scope('p','c').selected!;
 await act(async()=>{tab.lastRunId='run';tab.lastSnapshot={userId:'u',projectId:'p',connectionId:'c',tabId:tab.id,runId:'run',toolName:tool.name,configurationVersion:1,toolDefinitionVersion:'v1',environmentId:'',environmentVersion:'',executor:'browser',credentialSource:'none',requestJSON:'{}',inputSchemaJSON:JSON.stringify(tool.inputSchema),responseJSON:'null',protocolJSON:'null',startedAt:'2026-10-13T00:00:00Z',finishedAt:'2026-10-13T00:00:01Z',runStatus:'succeeded',remoteOutcome:'known',resultKind:'success',httpStatus:0,responseRetention:'full',omissionReason:'',schemaValid:true,redactions:[]};memory.touch();});
 await user.click(screen.getByRole('button',{name:'Save result'}));await screen.findByText('Save as new record');await user.click(screen.getByRole('button',{name:'New tab for inventory.lookup'}));expect(screen.queryByText('Save as new record')).toBeNull();expect(screen.getByText('Not executed')).toBeTruthy();
});

it('returns from a forbidden connection query without rendering old tool context or retrying the denied request',async()=>{vi.stubGlobal('fetch',async()=>new Response(JSON.stringify({error:{code:'forbidden'}}),{status:403}));const {user,props}=setup();await screen.findByRole('alert');expect(screen.queryByRole('button',{name:'Retry'})).toBeNull();expect(screen.queryByRole('button',{name:'Open inventory.lookup'})).toBeNull();await user.click(screen.getByRole('button',{name:'Return to project list'}));expect(props.navigate).toHaveBeenCalledWith({page:'projects',project:'',connection:'',record:'',run:''});});
