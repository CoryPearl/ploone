import test from 'node:test';
import assert from 'node:assert/strict';
import { DirectionalLight, Scene, Vector3, Quaternion } from 'three';
import { FlightPose } from '../public/js/render/flight-pose.js';
import { configureSunShadow, updateSunShadow } from '../public/js/render/sun-shadow.js';
import { SUN_DIRECTION } from '../public/js/render/atmosphere.js';
import { Terrain } from '../public/js/render/terrain.js';
import { createWorld, generateChunk } from '../public/js/core/world.js';
import { createAircraft, animateAircraft, setCockpitAirframe, disposeAircraft } from '../public/js/render/aircraft.js';
import { AIRCRAFT } from '../public/js/core/aircraft-data.js';
import { createFlight, FIXED_DT } from '../public/js/core/flight.js';

const near = (a, b, tolerance = 1e-9) => assert.ok(Math.abs(a - b) < tolerance, `${a} ≠ ${b}`);

test('presentation stays smooth at uneven frame rates without altering physics', () => {
  const flight = createFlight(AIRCRAFT[0], { x: 0, y: 100, z: 0 }), pose = new FlightPose();
  pose.reset(flight);
  let clock = 0, accumulator = 0;
  for (let frame = 0; frame < 200; frame++) {
    const dt = [1 / 144, 1 / 93, 1 / 165][frame % 3];
    accumulator += dt; clock += dt;
    while (accumulator >= FIXED_DT) {
      pose.capture(flight); flight.position.x += 120 * FIXED_DT; flight.elapsed += FIXED_DT; accumulator -= FIXED_DT;
    }
    const physical = flight.position.clone();
    pose.sample(flight, accumulator / FIXED_DT);
    near(pose.position.x, Math.max(0, (clock - FIXED_DT) * 120));
    assert.ok(flight.position.equals(physical));
  }
  pose.capture(flight); const previousSpeed = flight.speed, previousThrottle = flight.throttle;
  flight.speed += 20; flight.throttle += .2;
  flight.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2);
  pose.sample(flight, .5); near(pose.quaternion.angleTo(new Quaternion()), Math.PI / 4);
  near(pose.speed, previousSpeed + 10); near(pose.throttle, previousThrottle + .1);
  near(pose.quaternion.length(), 1); near(pose.travelDirection.length(), 1);
  flight.position.set(0, 150, 0); pose.reset(flight); assert.ok(pose.position.equals(flight.position));
});

test('sun shadow texels stay fixed under small movement and world-origin rebasing', () => {
  const light = new DirectionalLight(), origin = new Vector3(); configureSunShadow(light, 'high');
  const right = new Vector3().crossVectors(new Vector3(0, 1, 0), SUN_DIRECTION).normalize();
  updateSunShadow(light, new Vector3(), origin);
  const initial = light.target.position.dot(right);
  updateSunShadow(light, right.clone().multiplyScalar(.01), origin);
  near(light.target.position.dot(right), initial);
  const position = new Vector3(13000, 750, -17000);
  updateSunShadow(light, position, origin); const worldTarget = light.target.position.clone();
  origin.set(13000, 1000, -17000); updateSunShadow(light, position, origin);
  assert.ok(light.target.position.clone().add(origin).distanceTo(worldTarget) < 1e-9);
  near(light.position.distanceTo(light.target.position), 2400);
});

test('every prop hides solid blades at cruise/full RPM and returns them at idle', () => {
  for (const data of AIRCRAFT.filter(plane => plane.type === 'prop')) for (const ghost of [false, true]) {
    const model = createAircraft(data, ghost), { bladeGroups, bladeMaterials } = model.userData.propellerParts;
    const blur = model.userData.propellerBlur;
    assert.equal(blur.visible, false, 'static thumbnails retain the blade silhouette');
    for (const power of [.52, 1]) {
      animateAircraft(model, data, power, 1, 1 / 60);
      assert.ok(bladeGroups.every(blade => !blade.visible));
      assert.ok(bladeMaterials.every(material => material.opacity === 0));
      assert.equal(blur.visible, true); assert.ok(blur.material.opacity > 0 && blur.material.opacity < .5);
      const pixels=blur.material.map.image.data;let alpha=0,count=0;
      for(let i=3;i<pixels.length;i+=4)if(pixels[i]){alpha+=pixels[i]/255;count++;}
      if(!ghost)assert.ok(alpha/count*blur.material.opacity>.1,'the spinning disc should remain visibly translucent');
      assert.equal(blur.castShadow, false); assert.equal(blur.material.depthWrite, false);
    }
    animateAircraft(model, data, 0, 2, 1 / 60, 0, data.maxSpeed);
    assert.ok(bladeGroups.every(blade => !blade.visible), 'windmilling stays blurred at high airspeed with the throttle closed');
    animateAircraft(model, data, 0, 2, 1 / 60);
    assert.ok(bladeGroups.every(blade => blade.visible)); assert.equal(blur.visible, false);
    let disposed = false; blur.material.map.addEventListener('dispose', () => { disposed = true; });
    disposeAircraft(model); assert.equal(disposed, true);
  }
});

test('changing terrain resolution rebuilds all chunks and rejects old worker geometry', () => {
  const seed = 'stable-ground', terrain = new Terrain(new Scene(), seed, 'high');
  const world = createWorld(seed), position = new Vector3(0, world.height(0, 0) + 180, 0);
  terrain.update(position); assert.ok(terrain.chunks.size > 0);
  const generation = terrain.generation;
  terrain.setQuality('low'); assert.equal(terrain.chunks.size, 0); assert.ok(terrain.generation > generation);
  terrain.receive({ ...generateChunk(seed, 0, 0, 24), generation }); assert.equal(terrain.chunks.size, 0);
  terrain.update(position);
  for (const chunk of terrain.chunks.values()) assert.equal(chunk.children[0].geometry.getAttribute('position').count, 19 * 19);
  terrain.reset(seed);
});

test('cockpit view retains the spinning prop and restores the airframe on return to chase view', () => {
  for(const data of AIRCRAFT.filter(plane=>plane.type==='prop')) {
    const model=createAircraft(data),prop=model.userData.propeller;
    const parts=model.children.filter(part=>part!==prop),visibility=parts.map(part=>part.visible);
    animateAircraft(model,data,1,1,1/60,0,data.cruise);
    setCockpitAirframe(model,true);setCockpitAirframe(model,true);
    assert.equal(prop.visible,true);assert.equal(model.userData.propellerBlur.visible,true);
    assert.equal(model.userData.propellerParts.spinner.visible,false);
    assert.ok(parts.every(part=>!part.visible));
    animateAircraft(model,data,1,2,1/60,0,data.cruise);
    assert.ok(model.userData.propellerParts.bladeGroups.every(blade=>!blade.visible));
    setCockpitAirframe(model,false);
    assert.deepEqual(parts.map(part=>part.visible),visibility);assert.equal(prop.visible,true);
    assert.equal(model.userData.propellerParts.spinner.visible,true);
    disposeAircraft(model);
  }
});
