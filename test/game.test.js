import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { random, dailyChallenge, normalizeSeed } from '../public/js/core/seed.js';
import { createWorld, generateChunk, CHUNK_SIZE } from '../public/js/core/world.js';
import { generateCourse, crossedGate, createRace, stepRace, sampleGhost } from '../public/js/core/race.js';
import { createFlight, stepFlight, hitsTerrain, FIXED_DT } from '../public/js/core/flight.js';
import { AIRCRAFT } from '../public/js/core/aircraft-data.js';
import { planRoute } from '../test-support/route-planner.js';

test('UTC midnight changes the shared daily challenge everywhere', () => {
  assert.equal(dailyChallenge(new Date('2026-11-10T23:59:59.999Z')).seed, 'ploon-2026-11-10');
  assert.equal(dailyChallenge(new Date('2026-11-11T00:00:00.000Z')).seed, 'ploon-2026-11-11');
  assert.equal(dailyChallenge(new Date('2026-11-10T19:00:00-05:00')).date, '2026-11-11');
  assert.equal(normalizeSeed('  sunday-morning  '), 'sunday-morning');
  assert.equal(normalizeSeed('a'.repeat(100)).length, 64);
});

test('seeded terrain, decoration, and open courses reproduce exactly', () => {
  const a = random('same-sky'), b = random('same-sky');
  assert.deepEqual(Array.from({ length: 20 }, a), Array.from({ length: 20 }, b));
  assert.deepEqual(generateChunk('same-sky', -2, 3), generateChunk('same-sky', -2, 3));
  assert.deepEqual(generateCourse(createWorld('same-sky')), generateCourse(createWorld('same-sky')));
  assert.notDeepEqual(generateCourse(createWorld('same-sky')), generateCourse(createWorld('another-sky')));
});

test('adjacent chunk borders match in positive and negative coordinates', () => {
  const segments = 24;
  for (const cx of [-2, -1, 0, 1]) {
    const left = generateChunk('edge-case', cx, -1, segments), right = generateChunk('edge-case', cx + 1, -1, segments);
    for (let z = 0; z <= segments; z++) {
      const l = (z * (segments + 1) + segments) * 3, r = z * (segments + 1) * 3;
      assert.equal(left.positions[l + 1], right.positions[r + 1]);
      assert.equal(left.positions[l] + cx * CHUNK_SIZE, right.positions[r] + (cx + 1) * CHUNK_SIZE);
      assert.deepEqual(left.colors.slice(l, l + 3), right.colors.slice(r, r + 3));
    }
  }
});

test('different geographies retain open choices without a compulsory central mountain or preset routes', () => {
  const peakCounts = new Set(), openFractions = [], layouts = new Set(), directPeaks = [];
  for (let n = 0; n < 160; n++) {
    const world = createWorld(`route-${n}`), course = generateCourse(world), region = world.region;
    assert.equal('routes' in course, false); assert.equal('routes' in region, false); assert.equal('segments' in region, false);
    assert.equal('gates' in course, false); assert.ok(course.finish.radius > 100);
    assert.ok(course.spawn.y < course.ceiling - 150); assert.ok(course.finish.y < course.ceiling - 150);
    peakCounts.add(region.mountains.length);
    layouts.add(region.layout.id);
    const heading = createFlight(AIRCRAFT[0], course.spawn).travelDirection;
    assert.ok(heading.dot(new Vector3(region.direction.x,0,region.direction.z)) > .999999, 'launch faces the actual course');
    let open = 0, total = 0, broadRows = 0;
    for (let along = .1; along < .9; along += .04) {
      let stretch = 0, widest = 0;
      for (let across = -region.halfWidth; across <= region.halfWidth; across += 200) {
        const h = world.height(region.start.x + region.direction.x * region.length * along + region.side.x * across,
          region.start.z + region.direction.z * region.length * along + region.side.z * across);
        const passable = h < region.base + 600;
        open += passable; total++; stretch = passable ? stretch + 200 : 0; widest = Math.max(widest, stretch);
      }
      if (widest >= 1200) broadRows++;
    }
    const fraction = open / total; openFractions.push(fraction);
    assert.ok(fraction > .25, `enough open ground for independent choices: ${n}`);
    assert.ok(broadRows >= 8, `wide choices rather than narrow corridors: ${n}`);
    assert.ok(planRoute(world, course).length >= 2, 'an independent pilot can discover a way through, including a direct line on open terrain');
    let directPeak = 0;
    for (let i = 0; i <= 100; i++) directPeak = Math.max(directPeak, world.height(course.spawn.x + (course.finish.x - course.spawn.x) * i / 100,
      course.spawn.z + (course.finish.z - course.spawn.z) * i / 100));
    directPeaks.push(directPeak - course.spawn.y);
  }
  assert.equal(layouts.size,8);assert.ok(peakCounts.size >= 10);
  assert.ok(Math.max(...openFractions) - Math.min(...openFractions) > .4);
  assert.ok(directPeaks.filter(h=>h<450).length>=8, 'some courses favor low, fast open flying');
  assert.ok(directPeaks.filter(h=>h>1000).length>=8, 'other courses require substantial climbs or detours');
});

