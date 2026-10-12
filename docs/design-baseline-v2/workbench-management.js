/* Page-form design interactions only. Drafts remain in memory and are scoped to a project. */
window.workbenchManagement = {
  create({escape: e, t, icon, button, badge, field, ui, profileLabel, roleLabel}) {
    const drafts = new Map();
    const key = (projectId, kind) => JSON.stringify([projectId, kind]);
    const ids = {
      invitation:['invite-email','invite-team-role','invite-project','invite-project-role'],
      variable:['variable-name','variable-scope','variable-type','variable-value','variable-secret','variable-id'],
    };
    function start(projectId, kind, {variable, profile, serverId} = {}) {
      const draft = kind === 'invitation'
        ? {'invite-email':'','invite-team-role':'Member','invite-project':projectId,'invite-project-role':'Developer'}
        : {'variable-name':variable?.name || '', 'variable-scope':variable?.scope || 'project', 'variable-type':variable?.type || 'string', 'variable-value':variable?.secret ? '' : typeof variable?.value === 'object' ? JSON.stringify(variable.value) : variable?.value ?? '', 'variable-secret':Boolean(variable?.secret),'variable-id':variable?.id || '', profile:variable?.profile || profile, serverId:variable?.serverId || serverId, originalSecret:Boolean(variable?.secret)};
      drafts.set(key(projectId,kind), {...draft,error:''});
      return draft;
    }
    function get(projectId, kind, defaults) {
      return drafts.get(key(projectId,kind)) || start(projectId,kind,defaults);
    }
    function capture(form) {
      if(!form || form.id !== 'management-form') return;
      const draft=drafts.get(key(form.dataset.project,form.dataset.kind));
      if(!draft) return;
      for(const id of ids[form.dataset.kind]) {
        const control=form.querySelector(`#${id}`);
        if(control) draft[id]=control.type==='checkbox' ? control.checked : control.value;
      }
    }
    const select = (id, label, value, options, description='', full=false) => `<div class="field ${full ? 'full' : ''}"><label for="${id}">${e(label)}</label><select id="${id}">${options.map(([option,text])=>`<option value="${e(option)}" ${value===option ? 'selected' : ''}>${e(text)}</option>`).join('')}</select>${description ? `<span class="description">${e(description)}</span>` : ''}</div>`;
    const contextRow = (label, value) => `<div><dt>${e(label)}</dt><dd>${e(value)}</dd></div>`;
    function render({projectId, kind, project, projects, server, profile, editable}) {
      const draft=get(projectId,kind,{profile,serverId:server.id});
      const invitation=kind==='invitation';
      const title=t(invitation ? 'common.inviteTeamMember' : draft['variable-id'] ? 'environment.editVariable' : 'environment.addVariable');
      const selectedProject=projects.find(item=>item.id===draft['invite-project']) || project;
      const back=button('management-back',t(invitation ? 'management.backMembers' : 'management.backEnvironment'),'ArrowLeft','quiet');
      const error=draft.error ? t(draft.error) : '';
      return `<section class="page management-page management-editor"><div>${back ? `<div class="management-back">${back}</div>` : ''}${ui.pageHeading({title,description:t(invitation ? 'management.inviteDescription' : 'management.variableDescription'),glyph:invitation ? 'UserPlus' : 'BracketsCurly'})}</div><form id="management-form" data-kind="${kind}" data-project="${e(projectId)}" class="management-page-form"><div class="management-editor-scroll"><div class="management-editor-grid"><div class="management-editor-fields"><fieldset class="management-fieldset" ${editable ? '' : 'disabled'}>
      <section class="form-section">${ui.sectionHeading({index:'01',title:t(invitation ? 'management.invitee' : 'management.variableDefinition'),description:t(invitation ? 'management.inviteeHint' : 'management.variableDescription')})}<div class="fields">${invitation ? field('invite-email',`${e(t('common.email'))} <span class="required">*</span>`,draft['invite-email'],'','required type="email" data-full placeholder="name@company.com" autocomplete="off"') : `${field('variable-name',`${e(t('environment.variableName'))} <span class="required">*</span>`,draft['variable-name'],'',`required data-full placeholder="API_BASE_URL" autocomplete="off" ${draft.error==='common.invalidVariableNameStartWithA' ? 'aria-invalid="true" aria-describedby="dialog-error"' : ''}`)}${select('variable-scope',t('environment.scope'),draft['variable-scope'],[['project',t('common.project')],['server',`${t('management.serverScope')} · ${server.name}`]])}${select('variable-type',t('environment.valueType'),draft['variable-type'],['string','number','boolean','json'].map(type=>[type,type]))}`}</div></section>
      <section class="form-section">${ui.sectionHeading({index:'02',title:t(invitation ? 'management.access' : 'management.variableValue'),description:t(invitation ? 'management.accessHint' : 'management.variableValueHint')})}<div class="fields">${invitation ? `${select('invite-team-role',t('common.teamRole'),draft['invite-team-role'],[['Member',roleLabel('Member')],['Admin',roleLabel('Admin')]],t('common.membersCanAccessOnlyAuthorizedProjects'),true)}${select('invite-project',t('common.initialProject'),draft['invite-project'],projects.map(item=>[item.id,item.name]))}${select('invite-project-role',t('common.projectRole'),draft['invite-project-role'],['Developer','Viewer','Maintainer'].map(role=>[role,roleLabel(role)]))}` : `<div class="field full"><label for="variable-value">${e(t(draft.originalSecret ? 'environment.replaceSecretValue' : 'environment.variableValue'))}</label>${!draft['variable-secret'] && draft['variable-type']==='json' ? `<textarea id="variable-value" ${draft.error==='common.theValueDoesNotMatchThe' ? 'aria-invalid="true" aria-describedby="dialog-error"' : ''} class="mono management-json" spellcheck="false">${e(draft['variable-value'])}</textarea>` : `<input id="variable-value" ${draft.error==='common.theValueDoesNotMatchThe' ? 'aria-invalid="true" aria-describedby="dialog-error"' : ''} class="mono" type="${draft['variable-secret'] ? 'password' : 'text'}" value="${e(draft['variable-value'])}" autocomplete="off" spellcheck="false">`}${draft.originalSecret ? `<span class="description">${e(t('environment.leaveBlankToKeepTheStored'))}</span>` : ''}</div><label class="management-secret field full"><span><strong>${e(t('management.secretLabel'))}</strong><small>${e(t('management.secretHint'))}</small></span><input id="variable-secret" type="checkbox" ${draft['variable-secret'] ? 'checked' : ''}></label><input id="variable-id" type="hidden" value="${e(draft['variable-id'])}">`}</div></section></fieldset><p id="dialog-error" class="error small management-form-error" role="alert">${e(error)}</p>${editable ? '' : `<p class="notice">${e(t('management.readOnly'))}</p>`}</div>
      <aside class="management-summary" aria-label="${e(t(invitation ? 'management.accessPreview' : 'management.variableContext'))}"><header>${icon(invitation ? 'Users' : 'BracketsCurly')}<h2>${e(t(invitation ? 'management.accessPreview' : 'management.variableContext'))}</h2></header>${invitation ? `<div class="access-role"><span>${e(t('common.teamRole'))}</span><strong>${e(roleLabel(draft['invite-team-role']))}</strong><p>${e(t(draft['invite-team-role']==='Admin' ? 'management.adminAccess' : 'management.memberAccess'))}</p></div><div class="access-role"><span>${e(selectedProject.name)}</span><strong>${e(roleLabel(draft['invite-project-role']))}</strong><p>${e(t(draft['invite-project-role']==='Viewer' ? 'management.viewerAccess' : draft['invite-project-role']==='Maintainer' ? 'management.maintainerAccess' : 'management.developerAccess'))}</p></div><dl class="management-context">${contextRow(t('management.team'),t('common.engineering'))}${contextRow(t('management.validity'),t('management.sevenDays'))}</dl><p class="small muted">${e(t('management.expiryHint'))}</p>` : `<dl class="management-context">${contextRow(t('common.project'),project.name)}${contextRow(t('runs.environment'),profileLabel(draft.profile))}${contextRow(t('environment.scope'),draft['variable-scope']==='server' ? server.name : t('common.project'))}${contextRow(t('environment.valueType'),draft['variable-type'])}</dl><p class="small muted">${e(t('management.variableHint',{reference:'{{VARIABLE_NAME}}'}))}</p>${draft['variable-secret'] ? `<div class="summary-sensitive">${icon('EyeSlash')}${badge(t('management.protected'))}</div>` : ''}`}</aside>
      </div></div><footer class="fixed-actions management-form-footer"><span class="small muted grow">${e(t(invitation ? 'management.invitationPreviewOnly' : 'management.unsaved'))}</span>${button('management-back',t('common.cancel'),'','quiet')}<button type="submit" class="btn primary" data-submit="${invitation ? 'create-invite' : 'save-variable'}" ${editable ? '' : 'disabled'}>${icon(invitation ? 'UserPlus' : 'Check')}${e(t(invitation ? 'common.createExampleInvitation' : 'management.saveVariable'))}</button></footer></form></section>`;
    }
    return {start,get,capture,render,clear:(projectId,kind)=>drafts.delete(key(projectId,kind)),setError:(projectId,kind,error)=>{get(projectId,kind).error=error;}};
  },
};
