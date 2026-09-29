/* Native video-prompt integration. Installed reproducibly by install-camera-controls.cjs. */
(() => {
  const TAG = 'toonflow-camera-video';
  if (customElements.get(TAG)) return;
  const style = `
    :host{display:block;margin:0 0 12px;font:13px/1.5 system-ui,sans-serif;color:var(--td-text-color-primary,#dce3e9)}
    *{box-sizing:border-box}.controls{border:1px solid var(--td-component-border,#43505b);border-radius:8px;padding:12px;background:var(--td-bg-color-secondarycontainer,#253039)}
    .row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.title{font-weight:650}.hint{margin:5px 0 0;color:var(--td-text-color-secondary,#aebac4);font-size:12px}
    button{border:1px solid #657585;border-radius:6px;padding:7px 12px;font:inherit;cursor:pointer;background:#334653;color:#fff}button:hover{background:#425b6c}button:disabled{opacity:.5;cursor:wait}
    .primary{background:#426342;border-color:#779b70}.restore{font-size:12px;background:transparent;color:var(--td-text-color-primary,#dce3e9)}.status{margin:6px 0 0;font-size:12px}.error{color:#ffb7ab}[hidden]{display:none!important}
    dialog{padding:0;border:1px solid #55616a;border-radius:12px;background:#111a21;color:#eee;width:96vw;max-width:1500px;height:94vh;max-height:1000px;overflow:hidden}
    dialog::backdrop{background:#000b}.modal{height:100%;display:flex;flex-direction:column}.bar{padding:10px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid #34434d}.bar strong{font-size:14px}.bar small{display:block;color:#aeb9bd;font-size:11px}
    iframe{width:100%;flex:1;min-height:0;border:0;background:#111a21}.conflict{margin-top:8px}.conflict button{margin:4px 6px 0 0}
    @media(max-width:650px){dialog{width:100vw;max-width:100vw;height:100dvh;max-height:100dvh;border-radius:0}.bar{padding:8px}.hint{font-size:11px}}
  `;
  const node = (tag, text, className) => {
    const result = document.createElement(tag);
    if (text != null) result.textContent = text;
    if (className) result.className = className;
    return result;
  };

  class CameraVideoControls extends HTMLElement {
    static get observedAttributes() { return ['project-id', 'track-id', 'prompt-state']; }
    constructor() {
      super();
      this.root = this.attachShadow({ mode: 'open' });
      this.busy = false;
      this.session = null;
      this.pending = null;
      this.onMessage = event => this.receive(event);
    }
    connectedCallback() {
      if (!this.built) this.build();
      window.addEventListener('message', this.onMessage);
      this.refresh();
    }
    disconnectedCallback() {
      window.removeEventListener('message', this.onMessage);
      this.closeModal();
    }
    attributeChangedCallback() {
      if (this.session && (this.session.trackId !== Number(this.getAttribute('track-id')) || this.session.projectId !== Number(this.getAttribute('project-id')))) this.closeModal();
      if (this.built) this.refresh();
    }
    build() {
      this.built = true;
      const css = node('style', style);
      const controls = node('section', null, 'controls');
      controls.setAttribute('aria-label', '视频提示词运镜设置');
      const row = node('div', null, 'row');
      row.append(node('span', '运镜与镜头', 'title'));
      this.openButton = node('button', '选择运镜 · 模板与审计', 'primary');
      this.openButton.type = 'button';
      this.openButton.addEventListener('click', () => this.open());
      this.restoreButton = node('button', '还原打开前提示词', 'restore');
      this.restoreButton.type = 'button';
      this.restoreButton.addEventListener('click', () => this.restore());
      row.append(this.openButton, this.restoreButton);
      this.status = node('p', '', 'status');
      this.status.setAttribute('role', 'status');
      this.status.setAttribute('aria-live', 'polite');
      this.conflict = node('div', null, 'conflict');
      this.conflict.hidden = true;
      const accept = node('button', '载入已采用的运镜方案');
      accept.type = 'button';
      accept.onclick = () => this.resolveConflict(true);
      const keep = node('button', '保留当前草稿');
      keep.type = 'button';
      keep.onclick = () => this.resolveConflict(false);
      this.conflict.append(accept, keep);
      controls.append(row, node('p', '点击「生成提示词」会结合分镜设计运镜；已采用的方案优先。可在此比较模板、审计并直接写入提示词。打开前会保存当前文字。', 'hint'), this.status, this.conflict);
      this.root.append(css, controls);
    }
    message(text, error = false) {
      this.status.textContent = text;
      this.status.classList.toggle('error', error);
    }
    key(context) { return `toonflow:camera-video-draft:${context.projectId}:${context.trackId}`; }
    saved(context) {
      try { return JSON.parse(sessionStorage.getItem(this.key(context)) || 'null'); } catch { return null; }
    }
    backup(context) {
      try { sessionStorage.setItem(this.key(context), JSON.stringify({ prompt: context.prompt, savedAt: Date.now() })); } catch { /* In-memory session remains available if browser storage is full. */ }
    }
    contextAttributes() { return { projectId: Number(this.getAttribute('project-id')), trackId: Number(this.getAttribute('track-id')) }; }
    refresh() {
      const context = this.contextAttributes();
      this.openButton.disabled = this.busy || !context.projectId || !context.trackId || this.getAttribute('prompt-state') === '生成中';
      this.restoreButton.hidden = !this.saved(context);
      this.restoreButton.disabled = this.busy;
    }
    bridge() {
      let bridge;
      this.dispatchEvent(new CustomEvent('camera-open', { bubbles: true, composed: true, detail: { connect: value => { bridge = value; } } }));
      if (!bridge || typeof bridge.getContext !== 'function' || typeof bridge.saveCurrent !== 'function' || typeof bridge.applyPrompt !== 'function') throw Error('运镜入口未连接当前编辑器，请刷新页面后重试。');
      return bridge;
    }
    validate(context) {
      const expected = this.contextAttributes();
      if (!context || context.projectId !== expected.projectId || context.trackId !== expected.trackId || !context.projectId || !context.trackId) throw Error('当前视频已切换，请在所需视频重新打开运镜。');
      if (context.busy) throw Error('视频提示词正在生成，请完成后再设置运镜。');
      if (typeof context.prompt !== 'string') throw Error('当前视频提示词不可读取，请刷新重试。');
      return context;
    }
    async open() {
      if (this.busy || this.session) return;
      this.busy = true;
      this.refresh();
      try {
        const bridge = this.bridge();
        const before = this.validate(bridge.getContext());
        this.message('正在保存当前提示词…');
        // The bundle hook queues the editor's blur saves, so an older request cannot arrive after adoption.
        await bridge.saveCurrent();
        const context = this.validate(bridge.getContext());
        if (context.prompt !== before.prompt) throw Error('提示词在保存时发生变化，请重新打开运镜以使用最新文字。');
        if (!this.isConnected) return;
        this.backup(context);
        this.session = { ...context, bridge };
        this.pending = null;
        this.conflict.hidden = true;
        this.showModal(context);
        this.message('当前文字已保存。选择分镜和方案后，可直接采用到视频提示词。');
      } catch (error) { this.message(error.message || '无法打开运镜设置，请重试。', true); }
      finally { this.busy = false; this.refresh(); }
    }
    showModal(context) {
      this.dialog = node('dialog');
      this.dialog.setAttribute('aria-label', '当前视频运镜方案');
      const wrapper = node('div', null, 'modal');
      const bar = node('div', null, 'bar');
      const heading = node('div');
      heading.append(node('strong', '视频提示词 · 运镜与镜头'), node('small', `当前视频 #${context.trackId} · 采用后直接回填编辑器`));
      const close = node('button', '返回提示词');
      close.type = 'button';
      close.addEventListener('click', () => this.requestClose());
      bar.append(heading, close);
      this.frame = node('iframe');
      this.frame.title = '当前视频分镜的运镜模板、候选与审计';
      const url = new URL('/camera-studio.html', location.origin);
      url.searchParams.set('embedded', '1');
      url.searchParams.set('projectId', String(context.projectId));
      url.searchParams.set('trackId', String(context.trackId));
      this.frame.src = url.href;
      wrapper.append(bar, this.frame);
      this.dialog.append(wrapper);
      this.dialog.addEventListener('cancel', event => { event.preventDefault(); this.requestClose(); });
      this.root.append(this.dialog);
      this.dialog.showModal();
      close.focus();
    }
    requestClose() {
      let dirty = false;
      try {
        // Reuse the embedded editor's existing dirty-state handler without navigating it.
        dirty = !this.frame.contentWindow.dispatchEvent(new Event('beforeunload', { cancelable: true }));
      } catch { /* A failed iframe has no editable draft to discard. */ }
      if (dirty && !window.confirm('运镜设置尚未建立为方案。返回后这些设置修改不会保留，继续？')) return;
      this.closeModal();
    }
    closeModal() {
      if (this.dialog) { this.dialog.close(); this.dialog.remove(); }
      this.dialog = null;
      this.frame = null;
      this.session = null;
      this.openButton?.focus();
    }
    receive(event) {
      const session = this.session;
      if (!session || !this.frame || event.origin !== location.origin || event.source !== this.frame.contentWindow) return;
      const data = event.data;
      if (!data || data.type !== 'toonflow:camera-applied' || Number(data.projectId) !== session.projectId || Number(data.trackId) !== session.trackId || !Array.isArray(data.targets) || !data.targets.includes('video') || typeof data.videoPrompt !== 'string' || data.videoPrompt.length > 500000) return;
      const context = session.bridge.getContext();
      if (context.projectId !== session.projectId || context.trackId !== session.trackId) return;
      if (context.prompt !== session.prompt) {
        this.backup(context);
        this.pending = { session, prompt: data.videoPrompt, currentPrompt: context.prompt };
        this.closeModal();
        this.conflict.hidden = false;
        this.message('当前编辑器文字在设置运镜期间发生变化，已保留新草稿。请选择要保留的版本。', true);
        this.refresh();
        return;
      }
      if (!session.bridge.applyPrompt({ projectId: session.projectId, trackId: session.trackId, prompt: data.videoPrompt })) {
        this.message('视频已切换，未覆盖编辑器文字；请重新选择对应视频。', true);
        this.closeModal();
        return;
      }
      this.closeModal();
      this.message('已写入当前视频提示词，下方编辑器与后续生成使用同一份内容。可还原打开前文字。');
      this.refresh();
    }
    async resolveConflict(useAdopted) {
      if (this.busy || !this.pending) return;
      this.busy = true;
      this.refresh();
      try {
        const pending = this.pending;
        const context = this.validate(pending.session.bridge.getContext());
        if (useAdopted) {
          this.backup(context);
          if (!pending.session.bridge.applyPrompt({ ...context, prompt: pending.prompt })) throw Error('视频已切换，未覆盖当前文字。');
        }
        await pending.session.bridge.saveCurrent();
        this.pending = null;
        this.conflict.hidden = true;
        this.message(useAdopted ? '已载入并保存运镜方案。' : '已保留并保存当前草稿。');
      } catch (error) { this.message(error.message || '保存失败，请重试。', true); }
      finally { this.busy = false; this.refresh(); }
    }
    async restore() {
      if (this.busy || this.session) return;
      this.busy = true;
      this.refresh();
      try {
        const bridge = this.bridge();
        const context = this.validate(bridge.getContext());
        const saved = this.saved(context);
        if (!saved || typeof saved.prompt !== 'string') throw Error('当前视频没有可还原的原稿。');
        if (!bridge.applyPrompt({ ...context, prompt: saved.prompt })) throw Error('视频已切换，未覆盖当前文字。');
        await bridge.saveCurrent();
        this.message('已还原并保存打开运镜前的提示词。');
      } catch (error) { this.message(error.message || '原稿保存失败，请重试。', true); }
      finally { this.busy = false; this.refresh(); }
    }
  }
  customElements.define(TAG, CameraVideoControls);
})();
