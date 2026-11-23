import * as THREE from 'three';
import { supportsAfterburner } from '../core/aircraft-data.js';
import { MODEL_SPECS } from './aircraft-specs.js';
import { mesh, loft, wing, fin as fixedFin, plate, beam, disc } from './aircraft-geometry.js';
import { articulatedWing, articulatedFin, animateControlSurfaces } from './control-surfaces.js';
import { addLandingGear, animateLandingGear } from './landing-gear.js';

function materials(data, ghost) {
  const make = (color, options = {}) => new THREE.MeshStandardMaterial({
    color: ghost ? '#83e5df' : color, roughness: .7, metalness: .12, flatShading: true,
    side: THREE.DoubleSide, ...options, transparent: ghost, opacity: ghost ? .28 : 1, depthWrite: !ghost
  });
  const paints = {
    f16: ['#a7b1b6', '#7e8b94'], fa18: ['#a0afb8', '#71838d'],
    f22: ['#8f9da2', '#64777f'], f35: ['#7d8b94', '#53656f'],
    a10: ['#929f94', '#637c6c'], p51: ['#bfc6c8', '#bb4f39'],
    f4u: ['#284d6b', '#1b3650'], c172: ['#f0ede3', '#b6503a']
  }[data.id];
  return {
    body: make(paints[0]), shade: make(paints[1]), edge: make(new THREE.Color(paints[0]).multiplyScalar(.78)),
    accent: make(data.accent), dark: make('#24313a'), metal: make('#58636a', { metalness: .45, roughness: .5 }),
    glass: make(['f22', 'f35'].includes(data.id) ? '#887957' : '#3c6675', { metalness: .25, roughness: .23 }),
    white: make('#e4e6de'), rubber: make('#2b3033'), red: make('#bd4b39'), green: make('#568b6b')
  };
}

function wings(group, stations, mat, name = 'main-wing') {
  for (const side of [-1, 1]) {
    const partName = name + (side < 0 ? '-left' : '-right');
    if (name === 'main-wing' || name === 'horizontal-tail') articulatedWing(group, partName, stations, mat, side, name === 'horizontal-tail');
    else wing(group, partName, stations, mat, side);
  }
}
function fin(group, name, ...args) {
  return name === 'vertical-tail' ? articulatedFin(group, name, ...args) : fixedFin(group, name, ...args);
}
function canopy(group, mat, z, y, halfLength, width, height) {
  loft(group, 'cockpit-sill', [[z-halfLength-.12,.03,y+.02,y-.13],[z-halfLength*.55,width+.08,y+.07,y-.16],[z+halfLength*.65,width+.03,y+.02,y-.13],[z+halfLength+.12,.03,y,y-.1]], mat.dark, { sides: 8 });
  loft(group, 'canopy', [[z-halfLength,.025,y+.03,y-.01],[z-halfLength*.5,width*.82,y+height*.82,y],[z+halfLength*.12,width,y+height,y],[z+halfLength*.65,width*.75,y+height*.75,y],[z+halfLength,.04,y+.04,y]], mat.glass, { sides: 10 });
  const front = z-halfLength*.5;
  beam(group, 'windscreen-frame-left', [-width*.82,y,front], [0,y+height*.84,front], .025, mat.edge);
  beam(group, 'windscreen-frame-right', [0,y+height*.84,front], [width*.82,y,front], .025, mat.edge);
}
function rearNozzle(group, mat, x, y, z, radius, rectangular = false) {
  const nozzle = new THREE.Group(); nozzle.name = 'engine-nozzle'; nozzle.position.set(x,y,z); group.add(nozzle);
  if (rectangular) {
    loft(nozzle, 'nozzle-casing', [[-.8,.69,.4,-.4],[0,.63,.29,-.29]], mat.metal, { box: true });
    mesh(nozzle, 'nozzle-opening', new THREE.PlaneGeometry(1.07,.43), mat.dark, 0,0,.012);
    for (const height of [-.31,.31]) mesh(nozzle, 'vectoring-petal', new THREE.BoxGeometry(1.22,.07,.7), mat.edge, 0,height,-.26);
  } else {
    loft(nozzle, 'nozzle-casing', [[-.65,radius*1.1,radius*1.1,-radius*1.1],[0,radius,radius,-radius]], mat.metal);
    const opening = disc(nozzle, 'nozzle-opening', 0,0,.012,radius*.87,mat.dark); opening.rotation.y = 0;
    mesh(nozzle,'nozzle-rim',new THREE.TorusGeometry(radius*.94,radius*.07,4,12),mat.edge,0,0,.018);
  }
  group.userData.nozzles.push({ x, y, z: z+.04, radius, rectangular });
}
function sideIntakes(group, mat, { x, y, z, width, height, rearZ, rearX = x, rearWidth = width*.75 }) {
  for (const side of [-1,1]) {
    const intake = new THREE.Group(); intake.name = 'engine-intake'; group.add(intake);
    loft(intake, 'intake-duct', [[z,width/2,height/2,-height/2],[z+.65,width*.63,height*.56,-height*.55],[rearZ,rearWidth/2,height*.36,-height*.45,side*(rearX-x)]], mat.body, { box: true });
    intake.position.set(side*x,y,0);
    const mouth = [[-width*.42,-height*.35,z-.018],[width*.42,-height*.35,z-.018],[width*.44,height*.35,z-.018],[-width*.3,height*.4,z-.018]];
    plate(intake,'intake-opening',mouth,mat.dark);
    beam(intake,'intake-lip',mouth[2],mouth[3],.055,mat.edge);
  }
}
function twinFins(group, mat, x, y, points, cant) {
  for (const side of [-1,1]) fin(group,'vertical-tail',side*x,y,points,mat.body,-side*cant);
}
function wingtipLights(group, mat, x, y, z) {
  for (const side of [-1,1]) mesh(group,'navigation-light',new THREE.SphereGeometry(.065,5,4),side<0?mat.red:mat.green,side*x,y,z);
}

