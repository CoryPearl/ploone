import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../public/js/core/world.js';
import { generateCourse } from '../public/js/core/race.js';
import { exploreRoutes } from '../test-support/route-options.js';

test('200 open courses offer many separated, competitive choices below the ceiling', () => {
  const families = new Set();
  for (let i = 0; i < 200; i++) {
    const world = createWorld(`route-${i}`), course = generateCourse(world), region = world.region;
    const routes = exploreRoutes(world, course);
    families.add(region.layout.id);
    assert.equal(routes.length, 10, `${world.seed}: ten substantially different 3D lines`);
    // Effort estimates include distance and the cost of climbing. These are
    // geometric candidates, not a claim that a test pilot found the optimal time.
    assert.ok(routes.filter(route => route.estimate <= routes[0].estimate * 1.25).length >= 3,
      `${world.seed}: several choices must be competitive, not enormous detours`);
    const offsets = routes.flatMap(route => route.path.map(p =>
      (p.x - region.start.x) * region.side.x + (p.z - region.start.z) * region.side.z));
    assert.ok(Math.max(...offsets) - Math.min(...offsets) >= 1200, `${world.seed}: use the breadth of the arena`);
    for (const route of routes) {
      assert.ok(route.maxAltitude < course.ceiling - 50);
      assert.ok(Math.abs(route.path[0].y - course.spawn.y) < 50);
      assert.ok(Math.abs(route.path.at(-1).y - course.finish.y) < 50);
      // Independently resample every leg, including narrow saddles between grid
      // points. Reject any line that relies on tunnelling through a ridge.
      for (let j = 1; j < route.path.length; j++) {
        const a = route.path[j - 1], b = route.path[j], steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 25);
        for (let k = 0; k <= steps; k++) {
          const t = k / steps, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
          assert.ok(a.y + (b.y - a.y) * t > Math.max(0, world.height(x, z)) + 25,
            `${world.seed}: every alternative clears the actual terrain`);
        }
      }
    }
  }
  assert.equal(families.size, 8);
});

test('geological cuts add lower crosscuts in all eight families while retaining unbroken terrain', () => {
  for (const seed of ['route-0', 'route-1', 'route-2', 'route-3', 'route-4', 'route-7', 'route-11', 'route-12']) {
    const world = createWorld(seed), r = world.region, fractures = r.geology.fractures;
    let cuts = 0, unchanged = 0, deepest = 0;
    for (let i = 0; i < 64; i++) for (let j = 0; j < 64; j++) {
      const along = r.length * (.1 + i / 63 * .8), across = (j / 63 * 2 - 1) * r.halfWidth;
      const x = r.start.x + r.direction.x * along + r.side.x * across, z = r.start.z + r.direction.z * along + r.side.z * across;
      const cutHeight = world.height(x, z);
      r.geology.fractures = [];
      const reduction = world.height(x, z) - cutHeight;
      r.geology.fractures = fractures;
      assert.ok(reduction >= -1e-6, 'erosion lowers terrain');
      if (reduction > 60) cuts++;
      if (reduction < 1) unchanged++;
      deepest = Math.max(deepest, reduction);
    }
    assert.ok(cuts > 50 && deepest > 250, `${r.layout.id}: meaningful lower crossings`);
    assert.ok(unchanged > 64 * 64 * .25, `${r.layout.id}: retain substantial unbroken terrain`);
  }
});
