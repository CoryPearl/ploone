import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { AIRCRAFT } from '../public/js/core/aircraft-data.js';
import { createFlight, stepFlight, FIXED_DT } from '../public/js/core/flight.js';
import { toggleLandingGear, landingProfile, landingGround, resolveLanding } from '../public/js/core/landing.js';
import { createAircraft, animateAircraft, disposeAircraft, setCockpitAirframe } from '../public/js/render/aircraft.js';
import { createWorld } from '../public/js/core/world.js';

const ground = { height: () => 100 }, RIGHT = new Vector3(1, 0, 0);
function approach(aircraft, { speed = aircraft.stallSpeed * 1.3, pitch = -.035, gear = true, world = ground } = {}) {
  const f = createFlight(aircraft, { x: 1000, y: 103, z: 1000 }, { landingEnabled: true });
  f.gearDown = gear; f.gear = gear ? 1 : 0; f.throttle = .4; f.speed = speed;
  f.quaternion.setFromAxisAngle(RIGHT, pitch);
  f.travelDirection.set(0, 0, -1).applyQuaternion(f.quaternion);
  f.velocity.copy(f.travelDirection).multiplyScalar(f.speed);
  for (let i = 0; i < 2400 && !f.crashed && !f.grounded; i++) stepFlight(f, {}, FIXED_DT, world);
  return f;
}

test('every aircraft can make a gentle landing, brake to rest, taxi, and take off again', () => {
  for (const plane of AIRCRAFT) {
    const f = approach(plane);
    assert.equal(f.crashed, false, plane.id); assert.equal(f.grounded, true, plane.id); assert.equal(f.touchdowns, 1);
    assert.equal(f.stallWarning, false); assert.equal(f.velocity.y, 0);
    const landingPosition = f.position.clone();
    for (let i = 0; i < 3600 && f.speed > 0; i++) { f.throttle = 0; stepFlight(f, { drift: true }, FIXED_DT, ground); }
    assert.equal(f.crashed, false); assert.equal(f.speed, 0); assert.equal(f.grounded, true);
    assert.ok(f.position.distanceTo(landingPosition) > 10, 'touchdown must roll out instead of stopping instantly');
    const stopped = f.position.clone();
    for (let i = 0; i < 240; i++) stepFlight(f, {}, FIXED_DT, ground);
    assert.ok(f.position.distanceTo(stopped) < 1e-6, 'parked aircraft stays still');
    for (let i = 0; i < 5000 && f.grounded && !f.crashed; i++) stepFlight(f, { throttle: 1, pitch: 1 }, FIXED_DT, ground);
    assert.equal(f.crashed, false); assert.equal(f.grounded, false); assert.ok(f.velocity.y > 0);
    const liftOff = f.position.y;
    for (let i = 0; i < 120; i++) stepFlight(f, { throttle: 1 }, FIXED_DT, ground);
    assert.ok(f.position.y > liftOff + 2, 'takeoff continues into sustained flight');
  }
});

test('gear takes time to lock, reverses mid-travel, and cannot retract on the ground', () => {
  const f = createFlight(AIRCRAFT[0], { x: 1000, y: 1000, z: 1000 }, { landingEnabled: true });
  assert.equal(toggleLandingGear(f), 'down');
  for (let i = 0; i < 84; i++) stepFlight(f, {}, FIXED_DT, ground);
  assert.ok(f.gear > .45 && f.gear < .55);
  assert.equal(toggleLandingGear(f), 'up');
  for (let i = 0; i < 84; i++) stepFlight(f, {}, FIXED_DT, ground);
  assert.ok(f.gear < .001);
  const landed = approach(AIRCRAFT[0]);
  assert.equal(toggleLandingGear(landed), 'grounded'); assert.equal(landed.gearDown, true);
  const fixed = createFlight(AIRCRAFT.at(-1), { x: 0, y: 300, z: 0 }, { landingEnabled: true });
  assert.equal(toggleLandingGear(fixed), 'fixed'); assert.equal(fixed.gear, 1);
});