function buildF16(group, mat) {
  loft(group,'radome',[[-7.4,.025,.01,-.02],[-6.4,.30,.26,-.28],[-5.25,.54,.44,-.40]],mat.shade);
  loft(group,'fuselage',[[-5.25,.54,.44,-.40],[-3.6,.66,.72,-.5],[-1.6,.73,.62,-.72],[.6,.77,.54,-.77],[3.8,.65,.5,-.57],[6.9,.48,.4,-.42]],mat.body);
  canopy(group,mat,-3.5,.64,1.42,.52,.65);
  const intake=new THREE.Group(); intake.name='engine-intake'; group.add(intake);
  loft(intake,'chin-intake',[[-3.35,.59,-.35,-1.15],[-2.65,.66,-.32,-1.17],[.6,.62,-.35,-.84]],mat.body);
  plate(intake,'intake-opening',[[-.51,-.47,-3.365],[.51,-.47,-3.365],[.43,-1.03,-3.365],[-.43,-1.03,-3.365]],mat.dark);
  beam(intake,'intake-divider',[-.52,-.42,-3.39],[.52,-.42,-3.39],.045,mat.edge);
  wings(group,[[.62,-2.2,3.4,-.05,.28],[2.4,-.65,3.35,.02,.17],[4.82,1.15,3.28,.1,.08]],mat.body);
  wings(group,[[.5,-4.0,1.4,.13,.15],[1.2,-1.6,1.7,.08,.09]],mat.body,'root-strake');
  wings(group,[[.38,3.6,6.95,.05,.16],[2.85,5.20,7.12,-.04,.07]],mat.shade,'horizontal-tail');
  fin(group,'vertical-tail',0,.48,[[2.4,0],[4.3,2.7],[5.85,2.8],[6.55,0]],mat.body);
  for(const side of [-1,1]) fin(group,'ventral-fin',side*.62,-.48,[[4.1,0],[5.45,-.64],[6.0,-.6],[5.65,0]],mat.shade,side*.25);
  for(const side of [-1,1]) loft(group,'wingtip-rail',[[.96,.055,.08,-.08],[3.4,.055,.08,-.08]],mat.metal,{x:side*4.85,sides:6});
  rearNozzle(group,mat,0,0,7.24,.49); wingtipLights(group,mat,4.86,.13,2.8);
}

