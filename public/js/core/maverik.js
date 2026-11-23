import { createTerrainStyle } from './terrain-style.js';

const clamp = value => Math.max(0, Math.min(1, value));
const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
const ramp = (value, low, high) => smooth((value - low) / (high - low));
const lerp = (a, b, t) => a + (b - a) * t;

// An original mission layout inspired by the low approach, pop-up, valley dive,
// and escape sequence. The named seed is a deliberate authored-course exception.
const bends = [[-1000,0],[0,0],[800,0],[1600,500],[2600,-650],[3500,-900],[4500,650],[5400,1050],[6400,220],[7650,0],[9200,0],[10950,450],[12400,650],[14000,800]];

export function maverikCenter(along) {
  let index = 0;
  while (index < bends.length - 2 && bends[index + 1][0] < along) index++;
  const a = bends[index], b = bends[index + 1], before = bends[Math.max(0,index-1)], after = bends[Math.min(bends.length-1,index+2)];
  const span = b[0] - a[0], t = clamp((along-a[0])/span), t2=t*t, t3=t2*t;
  const m0=(b[1]-before[1])/(b[0]-before[0]),m1=(after[1]-a[1])/(after[0]-a[0]);
  return (2*t3-3*t2+1)*a[1]+(t3-2*t2+t)*span*m0+(-2*t3+3*t2)*b[1]+(t3-t2)*span*m1;
}

export function maverikFloor(along) {
  return 145 + 820 * Math.exp(-(((along-7650)/780)**2)) + 900 * Math.exp(-(((along-10950)/720)**2));
}

export function maverikPoint(along, height = maverikFloor(along) + 95) {
  return {x:maverikCenter(along),y:height,z:180-along};
}

export function createMaverikRegion() {
  const length=12400,base=145,start={x:0,z:180},end={x:maverikCenter(length),z:180-length};
  const mountains=[];
  for(let index=0;index<9;index++) for(const side of [-1,1]) {
    mountains.push({x:side*(2100+(index%3)*280),z:180-(1100+index*1450),width:700+(index%3)*130,depth:950+(index%2)*250,
      height:450+(index%4)*150,cos:1,sin:0,form:'crags',summit:.5,detail:1});
  }
  const objectives=[
    {...maverikPoint(5200,240),nx:0,nz:-1,radius:240,label:'Trench exit',instruction:'Stay low and follow the trench'},
    {...maverikPoint(7650,1080),nx:0,nz:-1,radius:165,label:'First ridge',instruction:'Pull up over the ridge'},
    {...maverikPoint(9200,245),nx:0,nz:-1,radius:175,label:'Valley floor',instruction:'Dive into the valley'},
    {...maverikPoint(10950,1160),nx:0,nz:-1,radius:125,label:'Escape ridge',instruction:'Climb out of the valley'}
  ];
  return {direction:{x:0,z:-1},side:{x:1,z:0},length,base,halfWidth:3500,start,end,ceiling:4000*.3048,
    bounds:{minX:-3500,maxX:3500,minZ:180-length-700,maxZ:880},mountains,islands:[],basins:[],
    style:{...createTerrainStyle('Maverik','alpine'),snowline:2300,warp:120},
    layout:{id:'maverik',name:'Maverik · Trench run'},geology:{angle:0,phase:0,offset:0,noiseScale:1700,relief:1},
    mission:{name:'Maverik',trenchEnd:5200,trenchCeiling:1000*.3048,objectives}};
}

export function maverikHeight(region,x,z,field) {
  const along=180-z,center=maverikCenter(along),floor=maverikFloor(along);
  // The trench opens into a wide bowl after the first ridge and narrows at the
  // escape saddle. Side walls stay above the high race ceiling.
  let width=lerp(660,270,ramp(along,300,1100));
  width=lerp(width,1450,ramp(along,6100,8500));
  width=lerp(width,650,ramp(along,9500,10950));
  width=lerp(width,1000,ramp(along,11300,12400));
  const bank=ramp(Math.abs(x-center)/width,.65,1.85);
  let outer=1800+field(x,z,1200,601)*260+(field(x,z,210,607)-.5)*35;
  let massif=0;
  for(const peak of region.mountains){const u=(x-peak.x)/peak.width,v=(z-peak.z)/peak.depth;massif=Math.max(massif,peak.height*Math.exp(-(u*u+v*v)*1.6));}
  outer+=massif;
  const detail=(field(x,z,140,613)-.5)*10;
  let height=lerp(floor+detail,Math.max(floor+500,outer),bank);
  // Beyond the escape, the surrounding highlands gradually open up again.
  const outside=ramp(Math.max(-along-800,along-14000),0,1800);
  height=lerp(height,region.base+field(x,z,1100,617)*350+massif,outside);
  return height;
}
