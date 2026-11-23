import test from 'node:test';
import assert from 'node:assert/strict';
import { Scene, Fog, Vector3, Matrix4, Box3 } from 'three';
import { createWorld, CHUNK_SIZE } from '../public/js/core/world.js';
import { LandmarkField, generateLandmarkCell, landmarkHit, ROTOR_RADIUS, ROTOR_OFFSET_Z } from '../public/js/core/landmarks.js';
import { generateCourse } from '../public/js/core/race.js';
import { placeTower } from '../public/js/core/landmark-placement.js';
import { LandmarkRenderer } from '../public/js/render/landmarks.js';
import { turbineBladeGeometry } from '../public/js/render/turbine.js';

function renderedHeight(world, x, z, segments) {
  const cx = Math.floor(x / CHUNK_SIZE), cz = Math.floor(z / CHUNK_SIZE), step = CHUNK_SIZE / segments;
  const px = (x - cx * CHUNK_SIZE) / step, pz = (z - cz * CHUNK_SIZE) / step;
  const ix = Math.floor(px), iz = Math.floor(pz), u = px - ix, v = pz - iz;
  const x0 = cx * CHUNK_SIZE + ix * step, z0 = cz * CHUNK_SIZE + iz * step;
  const a = world.height(x0, z0), b = world.height(x0 + step, z0), c = world.height(x0, z0 + step), d = world.height(x0 + step, z0 + step);
  return u + v <= 1 ? a + (b - a) * u + (c - a) * v : d + (b - d) * (1 - v) + (c - d) * (1 - u);
}

test('spire replacements are low grounded outcrops and turbines use buildable sites', () => {
  let turbines = 0, outcrops = 0;
  for (let index = 0; index < 18; index++) {
    const world = createWorld(`scenery-sites-${index}`), field = new LandmarkField(world, generateCourse(world));
    const items = [...field.courseItems];
    for (let z = -3; z < 2; z++) for (let x = -2; x < 3; x++) items.push(...generateLandmarkCell(world, x, z));
    for (const item of items) {
      assert.notEqual(item.type, 'spire');
      if (item.type === 'wind' || item.type === 'tower') {
        assert.ok(item.footing && item.footing.depth >= 7.5);
        for (const dx of [-11, 0, 11]) for (const dz of [-11, 0, 11]) for (const segments of [18, 24]) {
          const ground = renderedHeight(world, item.x + dx, item.z + dz, segments);
          assert.ok(item.y - item.footing.depth < ground, 'foundation extends into both detail levels of terrain');
          assert.ok(item.y >= ground - 1, 'top of the foundation stays clear of the mesh');
        }
        if (item.type === 'wind') {
          turbines++;
          for (const dx of [-ROTOR_RADIUS, 0, ROTOR_RADIUS]) {
            assert.ok(world.height(item.x + dx, item.z + ROTOR_OFFSET_Z) < item.y + item.height - ROTOR_RADIUS - 14);
          }
        }
      }
      if (item.type === 'outcrop') {
        outcrops++; assert.ok(item.height > 0); assert.ok(item.rocks.length >= 1 && item.rocks.length <= 5);
        for (const rock of item.rocks) {
          assert.ok(rock.height < 50 && rock.width >= 35 && rock.depth >= 30);
          assert.ok(rock.y - rock.height / 2 < world.height(rock.x, rock.z), 'stone is embedded in its own ground');
          assert.equal(landmarkHit(item, {x:rock.x-200,y:rock.y,z:rock.z}, {x:rock.x+200,y:rock.y,z:rock.z},0,0),true);
        }
        const top = Math.max(...item.rocks.map(rock => rock.y + rock.height / 2));
        assert.equal(landmarkHit(item,{x:item.x-300,y:top+20,z:item.z},{x:item.x+300,y:top+20,z:item.z}),false,'removed spikes leave the sky above the stones clear');
      }
    }
  }
  assert.ok(turbines > 35); assert.ok(outcrops > 35);
});

