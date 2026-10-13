import {useState} from 'react';
import {useTranslation} from 'react-i18next';
import {z} from 'zod';
import {Plus,Plug,Trash} from '@phosphor-icons/react';
import * as wire from '../../generated/platform';
import {PlatformClient} from '../../shared/api';
import {Button,QueryFeedback,useQuery} from '../../shared/ui';
import {ConnectionEditor} from './ConnectionEditor';
import {M2Memory,useMemory} from './runtimeStore';
export type ConnectionPageProps={client:PlatformClient;project:wire.Project;session:wire.Session;memory:M2Memory;connectionId:string;navigate:(values:Record<string,string>)=>void;scopeRevision:number};
export const connectionList=z.array(wire.connectionSchema),environmentList=z.array(wire.environmentSchema),variableList=z.array(wire.variableSchema);
export function ConnectionsPage(props:ConnectionPageProps){
 const {client,project,memory,scopeRevision,navigate}=props;const {t}=useTranslation();useMemory(memory);const base=`/projects/${encodeURIComponent(project.id)}`;
 const connections=useQuery(client,`${base}/connections`,connectionList,scopeRevision),environments=useQuery(client,`${base}/environments`,environmentList,scopeRevision),variables=useQuery(client,`${base}/variables`,variableList,scopeRevision);
 const back={label:t('projects'),onClick:()=>navigate({page:'projects',project:'',connection:''})};const [newEntry,setNewEntry]=useState(false);const remembered=memory.selected.get(project.id);const selected=props.connectionId||(connections.data?.some(item=>item.id===remembered)?remembered:connections.data?.[0]?.id)||'';const current=connections.data?.find(item=>item.id===selected);
 return <section><h1>{t('servers')}</h1><div className="m2-layout"><aside className="m2-object-list" aria-label={t('servers')}>{project.role==='maintainer'&&<Button onClick={()=>setNewEntry(true)}><Plus size={16}/>{t('createConnection')}</Button>}{connections.data?.map(item=><Button key={item.id} aria-current={!newEntry&&item.id===selected?'page':undefined} onClick={()=>{memory.selected.set(project.id,item.id);memory.touch();setNewEntry(false);navigate({connection:item.id});}}><Plug size={16}/>{item.name}</Button>)}</aside><div className="m2-editor"><QueryFeedback {...connections} retry={connections.reload} back={back}/><QueryFeedback {...environments} retry={environments.reload} back={back}/><QueryFeedback {...variables} retry={variables.reload} back={back}/>{connections.data&&environments.data&&variables.data&&(newEntry||current?<ConnectionEditor key={`${project.id}:${newEntry?'new':current!.id}`} {...props} connection={newEntry?undefined:current} environments={environments.data} variables={variables.data} saved={connection=>{setNewEntry(false);memory.selected.set(project.id,connection.id);navigate({connection:connection.id});connections.reload();}} deleted={()=>{memory.selected.delete(project.id);navigate({connection:''});connections.reload();}}/>:props.connectionId?<><p role="alert">{t('error_not_found')}</p><Button onClick={()=>navigate({connection:''})}>{t('servers')}</Button></>:connections.data.length===0?<p>{t('emptyConnections')}</p>:null)}</div></div></section>;
}
