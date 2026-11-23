import { random } from './seed.js';
import { createTerrainStyle } from './terrain-style.js';

export const GEOGRAPHIES = Object.freeze([
  { id: 'ranges', name: 'Broken mountain ranges', styles: ['alpine', 'glacier', 'highlands', 'redrock'] },
  { id: 'islands', name: 'Island chains', styles: ['limestone', 'highlands', 'autumn', 'desert'] },
  { id: 'fjords', name: 'Jagged fjords', styles: ['glacier', 'alpine', 'highlands'] },
  { id: 'mesas', name: 'Canyon plateaus', styles: ['redrock', 'desert', 'limestone'] },
  { id: 'basins', name: 'Lake basins', styles: ['alpine', 'autumn', 'glacier', 'limestone'] },
  { id: 'highlands', name: 'Rolling highlands', styles: ['highlands', 'autumn', 'alpine'] },
  { id: 'coast', name: 'Coastal escarpments', styles: ['limestone', 'redrock', 'highlands', 'autumn'] },
  { id: 'volcanoes', name: 'Volcanic fields', styles: ['volcanic'] }
].map(layout => Object.freeze({ ...layout, styles: Object.freeze(layout.styles) })));

// Geography is generated independently of any pilot's route. Each family uses
// different land/water topology and feature distribution, not a central blocker.
export function createGeography(seed, region) {
  const rng = random(`${seed}:geography:1`), layout = GEOGRAPHIES[Math.floor(rng() * GEOGRAPHIES.length)];
  const style = createTerrainStyle(seed, layout.styles[Math.floor(rng() * layout.styles.length)]);
  const mountains = [], islands = [], basins = [];
  const { length, halfWidth, start, direction, side } = region;
  const point = (along, across) => ({ x: start.x + direction.x * along + side.x * across, z: start.z + direction.z * along + side.z * across });
  const between = (low, high) => low + rng() * (high - low);
  const integer = (low, high) => Math.floor(between(low, high + 1));
  const peak = (along, across, height, width, depth, form, angle = rng() * Math.PI) => {
    mountains.push({ ...point(along, across), height, width, depth, form, cos: Math.cos(angle), sin: Math.sin(angle), summit: between(.4, .65), detail: between(.6, 1.3) });
  };
  const island = (along, across, height, width, depth, angle = rng() * Math.PI) => {
    const item = { ...point(along, across), height, width, depth, cos: Math.cos(angle), sin: Math.sin(angle) }; islands.push(item); return item;
  };
  // Stratified jitter covers the whole arena instead of clustering everything
  // at the midpoint. Jitter, aspect, orientation, and density vary within a family.
  const scatter = (count, callback) => {
    const columns = Math.ceil(Math.sqrt(count * length / (halfWidth * 2))), rows = Math.ceil(count / columns);
    for (let index = 0; index < count; index++) {
      const along = length * (.13 + (index % columns + between(.12, .88)) / columns * .74);
      const across = ((Math.floor(index / columns) + between(.12, .88)) / rows * 2 - 1) * halfWidth * .95;
      callback(along, across, index);
    }
  };

  switch (layout.id) {
    case 'ranges': {
      const count = integer(5, 8);
      scatter(count, (along, across) => {
        const angle = between(0, Math.PI), count = integer(2, 4), spacing = between(360, 650);
        for (let index = 0; index < count; index++) {
          const shift = (index - (count - 1) / 2) * spacing;
          const p = point(along, across);
          // A chain's geological axis can point in any direction in the world.
          const x = p.x + Math.cos(angle) * shift, z = p.z + Math.sin(angle) * shift;
          const a = (x - start.x) * direction.x + (z - start.z) * direction.z;
          const b = (x - start.x) * side.x + (z - start.z) * side.z;
          peak(a, b, between(900, 2150), between(440, 740), between(650, 1150), rng() < .6 ? 'crags' : 'ridge', angle + between(-.5, .5));
        }
      });
      break;
    }
    case 'islands':
      scatter(integer(9, 13), (along, across) => {
        const h = between(380, 820), width = between(600, 980), depth = between(750, 1350);
        const body = island(along, across, h, width, depth);
        if (rng() < .6) peak(along + between(-170, 170), across + between(-150, 150), between(450, 1150), width * .48, depth * .45, rng() < .5 ? 'crags' : 'dome', Math.atan2(body.sin, body.cos));
      });
      island(0, 0, 450, 1350, 1400); island(length, 0, 450, 1350, 1400);
      break;
    case 'fjords': {
      const angle = Math.atan2(direction.z, direction.x) + between(.45, 1.15), count = integer(5, 8);
      scatter(count, (along, across) => {
        const width = between(400, 640), depth = between(1400, 2300);
        island(along, across, between(520, 850), width * 1.25, depth, angle);
        peak(along, across, between(1000, 1850), width, depth * .85, 'ridge', angle);
      });
      island(0, 0, 450, 1250, 1300); island(length, 0, 450, 1250, 1300);
      break;
    }
    case 'mesas':
      scatter(Math.min(integer(11, 18), Math.max(9, Math.floor(length * halfWidth * 2 / 3000000))),
        (along, across) => peak(along, across, between(750, 1450), between(580, 1020), between(650, 1250), 'mesa'));
      break;
    case 'basins':
      scatter(integer(2, 4), (along, across, index) => {
        const angle = between(0, Math.PI);
        basins.push({ ...point(along, across), width: between(1450, 2050), depth: between(1350, 2300), height: between(950, 1500), floor: index ? between(-60, 110) : between(-90, -35),
          cos: Math.cos(angle), sin: Math.sin(angle), phase: between(0, Math.PI * 2), gaps: integer(4, 6), rim: between(.23, .34) });
      });
      scatter(integer(5, 8), (along, across) => peak(along, across, between(270, 650), between(450, 800), between(500, 900), 'dome'));
      break;
    case 'highlands':
      scatter(integer(13, 21), (along, across) => peak(along, across, between(220, 540), between(620, 1150), between(750, 1350), 'dome'));
      break;
    case 'coast':
      scatter(integer(9, 14), (along, across) => peak(along, across, between(550, 1650), between(500, 850), between(750, 1400), rng() < .5 ? 'mesa' : 'ridge'));
      break;
    case 'volcanoes':
      scatter(integer(12, 20), (along, across) => peak(along, across, between(700, 2050), between(430, 860), between(500, 1050), rng() < .4 ? 'caldera' : 'cone'));
      break;
  }
  // Independent geological fractures cross and rejoin throughout the landscape.
  // They lower parts of existing massifs rather than carving start-to-finish
  // lanes. A separate stream keeps each family's arrangement and coastline.
  const fractureRandom = random(`${seed}:fractures:1`);
  const fractures = [700, 1450].map(scale => {
    const angle = fractureRandom() * Math.PI * 2;
    return { scale: scale * (.8 + fractureRandom() * .4), cos: Math.cos(angle), sin: Math.sin(angle),
      width: .10 + fractureRandom() * .05, depth: .44 + fractureRandom() * .20 };
  });
  return { layout, style, mountains, islands, basins, geology: { angle: between(-.42, .42), phase: between(0, Math.PI * 2), offset: halfWidth * between(.12, .35),
    noiseScale: between(1300, 2300), relief: between(.8, 1.15), fractures } };
}
