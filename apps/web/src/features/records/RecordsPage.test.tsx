import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {act,render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {I18nextProvider} from 'react-i18next';
import {i18n} from '../../shared/i18n';
import {PlatformClient} from '../../shared/api';
import {M2Memory} from '../connections/runtimeStore';
import {RecordsPage} from './RecordsPage';
import type {Record as StoredRecord,ExecutionSnapshot,RecordUploadInput} from '../../generated/platform';
const project={id:'p',teamId:'team',name:'Project',description:'',role:'maintainer' as const,canRead:true,canManage:true,canTakeover:false};const session={user:{id:'u',name:'User',email:'user@example.test',verified:true},teams:[{id:'team',name:'Team',role:'member' as const}],csrf:'test',expiresAt:'2099-01-01T00:00:00Z'};
export const snapshot:ExecutionSnapshot={userId:'u',projectId:'p',connectionId:'c',tabId:'tab',runId:'run',toolName:'echo',configurationVersion:1,toolDefinitionVersion:'1',environmentId:'',environmentVersion:'1',executor:'browser',credentialSource:'none',requestJSON:'{"zero":0,"false":false,"nil":null}',inputSchemaJSON:'{"type":"object"}',responseJSON:'{"content":[]}',protocolJSON:'{"method":"tools/call"}',startedAt:'2026-10-13T01:00:00Z',finishedAt:'2026-10-13T01:00:01Z',runStatus:'succeeded',remoteOutcome:'known',resultKind:'success',httpStatus:200,responseRetention:'full',omissionReason:'',schemaValid:true,redactions:[]};
export const historyRecord:StoredRecord={id:'history',projectId:'p',connectionId:'c',ownerId:'u',ownerName:'User',kind:'history',version:1,etag:'"history:1"',createdAt:snapshot.startedAt,updatedAt:snapshot.finishedAt,pinned:false,sourceRunId:'',metadata:{name:'Echo run',note:'',visibility:'project',contentKind:'request-response',completeness:'complete'},snapshot};
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(status===200?{data}:{error:{code:data}}),{status});let memory:M2Memory;let paths:string[];
beforeEach(async()=>{await i18n.changeLanguage('en-US');memory=new M2Memory();paths=[];vi.stubGlobal('fetch',async(url:string)=>{const path=url.replace('/api/v1','');paths.push(path);if(path.startsWith('/projects/p/records?'))return reply({items:[historyRecord],nextCursor:'next'});if(path==='/projects/p/records/history')return reply(historyRecord);if(path.endsWith('/audits'))return reply([]);return reply('not_found',404);});});afterEach(()=>{memory.clear();vi.unstubAllGlobals();});
function setup(role:string='maintainer',scope?:{connectionId:string;toolName:string}){const user=userEvent.setup();render(<I18nextProvider i18n={i18n}><RecordsPage client={new PlatformClient(()=>{})} project={{...project,role:role as 'maintainer'}} session={session} memory={memory} scopeRevision={0} scope={scope} navigate={vi.fn()}/></I18nextProvider>);return user;}
it('queries the real scoped API and preserves its connection+tool filters through pagination and detail return',async()=>{const user=setup('maintainer',{connectionId:'c',toolName:'echo'});await user.click(await screen.findByRole('button',{name:'Open Echo run'}));expect(await screen.findByText('Request snapshot')).toBeTruthy();await user.click(screen.getByRole('button',{name:'Back to records'}));await user.click(screen.getByRole('button',{name:'Next page'}));await waitFor(()=>expect(paths.some(path=>path.includes('connectionId=c')&&path.includes('toolName=echo')&&path.includes('cursor=next'))).toBe(true));await user.type(screen.getByLabelText('Search records'),'only');await waitFor(()=>expect(paths.some(path=>path.includes('search=only')&&!path.includes('cursor='))).toBe(true));});
it('presents Viewer details without mutation or restore controls',async()=>{const user=setup('viewer');await user.click(await screen.findByRole('button',{name:'Open Echo run'}));expect(await screen.findByText('Request snapshot')).toBeTruthy();expect(screen.queryByRole('button',{name:'Pin record'})).toBeNull();expect(screen.queryByRole('button',{name:'Delete record'})).toBeNull();expect(screen.queryByRole('button',{name:'Restore to new tab'})).toBeNull();expect(screen.queryByRole('button',{name:'Add redaction revision'})).toBeNull();});
it('refuses a late or mismatched detail from another connection scope',async()=>{vi.stubGlobal('fetch',async(url:string)=>url.includes('records?')?reply({items:[historyRecord],nextCursor:''}):reply({...historyRecord,connectionId:'foreign',snapshot:{...snapshot,connectionId:'foreign',requestJSON:'FOREIGN_PRIVATE'}}));const user=setup('maintainer',{connectionId:'c',toolName:'echo'});await user.click(await screen.findByRole('button',{name:'Open Echo run'}));await screen.findByRole('alert');expect(document.body.textContent).not.toContain('FOREIGN_PRIVATE');});
it('does not offer project-history pinning on a private history record',async()=>{vi.stubGlobal('fetch',async(url:string)=>url.includes('records?')?reply({items:[{...historyRecord,metadata:{...historyRecord.metadata,visibility:'private'}}],nextCursor:''}):url.endsWith('/audits')?reply([]):reply({...historyRecord,metadata:{...historyRecord.metadata,visibility:'private'}}));const user=setup();await user.click(await screen.findByRole('button',{name:'Open Echo run'}));await screen.findByText('Request snapshot');expect(screen.queryByRole('button',{name:'Pin record'})).toBeNull();});
it('refreshes a mounted scoped list after root Run invalidation without changing its filters',async()=>{const user=setup('maintainer',{connectionId:'c',toolName:'echo'});await screen.findByRole('button',{name:'Open Echo run'});await user.type(screen.getByLabelText('Search records'),'retained');await waitFor(()=>expect(paths.some(path=>path.includes('search=retained'))).toBe(true));const count=paths.filter(path=>path.includes('records?')&&path.includes('search=retained')).length;act(()=>memory.invalidateRecordRun('p','run'));await waitFor(()=>expect(paths.filter(path=>path.includes('records?')&&path.includes('search=retained')).length).toBeGreaterThan(count));expect(screen.getByLabelText('Search records')).toHaveProperty('value','retained');});
import {makeUpload} from '../../runtime/records/snapshot';
it('shows only frozen failed session uploads in the exact connection+tool scope and offers retry without record mutations',async()=>{const client=new PlatformClient();const uploads=await Promise.all([makeUpload({userId:'u',targetKind:'history',snapshot,metadata:historyRecord.metadata}),makeUpload({userId:'u',targetKind:'history',snapshot:{...snapshot,connectionId:'other-connection'},metadata:historyRecord.metadata}),makeUpload({userId:'u',targetKind:'history',snapshot:{...snapshot,toolName:'other-tool'},metadata:historyRecord.metadata}),makeUpload({userId:'u',targetKind:'history',snapshot:{...snapshot,projectId:'other-project'},metadata:historyRecord.metadata})]);const bodies:unknown[]=[];vi.stubGlobal('fetch',async(url:string,init?:RequestInit)=>{if(init?.method==='POST'){bodies.push(JSON.parse(String(init.body)) as unknown);return reply('network',503);}return reply({items:[],nextCursor:''});});for(const input of uploads)await memory.records.submit(client,input).catch(()=>{});const user=setup('maintainer',{connectionId:'c',toolName:'echo'});const pending=await screen.findByRole('region',{name:'Session upload operations'});expect(pending.textContent).toContain(uploads[0].operationId);expect(pending.textContent).not.toContain(uploads[1].operationId);expect(pending.textContent).not.toContain(uploads[2].operationId);expect(pending.textContent).not.toContain(uploads[3].operationId);expect(screen.queryByRole('button',{name:/Open /})).toBeNull();expect(screen.queryByRole('button',{name:'Delete record'})).toBeNull();expect(screen.queryByRole('button',{name:'Pin record'})).toBeNull();await user.click(screen.getByRole('button',{name:'Retry frozen operation'}));expect(bodies.at(-1)).toEqual(uploads[0]);});
it('closes the detail copy editor after a successful upload and does not reopen it after returning to the record',async()=>{
 let upload:RecordUploadInput|undefined,release:(response:Response)=>void=()=>{};
 const pending=new Promise<Response>(resolve=>{release=resolve;});
 vi.stubGlobal('fetch',async(url:string,init?:RequestInit)=>{
  if(init?.method==='POST'){upload=JSON.parse(String(init.body)) as RecordUploadInput;return pending;}
  if(url.endsWith('/record-redaction-policy'))return reply({projectId:'p',version:1,etag:'"policy:1"',pointers:[]});
  if(url.includes('records?'))return reply({items:[historyRecord],nextCursor:''});
  if(url.endsWith('/audits'))return reply([]);
  return reply(historyRecord);
 });
 memory.recordViews.detail('p',historyRecord.id).metadata={...historyRecord.metadata,name:'Unrelated metadata draft'};
 const user=setup();await user.click(await screen.findByRole('button',{name:'Open Echo run'}));
 await user.click(await screen.findByRole('button',{name:'Save as new record'}));
 await user.clear(screen.getByLabelText('Record name'));await user.type(screen.getByLabelText('Record name'),'First copy');await user.type(screen.getByLabelText('Note'),'First copy note');
 await waitFor(()=>expect(screen.getByRole('button',{name:'Save record'})).toHaveProperty('disabled',false));
 await user.click(screen.getByRole('button',{name:'Save record'}));await waitFor(()=>expect(upload).toBeDefined());
 release(reply({operationId:upload!.operationId,targetKind:'saved',targetId:upload!.targetId,frozenDigest:upload!.frozenDigest,responsibleEndpoint:'browser',status:'recorded',recordId:upload!.targetId,version:1,etag:'"1"',recordedAt:'2026-10-13T01:00:00Z',affectedRecords:[]}));
 await waitFor(()=>expect(memory.records.get(upload!.operationId)?.status).toBe('recorded'));
 await screen.findByRole('heading',{name:'Request snapshot'});
 await waitFor(()=>expect(screen.queryByRole('button',{name:'Save record'})).toBeNull());
 await user.click(screen.getByRole('button',{name:'Back to records'}));await user.click(await screen.findByRole('button',{name:'Open Echo run'}));
 await screen.findByRole('heading',{name:'Request snapshot'});expect(screen.queryByRole('button',{name:'Save record'})).toBeNull();
 await user.click(screen.getByRole('button',{name:'Save as new record'}));
 await waitFor(()=>expect(screen.getByRole('button',{name:'Save record'})).toHaveProperty('disabled',false));
 expect(screen.getByLabelText('Record name')).toHaveProperty('value','echo');
 expect(screen.getByLabelText('Note')).toHaveProperty('value','');
 expect(memory.recordViews.detail('p',historyRecord.id).metadata?.name).toBe('Unrelated metadata draft');
 expect(screen.queryByRole('button',{name:'Retry frozen operation'})).toBeNull();
 await user.click(screen.getByRole('button',{name:'Cancel'}));expect(screen.queryByRole('button',{name:'Save record'})).toBeNull();
});
it('preserves a failed detail copy draft and closes it after its frozen retry succeeds',async()=>{
 const uploads:RecordUploadInput[]=[];
 vi.stubGlobal('fetch',async(url:string,init?:RequestInit)=>{
  if(init?.method==='POST'){const input=JSON.parse(String(init.body)) as RecordUploadInput;uploads.push(input);return uploads.length===1?reply('network',503):reply({operationId:input.operationId,targetKind:'saved',targetId:input.targetId,frozenDigest:input.frozenDigest,responsibleEndpoint:'browser',status:'recorded',recordId:input.targetId,version:1,etag:'"1"',recordedAt:'2026-10-13T01:00:00Z',affectedRecords:[]});}
  if(url.endsWith('/record-redaction-policy'))return reply({projectId:'p',version:1,etag:'"policy:1"',pointers:[]});
  if(url.includes('records?'))return reply({items:[historyRecord],nextCursor:''});
  if(url.endsWith('/audits'))return reply([]);return reply(historyRecord);
 });
 const user=setup();await user.click(await screen.findByRole('button',{name:'Open Echo run'}));await user.click(await screen.findByRole('button',{name:'Save as new record'}));
 await user.clear(screen.getByLabelText('Record name'));await user.type(screen.getByLabelText('Record name'),'Failed copy draft');
 await waitFor(()=>expect(screen.getByRole('button',{name:'Save record'})).toHaveProperty('disabled',false));await user.click(screen.getByRole('button',{name:'Save record'}));
 await screen.findByRole('button',{name:'Retry frozen operation'});expect(screen.getByLabelText('Record name')).toHaveProperty('value','Failed copy draft');
 await user.click(screen.getByRole('button',{name:'Back to records'}));await user.click(await screen.findByRole('button',{name:'Open Echo run'}));
 await user.click(await screen.findByRole('button',{name:'Retry frozen operation'}));await waitFor(()=>expect(uploads).toHaveLength(2));
 expect(uploads[1]).toEqual(uploads[0]);await waitFor(()=>expect(screen.queryByRole('button',{name:'Retry frozen operation'})).toBeNull());
 expect(screen.queryByRole('button',{name:'Save record'})).toBeNull();
});