function buildHornet(group, mat) {
  loft(group,'radome',[[-9.25,.025,.0,-.02],[-7.6,.31,.28,-.31],[-6.2,.56,.45,-.43]],mat.shade);
  loft(group,'fuselage',[[-6.2,.56,.45,-.43],[-4.7,.65,.76,-.52],[-2,.9,.58,-.65],[.5,1.26,.48,-.66],[4.6,1.12,.43,-.58],[7.4,.98,.32,-.38]],mat.body,{box:true});
  canopy(group,mat,-4.5,.68,1.64,.55,.66);
  sideIntakes(group,mat,{x:1.08,y:-.23,z:-2.8,width:.98,height:.95,rearZ:3.8,rearX:.9});
  wings(group,[[.60,-5.2,2,.22,.18],[1.72,-1.4,2.5,.08,.13]],mat.body,'root-extension');
  wings(group,[[1.03,-1.35,3.6,0,.25],[4.6,.48,3.8,-.04,.13],[6.78,1.7,3.8,-.06,.065]],mat.body);
  wings(group,[[.62,4.7,8.65,.08,.18],[3.9,6.5,9.0,-.25,.08]],mat.shade,'horizontal-tail');
  twinFins(group,mat,1.25,.48,[[2.55,0],[4.75,2.85],[6.6,2.85],[7.25,0]],.29);
  for(const side of [-1,1]) {
    loft(group,'engine-fairing',[[1,.57,.26,-.72],[5.5,.63,.34,-.64],[8.2,.49,.23,-.49]],mat.body,{x:side*.72});
    rearNozzle(group,mat,side*.72,-.12,8.75,.5);
    loft(group,'wingtip-rail',[[1.2,.055,.07,-.07],[4.2,.055,.07,-.07]],mat.metal,{x:side*6.8,sides:6});
  }
  wingtipLights(group,mat,6.8,.01,3.6);
}

function buildRaptor(group, mat) {
  loft(group,'radome',[[-9.45,.018,.0,-.015],[-7.9,.5,.24,-.27],[-6.6,.82,.47,-.41]],mat.shade,{box:true});
  loft(group,'fuselage',[[-6.6,.82,.47,-.41],[-4.2,1.05,.77,-.57],[-2.3,1.68,.62,-.73],[.8,1.82,.53,-.67],[4.5,1.53,.46,-.57],[8.6,1.32,.22,-.32]],mat.body,{box:true});
  canopy(group,mat,-4.4,.68,1.55,.62,.66);
  sideIntakes(group,mat,{x:1.34,y:-.13,z:-3.55,width:1.05,height:1.05,rearZ:3.3,rearX:1.0,rearWidth:1.15});
  wings(group,[[1.15,-3.25,5.0,.05,.28],[4.7,.05,3.7,.04,.13],[6.8,1.95,2.85,.08,.07]],mat.body);
  wings(group,[[1.3,-1.0,3.6,.18,.025],[4.1,.65,2.75,.13,.025],[5.15,1.55,2.3,.11,.025]],mat.shade,'wing-panel');
  wings(group,[[.9,4.6,8.9,.03,.19],[4.15,6.65,9.35,-.09,.07]],mat.body,'horizontal-tail');
  twinFins(group,mat,1.6,.45,[[2.85,0],[5.0,2.9],[6.95,2.65],[7.8,0]],.44);
  for(const side of [-1,1]) rearNozzle(group,mat,side*.79,-.12,8.94,.62,true);
  wingtipLights(group,mat,6.76,.12,2.6);
}

