import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, generateChunk, CHUNK_SIZE } from '../public/js/core/world.js';
import { GEOGRAPHIES } from '../public/js/core/geography.js';

const examples = {mesas:'route-0',ranges:'route-1',coast:'route-2',islands:'route-3',fjords:'route-4',volcanoes:'route-7',highlands:'route-11',basins:'route-12'};

function geographyStats(world) {
  const r = world.region, width = 64, heights = [];
  for (let z = 0; z < width; z++) for (let x = 0; x < width; x++) {
    const along = r.length * (.1 + z / (width - 1) * .8), across = (x / (width - 1) * 2 - 1) * r.halfWidth;
    heights.push(world.height(r.start.x + r.direction.x * along + r.side.x * across, r.start.z + r.direction.z * along + r.side.z * across));
  }
  const components = threshold => {
    const visited = new Set(); let clusters = 0;
    for (let i = 0; i < heights.length; i++) {
      if (visited.has(i) || heights[i] <= threshold) continue;
      const queue = [i]; visited.add(i); let size = 0;
      while (queue.length) {
        const a = queue.pop(); size++;
        for (const b of [a-width,a+width,...(a%width?[a-1]:[]),...(a%width<width-1?[a+1]:[])]) {
          if (b>=0 && b<heights.length && !visited.has(b) && heights[b]>threshold) { visited.add(b); queue.push(b); }
        }
      }
      if (size >= 6) clusters++;
    }
    return clusters;
  };
  return {water:heights.filter(h=>h<0).length/heights.length,land:components(0),high:components(700),heights};
}

test('geography changes actual land/water topology and the number of separate highland masses', () => {
  const stats = {};
  for (const [layout, seed] of Object.entries(examples)) {
    const world = createWorld(seed);assert.equal(world.region.layout.id,layout);stats[layout]=geographyStats(world);
  }
  assert.equal(Object.keys(stats).length,GEOGRAPHIES.length);
  assert.ok(stats.islands.water>.4 && stats.islands.land>=4, 'an island course has multiple genuinely disconnected land masses');
  assert.ok(stats.fjords.water>.3 && stats.fjords.high>=4, 'fjords have water channels between several high ridges');
  assert.ok(stats.coast.water>.3 && stats.coast.water<.5 && stats.coast.land===1, 'a coast separates a continental land mass from open sea');
  assert.ok(stats.basins.water>.02, 'basins include an actual lake below water level');
  assert.equal(stats.mesas.water,0);assert.equal(stats.volcanoes.water,0);
  assert.ok(stats.ranges.high>=4 && stats.mesas.high>=4 && stats.volcanoes.high>=7, 'high terrain is distributed among several masses, not one central mountain');
  assert.ok(stats.highlands.heights.filter(h=>h<900).length>stats.highlands.heights.length*.95, 'highlands offer substantially lower, rolling terrain');
});

test('geography varies course length, aspect, heading, and within-family feature configurations', () => {
  const lengths = [], widths = [], quadrants = new Set(), variants = new Map();
  for (let i = 0; i < 80; i++) {
    const world = createWorld(`route-${i}`), r = world.region;
    lengths.push(r.length);widths.push(r.halfWidth);quadrants.add(Math.floor((Math.atan2(r.direction.x,-r.direction.z)+Math.PI*2)%(Math.PI*2)/(Math.PI/2)));
    if (!variants.has(r.layout.id)) variants.set(r.layout.id,new Set());
    variants.get(r.layout.id).add(JSON.stringify([r.mountains,r.islands,r.basins]));
    const repeated = createWorld(`route-${i}`).region; assert.deepEqual(r,repeated);
  }
  assert.ok(Math.max(...lengths)-Math.min(...lengths)>4000);assert.ok(Math.max(...widths)-Math.min(...widths)>1200);
  assert.equal(quadrants.size,4);assert.ok([...variants.values()].every(set=>set.size>=4));
});

test('every geography streams matching heights and colors across both chunk axes', () => {
  const segments = 18;
  for (const seed of Object.values(examples)) {
    const r = createWorld(seed).region;
    const cx = Math.floor((r.start.x+r.direction.x*r.length*.42)/CHUNK_SIZE),cz=Math.floor((r.start.z+r.direction.z*r.length*.42)/CHUNK_SIZE);
    const center=generateChunk(seed,cx,cz,segments),east=generateChunk(seed,cx+1,cz,segments),south=generateChunk(seed,cx,cz+1,segments);
    for(let i=0;i<=segments;i++) {
      const right=(i*(segments+1)+segments)*3,left=i*(segments+1)*3,bottom=(segments*(segments+1)+i)*3,top=i*3;
      assert.equal(center.positions[right+1],east.positions[left+1]);assert.equal(center.positions[bottom+1],south.positions[top+1]);
      assert.deepEqual(center.colors.slice(right,right+3),east.colors.slice(left,left+3));assert.deepEqual(center.colors.slice(bottom,bottom+3),south.colors.slice(top,top+3));
    }
  }
});
