import * as THREE from 'three';
import { COCKPITS, drawCockpitPanel } from './cockpit-panel.js';
import { normalizeCustomization, CHARM_COLORS } from '../core/customization.js';
import { random } from '../core/seed.js';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const DOWN=new THREE.Vector3(0,-1,0);
function release(group) {
  const geometries=new Set(),materials=new Set(),textures=new Set();
  group.traverse(object=>{if(object.geometry)geometries.add(object.geometry);for(const material of [object.material].flat().filter(Boolean)){materials.add(material);if(material.map)textures.add(material.map);}});
  textures.forEach(texture=>texture.dispose());geometries.forEach(geometry=>geometry.dispose());materials.forEach(material=>material.dispose());group.clear();
}
function box(parent,name,size,position,material) {
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(...size),material);mesh.name=name;mesh.position.set(...position);parent.add(mesh);return mesh;
}
function bar(parent,from,to,radius,material) {
  const a=new THREE.Vector3(...from),b=new THREE.Vector3(...to);
  const mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,a.distanceTo(b),6),material);
  mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),b.sub(a).normalize());parent.add(mesh);return mesh;
}
function texture(canvas) { const result=new THREE.CanvasTexture(canvas);result.colorSpace=THREE.SRGBColorSpace;result.anisotropy=4;return result; }
function diceTexture(color) {
  const canvas=document.createElement('canvas');canvas.width=288;canvas.height=192;const c=canvas.getContext('2d'),rng=random(`fuzzy:${color}`);
  const pips=[[[.5,.5]],[[.25,.25],[.75,.75]],[[.25,.25],[.5,.5],[.75,.75]],[[.25,.25],[.75,.25],[.25,.75],[.75,.75]],[[.25,.25],[.75,.25],[.5,.5],[.25,.75],[.75,.75]],[[.25,.22],[.75,.22],[.25,.5],[.75,.5],[.25,.78],[.75,.78]]];
  for(let face=0;face<6;face++){const x=face%3*96,y=Math.floor(face/3)*96;c.fillStyle=color;c.fillRect(x,y,96,96);for(let n=0;n<500;n++){c.fillStyle=n%2?'#ffffff18':'#00000014';c.fillRect(x+rng()*96,y+rng()*96,1,1);}c.fillStyle=color===CHARM_COLORS.cream?'#293b35':'#f7ead1';for(const[px,py]of pips[face]){c.beginPath();c.arc(x+px*96,y+py*96,7,0,7);c.fill();}}
  return texture(canvas);
}
function roundedDiceGeometry() {
  const geometry=new THREE.BoxGeometry(.069,.069,.069,4,4,4),p=geometry.attributes.position,uv=geometry.attributes.uv,v=new THREE.Vector3(),inside=new THREE.Vector3();
  for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i);inside.copy(v).clampScalar(-.026,.026);v.sub(inside).normalize().multiplyScalar(.0085).add(inside);p.setXYZ(i,v.x,v.y,v.z);}
  for(let face=0;face<6;face++)for(let i=face*25;i<(face+1)*25;i++)uv.setXY(i,(face%3+uv.getX(i))/3,(1-Math.floor(face/3)+uv.getY(i))/2);
  geometry.computeVertexNormals();return geometry;
}
function postcard() {
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=200;const c=canvas.getContext('2d');c.fillStyle='#eadfc2';c.fillRect(0,0,256,200);c.fillStyle='#a6c7ba';c.fillRect(12,12,232,142);
  c.fillStyle='#e3b86b';c.beginPath();c.arc(188,51,24,0,7);c.fill();c.fillStyle='#5b8578';c.beginPath();c.moveTo(12,154);c.lineTo(74,49);c.lineTo(138,135);c.lineTo(188,74);c.lineTo(244,154);c.fill();c.fillStyle='#f2ead6';c.beginPath();c.moveTo(57,77);c.lineTo(74,49);c.lineTo(94,77);c.fill();c.fillStyle='#455c4d';c.font='bold 15px monospace';c.textAlign='center';c.fillText('TAKE THE SCENIC ROUTE',128,181);return texture(canvas);
}