function buildLightning(group, mat) {
  loft(group,'radome',[[-7.85,.025,.01,-.02],[-6.4,.43,.25,-.31],[-5.25,.71,.5,-.47]],mat.shade,{box:true});
  loft(group,'fuselage',[[-5.25,.71,.5,-.47],[-3.8,.83,.88,-.7],[-1.8,1.12,.78,-.83],[.8,1.28,.72,-.77],[3.6,.91,.6,-.65],[6.9,.62,.46,-.58]],mat.body,{box:true});
  canopy(group,mat,-3.5,.78,1.36,.55,.64);
  sideIntakes(group,mat,{x:1.02,y:-.09,z:-2.8,width:.75,height:.96,rearZ:2.1,rearX:.8});
  wings(group,[[.85,-2.05,3.75,.05,.26],[3.8,.35,3.75,.02,.13],[5.35,1.50,3.65,.07,.065]],mat.body);
  wings(group,[[.63,-3.25,.3,.22,.12],[1.65,-.9,1.3,.12,.07]],mat.body,'chine');
  wings(group,[[.57,3.7,6.95,-.07,.17],[3.2,5.25,7.2,-.12,.07]],mat.body,'horizontal-tail');
  twinFins(group,mat,1.12,.57,[[2.0,0],[4.35,2.35],[5.9,2.45],[6.5,0]],.43);
  rearNozzle(group,mat,0,-.03,7.65,.62); wingtipLights(group,mat,5.32,.12,3.4);
}

function turbofan(group,mat,x,y,front,back) {
  const engine=new THREE.Group(); engine.name='engine-pod'; engine.position.set(x,y,0); group.add(engine);
  loft(engine,'engine-nacelle',[[front,.79,.79,-.79],[front+.45,.91,.87,-.87],[back-.6,.82,.79,-.79],[back,.61,.57,-.57]],mat.body);
  disc(engine,'fan-inlet',0,0,front-.015,.72,mat.dark);
  mesh(engine,'intake-rim',new THREE.TorusGeometry(.77,.065,4,12),mat.edge,0,0,front-.03);
  for(let i=0;i<7;i++){
    const angle=i/7*Math.PI*2;
    const blade=mesh(engine,'fan-blade',new THREE.BoxGeometry(.055,.48,.025),mat.metal,Math.sin(angle)*.33,Math.cos(angle)*.33,front-.025); blade.rotation.z=-angle;
  }
  const spinner=mesh(engine,'fan-hub',new THREE.ConeGeometry(.19,.28,8),mat.metal,0,0,front-.13); spinner.rotation.x=-Math.PI/2;
  const exhaust=disc(engine,'engine-exit',0,0,back+.015,.5,mat.dark); exhaust.rotation.y=0;
}
function buildWarthog(group,mat) {
  loft(group,'fuselage',[[-8.03,.18,.13,-.15],[-7.2,.60,.48,-.62],[-5,.76,.72,-.8],[-2.2,.86,.58,-.85],[1.8,.72,.45,-.7],[4.7,.48,.33,-.45],[7.65,.14,.14,-.17]],mat.body);
  canopy(group,mat,-4.7,.65,1.45,.59,.79);
  wings(group,[[.65,-1.95,1.7,-.25,.40],[6.5,-1.6,1.6,-.2,.23],[8.45,-1.12,1.38,-.05,.13],[8.765,-.87,1.12,.25,.08]],mat.body);
  wings(group,[[.3,5.3,7.55,.14,.24],[3.7,5.45,7.6,.25,.14]],mat.body,'horizontal-tail');
  twinFins(group,mat,3.12,.25,[[5.15,0],[5.5,1.75],[6.25,2.0],[7.5,1.8],[7.75,0]],0);
  for(const side of [-1,1]) {
    beam(group,'engine-pylon',[side*.5,.4,3.5],[side*1.65,1.35,3.5],.22,mat.shade);
    turbofan(group,mat,side*1.68,1.35,1.25,5.95);
  }
  const gun=loft(group,'gun-muzzle',[[-8.13,.13,.12,-.12],[-7.65,.16,.15,-.15]],mat.metal,{x:.16,sides:8}); gun.position.y=-.22;
  for(let i=0;i<7;i++) disc(group,'muzzle-port',.16+Math.cos(i/7*Math.PI*2)*.075,-.22+Math.sin(i/7*Math.PI*2)*.075,-8.145,.022,mat.dark);
  wingtipLights(group,mat,8.65,.25,1.05);
}

