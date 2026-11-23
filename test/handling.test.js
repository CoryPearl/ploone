import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { AIRCRAFT, supportsAfterburner } from '../public/js/core/aircraft-data.js';
import { createFlight, stepFlight, FIXED_DT } from '../public/js/core/flight.js';
import { sampleGhost } from '../public/js/core/race.js';
import { recordKey } from '../public/js/core/storage.js';
import { createAircraft, animateAircraft, disposeAircraft } from '../public/js/render/aircraft.js';

const world = { height: () => -100 };
const neutral = { pitch: 0, roll: 0, yaw: 0, throttle: 0, drift: false };
const spawn = { x: 0, y: 10000, z: 0 };
function advance(flight, seconds, controls = {}) {
  for (let i = 0; i < Math.round(seconds / FIXED_DT); i++) stepFlight(flight, { ...neutral, ...controls }, FIXED_DT, world);
  return flight;
}

test('afterburner adds acceleration and top speed only on equipped fighters', () => {
  for (const aircraft of AIRCRAFT) {
    const boosted = advance(createFlight(aircraft, spawn), 8, { throttle: 1 });
    const normal = createFlight(aircraft, spawn);
    if (supportsAfterburner(aircraft)) { normal.throttle = 1; advance(normal, 8); }
    else advance(normal, 8, { throttle: 1 });
    assert.equal(boosted.afterburner, supportsAfterburner(aircraft));
    if (supportsAfterburner(aircraft)) {
      assert.ok(boosted.speed > aircraft.maxSpeed * 1.3);
      assert.ok(boosted.speed <= aircraft.maxSpeed * 1.32 + 1e-8);
      assert.ok(boosted.distance > normal.distance * 1.1);
    } else {
      assert.equal(boosted.burner, 0); assert.equal(boosted.speed, normal.speed);
    }
  }
});

test('burner widens turns while preserving most pitch, yaw, and roll response', () => {
  const aircraft = AIRCRAFT[0];
  for (const control of ['pitch', 'yaw', 'roll']) {
    const normal = advance(createFlight(aircraft, spawn), 3);
    const boosted = advance(createFlight(aircraft, spawn), 3, { throttle: 1 });
    advance(normal, 0.3, { [control]: 1 }); advance(boosted, 0.3, { [control]: 1, throttle: 1 });
    const normalAngle = normal.quaternion.angleTo(createFlight(aircraft, spawn).quaternion);
    const boostedAngle = boosted.quaternion.angleTo(createFlight(aircraft, spawn).quaternion);
    assert.ok(boostedAngle < normalAngle * (control === 'roll' ? .95 : .87), `${control} must get harder on burner`);
    assert.ok(boostedAngle > normalAngle * .65, `${control} should remain nimble`);
  }
  const normal = advance(createFlight(aircraft, spawn), 3), boosted = advance(createFlight(aircraft, spawn), 3, { throttle: 1 });
  normal.quaternion.setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 4); boosted.quaternion.copy(normal.quaternion);
  const initial = normal.quaternion.clone();
  advance(normal, 0.15); advance(boosted, 0.15, { throttle: 1 });
  assert.ok(boosted.quaternion.angleTo(initial) < normal.quaternion.angleTo(initial));
});

test('air drift rotates the nose while retaining momentum, then regrips on release', () => {
  for (const aircraft of AIRCRAFT) {
    const drift = advance(createFlight(aircraft, spawn), 0.7, { drift: true, yaw: 1 });
    const normal = advance(createFlight(aircraft, spawn), 0.7, { yaw: 1 });
    assert.ok(drift.slipAngle > 40, `${aircraft.id} should slide sideways`);
    assert.ok(drift.slipAngle > normal.slipAngle * 4);
    assert.ok(drift.speed < normal.speed);
    assert.ok(Math.abs(drift.velocity.length() - drift.speed) < 1e-8);
    const displaced = drift.position.clone().sub(new Vector3(spawn.x, spawn.y, spawn.z));
    assert.ok(Math.abs(displaced.x) < Math.abs(normal.position.x) * 0.5, 'momentum should initially retain the old line');
    advance(drift, 1.2);
    assert.equal(drift.drifting, false); assert.ok(drift.slipAngle < 0.1);
  }
});

