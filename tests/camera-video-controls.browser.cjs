// Isolated native-editor harness: no application database or production routes are touched.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || '/home/ubuntu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const script = fs.readFileSync(path.join(__dirname, '../data/web/camera-video-controls.js'));
const nativeHarness = `<!doctype html><html><body>
<toonflow-camera-video project-id="7" track-id="19"></toonflow-camera-video>
<label>Native prompt<textarea id="native">已保存旧稿</textarea></label>
<script>
window.log=[];window.saved='已保存旧稿';window.failSave=false;
window.track={id:19,prompt:'已保存旧稿'};window.saveQueue=Promise.resolve();
function persist(){const prompt=track.prompt;saveQueue=saveQueue.catch(()=>{}).then(async()=>{log.push('save:start:'+prompt);await new Promise(r=>setTimeout(r,30));if(failSave)throw Error('测试保存失败');saved=prompt;log.push('save:end:'+prompt)});saveQueue.catch(()=>{});return saveQueue}
const native=document.getElementById('native');native.oninput=()=>track.prompt=native.value;native.onblur=()=>persist();
document.querySelector('toonflow-camera-video').addEventListener('camera-open',e=>e.detail.connect({
getContext:()=>({projectId:7,trackId:track.id,prompt:track.prompt,busy:false}),
saveCurrent:()=>persist(),
applyPrompt:value=>{if(value.projectId!==7||value.trackId!==track.id)return false;log.push('apply:'+value.prompt);track.prompt=value.prompt;native.value=value.prompt;return true}
}));
</script><script src="/camera-video-controls.js"></script></body></html>`;
const embeddedHarness = `<!doctype html><html><body><button id="adopt">采用整轨方案</button><script>
parent.log.push('frame:loaded');
document.querySelector('#adopt').onclick=()=>parent.postMessage({type:'toonflow:camera-applied',projectId:7,storyboardId:31,trackId:19,videoPrompt:'镜头一：缓推读信。\\n镜头二：固定反应。',targets:['video']},location.origin);
</script></body></html>`;

(async () => {
  const server = http.createServer((req, res) => {
    if (req.url === '/camera-video-controls.js') { res.setHeader('Content-Type', 'text/javascript; charset=utf-8'); res.end(script); }
    else if (req.url.startsWith('/camera-studio.html')) { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(embeddedHarness); }
    else { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(nativeHarness); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const reset = async () => { await page.goto(origin); await page.evaluate(() => sessionStorage.clear()); };
  const open = async () => {
    await page.getByRole('button', { name: '选择运镜 · 模板与审计' }).click();
    await page.locator('toonflow-camera-video iframe').waitFor();
    await page.frameLocator('iframe').getByRole('button', { name: '采用整轨方案' }).waitFor();
  };
  try {
    await reset();
    await page.locator('#native').fill('未保存的新对白：我记得你。');
    await open();
    const savedFirst = await page.evaluate(() => ({ log, saved, url: document.querySelector('toonflow-camera-video').shadowRoot.querySelector('iframe').src }));
    assert.equal(savedFirst.saved, '未保存的新对白：我记得你。');
    assert.ok(savedFirst.log.lastIndexOf('save:end:未保存的新对白：我记得你。') < savedFirst.log.indexOf('frame:loaded'));
    assert.ok(savedFirst.log.indexOf('save:end:未保存的新对白：我记得你。') < savedFirst.log.lastIndexOf('save:start:未保存的新对白：我记得你。'));
    assert.match(savedFirst.url, /embedded=1/);
    assert.match(savedFirst.url, /trackId=19/);

    // Same-origin unrelated windows and wrong-track iframe messages cannot mutate the editor.
    await page.evaluate(() => window.postMessage({type:'toonflow:camera-applied',projectId:7,trackId:19,videoPrompt:'wrong source',targets:['video']},location.origin));
    await page.evaluate(() => {
      const frame = document.querySelector('toonflow-camera-video').shadowRoot.querySelector('iframe');
      window.dispatchEvent(new MessageEvent('message', {origin:'https://unrelated.invalid',source:frame.contentWindow,data:{type:'toonflow:camera-applied',projectId:7,trackId:19,videoPrompt:'wrong origin',targets:['video']}}));
    });
    const frame = page.frames().find(frame => frame.url().includes('camera-studio.html'));
    await frame.evaluate(() => parent.postMessage({type:'toonflow:camera-applied',projectId:7,trackId:999,videoPrompt:'wrong track',targets:['video']},location.origin));
    await page.waitForTimeout(30);
    assert.equal(await page.locator('#native').inputValue(), '未保存的新对白：我记得你。');
    await page.frameLocator('iframe').getByRole('button', { name: '采用整轨方案' }).click();
    await page.locator('toonflow-camera-video iframe').waitFor({ state: 'detached' });
    assert.equal(await page.locator('#native').inputValue(), '镜头一：缓推读信。\n镜头二：固定反应。');
    assert.equal(await page.evaluate(() => track.prompt), '镜头一：缓推读信。\n镜头二：固定反应。');
    await page.getByRole('button', { name: '还原打开前提示词' }).click();
    await page.waitForFunction(() => saved === '未保存的新对白：我记得你。' && document.querySelector('toonflow-camera-video').shadowRoot.querySelector('.status').textContent.includes('已还原'));
    assert.equal(await page.locator('#native').inputValue(), '未保存的新对白：我记得你。');
    console.log('PASS: native save order, iframe context, source/track guard, whole-track reactive update, original draft restore');

    await reset();
    await open();
    await page.evaluate(() => { track.prompt = '运镜打开后出现的新草稿'; document.getElementById('native').value = track.prompt; });
    await page.frameLocator('iframe').getByRole('button', { name: '采用整轨方案' }).click();
    await page.getByRole('button', { name: '保留当前草稿' }).waitFor();
    assert.equal(await page.locator('#native').inputValue(), '运镜打开后出现的新草稿');
    await page.getByRole('button', { name: '保留当前草稿' }).click();
    await page.waitForFunction(() => saved === '运镜打开后出现的新草稿');
    console.log('PASS: concurrent draft conflict retains and saves newer native text');

    await reset();
    await page.evaluate(() => { failSave = true; });
    await page.getByRole('button', { name: '选择运镜 · 模板与审计' }).click();
    await page.getByRole('status').filter({hasText:'测试保存失败'}).waitFor();
    assert.equal(await page.locator('toonflow-camera-video iframe').count(), 0);
    assert.equal(await page.locator('#native').inputValue(), '已保存旧稿');
    console.log('PASS: failed pre-save leaves the original editor intact and does not open an adopting frame');
    assert.deepEqual(errors, []);
    console.log('PASS: no browser runtime errors');
  } catch (error) {
    console.error('BROWSER DIAGNOSTICS', errors, await page.evaluate(() => ({body:document.body.innerHTML.slice(0,2000),shadow:document.querySelector('toonflow-camera-video')?.shadowRoot?.innerHTML.slice(0,2000)})));
    throw error;
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
