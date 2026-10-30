import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {I18nextProvider} from 'react-i18next';
import {i18n} from '../../shared/i18n';
import {PlatformClient,ApiError} from '../../shared/api';
import {M2Memory} from '../connections/runtimeStore';
import {project,session,snapshot,historyRecord,reply} from '../records/testFixtures';
import type {OperationState} from '../../runtime/records/operations';
import {makeUpload} from '../../runtime/records/snapshot';
import {OperationsPage} from './OperationsPage';
import {operationsEn} from './translations';
const capacity={projectId:'p',usedBytes:Math.floor(4.6*1024**3),limitBytes:5*1024**3,nearLimit:true,historyRetentionDays:90,maxHistoryRetentionDays:90,archivedBytes:0,version:1,etag:'"retention:1"'};
let memory:M2Memory;let paths:string[];
beforeEach(async()=>{await i18n.changeLanguage('en-US');i18n.addResourceBundle('en-US','translation',operationsEn,true,true);memory=new M2Memory();paths=[];vi.stubGlobal('fetch',async(url:string)=>{paths.push(url);return reply(capacity);});});
afterEach(()=>{memory.clear();vi.unstubAllGlobals();vi.restoreAllMocks();});
function setup(role=project.role,canRead=true){const user=userEvent.setup();const props={client:new PlatformClient(),project:{...project,role,canRead},session,memory,scopeRevision:0};const view=render(<I18nextProvider i18n={i18n}><OperationsPage {...props}/></I18nextProvider>);return {user,...view,props};}
async function queued(id:string,status='failed',extra={}){const input=await makeUpload({userId:session.user.id,snapshot,metadata:historyRecord.metadata,targetKind:'history',operationId:id,targetId:`record-${id}`});return {input,status,createdAt:Date.parse('2026-10-01T00:00:00Z'),stale:true,persisted:false,lossRisk:true,storageError:'storage_unavailable',bytes:100,...extra} as OperationState;}
it('shows only own current-project records, stale and storage failure, and real capacity summary',async()=>{
 const own=await queued('mine'),other=await queued('foreign-user'),foreign=await queued('foreign-project');other.input.userId='other';foreign.input.projectId='other';
 vi.spyOn(memory.records,'list').mockReturnValue([own,other,foreign]);setup();
 expect(screen.getByText('mine')).toBeTruthy();expect(screen.queryByText('foreign-user')).toBeNull();expect(screen.queryByText('foreign-project')).toBeNull();
 expect(screen.getByText(/at least 7 days/)).toBeTruthy();expect(screen.getByText(/could not be kept on this device/)).toBeTruthy();
 expect(await screen.findByText(/Project storage is nearly full/)).toBeTruthy();expect(paths.every(path=>path.endsWith('/record-capacity'))).toBe(true);
});
it('does not read or display queue contents when actual project read permission is absent',async()=>{
 const own=await queued('private');const list=vi.spyOn(memory.records,'list').mockReturnValue([own]);setup(project.role,false);
 expect(screen.getByText(/do not have access/)).toBeTruthy();expect(list).not.toHaveBeenCalled();expect(paths).toHaveLength(0);
});
it('requires explicit selected discard and protects uploading records with keyboard-accessible controls',async()=>{
 const failed=await queued('failed'),sending=await queued('sending','uploading');vi.spyOn(memory.records,'list').mockReturnValue([failed,sending]);
 const discard=vi.spyOn(memory.records,'discard').mockImplementation(()=>true);const get=vi.spyOn(memory.records,'get').mockImplementation(id=>id==='failed'?failed:sending);
 const {user}=setup();expect(screen.getByLabelText('Select operation sending')).toHaveProperty('disabled',true);
 screen.getByLabelText('Select operation failed').focus();await user.keyboard('[Space]');await user.click(screen.getByRole('button',{name:'Discard selected records'}));
 expect(discard).not.toHaveBeenCalled();expect(screen.getByRole('button',{name:'Confirm discard'})).toBe(document.activeElement);
 await user.click(screen.getByRole('button',{name:'Confirm discard'}));expect(discard).toHaveBeenCalledWith('failed');expect(get).toHaveBeenCalledWith('failed');expect(discard).not.toHaveBeenCalledWith('sending');
});
it('keeps frozen retry unavailable to Viewer even in the presence of a failed upload',async()=>{
 vi.spyOn(memory.records,'list').mockReturnValue([await queued('failed')]);setup('viewer' as typeof project.role);
 expect(screen.queryByRole('button',{name:'Retry frozen operation'})).toBeNull();expect(screen.queryByRole('button',{name:'Save retention policy'})).toBeNull();expect(screen.getByText(/current project role/)).toBeTruthy();
});
it('rechecks the captured discard set and refuses a record that began uploading after confirmation',async()=>{
 const failed=await queued('changed');vi.spyOn(memory.records,'list').mockReturnValue([failed]);const get=vi.spyOn(memory.records,'get').mockReturnValue({...failed,status:'uploading'});const discard=vi.spyOn(memory.records,'discard');const {user}=setup();
 await user.click(screen.getByRole('button',{name:'Review failed records for discard'}));expect(discard).not.toHaveBeenCalled();await user.click(screen.getByRole('button',{name:'Confirm discard'}));
 expect(get).toHaveBeenCalledWith('changed');expect(discard).not.toHaveBeenCalled();expect(screen.getByText(/selected record changed state/)).toBeTruthy();
});
it('shows a newly saved own operation even when its shared source snapshot belongs to another executor',async()=>{
 const own=await queued('own-copy');if('snapshot'in own.input){own.input.targetKind='saved';own.input.snapshot.userId='source-executor';}vi.spyOn(memory.records,'list').mockReturnValue([own]);setup();
 expect(screen.getByText('own-copy')).toBeTruthy();expect(screen.getByText('Saved record')).toBeTruthy();
});
it('retries the same operation without sending MCP requests',async()=>{
 const input=await makeUpload({userId:session.user.id,snapshot,metadata:historyRecord.metadata,targetKind:'history',operationId:'frozen',targetId:'frozen-record'});
 vi.stubGlobal('fetch',async(url:string)=>{paths.push(url);return url.endsWith('/record-uploads')?reply('network',503):reply(capacity);});
 await memory.records.submit(new PlatformClient(),input).catch(()=>{});
 const bodies:string[]=[];vi.stubGlobal('fetch',async(url:string,init?:RequestInit)=>{paths.push(url);if(url.endsWith('/record-uploads')){bodies.push(String(init?.body));return reply({...input,status:'recorded',recordId:input.targetId,version:1,etag:'"1"',recordedAt:'2026-10-13T01:00:00Z',affectedRecords:[],snapshot:undefined,metadata:undefined,sourceRunId:undefined,contractVersion:undefined,userId:undefined,projectId:undefined,connectionId:undefined});}return reply(capacity);});
 const {user}=setup();await user.click(screen.getByRole('button',{name:'Retry frozen operation'}));await waitFor(()=>expect(memory.records.get(input.operationId)?.status).toBe('recorded'));
 expect(JSON.parse(bodies[0])).toEqual(input);expect(paths.every(path=>path.includes('/record-uploads')||path.endsWith('/record-capacity'))).toBe(true);
});
it('explains memory loss before changing retention and reports storage failure',async()=>{
 vi.spyOn(memory.records,'retentionMode','get').mockReturnValue('persistent');const retention=vi.spyOn(memory.records,'setRetention').mockRejectedValue(new ApiError('storage_unavailable'));const {user}=setup();
 await user.selectOptions(screen.getByRole('combobox',{name:'Keep pending records on this device'}),'memory');expect(retention).not.toHaveBeenCalled();
 expect(screen.getByText(/current in-memory copies remain/)).toBeTruthy();await user.click(screen.getByRole('button',{name:'Use memory only'}));await waitFor(()=>expect(retention).toHaveBeenCalledWith('memory'));
 expect(screen.getByRole('alert').textContent).toMatch(/storage|could not complete/i);
});
it('describes intentional memory retention as refresh risk without claiming storage failed',async()=>{
 vi.spyOn(memory.records,'list').mockReturnValue([await queued('in-memory','failed',{storageError:undefined})]);setup();
 expect(screen.queryByText(/could not be kept on this device/)).toBeNull();expect(screen.getAllByText(/held in memory only/).length).toBeGreaterThan(0);
});
it('preserves the retention draft on policy conflict and uses the latest If-Match only after explicit reload',async()=>{
 const writes:RequestInit[]=[];vi.stubGlobal('fetch',async(_url:string,init?:RequestInit)=>{if(init?.method==='PATCH'){writes.push(init);return reply('version_conflict',409);}return reply(writes.length?{...capacity,version:2,etag:'"retention:2"',historyRetentionDays:60}:capacity);});
 const {user}=setup();const field=await screen.findByLabelText('Ordinary history retention (days)');await user.clear(field);await user.type(field,'30');await user.click(screen.getByRole('button',{name:'Save retention policy'}));
 await screen.findByText(/retention policy changed/);expect(field).toHaveProperty('value','30');expect(new Headers(writes[0].headers).get('If-Match')).toBe('"retention:1"');
 await user.click(screen.getByRole('button',{name:'Reload retention policy'}));await screen.findByText(/after 60 days/);expect(field).toHaveProperty('value','30');await user.click(screen.getByRole('button',{name:'Save retention policy'}));await waitFor(()=>expect(writes).toHaveLength(2));expect(new Headers(writes[1].headers).get('If-Match')).toBe('"retention:2"');
});
it('allows retention up to the deployment maximum of 180 days and submits the current policy If-Match',async()=>{
 let written:RequestInit|undefined;const deployed={...capacity,maxHistoryRetentionDays:180};vi.stubGlobal('fetch',async(_url:string,init?:RequestInit)=>{if(init?.method==='PATCH'){written=init;return reply({...deployed,historyRetentionDays:180,version:2,etag:'"retention:2"'});}return reply(deployed);});
 const {user}=setup();const field=await screen.findByLabelText('Ordinary history retention (days)');expect(field.getAttribute('max')).toBe('180');await user.clear(field);await user.type(field,'180');const save=screen.getByRole('button',{name:'Save retention policy'});expect(save).toHaveProperty('disabled',false);await user.click(save);await waitFor(()=>expect(written).toBeDefined());
 expect(JSON.parse(String(written!.body))).toEqual({historyRetentionDays:180});expect(new Headers(written!.headers).get('If-Match')).toBe('"retention:1"');await screen.findByText(/after 180 days/);
});

it('explains a competing window upload without exposing arbitrary details or discarding the queue',async()=>{const pending=await queued('leased');vi.spyOn(memory.records,'list').mockReturnValue([pending]);vi.spyOn(memory.records,'retry').mockRejectedValue(new ApiError('operation_busy'));const discard=vi.spyOn(memory.records,'discard');const {user}=setup();await user.click(screen.getByRole('button',{name:'Retry frozen operation'}));expect(await screen.findByText('Another window is uploading this record. Wait briefly, then retry.')).toBeTruthy();expect(discard).not.toHaveBeenCalled();expect(screen.getByText('leased')).toBeTruthy();});
