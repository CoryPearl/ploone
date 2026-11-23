import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {createWorld,generateChunk} from '../public/js/core/world.js';
import {normalizeSeed,generatorVersionFor,GENERATOR_VERSION,MAVERIK_VERSION} from '../public/js/core/seed.js';
import {recordKey} from '../public/js/core/storage.js';
import {maverikPoint,maverikCenter} from '../public/js/core/maverik.js';
import {generateCourse,createRace,stepRace,raceTarget,raceCeiling,enforceRaceRules} from '../public/js/core/race.js';
import {LandmarkField,generateLandmarkCell} from '../public/js/core/landmarks.js';
import {createFlight,stepFlight,FIXED_DT,hitsTerrain} from '../public/js/core/flight.js';
import {getAircraft} from '../public/js/core/aircraft-data.js';
import {ceilingGridOpacity} from '../public/js/render/ceiling-grid.js';
import {recordedMaverik} from '../test-support/maverik-pilot.js';
import {verifyRace} from '../lib/verify-race.js';

test('Maverik aliases select one deterministic mission and share a new score scope without resetting other maps',()=>{
 const world=createWorld('Maverik');
 for(const alias of ['Maverik','maverik',' MAVERIK ','Maverick','mAvErIcK']){
  assert.equal(normalizeSeed(alias),'Maverik');assert.deepEqual(createWorld(alias).region,world.region);
  assert.equal(recordKey(alias,'fa18'),recordKey('Maverik','fa18'));
 }
 assert.equal(world.region.layout.id,'maverik');assert.equal(generatorVersionFor('Maverik'),MAVERIK_VERSION);
 assert.equal(generatorVersionFor('route-1'),GENERATOR_VERSION);assert.equal(recordKey('route-1','fa18'),'9:4:route-1:fa18');
 assert.notEqual(recordKey('Maverik','fa18'),'8:4:Maverik:fa18');
 assert.deepEqual(generateChunk('Maverick',0,-3),generateChunk('Maverik',0,-3));
});

test('Maverik has a winding low trench, a high first ridge, a deep valley, and a second escape climb',()=>{
 const world=createWorld('Maverik'),course=generateCourse(world),centerHeights=[];
 for(let along=0;along<=5000;along+=100){const p=maverikPoint(along,240);centerHeights.push(p.x);assert.ok(world.height(p.x,p.z)<180);const v=new Vector3(p.x,p.y,p.z);assert.equal(hitsTerrain(v,v,world),false);assert.ok(world.height(p.x+750,p.z)>raceCeiling(course,p));}
 assert.ok(Math.max(...centerHeights)-Math.min(...centerHeights)>1700);
 assert.equal(hitsTerrain(new Vector3(0,240,180),new Vector3(0,240,-5000),world),true,'a straight shortcut intersects the trench walls');
 const ground=along=>{const p=maverikPoint(along);return world.height(p.x,p.z);};
 assert.ok(ground(7650)>940);assert.ok(ground(9200)<190);assert.ok(ground(10950)>1020);assert.ok(ground(12400)<190);
 assert.equal(course.mission.objectives.length,4);assert.equal('gates'in course,false);assert.equal(course.finish.radius,145);
});

test('mission targets must be crossed forward in sequence, including a real valley descent, before the one finish',()=>{
 const course=generateCourse(createWorld('Maverik')),race=createRace(course);
 const cross=(gate,y=gate.y,reverse=false)=>stepRace(race,new Vector3(gate.x,y,gate.z+(reverse?-20:20)),new Vector3(gate.x,y,gate.z+(reverse?20:-20)),10+race.objectiveIndex);
 assert.equal(cross(course.finish),false);assert.equal(race.finished,false);
 for(const [index,target]of course.mission.objectives.entries()){
  assert.equal(raceTarget(race),target);assert.equal(cross(target,target.y,true),false);
  if(index===2){assert.equal(cross(target,1100),false);assert.equal(race.objectiveIndex,2);assert.equal(cross(course.finish),false);}
  assert.equal(cross(target),true);assert.equal(race.objectiveIndex,index+1);assert.equal(race.finished,false);
 }
 assert.equal(raceTarget(race),course.finish);assert.equal(cross(course.finish),true);assert.equal(race.finished,true);assert.equal(race.splits.length,5);
});

test('the trench ceiling lifts at the exit, warns at the active altitude, and remains absent from free flight',()=>{
 const world=createWorld('Maverik'),course=generateCourse(world);
 assert.equal(raceCeiling(course,maverikPoint(5199)),1000*.3048);assert.equal(raceCeiling(course,maverikPoint(5200)),4000*.3048);
 const flight=createFlight(getAircraft('fa18'),course.spawn);flight.position.copy(new Vector3(...Object.values(maverikPoint(3000,320))));
 enforceRaceRules(flight,course);assert.equal(flight.crashReason,'ceiling');assert.equal(flight.ceilingLimit,304.8);
 const climb=createFlight(getAircraft('fa18'),maverikPoint(6200,600));enforceRaceRules(climb,course);assert.equal(climb.crashed,false);assert.equal(climb.ceilingLimit,1219.2);
 const free=createFlight(getAircraft('fa18'),maverikPoint(2000,1500));stepFlight(free,{},FIXED_DT,world);assert.equal(free.crashed,false);
 assert.equal(ceilingGridOpacity(200,304.8,0,80),0);assert.ok(ceilingGridOpacity(290,304.8,0,80)>.85);
});

test('the mission leaves the canyon clear of turbine, balloon, and village obstacles',()=>{
 const world=createWorld('Maverik'),course=generateCourse(world),field=new LandmarkField(world,course);
 assert.equal(world.homeSettlement,null);assert.deepEqual(field.courseItems,[]);assert.deepEqual(generateLandmarkCell(world,0,-4),[]);
 for(const along of [1000,3000,5000,7650,9200,10950]){const p=maverikPoint(along);assert.equal(world.landCover(p.x,p.z),null);assert.deepEqual(field.nearby(p),[]);}
});

test('the special height field and colors join across streamed chunk borders at trench bends and ridges',()=>{
 const segments=24;
 for(const cz of [-3,-8,-11,-15]){
  const a=generateChunk('Maverik',-1,cz,segments),b=generateChunk('Maverik',0,cz,segments);
  for(let z=0;z<=segments;z++){const left=(z*(segments+1)+segments)*3,right=z*(segments+1)*3;assert.equal(a.positions[left+1],b.positions[right+1]);assert.deepEqual(a.colors.slice(left,left+3),b.colors.slice(right,right+3));}
 }
});

test('fighters and props physically complete the low approach, pop-up, valley dive, and escape and replay identically',()=>{
 for(const aircraft of ['fa18','f16','p51','c172']){
  const run=recordedMaverik(aircraft);assert.equal(verifyRace(run).time,run.time);assert.equal(run.milestones.length,4);assert.ok(run.minClearance>30);
  const [trench,ridge,valley,escape]=run.milestones.map(m=>m.position[1]);
  assert.ok(trench<304.8);assert.ok(ridge>1000);assert.ok(valley<420&&ridge-valley>650);assert.ok(escape>1100);
  assert.throws(()=>verifyRace({...run,generatorVersion:GENERATOR_VERSION}),/Reload/);
 }
});
