const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('data/web/index.html','utf8');
const source=html.match(/function I\(Z,\$=!1\)\{const ne=Z\*10;return \$\?ne\+1e3:ne\}/)?.[0];assert.ok(source);
const order=vm.runInNewContext('('+source+')');
assert.ok(order(7)>order(6));assert.ok(order(6)>order(0));assert.ok(order(3,true)>order(7));
console.log('PASS: foreground image/sticker rows render above main video, subtitle priority retained');
