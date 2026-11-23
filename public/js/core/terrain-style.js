import { random } from './seed.js';

const rgb = hex => [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255);
const clamp = value => Math.max(0, Math.min(1, value));
const blend = (a, b, t) => a.map((channel, i) => channel + (b[i] - channel) * t);
const ramp = (value, low, high) => { const t = clamp((value - low) / (high - low)); return t * t * (3 - 2 * t); };

// Coherent landscape families, with their own geology, vegetation, and snowline.
// Local climate fields blend the colors continuously, including across chunks.
const definitions = [
  { id: 'alpine', name: 'Alpine valleys', forms: ['crags', 'ridge', 'dome'], moisture: .72, snowline: 1490, relief: 650, roughness: 1, warp: 290, banding: .08,
    colors: ['#416544', '#82994e', '#b5a16a', '#727b7f', '#aaaeb0', '#edf1ec', '#d9c18d', '#768568', '#376248', '#7e9b52', '#6e7a80', '#76aaa5'] },
  { id: 'redrock', name: 'Red rock country', forms: ['mesa', 'ridge', 'crags'], moisture: .22, snowline: 2550, relief: 520, roughness: 1.25, warp: 340, banding: .65,
    colors: ['#6d7750', '#aa9956', '#c39861', '#a74e38', '#df9c6b', '#e9dece', '#dfbd80', '#c16b45', '#58634a', '#989053', '#a05c45', '#7caaa1'] },
  { id: 'highlands', name: 'Heather highlands', forms: ['dome', 'ridge', 'crags'], moisture: .76, snowline: 1820, relief: 790, roughness: .7, warp: 420, banding: .1,
    colors: ['#405b4d', '#7f8c56', '#a69a6b', '#6a7371', '#a0a49a', '#e8eae3', '#c5bb93', '#997d8c', '#354f48', '#8d8656', '#78817b', '#6c9e9c'] },
  { id: 'volcanic', name: 'Volcanic uplands', forms: ['cone', 'caldera', 'ridge'], moisture: .46, snowline: 1710, relief: 680, roughness: 1.35, warp: 160, banding: .16,
    colors: ['#415c45', '#7e9254', '#a28c66', '#42474d', '#81756d', '#e4e7e6', '#a89d87', '#9c5742', '#344d3d', '#748d49', '#55575a', '#639b9e'] },
  { id: 'autumn', name: 'Golden foothills', forms: ['ridge', 'dome', 'mesa'], moisture: .56, snowline: 1810, relief: 620, roughness: .85, warp: 320, banding: .16,
    colors: ['#6d7342', '#af9950', '#c4a66e', '#7c7566', '#b5a991', '#eeebe2', '#d5bb87', '#b66d3c', '#665c37', '#c2913e', '#8f8068', '#7ca69b'] },
  { id: 'limestone', name: 'Limestone country', forms: ['mesa', 'crags', 'dome'], moisture: .52, snowline: 1950, relief: 570, roughness: 1.1, warp: 300, banding: .4,
    colors: ['#526e55', '#9aaa73', '#c0b386', '#aeb4a4', '#e0dcc5', '#f2f1e7', '#dfcea4', '#a5ad8c', '#46624c', '#94a569', '#a9ad99', '#81b7ad'] },
  { id: 'glacier', name: 'Glacial ranges', forms: ['crags', 'ridge', 'dome'], moisture: .6, snowline: 1050, relief: 720, roughness: 1.15, warp: 230, banding: .08,
    colors: ['#496c66', '#81948a', '#aea991', '#687f8b', '#a3bbc1', '#e0edf0', '#c4c9b9', '#798f9a', '#3b5d58', '#8da597', '#7a939e', '#77a9b5'] },
  { id: 'desert', name: 'Painted desert', forms: ['mesa', 'dome', 'cone'], moisture: .1, snowline: 2800, relief: 460, roughness: .8, warp: 380, banding: .48,
    colors: ['#7c8057', '#bda66a', '#d7b37c', '#bd8061', '#e5c69b', '#eee7d7', '#e9c98d', '#c58c83', '#69704a', '#aaa068', '#b58c71', '#81b6ab'] }
];

export const TERRAIN_STYLES = Object.freeze(definitions.map(({ colors, ...style }) => {
  const names = ['forest', 'meadow', 'dry', 'rock', 'rockLight', 'snow', 'shore', 'accent', 'conifer', 'leaf', 'boulder', 'water'];
  return Object.freeze({ ...style, forms: Object.freeze(style.forms), palette: Object.freeze(Object.fromEntries(names.map((name, i) => [name, Object.freeze(rgb(colors[i]))]))) });
}));

export function createTerrainStyle(seed, preferred) {
  const rng = random(`${seed}:landscape:1`), fallback = TERRAIN_STYLES[Math.floor(rng() * TERRAIN_STYLES.length)];
  const family = TERRAIN_STYLES.find(style => style.id === preferred) || fallback;
  // A seed still has its own character within the family.
  return { ...family, snowline: family.snowline + (rng() - .5) * 180, relief: family.relief * (.85 + rng() * .3),
    strata: 55 + rng() * 75, tint: .96 + rng() * .08 };
}

export const terrainMoisture = (world, x, z) => clamp(world.field(x, z, 2800, 135) * .8 + world.style.moisture - .4);

// sRGB ground color. The renderer converts once to linear for vertex colors;
// the map uses this same function directly, so its palette matches the world.
export function terrainColor(world, x, z, height, slope = 0) {
  const { palette: p, snowline, strata, tint } = world.style, field = world.field;
  const moisture = terrainMoisture(world, x, z);
  let color = blend(p.meadow, p.forest, ramp(moisture, .42, .76));
  color = blend(color, p.dry, ramp(1 - moisture, .48, .86));
  const patch = ramp(field(x, z, 510, 233), .39, .76);
  color = blend(color, p.accent, patch * .34);
  const bands = .5 + Math.sin(height / strata * Math.PI + field(x, z, 740, 913) * 3) * .5;
  const rock = blend(p.rock, p.rockLight, bands * world.style.banding + field(x, z, 180, 919) * .25 + .08);
  const exposed = Math.max(ramp(slope, .38, 1.3), ramp(height, snowline - 650, snowline - 130) * .8);
  color = blend(color, rock, exposed);
  const snow = ramp(height + (field(x, z, 330, 907) - .5) * 180, snowline - 90, snowline + 130)
    * (1 - ramp(slope, 1.1, 2.8) * .83);
  color = blend(color, p.snow, snow);
  color = blend(color, p.shore, 1 - ramp(height, 8, 48));
  const shade = (.94 + field(x, z, 150, 76) * .12) * tint;
  return color.map(channel => clamp(channel * shade));
}
