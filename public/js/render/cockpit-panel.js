import { flightAttitude } from '../core/instruments.js';
import { unitsFor } from '../core/units.js';

export const COCKPITS = {
  f16:{name:'F-16C · Fighting Falcon',layout:'falcon',frame:'#384742',panel:'#303b3c',ink:'#d9e1ce',light:'#9ee98a',controls:'side',canopy:'bubble'},
  fa18:{name:'F/A-18E · Super Hornet',layout:'hornet',frame:'#3a4542',panel:'#39423d',ink:'#d6ddc9',light:'#9cde7d',controls:'stick',canopy:'split'},
  f22:{name:'F-22A · Raptor',layout:'raptor',frame:'#434b48',panel:'#293538',ink:'#d6e4df',light:'#a0d9d1',controls:'side',canopy:'stealth'},
  f35:{name:'F-35A · Lightning II',layout:'lightning',frame:'#323c40',panel:'#253137',ink:'#d4e2df',light:'#8ed6d1',controls:'side',canopy:'wide'},
  a10:{name:'A-10C · Thunderbolt II',layout:'warthog',frame:'#4e5846',panel:'#3b4436',ink:'#e0dfc4',light:'#a3df7c',controls:'stick',canopy:'armored'},
  p51:{name:'P-51D · Mustang',layout:'mustang',frame:'#4c5146',panel:'#262c2a',ink:'#eee2bd',light:'#dfca8e',controls:'stick',canopy:'arch'},
  f4u:{name:'F4U-1D · Corsair',layout:'corsair',frame:'#30424a',panel:'#253237',ink:'#e0dfca',light:'#e8c487',controls:'stick',canopy:'naval'},
  c172:{name:'Cessna 172S · Skyhawk',layout:'skyhawk',frame:'#c7c7b5',panel:'#b9baa7',ink:'#2f4140',light:'#9bd8c1',controls:'yoke',canopy:'civil'}
};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function drawCockpitPanel(canvas,data,flight,appearance,units='imperial') {
  const spec=COCKPITS[data.id],c=canvas.getContext('2d'),w=canvas.width,h=canvas.height,m=unitsFor(units),a=flightAttitude(flight.quaternion);
  const speed=Math.round(flight.speed*m.speedFactor),alt=Math.round(flight.position.y*m.lengthFactor),rpm=Math.round(650+flight.throttle*2150);
  c.clearRect(0,0,w,h);c.fillStyle=spec.panel;c.fillRect(0,0,w,h);c.textAlign='center';c.textBaseline='middle';
  const text=(value,x,y,size=12,color=spec.ink)=>{c.font=`${size}px monospace`;c.fillStyle=color;c.fillText(String(value),x,y);};
  const rect=(x,y,width,height,color,r=5)=>{c.fillStyle=color;c.beginPath();c.roundRect(x,y,width,height,r);c.fill();};
  const screw=(x,y)=>{c.fillStyle='#6e7971';c.beginPath();c.arc(x,y,3,0,7);c.fill();c.strokeStyle='#26302b';c.beginPath();c.moveTo(x-2,y);c.lineTo(x+2,y);c.stroke();};
  rect(9,8,w-18,h-16,'#0c171334',8);[16,w-16].forEach(x=>[16,h-16].forEach(y=>screw(x,y)));
  text(spec.name.toUpperCase(),w/2,23,w<500?12:15);
  function gauge(x,y,r,label,value,ratio,{attitude=false,accent='#ddcda2'}={}) {
    c.fillStyle='#18201f';c.beginPath();c.arc(x,y,r+6,0,7);c.fill();c.strokeStyle='#748078';c.lineWidth=2;c.stroke();
    c.save();c.beginPath();c.arc(x,y,r,0,7);c.clip();
    if(attitude){c.translate(x,y);c.rotate(-a.bank);const shift=clamp(a.pitch,-.8,.8)*r;
      c.fillStyle='#5d8e9b';c.fillRect(-r*2,-r*3+shift,r*4,r*3);c.fillStyle='#85674d';c.fillRect(-r*2,shift,r*4,r*3);
      c.strokeStyle='#e6e2bd';c.lineWidth=2;c.beginPath();c.moveTo(-r,shift);c.lineTo(r,shift);c.stroke();c.restore();
      c.strokeStyle='#f4d68c';c.beginPath();c.moveTo(x-r*.6,y);c.lineTo(x-r*.15,y);c.lineTo(x,y+4);c.lineTo(x+r*.15,y);c.lineTo(x+r*.6,y);c.stroke();
    }else{c.restore();for(let i=0;i<=10;i++){const angle=(-135+i*27)*Math.PI/180;c.strokeStyle=i>8?'#c86b4d':'#d6d4bb';c.lineWidth=i%2?1:2;c.beginPath();c.moveTo(x+Math.sin(angle)*r*.79,y-Math.cos(angle)*r*.79);c.lineTo(x+Math.sin(angle)*r*.94,y-Math.cos(angle)*r*.94);c.stroke();}
      const angle=(-135+clamp(ratio,0,1)*270)*Math.PI/180;c.strokeStyle=accent;c.lineWidth=2.5;c.beginPath();c.moveTo(x-Math.sin(angle)*r*.13,y+Math.cos(angle)*r*.13);c.lineTo(x+Math.sin(angle)*r*.72,y-Math.cos(angle)*r*.72);c.stroke();c.fillStyle='#e6d5ae';c.beginPath();c.arc(x,y,3,0,7);c.fill();}
    text(label,x,y-r*.41,Math.max(8,r*.19),'#cbd2bc');if(value!==null)text(value,x,y+r*.43,Math.max(10,r*.25),'#ece7ce');
  }
  function screen(x,y,width,height,label,mode=0) {
    rect(x-8,y-8,width+16,height+16,'#141e1b',4);rect(x,y,width,height,'#09231f',2);
    c.strokeStyle='#486d5d';c.lineWidth=1;c.strokeRect(x,y,width,height);
    text(label,x+width/2,y+13,10,spec.light);
    for(let i=0;i<4;i++){rect(x-6,y+20+i*(height-30)/4,3,6,'#a8b29b',1);rect(x+width+3,y+20+i*(height-30)/4,3,6,'#a8b29b',1);}
    if(mode===0){c.save();c.beginPath();c.rect(x+5,y+25,width-10,height-32);c.clip();c.translate(x+width/2,y+height*.6);c.rotate(-a.bank);c.strokeStyle=spec.light;c.lineWidth=1.4;
      for(let k=-2;k<=2;k++){const yy=k*15+a.pitch*30;c.beginPath();c.moveTo(-width*.30,yy);c.lineTo(-8,yy);c.moveTo(8,yy);c.lineTo(width*.30,yy);c.stroke();}c.restore();text(`${speed} ${m.speed.toUpperCase()}`,x+width/2,y+height-12,Math.min(13,width/9),spec.light);
    }else if(mode===1){const cx=x+width/2,cy=y+height*.56;c.strokeStyle='#548e77';for(let k=1;k<=3;k++){c.beginPath();c.arc(cx,cy,k*Math.min(width*.13,height*.12),0,7);c.stroke();}c.strokeStyle=spec.light;c.beginPath();c.moveTo(cx,cy-5);c.lineTo(cx-5,cy+7);c.lineTo(cx,cy+3);c.lineTo(cx+5,cy+7);c.closePath();c.stroke();text(`${String(Math.round(a.heading)).padStart(3,'0')}°`,cx,y+height-12,12,spec.light);
    }else{const rows=[['ALT',alt],['PWR',`${Math.round(flight.throttle*100)}%`],['CLB',Math.round(flight.velocity.y*m.climbFactor)]];rows.forEach(([key,v],i)=>{text(key,x+width*.2,y+36+i*(height-45)/3,9,'#79a68c');text(v,x+width*.64,y+36+i*(height-45)/3,Math.min(13,width/8),spec.light);});}
  }
  function radios(x,y,width) {
    rect(x,y,width,87,'#263a32',3);text('COM 1    NAV 1',x+width/2,y+12,10,'#b7bda1');
    rect(x+8,y+23,width-16,25,'#112b20',2);text('124.850  113.70',x+width/2,y+36,Math.min(15,width/11),'#d8b976');
    rect(x+8,y+53,width-16,23,'#14261d',2);text('XPDR    1200',x+width/2,y+65,Math.min(14,width/11),'#b7d19b');
  }
  const analog=['mustang','corsair','skyhawk'].includes(spec.layout),compact=w<550;
  if(analog){
    const area=compact?w-28:w*.69,cols=3,r=compact?Math.min(39,(area-28)/7):47;
    const startX=compact?14:22,spacing=(area-22)/3,ys=[107,225];
    const gauges=[['AIRSPEED',speed,flight.speed/data.maxSpeed],['ATTITUDE',null,0],['ALTITUDE',alt,flight.position.y/2500],['TURN',`${flight.loadFactor.toFixed(1)} G`,.5+flight.controls.roll*.3],['HEADING',`${Math.round(a.heading)}°`,a.heading/360],[data.id==='f4u'?'MANIFOLD':'RPM',data.id==='f4u'?Math.round(20+flight.throttle*40):rpm,flight.throttle]];
    gauges.forEach(([label,value,ratio],i)=>gauge(startX+spacing*(i%cols+.5),ys[Math.floor(i/cols)],r,label,value,ratio,{attitude:i===1,accent:spec.light}));
    if(!compact){radios(w*.73,57,w*.22);gauge(w*.84,217,39,data.id==='c172'?'FUEL':'OIL',data.id==='c172'?'FULL':'75',.72);}
    if(data.id==='corsair'){text('FUEL SELECTOR  •  MAIN',w/2,287,11,'#cdb880');}else if(data.id==='mustang'){text('NORTH AMERICAN   •   P-51D',w/2,287,11,'#cfbc8b');}else{text('CABIN AIR   •   MIXTURE   •   FLAPS',w/2,287,10,'#344b45');}
  }else if(spec.layout==='lightning'){
    const x=compact?15:43,y=52,width=w-x*2;rect(x-9,y-9,width+18,218,'#111b1e',7);const gap=8,cell=(width-gap*2)/3;
    screen(x,y,cell,185,'FLIGHT',0);screen(x+cell+gap,y,cell,185,'NAV',1);screen(x+(cell+gap)*2,y,cell,185,'SYSTEMS',2);
    text(`LIGHTNING II  •  ${Math.round(flight.throttle*100)}% POWER`,w/2,278,12,spec.ink);
  }else{
    const screenCount=spec.layout==='hornet'||spec.layout==='raptor'?3:2;
    const gap=compact?12:29,total=compact?w-36:w*.77,width=(total-gap*(screenCount-1))/screenCount,x=(w-total)/2;
    for(let i=0;i<screenCount;i++)screen(x+i*(width+gap),69,width,151,['FLIGHT','NAV','ENGINE'][i],i);
    if(!compact){gauge(50,116,28,'ALT',null,flight.position.y/2500);gauge(w-50,116,28,spec.layout==='warthog'?'ENG L':'PWR',null,flight.throttle);if(spec.layout==='warthog')gauge(w-50,197,28,'ENG R',null,flight.throttle*.98);}
    if(spec.layout==='falcon'){text('UFC   01  •  MASTER ARM  SAFE',w/2,46,11);}
    if(spec.layout==='hornet'){text('SUPER HORNET   •   TWIN ENGINE',w/2,46,11);}
    if(spec.layout==='raptor'){text('RAPTOR   •   INTEGRATED AVIONICS',w/2,46,11);}
    if(spec.layout==='warthog'){text('THUNDERBOLT II   •   LEFT / RIGHT ENGINE',w/2,46,compact?9:11);}
    for(let i=0;i<8;i++){rect(w/2-94+i*25,251,16,15,i===3?'#a95540':'#566854',2);text(String(i+1),w/2-86+i*25,258,9,'#e2d7bb');}
    text(spec.layout==='warthog'?'FUEL   •   GUN SAFE   •   HYDRAULICS':'COM 1  124.850  •  NAV 1  113.70',w/2,286,11);
  }
  const plate=appearance.nameplate.trim()||'PLOON FLIGHT CLUB';
  const plateWidth=Math.min(196,w*.45),plateX=spec.controls==='side'?w/2:w*.76;
  rect(plateX-plateWidth/2,h-27,plateWidth,21,analog&&data.id==='c172'?'#d0c9b3':'#746e51',2);text(plate.toUpperCase(),plateX,h-16,11,analog&&data.id==='c172'?'#38453b':'#f1e5c4');
}
