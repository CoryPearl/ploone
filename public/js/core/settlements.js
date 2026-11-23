import { random } from './seed.js';
export const SETTLEMENT_CELL = 1100;
export const FARM_COLORS = [
  [[.64, .51, .29], [.73, .63, .36]], [[.47, .56, .23], [.59, .64, .29]],
  [[.40, .31, .22], [.49, .38, .24]], [[.67, .60, .33], [.78, .71, .43]]
];

export function createSettlement(world, x, z, id, variant = 0) {
  const rng = random(`${world.seed}:${id}:hamlet:1`), y = world.height(x, z);
  const houses = [[-52, -40], [48, -36], [-56, 34], [53, 38], [3, -86], [-5, 86]].slice(0, 4 + variant);
  const buildings = houses.map(([dx, dz], index) => {
    const hx = x + dx + (rng() - .5) * 9, hz = z + dz + (rng() - .5) * 9;
    return { x: hx, z: hz, y: world.height(hx, hz), width: 17 + rng() * 5, depth: 14 + rng() * 4, height: 10 + rng() * 3,
      roof: 6 + rng() * 2, yaw: (index % 2 ? -1 : 1) * Math.PI / 2, barn: false };
  });
  const bx = x + 115, bz = z + 52;
  buildings.push({ x: bx, z: bz, y: world.height(bx, bz), width: 33, depth: 26, height: 15, roof: 9, yaw: 0, barn: true });
  const fields = [{ x: x + 135, z: z + 165, width: 108, depth: 120 }, { x: x - 5, z: z + 175, width: 108, depth: 100 }]
    .map((field, index) => ({ ...field, crop: (variant + index) % FARM_COLORS.length }));
  const well = { x, y: world.height(x, z), z, radius: 4.2, height: 9 };
  const silo = { x: bx + 25, z: bz + 4, y: world.height(bx + 25, bz + 4), radius: 5.8, height: 32 };
  const orchard = Array.from({ length: 12 }, (_, index) => {
    const tx = x - 125 + index % 3 * 20, tz = z - 15 + Math.floor(index / 3) * 22;
    return { x: tx, z: tz, y: world.height(tx, tz), scale: .8 + rng() * .3 };
  });
  return { id, type: 'village', x, y, z, height: 32, variant, houses: buildings, fields, well, silo, orchard, phase: 0 };
}

export function generateSettlement(world, cx, cz) {
  const rng = random(`${world.seed}:settlement:${cx}:${cz}`);
  if (rng() > .64) return null;
  const x = (cx + .3 + rng() * .4) * SETTLEMENT_CELL, z = (cz + .3 + rng() * .4) * SETTLEMENT_CELL;
  if (world.homeSettlement && Math.hypot(x - world.homeSettlement.x, z - world.homeSettlement.z) < 580) return null;
  const h = world.height(x, z);
  if (h < 75 || h > 700) return null;
  const samples = [world.height(x - 130, z), world.height(x + 180, z), world.height(x, z - 120), world.height(x, z + 230)];
  if (Math.max(h, ...samples) - Math.min(h, ...samples) > 35) return null;
  return createSettlement(world, x, z, `village:${cx}:${cz}`, Math.floor(rng() * 3));
}

export function settlementCover(settlement, x, z) {
  if (!settlement || Math.abs(x - settlement.x) > 210 || Math.abs(z - settlement.z) > 250) return null;
  for (const field of settlement.fields) {
    if (Math.abs(x - field.x) < field.width / 2 && Math.abs(z - field.z) < field.depth / 2) {
      return FARM_COLORS[field.crop][Math.floor((x - field.x + field.width / 2) / 19) % 2];
    }
  }
  if (Math.hypot(x - settlement.x, z - settlement.z) < 100) return [.58, .58, .36];
  return null;
}