function propeller(group,mat,{z,radius,blades,spinnerRadius,spinnerLength}) {
  const hub=new THREE.Group(); hub.name='propeller'; hub.position.z=z; group.add(hub);
  const bladeMaterials=[mat.dark.clone(),mat.accent.clone()];
  bladeMaterials.forEach(material=>{material.transparent=true;material.depthWrite=false;material.forceSinglePass=true;material.userData.baseOpacity=material.opacity;});
  const bladeGroups=[];
  for(let i=0;i<blades;i++) {
    const bladeGroup=new THREE.Group(); bladeGroup.name='propeller-blade'; bladeGroup.rotation.z=i/blades*Math.PI*2; hub.add(bladeGroup);
    plate(bladeGroup,'blade',[[.05,.12,0],[.16,radius*.46,-.045],[.13,radius*.88,-.075],[-.03,radius,-.035],[-.12,radius*.87,.025],[-.09,radius*.4,.04]],bladeMaterials[0]);
    plate(bladeGroup,'blade-tip',[[-.07,radius*.87,-.08],[.13,radius*.87,-.08],[-.03,radius,-.04]],bladeMaterials[1]);
    bladeGroup.traverse(object=>{object.castShadow=false;}); bladeGroups.push(bladeGroup);
  }
  const spinner=mesh(hub,'spinner',new THREE.ConeGeometry(spinnerRadius,spinnerLength,12),mat.shade,0,0,-spinnerLength*.47); spinner.rotation.x=-Math.PI/2;
  group.userData.propeller=hub;
  group.userData.propellerParts={radius,bladeGroups,bladeMaterials,spinner};
}
function addPropellerBlur(group,ghost) {
  if(!group.userData.propeller)return;
  const {radius,bladeGroups}=group.userData.propellerParts,size=128,pixels=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
    const dx=(x+.5-size/2)/(size/2),dy=(y+.5-size/2)/(size/2),r=Math.hypot(dx,dy);
    const inner=THREE.MathUtils.smoothstep(r,.10,.25),outer=1-THREE.MathUtils.smoothstep(r,.94,1);
    // Broad, curved streaks suggest spinning blades without sharp silhouettes
    // or frame-by-frame flicker. A pale tip band reads against land and sky.
    const streak=(.5+.5*Math.cos(Math.atan2(dy,dx)*bladeGroups.length-r*2.8))**2;
    const tip=THREE.MathUtils.smoothstep(r,.81,.89)*(1-THREE.MathUtils.smoothstep(r,.95,1));
    const offset=(y*size+x)*4;
    pixels[offset]=Math.round(120+tip*107);pixels[offset+1]=Math.round(128+tip*79);pixels[offset+2]=Math.round(117+tip*43);
    pixels[offset+3]=Math.round(inner*outer*(.38+streak*.36+tip*.26)*255);
  }
  const texture=new THREE.DataTexture(pixels,size,size);texture.colorSpace=THREE.SRGBColorSpace;texture.generateMipmaps=true;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.needsUpdate=true;
  const material=new THREE.MeshBasicMaterial({color:ghost?'#83e5df':'#ffffff',map:texture,transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true});
  const blur=new THREE.Mesh(new THREE.CircleGeometry(radius,48),material);blur.name='propeller-blur';blur.position.z=-.025;blur.visible=false;
  group.userData.propeller.add(blur);group.userData.propellerBlur=blur;group.userData.propellerBlurOpacity=ghost ? .10 : .36;
}
function wingInsignia(group,mat,x,y,z,radius) {
  const mark=new THREE.Group(); mark.name='wing-insignia'; mark.position.set(x,y,z); mark.rotation.x=-Math.PI/2; group.add(mark);
  mesh(mark,'roundel',new THREE.CircleGeometry(radius,16),mat.dark);
  mesh(mark,'bars',new THREE.PlaneGeometry(radius*3.2,radius*.56),mat.white,0,0,.006);
  const shape=new THREE.Shape();
  for(let i=0;i<10;i++){const angle=Math.PI/2+i/10*Math.PI*2,r=i%2?radius*.37:radius*.85;const px=Math.cos(angle)*r,py=Math.sin(angle)*r;if(i)shape.lineTo(px,py);else shape.moveTo(px,py);}shape.closePath();
  mesh(mark,'star',new THREE.ShapeGeometry(shape),mat.white,0,0,.01);
}
function buildMustang(group,mat) {
  loft(group,'fuselage',[[-4.48,.28,.35,-.32],[-3.9,.49,.52,-.47],[-1.6,.57,.60,-.58],[.15,.6,.70,-.62],[1.7,.44,.58,-.42],[3.3,.22,.31,-.22],[4.75,.07,.14,-.1]],mat.body,{box:true});
  loft(group,'engine-cowling',[[-4.5,.31,.35,-.32],[-4.1,.46,.49,-.43],[-1.8,.55,.57,-.5]],mat.body,{box:true});
  canopy(group,mat,.1,.62,1.02,.46,.62);
  loft(group,'radiator-scoop',[[-.65,.35,-.47,-.89],[.05,.46,-.49,-1.12],[1.1,.35,-.47,-.98],[2.15,.18,-.36,-.65]],mat.edge,{box:true});
  plate(group,'radiator-opening',[[-.32,-.61,-.67],[.32,-.61,-.67],[.32,-.87,-.67],[-.32,-.87,-.67]],mat.dark);
  wings(group,[[.45,-1.45,1.45,-.3,.28],[3.7,-.55,1.28,-.04,.16],[5.32,.0,1.12,.10,.09],[5.64,.26,.87,.13,.045]],mat.body);
  wings(group,[[.18,2.65,4.43,.1,.15],[1.8,3.05,4.25,.25,.08],[2.1,3.35,4.03,.28,.04]],mat.body,'horizontal-tail');
  fin(group,'vertical-tail',0,.15,[[2.45,0],[3.02,.75],[3.24,1.7],[3.7,1.94],[4.22,1.65],[4.64,.35],[4.70,0]],mat.shade);
  plate(group,'anti-glare-panel',[[-.29,.585,-3.9],[.29,.585,-3.9],[.4,.68,-1.55],[-.4,.68,-1.55]],mat.dark);
  propeller(group,mat,{z:-4.49,radius:1.69,blades:4,spinnerRadius:.33,spinnerLength:.43});
  wingInsignia(group,mat,-3.45,.095,.37,.37); wingtipLights(group,mat,5.55,.16,.72);
}

