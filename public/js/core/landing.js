import { Vector3, Quaternion } from 'three';
import { flightAttitude } from './instruments.js';
import { hitsBox } from './collision.js';

// Arcade landing envelopes in m/s. Shared wheel positions keep touchdown
// height and the visible, full-size undercarriage in agreement.
const wheel = (x, y, z, radius, kind = 'main') => ({ x, y, z, radius, kind });
const tricycle = (track, bottom, mainZ, noseZ, noseX = 0) => [
  wheel(-track, -bottom + .34, mainZ, .34), wheel(track, -bottom + .34, mainZ, .34),
  wheel(noseX, -bottom + .26, noseZ, .26, 'nose')
];
const PROFILES = {
  f16: { maxSpeed: 103, maxSink: 6, wheels: tricycle(1.25, 2.05, .8, -3.6) },
  fa18: { maxSpeed: 94, maxSink: 7, wheels: tricycle(1.8, 2.3, 1.3, -4.5) },
  f22: { maxSpeed: 107, maxSink: 6, wheels: tricycle(1.65, 2.2, 1.6, -4.8) },
  f35: { maxSpeed: 100, maxSink: 6, wheels: tricycle(1.5, 2.1, 1, -4.2) },
  a10: { maxSpeed: 73, maxSink: 5.5, wheels: tricycle(2.7, 2.1, .6, -4.5, .35) },
  p51: { maxSpeed: 57, maxSink: 4.5, restPitch: .20, wheels: [wheel(-1.55, -1.88, -1.35, .42), wheel(1.55, -1.88, -1.35, .42), wheel(0, -.73, 4.2, .18, 'tail')] },
  f4u: { maxSpeed: 56, maxSink: 5, restPitch: .22, wheels: [wheel(-1.85, -2.1, -1.1, .42), wheel(1.85, -2.1, -1.1, .42), wheel(0, -1, 4.5, .2, 'tail')] },
  c172: { maxSpeed: 36, maxSink: 3.8, fixed: true, wheels: [wheel(-1.07, -1.32, .43, .23), wheel(1.07, -1.32, .43, .23), wheel(0, -1.31, -2.5, .19, 'nose')] }
};
for (const profile of Object.values(PROFILES)) {
  profile.wheels.forEach(Object.freeze); Object.freeze(profile.wheels); Object.freeze(profile);
}
export const landingProfile = aircraft => PROFILES[aircraft.id];
const offset = new Vector3(), direction = new Vector3(), rotation = new Quaternion();
const groundPitch = new Quaternion(), groundBank = new Quaternion();
const UP = new Vector3(0, 1, 0), RIGHT = new Vector3(1, 0, 0), FORWARD = new Vector3(0, 0, -1);
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

export function landingState(aircraft, enabled) {
  const fixed = !!landingProfile(aircraft).fixed;
  return { landingEnabled: enabled, gearDown: fixed, gear: fixed ? 1 : 0, grounded: false, touchdowns: 0 };
}

export function toggleLandingGear(state) {
  if (!state.landingEnabled) return 'unavailable';
  if (landingProfile(state.aircraft).fixed) return 'fixed';
  if (state.grounded) return 'grounded';
  state.gearDown = !state.gearDown;
  return state.gearDown ? 'down' : 'up';
}

export function advanceLandingGear(state, dt) {
  const target = state.gearDown ? 1 : 0;
  state.gear += clamp(target - state.gear, -dt / 1.4, dt / 1.4);
}

// The existing airfield is a 38 x 340 m slab at (250,250), two metres above
// its base terrain. Grass landings use the same terrain as flight collisions.
export function landingGround(world, x, z) {
  const terrain = world.height(x, z);
  if (Math.abs(x - 250) <= 19 && Math.abs(z - 250) <= 170) {
    return Math.max(terrain, Math.max(0, world.height(250, 250)) + 2);
  }
  return terrain;
}
function surface(world, x, z) {
  const height = landingGround(world, x, z);
  const slopeX = (landingGround(world, x + 6, z) - landingGround(world, x - 6, z)) / 12;
  const slopeZ = (landingGround(world, x, z + 6) - landingGround(world, x, z - 6)) / 12;
  return { height, slopeX, slopeZ, slope: Math.hypot(slopeX, slopeZ) };
}

function hitsHangar(state, world) {
  if (Math.min(state.previous.x, state.position.x) > 314 || Math.max(state.previous.x, state.position.x) < 280 ||
      Math.min(state.previous.z, state.position.z) > 291 || Math.max(state.previous.z, state.position.z) < 185) return false;
  const base = Math.max(0, world.height(250, 250)) + 1;
  for (let i = 0; i < 3; i++) {
    const z = 200 + i * 38;
    if (hitsBox(state.previous, state.position, { x: 283, y: base, z: z - 12 }, { x: 311, y: base + 15, z: z + 12 }, 2)) {
      state.crashed = true; state.crashReason = 'obstacle'; state.obstacle = 'hangar'; return true;
    }
  }
  return false;
}

function wheelClearance(state) {
  let clearance = .65;
  for (const wheel of landingProfile(state.aircraft).wheels) {
    offset.set(wheel.x, wheel.y, wheel.z).applyQuaternion(state.quaternion);
    clearance = Math.max(clearance, (-offset.y + wheel.radius) * state.gear);
  }
  return clearance;
}

function supportHeight(state, world) {
  let height = -Infinity;
  for (const wheel of landingProfile(state.aircraft).wheels) {
    offset.set(wheel.x, wheel.y, wheel.z).applyQuaternion(state.quaternion);
    height = Math.max(height, landingGround(world, state.position.x + offset.x, state.position.z + offset.z) - offset.y + wheel.radius);
  }
  return height;
}

