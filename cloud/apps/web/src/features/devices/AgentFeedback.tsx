import './translations';
import {useTranslation} from 'react-i18next';
export function AgentFeedback({error}:{error?:string}){const {t,i18n}=useTranslation();if(!error)return null;const safe=/^[a-z][a-z0-9_]{0,63}$/u.test(error)?error:'agent_invalid_response',key=`error_${safe}`;return <p className="ui-error" role="alert">{i18n.exists(`agent:${key}`)?t(`agent:${key}`):i18n.exists(`error_${safe}`)?t(`error_${safe}`):t('agent:error_unknown')}<span className="ui-mono"> · {safe}</span></p>;}
