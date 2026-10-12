/* Throwaway design model. No fetch, processes, tokens, browser credential storage or pairing APIs. */
window.workbenchConnections = {
  create({escape:e,t,icon,button,badge,ui,changed=()=>{},schedule=(fn,delay)=>setTimeout(fn,delay),unschedule=id=>clearTimeout(id)}) {
    const entries=new Map(), jobs=new Map();let environmentCheck=null,endpointCheck=null;
    const identity=(projectId,server)=>JSON.stringify([projectId,server.id,'current-user']);
    const configKeys=['httpMode','name','url','timeout','profile','transport','channel','command','args','directory','auth','headerName','headerRef'];
    const config=d=>Object.fromEntries(configKeys.map(key=>[key,d[key]]));
    function get(projectId,server) {
      const key=identity(projectId,server);
      if(!entries.has(key)) {
        const draft={name:server.name,url:server.url||'',timeout:String(server.timeout||30),profile:server.profile||'开发环境',httpMode:'streamable',transport:'http',channel:server.channel||(server.connected?'agent':'browser'),command:'npx',args:'["-y", "@modelcontextprotocol/server-filesystem", "/workspace/docs"]',directory:'/workspace',auth:server.auth||'bearer',headerName:'X-Tenant-ID',headerRef:'{{TENANT_ID}}',source:'environment',reference:projectId==='commerce'?'COMMERCE_TOKEN':'KNOWLEDGE_TOKEN',storage:server.channel==='agent'||server.connected?'local':'session',backup:false,backupConfirmed:false,backupStatus:'idle',credential:'empty',credentialGeneration:0,oauth:'idle',oauthAttempt:0,device:server.connected?'paired':'unpaired',pairing:false,pairScenario:'approved',scenario:'success',saveScenario:'success',status:server.connected?'connected':'disconnected',attempt:0,error:'',errors:{},dirty:false,saved:false,revision:1,exportOpen:false,removeConfirm:false,forgetConfirm:false};
        draft.savedConfig=config(draft);entries.set(key,draft);
      }
      return entries.get(key);
    }
    function stop(key,kind) { const id=key+'|'+kind;if(jobs.has(id)){unschedule(jobs.get(id));jobs.delete(id);} }
    function later(key,kind,fn,delay) {stop(key,kind);jobs.set(key+'|'+kind,schedule(()=>{jobs.delete(key+'|'+kind);fn();changed(key,kind);},delay));}
    function validate(d) {
      const issues={};
      if(!d.name.trim())issues.name='nameRequired';
      if(!Number.isInteger(Number(d.timeout))||Number(d.timeout)<1||Number(d.timeout)>600)issues.timeout='timeoutInvalid';
      if(d.transport==='http') {
        try {const url=new URL(d.url);if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.hash||[...url.searchParams].some(([k,v])=>/token|secret|password|api.?key|authorization/i.test(k+v)))throw Error();} catch {issues.url='urlInvalid';}
        if(endpointCheck&&!endpointCheck(d,[...entries].find(([,entry])=>entry===d)?.[0]))issues.url='urlInvalid';
        if(d.headerName||d.headerRef)if(!/^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/.test(d.headerName)||/^(authorization|cookie|proxy-authorization)$/i.test(d.headerName)||!/^\{\{[A-Za-z_][A-Za-z0-9_.-]*\}\}$/.test(d.headerRef))issues.headerRef='headerInvalid';
      } else {
        if(!d.command.trim())issues.command='commandRequired';
        try {const args=JSON.parse(d.args);if(!Array.isArray(args)||args.some(x=>typeof x!=='string'))throw Error();} catch {issues.args='argsInvalid';}
        if(d.directory&&!/^\/|^[A-Za-z]:[\\/]/.test(d.directory))issues.directory='directoryInvalid';
      }
      d.errors=issues;return !Object.keys(issues).length;
    }
    function save(projectId,server) {
      const d=get(projectId,server);if(server.connected||d.status==='connecting'||!validate(d))return false;
      if(d.conflict){d.error='conflict';return false;}
      d.stdioApproved='';d.savedConfig=config(d);d.dirty=false;d.saved=true;d.error='';d.status='disconnected';d.revision++;
      Object.assign(server,{name:d.name.trim(),url:d.transport==='http'?d.url.trim():'',auth:d.auth,profile:d.profile,timeout:Number(d.timeout),transport:d.transport,command:d.transport==='stdio'?d.command:''});
      server.credential=d.auth==='oauth'?'我的 OAuth':d.auth==='none'?'无需凭据':'项目服务账号';return true;
    }
    function environmentReady(d){if(!environmentCheck)return ['COMMERCE_TOKEN','KNOWLEDGE_TOKEN'].includes(d.reference);const entry=[...entries].find(([,draft])=>draft===d);if(!entry)return false;const [projectId,id]=JSON.parse(entry[0]);return environmentCheck(projectId,{id,profile:d.profile});}
    const available=d=>d.auth==='none'||(d.auth==='bearer'&&d.source==='environment'&&environmentReady(d))||d.credential==='saved'&&(d.auth!=='oauth'||d.oauth==='ready');
    function finish(projectId,server,attempt) {
      const d=get(projectId,server);if(d.attempt!==attempt||d.status!=='connecting')return false;
      d.status=d.scenario==='success'?'connected':'failed';d.error=d.scenario==='success'?'':d.scenario;server.connected=d.status==='connected';return true;
    }
    function toggle(projectId,server) {
      const d=get(projectId,server),key=identity(projectId,server);
      if(d.status==='connecting') {stop(key,'connect');d.attempt++;d.status='cancelled';d.error='';server.connected=false;return;}
      if(server.connected) {stop(key,'connect');d.status='disconnected';d.error='';server.connected=false;return;}
      d.error='';
      if(environmentCheck&&!environmentCheck(projectId,server)){d.error='environmentMissing';return;}
      if(d.oauth==='waiting'||d.credential==='saving'||d.pairing)return;
      if(d.dirty) {d.error='unsaved';return;}
      if(!validate(d)){d.error='fieldError';return;}
      if(d.channel==='agent'&&d.device!=='paired') {d.error='agentRequired';return;}
      if(!available(d)) {d.error='credentialRequired';return;}
      if(d.transport==='stdio'&&d.stdioApproved!==JSON.stringify(d.savedConfig)){d.launchConfirm=true;d.error='stdioConfirm';return;}
      d.status='connecting';d.attempt++;d.connectionSnapshot={...d.savedConfig,revision:d.revision,connectionId:server.id,projectId,credentialSource:d.source};
      const attempt=d.attempt;d.connectionSnapshot.attempt=attempt;
      if(d.scenario!=='waiting')later(key,'connect',()=>finish(projectId,server,attempt),1500);
    }
    function backup(projectId,server) {
      const d=get(projectId,server),key=identity(projectId,server);
      if(!d.backup||!d.backupConfirmed||d.credential!=='saved'||d.backupStatus==='pending')return;
      d.backupStatus='pending';const generation=d.credentialGeneration;
      later(key,'backup',()=>{if(generation!==d.credentialGeneration)return;d.backupStatus=d.saveScenario==='backupFailure'?'failed':'ready';},900);
    }
    function saveCredential(projectId,server) {
      const d=get(projectId,server),key=identity(projectId,server);
      if(d.credential==='saving'||d.auth==='oauth'&&d.oauth!=='ready')return;
      if(d.storage==='local'&&d.device!=='paired') {d.error='agentRequired';return;}
      d.credential='saving';d.error='';d.credentialGeneration++;const generation=d.credentialGeneration;
      later(key,'credential',()=>{if(generation!==d.credentialGeneration)return;d.credential=d.saveScenario==='localFailure'||d.storage==='local'&&d.device!=='paired'?'failed':'saved';if(d.credential==='saved')backup(projectId,server);},900);
    }
    function resetCredential(projectId,server) {
      const d=get(projectId,server),key=identity(projectId,server);stop(key,'credential');stop(key,'backup');d.credentialGeneration++;d.credential='empty';d.oauth='idle';d.removeConfirm=false;
    }
    function offline(projectId,server,device='offline') {const d=get(projectId,server);stop(identity(projectId,server),'connect');d.device=device;d.pairing=false;if(d.channel==='agent'&&(server.connected||d.status==='connecting')){d.attempt++;d.status='failed';d.error='agentOfflineCode';server.connected=false;}}
    function input(target,projectId,server,editable,runnable=editable) {
      const name=target.dataset.execution;if(!name)return false;
      const d=get(projectId,server);
      if(!runnable)return true;
      if(['scenario','pairScenario','saveScenario'].includes(name)) {if(d.status==='connecting'||d.credential==='saving'||d.backupStatus==='pending')return true;d[name]=target.value;return 'input';}
      if(configKeys.includes(name)&&!editable)return true;
      if(server.connected||d.status==='connecting'||d.credential==='saving'||d.oauth==='waiting'||d.pairing||d.backupStatus==='pending')return true;
      if(![...configKeys,'source','reference','storage','backup'].includes(name))return false;
      const previous=d[name];d[name]=name==='backup'?target.checked:target.value;
      if(d.transport==='stdio'){d.channel='agent';d.auth='none';}
      if(d.channel==='browser')d.storage='session';
      if(previous!==d[name]&&['auth','source','reference','storage','transport','channel'].includes(name)){const grant=d.oauth;resetCredential(projectId,server);if(name==='storage')d.oauth=grant;}
      if(name==='backup'){d.backupConfirmed=false;if(!d.backup){stop(identity(projectId,server),'backup');d.backupStatus='idle';}}
      d.error='';if(d.status==='failed'||d.status==='cancelled')d.status='disconnected';delete d.errors[name];d.dirty=JSON.stringify(config(d))!==JSON.stringify(d.savedConfig);d.saved=false;
      return 'render';
    }
    function action(action,projectId,server,editable,runnable) {
      if(!action.startsWith('connection-'))return false;
      const d=get(projectId,server),key=identity(projectId,server),locked=server.connected||d.status==='connecting';
      if(action==='connection-export'){d.exportOpen=!d.exportOpen;return true;}
      if(!runnable)return true;
      if(action==='connection-toggle'){toggle(projectId,server);return true;}
      if(action==='connection-agent-offline'){offline(projectId,server);return true;}
      if(action==='connection-pair-cancel'){d.pairing=false;return true;}
      if(action==='connection-oauth-cancel'){if(d.oauth==='waiting'){d.oauth='cancelled';d.oauthAttempt++;}return true;}
      if(locked)return true;
      if((d.credential==='saving'||d.backupStatus==='pending')&&!['connection-backup-retry'].includes(action))return true;
      if(action==='connection-save'&&editable)save(projectId,server);
      if(action==='connection-switch-agent'&&editable){input({dataset:{execution:'channel'},value:'agent'},projectId,server,true,true);d.scenario='success';}
      if(action==='connection-pair'){d.pairing=true;d.error='';}
      if(action==='connection-pair-confirm'&&d.pairing){d.pairing=false;d.device=d.pairScenario==='approved'?'paired':d.pairScenario;}
      if(action==='connection-forget')d.forgetConfirm=true;
      if(action==='connection-forget-cancel')d.forgetConfirm=false;
      if(action==='connection-forget-confirm'){offline(projectId,server,'unpaired');d.forgetConfirm=false;}
      if(action==='connection-oauth-start'){resetCredential(projectId,server);d.oauth='waiting';d.oauthAttempt++;d.error='';}
      if(d.oauth==='waiting'&&['connection-oauth-success','connection-oauth-denied','connection-oauth-expired','connection-oauth-callback'].includes(action)){
        d.oauth=action==='connection-oauth-success'?'ready':action.replace('connection-oauth-','');if(d.oauth==='ready')saveCredential(projectId,server);
      }
      if(action==='connection-oauth-expire'&&d.oauth==='ready'){resetCredential(projectId,server);d.oauth='expired';}
      if(action==='connection-credential-save')saveCredential(projectId,server);
      if(action==='connection-credential-replace')resetCredential(projectId,server);
      if(action==='connection-credential-remove')d.removeConfirm=true;
      if(action==='connection-credential-keep')d.removeConfirm=false;
      if(action==='connection-credential-remove-confirm')resetCredential(projectId,server);
      if(action==='connection-backup-confirm'){d.backupConfirmed=true;backup(projectId,server);}
      if(action==='connection-backup-retry'){backup(projectId,server);}
      return true;
    }
    const text=key=>t('connection.'+key);
    const pill=d=>badge(text(d.status),d.status==='connected'?'success':d.status==='failed'?'error':d.status==='connecting'?'warning':'');
    const nav=view=>`<nav class="execution-nav" role="tablist" aria-label="${e(t('execution.configurationViews'))}">${[['connection','connection-settings',t('execution.connectionConfig')],['authorization','authorization-settings',text('authorization')],['execution','execution-settings',text('agentTab')]].map(([value,action,label])=>button(action,e(label),'','quiet',`role="tab" data-connection-view="${value}" id="connection-view-${value}" aria-controls="connection-panel" aria-selected="${view===value}" ${view===value?'aria-current="page"':''}`)).join('')}</nav>`;
    function section(index,title,hint,contents) {return `<section class="execution-section">${ui.sectionHeading({index,title:text(title),description:text(hint)})}${contents}</section>`;}
    function notice(message,style='') {return `<div class="notice connection-notice ${style}">${icon(style==='danger'?'WarningCircle':'Info')}<span>${e(message)}</span></div>`;}
    function render({projectId,server,servers,editable,runnable,view='connection',references=[]}) {
      const d=get(projectId,server),locked=!editable||server.connected||d.status==='connecting'||d.credential==='saving'||d.oauth==='waiting'||d.backupStatus==='pending'||d.pairing,disabled=locked?'disabled':'',personalLocked=!runnable||server.connected||d.status==='connecting'||d.credential==='saving'||d.oauth==='waiting'||d.backupStatus==='pending',personalDisabled=personalLocked?'disabled':'';
      if(d.error==='environmentMissing'&&environmentCheck?.(projectId,server))d.error='';
      const b=(action,label,glyph='',variant='quiet',extra='')=>button('connection-'+action,e(text(label)),glyph,variant,`${extra} ${runnable?'':'disabled'}`);
      const field=(name,label,hint='',type='text',full=false)=>`<div class="field ${full?'full':''}"><label for="execution-${name}">${e(text(label))}${['name','url','command','timeout'].includes(name)?' <span class="required">*</span>':''}</label>${hint?`<span class="description">${e(text(hint))}</span>`:''}${name==='args'?`<textarea id="execution-args" class="mono" data-execution="args" ${disabled} aria-invalid="${!!d.errors.args}" ${d.errors.args?'aria-describedby="connection-error-args"':''}>${e(d.args)}</textarea>`:`<input id="execution-${name}" data-execution="${name}" value="${e(d[name])}" type="${type==='url'?'text':type}" ${['url','command','directory','headerName','headerRef'].includes(name)?'class="mono"':''} ${type==='url'?'inputmode="url"':''} ${type==='number'?'min="1" max="600"':''} ${disabled} aria-invalid="${!!d.errors[name]}" ${d.errors[name]?`aria-describedby="connection-error-${name}"`:''}>`}${d.errors[name]?`<span class="connection-field-error" id="connection-error-${name}">${e(text(d.errors[name]))}</span>`:''}</div>`;
      const select=(name,label,options,off=disabled)=>`<div class="field"><label for="execution-${name}">${e(text(label))}</label><select id="execution-${name}" data-execution="${name}" ${off}>${options.map(([value,label])=>`<option value="${e(value)}" ${d[name]===value?'selected':''}>${e(label)}</option>`).join('')}</select></div>`;
      const options=(name,items)=>`<fieldset class="execution-options"><legend>${e(t('execution.'+name))}</legend>${items.map(([value,label,hint])=>`<label class="execution-option ${d[name]===value?'selected':''} ${locked||name==='channel'&&d.transport==='stdio'&&value==='browser'?'disabled':''}"><input type="radio" name="${name}" value="${value}" data-execution="${name}" ${d[name]===value?'checked':''} ${disabled} ${name==='channel'&&d.transport==='stdio'&&value==='browser'?'disabled':''}><span><strong>${e(label)}</strong><small>${e(t('execution.'+hint))}</small></span></label>`).join('')}</fieldset>`;
      const route=`<div class="execution-route"><span>${icon('Monitor')}${e(t('execution.workbench'))}</span><span aria-hidden="true">→</span>${d.channel==='agent'?`<span>${e(t('execution.agent'))}</span><span aria-hidden="true">→</span>`:''}<span>${icon('Plugs')}${e(t(d.transport==='stdio'?'execution.localProcess':'execution.httpService'))}</span></div>`;
      const commonStatus=`<div class="connection-state"><div class="connection-state-line">${pill(d)}<span class="muted">${e(t('connection.revision',{revision:d.revision}))}</span><span class="push"></span>${button('open-config-tools',t('servers.openTools'),'ArrowUpRight','quiet',`data-server="${e(server.id)}" ${d.status==='connected'?'':'disabled'}`)}</div><p>${e(text(d.status==='connected'?'successHint':d.status==='connecting'?'waitingHint':d.status==='cancelled'?'cancelHint':'idleHint'))}</p></div>`;
      const errorHint={network:'networkHint',cors:'corsHint',unauthorized:'unauthorizedHint',timeoutError:'timeoutErrorHint',protocol:'protocolHint',missingCommand:'missingCommandHint',processExit:'processExitHint',agentOfflineCode:'offlineHint'};
      const diagnostic=d.error?`<section class="connection-diagnostic" role="alert"><header>${icon('WarningCircle')}<strong>${e(text(errorHint[d.error]?'diagnostics':d.error))}</strong>${errorHint[d.error]?`<code>${e(({network:'NETWORK_UNREACHABLE',cors:'CORS_BLOCKED',unauthorized:'HTTP_401',timeoutError:'CONNECT_TIMEOUT',protocol:'MCP_INITIALIZE_FAILED',missingCommand:'EXECUTABLE_NOT_FOUND',processExit:'PROCESS_EXITED',agentOfflineCode:'AGENT_OFFLINE'})[d.error])}</code>`:''}</header>${errorHint[d.error]?`<p>${e(text(errorHint[d.error]))}</p>`:''}<div class="toolbar">${button(d.error==='environmentMissing'?'manage-environment':d.error==='agentRequired'||d.error==='agentOfflineCode'?'execution-settings':d.error==='credentialRequired'||d.error==='unauthorized'?'authorization-settings':'connection-settings',e(text(d.error==='environmentMissing'?'goEnvironment':d.error==='agentRequired'||d.error==='agentOfflineCode'?'goAgent':d.error==='credentialRequired'||d.error==='unauthorized'?'goAuth':'connectConfig')),'ArrowUpRight','quiet')}${d.error==='cors'?b('switch-agent','switchAgent','Plug','',editable?'':'disabled'):''}</div></section>`:'';
      const progress=(d.status==='connecting'||d.status==='connected'?`<section class="execution-section"><h3>${e(text('stage'))}</h3><ol class="connection-progress" aria-label="${e(text('stage'))}" role="status">${['resolve','handshake','catalog'].map((step,i)=>`<li class="${d.status==='connected'||i===0?'done':i===1?'active':''}">${icon(d.status==='connected'||i===0?'CheckCircle':'ClockCounterClockwise')}<span>${e(text(step))}</span></li>`).join('')}</ol><p class="small muted">${e(text('snapshot'))}</p></section>`:'');
      let content='';
      if(view==='connection') {
        content=section('01','general','generalHint',`<div class="fields">${field('name','name','', 'text',true)}${field('timeout','timeout','','number')}${select('profile','profile',[['基础配置',text('base')],['开发环境',text('dev')],['预发环境',text('staging')]])}</div>`)
          +section('02','route','routeHint',(d.transport==='http'?select('httpMode','httpMode',[['streamable','Streamable HTTP'],['sse','HTTP + SSE']]):'')+options('transport',[['http','HTTP','httpHint'],['stdio','stdio','stdioHint']])+options('channel',[['browser',t('execution.browser'),'browserHint'],['agent',t('execution.agent'),'agentHint']])+route+`<div class="fields execution-command">${d.transport==='http'?field('url','endpoint','endpointHint','url',true):field('command','command')+field('directory','directory')+field('args','arguments','argsHint', 'text',true)}</div>${d.transport==='stdio'?notice(text('envHint')):''}`)
          +(d.transport==='http'?section('03','headers','headerHint',`<div class="fields">${field('headerName','headerName')}${field('headerRef','headerRef')}</div>`):'')
          +section(d.transport==='http'?'04':'03','scenario','scenarioHint',select('scenario','scenario',[...['success','waiting','timeoutError','protocol'],...(d.transport==='http'?['network','unauthorized']:['missingCommand','processExit']),...(d.channel==='browser'?['cors']:[])].map(x=>[x,text(x)]),d.status==='connecting'?'disabled':''))
;
      } else if(view==='authorization') {
        content=section('01','authTitle','authHint',`<dl class="execution-records"><div><dt>${e(text('account'))}</dt><dd>吴伟 · wu.wei@example.test</dd></div><div><dt>${e(text('connectionId'))}</dt><dd class="mono">${e(server.id)}</dd></div></dl><div class="fields">${select('auth','authMethod',[['bearer','Bearer Token'],['oauth',text('oauth')],['none',text('none')]],d.transport==='stdio'?'disabled':disabled)}</div>${d.transport==='stdio'?notice(text('envHint')):''}`);
        if(d.auth==='none')content+=notice(t('servers.thisServerDoesNotRequireCredentials'));
        else {
          const preferences=section('03','storage','storageHint',`<div class="fields">${select('storage','storage',[['session',t('execution.session')],...(d.channel==='agent'?[['local',t('execution.local')]]:[])],personalDisabled)}</div><label class="execution-setting-row execution-backup"><span><strong>${e(t('execution.backup'))}</strong><small>${e(t('execution.backupHint'))}</small></span><input id="execution-backup" type="checkbox" data-execution="backup" ${d.backup?'checked':''} ${personalDisabled}></label>${d.backup&&!d.backupConfirmed?`<div class="connection-inline-confirm"><strong>${e(text('backupConfirm'))}</strong><p>${e(text('backupScope'))}</p>${b('backup-confirm','confirmBackup','Cloud','',personalDisabled)}</div>`:''}${d.backupStatus!=='idle'?`<div class="connection-backup-status" role="status">${badge(text({pending:'backupPending',ready:'backupReady',failed:'backupFailed'}[d.backupStatus]),d.backupStatus==='failed'?'error':d.backupStatus==='ready'?'success':'warning')}${d.backupStatus==='failed'?`<p>${e(text('backupHint'))}</p>${b('backup-retry','retryBackup','ArrowClockwise','',personalDisabled)}`:''}</div>`:''}`);
          if(d.auth==='bearer')content+=section('02','source','exampleHint',`<div class="fields">${select('source','source',[['environment',text('environment')],['example',text('example')]],personalDisabled)}${d.source==='environment'?select('reference','reference',[...new Set([d.reference,...references])].filter(Boolean).map(name=>[name,'{{'+name+'}}']),personalDisabled):`<div class="field"><label for="connection-mask">${e(text('mask'))}</label><input id="connection-mask" value="••••••••••••" readonly aria-label="${e(text('mask'))}"></div>`}</div>${d.source==='environment'?!environmentReady(d)?notice(text('missingHint'),'danger'):badge(text('available'),'success'):''}`);
          else content+=section('02','oauth','oauthHint',`<div class="connection-oauth-status" role="status">${badge(text(({idle:'oauthIdle',waiting:'oauthWaiting',ready:'oauthReady',denied:'oauthDenied',expired:'oauthExpired',callback:'oauthCallback',cancelled:'oauthCancelled'})[d.oauth]),d.oauth==='ready'?'success':d.oauth==='waiting'?'warning':['denied','expired','callback'].includes(d.oauth)?'error':'')}</div><dl class="execution-records"><div><dt>${e(text('oauthAccount'))}</dt><dd>wu.wei@example.test</dd></div><div><dt>${e(text('endpoint'))}</dt><dd class="mono">${e(d.url)}</dd></div><div><dt>${e(text('oauthScope'))}</dt><dd><code>tools:read tools:call</code></dd></div></dl>${d.oauth==='waiting'?`<div class="connection-inline-confirm"><p>${e(text('oauthWaitHint'))}</p><div class="toolbar">${b('oauth-success','oauthSuccess','Check','primary')}${b('oauth-denied','oauthDeny')}${b('oauth-expired','oauthExpire')}${b('oauth-callback','oauthInvalid')}${b('oauth-cancel','oauthCancel')}</div></div>`:`${['denied','expired','callback','cancelled'].includes(d.oauth)?notice(text('oauthErrorHint')):''}${d.oauth==='ready'?b('oauth-expire','oauthExpire','','',personalDisabled):b('oauth-start',d.oauth==='idle'?'oauthStart':'oauthRetry','ArrowUpRight','primary',personalDisabled)}`}`);
          content+=d.auth==='bearer'&&d.source==='environment'?notice(text('environmentStorageHint')):preferences;
          if(d.auth==='oauth'||d.source==='example')content+=section('04','saveCredential','exampleHint',`<div class="connection-credential-status" role="status">${badge(text(d.credential==='saved'?d.storage==='local'?'stored':'sessionStored':d.credential==='saving'?'saving':d.credential==='failed'?'saveFailure':'empty'),d.credential==='saved'?'success':d.credential==='failed'?'error':'')}${d.credential==='failed'?`<p>${e(text('saveFailureHint'))}</p>`:''}</div>${select('saveScenario','saveScenario',['success','localFailure','backupFailure'].map(x=>[x,text(x)]),personalDisabled)}<div class="toolbar">${b('credential-save','saveCredential','Check',d.auth==='oauth'?'':'primary',`${personalDisabled} ${d.auth==='oauth'&&d.oauth!=='ready'?'disabled':''}`)}${b('credential-replace','replace','','quiet',personalDisabled)}${b('credential-remove','clear','','quiet',`${personalDisabled} ${d.credential==='empty'?'disabled':''}`)}</div>${d.removeConfirm?`<div class="connection-inline-confirm"><p>${e(text('clearHint'))}</p>${b('credential-remove-confirm','clearConfirm','','danger')}${b('credential-keep','keep')}</div>`:''}`);
        }
        content+=section(d.auth==='none'?'02':d.auth==='bearer'&&d.source==='environment'?'03':'05','recordsTitle','recordsHint',button('navigate',t('common.history'),'ClockCounterClockwise','quiet','data-page="history"'));
      } else {
        content=section('01','localAgent','agentHint',`<div class="execution-device"><span class="execution-device-icon">${icon('Monitor')}</span><div class="grow"><strong>${e(text('device'))}</strong><p>${e(text(d.pairing?'pairHint':d.device==='paired'?'capabilitiesValue':d.device==='unpaired'?'pairHint':d.device+'Hint'))}</p></div>${badge(text(d.pairing?'pairing':d.device),d.device==='paired'&&!d.pairing?'success':d.device==='unpaired'?'':'warning')}</div><div class="toolbar">${d.device==='paired'?b('agent-offline','previewOffline','Plug'):b('pair',d.device==='unpaired'?'pair':'pairRetry','Plug','primary',`${d.pairing||server.connected||d.status==='connecting'?'disabled':''}`)}${b('forget','forget','','quiet',`${d.device==='unpaired'||d.pairing||server.connected||d.status==='connecting'?'disabled':''}`)}</div>${d.pairing?`<div class="connection-inline-confirm"><h4>${e(text('pairing'))}</h4><dl class="execution-records"><div><dt>${e(text('pairOrigin'))}</dt><dd class="mono">http://127.0.0.1:8861</dd></div><div><dt>${e(text('account'))}</dt><dd>wu.wei@example.test</dd></div><div><dt>${e(text('connectionId'))}</dt><dd class="mono">${e(server.id)}</dd></div></dl>${select('pairScenario','pairScenario',['approved','denied','incompatible','pairExpired'].map(x=>[x,text(x)]),'')}<div class="toolbar">${b('pair-confirm','pairConfirm','Check','primary')}${b('pair-cancel','pairCancel')}</div></div>`:''}${d.forgetConfirm?`<div class="connection-inline-confirm"><p>${e(text('forgetHint'))}</p>${b('forget-confirm','confirmForget','','danger')}${b('forget-cancel','keep')}</div>`:''}`)
          +section('02','agentMeta','private',`<dl class="execution-records"><div><dt>${e(text('device'))}</dt><dd class="mono">WW-MacBook · fixture-device-01</dd></div><div><dt>${e(text('version'))}</dt><dd>0.4.2 · ${e(text('preview'))}</dd></div><div><dt>${e(text('capabilities'))}</dt><dd>${e(text('capabilitiesValue'))}</dd></div></dl>`)+section('03','route','routeHint',route);
      }
      const footerLabel=d.status==='connecting'?'cancel':server.connected?'disconnect':d.status==='failed'?'retry':'connect';
      return `<section class="page management-page execution-page connection-page" data-connection-context="${e(JSON.stringify([projectId,server.id,view]))}">${ui.pageHeading({title:t('common.servers'),description:text('description'),glyph:'HardDrives',actions:button('connection-new',text('new'),'Plus','quiet',editable?'':'disabled')})}<div class="master-detail"><aside class="master" aria-label="${e(t('servers.serverList'))}"><div class="list-caption">${e(t('servers.projectServers'))} ${servers.length}</div>${servers.map(item=>{const entry=get(projectId,item);return `<button type="button" class="master-row ${item.id===server.id?'active':''}" data-action="select-server-config" data-server="${e(item.id)}"><strong>${e(item.name)}</strong><small class="mono">${e(entry.savedConfig.transport==='stdio'?entry.savedConfig.command:entry.savedConfig.url||text('newName'))}</small>${pill(entry)}</button>`;}).join('')}<div class="notice section-gap small">${icon('Info')}<span>${e(text('private'))}</span></div></aside><div class="detail server-detail"><form id="connection-prototype-form" class="detail-form" novalidate><header class="execution-header"><div class="detail-title"><h2 class="grow">${e(server.name)}</h2>${badge(d.transport==='stdio'?'stdio':'HTTP')}${b('export','safeExport','DownloadSimple')}</div>${nav(view)}</header><div class="execution-scroll" id="connection-panel" role="tabpanel" aria-labelledby="connection-view-${view}" tabindex="0">${commonStatus}${server.connected||d.status==='connecting'?notice(text('locked')):''}${diagnostic}${progress}${content}${Object.keys(d.errors).length?notice(text('fieldError'),'danger'):''}${d.exportOpen?`<section class="execution-section"><h3>${e(text('safeExport'))}</h3><p class="small muted">${e(text('exportHint'))}</p><pre>${e(JSON.stringify({server:{name:d.savedConfig.name,transport:d.savedConfig.transport,channel:d.savedConfig.channel,...(d.savedConfig.transport==='http'?{url:d.savedConfig.url}:{command:d.savedConfig.command,argumentsIncluded:false,directory:d.savedConfig.directory}),profile:d.savedConfig.profile,authentication:d.savedConfig.auth},credentialsIncluded:false},null,2))}</pre></section>`:''}</div><footer class="fixed-actions"><div class="toolbar">${view==='connection'?b('save','save','Check',d.dirty?'primary':'',disabled):button('connection-settings',t('execution.connectionConfig'),'','quiet')}${b('toggle',footerLabel,'Plug',view==='connection'&&!d.dirty?'primary':'',!runnable||d.status!=='connecting'&&(d.oauth==='waiting'||d.credential==='saving'||d.pairing)?'disabled':'')}</div><span class="small muted" role="status">${e(text(d.dirty?'unsaved':d.saved?'saved':'preview'))}</span></footer></form></div></div></section>`;
    }
    function applyProfile(projectId,server,profile){const d=get(projectId,server);if(server.connected||d.status==='connecting'||d.dirty)return false;server.profile=profile;d.profile=profile;d.savedConfig.profile=profile;d.revision++;return true;}
    return {applyProfile,setEndpointCheck:fn=>{endpointCheck=fn;},setEnvironmentCheck:fn=>{environmentCheck=fn;},get,render,input,action,toggle,save,finish,available,settings:(projectId,server)=>({...get(projectId,server).savedConfig}),dispose(){for(const id of jobs.values())unschedule(id);jobs.clear();}};
  }
};
