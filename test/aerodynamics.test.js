import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3, Quaternion, Scene } from 'three';
import { AIRCRAFT } from '../public/js/core/aircraft-data.js';
import { createFlight, stepFlight, FIXED_DT } from '../public/js/core/flight.js';
import { CrashEffect } from '../public/js/render/crash-effect.js';

const world = { height: () => -1000 }, spawn = { x: 0, y: 10000, z: 0 };
const neutral = { pitch: 0, roll: 0, yaw: 0, throttle: 0, drift: false };
function advance(flight, seconds, controls = () => neutral) {
  for (let i = 0; i < Math.round(seconds / FIXED_DT); i++) stepFlight(flight, { ...neutral, ...controls(flight, i) }, FIXED_DT, world);
  return flight;
}

test('level flight holds cruise and ordinary turns spend a modest amount of speed', () => {
  for (const aircraft of AIRCRAFT) {
    const level = advance(createFlight(aircraft, spawn), 5);
    assert.ok(Math.abs(level.speed - aircraft.cruise) < .001); assert.equal(level.stalled, false);
    const turn = createFlight(aircraft, spawn), bank = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 3);
    advance(turn, 5, () => { turn.quaternion.copy(bank); return neutral; });
    assert.ok(turn.speed < level.speed - .15 && turn.speed > level.speed * .90, `${aircraft.id}: a steep bank must cost speed`);
    assert.ok(turn.stallSpeed > aircraft.stallSpeed && turn.stallSpeed < aircraft.stallSpeed * 1.1);
    const rudder = advance(createFlight(aircraft, spawn), 5, () => ({ yaw: 1 }));
    assert.ok(rudder.speed < level.speed && rudder.speed > level.speed * .85, `${aircraft.id}: sustained rudder adds drag`);
  }
});

test('climbing consumes energy and diving restores airspeed', () => {
  const climb = createFlight(AIRCRAFT[0], spawn), dive = createFlight(AIRCRAFT[0], spawn);
  for (const [flight, angle] of [[climb, .25], [dive, -.25]]) {
    flight.quaternion.setFromAxisAngle(new Vector3(1, 0, 0), angle);
    flight.travelDirection.set(0, 0, -1).applyQuaternion(flight.quaternion);
    advance(flight, 5);
  }
  assert.ok(dive.speed > climb.speed + 15); assert.ok(climb.position.y > spawn.y); assert.ok(dive.position.y < spawn.y);
});

test('all aircraft warn before a power-off stall, lose height, and recover with nose down and power', () => {
  for (const aircraft of AIRCRAFT) {
    const flight = createFlight(aircraft, spawn);
    let warned = false, stallAt = null;
    for (let tick = 0; tick < 120 * 65; tick++) {
      stepFlight(flight, { ...neutral, throttle: -1 }, FIXED_DT, world);
      if (flight.stallWarning && !flight.stalled) warned = true;
      if (flight.stalled) { stallAt = flight.elapsed; break; }
    }
    assert.ok(warned, aircraft.id + ' must warn before lift loss'); assert.ok(stallAt !== null, aircraft.id + ' must be able to stall');
    const height = flight.position.y;
    advance(flight, 5, () => ({ throttle: -1 }));
    assert.ok(flight.position.y < height - 5); assert.ok(flight.velocity.y < -3);
    advance(flight, 12, state => ({ throttle: 1, pitch: state.stalled || state.stallWarning ? -.75 : 0 }));
    assert.equal(flight.stalled, false, aircraft.id + ' should recover'); assert.ok(flight.stallAmount < .05); assert.ok(flight.speed > aircraft.stallSpeed * 1.12);
  }
});

test('every aircraft slows and stalls in a vertical climb, even at full power and burner speed', () => {
  for (const aircraft of AIRCRAFT) {
    const flight = createFlight(aircraft, spawn);
    flight.throttle = 1; flight.speed = aircraft.maxSpeed * 1.32;
    flight.quaternion.setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2);
    flight.travelDirection.set(0, 1, 0);
    const initialSpeed = flight.speed; let warned = false;
    for (let tick = 0; tick < 120 * 15 && !flight.stalled; tick++) {
      const before = flight.speed;
      stepFlight(flight, { ...neutral, throttle: 1 }, FIXED_DT, world);
      assert.ok(flight.speed < before, aircraft.id + ' must slow throughout its vertical climb');
      if (flight.stallWarning && !flight.stalled) warned = true;
    }
    assert.equal(flight.stalled, true, aircraft.id + ' must stall instead of climbing forever');
    assert.ok(warned); assert.ok(flight.speed < initialSpeed * .5);
  }
});

test('all aircraft respond quickly to pitch, roll, and yaw without premature high-speed stalls', () => {
  for (const aircraft of AIRCRAFT) {
    for (const control of ['pitch', 'roll', 'yaw']) {
      const flight = advance(createFlight(aircraft, spawn), .5, () => ({ [control]: 1 }));
      const angle = flight.quaternion.angleTo(new Quaternion());
      assert.ok(angle > .22, aircraft.id + ' ' + control + ' must turn promptly');
      assert.equal(flight.stalled, false); assert.ok(flight.speed > aircraft.cruise * .9);
    }
    const drift = advance(createFlight(aircraft, spawn), 2, () => ({ drift: true, yaw: 1 }));
    assert.ok(drift.slipAngle > 130); assert.ok(drift.speed > aircraft.cruise * .8); assert.equal(drift.stalled, false);
  }
});

test('stalls and long unusual maneuvers keep velocities and attitudes finite', () => {
  for (const aircraft of AIRCRAFT) {
    const flight = createFlight(aircraft, { ...spawn, y: 100000 });
    advance(flight, 35, (state, tick) => ({ pitch: Math.sin(tick / 240), roll: .4, yaw: -.3, drift: tick % 600 < 100, throttle: -.2 }));
    assert.ok([...flight.position, ...flight.velocity, ...flight.quaternion, flight.angleOfAttack, flight.loadFactor].every(Number.isFinite));
    assert.ok(Math.abs(flight.travelDirection.length() - 1) < 1e-9); assert.ok(Math.abs(flight.quaternion.length() - 1) < 1e-9);
    assert.ok(Math.abs(flight.velocity.length() - flight.speed) < 1e-8);
  }
});

test('crash particles play once, follow origin shifts, and reuse a bounded pool on retry', () => {
  const scene = new Scene(), effect = new CrashEffect(scene), impact = new Vector3(14000, 120, -9000), velocity = new Vector3(15, -40, -100);
  const meshes = effect.particles.map(particle => particle.mesh);
  effect.trigger(impact, velocity, '#a7b1b6', false, 'test-crash'); effect.update(.3, new Vector3());
  assert.equal(effect.active, true); assert.ok(effect.particles.some(particle => particle.mesh.visible));
  const origin = new Vector3(14000, 0, -9000); effect.update(.1, origin);
  assert.ok(effect.group.position.clone().add(origin).equals(impact));
  for (let i = 0; i < 60; i++) effect.update(.075, origin);
  assert.equal(effect.active, false);
  for (let i = 0; i < 20; i++) { effect.trigger(impact, velocity, '#a7b1b6', i % 2 === 0, `repeat-${i}`); effect.update(.1, origin); effect.reset(); }
  assert.deepEqual(effect.particles.map(particle => particle.mesh), meshes); assert.equal(scene.children.length, 1);
  effect.dispose(); assert.equal(scene.children.length, 0);
});
