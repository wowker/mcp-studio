/* Throwaway design model. Only in-memory fixtures and simulated timers. */
(() => {
 const clone = value => structuredClone(value);
 const scenarios=['success','running','toolError','rpcError','authError','networkError','timeout','uploadFailure','largeResponse','binaryResponse'];
 function create({changed=()=>{},schedule=setTimeout,unschedule=clearTimeout,now=Date.now,successResponse=()=>({ok:true}),prepareUpload=run=>clone(run),canUpload=()=>true}={}) {
  const calls=new Map(), uploads=new Map();
  function upload(run) {
   const uploadKey=JSON.stringify([run.projectId||'',run.serverId||'',run.id]);
   if(uploads.has(uploadKey) || run.storageStatus==='recorded' || !canUpload(run))return false;
   run.uploadSnapshot ||= clone(prepareUpload(run));
   run.storageStatus='pending';run.uploading=true; run.uploadAttempts=(run.uploadAttempts||0)+1;
   uploads.set(uploadKey,schedule(()=>{uploads.delete(uploadKey);run.uploading=false;run.storageStatus=!canUpload(run) ? 'pending' : run.uploadAvailable===false ? 'failed' : 'recorded';changed('upload',run);},900));
   changed('upload-start',run);return true;
  }
  function settle(tab,job,cancelled=false) {
   if(calls.get(tab.id)!==job || !tab.running)return false;
   unschedule(job.timer);calls.delete(tab.id);
   const scenario=job.scenario;
   const errors={toolError:{code:'PRODUCT_NOT_AVAILABLE',message:'Product prd_1042 is unavailable.'},rpcError:{code:-32603,message:'Internal protocol error.'},authError:{code:'AUTHORIZATION_REQUIRED',message:'Authorization expired.'},networkError:{code:'CONNECTION_CLOSED',message:'Connection closed before a response.'},timeout:{code:'REQUEST_TIMEOUT',message:'No response within the wait limit.'}};
   const error=errors[scenario];
   const status=cancelled ? 'cancelled' : error ? 'failed' : 'succeeded';
   const duration=Math.max(1,now()-job.started);
   const response=cancelled ? null : error ? clone(error) : clone(successResponse(job.tool,job.arguments));
   const run={truncated:scenario==='largeResponse',omitted:scenario==='binaryResponse',id:job.id,projectId:job.projectId,tabId:tab.id,tool:job.tool,serverId:job.serverId,actor:job.actor,ownerId:job.ownerId||'user-wuwei',queueOwner:job.source,profile:job.profile,status,time:new Date(now()).toLocaleTimeString('en-GB',{hour12:false}),duration,arguments:clone(job.arguments),response,pinned:false,version:job.version,executionSource:job.source,storageStatus:'pending',uploadAvailable:scenario!=='uploadFailure',errorKind:cancelled ? 'cancelled' : error ? scenario : null,date:new Date(now()).toISOString().slice(0,10),endpoint:job.endpoint,transport:job.transport||'http',credentialSource:job.credentialSource,command:job.transport==='stdio'?job.command:undefined,configRevision:job.configRevision||3,httpStatus:job.transport==='stdio'||cancelled || ['networkError','timeout'].includes(scenario) ? null : scenario==='authError' ? 401 : 200};
   if(scenario==='largeResponse'||scenario==='binaryResponse')run.response={omitted:true,contentType:scenario==='binaryResponse'?'application/octet-stream':'application/json',originalBytes:scenario==='binaryResponse'?4194304:12582912,retainedBytes:0,reason:scenario==='binaryResponse'?'UNSAFE_TO_REDACT':'RESPONSE_RETENTION_LIMIT'};
   run.protocol=cancelled || ['networkError','timeout','authError'].includes(scenario) ? null : scenario==='rpcError' ? {jsonrpc:'2.0',id:job.id,error:clone(error)} : {jsonrpc:'2.0',id:job.id,result:{isError:scenario==='toolError',...(error ? {content:[{type:'text',text:JSON.stringify(error)}]} : {structuredContent:clone(run.response)})}};
   tab.running=false;tab.result=run;tab.resultView='result';tab.pendingCall=null;
   job.project.history.unshift(run);job.project.selectedRunId=run.id;
   upload(run);changed('settled',run);return run;
  }
  return {
   start(tab,context) {
    if(tab.running || calls.has(tab.id))return false;
    const job={...context,arguments:clone(tab.arguments),version:tab.version,tool:tab.tool,serverId:tab.serverId,scenario:scenarios.includes(tab.scenario) ? tab.scenario : 'success',started:now(),timer:null};
    calls.set(tab.id,job);tab.running=true;tab.result=null;tab.error='';tab.pendingCall={id:job.id,profile:job.profile,arguments:clone(job.arguments),version:job.version,started:job.started};
    if(job.scenario!=='running') job.timer=schedule(()=>settle(tab,job),1800);
    changed('started');return true;
   },
   finish(tab) {const job=calls.get(tab.id);return job ? settle(tab,job) : false;},
   cancel(tab) {const job=calls.get(tab.id);return job ? settle(tab,job,true) : false;},
   failConnection(tab) {const job=calls.get(tab.id);if(!job)return false;job.scenario='networkError';return settle(tab,job);},
   loseBrowser(tab){const job=calls.get(tab.id);if(!job||job.source!=='browser')return false;job.scenario='networkError';const run=settle(tab,job);if(run){run.status='unknown';run.response=null;run.protocol=null;run.errorKind='outcomeUnknown';run.uploadSnapshot=clone(prepareUpload(run));}return run;},
   retry:upload,
   dispose() {for(const job of calls.values())unschedule(job.timer);for(const timer of uploads.values())unschedule(timer);calls.clear();uploads.clear();},
   elapsed(tab) {return tab.pendingCall ? Math.max(0,Math.floor((now()-tab.pendingCall.started)/1000)) : 0;},
  };
 }
 function view({escape:e,t,icon,button,badge,jsonView,canRun=()=>true,canRetry=canRun}) {
  function recording(run) {
   const status=run.storageStatus||'recorded';
   return `<div class="debug-recording ${status==='failed' ? 'warning' : ''}" role="status">${icon(status==='failed' ? 'WarningCircle' : 'Cloud')}<div class="grow"><strong>${e(t(status==='pending'&&!run.uploading ? 'runs.platformPending' : 'debugger.'+status))}</strong>${status==='failed' ? `<p>${e(t('debugger.recordHint'))}</p><small>${e(t('debugger.recordTransient'))}</small>` : ''}</div>${status==='failed'||status==='pending'&&!run.uploading ? `<div class="debug-upload-actions">${button('retry-history-upload',e(t(status==='pending' ? 'debugger.uploadRecord' : 'runs.retryUpload')),'ArrowClockwise','',`data-run="${e(run.id)}" ${canRetry(run) ? '' : 'disabled'}`)}${run.uploadAvailable===false ? button('debug-reconnect',e(t('debugger.reconnect')),'Plug','quiet',`data-run="${e(run.id)}" ${canRetry(run) ? '' : 'disabled'}`) : badge(t('debugger.online'),'success')}</div>` : ''}</div>`;
  }
  return {
   recording,
   scenarios(tab) {return `<div class="debug-preview"><label for="debug-scenario">${icon('Info')}${e(t('debugger.preview'))}</label><select id="debug-scenario" ${tab.running ? 'disabled' : ''}>${scenarios.map(key=>`<option value="${key}" ${tab.scenario===key ? 'selected' : ''}>${e(t('debugger.'+key))}</option>`).join('')}</select><span>${e(t('debugger.previewHint'))}</span></div>`;},
   running(tab,elapsed) {return `<section class="debug-running" role="status"><div class="debug-state-heading"><span class="debug-spinner" aria-hidden="true"></span><div><h3>${e(t('debugger.waiting'))}</h3><p>${e(t('debugger.runningHint'))}</p></div><span class="tag debug-elapsed" aria-live="off">${e(t('debugger.elapsed',{seconds:elapsed}))}</span></div><ol class="debug-stages"><li class="done">${icon('CheckCircle')}${e(t('debugger.validated'))}</li><li class="done">${icon('CheckCircle')}${e(t('debugger.sent'))}</li><li>${icon('ClockCounterClockwise')}${e(t('debugger.waiting'))}</li></ol><div class="toolbar">${button('cancel-run',e(t('tools.cancelCall')),'StopCircle','',canRun() ? '' : 'disabled')}${tab.scenario==='running' ? button('debug-finish',e(t('debugger.finish')),'Check','quiet',canRun() ? '' : 'disabled') : ''}</div><p class="small muted section-gap">${e(t('debugger.cancelHint'))}</p><details class="section-gap"><summary>${e(t('debugger.frozen'))} · <code>${e(tab.pendingCall.id)}</code></summary>${jsonView(tab.pendingCall.arguments)}</details></section>`;},
   error(run,actions=true) {const kind=run.errorKind || (run.status==='cancelled' ? 'cancelled' : 'authError');return `<section class="debug-error" role="${kind==='cancelled' ? 'status' : 'alert'}"><div class="debug-state-heading">${icon(kind==='cancelled' ? 'StopCircle' : 'WarningCircle')}<div><h3>${e(t('debugger.'+(kind==='cancelled' ? 'cancelledTitle' : kind)))}</h3><p>${e(t('debugger.'+(kind==='cancelled' ? 'cancelledHint' : kind+'Hint')))}</p></div></div>${run.response?.code ? `<code>${e(run.response.code)}</code>` : ''}${actions ? `<div class="toolbar section-gap">${button('execute',e(t('debugger.retryCall')),'Play','quiet',canRun() ? '' : 'disabled')}${['authError','networkError'].includes(kind) ? button('debug-connection',e(t('debugger.inspectConnection')),'Plug','quiet',canRun() ? '' : 'disabled') : ''}</div>` : ''}</section>`;},
  };
 }
 window.workbenchDebugger={create,view,scenarios};
})();
