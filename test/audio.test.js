import test from 'node:test';
import assert from 'node:assert/strict';
import {AIRCRAFT,supportsAfterburner} from '../public/js/core/aircraft-data.js';
import {ENGINE_SOUNDS,engineSoundTargets,audioVolume,noiseChannel} from '../public/js/core/audio-model.js';
import {FlightAudio} from '../public/js/audio.js';

test('aircraft have distinct engine signatures with smooth power targets and no prop/A-10 afterburner sound',()=>{
 const signatures=new Set();
 for(const aircraft of AIRCRAFT){
  assert.ok(ENGINE_SOUNDS[aircraft.id]);const state={aircraft,speed:aircraft.cruise,throttle:.5,burner:0,slipAngle:0,loadFactor:1};
  const idle=engineSoundTargets({...state,speed:0,throttle:0}),cruise=engineSoundTargets(state),power=engineSoundTargets({...state,throttle:1}),boost=engineSoundTargets({...state,throttle:1,burner:1});
  assert.ok(power.coreHz>idle.coreHz);assert.ok(power.coreHz>=cruise.coreHz);signatures.add(JSON.stringify([cruise.coreHz,cruise.whistleHz,cruise.bladeHz,cruise.jetRoar,cruise.propMotor]));
  assert.equal(boost.burnerRoar>0,supportsAfterburner(aircraft));assert.equal(cruise.kind,aircraft.type==='prop'?'prop':'jet');
  assert.equal(cruise.kind==='jet'?cruise.propMotor:cruise.jetRoar,0);
  const next=engineSoundTargets({...state,throttle:.501});assert.ok(Math.abs(cruise.coreHz-next.coreHz)<1);assert.ok(Math.abs(cruise.whistleHz-next.whistleHz)<3);
 }
 assert.equal(signatures.size,8);
});

test('cockpit audio is softer and filtered, while airspeed and drift increase airflow rather than engine RPM alone',()=>{
 const state={aircraft:AIRCRAFT[0],throttle:.65,speed:140,slipAngle:0,loadFactor:1};
 const outside=engineSoundTargets(state),inside=engineSoundTargets(state,{cockpit:true});
 assert.ok(inside.cockpitGain<outside.cockpitGain);assert.ok(inside.cockpitCutoff<outside.cockpitCutoff);assert.ok(inside.whine<outside.whine);
 const drift=engineSoundTargets({...state,slipAngle:80,speed:280,loadFactor:6});assert.ok(drift.wind>outside.wind*2);assert.equal(drift.coreHz,outside.coreHz);
 const prop=AIRCRAFT.find(p=>p.id==='c172'),idle=engineSoundTargets({aircraft:prop,throttle:0,speed:0}),windmill=engineSoundTargets({aircraft:prop,throttle:0,speed:prop.maxSpeed});assert.ok(windmill.rpm>idle.rpm);
});

test('sound controls and extreme or incomplete telemetry stay finite and bounded',()=>{
 assert.equal(audioVolume(0),0);assert.equal(audioVolume(-1),0);assert.equal(audioVolume(2),1);assert.equal(audioVolume(NaN),.3);assert.equal(audioVolume('loud',.15),.15);
 for(const state of [{},{throttle:NaN,speed:Infinity,burner:Infinity},{aircraft:AIRCRAFT[5],throttle:99,speed:-10,slipAngle:NaN,loadFactor:Infinity}]){
  const sound=engineSoundTargets(state);for(const value of Object.values(sound))if(typeof value==='number')assert.ok(Number.isFinite(value)&&value>=0);
 }
 const audio=new FlightAudio();audio.volume=0;audio.musicVolume=0;assert.equal(audio.start(),false);assert.doesNotThrow(()=>audio.update({},true));assert.doesNotThrow(()=>audio.dispose());
});

test('looping noise is reproducible, centered, varied in stereo, and has no hard wrap',()=>{
 const a=noiseChannel(48000,451),b=noiseChannel(48000,451),right=noiseChannel(48000,972);assert.deepEqual(a,b);assert.notDeepEqual(a,right);
 const rms=Math.sqrt(a.reduce((sum,n)=>sum+n*n,0)/a.length),mean=a.reduce((sum,n)=>sum+n,0)/a.length;
 assert.ok(rms>.05&&rms<.5);assert.ok(Math.abs(mean)<.06);assert.ok(Math.abs(a.at(-1)-a[0])<.12);assert.ok(a.every(Number.isFinite));
});
