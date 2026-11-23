import test from 'node:test';
import assert from 'node:assert/strict';
import { Scene, Vector3 } from 'three';
import { createWorld } from '../public/js/core/world.js';
import { generateCourse, enforceRaceRules } from '../public/js/core/race.js';
import { CeilingGrid, ceilingGridOpacity } from '../public/js/render/ceiling-grid.js';

test('course ceilings are deterministic round feet values, shared across every plane and unit system', () => {
  const values = new Set();
  for (let i = 0; i < 40; i++) {
    const seed = `rounded-ceiling-${i}`, a = generateCourse(createWorld(seed)), b = generateCourse(createWorld(seed));
    assert.equal(a.ceiling, b.ceiling);
    const feet = a.ceiling / .3048; assert.ok(Math.abs(feet / 500 - Math.round(feet / 500)) < 1e-9); assert.ok(feet > 3499.99);
    values.add(Math.round(feet));
  }
  assert.ok(values.has(3500)); assert.ok(values.has(4000));
});

test('the ceiling warns by height or climb time, clears after descending, and still ends over-limit races', () => {
  const course = { ceiling: 1219.2 }, flight = { position: { y: course.ceiling - 250 }, velocity: { y: 100 }, crashed: false };
  enforceRaceRules(flight, course); assert.equal(flight.ceilingWarning, true); assert.equal(flight.crashed, false);
  flight.velocity.y = 0; enforceRaceRules(flight, course); assert.equal(flight.ceilingWarning, false);
  flight.position.y = course.ceiling - 90; flight.velocity.y = -10;
  enforceRaceRules(flight, course); assert.equal(flight.ceilingWarning, true);
  flight.position.y = course.ceiling - 150; enforceRaceRules(flight, course); assert.equal(flight.ceilingWarning, false);
  flight.position.y = course.ceiling + .01; enforceRaceRules(flight, course);
  assert.equal(flight.crashed, true); assert.equal(flight.crashReason, 'ceiling');
});

test('the 3D ceiling fades in nearby and stays at the actual limit through flight and origin changes', () => {
  const scene = new Scene(), grid = new CeilingGrid(scene), ceiling = 1219.2, origin = new Vector3();
  const position = new Vector3(550, ceiling - 500, -1000), geometry = grid.mesh.geometry, material = grid.material;
  grid.update(position, origin, ceiling, true); assert.equal(grid.mesh.visible, false);
  assert.equal(ceilingGridOpacity(position.y, ceiling), 0);
  position.y = ceiling - 150; grid.update(position, origin, ceiling, true);
  const faint = material.uniforms.opacity.value; assert.equal(grid.mesh.visible, true); assert.ok(faint > 0 && faint < .5);
  position.y = ceiling - 40; grid.update(position, origin, ceiling, true);
  assert.ok(material.uniforms.opacity.value > faint); assert.equal(grid.mesh.position.y, ceiling);
  const anchored = grid.mesh.position.clone();
  origin.set(1000, 1000, -1000); grid.update(position, origin, ceiling, true);
  assert.ok(grid.mesh.position.clone().add(origin).distanceTo(anchored) < 1e-9);
  for (let i = 0; i < 100; i++) { position.x += 20; grid.update(position, origin, ceiling, true); }
  assert.equal(grid.mesh.geometry, geometry); assert.equal(grid.material, material);
  assert.ok(Math.abs((grid.mesh.position.x + origin.x) / 375 - Math.round((grid.mesh.position.x + origin.x) / 375)) < 1e-9);
  grid.update(position, origin, ceiling, false); assert.equal(grid.mesh.visible, false); assert.equal(material.uniforms.opacity.value, 0);
  position.y = ceiling - 600; grid.update(position, origin, ceiling, true); assert.equal(grid.mesh.visible, false);
  assert.ok(ceilingGridOpacity(ceiling - 250, ceiling, 150) > 0, 'fast climbs give earlier notice');
  let geometryDisposed = false, materialDisposed = false;
  geometry.addEventListener('dispose', () => { geometryDisposed = true; }); material.addEventListener('dispose', () => { materialDisposed = true; });
  grid.dispose(); assert.equal(scene.children.length, 0); assert.ok(geometryDisposed && materialDisposed);
});
