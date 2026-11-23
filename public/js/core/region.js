import { random, isMaverikSeed } from './seed.js';
import { createGeography } from './geography.js';
import { createMaverikRegion } from './maverik.js';

// Procedural regions are open landscapes without prescribed routes. The named
// Maverik mission is handled separately before normal geography generation.
export function createRegion(seed) {
  if (isMaverikSeed(seed)) return createMaverikRegion();
  const rng = random(`${seed}:open-world:2`);
  const angle = rng() * Math.PI * 2, length = 5800 + rng() * 4700;
  const direction = { x: Math.sin(angle), z: -Math.cos(angle) }, side = { x: Math.cos(angle), z: Math.sin(angle) };
  const base = 110 + rng() * 100, halfWidth = 2500 + rng() * 1500;
  const point = (along, across) => ({ x: direction.x * along + side.x * across, z: 180 + direction.z * along + side.z * across });
  const start = point(0, 0), end = point(length, 0);
  const corners = [-halfWidth, halfWidth].flatMap(across => [-850, length + 850].map(along => point(along, across)));
  const bounds = { minX: Math.min(...corners.map(p => p.x)), maxX: Math.max(...corners.map(p => p.x)),
    minZ: Math.min(...corners.map(p => p.z)), maxZ: Math.max(...corners.map(p => p.z)) };
  const ceilingFeet = Math.max(3500, Math.ceil((base + 800 + rng() * 200) / (500 * .3048)) * 500);
  const region = { direction, side, length, base, halfWidth, bounds, ceiling: ceilingFeet * .3048, start, end };
  return { ...region, ...createGeography(seed, region) };
}
