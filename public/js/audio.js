import { audioVolume, engineSoundTargets, noiseChannel } from './core/audio-model.js';
import { AmbientMusic } from './audio/music.js';

export class FlightAudio {
  constructor({context=null}={}) {
    this.context=context;this._volume=.3;this._musicVolume=.15;this.started=false;this.hidden=false;this.mode='menu';
    this.sources=new Set();this.nodes=new Set();this.effects=new Set();this.targets=new WeakMap();
  }
  get volume(){return this._volume;}
  set volume(value){this._volume=audioVolume(value);this.mix();}
  get musicVolume(){return this._musicVolume;}
  set musicVolume(value){this._musicVolume=audioVolume(value,.15);this.mix();}
  gain(value=0){const node=this.context.createGain();node.gain.value=value;this.nodes.add(node);return node;}
  filter(type,frequency,q=.6){const node=this.context.createBiquadFilter();node.type=type;node.frequency.value=frequency;node.Q.value=q;this.nodes.add(node);return node;}
  target(param,value,smoothing=.15){
    if(!Number.isFinite(value)||this.context.state==='closed')return;
    if(Math.abs((this.targets.get(param)??Infinity)-value)<.0001)return;
    this.targets.set(param,value);param.setTargetAtTime(value,this.context.currentTime,smoothing);
  }
  oscillator(type,frequency,output){const node=this.context.createOscillator();node.type=type;node.frequency.value=frequency;node.connect(output);node.start();this.sources.add(node);return node;}
  noise(type,frequency,output,offset=0,q=.6){
    const source=this.context.createBufferSource(),filter=this.filter(type,frequency,q);source.buffer=this.noiseBuffer;source.loop=true;
    source.connect(filter);filter.connect(output);source.start(0,offset);this.sources.add(source);return {source,filter};
  }
  build(){
    const c=this.context;
    this.master=this.gain(0);this.compressor=c.createDynamicsCompressor();
    this.compressor.threshold.value=-10;this.compressor.knee.value=18;this.compressor.ratio.value=4;this.compressor.attack.value=.004;this.compressor.release.value=.22;
    this.analyser=c.createAnalyser();this.analyser.fftSize=1024;this.samples=new Float32Array(1024);
    this.master.connect(this.compressor);this.compressor.connect(this.analyser);this.analyser.connect(c.destination);
    this.engineBus=this.gain(1);this.cabin=this.filter('lowpass',6500);this.engineLevel=this.gain(0);this.engineBus.connect(this.cabin);this.cabin.connect(this.engineLevel);this.engineLevel.connect(this.master);
    this.musicLevel=this.gain(0);this.musicAnalyser=c.createAnalyser();this.musicAnalyser.fftSize=512;this.musicSamples=new Float32Array(512);this.musicLevel.connect(this.musicAnalyser);this.musicAnalyser.connect(this.master);
    this.effectsBus=this.gain(1);this.effectsBus.connect(this.master);
    const left=noiseChannel(c.sampleRate*3,451),right=noiseChannel(c.sampleRate*3,972);
    this.noiseBuffer=c.createBuffer(2,left.length,c.sampleRate);this.noiseBuffer.copyToChannel(left,0);this.noiseBuffer.copyToChannel(right,1);

    this.jetRoar=this.gain();this.jetAir=this.gain();this.jetWhine=this.gain();this.jetTwin=this.gain();this.jetCore=this.gain();this.burner=this.gain();
    for(const gain of [this.jetRoar,this.jetAir,this.jetWhine,this.jetTwin,this.jetCore,this.burner])gain.connect(this.engineBus);
    this.roar=this.noise('lowpass',400,this.jetRoar,.11);this.air=this.noise('bandpass',1100,this.jetAir,.73,.65);
    this.burnerNoise=this.noise('lowpass',620,this.burner,1.34);
    this.whistle=this.oscillator('sine',900,this.jetWhine);this.twin=this.oscillator('sine',905,this.jetTwin);this.core=this.oscillator('triangle',70,this.jetCore);

    this.propMotor=this.gain();this.propExhaust=this.gain();this.propWash=this.gain();this.propTone=this.gain();
    for(const gain of [this.propMotor,this.propExhaust,this.propWash,this.propTone])gain.connect(this.engineBus);
    this.motorFilter=this.filter('lowpass',600);this.motorFilter.connect(this.propMotor);this.motor=this.oscillator('sine',70,this.motorFilter);
    const harmonics=new Float32Array([0,1,.4,.23,.13,.07,.035]);this.motor.setPeriodicWave(c.createPeriodicWave(new Float32Array(harmonics.length),harmonics));
    this.exhaust=this.noise('bandpass',240,this.propExhaust,.48,.65);
    this.chop=this.gain(.65);this.chop.connect(this.propWash);this.wash=this.noise('bandpass',850,this.chop,1.81,.5);
    this.chopDepth=this.gain(.3);this.chopDepth.connect(this.chop.gain);this.bladePulse=this.oscillator('sine',80,this.chopDepth);
    this.bladeTone=this.oscillator('sine',80,this.propTone);
    this.windLevel=this.gain();this.windLevel.connect(this.engineBus);this.wind=this.noise('bandpass',1400,this.windLevel,2.17,.5);
    this.music=new AmbientMusic(c,this.musicLevel);
  }
  start(){
    if(this.disposed)return false;
    try{
      if(!this.context){const Context=window.AudioContext||window.webkitAudioContext;if(!Context)return false;this.context=new Context();}
      if(!this.master)this.build();this.started=true;
      if(!this.hidden&&!('startRendering'in this.context))this.context.resume().catch(()=>{});
      this.mix();return true;
    }catch{this.failed=true;this.dispose();return false;}
  }
  mix(){
    if(!this.master||this.disposed)return;
    this.target(this.master.gain,this.hidden?0:this.volume,.045);
    const duck=this.context.currentTime<(this.duckUntil||0)?.3:1,mood=this.mode==='flying'?1:.65;
    this.target(this.musicLevel.gain,this.musicVolume*mood*duck,.25);
    if(!('startRendering'in this.context))this.music.setEnabled(this.started&&!this.hidden&&this.volume>0&&this.musicVolume>0);
  }
  update(state,active,{cockpit=false,mode=active?'flying':'menu'}={}){
    if(!this.master||this.disposed)return;this.mode=mode;this.engineActive=!!active&&!this.hidden;this.aircraft=state.aircraft?.id;this.cockpit=!!cockpit;
    const s=engineSoundTargets(state,{cockpit});this.sound=s;
    this.target(this.engineLevel.gain,this.engineActive?s.cockpitGain*.9:0,.13);this.target(this.cabin.frequency,s.cockpitCutoff,.25);
    this.target(this.jetRoar.gain,s.jetRoar,.3);this.target(this.jetAir.gain,s.jetAir,.25);this.target(this.jetWhine.gain,s.whine,.25);this.target(this.jetTwin.gain,s.whine*(s.profile.twin||0),.25);
    this.target(this.jetCore.gain,s.jetCore,.25);this.target(this.burner.gain,s.burnerRoar,.22);
    this.target(this.roar.filter.frequency,s.roarCutoff,.45);this.target(this.air.filter.frequency,s.airCutoff,.35);
    this.target(this.core.frequency,s.coreHz,.42);this.target(this.whistle.frequency,Math.max(40,s.whistleHz),.5);this.target(this.twin.frequency,Math.max(40,s.whistleHz*1.007),.53);
    this.target(this.propMotor.gain,s.propMotor,.3);this.target(this.propExhaust.gain,s.propExhaust,.28);this.target(this.propWash.gain,s.propWash,.3);this.target(this.propTone.gain,s.kind==='prop'?.012+s.throttle*.012:0,.3);
    this.target(this.motor.frequency,s.kind==='prop'?s.coreHz:40,.35);this.target(this.motorFilter.frequency,s.motorCutoff,.35);
    this.target(this.bladePulse.frequency,Math.max(1,s.bladeHz),.4);this.target(this.bladeTone.frequency,Math.max(1,s.bladeHz),.4);
    this.target(this.exhaust.filter.frequency,150+s.throttle*350,.3);this.target(this.windLevel.gain,s.wind,.16);this.target(this.wind.filter.frequency,700+Math.min(1,(state.speed||0)/(state.aircraft?.maxSpeed||300))*1400,.25);
    this.mix();
  }
  setHidden(hidden){
    this.hidden=!!hidden;clearTimeout(this.suspendTimer);if(hidden){this.engineActive=false;if(this.engineLevel)this.target(this.engineLevel.gain,0,.045);}this.mix();
    if(!this.context||!this.started||'startRendering'in this.context)return;
    if(hidden)this.suspendTimer=setTimeout(()=>{if(this.hidden&&!this.disposed)this.context.suspend().catch(()=>{});},180);
    else this.context.resume().catch(()=>{});
  }
  duck(seconds){if(this.context)this.duckUntil=Math.max(this.duckUntil||0,this.context.currentTime+seconds);this.mix();}
  tone(frequency,start,duration,level,type='sine'){
    const c=this.context,osc=c.createOscillator(),gain=c.createGain();osc.type=type;osc.frequency.value=frequency;
    gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(level,start+.012);gain.gain.exponentialRampToValueAtTime(.0001,start+duration);
    osc.connect(gain);gain.connect(this.effectsBus);this.effects.add(osc);osc.start(start);osc.stop(start+duration+.02);
    osc.onended=()=>{osc.disconnect();gain.disconnect();this.effects.delete(osc);};return osc;
  }
  alert(){
    if(!this.master||!this.volume||this.hidden)return;this.duck(.7);
    const now=this.context.currentTime;this.tone(440,now,.16,.1);this.tone(550,now+.2,.16,.1);
  }
  crash(){
    if(!this.master||!this.volume||this.hidden)return;this.duck(1.5);
    const c=this.context,now=c.currentTime,noise=c.createBufferSource(),filter=c.createBiquadFilter(),gain=c.createGain();
    noise.buffer=this.noiseBuffer;filter.type='lowpass';filter.frequency.setValueAtTime(1800,now);filter.frequency.exponentialRampToValueAtTime(120,now+.85);
    gain.gain.setValueAtTime(.45,now);gain.gain.exponentialRampToValueAtTime(.0001,now+1.1);
    noise.connect(filter);filter.connect(gain);gain.connect(this.effectsBus);this.effects.add(noise);noise.start(now);noise.stop(now+1.15);
    noise.onended=()=>{noise.disconnect();filter.disconnect();gain.disconnect();this.effects.delete(noise);};
    const rumble=this.tone(95,now,.85,.25,'triangle');rumble.frequency.exponentialRampToValueAtTime(28,now+.65);
  }
  chime(finish=false){
    if(!this.master||!this.volume||this.hidden)return;this.duck(finish?1.2:.55);
    const now=this.context.currentTime;(finish?[523,659,784]:[740,988]).forEach((frequency,i)=>this.tone(frequency,now+i*.09,.32,.09));
  }
  diagnostics(){
    const rms=(analyser,data)=>{analyser.getFloatTimeDomainData(data);return Math.sqrt(data.reduce((sum,value)=>sum+value*value,0)/data.length);};
    return {started:this.started,context:this.context?.state||'locked',volume:this.volume,musicVolume:this.musicVolume,hidden:this.hidden,engineActive:!!this.engineActive,aircraft:this.aircraft,kind:this.sound?.kind,cockpit:!!this.cockpit,
      sources:this.sources.size,musicVoices:this.music?.voices.size||0,musicScheduled:!!this.music?.enabled,effects:this.effects.size,
      outputRms:this.analyser?rms(this.analyser,this.samples):0,musicRms:this.musicAnalyser?rms(this.musicAnalyser,this.musicSamples):0};
  }
  dispose(){
    if(this.disposed)return;clearTimeout(this.suspendTimer);this.music?.dispose();
    for(const source of [...this.sources,...this.effects]){try{source.stop();}catch{}source.disconnect();}
    for(const node of this.nodes)node.disconnect();this.master?.disconnect();this.compressor?.disconnect();this.analyser?.disconnect();this.musicAnalyser?.disconnect();
    this.sources.clear();this.effects.clear();this.started=false;this.engineActive=false;this.disposed=true;if(this.context&&!('startRendering'in this.context))this.context.close().catch(()=>{});
  }
}
