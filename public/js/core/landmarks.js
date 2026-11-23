import { random } from './seed.js';
import { hitsCapsule, hitsSphere, hitsBox } from './collision.js';
import { SETTLEMENT_CELL } from './settlements.js';
import { createOutcrop, placeTower } from './landmark-placement.js';
export const LANDMARK_CELL = SETTLEMENT_CELL;
export const ROTOR_RADIUS = 48;
export const ROTOR_SPEED = .68;
export const ROTOR_OFFSET_Z = -12;
const labels={wind:'wind turbine',tower:'radio tower',balloon:'balloon',outcrop:'boulder',village:'building'};

function place(world, item) {
  if (item.type === 'outcrop') return createOutcrop(world, item);
  if (item.type === 'wind' || item.type === 'tower') return placeTower(world, item, item.type === 'wind' ? ROTOR_RADIUS : 0);
  return item;
}

export function generateLandmarkCell(world,cx,cz) {
  if (world.region.mission) return [];
  const settlement = world.settlement(cx, cz);
  if (settlement) return [settlement];
  const rng=random(`${world.seed}:landmarks:1:${cx}:${cz}`);
  if(rng()<.12)return [];
  const x=(cx+.18+rng()*.64)*LANDMARK_CELL,z=(cz+.18+rng()*.64)*LANDMARK_CELL;
  const ground=world.height(x,z),type=['wind','wind','tower','balloon','outcrop','outcrop'][Math.floor(rng()*6)];
  if(ground<12&&type!=='balloon')return [];
  const item={id:`cell:${cx}:${cz}`,type,x,z,y:Math.max(0,ground),height:150+rng()*130,phase:rng()*Math.PI*2,variant:Math.floor(rng()*3)};
  if(type==='balloon'){item.y+=140+rng()*220;item.height=26;}
  const placed = place(world, item);
  return placed ? [placed] : [];
}

export function courseLandmarks(world, course) {
  if (world.region.mission) return [];
  const rng = random(`${world.seed}:open-obstacles:1`), result = [], region = world.region;
  const count = 13 + Math.floor(rng() * 12);
  for (let attempt = 0; attempt < count * 5 && result.length < count; attempt++) {
    const along = region.length * (.12 + rng() * .76), across = (rng() - .5) * region.halfWidth * 1.65;
    const x = region.start.x + region.direction.x * along + region.side.x * across;
    const z = region.start.z + region.direction.z * along + region.side.z * across;
    const ground = Math.max(0, world.height(x, z));
    if (ground > course.ceiling - 250 || result.some(item => Math.hypot(item.x - x, item.z - z) < 260)) continue;
    if (Math.hypot(x - course.spawn.x, z - course.spawn.z) < 700 || Math.hypot(x - course.finish.x, z - course.finish.z) < 500) continue;
    const type = ['balloon', 'tower', 'wind', 'outcrop'][Math.floor(rng() * 4)];
    const item = place(world, { id: `open:${result.length}`, type, x, z, y: type === 'balloon' ? ground + 160 + rng() * 130 : ground,
      height: type === 'balloon' ? 26 : 130 + rng() * 130, phase: rng() * Math.PI * 2, variant: Math.floor(rng() * 3), overview: true });
    if (!item || item.y > course.ceiling - 250 || result.some(other => Math.hypot(other.x - item.x, other.z - item.z) < 260)) continue;
    if (Math.hypot(item.x - course.spawn.x, item.z - course.spawn.z) < 700 || Math.hypot(item.x - course.finish.x, item.z - course.finish.z) < 500) continue;
    result.push(item);
  }
  result.push({ id: 'home-balloon', type: 'balloon', x: 290, z: -490, y: Math.max(0, world.height(290, -490)) + 230, height: 26, phase: 0, variant: 0 });
  result.push(world.homeSettlement);
  return result;
}

