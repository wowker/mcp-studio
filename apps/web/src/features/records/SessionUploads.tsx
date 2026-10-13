import './records.css';
import {useTranslation} from 'react-i18next';
import type {RecordUploadInput} from '../../generated/platform';
import {Button,Feedback,useAction} from '../../shared/ui';
import type {OperationState} from '../../runtime/records/operations';
import type {RecordsPageProps} from './RecordsPage';
import type {RecordListView} from './viewStore';
/** These are frozen browser-session operations, never editable platform records. */
export function SessionUploads({client,project,session,memory,scope,view}:{client:RecordsPageProps['client'];project:RecordsPageProps['project'];session:RecordsPageProps['session'];memory:RecordsPageProps['memory'];scope:RecordsPageProps['scope'];view:RecordListView}){
 const {t}=useTranslation();const uploads=memory.records.list(project.id).filter(operation=>{
  const input=operation.input;if(operation.status==='recorded'||!('targetKind'in input)||input.targetKind!==view.kind||input.userId!==session.user.id||input.projectId!==project.id||input.snapshot.projectId!==project.id||input.responsibleEndpoint!=='browser')return false;
  const connectionId=scope?.connectionId??view.filters.connectionId,toolName=scope?.toolName??view.filters.toolName;
  if(connectionId&&input.connectionId!==connectionId||toolName&&input.snapshot.toolName!==toolName)return false;
  if(view.filters.visibility&&input.metadata.visibility!==view.filters.visibility||view.filters.status&&input.snapshot.runStatus!==view.filters.status||view.filters.contentKind&&input.metadata.contentKind!==view.filters.contentKind||view.filters.ownerId&&input.userId!==view.filters.ownerId||view.filters.environmentId&&input.snapshot.environmentId!==view.filters.environmentId)return false;
  return !view.filters.search||`${input.metadata.name} ${input.metadata.note} ${input.snapshot.toolName}`.toLocaleLowerCase().includes(view.filters.search.toLocaleLowerCase());
 });
 return uploads.length>0?<section role="region" aria-label={t('sessionRecordUploads')}><h2>{t('sessionRecordUploads')}</h2><ul className="record-session-uploads">{uploads.map(operation=><SessionUpload key={operation.input.operationId} operation={operation as OperationState&{input:RecordUploadInput}} client={client} project={project} memory={memory}/>)}</ul></section>:null;
}
function SessionUpload({operation,client,project,memory}:{operation:OperationState&{input:RecordUploadInput};client:RecordsPageProps['client'];project:RecordsPageProps['project'];memory:RecordsPageProps['memory']}){
 const {t}=useTranslation();const action=useAction();const retry=()=>action.run(async()=>{const isCurrent=memory.captureScope(project.id);const receipt=await memory.records.retry(client,operation.input.operationId);if(isCurrent()){memory.recordRefresh++;memory.touch();}return receipt;});
 return <li><span>{operation.input.metadata.name||t('recordOperationId',{id:operation.input.operationId})}</span><span className="ui-mono">{operation.input.operationId}</span><span role="status">{t(operation.status==='failed'?'sessionUploadFailed':operation.status==='uploading'?'sessionUploadSending':operation.status==='paused'?'operationPaused':'sessionUploadPending')}</span>{['failed','pending','paused'].includes(operation.status)&&['maintainer','developer'].includes(project.role)&&<Button disabled={action.pending} onClick={()=>void retry()}>{t('retryRecordOperation')}</Button>}{operation.stale&&<small>{t('operationStale')}</small>}{operation.lossRisk&&<small role="alert">{t(operation.storageError?'operationStorageLoss':'operationMemoryNotice')}</small>}<Feedback error={action.error}/></li>;
}