test('speed, hard impacts, missing gear, steep ground, bank and water all cause unsafe landings', () => {
  const plane = AIRCRAFT[0];
  const tooFast = approach(plane, { speed: 160 });
  assert.equal(tooFast.crashReason, 'landing-speed');
  assert.equal(approach(plane, { pitch: -.18 }).crashReason, 'landing-impact');
  assert.equal(approach(plane, { gear: false }).crashReason, 'landing-gear');
  const steep = { height: x => 100 + (x - 1000) * .3 };
  assert.equal(approach(plane, { world: steep }).crashReason, 'landing-slope');
  const banked = createFlight(plane, { x: 1000, y: 106, z: 1000 }, { landingEnabled: true });
  banked.gear = 1; banked.gearDown = true; banked.speed = 70; banked.velocity.set(0, -2, -70);
  banked.quaternion.setFromAxisAngle(new Vector3(0, 0, 1), .5); banked.position.y = 101;
  resolveLanding(banked, ground); assert.equal(banked.crashReason, 'landing-attitude');
  const water = createFlight(plane, { x: 1000, y: 10, z: 1000 }, { landingEnabled: true });
  water.gear = 1; water.gearDown = true; water.velocity.set(0, -2, -70); water.speed = 70; water.position.y = 0;
  resolveLanding(water, { height: () => -50 }); assert.equal(water.crashReason, 'water');
  const unlocked = createFlight(plane, { x: 1000, y: 103, z: 1000 }, { landingEnabled: true });
  unlocked.gearDown = true; unlocked.gear = .7; unlocked.speed = 70; unlocked.velocity.set(0, -2, -70); unlocked.position.y = 101;
  resolveLanding(unlocked, ground); assert.equal(unlocked.crashReason, 'landing-gear');
});

test('touchdown limits are aircraft-specific and the runway and hangars match their rendered surfaces', () => {
  for (const plane of AIRCRAFT) {
    const f = createFlight(plane, { x: 1000, y: 110, z: 1000 }, { landingEnabled: true });
    f.gear = 1; f.gearDown = true; f.velocity.set(0, -2, -landingProfile(plane).maxSpeed - 1);
    f.speed = f.velocity.length(); f.position.y = 100;
    resolveLanding(f, ground); assert.equal(f.crashReason, 'landing-speed', plane.id);
  }
  assert.equal(landingGround(ground, 250, 250), 102); assert.equal(landingGround(ground, 270, 250), 100);
  const f = createFlight(AIRCRAFT[0], { x: 250, y: 110, z: 250 }, { landingEnabled: true });
  f.gear = 1; f.gearDown = true; f.velocity.set(0, -2, -70); f.speed = 70; f.position.y = 103;
  resolveLanding(f, ground); assert.equal(f.grounded, true); assert.ok(f.position.y >= 104);
  f.previous.set(275, 105, 200); f.position.set(320, 105, 200); f.crashed = false;
  resolveLanding(f, ground); assert.equal(f.crashReason, 'obstacle'); assert.equal(f.obstacle, 'hangar');
});

test('a landed aircraft can taxi and must avoid cliffs, water, and sharp high-speed turns', () => {
  const f = approach(AIRCRAFT[0]);
  f.speed = 8; f.throttle = .25; const before = f.travelDirection.clone();
  for (let i = 0; i < 120; i++) stepFlight(f, { yaw: 1 }, FIXED_DT, ground);
  assert.equal(f.crashed, false); assert.ok(f.travelDirection.angleTo(before) > .2);
  const fast = approach(AIRCRAFT[0]); stepFlight(fast, { yaw: 1 }, FIXED_DT, ground);
  assert.equal(fast.crashReason, 'landing-control');
  const cliff = approach(AIRCRAFT[0]); stepFlight(cliff, {}, FIXED_DT, { height: () => -100 });
  assert.equal(cliff.crashReason, 'water');
});