test('man-made landmarks move off a cliff edge and omit sites with no buildable ground', () => {
  const world = {seed:'cliff',landCover:()=>null,height:(x,z)=>x%700<15&&x%700>-15&&z%700<15&&z%700>-15?150:450};
  const moved = placeTower(world,{id:'test',type:'wind',x:0,z:0,height:180},ROTOR_RADIUS);
  assert.ok(moved && Math.hypot(moved.x,moved.z)>60);
  world.height=(x,z)=>150+z*2;
  assert.equal(placeTower(world,{id:'test',type:'wind',x:0,z:0,height:180},ROTOR_RADIUS),null);
});

test('wind blades are closed solids without duplicate overlapping tip faces', () => {
  const geometry = turbineBladeGeometry(), positions = geometry.getAttribute('position'), edges = new Map(), faces = new Set();
  const key = i => [positions.getX(i),positions.getY(i),positions.getZ(i)].join(',');
  for (let i = 0; i < positions.count; i += 3) {
    const vertices = [key(i),key(i+1),key(i+2)], face = [...vertices].sort().join('|');
    assert.equal(faces.has(face),false); faces.add(face);
    for (let side = 0; side < 3; side++) {
      const edge = [vertices[side],vertices[(side+1)%3]].sort().join('|');edges.set(edge,(edges.get(edge)||0)+1);
    }
  }
  assert.ok([...edges.values()].every(count=>count===2));
  assert.equal(geometry.boundingBox.max.y, ROTOR_RADIUS); assert.ok(geometry.boundingBox.max.z - geometry.boundingBox.min.z > 1.5);
  geometry.dispose();
});

test('visible rotor blades match collisions through rotation and world-origin shifts', () => {
  const scene = new Scene(); scene.fog = new Fog('#ddd',1000,4000);
  const renderer = new LandmarkRenderer(scene), world = createWorld('turbine-render-test');
  const wind = {id:'wind',type:'wind',x:13000,y:800,z:-7000,height:190,phase:.37,variant:0,footing:{width:22,depth:9}};
  renderer.setField({world,nearby:()=>[wind]});
  const origin = new Vector3(13000,500,-7000), position = new Vector3(wind.x,wind.y+100,wind.z+200);
  for (const time of [0,.5,1.25,3,7]) {
    renderer.update(position,origin,time);scene.updateMatrixWorld(true);
    const object = renderer.objects.get(wind.id), rotor = object.getObjectByName('rotor');
    for (const group of rotor.children.filter(child=>child.isGroup)) {
      const onBlade = group.localToWorld(new Vector3(0,37,0)).add(origin);
      assert.equal(landmarkHit(wind,onBlade.clone().add(new Vector3(0,0,-45)),onBlade.clone().add(new Vector3(0,0,45)),time,0),true);
    }
    assert.ok(object.getObjectByName('nacelle'));
    assert.equal(object.getObjectByName('blade-tip'),undefined);
  }
  const fixture = renderer.objects.get(wind.id);
  assert.ok(new Box3().setFromObject(fixture.getObjectByName('foundation')).max.y <= wind.y - origin.y + .001);
});

test('outcrop rendering shares real stone transforms and releases streamed instances', () => {
  const scene = new Scene();scene.fog = new Fog('#ddd',1000,4000);
  const world = createWorld('scenery-sites-3'), field = new LandmarkField(world,generateCourse(world));
  const item = field.courseItems.find(item=>item.type==='outcrop');assert.ok(item);
  const renderer = new LandmarkRenderer(scene);renderer.setField({world,nearby:()=>[item]});renderer.update(item,new Vector3(),0);scene.updateMatrixWorld(true);
  const stones = renderer.objects.get(item.id).getObjectByName('boulders'), matrix = new Matrix4();
  assert.equal(stones.count,item.rocks.length);
  item.rocks.forEach((rock,index)=>{stones.getMatrixAt(index,matrix);const center=new Vector3().setFromMatrixPosition(matrix).add(new Vector3(item.x,item.y,item.z));assert.ok(center.distanceTo(new Vector3(rock.x,rock.y,rock.z))<.001);});
  let released=false;stones.addEventListener('dispose',()=>{released=true;});renderer.setField(field);assert.equal(released,true);
});
