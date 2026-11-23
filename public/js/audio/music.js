// An original, slowly voiced ambient progression. No downloaded tracks or
// recognizable film/game melodies; long attacks keep it beneath the flight.
const CHORDS=[[50,57,61,64],[47,54,57,62],[43,50,54,59],[45,52,57,59]];
const MELODY=[76,73,69,71,74,69,66,71];
const hz=note=>440*2**((note-69)/12),BAR=12;

export class AmbientMusic {
 constructor(context,output){
  this.context=context;this.voices=new Set();this.enabled=false;this.nextBar=0;
  this.filter=context.createBiquadFilter();this.filter.type='lowpass';this.filter.frequency.value=1650;this.filter.Q.value=.3;
  this.filter.connect(output);
  this.delay=context.createDelay(1);this.delay.delayTime.value=.44;
  this.feedback=context.createGain();this.feedback.gain.value=.2;
  this.wet=context.createGain();this.wet.gain.value=.2;
  this.filter.connect(this.delay);this.delay.connect(this.feedback);this.feedback.connect(this.delay);this.delay.connect(this.wet);this.wet.connect(output);
 }
 note(note,start,duration,level,pan=0,bell=false){
  const c=this.context,gain=c.createGain(),panner=c.createStereoPanner(),a=c.createOscillator(),b=c.createOscillator();
  const attack=bell?.08:2.2,release=bell?2.5:3.5,end=start+duration+release;
  gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(level,start+attack);
  gain.gain.setTargetAtTime(level*.65,start+attack,.9);gain.gain.setTargetAtTime(.00001,start+duration,release/5);
  gain.gain.setValueAtTime(0,end);panner.pan.value=pan;
  a.type='sine';b.type=bell?'sine':'triangle';a.frequency.value=hz(note);b.frequency.value=hz(note)*(bell?2:1);
  a.detune.value=bell?0:-3;b.detune.value=bell?1:3;
  const soft=c.createGain();soft.gain.value=bell?.18:.25;
  a.connect(gain);b.connect(soft);soft.connect(gain);gain.connect(panner);panner.connect(this.filter);
  const voice={a,b,gain,panner,soft};this.voices.add(voice);
  a.onended=()=>{for(const node of [a,b,gain,panner,soft])node.disconnect();this.voices.delete(voice);};
  a.start(start);b.start(start);a.stop(end);b.stop(end);
 }
 scheduleBar(index,start){
  const chord=CHORDS[index%CHORDS.length];
  chord.forEach((note,i)=>this.note(note,start+i*.14,10,.05,(i-1.5)*.28));
  this.note(chord[0]-12,start,10,.05,0);
  this.note(MELODY[(index*2)%MELODY.length],start+3,2,.032,-.3,true);
  this.note(MELODY[(index*2+1)%MELODY.length],start+8,2,.024,.35,true);
 }
 pump(){
  if(!this.enabled)return;const now=this.context.currentTime;
  this.nextBar=Math.max(this.nextBar,Math.floor((now-this.epoch)/BAR));
  while(this.epoch+this.nextBar*BAR<now+.5){this.scheduleBar(this.nextBar,Math.max(now+.05,this.epoch+this.nextBar*BAR));this.nextBar++;}
 }
 setEnabled(enabled){
  if(this.enabled===enabled)return;this.enabled=enabled;
  if(enabled){this.epoch=this.context.currentTime+.12;this.nextBar=0;this.pump();
   if(!('startRendering'in this.context))this.timer=setInterval(()=>this.pump(),180);
  }else{clearInterval(this.timer);this.timer=null;const now=this.context.currentTime;
   for(const voice of this.voices){voice.gain.gain.cancelScheduledValues(now);voice.gain.gain.setTargetAtTime(0,now,.035);voice.a.stop(now+.25);voice.b.stop(now+.25);}
  }
 }
 // Allows deterministic OfflineAudioContext rendering without wall-clock timers.
 schedulePreview(seconds){this.epoch=this.context.currentTime+.12;for(let i=0;i*BAR<seconds;i++)this.scheduleBar(i,this.epoch+i*BAR);}
 dispose(){
  clearInterval(this.timer);this.timer=null;this.enabled=false;
  for(const voice of this.voices){for(const source of [voice.a,voice.b]){try{source.stop();}catch{}}for(const node of [voice.a,voice.b,voice.gain,voice.panner,voice.soft])node.disconnect();}
  this.voices.clear();for(const node of [this.filter,this.delay,this.feedback,this.wet])node.disconnect();
 }
}