function settleAttitude(state, ground, dt) {
  direction.copy(state.travelDirection); direction.y = 0; direction.normalize();
  const pitch = Math.atan(ground.slopeX * direction.x + ground.slopeZ * direction.z) + (landingProfile(state.aircraft).restPitch || 0);
  const bank = Math.atan(ground.slopeX * -direction.z + ground.slopeZ * direction.x);
  rotation.setFromAxisAngle(UP, Math.atan2(-direction.x, -direction.z));
  rotation.multiply(groundPitch.setFromAxisAngle(RIGHT, pitch));
  rotation.multiply(groundBank.setFromAxisAngle(FORWARD, -bank));
  state.quaternion.slerp(rotation, 1 - Math.exp(-dt * 9)).normalize();
}

// Swept wheel/body contact prevents a fast descent tunnelling under a hill.
// Called only in free flight; the race collision and replay rules stay intact.
export function resolveLanding(state, world) {
  if (hitsHangar(state, world)) return;
  const profile = landingProfile(state.aircraft), clearance = wheelClearance(state);
  const steps = Math.max(1, Math.ceil(state.previous.distanceTo(state.position) / 2));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, x = state.previous.x + (state.position.x - state.previous.x) * t;
    const y = state.previous.y + (state.position.y - state.previous.y) * t, z = state.previous.z + (state.position.z - state.previous.z) * t;
    const h = landingGround(world, x, z);
    if (y > Math.max(0, h) + clearance) continue;
    const ground = surface(world, x, z), attitude = flightAttitude(state.quaternion);
    const sink = -(state.velocity.y - ground.slopeX * state.velocity.x - ground.slopeZ * state.velocity.z);
    let reason;
    if (h <= 0) reason = 'water';
    else if (!state.gearDown || state.gear < .98) reason = 'landing-gear';
    else if (state.speed > profile.maxSpeed) reason = 'landing-speed';
    else if (sink > profile.maxSink) reason = 'landing-impact';
    else if (Math.abs(attitude.bank) > 12 * Math.PI / 180 || attitude.pitch < -.07 || attitude.pitch > .26 || state.slipAngle > 22) reason = 'landing-attitude';
    else if (ground.slope > .14) reason = 'landing-slope';
    state.position.set(x, Math.max(0, h) + clearance, z);
    if (reason) { state.crashed = true; state.crashReason = reason; return; }
    state.grounded = true; state.touchdowns++;
    state.stalled = false; state.stallAmount = 0; state.stallWarning = false; state.loadFactor = 1;
    state.velocity.y = 0; state.speed = state.velocity.length();
    state.travelDirection.copy(state.velocity).normalize();
    if (!state.speed) state.travelDirection.set(0, 0, -1).applyQuaternion(state.quaternion).setY(0).normalize();
    state.position.y = supportHeight(state, world);
    return;
  }
}

export function stepGroundRoll(state, input, dt, world) {
  const plane = state.aircraft, profile = landingProfile(plane);
  state.drifting = false; state.controls.drift = false;
  state.stalled = false; state.stallAmount = 0; state.stallWarning = false; state.loadFactor = 1; state.slipAngle = 0;
  const braking = !!(input.drift || input.brake);
  const steering = (state.controls.yaw + state.controls.roll * .45) * Math.min(1, state.speed / 3) * .85 / (1 + state.speed / 22);
  // Abrupt high-speed ground turns can tip the aircraft over.
  if (Math.abs(steering * state.speed) > 9) { state.crashed = true; state.crashReason = 'landing-control'; return; }
  state.travelDirection.applyAxisAngle(UP, steering * dt).setY(0).normalize();
  const power = .005 + .995 * state.throttle ** 2;
  const thrust = plane.acceleration * (power - (state.speed / plane.maxSpeed) ** 2) * .65;
  state.speed = Math.max(0, state.speed + (thrust - .65 - state.speed * .018 - (braking ? 5.5 + state.speed * .08 : 0)) * dt);
  state.velocity.copy(state.travelDirection).multiplyScalar(state.speed);
  const oldGround = surface(world, state.position.x, state.position.z);
  state.position.addScaledVector(state.velocity, dt);
  if (hitsHangar(state, world)) return;
  const ground = surface(world, state.position.x, state.position.z);
  if (ground.height <= 0 || ground.slope > .14 || ground.height - oldGround.height > 1.2) {
    state.crashed = true; state.crashReason = ground.height <= 0 ? 'water' : 'landing-slope'; return;
  }
  settleAttitude(state, ground, dt);
  state.position.y = supportHeight(state, world);
  if (oldGround.height - ground.height > 1.2 || (!braking && state.speed >= plane.stallSpeed * 1.25 && state.controls.pitch > .1)) {
    state.grounded = false;
    rotation.setFromAxisAngle(RIGHT, .10); state.quaternion.multiply(rotation).normalize();
    state.travelDirection.set(0, 0, -1).applyQuaternion(state.quaternion).normalize();
    state.velocity.copy(state.travelDirection).multiplyScalar(state.speed);
    state.position.y = Math.max(state.position.y + .15, supportHeight(state, world) + .15);
  }
  state.distance += state.speed * dt; state.elapsed += dt;
}

export const LANDING_FAILURES = {
  'landing-gear': 'Lower the landing gear with G and let it lock before touching down.',
  'landing-speed': 'Touchdown was too fast. Reduce throttle and slow down before landing.',
  'landing-impact': 'That touchdown was too hard. Use a shallower descent and flare gently.',
  'landing-attitude': 'Keep the wings level, nose slightly up, and line up with your flight path.',
  'landing-slope': 'That ground was too steep or rough. Choose a runway or flatter ground.',
  'landing-control': 'The ground turn was too sharp at that speed. Brake before turning.'
};
