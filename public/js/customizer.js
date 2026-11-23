import * as THREE from 'three';
import { STICKERS, STICKER_SLOTS, CHARM_COLORS, normalizeCustomization } from './core/customization.js';
import { createFlight } from './core/flight.js';
import { createAircraft, disposeAircraft } from './render/aircraft.js';
import { applyAircraftCustomization } from './render/aircraft-customization.js';
import { stickerCanvas } from './render/sticker-art.js';
import { Cockpit } from './render/cockpit.js';
const $=id=>document.getElementById(id);

export class Customizer {
  constructor(onChange) {
    this.onChange=onChange;this.slot='leftWing';this.view='plane';this.time=0;
    for(const [value,label]of Object.entries(STICKER_SLOTS)){const option=new Option(label,value);$('sticker-slot').add(option);}
    for(const design of STICKERS){
      const button=document.createElement('button');button.type='button';button.className='sticker-choice';button.dataset.sticker=design.id;button.setAttribute('aria-pressed','false');
      const art=stickerCanvas(design.id,96);art.setAttribute('aria-hidden','true');const label=document.createElement('span');label.textContent=design.name;button.append(art,label);
      button.onclick=()=>{this.value.stickers[this.slot]=design.id;this.setView('plane');this.changed();};$('sticker-choices').append(button);
    }
    for(const [id,color]of Object.entries(CHARM_COLORS)){
      const button=document.createElement('button');button.type='button';button.className='charm-swatch';button.dataset.charmColor=id;button.style.setProperty('--swatch',color);button.setAttribute('aria-label',`${id} charm`);button.setAttribute('aria-pressed','false');button.onclick=()=>{this.value.color=id;this.setView('cockpit');this.changed();};$('charm-colors').append(button);
    }
    $('sticker-slot').onchange=event=>{this.slot=event.target.value;this.sync();this.setView('plane');};
    for(const [id,key]of [['hanging-item','hanging'],['dashboard-item','dashboard'],['cockpit-nameplate','nameplate']])$(id).addEventListener('input',event=>{this.value[key]=event.target.value;this.setView('cockpit');this.changed();});
    for(const view of ['plane','cockpit'])$(`preview-${view}`).onclick=()=>this.setView(view);
    $('customize-reset').onclick=()=>{this.value=normalizeCustomization();this.changed();};
  }
  setupPreview() {
    if(this.renderer)return;
    this.renderer=new THREE.WebGLRenderer({canvas:$('customize-preview'),antialias:true,logarithmicDepthBuffer:true});this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.15;
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#c7d9cb');this.scene.add(new THREE.HemisphereLight('#fff3d5','#667d65',2.6));
    const sun=new THREE.DirectionalLight('#fff1d3',2.8);sun.position.set(-10,16,-12);this.scene.add(sun);
    this.camera=new THREE.PerspectiveCamera(40,1,.05,200);this.scene.add(this.camera);this.cockpit=new Cockpit(this.camera);
    this.backdrop=new THREE.Group();this.scene.add(this.backdrop);const ground=new THREE.Mesh(new THREE.PlaneGeometry(160,160),new THREE.MeshStandardMaterial({color:'#95aa7b',roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.y=-4;this.backdrop.add(ground);
    for(let i=0;i<6;i++){const mountain=new THREE.Mesh(new THREE.ConeGeometry(4+i*.4,8+i,6),new THREE.MeshStandardMaterial({color:i%2?'#899784':'#a8b39b',flatShading:true}));mountain.position.set(-19+i*8,-2,-27-i%2*7);this.backdrop.add(mountain);}
  }
  open(data,value,units) {
    this.data=data;this.value=normalizeCustomization(value);this.units=units;this.slot='leftWing';this.view='plane';this.time=0;
    $('customize-title').textContent=`Make it yours · ${data.name}`;$('customize-save').textContent='Choices save for this plane.';this.sync();
    try{
      this.setupPreview();if(this.model){this.scene.remove(this.model);disposeAircraft(this.model);}
      this.model=createAircraft(data);this.scene.add(this.model);this.cockpit.setAircraft(data,this.value);
      this.demo=createFlight(data,{x:0,y:850,z:0});this.applyPreview();$('customize-preview-error').hidden=true;
    }catch(error){console.warn('Customization preview unavailable',error);$('customize-preview-error').hidden=false;}
    this.setView('plane');
  }
  changed() {
    this.value=normalizeCustomization(this.value);const saved=this.onChange(this.value);
    $('customize-save').textContent=saved?'Saved for this plane.':'Couldn’t save on this device.';this.sync();this.applyPreview();
  }
  applyPreview() { if(!this.model)return;applyAircraftCustomization(this.model,this.value);this.cockpit.setAppearance(this.value); }
  sync() {
    $('sticker-slot').value=this.slot;
    document.querySelectorAll('[data-sticker]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.sticker===this.value.stickers[this.slot])));
    document.querySelectorAll('[data-charm-color]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.charmColor===this.value.color)));
    $('hanging-item').value=this.value.hanging;$('dashboard-item').value=this.value.dashboard;$('cockpit-nameplate').value=this.value.nameplate;
  }
  setView(view) {
    this.view=view;for(const id of ['plane','cockpit'])$(`preview-${id}`).setAttribute('aria-pressed',String(view===id));
  }
  render(dt) {
    if(!this.renderer||!this.model)return;
    this.time+=dt;const canvas=this.renderer.domElement,width=canvas.clientWidth,height=canvas.clientHeight;
    if(width<1||height<1)return;const dpr=this.renderer.getPixelRatio();if(canvas.width!==Math.round(width*dpr)||canvas.height!==Math.round(height*dpr))this.renderer.setSize(width,height,false);
    this.camera.aspect=width/height;
    this.model.visible=this.view==='plane';this.backdrop.visible=this.view==='cockpit';
    if(this.view==='plane'){
      this.camera.fov=38;const isSide=this.slot.endsWith('Side'),size=this.model.userData.airframeBounds.getSize(new THREE.Vector3()),distance=Math.max(size.x,size.z)*(isSide?1.1:1);
      const side=this.slot.startsWith('left')?-1:1;this.camera.position.set(side*distance*(isSide?.9:.65),distance*(isSide?.27:.8),distance*(isSide?-.62:.8));this.camera.lookAt(0,0,0);this.model.rotation.y=Math.sin(this.time*.22)*.12;
      this.cockpit.group.visible=false;
    }else{
      this.camera.fov=68;this.camera.position.set(0,0,0);this.camera.rotation.set(0,0,0);
      this.demo.elapsed=this.time;this.demo.controls.roll=Math.sin(this.time*.8)*.18;this.demo.controls.pitch=Math.sin(this.time*.6)*.12;
      this.demo.quaternion.setFromEuler(new THREE.Euler(this.demo.controls.pitch*.25,0,this.demo.controls.roll*.25));
      this.cockpit.update(this.demo,dt,{visible:true,aspect:this.camera.aspect,units:this.units});
    }
    this.camera.updateProjectionMatrix();this.renderer.render(this.scene,this.camera);
  }
}