function buildCorsair(group,mat) {
  loft(group,'fuselage',[[-3.85,.76,.70,-.70],[-2.5,.74,.72,-.68],[-.65,.64,.65,-.62],[.8,.61,.67,-.54],[2.6,.36,.43,-.35],[4.95,.09,.12,-.14]],mat.body);
  loft(group,'radial-cowling',[[-4.78,.61,.60,-.60],[-4.58,.80,.76,-.76],[-3.05,.80,.77,-.74],[-2.85,.73,.68,-.64]],mat.body);
  disc(group,'radial-engine-face',0,0,-4.795,.59,mat.dark);
  for(let i=0;i<9;i++){const angle=i/9*Math.PI*2;const cylinder=mesh(group,'radial-cylinder',new THREE.BoxGeometry(.15,.26,.06),mat.metal,Math.sin(angle)*.4,Math.cos(angle)*.4,-4.81);cylinder.rotation.z=-angle;}
  canopy(group,mat,.42,.6,1.02,.49,.63);
  wings(group,[[.53,-1.8,.92,-.13,.32],[1.85,-1.28,1.13,-.86,.27],[2.25,-1.09,1.18,-.80,.24],[5.85,.17,1.28,.06,.1],[6.25,.43,1.02,.16,.045]],mat.body);
  wings(group,[[.2,2.65,4.48,.12,.17],[1.8,3.2,4.5,.28,.1],[2.30,3.62,4.24,.33,.05]],mat.body,'horizontal-tail');
  fin(group,'vertical-tail',0,.12,[[2.45,0],[2.95,.6],[3.25,1.73],[3.75,2.05],[4.25,1.89],[4.95,.65],[5.02,0]],mat.body);
  propeller(group,mat,{z:-4.83,radius:2.02,blades:3,spinnerRadius:.22,spinnerLength:.25});
  wingInsignia(group,mat,-4.40,-.12,.49,.43); wingtipLights(group,mat,6.17,.2,.88);
}

