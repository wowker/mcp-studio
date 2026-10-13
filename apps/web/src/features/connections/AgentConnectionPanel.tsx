import '../devices/translations';
import {useTranslation} from 'react-i18next';
import type {Connection,Variable} from '../../generated/platform';
import {Button,useAction} from '../../shared/ui';
import {useMemory} from './runtimeStore';
import type {ConnectionPageProps} from './ConnectionsPage';
import {AgentFeedback} from '../devices/AgentFeedback';
import {AgentCredentialsPanel} from './AgentCredentialsPanel';
export function AgentConnectionPanel({connection,saved,variables,...props}:ConnectionPageProps&{connection:Connection;saved:boolean;variables?:Variable[]}){
 const {t}=useTranslation();const {memory,project,session,navigate}=props;useMemory(memory);const action=useAction(),runtime=memory.existingAgentRuntime(project.id,connection.id),state=runtime?.getSnapshot(),paired=memory.existingAgent()?.getSnapshot().state==='paired';const allowed=project.canRead&&['developer','maintainer'].includes(project.role),environmentId=memory.applied.get(`${project.id}:${connection.id}`)??connection.environmentId;
 return <section><h2>{t('agent:title')}</h2><p className="ui-muted">{t('agent:source')}</p>{connection.transport==='stdio'&&<p>{t('agent:stdioNotice')}</p>}<p role="status">{t(state?.status==='failed'?'failedConnection':state?.status??'disconnected')}{state?.serverInfo&&` · ${state.serverInfo.name} ${state.serverInfo.version}`}</p><AgentFeedback error={state?.diagnostic||action.error}/>{!paired&&<p>{t('agent:queueUnavailable')}</p>}<div className="ui-actions"><Button onClick={()=>navigate({page:'devices'})}>{t('agent:title')}</Button>{runtime?.locked?<Button disabled={action.pending||!allowed} onClick={()=>void action.run(()=>runtime.disconnect())}>{t(state?.status==='connecting'?'cancel':'disconnect')}</Button>:<Button disabled={!saved||!paired||!allowed||action.pending} onClick={()=>void action.run(async()=>{const runtime=await memory.agentRuntime(project.id,connection.id,session.user.id);await runtime?.connect({...connection,environmentId},session.user.id);})}>{t('connect')}</Button>}</div>{paired&&allowed&&<AgentCredentialsPanel connection={connection} project={project} memory={memory} variables={variables}/>}</section>;
}
