/* Throwaway interaction model: values and state are memory-only, secrets are fixtures only. */
window.workbenchEnvironments = {
  layers:['baseProject','envProject','baseServer','envServer'],
  resolve(variables,profile,serverId,secretAvailable=variable=>variable.secretPresent!==false,requirements=[]) {
    const rank=v=>(v.scope==='server'?2:0)+(v.profile==='基础配置'?0:1);
    const candidates=variables.filter(v=>(v.profile==='基础配置'||v.profile===profile)&&(v.scope==='project'||v.serverId===serverId));
    const references=[];
    function collect(value,owner){if(typeof value==='string')for(const match of value.matchAll(/\{\{([A-Za-z_][A-Za-z0-9_.-]*)\}\}/g))references.push({name:match[1],kind:'reference',owner});else if(value&&typeof value==='object')for(const child of Object.values(value))collect(child,owner);}
    // Only references from effective definitions participate in preflight.
    const winners=new Map();for(const variable of candidates)if(!winners.has(variable.name)||rank(variable)>rank(winners.get(variable.name)))winners.set(variable.name,variable);
    references.length=0;for(const variable of winners.values())if(!variable.secret)collect(variable.value,variable.name);
    const allUses=[...requirements,...references];
    const names=[...new Set([...candidates.map(v=>v.name),...allUses.map(r=>r.name)])].sort();
    const stacks=new Map(names.map(name=>[name,candidates.filter(v=>v.name===name).sort((a,b)=>rank(b)-rank(a))]));
    const cache=new Map();
    function read(name,path=[]) {
      if(path.includes(name))return {error:'cycle',secret:false};
      if(cache.has(name))return cache.get(name);
      const winner=stacks.get(name)?.[0];
      if(!winner)return {error:'missingDefinition',secret:false};
      let result={value:winner.value,secret:Boolean(winner.secret),error:''};
      if(winner.secret)result={value:undefined,secret:true,error:secretAvailable(winner)?'':'missingSecret'};
      else {
        function interpolate(value){
          if(typeof value==='string')return value.replace(/\{\{([A-Za-z_][A-Za-z0-9_.-]*)\}\}/g,(match,name)=>{const dependency=read(name,[...path,winner.name]);if(dependency.secret)result.secret=true;if(dependency.error){result.error=dependency.error==='cycle'?'cycle':'dependency';return match;}if(dependency.secret){result.secret=true;return '';}return typeof dependency.value==='object'?JSON.stringify(dependency.value):String(dependency.value);});
          if(Array.isArray(value))return value.map(interpolate);
          if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,child])=>[key,interpolate(child)]));
          return value;
        }
        result.value=interpolate(winner.value);if(result.secret)result.value=undefined;
      }
      if(!result.error&&(winner.required||requirements.some(r=>r.name===name))&&!result.secret&&(result.value===null||result.value===undefined||typeof result.value==='string'&&!result.value.trim()))result.error='emptyRequired';
      cache.set(name,result);return result;
    }
    return names.map(name=>({name,stack:stacks.get(name),winner:stacks.get(name)?.[0],...read(name),uses:allUses.filter(r=>r.name===name)}));
  },
  create({escape:e,t,icon,button,badge,ui,profileLabel,execution}) {
    const views=new Map(), secrets=new Map();let sequence=0;
    const key=c=>JSON.stringify([c.projectId,c.server.id,c.profile]);
    const secretKey=(c,v)=>JSON.stringify([c.projectId,v.id,'current-user']);
    const view=c=>{const k=key(c);if(!views.has(k))views.set(k,{scope:'preview',search:'',filter:'all',selected:'',editor:null,message:'',confirm:'',reveal:false,exportOpen:false});return views.get(k);};
    const secret=(c,v)=>{const k=secretKey(c,v);if(!secrets.has(k))secrets.set(k,{present:v.secretPresent!==false,storage:'local',backup:'off',version:1});return secrets.get(k);};
    function requirements(c) {
      const d=execution.get(c.projectId,c.server),settings=execution.settings(c.projectId,c.server),items=[];
      if(settings.transport==='http'&&settings.auth==='bearer'&&d.source==='environment')items.push({name:d.reference,kind:'authorization'});
      const sources=settings.transport==='stdio'?[[settings.command,'command'],[settings.args,'command']]:settings.headerName?[[settings.headerRef,'header']]:[];
      for(const [source,kind] of sources)for(const match of String(source||'').matchAll(/\{\{([A-Za-z_][A-Za-z0-9_.-]*)\}\}/g))items.push({name:match[1],kind});
      return items;
    }
    const resolved=c=>window.workbenchEnvironments.resolve(c.data.variables,c.profile,c.server.id,v=>secret(c,v).present,requirements(c));
    const layer=v=>window.workbenchEnvironments.layers[(v.scope==='server'?2:0)+(v.profile==='基础配置'?0:1)];
    const source=v=>`${profileLabel(v.profile)} · ${t('env.'+v.scope)}`;
    const textValue=v=>v.secret?t('env.present'):v.value===''?t('env.empty'):typeof v.value==='object'?JSON.stringify(v.value):String(v.value??'');
    const b=(action,label,extra='',variant='',glyph='')=>button('env-'+action,e(t('env.'+label)),glyph,variant,extra);
    const attr=(id,name='id')=>`data-${name}="${e(id)}"`;
    const note=(content,tone='')=>`<div class="env-notice ${tone}" role="status">${icon(tone==='error'?'WarningCircle':'Info')}<span>${content}</span></div>`;
    function start(c,variable,override=false,name='') {
      const s=view(c),scope=override?(s.scope==='project'?'project':'server'):variable?.scope||(s.scope==='project'?'project':'server');
      s.editor={id:override?'':variable?.id||'',name:variable?.name||name,scope,profile:override?c.profile:variable?.profile||c.profile,serverId:variable?.serverId||c.server.id,type:variable?.type||'string',value:variable?.secret?'':variable?typeof variable.value==='object'?JSON.stringify(variable.value):String(variable.value??''):'',secret:Boolean(variable?.secret),originalSecret:Boolean(variable?.secret),required:Boolean(variable?.required),secretLoaded:Boolean(variable?.secret&&!override&&secret(c,variable).present),storage:variable?.secret?secret(c,variable).storage:'session',error:''};
      s.message='';s.confirm='';s.reveal=false;
    }
    function save(c) {
      const s=view(c),d=s.editor;if(!d||(!c.editable&&!(d.personalOnly&&c.runnable)))return false;
      if(d.conflict){d.error='conflict';return false;}
      if(!/^[A-Za-z_][A-Za-z0-9_.-]{0,127}$/.test(d.name.trim())){d.error='invalidName';return false;}
      if(c.data.variables.some(v=>v.id!==d.id&&v.name===d.name.trim()&&v.profile===d.profile&&v.scope===d.scope&&(v.scope==='project'||v.serverId===d.serverId))){d.error='duplicate';return false;}
      let value=d.value;
      if(!d.secret){try{if(d.type!=='string')value=JSON.parse(d.value);if(d.type==='number'&&(typeof value!=='number'||!Number.isFinite(value))||d.type==='boolean'&&typeof value!=='boolean')throw Error();}catch{d.error='invalidType';return false;}}
      if(d.secret&&d.secretLoaded&&d.storage==='local'&&execution.get(c.projectId,c.server).device!=='paired'){d.error='agentNeeded';return false;}
      if(d.personalOnly){const variable=c.data.variables.find(v=>v.id===d.id);if(!variable?.secret)return false;const stored=secret(c,variable);if(d.secretChanged&&stored.backup!=='off')stored.backup='stale';stored.present=d.secretLoaded;stored.storage=d.storage;s.editor=null;s.selected=variable.name;s.message='saved';return true;}
      const variable={id:d.id||`env-variable-${++sequence}`,name:d.name.trim(),scope:d.scope,serverId:d.scope==='server'?d.serverId:null,profile:d.profile,source:d.profile,type:d.secret?'string':d.type,value:d.secret?null:value,secret:d.secret,secretPresent:d.secretLoaded,required:d.required};
      c.data.variables=c.data.variables.filter(v=>v.id!==variable.id);c.data.variables.push(variable);
      if(d.secret){const stored=secret(c,variable);if(d.secretChanged&&stored.backup!=='off')stored.backup='stale';stored.present=d.secretLoaded;stored.storage=d.storage;}
      s.editor=null;s.selected=variable.name;s.message='saved';return true;
    }
    function input(target,c) {
      const name=target.dataset.environment;if(!name)return false;
      const s=view(c),d=s.editor;
      if(name==='search'||name==='filter'){s[name]=target.value;return true;}
      if(!d||(!c.editable&&!(d.personalOnly&&c.runnable)))return true;
      if(d.personalOnly&&name!=='storage')return true;
      if(name==='secret'&&d.originalSecret)return true;
      d[name]=target.type==='checkbox'?target.checked:target.value;d.error='';
      if(name==='secret'){d.value='';d.secretLoaded=false;if(d.secret)d.type='string';}
      return true;
    }
    function action(action,element,c) {
      if(!action.startsWith('env-'))return false;
      const s=view(c),id=element.dataset.id,rows=resolved(c),row=rows.find(r=>r.name===s.selected),v=c.data.variables.find(v=>v.id===id)||row?.winner;
      action=action.slice(4);
      if(!['save','apply'].includes(action))s.message='';
      if(action==='clear-filter'){s.search='';s.filter='all';}
      if(action==='scope'){s.scope=id;s.selected='';s.confirm='';s.reveal=false;}
      if(action==='inspect'){s.selected=id;s.confirm='';s.reveal=false;}
      if(action==='close'){s.selected='';s.confirm='';s.reveal=false;}
      if(action==='check'){s.scope='validation';s.selected='';s.reveal=false;}
      if(action==='export')s.exportOpen=!s.exportOpen;
      if(action==='cancel'){s.editor=null;s.confirm='';}
      if(action==='apply'&&c.runnable){s.message='';if(c.server.connected||execution.get(c.projectId,c.server).status==='connecting')return true;if(execution.get(c.projectId,c.server).dirty)s.message='dirtyConfig';else if(rows.some(r=>r.error)){s.scope='validation';s.message='blocked';}else{execution.applyProfile(c.projectId,c.server,c.profile);s.message='applied';}}
      if(action==='fix'&&!c.editable&&c.runnable){const target=rows.find(r=>r.name===id);if(target?.winner?.secret){start(c,target.winner);s.editor.personalOnly=true;}}
      if(action==='personal-edit'&&v?.secret&&c.runnable){start(c,v);s.editor.personalOnly=true;}
      if(action==='load'&&s.editor&&c.runnable){s.editor.secretLoaded=true;s.editor.secretChanged=true;s.editor.error='';}
      if(action==='save')save(c);
      if(c.editable){
      if(action==='new')start(c);
      if(action==='edit'&&v)start(c,v);
      if(action==='override'&&v)start(c,v,true);
      if(action==='fix'){const target=rows.find(r=>r.name===id);start(c,target?.winner,false,id);if(!target?.winner&&target?.uses.length){s.editor.required=true;if(target.uses.some(u=>u.kind==='authorization')){s.editor.secret=true;s.editor.originalSecret=true;}}}
      if(action==='delete'&&v)s.confirm='delete';
      if(action==='delete-confirm'&&v){c.data.variables=c.data.variables.filter(x=>x.id!==v.id);secrets.delete(secretKey(c,v));s.confirm='';s.message='saved';}
      }
      if(v?.secret&&c.runnable){const stored=secret(c,v);
        if(action==='reveal')s.reveal=!s.reveal;
        if(action==='restore'&&stored.backup==='ready')s.confirm='restore';
        if(action==='restore-confirm'&&stored.backup==='ready'){if(stored.storage==='local'&&execution.get(c.projectId,c.server).device!=='paired')s.message='agentNeeded';else{stored.present=true;s.confirm='';}}
        if(action==='clear')s.confirm='clear';
        if(action==='clear-confirm'){stored.present=false;s.reveal=false;s.confirm='';}
        if(action==='backup'&&stored.present)s.confirm='backup';
        if(action==='backup-confirm'&&stored.present){stored.backup='pending';s.confirm='';}
        if(action==='backup-success'&&stored.backup==='pending')stored.backup='ready';
        if(action==='backup-failure'&&stored.backup==='pending')stored.backup='failed';
        if(action==='backup-retry'&&stored.present)stored.backup='pending';
        if(action==='backup-remove')s.confirm='backupRemove';
        if(action==='backup-remove-confirm'){stored.backup='off';s.confirm='';}
      }
      return true;
    }
    const control=(name,label,value,options,disabled=false)=>`<div class="field"><label for="env-${name}">${e(t('env.'+label))}</label><select id="env-${name}" data-environment="${name}" ${disabled?'disabled':''}>${options.map(([val,text])=>`<option value="${e(val)}" ${value===val?'selected':''}>${e(text)}</option>`).join('')}</select></div>`;
    function editor(c) {
      const s=view(c),d=s.editor,disabled=c.editable||d.personalOnly&&c.runnable?'':'disabled';
      return `<section class="page management-page management-editor env-page"><div><div class="management-back">${b('cancel','back','','quiet','ArrowLeft')}</div>${ui.pageHeading({title:t(d.personalOnly?'env.personalEditor':d.id?'environment.editVariable':'env.add'),description:t('env.editorHint'),glyph:'BracketsCurly'})}</div><form id="environment-editor" novalidate class="management-page-form"><div class="management-editor-scroll"><div class="management-editor-grid"><div class="management-editor-fields"><fieldset class="management-fieldset" ${disabled}><section class="form-section">${ui.sectionHeading({index:'01',title:t('env.definition')})}<div class="fields"><div class="field full"><label for="env-name">${e(t('env.name'))} <span class="required">*</span></label><input id="env-name" class="mono" data-environment="name" ${d.personalOnly?'readonly':''} value="${e(d.name)}" placeholder="API_BASE_URL" autocomplete="off" ${['invalidName','duplicate'].includes(d.error)?'aria-invalid="true" aria-describedby="env-error"':''}></div>${control('scope','scope',d.scope,['project','server'].map(x=>[x,t('env.'+x)]),Boolean(d.id))}${control('type','type',d.type,['string','number','boolean','json'].map(x=>[x,x]),d.secret)}</div></section><section class="form-section">${ui.sectionHeading({index:'02',title:t('env.valueLabel'),description:t('env.'+(d.secret?'secretHint':'valueHint'))})}<label class="env-check"><input id="env-secret" data-environment="secret" type="checkbox" ${d.secret?'checked':''} ${d.originalSecret?'disabled':''}>${e(t('env.secretOn'))}</label>${d.secret?`<div class="env-secret-preview">${icon('EyeSlash')}<span>${e(t('env.'+(d.secretLoaded?'present':'missing')))}</span>${b('load',d.secretLoaded?'replace':'load','','quiet')}</div>${control('storage','location',d.storage,['session','local'].map(x=>[x,t('env.'+x)]))}<p class="description">${e(t('env.personal'))}</p>`:`<div class="field"><label for="env-value">${e(t('env.valueLabel'))}</label>${d.type==='json'?`<textarea id="env-value" data-environment="value" class="mono management-json" spellcheck="false" ${d.error==='invalidType'?'aria-invalid="true" aria-describedby="env-error"':''}>${e(d.value)}</textarea>`:`<input id="env-value" data-environment="value" class="mono" value="${e(d.value)}" autocomplete="off" spellcheck="false" ${d.error==='invalidType'?'aria-invalid="true" aria-describedby="env-error"':''}>`}</div>`}<label class="env-check"><input id="env-required" data-environment="required" type="checkbox" ${d.personalOnly?'disabled':''} ${d.required?'checked':''}>${e(t('env.required'))}</label></section></fieldset>${d.error?`<p class="env-error" id="env-error" role="alert">${e(t('env.'+d.error))}</p>`:''}</div><aside class="management-summary"><header>${icon('BracketsCurly')}<h2>${e(t('env.context'))}</h2></header><dl class="management-context"><div><dt>${e(t('common.project'))}</dt><dd>${e(c.project.name)}</dd></div><div><dt>${e(t('env.profile'))}</dt><dd>${e(profileLabel(d.profile))}</dd></div><div><dt>${e(t('env.scope'))}</dt><dd>${e(t('env.'+d.scope))}</dd></div>${d.scope==='server'?`<div><dt>${e(t('env.serverLabel'))}</dt><dd>${e(c.server.name)}</dd></div>`:''}</dl><p>${e(t('env.editorHint'))}</p>${d.secret?`<p>${e(t('env.stored'))}</p>`:''}</aside></div></div><footer class="fixed-actions management-form-footer"><span class="small muted grow">${e(t('env.unsaved'))}</span>${b('cancel','cancel','','quiet')}<button type="submit" class="btn primary" ${disabled}>${icon('Check')}${e(t('env.save'))}</button></footer></form></section>`;
    }
    function detail(c,row) {
      if(!row)return '';const s=view(c),v=row.winner,locked=c.editable?'':'disabled';
      return `<section class="env-inspector" aria-label="${e(t('env.selection'))}"><header><div class="grow"><span class="small muted">${e(t('env.selection'))}</span><h3><code>${e(row.name)}</code></h3></div>${b('close','close','','quiet','X')}</header>${row.error?note(e(t('env.'+row.error)),'error'):''}<ol class="env-chain">${[3,2,1,0].filter(i=>c.profile!=='基础配置'||i%2===0).map(i=>{const item=row.stack.find(v=>window.workbenchEnvironments.layers[i]===layer(v));return `<li class="${item===v?'is-effective':''}"><span class="env-rank">${i+1}</span><span>${e(t('env.'+window.workbenchEnvironments.layers[i]))}</span><code>${item?item.secret?'••••••••':e(textValue(item)):e(t('env.absent'))}</code>${badge(t('env.'+(!item?'absent':item===v?'effective':'overridden')),item&&item===v?'success':'')}</li>`;}).join('')}</ol><p class="small muted">${e(t('env.referencesHint'))}</p>${v?.profile!==c.profile&&v?note(e(t('env.inheritedHint'))):''}<div class="env-detail-actions">${v?`${b('edit','edit',`${attr(v.id)} ${locked}`,'','PencilSimple')}${b('override','override',`${attr(v.id)} ${locked} ${v.profile===c.profile&&v.scope==='server'?'disabled':''}`)}${b('delete','delete',`${attr(v.id)} ${locked}`,'quiet','Trash')}`:b('fix','fix',`${attr(row.name)} ${locked}`,'primary','Plus')}</div>${v?.secret?secretPanel(c,v):''}${s.confirm==='delete'?note(`${e(t('env.deleteHint'))}<div class="env-detail-actions">${b('delete-confirm','confirmDelete',`${attr(v.id)} ${locked}`,'danger')}${b('cancel','cancel','','quiet')}</div>`):''}</section>`;
    }
    function secretPanel(c,v) {
      const s=view(c),stored=secret(c,v),locked=c.runnable?'':'disabled';
      const status={off:'backupOff',pending:'backupPending',ready:'backupReady',failed:'backupFailed',stale:'backupStale'}[stored.backup];
      const confirmation={restore:['restoreHint','restore-confirm','restoreConfirm'],clear:['clearHint','clear-confirm','confirmClear'],backup:['backupConfirmHint','backup-confirm','backupConfirm'],backupRemove:['backupRemoveHint','backup-remove-confirm','backupRemoveConfirm']}[s.confirm];
      return `<div class="env-secret-manager"><h3>${icon('EyeSlash')}${e(t('env.secretManager'))}</h3><p class="small muted">${e(t('env.personal'))} · ${e(t('env.'+stored.storage))}</p><div class="env-secret-preview"><code>${stored.present?s.reveal&&c.runnable?e(t('env.demoValue')):'••••••••':e(t('env.missing'))}</code>${b('reveal',s.reveal?'hide':'reveal',`${!stored.present?'disabled':locked}`,'quiet')}${b('personal-edit','replace',`${attr(v.id)} ${locked}`,'quiet')}${b('clear','clear',`${!stored.present?'disabled':locked}`,'quiet')}</div><div class="env-backup"><div class="grow"><strong>${e(t('env.backup'))}</strong><p>${e(t('env.backupHint'))}</p></div>${badge(t('env.'+status),stored.backup==='failed'?'warning':stored.backup==='ready'?'success':'')}</div><div class="env-detail-actions">${stored.backup==='off'?b('backup','backupStart',`${!stored.present?'disabled':locked}`):stored.backup==='pending'?`${b('backup-success','backupSuccess',locked)}${b('backup-failure','backupFailure',locked,'quiet')}`:stored.backup!=='ready'?b('backup-retry','retry',`${!stored.present?'disabled':locked}`):''}${!stored.present&&stored.backup==='ready'?b('restore','restore',locked):''}${stored.backup!=='off'?b('backup-remove','backupRemove',locked,'quiet'):''}</div>${confirmation?note(`${e(t('env.'+confirmation[0]))}<div class="env-detail-actions">${b(confirmation[1],confirmation[2],locked)}${b('cancel','cancel','','quiet')}</div>`):''}</div>`;
    }
    function render(c) {
      const s=view(c);if(s.editor)return editor(c);
      if(!c.server.id)return `<section class="page settings-page"><p>${e(t('env.noServer'))}</p></section>`;
      const rows=resolved(c),issues=rows.filter(r=>r.error),locked=c.editable?'':'disabled';
      const match=r=>(!s.search||r.name.toLowerCase().includes(s.search.toLowerCase()))&&(s.filter==='all'||s.filter==='missing'&&r.error||s.filter==='secret'&&r.secret||s.filter==='override'&&r.stack.length>1);
      const list=s.scope==='project'||s.scope==='server'?rows.flatMap(r=>r.stack.filter(v=>v.scope===s.scope).map(v=>({...r,winner:v,definition:true,secret:v.secret,value:v.value,error:v.secret&&!secret(c,v).present?'missingSecret':v.required&&(v.value===''||v.value===null)&&!v.secret?'emptyRequired':''}))):rows;
      const filtered=list.filter(match);
      const table=`<div class="table-wrap"><table class="variable-table env-table"><thead><tr>${['name','value','type','source','actions'].map(k=>`<th scope="col">${e(t('env.'+k))}</th>`).join('')}</tr></thead><tbody>${filtered.map(r=>`<tr class="${s.selected===r.name?'is-selected':''}"><td><code class="variable-name">${e(r.name)}</code>${r.winner?.required?'<span class="required"> *</span>':''}</td><td>${r.error?badge(t('env.'+r.error),'warning'):r.secret?`<span class="env-masked">${icon('EyeSlash')}••••••••</span>`:`<code class="env-value">${e(textValue(r))}</code>`}</td><td>${badge(r.secret?t('env.secret'):r.winner?.type||'—')}</td><td>${b('inspect','inspect',`${attr(r.name)} aria-label="${e(t('env.inspect')+' '+r.name)}"`,'quiet')}<small class="env-source-label">${r.winner?e(source(r.winner)):'—'}${r.stack.length>1?' · '+e(t('env.hasOverrides')):''}</small></td><td>${r.winner?b('edit','edit',`${attr(r.winner.id)} ${locked} aria-label="${e(t('env.edit')+' '+r.name+' '+profileLabel(r.winner.profile))}"`,'quiet','PencilSimple'):b('fix','fix',`${attr(r.name)} ${locked}`,'quiet','Plus')}</td></tr>`).join('')||`<tr><td colspan="5"><div class="env-empty">${icon('MagnifyingGlass')}<strong>${e(t(list.length?'env.noResults':'states.noVariables'))}</strong><p>${e(t(list.length?'env.noResultsHint':'states.envEmpty'))}</p>${list.length?button('env-clear-filter',e(t('states.clear')),'','quiet'):b('new','add',locked,'quiet')}</div></td></tr>`}</tbody></table></div>`;
      return `<section class="page management-page environment-page env-page">${ui.pageHeading({title:t('common.environment'),description:t('env.description'),glyph:'BracketsCurly',actions:b('new','add',locked,'primary','Plus')})}<div class="master-detail"><aside class="master" aria-label="${e(t('environment.environments'))}"><div class="list-caption">${e(t('environment.environments'))}</div>${c.data.profiles.map(profile=>`<button type="button" class="master-row ${c.profile===profile?'active':''}" data-action="select-profile" data-profile="${e(profile)}" aria-pressed="${c.profile===profile}"><strong>${e(profileLabel(profile))}</strong><small>${e(t(profile==='基础配置'?'common.baseVariablesForAllEnvironments':'common.inheritsBaseConfiguration'))}</small>${c.server.profile===profile?badge(t('common.activeForThisSession'),'success'):''}</button>`).join('')}<div class="master-footnote">${icon('BracketsCurly')}<p>${e(t('env.applyHint'))}</p></div></aside><section class="environment-detail"><header class="management-detail-header"><div class="detail-title"><div class="grow"><h2>${e(profileLabel(c.profile))}</h2><p class="small muted">${e(c.project.name)} · ${e(c.server.name)}</p></div>${badge(t(c.profile===c.server.profile?'common.activeForThisSession':'env.previewOnly'),c.profile===c.server.profile?'success':'')}${b('apply','apply',`${!c.runnable||c.server.connected||execution.get(c.projectId,c.server).status==='connecting'||c.server.profile===c.profile?'disabled':''}`,'','Check')}</div><nav class="tabnav" aria-label="${e(t('environment.variableScope'))}">${['preview','project','server','validation'].map(scope=>`<button type="button" data-action="env-scope" data-id="${scope}" aria-pressed="${s.scope===scope}">${e(t('env.'+scope))}${scope==='validation'&&issues.length?`<span class="env-count">${issues.length}</span>`:''}</button>`).join('')}</nav></header><div class="environment-scroll">${s.message?note(e(t('env.'+s.message)),['blocked','dirtyConfig'].includes(s.message)?'error':''):''}<div class="env-health"><span class="env-health-icon ${issues.length?'warning':''}">${icon(issues.length?'WarningCircle':'Check')}</span><div class="grow"><strong>${e(t('env.'+(issues.length?'problems':'ready'),{count:issues.length}))}</strong><p>${e(t('env.'+(s.scope==='validation'?'issuesHint':s.scope==='preview'?'previewHint':'scopeHint')))}</p></div>${b('check','check','','quiet')}</div>${s.scope==='preview'?`<div class="env-precedence"><span>${e(t('env.hierarchy'))}</span><div>${window.workbenchEnvironments.layers.filter((_,i)=>c.profile!=='基础配置'||i%2===0).map((x,i)=>`${i?'<span aria-hidden="true">→</span>':''}<span>${e(t('env.'+x))}</span>`).join('')}</div></div>`:''}${s.scope==='validation'?`<section class="env-validation"><h3>${e(t('env.validation'))}</h3>${rows.filter(r=>r.error||r.uses.length||r.winner?.required).map(r=>`<div class="env-issue"><span class="${r.error?'error':'muted'}">${icon(r.error?'WarningCircle':'Check')}</span><div class="grow"><strong><code>${e(r.name)}</code></strong><p>${e(t('env.'+(r.error||'ready')))} · ${e(r.uses.map(u=>t('env.'+u.kind)+(u.owner?' · '+u.owner:'')).join(' / ')||t('env.'+(r.winner?.required?'requiredSource':'reference')))}</p></div>${r.error?b('fix',r.winner?'repair':'fix',`${attr(r.name)} ${r.winner?.secret&&c.runnable?'':locked}`,'quiet'):b('inspect','inspect',attr(r.name),'quiet')}</div>`).join('')||note(e(t('env.readyHint')))}</section>`:`<div class="env-filterbar"><input id="env-search" type="search" data-environment="search" aria-label="${e(t('env.search'))}" placeholder="${e(t('env.search'))}" value="${e(s.search)}"><select id="env-filter" data-environment="filter" aria-label="${e(t('env.all'))}">${[['all','all'],['missing','missingOnly'],['secret','secretOnly'],['override','overrideOnly']].map(([value,label])=>`<option value="${value}" ${s.filter===value?'selected':''}>${e(t('env.'+label))}</option>`).join('')}</select><span class="small muted">${e(t('env.'+(s.scope==='preview'?'count':'definedCount'),{count:filtered.length}))}</span></div>${table}`}${detail(c,rows.find(r=>r.name===s.selected))}${c.server.connected?note(e(t('env.connectedHint'))):''}${!c.editable?note(e(t('env.readOnly'))):''}<div class="env-bottom"><span>${e(t('env.secretHint'))}</span>${b('export','export','','quiet')}</div>${s.exportOpen?`<section class="env-snapshot"><h3>${e(t('env.snapshot'))}</h3><p class="small muted">${e(t('env.snapshotHint'))}</p><pre>${e(JSON.stringify(rows.map(r=>({name:r.name,type:r.winner?.type,source:r.winner?source(r.winner):null,...(r.secret?{secret:true,reference:'{{'+r.name+'}}'}:{value:r.value}),status:r.error||'ready'})),null,2))}</pre></section>`:''}</div></section></div></section>`;
    }
    return {render,action,input,view,secret,requirements,resolved,start,save,conceal:()=>{for(const s of views.values())s.reveal=false;},issues:c=>resolved(c).filter(r=>r.error)};
  }
};