test('Space cancels burner, releasing Space restores it, and releasing Shift stops boost', () => {
  const flight = advance(createFlight(AIRCRAFT[0], spawn), 5, { throttle: 1 });
  const boostedSpeed = flight.speed;
  advance(flight, 0.5, { drift: true, throttle: 1 });
  assert.equal(flight.afterburner, false); assert.equal(flight.drifting, true);
  assert.ok(flight.burner < 0.025); assert.ok(flight.speed < boostedSpeed);
  advance(flight, .5, { throttle: 1 });
  assert.equal(flight.afterburner, true);
  advance(flight, 10);
  assert.equal(flight.afterburner, false);
  assert.ok(flight.speed < flight.aircraft.maxSpeed * 1.02); assert.equal(flight.drifting, false);
});

test('long sideways and backwards drifts stay finite and preserve a unit heading', () => {
  const flight = createFlight(AIRCRAFT[0], spawn);
  for (let i = 0; i < 1200; i++) {
    stepFlight(flight, { ...neutral, drift: true, yaw: 1, roll: 0.2 }, FIXED_DT, world);
    assert.ok([...flight.position.toArray(), ...flight.velocity.toArray(), flight.slipAngle].every(Number.isFinite));
    assert.ok(Math.abs(flight.travelDirection.length() - 1) < 1e-9);
    assert.ok(Math.abs(flight.quaternion.length() - 1) < 1e-9);
  }
});

test('flames follow explicit burner state rather than ordinary high throttle', () => {
  for (const aircraft of AIRCRAFT) {
    const model = createAircraft(aircraft);
    animateAircraft(model, aircraft, 1, 1, FIXED_DT, 0);
    assert.equal(model.userData.exhaust?.visible || false, false);
    animateAircraft(model, aircraft, 0.5, 1, FIXED_DT, 1);
    assert.equal(model.userData.exhaust?.visible || false, supportsAfterburner(aircraft));
    disposeAircraft(model);
  }
});

test('new ghosts interpolate burner visuals and use a separate handling-version record', () => {
  const samples = [[0, 0, 100, 0, 0, 0, 0, 1, 0.2], [1, 0, 100, -100, 0, 0, 0, 1, 0.8]];
  assert.equal(sampleGhost(samples, 0.5).burner, 0.5);
  assert.equal(sampleGhost(samples.map(sample => sample.slice(0, 8)), 0.5).burner, 0);
  assert.equal(recordKey('sunday', 'f16'), '9:4:sunday:f16');
});

test('boost requires holding throttle up at exactly full power, and never a separate B flag', () => {
  const aircraft = AIRCRAFT[0], flight = createFlight(aircraft, spawn);
  stepFlight(flight, { afterburner: true }, FIXED_DT, world);
  assert.equal(flight.afterburner, false);
  flight.throttle = .98;
  stepFlight(flight, { throttle: 1 }, FIXED_DT, world);
  assert.ok(flight.throttle < 1); assert.equal(flight.afterburner, false);
  advance(flight, .1, { throttle: 1 });
  assert.equal(flight.throttle, 1); assert.equal(flight.afterburner, true);
  stepFlight(flight, neutral, FIXED_DT, world);
  assert.equal(flight.throttle, 1); assert.equal(flight.afterburner, false);
  advance(flight, 1); assert.ok(flight.burner < .001);
  stepFlight(flight, { afterburner: true }, FIXED_DT, world); assert.equal(flight.afterburner, false);
  stepFlight(flight, { throttle: 1 }, FIXED_DT, world); assert.equal(flight.afterburner, true);
  stepFlight(flight, { throttle: -1 }, FIXED_DT, world); assert.equal(flight.afterburner, false);
});

test('ghosts replay controls, deployed flaps, airspeed, and power with safe legacy defaults', () => {
  const a = [0, 0, 100, 0, 0, 0, 0, 1, .2, -1, .5, 0, 0, 100, .6];
  const b = [1, 0, 100, -100, 0, 0, 0, 1, .8, 1, -.5, 1, 1, 200, 1];
  const sample = sampleGhost([a, b], .5);
  assert.deepEqual(sample.controls, { pitch: 0, roll: 0, yaw: .5, drift: true });
  assert.equal(sample.speed, 150); assert.equal(sample.throttle, .8);
  const legacy = sampleGhost([a.slice(0, 8), b.slice(0, 8)], .5);
  assert.deepEqual(legacy.controls, { pitch: 0, roll: 0, yaw: 0, drift: false });
  assert.equal(legacy.speed, null); assert.equal(legacy.throttle, .5);
});