export class Cockpit {
  constructor(parent) {
    this.parent=parent;this.group=new THREE.Group();this.group.name='aircraft-cockpit';parent.add(this.group);this.group.visible=false;
    this.sway=new THREE.Vector2();this.swaySpeed=new THREE.Vector2();this.localGravity=new THREE.Vector3();this.inverse=new THREE.Quaternion();this.panelClock=0;this.signature='';this.aspect=0;
  }
  setAircraft(data,value) {
    release(this.group);this.compassCanvas=null;this.compassTexture=null;this.data=data;this.spec=COCKPITS[data.id];this.aspect=0;this.signature='';this.sway.set(0,0);this.swaySpeed.set(0,0);
    this.frame=new THREE.Group();this.group.add(this.frame);
    const standard=color=>new THREE.MeshStandardMaterial({color,roughness:.82,metalness:.16});
    const frameMat=standard(this.spec.frame),dark=standard('#1a2525'),edge=standard(this.data.id==='c172'?'#d9d6bd':'#626f66'),rubber=standard('#172222');
    const thickness={bubble:.022,wide:.028,stealth:.032,split:.04,armored:.052,arch:.038,naval:.047,civil:.035}[this.spec.canopy];
    const arch=['arch','naval','bubble'].includes(this.spec.canopy);
    for(const side of [-1,1]) {
      bar(this.frame,[side*1.44,-.82,-1.05],[side*.84,1,-1.23],thickness,frameMat);
      bar(this.frame,[side*1.12,-.52,-1.02],[side*1.39,-.91,-.61],.055,frameMat);
      box(this.frame,'canopy-latch',[.11,.035,.04],[side*1.16,-.41,-1.1],edge);
      if(['armored','split','naval'].includes(this.spec.canopy)){
        bar(this.frame,[side*.72,-.31,-1.42],[side*.42,.76,-1.6],thickness*.78,frameMat);
        bar(this.frame,[side*.42,.76,-1.6],[side*.84,1,-1.23],thickness*.78,frameMat);
      }
    }
    if(['armored','split','naval'].includes(this.spec.canopy))bar(this.frame,[-.42,.76,-1.6],[.42,.76,-1.6],thickness*.78,frameMat);
    if(arch){for(let i=0;i<14;i++){const a=i/14*Math.PI,b=(i+1)/14*Math.PI;bar(this.frame,[Math.cos(a)*.97,.78+Math.sin(a)*.21,-1.2],[Math.cos(b)*.97,.78+Math.sin(b)*.21,-1.2],thickness,frameMat);}}
    if(this.spec.canopy==='civil') {
      bar(this.frame,[0,.65,-1.45],[0,1.3,-.9],.018,frameMat);
      const compassGroup=new THREE.Group();this.group.add(compassGroup);
      box(compassGroup,'overhead-compass',[.19,.10,.10],[0,.62,-1.45],dark);
      this.compassCanvas=document.createElement('canvas');this.compassCanvas.width=192;this.compassCanvas.height=64;
      this.compassTexture=texture(this.compassCanvas);
      box(compassGroup,'compass-face',[.16,.067,.004],[0,.62,-1.397],new THREE.MeshBasicMaterial({map:this.compassTexture}));
      for(const side of [-1,1])box(this.frame,'sun-visor',[.48,.15,.025],[side*.62,.72,-1.16],standard('#727d64'));
      box(this.frame,'cabin-roof',[2.2,.17,.7],[0,1.02,-.9],frameMat);
    }
    this.panel=new THREE.Group();this.frame.add(this.panel);
    box(this.panel,'instrument-case',[2.76,.68,.15],[0,-.70,-1.62],frameMat);
    const coaming=box(this.panel,'padded-coaming',[2.85,.075,.29],[0,-.337,-1.51],dark);coaming.rotation.x=-.05;
    this.canvas=document.createElement('canvas');this.canvas.width=1024;this.canvas.height=320;this.panelTexture=texture(this.canvas);
    this.panelFace=box(this.panel,'instrument-panel',[2.64,.62,.012],[0,-.70,-1.534],new THREE.MeshBasicMaterial({map:this.panelTexture}));
    const sideMat=standard(this.data.id==='p51'?'#62664d':this.data.id==='f4u'?'#334c58':this.spec.frame);
    for(const side of [-1,1]){
      box(this.frame,'side-console',[.24,.25,.73],[side*1.2,-.77,-.9],sideMat);
      for(let i=0;i<5;i++)bar(this.frame,[side*1.2,-.62,-.62-i*.105],[side*1.2,-.585,-.62-i*.105],.009,edge);
    }
    this.control=new THREE.Group();this.group.add(this.control);this.control.position.set(this.spec.controls==='side'?.65:0,-.68,-.91);
    if(this.spec.controls==='yoke'){
      bar(this.control,[0,-.14,0],[0,.02,-.12],.022,rubber);bar(this.control,[-.22,.1,-.12],[.22,.1,-.12],.017,rubber);
      for(const side of [-1,1]){bar(this.control,[side*.22,.1,-.12],[side*.25,.22,-.12],.023,rubber);box(this.control,'yoke-grip',[.055,.12,.045],[side*.25,.18,-.12],rubber);}
    }else{bar(this.control,[0,-.12,0],[0,.12,-.025],.022,rubber);const grip=box(this.control,'control-grip',[.055,.12,.065],[0,.15,-.025],rubber);grip.rotation.x=-.15;box(this.control,'trim-button',[.024,.012,.015],[.017,.2,-.06],edge);}
    this.throttle=new THREE.Group();this.group.add(this.throttle);this.throttle.position.set(-.93,-.64,-.91);bar(this.throttle,[0,-.12,0],[0,.04,-.025],.014,dark);box(this.throttle,'throttle-grip',[.1,.045,.055],[0,.05,-.025],rubber);
    this.decor=new THREE.Group();this.group.add(this.decor);this.setAppearance(value);
  }
  setAppearance(value) {
    this.appearance=normalizeCustomization(value);this.panelClock=1;
    const signature=JSON.stringify([this.appearance.hanging,this.appearance.color,this.appearance.dashboard]);
    if(signature===this.signature)return;
    this.signature=signature;release(this.decor);this.hanging=null;this.dash=null;
    const color=CHARM_COLORS[this.appearance.color],mat=new THREE.MeshStandardMaterial({color,roughness:1});
    if(this.appearance.hanging!=='none'){
      this.hanging=new THREE.Group();this.hanging.name=this.appearance.hanging;this.decor.add(this.hanging);
      const thread=new THREE.MeshBasicMaterial({color:'#e4d7ba'});
      if(this.appearance.hanging==='dice'){
        const material=new THREE.MeshStandardMaterial({map:diceTexture(color),roughness:1}),geometry=roundedDiceGeometry();
        for(let i=0;i<2;i++){const x=(i-.5)*.09,y=-.28-i*.06;bar(this.hanging,[0,0,0],[x,y+.034,i*.025],.0018,thread);const die=new THREE.Mesh(geometry,material);die.name='fuzzy-die';die.position.set(x,y,i*.025);die.rotation.set(.22+i*.18,.35+i*.6,i*.22);this.hanging.add(die);}
        mat.dispose();
      }else if(this.appearance.hanging==='mini-plane'){
        bar(this.hanging,[0,0,0],[0,-.27,0],.0018,thread);const mini=new THREE.Group();mini.name='hanging-mini-plane';mini.position.y=-.3;mini.rotation.set(.2,-.2,-.12);this.hanging.add(mini);
        box(mini,'toy-fuselage',[.018,.025,.13],[0,0,0],mat);box(mini,'toy-wing',[.16,.008,.045],[0,0,-.02],mat);box(mini,'toy-tail',[.065,.008,.025],[0,.004,.05],mat);box(mini,'toy-fin',[.008,.037,.03],[0,.018,.045],mat);
      }else{
        bar(this.hanging,[0,0,0],[0,-.22,0],.0018,thread);const shape=new THREE.Shape();[[0,.055],[.025,.021],[.012,.021],[.043,-.018],[.02,-.018],[.056,-.06],[.012,-.06],[.012,-.077],[-.012,-.077],[-.012,-.06],[-.056,-.06],[-.02,-.018],[-.043,-.018],[-.012,.021],[-.025,.021]].forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y));shape.closePath();const freshener=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:.006,bevelEnabled:false}),mat);freshener.name='tree-air-freshener';freshener.position.y=-.27;this.hanging.add(freshener);
      }
    }else mat.dispose();
    if(this.appearance.dashboard!=='none') {
      this.dash=new THREE.Group();this.dash.name=`dashboard-${this.appearance.dashboard}`;this.decor.add(this.dash);
      if(this.appearance.dashboard==='photo'){
        box(this.dash,'photo-frame',[.235,.177,.015],[0,.07,0],new THREE.MeshStandardMaterial({color:'#534d38',roughness:.8}));box(this.dash,'mountain-postcard',[.216,.156,.002],[0,.07,.009],new THREE.MeshBasicMaterial({map:postcard()}));this.dash.rotation.set(-.13,.09,-.06);
      }else{
        const yellow=new THREE.MeshStandardMaterial({color:'#dfb64c',roughness:.8}),orange=new THREE.MeshStandardMaterial({color:'#cf713e',roughness:.8}),black=new THREE.MeshBasicMaterial({color:'#23332f'});
        const body=new THREE.Mesh(new THREE.SphereGeometry(.055,8,6),yellow);body.scale.set(1,.72,1.2);body.position.y=.035;this.dash.add(body);
        const head=new THREE.Mesh(new THREE.SphereGeometry(.036,8,6),yellow);head.position.set(0,.09,.025);this.dash.add(head);box(this.dash,'duck-bill',[.042,.015,.035],[0,.088,.06],orange);
        for(const side of[-1,1]){const eye=new THREE.Mesh(new THREE.SphereGeometry(.0045,5,4),black);eye.position.set(side*.024,.105,.05);this.dash.add(eye);}
      }
    }
    this.layout(this.aspect||1.6);this.panelClock=1;
  }
  layout(aspect) {
    const fit=Math.min(1,aspect/1.55);this.fit=fit;this.aspect=aspect;this.frame.scale.x=fit;
    this.control.position.x=(this.spec.controls==='side'?.65:0)*fit;this.throttle.position.x=-.93*fit;
    if(this.hanging)this.hanging.position.set(Math.min(.68,.53*aspect),.76,-1.1);
    if(this.dash)this.dash.position.set((this.appearance.dashboard==='photo'?-.86:.88)*fit,-.33,-1.36);
    const width=Math.max(300,Math.round(1024*fit));if(this.canvas.width!==width){
      this.canvas.width=width;this.panelTexture.dispose();this.panelTexture=texture(this.canvas);
      this.panelFace.material.map=this.panelTexture;this.panelFace.material.needsUpdate=true;this.panelClock=1;
    }
  }
  update(flight,dt,{visible=false,aspect=1.6,units='imperial'}={}) {
    this.group.visible=visible;if(!visible||!this.data)return;
    if(Math.abs(aspect-this.aspect)>.001)this.layout(aspect);
    if(this.units!==units){this.units=units;this.panelClock=1;}
    this.panelClock+=dt;
    if(this.panelClock>=.065){
      drawCockpitPanel(this.canvas,this.data,flight,this.appearance,units);this.panelTexture.needsUpdate=true;this.panelClock=0;
      if(this.compassCanvas){
        const direction=this.localGravity.set(0,0,-1).applyQuaternion(flight.quaternion),heading=(Math.atan2(direction.x,-direction.z)*180/Math.PI+360)%360,c=this.compassCanvas.getContext('2d');
        c.fillStyle='#142a25';c.fillRect(0,0,192,64);c.fillStyle='#eddeb2';c.font='26px monospace';c.textAlign='center';c.fillText(`${String(Math.round(heading)%360).padStart(3,'0')}°`,96,45);c.fillStyle='#c96549';c.fillRect(93,4,6,10);this.compassTexture.needsUpdate=true;
      }
    }
    this.control.rotation.set(flight.controls.pitch*.16,0,flight.controls.roll*(this.spec.controls==='yoke'?.38:.17));this.throttle.rotation.x=(.5-flight.throttle)*.6;
    if(dt>0&&this.hanging){
      this.inverse.copy(flight.quaternion).invert();this.localGravity.copy(DOWN).applyQuaternion(this.inverse);
      const targetX=clamp(this.localGravity.z*.2+flight.controls.pitch*.1,-.25,.25),targetZ=clamp(-this.localGravity.x*.3-flight.controls.yaw*.12,-.32,.32),step=Math.min(dt,.05);
      this.swaySpeed.x+=(targetX-this.sway.x)*22*step;this.swaySpeed.y+=(targetZ-this.sway.y)*22*step;this.swaySpeed.multiplyScalar(Math.exp(-step*3.4));this.sway.addScaledVector(this.swaySpeed,step);
      this.hanging.rotation.set(clamp(this.sway.x,-.4,.4),Math.sin(flight.elapsed*.8)*.025,clamp(this.sway.y,-.45,.45));
    }
  }
  dispose() { release(this.group);this.parent.remove(this.group); }
}
