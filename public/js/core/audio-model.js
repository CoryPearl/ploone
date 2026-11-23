import { supportsAfterburner } from './aircraft-data.js';
const clamp = (value,low=0,high=1) => Math.max(low,Math.min(high,Number.isFinite(value)?value:low));
export const audioVolume = (value,fallback=.3) => typeof value==='number'&&Number.isFinite(value)?clamp(value):fallback;

// Original game sound design, tuned for a distinct character rather than
// recordings or exact real-world engine specifications.
export const ENGINE_SOUNDS = Object.freeze({
 f16:{kind:'jet',idle:62,core:44,whine:680,spool:1480,roar:1.05,air:.9,twin:.18},
 fa18:{kind:'jet',idle:58,core:39,whine:620,spool:1320,roar:1.12,air:1,twin:.68},
 f22:{kind:'jet',idle:54,core:43,whine:760,spool:1670,roar:1,air:1.14,twin:.62},
 f35:{kind:'jet',idle:48,core:38,whine:580,spool:1450,roar:1.26,air:.86,twin:.15},
 a10:{kind:'jet',idle:64,core:28,whine:460,spool:1050,roar:.76,air:1.24,twin:.8},
 p51:{kind:'prop',idle:700,rpm:2200,pulses:6,blades:4,body:1.02,rough:.65},
 f4u:{kind:'prop',idle:650,rpm:2050,pulses:9,blades:3,body:1.12,rough:1},
 c172:{kind:'prop',idle:650,rpm:1850,pulses:2,blades:2,body:.78,rough:.48}
});

export function engineSoundTargets(state,{cockpit=false}={}) {
 const plane=state.aircraft||{},profile=ENGINE_SOUNDS[plane.id]||ENGINE_SOUNDS[plane.type==='prop'?'c172':'f16'];
 const throttle=clamp(state.throttle),power=throttle**.65,burner=profile.kind==='jet'&&supportsAfterburner(plane)?clamp(state.burner):0;
 const speed=clamp((state.speed||0)/(plane.maxSpeed||300),0,1.5),slip=clamp((state.slipAngle||0)/75),load=clamp(((state.loadFactor||1)-1)/8);
 const jet=profile.kind==='jet',rpm=jet?0:Math.max(profile.idle+profile.rpm*power,speed*1400);
 return {
  kind:profile.kind,profile,throttle,burner,rpm,
  coreHz:jet?profile.idle+profile.core*power:rpm/60*profile.pulses,
  whistleHz:jet?profile.whine+profile.spool*power+burner*210:0,
  bladeHz:jet?0:rpm/60*profile.blades,
  jetRoar:jet?(.13+power*.26)*profile.roar:0,
  jetAir:jet?(.025+power*.09)*profile.air:0,
  whine:jet?(.003+power*.011)*(cockpit?.65:1):0,
  jetCore:jet?.016+power*.023:0,
  burnerRoar:jet?burner*.45:0,
  propMotor:jet?0:(.065+power*.085)*profile.body,
  propExhaust:jet?0:(.035+power*.055)*profile.rough,
  propWash:jet?0:.015+power*.045,
  wind:.008+speed**1.45*.055+slip*.04+load*.007,
  roarCutoff:220+power*660+burner*300,
  airCutoff:650+power*1400+speed*500,
  motorCutoff:280+power*1000,
  cockpitCutoff:cockpit?1750:6500,
  cockpitGain:cockpit?.72:1
 };
}

// A reproducible, seamless low-frequency-rich noise bed. Its ends are joined
// with a short equal-power crossfade before it becomes a looping source.
export function noiseChannel(length,seed=1) {
 const data=new Float32Array(length);let state=seed>>>0,b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;
 for(let i=0;i<length;i++){
  state=(Math.imul(state,1664525)+1013904223)>>>0;const white=state/2147483648-1;
  b0=.99886*b0+white*.0555179;b1=.99332*b1+white*.0750759;b2=.969*b2+white*.153852;
  b3=.8665*b3+white*.3104856;b4=.55*b4+white*.5329522;b5=-.7616*b5-white*.016898;
  data[i]=(b0+b1+b2+b3+b4+b5+b6+white*.5362)*.09;b6=white*.115926;
 }
 const fade=Math.min(2048,Math.floor(length/8)),tail=data.slice(length-fade);
 for(let i=0;i<fade;i++){const t=i/(fade-1);data[length-fade+i]=tail[i]*Math.cos(t*Math.PI/2)+data[i+1]*Math.sin(t*Math.PI/2);}
 // Start where the crossfade ends so the actual buffer wrap is continuous.
 return data.subarray(fade);
}
