import { AIRCRAFT } from '../public/js/core/aircraft-data.js';
import { generatorVersionFor, FLIGHT_VERSION, normalizeSeed } from '../public/js/core/seed.js';
import { createWorld } from '../public/js/core/world.js';
import { generateCourse, createRace, stepRace, enforceRaceRules } from '../public/js/core/race.js';
import { createFlight, stepFlight, FIXED_DT } from '../public/js/core/flight.js';
import { LandmarkField } from '../public/js/core/landmarks.js';

export function raceScope(seed, aircraft) {
  if (typeof seed !== 'string' || !seed.trim() || seed.length > 64 || !AIRCRAFT.some(plane => plane.id === aircraft)) throw new Error('Choose a valid course and plane.');
  return { seed: normalizeSeed(seed), aircraft };
}

export function verifyRace(run) {
  const scope = raceScope(run?.seed, run?.aircraft);
  if (run.generatorVersion !== generatorVersionFor(scope.seed) || run.flightVersion !== FLIGHT_VERSION) throw new Error('Reload the game before submitting a time.');
  const { ticks, commands } = run;
  if (!Number.isInteger(ticks) || ticks < 1 || ticks > 120 * 1800 || !Array.isArray(commands) || !commands.length || commands.length > 20000) throw new Error('Invalid race recording.');
  let previous = -1;
  for (const command of commands) {
    if (!Array.isArray(command) || command.length !== 6 || !command.every(Number.isFinite)) throw new Error('Invalid flight controls.');
    const [tick, pitch, roll, yaw, throttle, drift] = command;
    if (!Number.isInteger(tick) || tick <= previous || tick >= ticks || Math.abs(pitch) > 1.5 || Math.abs(roll) > 1.5 || Math.abs(yaw) > 1 || Math.abs(throttle) > 1 || ![0, 1].includes(drift)) throw new Error('Invalid flight controls.');
    previous = tick;
  }
  if (commands[0][0] !== 0) throw new Error('The recording must start at takeoff.');
  const world = createWorld(scope.seed), course = generateCourse(world), race = createRace(course);
  const flight = createFlight(AIRCRAFT.find(plane => plane.id === scope.aircraft), course.spawn), landmarks = new LandmarkField(world, course);
  let index = 0, input;
  for (let tick = 0; tick < ticks; tick++) {
    if (commands[index]?.[0] === tick) {
      const [, pitch, roll, yaw, throttle, drift] = commands[index++];
      input = { pitch, roll, yaw, throttle, drift: !!drift };
    }
    stepFlight(flight, input, FIXED_DT, world);
    enforceRaceRules(flight, course);
    if (flight.crashReason === 'ceiling') throw new Error('The race ceiling was exceeded.');
    if (flight.crashed || landmarks.collision(flight.previous, flight.position, flight.elapsed)) throw new Error('The recording contains a collision.');
    stepRace(race, flight.previous, flight.position, flight.elapsed);
    if (race.finished) {
      if (tick !== ticks - 1) throw new Error('The recording continues past the finish.');
      return { ...scope, time: flight.elapsed };
    }
  }
  throw new Error('Reach the finish ring to submit a time.');
}
