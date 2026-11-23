import { Vector3 } from 'three';
import { planRoute } from './route-planner.js';
import { AIRCRAFT } from '../public/js/core/aircraft-data.js';
import { createWorld } from '../public/js/core/world.js';
import { generateCourse, createRace, stepRace, enforceRaceRules } from '../public/js/core/race.js';
import { createFlight, stepFlight, FIXED_DT } from '../public/js/core/flight.js';
import { LandmarkField } from '../public/js/core/landmarks.js';
import { createRecording, recordControls } from '../public/js/core/recording.js';
import { generatorVersionFor, FLIGHT_VERSION } from '../public/js/core/seed.js';

// This pilot discovers its own route from terrain; races supply only a finish.
export function recordedRace(seed = 'route-1', preference = 0, aircraft = 'f16', options = {}) {
  const world = createWorld(seed), course = generateCourse(world), field = new LandmarkField(world, course);
  const flight = createFlight(AIRCRAFT.find(plane => plane.id === aircraft), course.spawn), race = createRace(course), recording = createRecording();
  const route = planRoute(world, course, preference === 0 ? 0 : preference === 1 ? -1 : 1, options); let point = 1, avoidance = null;
  for (let tick = 0; tick < 120 * 500 && !flight.crashed && !race.finished; tick++) {
    let target = route[point];
    const previous = route[point - 1];
    const passed = (flight.position.x - target.x) * (target.x - previous.x) + (flight.position.z - target.z) * (target.z - previous.z) > 0;
    if (point < route.length - 1 && (passed || Math.hypot(target.x - flight.position.x, target.z - flight.position.z) < 90)) target = route[++point];
    const aim = new Vector3(target.x, target.y, target.z);
    if (point === route.length - 1) aim.set(course.finish.x + course.finish.nx * 80, course.finish.y, course.finish.z + course.finish.nz * 80);
    if (avoidance && (flight.position.x-avoidance.x)*avoidance.dx+(flight.position.z-avoidance.z)*avoidance.dz > 55) avoidance = null;
    if (!avoidance) {
      const dx = aim.x-flight.position.x, dz = aim.z-flight.position.z, length = Math.hypot(dx,dz), nx=dx/length,nz=dz/length;
      const obstacle = field.nearby(flight.position).find(item => {
        if (item.type==='village' || item.y>flight.position.y+60 || item.y+(item.type==='balloon'?40:item.height+50)<flight.position.y-60) return false;
        const forward=(item.x-flight.position.x)*nx+(item.z-flight.position.z)*nz;
        const side=-(item.x-flight.position.x)*nz+(item.z-flight.position.z)*nx;
        return forward>20 && forward<500 && Math.abs(side)<85;
      });
      if (obstacle) {
        const side=-(obstacle.x-flight.position.x)*nz+(obstacle.z-flight.position.z)*nx, sign=side>=0?-1:1;
        avoidance={x:obstacle.x,z:obstacle.z,dx:nx,dz:nz,tx:obstacle.x-nz*sign*190+nx*55,tz:obstacle.z+nx*sign*190+nz*55};
      }
    }
    if (avoidance) aim.set(avoidance.tx,target.y,avoidance.tz);
    // Do not cut a tight cliff corner or descend toward the finish through a
    // hillside. Inspect upcoming ground like a pilot, within the race ceiling.
    const ahead = aim.clone().sub(flight.position), distance = Math.hypot(ahead.x, ahead.z);
    for (let d = 0; distance > 0 && d <= Math.min(950, distance); d += 100) {
      const ground = world.height(flight.position.x + ahead.x / distance * d, flight.position.z + ahead.z / distance * d);
      aim.y = Math.max(aim.y, Math.min(course.ceiling - 70, ground + 180));
    }
    // Gain the route's transit altitude early instead of making the whole first
    // leg a shallow approach that can intersect a foothill halfway to its end.
    if (point === 1 && flight.position.y < target.y - 35) aim.y = Math.max(aim.y, flight.position.y + distance * .22);
    const direction = aim.sub(flight.position), local = direction.clone().applyQuaternion(flight.quaternion.clone().invert());
    const forward = new Vector3(0, 0, -1).applyQuaternion(flight.quaternion);
    const pitch = Math.atan2(direction.y, Math.hypot(direction.x, direction.z)) - Math.asin(Math.max(-1, Math.min(1, forward.y))), yaw = Math.atan2(-local.x, -local.z);
    const input = { pitch: pitch > .012 ? 1 : pitch < -.012 ? -1 : 0, roll: 0, yaw: yaw > .012 ? 1 : yaw < -.012 ? -1 : 0, throttle: 0, drift: false };
    recordControls(recording, input); stepFlight(flight, input, FIXED_DT, world); enforceRaceRules(flight, course);
    const obstacle = field.collision(flight.previous, flight.position, flight.elapsed);
    if (obstacle) throw new Error(`Test pilot hit ${obstacle.id} on exploration ${preference} at ${flight.elapsed}.`);
    stepRace(race, flight.previous, flight.position, flight.elapsed);
  }
  if (!race.finished || flight.crashed) throw new Error(`Test pilot did not finish ${seed}, exploration ${preference}, ${aircraft}: ${flight.crashReason} at ${flight.elapsed}, point ${point}.`);
  return { seed, aircraft, generatorVersion: generatorVersionFor(seed), flightVersion: FLIGHT_VERSION, ticks: recording.ticks, commands: recording.commands, time: flight.elapsed };
}
