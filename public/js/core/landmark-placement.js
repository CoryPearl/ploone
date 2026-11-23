import { random } from './seed.js';

// A narrow geological cut can lie between mesh vertices. Foundations must fit
// the visible triangles at both detail levels as well as the collision surface.
function meshHeight(world, x, z, segments) {
  const size = 700, step = size / segments;
  const originX = Math.floor(x / size) * size, originZ = Math.floor(z / size) * size;
  const px = (x - originX) / step, pz = (z - originZ) / step;
  const ix = Math.floor(px), iz = Math.floor(pz), u = px - ix, v = pz - iz;
  const x0 = originX + ix * step, z0 = originZ + iz * step;
  const a = world.height(x0, z0), b = world.height(x0 + step, z0), c = world.height(x0, z0 + step), d = world.height(x0 + step, z0 + step);
  return u + v <= 1 ? a + (b - a) * u + (c - a) * v : d + (b - d) * (1 - v) + (c - d) * (1 - u);
}

// Man-made towers belong on buildable ground, with an embedded foundation.
// Test the wider site too: a flat sample beside a cliff is not enough.
export function placeTower(world, item, rotorRadius = 0) {
  const rng = random(`${world.seed}:${item.id}:site:1`), originalX = item.x, originalZ = item.z;
  for (let attempt = 0; attempt < 9; attempt++) {
    const angle = rng() * Math.PI * 2, distance = attempt ? 60 + attempt * 24 : 0;
    const x = originalX + Math.cos(angle) * distance, z = originalZ + Math.sin(angle) * distance;
    const ground = world.height(x, z);
    if (ground < 14 || world.landCover(x, z)) continue;
    const site = [[-65, 0], [65, 0], [0, -65], [0, 65]].map(([dx, dz]) => world.height(x + dx, z + dz));
    if (Math.max(ground, ...site) - Math.min(ground, ...site) > 25) continue;
    const footprint = [-11, 0, 11].flatMap(dx => [-11, 0, 11].flatMap(dz =>
      [world.height(x + dx, z + dz), ...[18, 24].map(segments => meshHeight(world, x + dx, z + dz, segments))]));
    if (Math.max(...footprint) - Math.min(...footprint) > 4.5) continue;
    const y = Math.max(...footprint) + 1.5;
    if (rotorRadius) {
      const terrain = [-rotorRadius, 0, rotorRadius].flatMap(dx => [-28, -12, 4].map(dz => world.height(x + dx, z + dz)));
      if (Math.max(...terrain) > y + item.height - rotorRadius - 15) continue;
    }
    return { ...item, x, z, y, footing: { width: 22, depth: y - Math.min(...footprint) + 6 } };
  }
  return null;
}

// Broad, partially buried stones replace the old hundreds-of-meters-high spikes.
// Every stone samples its own ground, including its footprint, on either slope.
export function createOutcrop(world, item) {
  if (world.height(item.x, item.z) < 14 || world.slope(item.x, item.z) > .85 || world.landCover(item.x, item.z)) return null;
  const rng = random(`${world.seed}:${item.id}:outcrop:1`), rocks = [], count = 3 + Math.floor(rng() * 3);
  for (let index = 0; index < count; index++) {
    const angle = rng() * Math.PI * 2, distance = index ? 24 + rng() * 36 : 0;
    const x = item.x + Math.cos(angle) * distance, z = item.z + Math.sin(angle) * distance;
    if (world.slope(x, z) > .85 || world.landCover(x, z)) continue;
    const width = 35 + rng() * 42, height = 23 + rng() * 26, depth = 30 + rng() * 36, yaw = rng() * Math.PI * 2;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const footprint = [-.5, 0, .5].flatMap(u => [-.5, 0, .5].map(v => world.height(x + u * width * c + v * depth * s, z - u * width * s + v * depth * c)));
    if (Math.min(...footprint) < 8) continue;
    const y = Math.min(...footprint) + height * .12;
    if (y + height / 2 < world.height(x, z) + 3) continue;
    rocks.push({ x, y, z, width, height, depth, yaw });
  }
  if (!rocks.length) return null;
  const base = Math.min(...rocks.map(rock => world.height(rock.x, rock.z)));
  return { ...item, type: 'outcrop', y: base, rocks, height: Math.max(...rocks.map(rock => rock.y + rock.height / 2)) - base };
}
