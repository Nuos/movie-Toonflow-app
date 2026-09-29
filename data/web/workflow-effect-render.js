(function(root){
  'use strict';
  function draw(ctx, frame, width, height, effect = {}, filter = 'none') {
    ctx.save();
    try {
      ctx.setTransform(1,0,0,1,0,0);
      ctx.clearRect(0,0,width,height);
      ctx.filter=filter;
      ctx.globalAlpha=Math.max(0,Math.min(1,effect.opacity ?? 1));
      ctx.translate(width/2,height/2);
      const expression=/([a-zA-Z]+)\(([^)]*)\)/g;
      for (const match of String(effect.transform || '').matchAll(expression)) {
        const values=match[2].split(/[,\s]+/).filter(Boolean);
        const numbers=values.map(parseFloat);
        if(numbers.some(n=>!Number.isFinite(n)))continue;
        switch(match[1]) {
          case 'scale': ctx.scale(numbers[0],numbers[1] ?? numbers[0]);break;
          case 'translate': ctx.translate(numbers[0],numbers[1] ?? 0);break;
          case 'translateX': ctx.translate(numbers[0]*(values[0].endsWith('%')?width/100:1),0);break;
          case 'rotate': ctx.rotate(numbers[0]*Math.PI/180);break;
        }
      }
      ctx.translate(-width/2,-height/2);
      ctx.drawImage(frame,0,0);
    } finally {ctx.restore();}
  }
  root.ToonflowEffectRender={draw};
})(typeof window==='undefined'?globalThis:window);
