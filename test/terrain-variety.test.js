import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, generateChunk } from '../public/js/core/world.js';
import { createTerrainStyle, TERRAIN_STYLES } from '../public/js/core/terrain-style.js';

test('seeded landscapes cover eight palettes and all six landforms reproducibly', () => {
  const families = new Set(), forms = new Set(), colors = new Set();
  for (let i = 0; i < 100; i++) {
    const seed = `terrain-${i}`, world = createWorld(seed), again = createWorld(seed);
    assert.deepEqual(world.style, again.style); assert.deepEqual(world.region.mountains, again.region.mountains);
    families.add(world.style.id); world.region.mountains.forEach(peak => forms.add(peak.form));
    colors.add(world.color(120, -750, 500, .2).map(c => c.toFixed(3)).join(','));
  }
  assert.equal(families.size, 8); assert.equal(forms.size, 6); assert.ok(colors.size > 90);
  const before = createTerrainStyle('terrain-0');
  before.snowline = -100; assert.ok(createTerrainStyle('terrain-0').snowline > 0);
});

test('landforms change actual silhouettes, with broad mesa tops, narrow ridges, and crater bowls', () => {
  const world = createWorld('landform-probe'), peak = { x: 12000, z: 11000, cos: 1, sin: 0, width: 900, depth: 900, height: 1800, summit: .5, detail: 1 };
  world.region.mountains = [peak];
  world.region.geology.fractures = []; // Isolate the base silhouette from geological cuts.
  const crossSections = new Map();
  for (const form of ['mesa', 'ridge', 'cone', 'caldera', 'dome', 'crags']) {
    peak.form = form;
    crossSections.set(form, Array.from({ length: 31 }, (_, i) => world.height(peak.x + (i - 15) * 70, peak.z)));
  }
  assert.equal(new Set([...crossSections.values()].map(section => section.map(h => Math.round(h)).join(','))).size, 6);
  const mesa = crossSections.get('mesa'), dome = crossSections.get('dome'), crater = crossSections.get('caldera');
  assert.ok(Math.abs(mesa[15] - mesa[19]) < Math.abs(dome[15] - dome[19]) * .45, 'mesa summits remain much flatter');
  assert.ok(Math.max(...crater) - crater[15] > 300, 'calderas have a depressed center inside a high rim');
  peak.form = 'ridge';
  assert.ok(world.height(peak.x, peak.z + 450) > world.height(peak.x + 450, peak.z) + 450, 'ridges have a long spine rather than a round footprint');
});

test('ground colors blend locally, expose varied rock, and retain snow on gentle high ground', () => {
  for (const family of TERRAIN_STYLES) {
    const world = createWorld('palette-probe'); world.style = { ...family, strata: 85, tint: 1 };
    for (const [x, z] of [[-700, -900], [1020, 1500], [21000, -34000]]) {
      for (const h of [0, 100, 650, 1200, 2000, 3000]) {
        const color = world.color(x, z, h, .2), adjacent = world.color(x + .01, z - .01, h, .2);
        assert.ok(color.every(c => Number.isFinite(c) && c >= 0 && c <= 1));
        assert.ok(color.every((c, i) => Math.abs(c - adjacent[i]) < .001), 'color fields have no cell-edge jumps');
      }
      assert.notDeepEqual(world.color(x, z, 550, 0), world.color(x, z, 550, 2));
      const snow = world.color(x, z, family.snowline + 350, 0);
      assert.ok(snow.reduce((sum, c) => sum + c, 0) > 2.35, `${family.id} high gentle slopes get light snow`);
    }
  }
});

test('low and high detail sample identical heights and colors on shared vertices', () => {
  for (const seed of ['terrain-3', 'terrain-15', 'terrain-17']) {
    const low = generateChunk(seed, -3, -4, 18), high = generateChunk(seed, -3, -4, 24);
    for (let z = 0; z <= 6; z++) for (let x = 0; x <= 6; x++) {
      const a = (z * 3 * 19 + x * 3) * 3, b = (z * 4 * 25 + x * 4) * 3;
      assert.deepEqual(low.positions.slice(a, a + 3), high.positions.slice(b, b + 3));
      assert.deepEqual(low.colors.slice(a, a + 3), high.colors.slice(b, b + 3));
    }
  }
});
