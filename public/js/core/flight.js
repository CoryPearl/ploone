import { Vector3, Quaternion } from 'three';
import { supportsAfterburner } from './aircraft-data.js';
import { landingState, landingProfile, advanceLandingGear, resolveLanding, stepGroundRoll } from './landing.js';
const FORWARD = new Vector3(0, 0, -1), RIGHT = new Vector3(1, 0, 0), UP = new Vector3(0, 1, 0);
const rotation = new Quaternion(), axis = new Vector3(), forward = new Vector3(), right = new Vector3(), up = new Vector3();
const steering = new Quaternion(), identity = new Quaternion();
const GRAVITY = 9.81, DEGREES = 180 / Math.PI;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const FIXED_DT = 1 / 120;

export function createFlight(aircraft, spawn, { landingEnabled = false } = {}) {
  const quaternion = new Quaternion().setFromAxisAngle(UP, spawn.heading || 0);
  const direction = FORWARD.clone().applyQuaternion(quaternion);
  return {
    aircraft, position: new Vector3(spawn.x, spawn.y, spawn.z), previous: new Vector3(spawn.x, spawn.y, spawn.z), quaternion,
    velocity: direction.clone().multiplyScalar(aircraft.cruise), travelDirection: direction,
    speed: aircraft.cruise, throttle: Math.sqrt(Math.max(0, ((aircraft.cruise / aircraft.maxSpeed) ** 2 - .005) / .995)),
    afterburner: false, burner: 0, drifting: false, slipAngle: 0,
    stalled: false, stallAmount: 0, stallWarning: false, stallSpeed: aircraft.stallSpeed, angleOfAttack: 0, loadFactor: 1,
    controls: { pitch: 0, roll: 0, yaw: 0, drift: false },
    distance: 0, elapsed: 0, crashed: false, ...landingState(aircraft, landingEnabled)
  };
}

export function hitsTerrain(from, to, world, clearance = 4) {
  const length = from.distanceTo(to), steps = Math.max(1, Math.ceil(length / 8));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, x = from.x + (to.x - from.x) * t, y = from.y + (to.y - from.y) * t, z = from.z + (to.z - from.z) * t;
    if (y <= Math.max(0, world.height(x, z)) + clearance) return true;
  }
  return false;
}

