const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
class Element{
 constructor(tag='host'){this.tag=tag;this.children=[];this.attrs={};this.isConnected=true;this.readyState=4;this.duration=10;this.currentTime=0;}
 setAttribute(k,v){this.attrs[k]=v}getAttribute(k){return this.attrs[k]||null}append(...xs){this.children.push(...xs)}prepend(x){this.children.unshift(x)}replaceChildren(...xs){this.children=xs}querySelectorAll(){return []}add(x){this.children.push(x)}pause(){this.onpause?.()}play(){this.onplay?.();return Promise.resolve()}click(){this.onclick?.()}removeAttribute(k){delete this.attrs[k]}load(){}
}
const blobs=[],files=[],requests=[];let C,fail=false;const context={HTMLElement:Element,document:{createElement:t=>new Element(t)},customElements:{define(_n,c){C=c}},window:{ToonflowPreviewZip:class{file(n,v){files.push({n,v})}async generateAsync(){return new Blob(['zip'])}}},location:{href:'http://localhost/'},Option:class{},URL,Blob,AbortController,performance:{now:()=>1},setInterval:()=>1,clearInterval(){},setTimeout(){},localStorage:{getItem:()=>''},fetch:async(src,options)=>{requests.push({src,options});if(fail)return {ok:false,status:404};return {ok:true,blob:async()=>new Blob(['media'],{type:'image/png'})}}};
URL.createObjectURL=b=>{blobs.push(b);return 'blob:export'};URL.revokeObjectURL=()=>{};vm.runInNewContext(fs.readFileSync('data/web/storyboard-preview.js','utf8'),context);
function sample(id,extra={}){return {id,duration:3,images:[{id:'asset-1',src:'/ref.png',name:'参考角色',source:'asset'}],videos:[],characters:[{name:'角色'}],description:'镜头',...extra};}
(async()=>{
 const p=new C();p.rows=[sample('1'),sample('2'),sample('3',{images:[],description:'空镜'})];p.original=['1','2','3'];p.active='1';p.render();
 assert.equal(p.medias().length,1);p.filter='video';p.applyFilter();assert.equal(p.active,undefined);p.filter='';p.applyFilter();assert.equal(p.active,'1');p.query='空镜';p.applyFilter();assert.equal(p.active,'3');p.query='';p.applyFilter();
 p.pick('1');p.move('1','2');assert.equal(p.rows[0].id,'2');assert.equal(p.active,'1');p.rows.sort((a,b)=>p.original.indexOf(a.id)-p.original.indexOf(b.id));assert.deepEqual(p.rows.map(x=>x.id),['1','2','3']);
 let prevented=false;p.key({code:'ArrowRight',target:{closest:()=>true},preventDefault(){prevented=true}});assert.equal(p.active,'1');assert.equal(prevented,false);p.key({code:'ArrowRight',target:{closest:()=>false},preventDefault(){}});assert.equal(p.active,'2');
 p.selected=new Set(['1','2','3']);await p.export();assert.equal(requests.length,1,'shared reference should download once');assert.equal(blobs.length,1);assert.match(p.status.textContent,/1 项缺失/);assert.equal(JSON.parse(files.find(f=>f.n==='素材与切片清单.json').v).length,2);
 files.length=0;fail=true;await p.export();assert.equal(blobs.length,1,'all failures must not create empty zip');assert.match(p.status.textContent,/导出失败/);fail=false;
 p.rows=[sample('v',{videos:[{id:'video-1',src:'/clip.mp4',name:'视频',start:3,end:5,source:'track'}]})];p.original=['v'];p.active='v';p.mode='video';p.render();const v=p.video;v.onloadedmetadata();assert.equal(v.currentTime,3);assert.equal(p.seek.max,'2');v.currentTime=9;v.onseeking();assert.equal(v.currentTime,5);v.currentTime=1;v.onseeking();assert.equal(v.currentTime,3);
 v.readyState=0;p.play();assert.equal(p.playing,true,'play must start loading even with metadata-only preload');assert.equal(p.pendingPlay,false);p.stop();assert.equal(p.pendingPlay,false);assert.equal(p.playing,false);
 v.duration=2;v.onloadedmetadata();assert.equal(p.playButton.disabled,true);assert.match(p.status.textContent,/起点超过/);
 console.log('PASS: search/empty filters, stable active identity on sorting, keyboard input isolation, export deduplication and partial failure, no empty ZIP, seek bounds, loading-to-play continuation, stop cleanup, short-video guard');
})().catch(e=>{console.error(e);process.exitCode=1});
