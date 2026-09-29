(function(root){
 'use strict';
 const sources={'sticker-1':'/workflow-stickers/smile.svg','sticker-2':'/workflow-stickers/star.svg'};
 function resolve(source){return sources[source]||source;}
 async function load(source){
  const image=new Image();image.crossOrigin='anonymous';
  await new Promise((done,fail)=>{image.onload=done;image.onerror=()=>fail(new Error('贴纸加载失败'));image.src=resolve(source);});
  if(!image.naturalWidth||!image.naturalHeight)throw new Error('贴纸尺寸无效');
  return createImageBitmap(image);
 }
 root.ToonflowSticker={resolve,load};
})(typeof window==='undefined'?globalThis:window);