export function stepFlight(state, input, dt, world) {
  if (state.crashed) return;
  const plane = state.aircraft, q = state.quaternion;
  state.previous.copy(state.position);
  state.drifting = !!(input.drift || input.brake);
  state.throttle = clamp(state.throttle + (input.throttle || 0) * dt * .38, 0, 1);
  state.afterburner = input.throttle > 0 && state.throttle === 1 && supportsAfterburner(plane) && !state.drifting;
  state.burner += ((state.afterburner ? 1 : 0) - state.burner) * (1 - Math.exp(-dt * 8));
  state.controls.pitch = clamp(input.pitch || 0, -1.5, 1.5); state.controls.roll = clamp(input.roll || 0, -1.5, 1.5);
  state.controls.yaw = clamp(input.yaw || 0, -1, 1); state.controls.drift = state.drifting;
  if (state.landingEnabled) {
    advanceLandingGear(state, dt);
    if (state.grounded) { stepGroundRoll(state, input, dt, world); return; }
  }

  right.copy(RIGHT).applyQuaternion(q); up.copy(UP).applyQuaternion(q);
  const speedRatio = state.speed / plane.stallSpeed;
  const authority = clamp(speedRatio * speedRatio, .35, 1) * (1 - state.stallAmount * .45);
  const turnResponse = (1 - state.burner * .20) * authority;
  const pitchInput = state.controls.pitch;
  // Direct, aircraft-specific arcade response. G is feedback, not a turn cap.
  const pitchRate = pitchInput * plane.pitchRate * turnResponse * (state.drifting ? 1.6 : 1);
  const yawRate = state.controls.yaw * (state.drifting ? 1.9 : .8 * plane.agility / 100) * turnResponse;
  const bankLoad = clamp(Math.hypot(up.y, right.y) / Math.max(.18, Math.abs(up.y)), 1, plane.maxG);
  const pitchLoad = pitchRate * state.speed / GRAVITY;
  const sideLoad = Math.abs(yawRate) * state.speed / GRAVITY * (state.drifting ? .08 : .35);
  const demandedLoad = clamp(Math.hypot(Math.max(.2, bankLoad + pitchLoad), sideLoad), .2, plane.maxG);
  state.loadFactor += (demandedLoad - state.loadFactor) * (1 - Math.exp(-dt * 4));
  state.stallSpeed = plane.stallSpeed * (1 + Math.max(0, state.loadFactor - 1) * .018);

  const assistedRoll = input.roll ? 0 : -right.y * .9;
  rotation.setFromAxisAngle(FORWARD, -(state.controls.roll * plane.rollRate * (1 - state.burner * .10) * Math.max(.45, authority) * (state.drifting ? 1.2 : 1) + assistedRoll) * dt); q.multiply(rotation);
  rotation.setFromAxisAngle(RIGHT, pitchRate * dt); q.multiply(rotation);
  rotation.setFromAxisAngle(UP, yawRate * dt); q.multiply(rotation);
  const coordinatedRate = right.y * .65 * turnResponse * (state.drifting ? 1.3 : 1);
  rotation.setFromAxisAngle(UP, coordinatedRate * dt); q.premultiply(rotation).normalize();
  forward.copy(FORWARD).applyQuaternion(q); up.copy(UP).applyQuaternion(q); right.copy(RIGHT).applyQuaternion(q);
  state.angleOfAttack = Math.atan2(-state.travelDirection.dot(up), Math.hypot(state.travelDirection.dot(forward), state.travelDirection.dot(right))) * DEGREES;

  const margin = state.speed / state.stallSpeed;
  const excessiveAoA = !state.drifting && state.speed < plane.stallSpeed * 1.5 && Math.abs(state.angleOfAttack) > plane.criticalAoA * 1.45;
  if (!state.stalled && (margin < .90 || excessiveAoA)) state.stalled = true;
  else if (state.stalled && margin > 1.08 && Math.abs(state.angleOfAttack) < plane.criticalAoA * 1.1 && pitchInput < .7) state.stalled = false;
  state.stallAmount += ((state.stalled ? 1 : 0) - state.stallAmount) * (1 - Math.exp(-dt * 3));
  state.stallWarning = state.stalled || margin < 1.12 || excessiveAoA;

  // Preserve energy during playful turns and slides. Very steep climbs lose
  // useful thrust, so even a boosted fighter cannot hover or rocket upward.
  const normalPower = .005 + .995 * state.throttle ** 2;
  const power = state.afterburner ? normalPower + (1.32 ** 2 - normalPower) * state.burner : normalPower;
  const climb = Math.max(0, state.travelDirection.y);
  const steep = clamp((climb - .65) / .30, 0, 1);
  const verticalBlend = steep * steep * (3 - 2 * steep);
  const usefulPower = power * (1 - verticalBlend) * (state.drifting ? .8 : 1);
  const propulsive = plane.acceleration * (usefulPower - (state.speed / plane.maxSpeed) ** 2) * (1 + state.burner * 1.8);
  const actualLift = Math.min(state.loadFactor, Math.max(1, speedRatio ** 2));
  const dynamicPressure = Math.min(1, (state.speed / plane.cruise) ** 2);
  const inducedDrag = .055 * GRAVITY * Math.max(0, actualLift ** 2 - 1) / Math.max(.5, speedRatio ** 2) * (state.drifting ? .15 : 1);
  const slipDrag = plane.acceleration * (state.drifting ? .02 : .08) * (1 - clamp(state.travelDirection.dot(forward), -1, 1)) * dynamicPressure;
  const rudderDrag = plane.acceleration * .04 * state.controls.yaw ** 2 * dynamicPressure * (state.drifting ? .25 : 1);
  const brakeDrag = state.drifting ? plane.acceleration * .8 * (state.speed / plane.maxSpeed) ** 2 : 0;
  const stallDrag = state.stallAmount * plane.acceleration * .18 * Math.min(1, speedRatio ** 2);
  // Fixed gear is already part of the Skyhawk's normal airframe tuning.
  const gearDrag = state.landingEnabled && !landingProfile(plane).fixed ? plane.acceleration * .22 * state.gear * dynamicPressure : 0;
  state.speed = Math.max(1, state.speed + (propulsive - inducedDrag - slipDrag - rudderDrag - brakeDrag - stallDrag - gearDrag - GRAVITY * state.travelDirection.y * (1 + verticalBlend * 1.5)) * dt);

  // Separated airflow weakens steering and lift. The nose drops and the path
  // sags under gravity; unloading, lowering the nose, and power recover it.
  if (state.stallAmount > .01) {
    const noseDrop = state.stallAmount * Math.max(0, forward.y + .35) * .65;
    rotation.setFromAxisAngle(RIGHT, -noseDrop * dt); q.multiply(rotation).normalize();
    forward.copy(FORWARD).applyQuaternion(q);
  }
  steering.setFromUnitVectors(state.travelDirection, forward);
  steering.slerp(identity, Math.exp(-dt * (state.drifting ? .22 : 12 * (1 - state.stallAmount * .99))));
  state.travelDirection.applyQuaternion(steering).normalize();
  const liftLoss = Math.max(state.stallAmount * .9, 1 - clamp((state.speed / state.stallSpeed) ** 2, 0, 1));
  state.travelDirection.addScaledVector(UP, -GRAVITY * liftLoss * dt / Math.max(state.speed, 8)).normalize();
  state.slipAngle = Math.acos(clamp(state.travelDirection.dot(forward), -1, 1)) * DEGREES;
  state.velocity.copy(state.travelDirection).multiplyScalar(state.speed);
  state.position.addScaledVector(state.velocity, dt);
  state.distance += state.speed * dt; state.elapsed += dt;
  if (state.landingEnabled) resolveLanding(state, world);
  else if (hitsTerrain(state.previous, state.position, world)) {
    state.crashed = true;
    state.crashReason = world.height(state.position.x, state.position.z) <= 0 && state.position.y <= 4 ? 'water' : 'terrain';
  }
}

export function heading(quaternion) {
  axis.copy(FORWARD).applyQuaternion(quaternion);
  return (Math.atan2(axis.x, -axis.z) * DEGREES + 360) % 360;
}
