(() => {
  let library;
  async function request(endpoint, body) {
    const response = await fetch(`/api/characterVoices/${endpoint}`, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: localStorage.getItem('token') || '', 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const result = await response.json();
    if (!response.ok || result.code !== 200) throw new Error(result.message || '声音操作失败，请重试');
    return result.data;
  }
  const el = (tag, text, css) => { const node = document.createElement(tag); if (text) node.textContent = text; if (css) node.style.cssText = css; return node; };
  class CharacterVoiceSelect extends HTMLElement {
    static get observedAttributes() { return ['asset-id', 'project-id', 'asset-type']; }
    connectedCallback() { this.load(); }
    attributeChangedCallback() { if (this.isConnected) this.load(); }
    disconnectedCallback() { this.revision = (this.revision || 0) + 1; this.querySelector('audio')?.pause(); }
    async load() {
      const revision = this.revision = (this.revision || 0) + 1;
      const target = { assetId: Number(this.getAttribute('asset-id')), projectId: Number(this.getAttribute('project-id')) };
      if (!target.assetId || !target.projectId) return;
      this.querySelector('audio')?.pause(); this.replaceChildren();
      this.style.cssText = 'display:block;width:100%;margin:0 0 24px;color:var(--td-text-color-primary,#ddd);font-size:14px';
      const label = el('label', this.getAttribute('asset-type') === 'role' || !this.getAttribute('asset-type') ? '默认声线' : '默认声音', 'display:block;margin-bottom:8px');
      const select = el('select', '', 'display:block;width:100%;height:38px;padding:0 10px;border:1px solid var(--td-component-border,#555);border-radius:6px;background:var(--td-bg-color-container,#222);color:inherit;font:inherit');
      select.id = `character-voice-${target.assetId}`; label.htmlFor = select.id;
      select.disabled = true; select.add(new Option('正在加载本地声音…', ''));
      const description = el('p', '', 'margin:8px 0;line-height:1.6;color:var(--td-text-color-secondary,#aaa);font-size:12px');
      const player = el('audio', '', 'width:100%;height:36px;margin:4px 0'); player.controls = true; player.preload = 'none'; player.hidden = true;
      const credit = el('a', '', 'display:block;font-size:12px;color:var(--td-brand-color,#809cff);margin:6px 0'); credit.target = '_blank'; credit.rel = 'noopener';
      const browse = el('a', '查看全部声音与影视配乐 →', 'display:block;font-size:12px;color:var(--td-brand-color,#809cff);margin:8px 0');
      browse.href = `/sound-library.html?projectId=${target.projectId}&assetId=${target.assetId}`; browse.target = '_blank'; browse.rel = 'noopener';
      const status = el('span', '', 'font-size:12px;line-height:1.6'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
      this.append(label, select, description, player, credit, browse, status);
      try {
        library ||= request('library').catch(e => { library = null; throw e; });
        const [all, current] = await Promise.all([library, request('get', target)]);
        if (revision !== this.revision) return;
        const options = all.filter(v => v.category !== 'music' && (current.type === 'role' || v.category !== 'voice'));
        select.replaceChildren(new Option('不指定本地声音', ''));
        const groups = new Map();
        options.forEach(v => {
          const groupName = v.category === 'voice' ? `${v.gender}声 · ${v.age}` : v.categoryName;
          if (!groups.has(groupName)) { const group = el('optgroup'); group.label = groupName; groups.set(groupName, group); select.append(group); }
          groups.get(groupName).append(new Option(v.name + (v.traits?.length ? ` · ${v.traits.join(' / ')}` : ''), v.id));
        });
        let saved = current.selectedSound || '';
        if (saved && !options.some(v => v.id === saved)) select.add(new Option('当前素材请在声音库中查看', saved));
        select.value = saved;
        const describe = () => {
          const sound = all.find(v => v.id === select.value);
          player.pause();
          if (sound) {
            player.src = sound.src; player.hidden = false; player.setAttribute('aria-label', `${sound.name}试听`);
            description.textContent = `${sound.description} ${sound.category === 'voice' ? '中文虚构音色；年龄、气质和性格为风格标签。' : ''}选择后会替换当前音频参考。支持音频参考的视频模式会引用此文件；试听台词不会自动加入剧本。`;
            credit.textContent = `${sound.duration.toFixed(1)} 秒 · ${sound.author} · ${sound.license} · 来源`; credit.href = sound.sourceUrl; credit.hidden = false;
          } else {
            player.removeAttribute('src'); player.load(); player.hidden = true; credit.hidden = true;
            description.textContent = current.customAudio ? '当前使用自行上传的参考音频。选择预设将替换该参考；不指定预设会保留自行上传的音频。' : '可选择中文人物声线、环境声或动物声音。先试听，再为此资产固定声音。';
          }
        };
        describe(); select.disabled = false;
        player.addEventListener('error', () => { status.textContent = '音频无法播放，请检查本地素材文件或重新加载。'; });
        select.addEventListener('change', async () => {
          const value = select.value; select.disabled = true; status.textContent = '正在保存声音关联…'; describe();
          try {
            await request('select', { ...target, soundId: value || null });
            if (revision !== this.revision) return;
            saved = value; status.textContent = value ? '已保存并关联本地音频素材' : '已清除内置声音';
          } catch (e) {
            if (revision !== this.revision) return;
            select.value = saved; describe(); status.textContent = e.message;
          } finally { if (revision === this.revision) select.disabled = false; }
        });
      } catch (e) {
        if (revision !== this.revision) return;
        status.textContent = e.message;
        const retry = el('button', '重新加载声音'); retry.type = 'button'; retry.addEventListener('click', () => this.load()); this.append(retry);
      }
    }
  }
  if (!customElements.get('toonflow-character-voice')) customElements.define('toonflow-character-voice', CharacterVoiceSelect);
})();
