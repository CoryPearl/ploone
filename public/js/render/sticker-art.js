import * as THREE from 'three';
export function stickerCanvas(id, size = 256) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  const c = canvas.getContext('2d'); c.scale(size / 256, size / 256); c.lineJoin = 'round';
  const polygon = (points, fill, stroke = '#f8edcd', width = 9) => {
    c.beginPath(); points.forEach(([x,y],i) => i ? c.lineTo(x,y) : c.moveTo(x,y)); c.closePath(); c.fillStyle = fill; c.fill();
    if(stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); }
  };
  if(id === 'none') { c.strokeStyle='#aaa997';c.lineWidth=9;c.beginPath();c.arc(128,128,70,0,Math.PI*2);c.moveTo(78,178);c.lineTo(178,78);c.stroke(); }
  if(id === 'club') {
    c.fillStyle='#f3e7c9';c.beginPath();c.arc(128,128,111,0,Math.PI*2);c.fill();c.strokeStyle='#36554c';c.lineWidth=11;c.stroke();
    polygon([[48,111],[111,111],[128,48],[145,111],[208,111],[145,143],[145,175],[128,164],[111,175],[111,143]],'#bd5636',null);
    c.fillStyle='#36554c';c.font='bold 26px sans-serif';c.textAlign='center';c.fillText('PLOON CLUB',128,212);
  }
  if(id === 'bolt') polygon([[141,15],[46,144],[113,144],[91,241],[216,98],[150,98],[174,15]],'#edbe54','#342f30',11);
  if(id === 'sunset') {
    c.save();c.beginPath();c.arc(128,128,110,0,Math.PI*2);c.clip();c.fillStyle='#e7c777';c.fillRect(0,0,256,256);
    ['#eab46a','#d97e52','#b55042','#7b5250'].forEach((color,i)=>{c.fillStyle=color;c.fillRect(0,114+i*28,256,28);});
    polygon([[0,238],[67,131],[112,185],[166,105],[256,238]],'#2b5451',null);c.restore();c.strokeStyle='#f6e7c8';c.lineWidth=9;c.beginPath();c.arc(128,128,110,0,Math.PI*2);c.stroke();
  }
  if(id === 'star') {
    const points=Array.from({length:10},(_,i)=>{const a=i*Math.PI/5-Math.PI/2,r=i%2?48:111;return[128+Math.cos(a)*r,128+Math.sin(a)*r];});polygon(points,'#e7c161','#35574e',11);
  }
  if(id === 'checker') {
    c.save();c.beginPath();c.arc(128,128,110,0,Math.PI*2);c.clip();for(let y=0;y<8;y++)for(let x=0;x<8;x++){c.fillStyle=(x+y)%2?'#283b39':'#f0e7d0';c.fillRect(x*32,y*32,32,32);}c.restore();c.strokeStyle='#e3b86b';c.lineWidth=9;c.beginPath();c.arc(128,128,110,0,Math.PI*2);c.stroke();
  }
  if(id === 'shark') {
    polygon([[18,70],[219,87],[242,168],[211,209],[28,164]],'#b5483f','#e9ddbc',10);
    for(let i=0;i<5;i++)polygon([[32+i*35,91+i*2],[64+i*35,93+i*2],[48+i*35,137+i*2]],'#f8edcd',null);
    for(let i=0;i<5;i++)polygon([[35+i*35,164+i*5],[69+i*35,172+i*5],[54+i*35,139+i*3]],'#f8edcd',null);
  }
  return canvas;
}
export function stickerTexture(id) {
  const texture=new THREE.CanvasTexture(stickerCanvas(id));texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;return texture;
}