export function landmarkHit(item,from,to,time=0,padding=6) {
  const {x,y,z,height}=item;
  if(item.type==='balloon') {
    const center={x,y:y+Math.sin(time*.45+item.phase)*2,z};
    return hitsSphere(from,to,center,26+padding)||hitsSphere(from,to,{x,y:center.y-34,z},5+padding);
  }
  if(item.type==='village') {
    if (hitsCapsule(from, to, item.well, { ...item.well, y: item.well.y + item.well.height }, item.well.radius + padding)) return true;
    if (hitsCapsule(from, to, item.silo, { ...item.silo, y: item.silo.y + item.silo.height }, item.silo.radius + padding)) return true;
    return item.houses.some(h => {
      const c = Math.cos(h.yaw), s = Math.sin(h.yaw);
      const local = p => ({ x: (p.x-h.x)*c-(p.z-h.z)*s, y: p.y-h.y, z: (p.x-h.x)*s+(p.z-h.z)*c });
      return hitsBox(local(from), local(to), { x: -h.width/2, y: 0, z: -h.depth/2 }, { x: h.width/2, y: h.height+h.roof, z: h.depth/2 }, padding);
    });
  }
  if(item.type==='outcrop') {
    return item.rocks.some(rock => {
      const c = Math.cos(rock.yaw), s = Math.sin(rock.yaw);
      const local = p => ({ x: ((p.x - rock.x) * c - (p.z - rock.z) * s) / (rock.width / 2 + padding),
        y: (p.y - rock.y) / (rock.height / 2 + padding), z: ((p.x - rock.x) * s + (p.z - rock.z) * c) / (rock.depth / 2 + padding) });
      return hitsSphere(local(from), local(to), { x: 0, y: 0, z: 0 }, 1);
    });
  }
  if(item.footing && hitsBox(from,to,{x:x-11,y:y-item.footing.depth,z:z-11},{x:x+11,y,z:z+11},padding))return true;
  if(hitsCapsule(from,to,{x,y,z},{x,y:y+height,z},(item.type==='tower'?10:5)+padding))return true;
  if(item.type==='wind')for(let blade=0;blade<3;blade++) {
    const angle=time*ROTOR_SPEED+item.phase+blade*Math.PI*2/3;
    const hub={x,y:y+height,z:z+ROTOR_OFFSET_Z};
    const tip={x:x+Math.sin(angle)*ROTOR_RADIUS,y:y+height+Math.cos(angle)*ROTOR_RADIUS,z:z+ROTOR_OFFSET_Z};
    if(hitsCapsule(from,to,hub,tip,3+padding))return true;
  }
  if(item.type==='wind' && hitsBox(from,to,{x:x-5,y:y+height-4,z:z-8},{x:x+5,y:y+height+4,z:z+12},padding))return true;
  return false;
}

export class LandmarkField {
  constructor(world,course) {this.world=world;this.course=course;this.courseItems=courseLandmarks(world,course);this.cache=new Map();}
  cell(cx,cz) {
    const key=`${cx},${cz}`;
    if(!this.cache.has(key)) {
      const items=generateLandmarkCell(this.world,cx,cz).filter(item=>{
        if(Math.hypot(item.x-this.course.spawn.x,item.z-this.course.spawn.z)<480)return false;
        return Math.hypot(item.x-this.course.finish.x,item.z-this.course.finish.z)>300;
      });
      this.cache.set(key,items);
      if(this.cache.size>96)this.cache.delete(this.cache.keys().next().value);
    }
    return this.cache.get(key);
  }
  nearby(position,radius=1) {
    const cx=Math.floor(position.x/LANDMARK_CELL),cz=Math.floor(position.z/LANDMARK_CELL),result=[];
    for(let z=-radius;z<=radius;z++)for(let x=-radius;x<=radius;x++)result.push(...this.cell(cx+x,cz+z));
    result.push(...this.courseItems.filter(item=>Math.hypot(item.x-position.x,item.z-position.z)<LANDMARK_CELL*(radius+1)));
    return result;
  }
  collision(from,to,time) {
    for(const item of this.nearby(to)) {
      if(Math.hypot(item.x-to.x,item.z-to.z)>(item.type==='village'?260:160)+Math.hypot(to.x-from.x,to.z-from.z))continue;
      if(landmarkHit(item,from,to,time))return{...item,label:labels[item.type]};
    }
    return null;
  }
}
