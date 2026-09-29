/* Additive native prompt assistance. Review first; applying changes only the original editor draft. */
(() => {
  'use strict';
  const TAG = 'toonflow-prompt-ai';
  if (customElements.get(TAG)) return;
  const make = (tag, text, className) => {
    const element = document.createElement(tag);
    if (text != null) element.textContent = text;
    if (className) element.className = className;
    return element;
  };
  const style = `
    :host{display:block;width:100%;margin:7px 0;font:12px/1.55 system-ui,sans-serif;color:var(--td-text-color-primary,#e4e9ec)}
    *{box-sizing:border-box}button,textarea{font:inherit}button{border:1px solid var(--td-component-border,#65727a);border-radius:6px;padding:5px 10px;background:var(--td-bg-color-secondarycontainer,#27323a);color:inherit;cursor:pointer}button:hover{border-color:#98ad88}button:disabled{opacity:.5;cursor:not-allowed}
    .entry{display:flex;align-items:center;gap:9px;flex-wrap:wrap}.entry span,.hint{font-size:11px;color:var(--td-text-color-secondary,#a8b7bd)}.status{margin:5px 0 0;font-size:11px}.error{color:#e6a18e}
    dialog{padding:0;width:min(880px,94vw);max-height:91vh;border:1px solid #627068;border-radius:12px;background:#182025;color:#e7ecef}dialog::backdrop{background:#0009}.dialog-body{padding:22px;overflow:auto;max-height:89vh}.heading,.actions{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.heading h2{font-size:19px;margin:0}.heading button{color:#e7ecef;background:#26333a}.hint{margin:10px 0 14px}.columns{display:grid;grid-template-columns:1fr 1fr;gap:14px}label{display:block;font-size:12px;font-weight:600;margin:12px 0 6px}textarea{display:block;width:100%;resize:vertical;background:#10171b;border:1px solid #47544e;border-radius:7px;color:#e7ecef;padding:10px;line-height:1.65}textarea:focus,button:focus-visible{outline:2px solid #c3d5a8;outline-offset:2px}.actions{margin:12px 0}.actions>div{display:flex;gap:8px;flex-wrap:wrap}.primary{background:#c3d5a8;color:#1c291a;border-color:#c3d5a8}.result{min-height:200px}.dialog-status{padding:9px 12px;background:#1f3027;border-left:3px solid #8da778;font-size:12px;margin:12px 0}.dialog-status.error{background:#38261f;border-color:#dca783}.footer{border-top:1px solid #3c4b44;padding-top:14px;margin-top:16px}.footer p{margin:0;font-size:11px;color:#b0beb6}.abort{font-size:11px}[hidden]{display:none!important}@media(max-width:650px){.columns{grid-template-columns:1fr}.dialog-body{padding:15px}.heading h2{font-size:16px}}
  `;

  class PromptAIControls extends HTMLElement {
    constructor() {
      super();
      this.root = this.attachShadow({ mode: 'open' });
      this.sequence = 0;
      this.session = null;
    }
    connectedCallback() {
      if (this.built) return;
      this.built = true;
      const entry = make('div', null, 'entry');
      this.entryButton = make('button', 'AI 辅助 · 简体中文');
      this.entryButton.type = 'button';
      this.entryButton.onclick = () => this.open();
      entry.append(this.entryButton, make('span', '先预览，再采用'));
      this.status = make('p', '', 'status');
      this.status.setAttribute('role', 'status');
      this.status.setAttribute('aria-live', 'polite');
      this.root.append(make('style', style), entry, this.status);
    }
    disconnectedCallback() { this.close(); }
    message(text, error = false) {
      this.status.textContent = text;
      this.status.classList.toggle('error', error);
    }
    connect() {
      let bridge;
      this.dispatchEvent(new CustomEvent('prompt-assist', { bubbles: true, composed: true, detail: { connect: value => { bridge = value; } } }));
      if (!bridge || typeof bridge.getContext !== 'function' || typeof bridge.applyPrompt !== 'function') throw Error('当前编辑器尚未连接，请刷新页面后重试。');
      return bridge;
    }
    open() {
      if (this.session) return;
      try {
        const bridge = this.connect(), original = bridge.getContext();
        if (!original || typeof original.source !== 'string' || original.enabled === false) throw Error('当前编辑器已关闭或正在处理任务，请重新打开后使用。');
        const kind = this.getAttribute('kind');
        if (!['image', 'video', 'storyboard'].includes(kind)) throw Error('当前字段类型不可识别。');
        this.session = { bridge, original, kind };
        this.showDialog(original);
      } catch (error) { this.session = null; this.message(error.message || '无法打开 AI 辅助。', true); }
    }
    showDialog(original) {
      this.dialog = make('dialog');
      this.dialog.setAttribute('aria-label', `${this.getAttribute('label') || '提示词'} · AI 简体中文辅助`);
      const body = make('div', null, 'dialog-body'), heading = make('div', null, 'heading');
      heading.append(make('h2', `${this.getAttribute('label') || '提示词'} · AI 简体中文`));
      const close = make('button', '关闭');
      close.type = 'button'; close.onclick = () => this.close(); heading.append(close);
      body.append(heading, make('p', '只生成或转换文字。先核对人物、动作、台词与镜头要求，再采用到原编辑框。', 'hint'));
      const columns = make('div', null, 'columns'), sourceColumn = make('div'), contextColumn = make('div');
      const source = make('textarea'); source.readOnly = true; source.rows = 6; source.value = original.source;
      source.setAttribute('aria-label', '打开前原文');
      this.context = make('textarea'); this.context.rows = 6; this.context.maxLength = 15000; this.context.value = original.context || '';
      this.context.placeholder = '填写人物、场景、要发生的动作或需要保留的内容。原文为空时，请先补充要求。';
      this.context.setAttribute('aria-label', 'AI 补充要求');
      sourceColumn.append(make('label', '打开前原文（保留不动）'), source);
      contextColumn.append(make('label', '补充要求与上下文'), this.context); columns.append(sourceColumn, contextColumn); body.append(columns);
      this.imagePurpose = null;
      if(this.session.kind==='image' && !original.storyboardId && /素材类型[：:]\s*role/.test(original.context||'')){
        const label=make('label','图像用途');this.imagePurpose=make('select');this.imagePurpose.add(new Option('保留当前设定布局','default'));this.imagePurpose.add(new Option('重新生成单人正面全身参考','singleFrontReference'));label.append(this.imagePurpose);body.append(label);
      }
      const actions = make('div', null, 'actions'), actionsGroup = make('div');
      this.generate = make('button', 'AI 生成简体中文', 'primary'); this.generate.type = 'button'; this.generate.onclick = () => this.run('generate');
      this.simplify = make('button', '转为简体中文'); this.simplify.type = 'button'; this.simplify.onclick = () => this.run('simplify');
      this.abort = make('button', '停止等待', 'abort'); this.abort.type = 'button'; this.abort.hidden = true;
      this.abort.onclick = () => { this.cancelRequest(); this.say('已停止等待，原编辑框未修改。'); };
      actionsGroup.append(this.generate, this.simplify); actions.append(actionsGroup, this.abort); body.append(actions);
      this.dialogStatus = make('p', original.source.trim() ? '可重新生成表达，或只转换语言并保留原意。' : '原文为空，请先填写具体要求再生成。', 'dialog-status');
      this.dialogStatus.setAttribute('role', 'status'); this.dialogStatus.setAttribute('aria-live', 'polite'); body.append(this.dialogStatus);
      body.append(make('label', '结果预览（可继续修改）'));
      this.result = make('textarea', null, 'result'); this.result.rows = 9; this.result.maxLength = 30000; this.result.placeholder = '生成结果会显示在此处。';
      this.result.setAttribute('aria-label', 'AI 简体中文结果预览'); body.append(this.result);
      const footer = make('div', null, 'actions footer'), footerGroup = make('div');
      this.copy = make('button', '复制结果'); this.copy.type = 'button';
      this.copy.onclick = async () => { try { await navigator.clipboard.writeText(this.result.value); this.say('已复制结果，原编辑框保持不变。'); } catch { this.result.select(); this.say('自动复制不可用，请复制已选中的文字。', true); } };
      this.apply = make('button', '采用到原编辑框', 'primary'); this.apply.type = 'button'; this.apply.onclick = () => this.adopt();
      footerGroup.append(this.copy, this.apply); footer.append(make('p', '采用后仍由原页面的保存或确认按钮保存。'), footerGroup); body.append(footer);
      this.context.oninput = () => this.refresh(); this.result.oninput = () => this.refresh();
      this.dialog.append(body); this.dialog.addEventListener('cancel', event => { event.preventDefault(); this.close(); });
      this.root.append(this.dialog); this.dialog.showModal(); this.refresh();
      (original.source.trim() ? this.generate : this.context).focus();
    }
    say(text, error = false) {
      if (!this.dialogStatus) return;
      this.dialogStatus.textContent = text; this.dialogStatus.classList.toggle('error', error);
    }
    refresh() {
      if (!this.session || !this.dialog) return;
      const busy = !!this.controller, hasSource = !!this.session.original.source.trim();
      this.generate.disabled = busy || (!hasSource && !this.context.value.trim());
      this.simplify.disabled = busy || !hasSource;
      if(this.imagePurpose)this.imagePurpose.disabled=busy;
      this.context.disabled = busy; this.result.disabled = busy;
      this.copy.disabled = busy || !this.result.value.trim(); this.apply.disabled = busy || !this.result.value.trim(); this.abort.hidden = !busy;
    }
    cancelRequest() {
      this.sequence++; this.controller?.abort(); this.controller = null;
      clearTimeout(this.timeout); this.timeout = null; this.refresh();
    }
    async run(action) {
      if (!this.session || this.controller) return;
      const session = this.session, source = session.original.source, context = this.context.value.trim();
      if ((!source.trim() && !context) || (action === 'simplify' && !source.trim())) { this.say('请先提供需要生成或转换的文字。', true); return; }
      if (source.length > 30000 || context.length > 15000) { this.say('原文最多 30000 字，上下文最多 15000 字，请先精简后再试。', true); return; }
      const current = session.bridge.getContext();
      if (!current || current.owner !== session.original.owner || current.enabled === false) { this.say('原编辑目标已切换，请关闭后重新打开。', true); return; }
      const serial = ++this.sequence, controller = this.controller = new AbortController();
      this.refresh(); this.say(action === 'simplify' ? '正在转换为简体中文…' : '正在生成简体中文提示词…');
      this.timeout = setTimeout(() => { if (serial === this.sequence) { this.cancelRequest(); this.say('等待超时，原编辑框未修改。可稍后重试。', true); } }, 100000);
      try {
        const response = await fetch('/api/promptStandards/assist', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: localStorage.getItem('token') || '' }, signal: controller.signal, body: JSON.stringify({ kind: session.kind, source, context, action, imagePurpose:this.imagePurpose?.value||"default", storyboardId: session.original.storyboardId }) });
        const payload = await response.json();
        if (!response.ok) throw Error(response.status === 401 ? '登录状态已过期，请重新登录后使用。' : payload.message || 'AI 文字处理失败。');
        const data = payload.data;
        if (typeof data?.prompt !== 'string' || !data.prompt.trim() || data.generatesMedia !== false || data.language !== 'zh-CN') throw Error('返回的文字结果格式无效，请重试。');
        if (serial !== this.sequence || this.session !== session || !this.isConnected) return;
        this.result.value = data.prompt;
        this.say('结果已生成。核对并修改后，点击「采用到原编辑框」才会回填。');
      } catch (error) { if (serial === this.sequence && this.session === session && error.name !== 'AbortError') this.say(error.message || 'AI 处理失败，原文未修改。', true); }
      finally { if (serial === this.sequence) { clearTimeout(this.timeout); this.timeout = null; this.controller = null; this.refresh(); } }
    }
    adopt() {
      if (!this.session || this.controller || !this.result.value.trim()) return;
      const session = this.session, current = session.bridge.getContext();
      if (!current || current.owner !== session.original.owner || current.enabled === false || current.source !== session.original.source) { this.say('原编辑框已发生变化，未覆盖新内容。可复制结果，或关闭后重新打开。', true); return; }
      try {
        if (!session.bridge.applyPrompt(this.result.value, session.original)) throw Error('原编辑目标已改变，未覆盖当前文字。');
        this.message('已回填简体中文结果；请使用原页面的保存或确认按钮保存。'); this.close();
      } catch (error) { this.say(error.message || '回填失败，原文未修改。', true); }
    }
    close() {
      this.cancelRequest(); this.session = null;
      if (this.dialog) { this.dialog.close(); this.dialog.remove(); }
      this.dialog = null; this.dialogStatus = null;
      if (this.isConnected) this.entryButton?.focus();
    }
  }
  customElements.define(TAG, PromptAIControls);
})();