test('a single finish uses swept crossing and accepts different approaches', () => {
  const finish = { x: 0, y: 100, z: 0, nx: 0, nz: -1, radius: 145 };
  const from = new Vector3(0, 100, 500), to = new Vector3(0, 100, -500);
  assert.equal(crossedGate(from, to, finish), true); assert.equal(crossedGate(to, from, finish), true);
  assert.equal(crossedGate(new Vector3(200,100,500), new Vector3(200,100,-500), finish), false);
  const race = createRace({ finish });
  assert.equal(stepRace(race, new Vector3(0,100,-900), new Vector3(0,100,-1100), 5), false);
  assert.equal(stepRace(race, from, to, 10), true); assert.equal(race.finished, true); assert.deepEqual(race.splits, [10]);
  assert.equal(stepRace(race, from, to, 11), false);
});

test('fast aircraft cannot tunnel through terrain or water', () => {
  const world = { height: x => x > 45 && x < 55 ? 120 : 0 };
  assert.equal(hitsTerrain(new Vector3(0, 100, 0), new Vector3(100, 100, 0), world), true);
  assert.equal(hitsTerrain(new Vector3(0, 150, 0), new Vector3(100, 150, 0), world), false);
  assert.equal(hitsTerrain(new Vector3(0, 3, 0), new Vector3(5, 3, 0), { height: () => -100 }), true);
});

test('all aircraft fly, throttle is bounded, and assisted roll levels wings', () => {
  const world = { height: () => -100 }, neutral = { pitch: 0, roll: 0, yaw: 0, throttle: 0, brake: false };
  for (const aircraft of AIRCRAFT) {
    const flight = createFlight(aircraft, { x: 0, y: 2000, z: 0 });
    for (let n = 0; n < 1200; n++) stepFlight(flight, { ...neutral, throttle: 1 }, FIXED_DT, world);
    assert.equal(flight.crashed, false); assert.equal(flight.throttle, 1);
    assert.ok(flight.position.z < -aircraft.cruise * 9); assert.ok(flight.speed <= aircraft.maxSpeed * 1.32);
    for (let n = 0; n < 30; n++) stepFlight(flight, { ...neutral, roll: 1 }, FIXED_DT, world);
    const bank = Math.abs(new Vector3(1, 0, 0).applyQuaternion(flight.quaternion).y);
    for (let n = 0; n < 300; n++) stepFlight(flight, neutral, FIXED_DT, world);
    assert.ok(Math.abs(new Vector3(1, 0, 0).applyQuaternion(flight.quaternion).y) < bank * 0.2);
    assert.ok(Math.abs(flight.quaternion.length() - 1) < 1e-9);
  }
});

test('ghost interpolation uses world coordinates through origin shifts', () => {
  const samples = [[0, 6900, 1000, -6900, 0, 0, 0, 1], [1, 7100, 1100, -7100, 0, 0.2, 0, 0.98]];
  assert.deepEqual(sampleGhost(samples, 0.5).position, [7000, 1050, -7000]);
  assert.equal(sampleGhost(samples, 0.5).t, 0.5);
  assert.equal(sampleGhost(samples, 2), null); assert.equal(sampleGhost([], 0), null);
});
