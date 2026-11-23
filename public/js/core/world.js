import { hashString, random, normalizeSeed } from './seed.js';
import { createRegion } from './region.js';
import { SETTLEMENT_CELL, createSettlement, generateSettlement, settlementCover } from './settlements.js';
import { terrainColor, terrainMoisture } from './terrain-style.js';
import { maverikHeight } from './maverik.js';

const lerp = (a, b, t) => a + (b - a) * t;
const smooth = t => t * t * (3 - 2 * t);
const ramp = (value, low, high) => smooth(Math.max(0, Math.min(1, (value - low) / (high - low))));
const linear = value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
export const CHUNK_SIZE = 700;
export const WATER_LEVEL = 0;
const chunkWorlds = new Map();

export function gridHash(x, z, seed) {
  let n = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263) ^ seed;
  n = Math.imul(n ^ n >>> 13, 1274126177);
  return ((n ^ n >>> 16) >>> 0) / 4294967295;
}
function noise(x, z, seed) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = smooth(x - ix), fz = smooth(z - iz);
  return lerp(lerp(gridHash(ix, iz, seed), gridHash(ix + 1, iz, seed), fx), lerp(gridHash(ix, iz + 1, seed), gridHash(ix + 1, iz + 1, seed), fx), fz);
}

export function createWorld(seed) {
  seed = normalizeSeed(seed);
  const key = hashString(seed);
  const region = createRegion(seed);
  const style = region.style;
  const field = (x, z, scale, offset = 0) => noise(x / scale, z / scale, (key + offset) | 0);
  function height(x, z) {
    if (region.mission) return maverikHeight(region,x,z,field);
    const type = region.layout.id, geology = region.geology;
    const continent = field(x, z, 7000, 41);
    const background = Math.max(0, (field(x, z, 2300, 17) - .4) / .6);
    let lowlands = background ** 2;
    if (style.forms.includes('mesa')) {
      const level = lowlands * 5, fraction = level - Math.floor(level);
      const terrace = (Math.floor(level) + smooth(Math.max(0, Math.min(1, (fraction - .22) / .56)))) / 5;
      lowlands = lerp(lowlands, terrace, .65);
    }
    let elevation = region.base + (continent - .43) * 300 + lowlands * style.relief
      + ((field(x, z, 620, 89) - .5) * 90 + (field(x, z, 160, 5) - .5) * 20) * style.roughness;
    // Warped, overlapping massifs leave broad basins and irregular saddles.
    // There is no distance-to-route carving or cross-map wall of mountains.
    const wx = x + (field(x, z, 950, 301) - .5) * style.warp;
    const wz = z + (field(x, z, 950, 307) - .5) * style.warp;
    const dx = wx - region.start.x, dz = wz - region.start.z;
    const along = dx * region.direction.x + dz * region.direction.z, across = dx * region.side.x + dz * region.side.z;
    let land = 1;
    if (type === 'islands') {
      elevation = -180 + ramp(field(wx, wz, geology.noiseScale, 417), .55, .86) * 530;
    } else if (type === 'fjords') {
      const u = across * Math.cos(geology.angle) + along * Math.sin(geology.angle);
      const v = along * Math.cos(geology.angle) - across * Math.sin(geology.angle);
      elevation = -170 + ramp(field(u, v * .27, 850, 417), .53, .86) * 680;
    } else if (type === 'coast') {
      const shore = across * Math.cos(geology.angle) + (along - region.length * .5) * Math.sin(geology.angle) + geology.offset
        + Math.sin(along / 1150 + geology.phase) * 420 + (field(wx, wz, 1700, 421) - .5) * 900;
      land = ramp(shore, -180, 500);
      elevation = -110 + land * (280 + background * 680) + (field(wx, wz, 350, 5) - .5) * 16;
    } else if (type === 'highlands') {
      const rolling = field(wx, wz, geology.noiseScale, 417) * .65 + field(wx, wz, 800, 421) * .35;
      elevation = 20 + rolling ** 1.45 * 860 * geology.relief + (field(wx, wz, 180, 5) - .5) * 18;
    } else if (type === 'basins') {
      elevation = region.base * .7 + background * 220 + (field(wx, wz, 620, 89) - .5) * 60;
    } else if (type === 'volcanoes') {
      elevation = region.base + background * 220 + (field(wx, wz, 420, 89) - .5) * 65;
    }
    // The coastline/island layer continues beyond the race bounds as well.
    let islandHeight = 0;
    for (const island of region.islands) {
      const ix = wx - island.x, iz = wz - island.z;
      const u = (ix * island.cos + iz * island.sin) / island.width, v = (-ix * island.sin + iz * island.cos) / island.depth;
      const radius = u * u + v * v;
      if (radius < 16) islandHeight = Math.max(islandHeight, island.height * Math.exp(-radius * 1.55));
    }
    if (type === 'islands' || type === 'fjords') elevation = Math.max(elevation, islandHeight - 180);
    else elevation += islandHeight;
    let mountain = 0, detail;
    for (const peak of region.mountains) {
      const dx = wx - peak.x, dz = wz - peak.z;
      const u = (dx * peak.cos + dz * peak.sin) / peak.width;
      const v = (-dx * peak.sin + dz * peak.cos) / peak.depth;
      const radiusSquared = u * u + v * v;
      if (radiusSquared > 16) continue;
      detail ??= 1 - Math.abs(field(x, z, 210, 317) * 2 - 1);
      const radius = Math.sqrt(radiusSquared);
      let shape;
      switch (peak.form) {
        case 'mesa': {
          const edge = Math.max(0, Math.min(1, (radius - peak.summit) / .68));
          shape = (1 - smooth(edge)) * (1 + (detail - .5) * .025);
          break;
        }
        case 'ridge':
          shape = Math.exp(-Math.abs(u) * 2.7 - v * v * 1.1) * (.86 + detail * .2 * peak.detail);
          break;
        case 'cone':
          shape = Math.max(0, 1 - radius / 1.55) ** 1.55;
          break;
        case 'caldera':
          shape = Math.exp(-radiusSquared * 1.6) * (1 - .62 * Math.exp(-radiusSquared * 24));
          break;
        case 'dome':
          shape = Math.exp(-radiusSquared * 1.6) * (.97 + detail * .06);
          break;
        default:
          shape = Math.exp(-radiusSquared * 2) * (.78 + detail * .3 * peak.detail);
      }
      mountain = Math.max(mountain, peak.height * shape);
    }
    // Branching, domain-warped breaks open crosscuts through ridges, plateaus,
    // and crater rims. Pass heights vary: a short climb can beat a low detour.
    // Keep the underlying land/water layer and unbroken summits intact.
    let incision = 0;
    const fractureWarp = (field(wx, wz, 440, 449) - .5) * 320;
    for (let i = 0; i < geology.fractures.length; i++) {
      const fracture = geology.fractures[i];
      const u = wx * fracture.cos + wz * fracture.sin, v = -wx * fracture.sin + wz * fracture.cos;
      const seam = Math.abs(field(u + fractureWarp, v - fractureWarp, fracture.scale, 457 + i * 16) - .5);
      const cut = 1 - ramp(seam, fracture.width * .35, fracture.width);
      const depth = fracture.depth * (.75 + field(wx, wz, 1150, 491 + i) * .25);
      incision = Math.max(incision, cut * depth);
    }
    elevation += mountain * (1 - incision) * (.94 + field(x, z, 350, 53) * .12) * land;
    let rimHeight = 0;
    for (const basin of region.basins) {
      const bx = wx - basin.x, bz = wz - basin.z;
      const u = (bx * basin.cos + bz * basin.sin) / basin.width, v = (-bx * basin.sin + bz * basin.cos) / basin.depth;
      const radius = Math.hypot(u, v);
      if (radius > 2.5) continue;
      const interior = 1 - ramp(radius, .56, .85);
      elevation = lerp(elevation, basin.floor + (field(wx, wz, 550, 439) - .5) * 35, interior);
      const angle = Math.atan2(v, u) + (field(wx, wz, 850, 503) - .5) * .35;
      const erosion = .12 + .88 * ramp(.5 + Math.cos(angle * basin.gaps + basin.phase) * .5, .12, .7);
      rimHeight = Math.max(rimHeight, basin.height * Math.exp(-(((radius - 1) / basin.rim) ** 2)) * erosion);
    }
    elevation += rimHeight * (1 - incision);
    // Only the launch and finish areas get clearings; the rest is open terrain.
    for (const endpoint of [region.start, region.end]) {
      const distance = Math.hypot(x - endpoint.x, z - endpoint.z);
      const launch = endpoint === region.start;
      const clearing = 1 - ramp(distance, launch ? 650 : 350, launch ? 1450 : 800);
      elevation = lerp(elevation, region.base + (field(x, z, 400, 205) - .5) * 10, clearing);
    }
    return elevation;
  }
  function biome(x, z, h = height(x, z)) {
    if (h > style.snowline + 40) return 'snow';
    if (h > style.snowline - 580) return 'alpine';
    if (h < 70) return 'coast';
    const moisture = terrainMoisture(world, x, z);
    if (moisture < .3) return 'desert';
    return moisture > .52 ? 'forest' : 'meadow';
  }
  const settlementCache = new Map();
  const world = { key, seed, height, biome, field, region, style };
  world.slope = (x, z) => Math.hypot((height(x + 18, z) - height(x - 18, z)) / 36, (height(x, z + 18) - height(x, z - 18)) / 36);
  world.color = (x, z, h = height(x, z), slope = 0) => terrainColor(world, x, z, h, slope);
  world.homeSettlement = region.mission ? null : createSettlement(world, region.start.x + region.side.x * 280 + region.direction.x * 320,
    region.start.z + region.side.z * 280 + region.direction.z * 320, 'home-village', 2);
  world.settlement = (cx, cz) => {
    if (region.mission) return null;
    const cell = `${cx}:${cz}`;
    if (!settlementCache.has(cell)) {
      settlementCache.set(cell, generateSettlement(world, cx, cz));
      if (settlementCache.size > 128) settlementCache.delete(settlementCache.keys().next().value);
    }
    return settlementCache.get(cell);
  };
  world.landCover = (x, z) => {
    const home = settlementCover(world.homeSettlement, x, z); if (home) return home;
    const cx = Math.floor(x / SETTLEMENT_CELL), cz = Math.floor(z / SETTLEMENT_CELL);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const cover = settlementCover(world.settlement(cx + dx, cz + dz), x, z); if (cover) return cover;
    }
    return null;
  };
  return world;
}

