import { Vector3 } from 'three';
import { getAircraft } from '../public/js/core/aircraft-data.js';
import { createWorld } from '../public/js/core/world.js';
import { createFlight,stepFlight,FIXED_DT } from '../public/js/core/flight.js';
import { generateCourse,createRace,stepRace,enforceRaceRules } from '../public/js/core/race.js';
import { maverikCenter } from '../public/js/core/maverik.js';
import { createRecording,recordControls } from '../public/js/core/recording.js';
import { generatorVersionFor,FLIGHT_VERSION } from '../public/js/core/seed.js';

// Test pilot only. It flies with ordinary controls; it never moves the aircraft
// directly, changes physics, relaxes race rules, or bypasses mission objectives.
export function maverikPilotTarget(along,finishHeight) {
  const profile=[[0,240],[5200,240],[7650,1100],[7850,1100],[9050,245],[9450,245],[10950,1170],[11150,1170],[12400,finishHeight],[12800,finishHeight]];
  let i=0;while(i<profile.length-2&&along>profile[i+1][0])i++;
  const a=profile[i],b=profile[i+1],t=Math.max(0,Math.min(1,(along-a[0])/(b[0]-a[0])));
  return {x:maverikCenter(along),y:a[1]+(b[1]-a[1])*t,z:180-along};
}

export function recordedMaverik(aircraft='fa18') {
  const seed='Maverik',world=createWorld(seed),course=generateCourse(world),race=createRace(course),flight=createFlight(getAircraft(aircraft),course.spawn),recording=createRecording();
  const milestones=[];let minClearance=Infinity;
  for(let tick=0;tick<120*700&&!flight.crashed&&!race.finished;tick++) {
    const along=180-flight.position.z,lookahead=along<5200?180:170;
    const target=maverikPilotTarget(along+lookahead,course.finish.y),direction=new Vector3(target.x,target.y,target.z).sub(flight.position);
    const local=direction.clone().applyQuaternion(flight.quaternion.clone().invert()),forward=new Vector3(0,0,-1).applyQuaternion(flight.quaternion);
    const pitch=Math.atan2(direction.y,Math.hypot(direction.x,direction.z))-Math.asin(Math.max(-1,Math.min(1,forward.y))),yaw=Math.atan2(-local.x,-local.z);
    const input={pitch:pitch>.012?1:pitch<-.012?-1:0,roll:0,yaw:yaw>.012?1:yaw<-.012?-1:0,throttle:along>=5200&&along<11150?1:0,drift:false};
    recordControls(recording,input);stepFlight(flight,input,FIXED_DT,world);enforceRaceRules(flight,course);
    minClearance=Math.min(minClearance,flight.position.y-world.height(flight.position.x,flight.position.z));
    const index=race.objectiveIndex;if(stepRace(race,flight.previous,flight.position,flight.elapsed)&&race.objectiveIndex!==index)milestones.push({index:race.objectiveIndex,position:flight.position.toArray(),speed:flight.speed});
  }
  if(!race.finished||flight.crashed)throw new Error(`Maverik pilot ${aircraft}: ${flight.crashReason||'incomplete'}, ${flight.elapsed.toFixed(2)}s, objective ${race.objectiveIndex}, position ${flight.position.toArray().map(n=>n.toFixed(1))}, ground ${world.height(flight.position.x,flight.position.z).toFixed(1)}, speed ${flight.speed.toFixed(1)}.`);
  return {seed,aircraft,generatorVersion:generatorVersionFor(seed),flightVersion:FLIGHT_VERSION,ticks:recording.ticks,commands:recording.commands,time:flight.elapsed,milestones,minClearance};
}
