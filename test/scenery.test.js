import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3, Scene, Fog } from 'three';
import { hitsSphere,hitsCapsule,hitsBox } from '../public/js/core/collision.js';
import { createWorld } from '../public/js/core/world.js';
import { generateCourse, enforceRaceRules } from '../public/js/core/race.js';
import { LandmarkField,generateLandmarkCell,landmarkHit,ROTOR_SPEED } from '../public/js/core/landmarks.js';
import { AIRCRAFT } from '../public/js/core/aircraft-data.js';
import { createFlight,stepFlight,FIXED_DT } from '../public/js/core/flight.js';
import { LandmarkRenderer } from '../public/js/render/landmarks.js';
import { recordedRace } from '../test-support/race-recording.js';
import { verifyRace } from '../lib/verify-race.js';

test('swept 3D obstacle collision catches fast passes but allows clean misses',()=>{
 const from=new Vector3(-600,100,0),to=new Vector3(600,100,0),center=new Vector3(0,100,0);
 assert.equal(hitsSphere(from,to,center,26),true);assert.equal(hitsSphere(from.clone().add(new Vector3(0,80,0)),to.clone().add(new Vector3(0,80,0)),center,26),false);
 assert.equal(hitsCapsule(from,to,new Vector3(0,0,0),new Vector3(0,250,0),12),true);
 assert.equal(hitsBox(from,to,{x:-10,y:0,z:-10},{x:10,y:120,z:10}),true);
});

test('seeded landmarks reproduce, leave spawn/finish open, and keep a bounded cache',()=>{
 const world=createWorld('pretty-sky'),course=generateCourse(world),a=new LandmarkField(world,course),b=new LandmarkField(world,course);
 assert.deepEqual(a.courseItems,b.courseItems);assert.deepEqual(generateLandmarkCell(world,-2,3),generateLandmarkCell(world,-2,3));
 for(const point of [course.spawn,course.finish])assert.equal(a.collision(new Vector3(point.x,point.y,point.z+5),new Vector3(point.x,point.y,point.z-5),0),null);
 for(let i=0;i<200;i++)a.nearby({x:i*1500,z:-i*1700},2);
 assert.ok(a.cache.size<=96);
});

test('farm villages have solid houses and wells, with visible barns, crops, fences, silos, and orchards',()=>{
 const world=createWorld('sunday-morning'),course=generateCourse(world),field=new LandmarkField(world,course),village=world.homeSettlement;
 assert.ok(village.houses.length>=5);assert.equal(village.fields.length,2);assert.equal(village.orchard.length,12);
 const house=village.houses[0];assert.equal(landmarkHit(village,{x:house.x,y:house.y+3,z:house.z+100},{x:house.x,y:house.y+3,z:house.z-100}),true);
 const well=village.well;assert.equal(landmarkHit(village,{x:well.x-20,y:well.y+4,z:well.z},{x:well.x+20,y:well.y+4,z:well.z}),true);
 const silo=village.silo;assert.equal(landmarkHit(village,{x:silo.x-20,y:silo.y+15,z:silo.z},{x:silo.x+20,y:silo.y+15,z:silo.z}),true);
 assert.ok(world.landCover(village.fields[0].x,village.fields[0].z));
 const scene=new Scene();scene.fog=new Fog('#ddd',1000,4000);const renderer=new LandmarkRenderer(scene);renderer.setField(field);renderer.update(course.spawn,new Vector3(),0,'high');
 const rendered=renderer.objects.get(village.id);assert.ok(rendered);
 for(const name of ['houses','barns','village-well','fence-posts','crop-rows','orchard-trees','grain-silo','hay-bales'])assert.ok(rendered.getObjectByName(name),name);
});

test('wind turbine collision follows its visible spinning blades',()=>{
 const wind={type:'wind',x:0,y:0,z:0,height:180,phase:0};
 assert.equal(landmarkHit(wind,{x:0,y:226,z:-60},{x:0,y:226,z:40},0),true);
 assert.equal(landmarkHit(wind,{x:0,y:226,z:-60},{x:0,y:226,z:40},Math.PI/(2*ROTOR_SPEED)),false);
});

test('independently discovered lines finish the same open race and verify without intermediate checkpoints',()=>{
 for(const seed of ['route-20','route-28','route-37']) {
  const times=[],commands=[];
  for(let branch=0;branch<3;branch++) { const run=recordedRace(seed,branch);assert.equal(verifyRace(run).time,run.time);times.push(run.time);commands.push(JSON.stringify(run.commands)); }
  assert.equal(new Set(times).size,3,`${seed}: different flight lines produce different race times`);
  assert.equal(new Set(commands).size,3,`${seed}: alternatives require different piloting`);
 }
});

test('race ceilings warn and reject altitude violations while free flight stays uncapped',()=>{
 const world=createWorld('ceiling'),course=generateCourse(world),flight=createFlight(AIRCRAFT[0],course.spawn);
 flight.position.y=course.ceiling-50;enforceRaceRules(flight,course);assert.equal(flight.ceilingWarning,true);assert.equal(flight.crashed,false);
 flight.position.y=course.ceiling+1;enforceRaceRules(flight,course);assert.equal(flight.crashed,true);assert.equal(flight.crashReason,'ceiling');
 const free=createFlight(AIRCRAFT[0],{...course.spawn,y:course.ceiling+400});stepFlight(free,{pitch:0,roll:0,yaw:0,throttle:0},FIXED_DT,world);assert.equal(free.crashed,false);
});

test('choosing a faster line through the same geography can beat a wide detour', () => {
 const wide = recordedRace('route-20', 0, 'f16', { clearance: 250 });
 const tight = recordedRace('route-20', 1, 'f16', { clearance: 250 });
 assert.equal(verifyRace(wide).time, wide.time); assert.equal(verifyRace(tight).time, tight.time);
 assert.ok(tight.time < wide.time * .9, 'route choice must make a meaningful difference to the race time');
 assert.notDeepEqual(tight.commands, wide.commands);
});