export function generateChunk(seed, cx, cz, segments = 24) {
  seed=normalizeSeed(seed);
  if (!chunkWorlds.has(seed)) { chunkWorlds.set(seed, createWorld(seed)); if (chunkWorlds.size > 4) chunkWorlds.delete(chunkWorlds.keys().next().value); }
  const world = chunkWorlds.get(seed), size = CHUNK_SIZE;
  const count = (segments + 1) ** 2;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const indices = new Uint32Array(segments * segments * 6);
  const slopeAt = world.slope;
  for (let z = 0; z <= segments; z++) for (let x = 0; x <= segments; x++) {
    const wx = cx * size + x / segments * size, wz = cz * size + z / segments * size;
    const h = world.height(wx, wz), p = (z * (segments + 1) + x) * 3;
    positions[p] = x / segments * size; positions[p + 1] = h; positions[p + 2] = z / segments * size;
    const cover = world.landCover(wx, wz);
    const c = cover || world.color(wx, wz, h, slopeAt(wx, wz));
    colors[p] = linear(c[0]); colors[p + 1] = linear(c[1]); colors[p + 2] = linear(c[2]);
  }
  let i = 0;
  for (let z = 0; z < segments; z++) for (let x = 0; x < segments; x++) {
    const a = z * (segments + 1) + x, b = a + 1, c = a + segments + 1, d = c + 1;
    indices.set([a, c, b, b, c, d], i); i += 6;
  }
  const rng = random(`${seed}:decor:${cx}:${cz}`), trees = [], rocks = [];
  for (let n = 0; n < 46; n++) {
    const x = rng() * size, z = rng() * size, wx = cx * size + x, wz = cz * size + z;
    const y = world.height(wx, wz), biome = world.biome(wx, wz, y);
    if (y < 14 || world.landCover(wx, wz) || slopeAt(wx, wz) > .75) continue;
    if (biome === 'forest' && rng() > 0.13) trees.push(x, y, z, 0.65 + rng() * 1.7, rng() * Math.PI * 2);
    else if (rng() > 0.4) rocks.push(x, y, z, 3 + rng() * 14, rng() * Math.PI * 2);
  }
  // A separate stream adds variety without moving existing trees or rocks.
  const greenery=random(`${seed}:greenery:1:${cx}:${cz}`),broadleaf=[],shrubs=[];
  for(let n=0;n<23;n++) {
    const x=greenery()*size,z=greenery()*size,wx=cx*size+x,wz=cz*size+z,y=world.height(wx,wz),biome=world.biome(wx,wz,y);
    if(y<15||biome==='alpine'||biome==='snow'||world.landCover(wx,wz)||slopeAt(wx,wz)>.75)continue;
    if((biome==='forest'||biome==='meadow')&&n<9)broadleaf.push(x,y,z,.8+greenery()*1.1,greenery()*Math.PI*2);
    else if(biome!=='desert')shrubs.push(x,y,z,1.5+greenery()*4,greenery()*Math.PI*2);
  }
  return { cx, cz, positions, colors, indices, trees: new Float32Array(trees), rocks: new Float32Array(rocks),broadleaf:new Float32Array(broadleaf),shrubs:new Float32Array(shrubs) };
}