test('races retain their original ground collisions, physics, and disabled landing commands', () => {
  const a = AIRCRAFT[0], spawn = { x: 1000, y: 103, z: 1000 };
  const race = createFlight(a, spawn);
  assert.equal(toggleLandingGear(race), 'unavailable');
  race.gear = 1; race.gearDown = true; race.speed = 70;
  race.quaternion.setFromAxisAngle(RIGHT, -.035); race.travelDirection.set(0, 0, -1).applyQuaternion(race.quaternion);
  stepFlight(race, {}, FIXED_DT, ground);
  assert.equal(race.crashed, true); assert.equal(race.crashReason, 'terrain'); assert.equal(race.grounded, false);
  // Gear-up free flight has identical handling while safely airborne.
  for (const aircraft of AIRCRAFT) {
    const normal = createFlight(aircraft, { ...spawn, y: 2000 }), free = createFlight(aircraft, { ...spawn, y: 2000 }, { landingEnabled: true });
    for (let i = 0; i < 600; i++) {
      const input = { pitch: .2, yaw: -.3, roll: .1, throttle: 1 };
      stepFlight(normal, input, FIXED_DT, ground); stepFlight(free, input, FIXED_DT, ground);
    }
    assert.deepEqual(free.position, normal.position); assert.deepEqual(free.velocity, normal.velocity);
  }
});

test('extended retractable gear adds drag, while the fixed-gear Skyhawk retains its normal handling', () => {
  const plane = AIRCRAFT[0], spawn = { x: 1000, y: 2000, z: 1000 };
  const up = createFlight(plane, spawn, { landingEnabled: true }), down = createFlight(plane, spawn, { landingEnabled: true });
  down.gearDown = true; down.gear = 1;
  for (let i = 0; i < 1200; i++) { stepFlight(up, {}, FIXED_DT, ground); stepFlight(down, {}, FIXED_DT, ground); }
  assert.ok(down.speed < up.speed - 5);
});

test('a full approach can land on actual seeded terrain, then remain safely parked', () => {
  const world = createWorld('Maverik'), x = world.region.start.x, z = world.region.start.z;
  const plane = AIRCRAFT.at(-1), f = createFlight(plane, { x, z, y: world.height(x, z) + 8 }, { landingEnabled: true });
  f.speed = 26; f.throttle = .42; f.quaternion.setFromAxisAngle(RIGHT, -.045);
  f.travelDirection.set(0, 0, -1).applyQuaternion(f.quaternion);
  for (let i = 0; i < 2400 && !f.grounded && !f.crashed; i++) stepFlight(f, {}, FIXED_DT, world);
  assert.equal(f.crashed, false); assert.equal(f.grounded, true);
  for (let i = 0; i < 2400; i++) { f.throttle = 0; stepFlight(f, { drift: true }, FIXED_DT, world); }
  assert.equal(f.crashed, false); assert.equal(f.grounded, true); assert.equal(f.speed, 0);
});

test('all aircraft render matching low-poly gear, retract smoothly, and keep it hidden in the cockpit', () => {
  for (const plane of AIRCRAFT) {
    const model = createAircraft(plane), gear = model.userData.landingGear, fixed = landingProfile(plane).fixed;
    animateAircraft(model, plane, .2, 1, 1 / 60, 0, 30, { gear: 1 });
    assert.equal(gear.visible, true); assert.equal(gear.userData.wheels.length, 3);
    model.updateMatrixWorld(true);
    const centers = gear.userData.wheels.map(wheel => wheel.getWorldPosition(new Vector3()));
    for (let i = 0; i < 3; i++) {
      const expected = landingProfile(plane).wheels[i];
      assert.ok(centers[i].distanceTo(new Vector3(expected.x, expected.y, expected.z)) < 1e-6, plane.id);
    }
    animateAircraft(model, plane, .2, 1, 0, 0, 30, { gear: .5 });
    if (!fixed) assert.ok(gear.userData.legs.some(({pivot}) => Math.abs(pivot.rotation.x) + Math.abs(pivot.rotation.z) > .5));
    animateAircraft(model, plane, .2, 1, 0, 0, 30, { gear: 0 });
    assert.equal(gear.visible, !!fixed);
    setCockpitAirframe(model, true); animateAircraft(model, plane, .2, 1, 0, 0, 30, { gear: 1 });
    if (plane.type === 'prop') assert.equal(gear.visible, false);
    setCockpitAirframe(model, false); animateAircraft(model, plane, .2, 1, 0, 0, 30, { gear: 1 });
    assert.equal(gear.visible, true); disposeAircraft(model);
  }
});
