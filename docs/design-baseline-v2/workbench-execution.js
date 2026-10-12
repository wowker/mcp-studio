/* Design-only execution settings. No process, network, pairing or vault operations. */
window.workbenchExecution = {
  create({escape: e, t, icon, button, badge, ui}) {
    const drafts = new Map();
    const key = (projectId, server) => JSON.stringify([projectId, server.id]);
    const defaults = () => ({transport:'http', channel:'agent', storage:'local', backup:false, command:'npx', args:'["-y", "@modelcontextprotocol/server-filesystem", "/workspace/docs"]', directory:'/workspace', device:'unpaired', pairing:false, saved:false, error:''});
    const get = (projectId, server) => {
      const id = key(projectId, server);
      if (!drafts.has(id)) drafts.set(id, {...defaults(),device:server.connected ? 'paired' : 'unpaired'});
      return drafts.get(id);
    };
    const row = (name, value, title, description, selected, disabled = false) => `<label class="execution-option ${selected ? 'selected' : ''} ${disabled ? 'disabled' : ''}"><input type="radio" name="${name}" value="${value}" data-execution="${name}" ${selected ? 'checked' : ''} ${disabled ? 'disabled' : ''}><span><strong>${e(title)}</strong><small>${e(description)}</small></span></label>`;
    function render({projectId, server, servers, editable, runnable}) {
      const draft = get(projectId, server), locked = !editable || server.connected;
      const disabled = locked ? 'disabled' : '';
      const agent = draft.channel === 'agent';
      const status = draft.device === 'paired' ? 'paired' : draft.device === 'offline' ? 'offline' : 'unpaired';
      return `<section class="page management-page execution-page">${ui.pageHeading({title:t('common.servers'),description:t('management.serversDescription'),glyph:'HardDrives',actions:badge(t('execution.prototype'),'warning')})}<div class="master-detail"><aside class="master" aria-label="${e(t('servers.serverList'))}"><div class="list-caption">${e(t('servers.projectServers'))} ${servers.length}</div>${servers.map(item => `<button type="button" class="master-row ${item.id === server.id ? 'active' : ''}" data-action="select-server-config" data-server="${e(item.id)}"><strong>${e(item.name)}</strong><small>${e(item.url)}</small>${badge(item.connected ? t('common.mySessionIsConnected') : t('common.mySessionIsDisconnected'), item.connected ? 'success' : '')}</button>`).join('')}<div class="notice section-gap small">${icon('Info')}<span>${e(t('execution.privateSettings'))}</span></div></aside><div class="detail server-detail"><form id="execution-form" class="detail-form"><header class="execution-header"><div class="detail-title"><h2 class="grow">${e(server.name)}</h2>${badge(draft.transport === 'stdio' ? 'stdio' : 'Streamable HTTP')}</div><nav class="execution-nav" aria-label="${e(t('execution.configurationViews'))}">${button('connection-settings',t('execution.connectionConfig'),'','quiet')}${button('execution-settings',t('execution.executionStorage'),'','quiet','aria-current="page"')}</nav></header><div class="execution-scroll">
        ${server.connected ? `<div class="notice">${icon('Info')}<span>${e(t('execution.disconnectFirst'))}</span>${button('toggle-config-connection',t('common.disconnect'),'','quiet',`data-server="${e(server.id)}" ${runnable ? '' : 'disabled'}`)}</div>` : ''}
        <section class="execution-section"><div class="execution-section-title"><span class="execution-step">01</span><div><h3>${e(t('execution.routeTitle'))}</h3><p>${e(t('execution.routeHint'))}</p></div></div><fieldset class="execution-options"><legend>${e(t('execution.transport'))}</legend>${row('transport','http','Streamable HTTP',t('execution.httpHint'),draft.transport==='http',locked)}${row('transport','stdio','stdio',t('execution.stdioHint'),draft.transport==='stdio',locked)}</fieldset><fieldset class="execution-options"><legend>${e(t('execution.channel'))}</legend>${row('channel','browser',t('execution.browser'),t('execution.browserHint'),!agent,locked || draft.transport==='stdio')}${row('channel','agent',t('execution.agent'),t('execution.agentHint'),agent,locked)}</fieldset>
        <div class="execution-route" aria-label="${e(t('execution.actualRoute'))}"><span>${icon('Monitor')}${e(t('execution.workbench'))}</span><span aria-hidden="true">→</span>${agent ? `<span>${icon('Monitor')}${e(t('execution.agent'))}</span><span aria-hidden="true">→</span>` : ''}<span>${icon('Plugs')}${draft.transport==='stdio' ? e(t('execution.localProcess')) : e(t('execution.httpService'))}</span></div>
        ${draft.transport==='stdio' ? `<div class="execution-command fields"><div class="field"><label for="execution-command">${e(t('execution.command'))} <span class="required">*</span></label><input id="execution-command" class="mono" data-execution="command" value="${e(draft.command)}" ${disabled} required></div><div class="field"><label for="execution-directory">${e(t('execution.directory'))}</label><input id="execution-directory" class="mono" data-execution="directory" value="${e(draft.directory)}" ${disabled}></div><div class="field full"><label for="execution-args">${e(t('execution.arguments'))}</label><textarea id="execution-args" class="mono" data-execution="args" spellcheck="false" ${disabled}>${e(draft.args)}</textarea><span class="description">${e(t('execution.argsHint'))}</span></div><p class="field full small muted">${e(t('execution.commandScope'))}</p></div>` : `<p class="small muted execution-help">${e(t(agent ? 'execution.agentEndpoint' : 'execution.browserEndpoint'))}</p>`}
        ${agent ? `<div class="execution-device"><span class="execution-device-icon">${icon('Monitor')}</span><div class="grow"><strong>${e(t('execution.device'))}</strong><p>${e(t('execution.'+status+'Description'))}</p></div>${badge(t('execution.'+status),status==='paired' ? 'success' : 'warning')}${button('execution-pair',t(status==='paired' ? 'execution.previewOffline' : 'execution.previewPair'),'Plug','quiet',runnable ? '' : 'disabled')}</div>${draft.pairing ? `<div class="execution-pairing"><h4>${e(t('execution.pairingTitle'))}</h4><ol><li>${e(t('execution.pairingStepOne'))}</li><li>${e(t('execution.pairingStepTwo'))}</li></ol><div class="toolbar">${button('execution-paired',t('execution.confirmExamplePair'),'Check','',runnable ? '' : 'disabled')}${button('execution-pair-cancel',t('common.cancel'),'','quiet')}</div></div>` : ''}` : ''}</section>
        <section class="execution-section"><div class="execution-section-title"><span class="execution-step">02</span><div><h3>${e(t('execution.credentialsTitle'))}</h3><p>${e(t('execution.credentialsHint'))}</p></div></div><div class="execution-setting-row"><div><label for="execution-storage">${e(t('execution.storage'))}</label><p>${e(t(draft.storage==='local' ? 'execution.localHint' : 'execution.sessionHint'))}</p></div><select id="execution-storage" data-execution="storage" ${disabled}><option value="session" ${draft.storage==='session' ? 'selected' : ''}>${e(t('execution.session'))}</option>${agent ? `<option value="local" ${draft.storage==='local' ? 'selected' : ''}>${e(t('execution.local'))}</option>` : ''}</select></div><label class="execution-setting-row execution-backup"><span><strong>${e(t('execution.backup'))}</strong><small>${e(t('execution.backupHint'))}</small></span><input type="checkbox" id="execution-backup" data-execution="backup" ${draft.backup ? 'checked' : ''} ${disabled}></label>${draft.backup ? `<p class="execution-backup-note small">${icon('LockKey')}${e(t('execution.backupNotice'))}</p>` : ''}</section>
        <section class="execution-section"><div class="execution-section-title"><span class="execution-step">03</span><div><h3>${e(t('execution.recordsTitle'))}</h3><p>${e(t('execution.recordsHint'))}</p></div></div><dl class="execution-records"><div><dt>${e(t('execution.recordContents'))}</dt><dd>${e(t('execution.recordContentsValue'))}</dd></div><div><dt>${e(t('execution.recordDestination'))}</dt><dd>${e(t('execution.platform'))}</dd></div><div><dt>${e(t('execution.recordFailure'))}</dt><dd>${e(t('execution.recordFailureValue'))}</dd></div></dl></section>
        ${draft.error ? `<p id="execution-error" class="execution-error" role="alert">${e(t(draft.error))}</p>` : ''}
      </div><footer class="fixed-actions">${button('execution-save',t('execution.save'),'Check','primary',disabled)}<span class="small muted" role="status">${e(t(draft.saved ? 'execution.saved' : 'execution.memoryOnly'))}</span></footer></form></div></div></section>`;
    }
    return {
      render,
      input(target, projectId, server, editable) {
        if (!target.dataset.execution) return false;
        if (!editable || server.connected) return true;
        const draft = get(projectId,server), name = target.dataset.execution;
        if (!['transport','channel','storage','backup','command','args','directory'].includes(name)) return false;
        draft[name] = name==='backup' ? target.checked : target.value;
        if (draft.transport==='stdio') draft.channel='agent';
        if (draft.channel==='browser') draft.storage='session';
        draft.error=''; draft.saved=false;
        return ['command','args','directory'].includes(name) ? 'input' : 'render';
      },
      action(action,projectId,server,editable,runnable) {
        if (!action.startsWith('execution-')) return false;
        const draft=get(projectId,server);
        if (action==='execution-pair' && runnable) { if (draft.device==='paired') draft.device='offline'; else draft.pairing=true; }
        if (action==='execution-pair-cancel') draft.pairing=false;
        if (action==='execution-paired' && runnable) { draft.pairing=false; draft.device='paired'; }
        if (action==='execution-save' && editable && !server.connected) {
          if (draft.transport==='stdio') {
            if (!draft.command.trim()) {draft.error='execution.commandRequired';return true;}
            try {const args=JSON.parse(draft.args);if (!Array.isArray(args) || args.some(item=>typeof item!=='string')) throw new Error();}
            catch {draft.error='execution.invalidArgs';return true;}
          }
          draft.saved=true; draft.error='';
        }
        return true;
      },
    };
  },
};
