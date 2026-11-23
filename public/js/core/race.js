import { createRegion } from './region.js';

export function generateCourse(world) {
  const region = world.region || createRegion(world.seed);
  const spawn = { x: region.start.x, y: Math.max(0, world.height(region.start.x, region.start.z)) + 175, z: region.start.z,
    heading: Math.atan2(-region.direction.x, -region.direction.z) };
  const finish = { x: region.end.x, y: Math.max(0, world.height(region.end.x, region.end.z)) + 170, z: region.end.z,
    radius: 145, nx: region.direction.x, nz: region.direction.z };
  const course = { spawn, finish, ceiling: region.ceiling, bounds: { ...region.bounds } };
  if (region.mission) {
    spawn.y = world.height(spawn.x,spawn.z)+95;
    course.mission = { ...region.mission, startZ:region.start.z };
  }
  return course;
}

// Either side of the finish is valid: racers choose their own approach.
export function crossedGate(from, to, gate) {
  const a = (from.x - gate.x) * gate.nx + (from.z - gate.z) * gate.nz;
  const b = (to.x - gate.x) * gate.nx + (to.z - gate.z) * gate.nz;
  if (a === b || a * b > 0) return false;
  const t = -a / (b - a);
  const dx = from.x + (to.x - from.x) * t - gate.x;
  const dy = from.y + (to.y - from.y) * t - gate.y;
  const dz = from.z + (to.z - from.z) * t - gate.z;
  return dx * dx + dy * dy + dz * dz <= gate.radius * gate.radius;
}

export function createRace(course) { return { course, splits: [], finished: false, objectiveIndex:0 }; }
export const raceTarget = race => race.course.mission?.objectives[race.objectiveIndex] || race.course.finish;
export function raceCeiling(course,position) {
  return course.mission && course.mission.startZ-position.z<course.mission.trenchEnd ? course.mission.trenchCeiling : course.ceiling;
}
export function stepRace(race, from, to, time) {
  if (race.finished) return false;
  const objective = race.course.mission?.objectives[race.objectiveIndex];
  if (objective) {
    // Mission targets are HUD objectives, not additional rings. They must be
    // flown in order, so cruising over the bowl cannot skip the valley dive.
    if (!crossedGate(from,to,objective) || to.z>from.z) return false;
    race.objectiveIndex++;race.splits.push(time);return true;
  }
  if (!crossedGate(from, to, race.course.finish)) return false;
  race.splits.push(time); race.finished = true; return true;
}

// Call only in race mode. A ceiling violation ends the run rather than
// bouncing the airplane off an invisible roof. The server enforces it too.
export const ceilingWarningDistance = climbRate => Math.max(100, Math.max(0, climbRate) * 3);
export function enforceRaceRules(flight, course) {
  const ceiling = raceCeiling(course,flight.position);
  const warningBuffer = course.mission && ceiling===course.mission.trenchCeiling ? Math.max(40,Math.max(0,flight.velocity.y)*3) : ceilingWarningDistance(flight.velocity.y);
  flight.ceilingLimit = ceiling;
  flight.ceilingWarning = flight.position.y > ceiling - warningBuffer;
  if (!flight.crashed && flight.position.y > ceiling) { flight.crashed = true; flight.crashReason = 'ceiling'; }
}

export function formatTime(seconds, decimals = 2) {
  if (!Number.isFinite(seconds)) return '—';
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${(seconds % 60).toFixed(decimals).padStart(decimals ? 3 + decimals : 2, '0')}`;
}

// Samples store world coordinates; rendering-origin shifts never alter the recording.
export function sampleGhost(samples, time) {
  if (!samples?.length || time > samples.at(-1)[0]) return null;
  let lo = 0, hi = samples.length - 1;
  while (lo + 1 < hi) { const mid = (lo + hi) >> 1; if (samples[mid][0] <= time) lo = mid; else hi = mid; }
  const a = samples[lo], b = samples[hi], t = b[0] === a[0] ? 0 : Math.max(0, Math.min(1, (time - a[0]) / (b[0] - a[0])));
  const value = (i, fallback = 0) => (a[i] ?? fallback) + ((b[i] ?? fallback) - (a[i] ?? fallback)) * t;
  return { position: [1, 2, 3].map(i => value(i)), a: a.slice(4, 8), b: b.slice(4, 8), t, burner: value(8),
    controls: { pitch: value(9), roll: value(10), yaw: value(11), drift: !!(t < .5 ? a[12] : b[12]) },
    speed: a[13] === undefined ? null : value(13), throttle: value(14, .5) };
}