function buildSkyhawk(group,mat) {
  loft(group,'fuselage',[[-3.75,.26,.32,-.29],[-3.15,.43,.42,-.4],[-2.1,.51,.48,-.5],[-1.45,.58,1.04,-.49],[.35,.57,1.10,-.47],[1.05,.46,.7,-.39],[2.8,.19,.3,-.19],[4.0,.055,.16,-.1]],mat.body,{box:true});
  plate(group,'windscreen',[[-.47,.44,-2.04],[.47,.44,-2.04],[.48,1.01,-1.43],[-.48,1.01,-1.43]],mat.glass);
  for(const side of [-1,1]){
    const x=side*.586;
    plate(group,'pilot-window',[[x,.37,-1.39],[x,.96,-1.35],[x,.98,-.36],[x,.36,-.36]],mat.glass);
    plate(group,'rear-window',[[x,.37,-.23],[x,.99,-.23],[x,.93,.35],[x,.37,.51]],mat.glass);
    beam(group,'cabin-pillar',[x,.34,-.3],[x,1.0,-.3],.033,mat.body);
    beam(group,'door-stripe',[x,-.02,-1.5],[side*.49,-.02,.78],.045,mat.shade);
    beam(group,'wing-strut',[side*.45,-.35,-.13],[side*3.22,1.12,-.5],.04,mat.body);
  }
  wings(group,[[.43,-1.49,.22,1.13,.21],[3.4,-1.47,.2,1.22,.14],[5.3,-1.06,.11,1.3,.085],[5.5,-.91,-.04,1.32,.04]],mat.body);
  wings(group,[[.1,2.35,3.95,.13,.13],[1.83,2.86,3.93,.24,.07]],mat.body,'horizontal-tail');
  fin(group,'vertical-tail',0,.15,[[1.8,0],[2.73,1.49],[3.29,1.65],[3.75,.4],[4.02,0]],mat.shade);
  for(const side of [-1,1]){
    beam(group,'main-gear-leg',[side*.37,-.39,.15],[side*1.05,-1.18,.43],.045,mat.metal);
    const wheel=mesh(group,'main-wheel',new THREE.CylinderGeometry(.23,.23,.16,10),mat.rubber,side*1.07,-1.32,.43);wheel.rotation.z=Math.PI/2;
    const fairing=mesh(group,'wheel-fairing',new THREE.SphereGeometry(1,8,5),mat.body,side*1.07,-1.22,.38);fairing.scale.set(.16,.18,.4);
  }
  beam(group,'nose-gear-leg',[0,-.4,-2.5],[0,-1.12,-2.5],.043,mat.metal);
  const wheel=mesh(group,'nose-wheel',new THREE.CylinderGeometry(.19,.19,.14,10),mat.rubber,0,-1.31,-2.5);wheel.rotation.z=Math.PI/2;
  propeller(group,mat,{z:-3.9,radius:.95,blades:2,spinnerRadius:.19,spinnerLength:.24});
  wingtipLights(group,mat,5.45,1.35,.02);
}

function addBurner(group,ghost) {
  const exhaust=new THREE.Group(); exhaust.name='afterburner'; exhaust.visible=false;
  for(const nozzle of group.userData.nozzles) for(const inner of [false,true]) {
    const length=inner?3.3:5.2, radius=nozzle.radius*(inner?.48:.95);
    const geometry=new THREE.ConeGeometry(radius,length,nozzle.rectangular?4:8);
    geometry.rotateX(Math.PI/2); geometry.translate(0,0,length/2);
    if(nozzle.rectangular) geometry.scale(1.3,.47,1);
    const flame=mesh(exhaust,'burner-flame',geometry,new THREE.MeshBasicMaterial({color:inner?'#d1eeff':'#ff9c50',transparent:true,opacity:ghost ? .2 : inner ? .9 : .65,depthWrite:false,blending:THREE.AdditiveBlending}),nozzle.x,nozzle.y,nozzle.z);
    flame.userData.inner=inner;
  }
  group.add(exhaust);group.userData.exhaust=exhaust;
}

const builders={f16:buildF16,fa18:buildHornet,f22:buildRaptor,f35:buildLightning,a10:buildWarthog,p51:buildMustang,f4u:buildCorsair,c172:buildSkyhawk};

export function createAircraft(data,ghost=false) {
  const group=new THREE.Group(); group.name=MODEL_SPECS[data.id].variant;
  group.userData.nozzles=[]; group.userData.spec=MODEL_SPECS[data.id];
  group.userData.controlSurfaces=[]; group.userData.stabilators=supportsAfterburner(data);
  const mat = materials(data,ghost);
  builders[data.id](group,mat);
  group.updateMatrixWorld(true);
  // Exclude the inactive flame from camera framing and airframe dimensions.
  group.userData.airframeBounds=new THREE.Box3().setFromObject(group);
  addLandingGear(group,data,mat);
  addPropellerBlur(group,ghost);
  if(supportsAfterburner(data))addBurner(group,ghost);
  return group;
}
export function animateAircraft(group,data,throttle,time,dt,burner=0,airspeed=0,controls={}) {
  animateControlSurfaces(group,controls,airspeed,data,dt);
  animateLandingGear(group,controls.gear,airspeed,dt);
  if(group.userData.propeller) {
    const power=THREE.MathUtils.clamp(throttle,0,1);
    // Fast airflow keeps an idling prop windmilling, so lifting the throttle
    // never makes solid blades appear while the aircraft is still fast.
    const rpm=Math.max(650+power*2150,THREE.MathUtils.clamp(airspeed/data.cruise,0,1.5)*1400);
    const blurAmount=THREE.MathUtils.smoothstep(rpm,700,1200),parts=group.userData.propellerParts;
    group.userData.propeller.rotation.z=(group.userData.propeller.rotation.z+dt*rpm*Math.PI/30)%(Math.PI*2);
    parts.bladeGroups.forEach(blade=>{blade.visible=blurAmount<.999;});
    parts.bladeMaterials.forEach(material=>{material.opacity=material.userData.baseOpacity*(1-blurAmount);});
    const blur=group.userData.propellerBlur;blur.visible=blurAmount>.001;blur.material.opacity=group.userData.propellerBlurOpacity*blurAmount;
  }
  if(group.userData.exhaust){
    group.userData.exhaust.visible=supportsAfterburner(data)&&burner>.025;
    group.userData.exhaust.children.forEach(flame=>{
      flame.scale.z=(.25+burner*1.4)*(.95+Math.sin(time*43)*.05);
      flame.scale.x=flame.scale.y=.55+burner*.45;
    });
  }
}
export function setCockpitAirframe(group,cockpit) {
  const propeller=group.userData.propeller;
  if(!propeller||group.userData.cockpit===cockpit)return;
  group.userData.cockpit=cockpit;
  if(cockpit) {
    // Keep the translucent motion visible without an exposed solid hub
    // floating in front of the simplified cockpit's hidden engine cowling.
    const parts=[...group.children.filter(part=>part!==propeller),group.userData.propellerParts.spinner];
    group.userData.hiddenAirframe=parts.map(part=>[part,part.visible]);
    for(const [part] of group.userData.hiddenAirframe)part.visible=false;
  } else {
    for(const [part,visible] of group.userData.hiddenAirframe||[])part.visible=visible;
    group.userData.hiddenAirframe=null;
  }
}
export function disposeAircraft(group) {
  const geometries=new Set(),materials=new Set(),textures=new Set();
  group.traverse(object=>{if(object.geometry)geometries.add(object.geometry);if(object.material)materials.add(object.material);});
  materials.forEach(material=>{for(const value of Object.values(material))if(value?.isTexture)textures.add(value);});
  textures.forEach(texture=>texture.dispose());
  geometries.forEach(geometry=>geometry.dispose());materials.forEach(material=>material.dispose());
}
