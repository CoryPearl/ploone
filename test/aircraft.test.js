import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3, Box3 } from 'three';
import { AIRCRAFT, supportsAfterburner } from '../public/js/core/aircraft-data.js';
import { MODEL_SPECS } from '../public/js/render/aircraft-specs.js';
import { createAircraft, animateAircraft, disposeAircraft } from '../public/js/render/aircraft.js';

function named(model, name) { const result=[]; model.traverse(object=>{if(object.name===name)result.push(object);}); return result; }

test('all airframes match reference proportions and remain simple, finite geometry', () => {
  for(const data of AIRCRAFT) {
    const model=createAircraft(data), spec=MODEL_SPECS[data.id];
    const size=model.userData.airframeBounds.getSize(new Vector3());
    assert.ok(Math.abs(size.z/spec.length-1)<.04, data.id+' length');
    assert.ok(Math.abs(size.x/spec.span-1)<.035, data.id+' span');
    assert.ok(Math.abs(model.userData.airframeBounds.getCenter(new Vector3()).x)<.05);
    let triangles=0;
    model.traverse(object=>{
      if(!object.geometry)return;
      const positions=object.geometry.getAttribute('position'), normals=object.geometry.getAttribute('normal');
      assert.ok([...positions.array,...normals.array].every(Number.isFinite),data.id+' finite vertices');
      triangles+=(object.geometry.index?.count||positions.count)/3;
    });
    assert.ok(triangles<5000,data.id+' low-poly budget');
    assert.equal(named(model,'vertical-tail').length,spec.fins);
    if(spec.blades)assert.equal(named(model,'propeller-blade').length,spec.blades);
    disposeAircraft(model);
  }
});

test('distinctive aircraft features and engine layouts are retained', () => {
  const models=Object.fromEntries(AIRCRAFT.map(data=>[data.id,createAircraft(data)]));
  assert.equal(named(models.f16,'chin-intake').length,1);
  assert.equal(named(models.f16,'engine-nozzle').length,1);
  assert.equal(named(models.fa18,'engine-nozzle').length,2);
  assert.equal(named(models.f22,'vectoring-petal').length,4);
  assert.equal(named(models.f35,'engine-nozzle').length,1);
  assert.equal(named(models.a10,'engine-pod').length,2);
  assert.equal(named(models.a10,'fan-inlet').length,2);
  assert.equal(named(models.p51,'radiator-scoop').length,1);
  const gull=models.f4u.getObjectByName('main-wing-right').userData.stations;
  assert.ok(gull[1][3]<gull[0][3]-.5 && gull.at(-1)[3]>gull[1][3]+.8);
  assert.equal(named(models.c172,'wing-strut').length,2);
  assert.equal(named(models.c172,'main-wheel').length,2);
  assert.equal(named(models.c172,'nose-wheel').length,1);
  assert.ok(new Box3().setFromObject(models.c172.getObjectByName('main-wing-right')).min.y>1);
  Object.values(models).forEach(disposeAircraft);
});

test('ghosts share airframe bounds and burner flames follow the new nozzle positions', () => {
  for(const data of AIRCRAFT) {
    const normal=createAircraft(data),ghost=createAircraft(data,true);
    assert.ok(normal.userData.airframeBounds.equals(ghost.userData.airframeBounds));
    animateAircraft(normal,data,.5,1,1/60,1);
    assert.equal(normal.userData.exhaust?.visible||false,supportsAfterburner(data));
    if(supportsAfterburner(data)) {
      assert.equal(normal.userData.nozzles.length,MODEL_SPECS[data.id].engines);
      normal.userData.exhaust.children.forEach(flame=>assert.ok(flame.position.z>normal.userData.airframeBounds.max.z-1));
    }
    disposeAircraft(normal);disposeAircraft(ghost);
  }
});

test('every airframe has real hinged surfaces with opposing ailerons, pitch control, and rudders', () => {
  for (const data of AIRCRAFT) {
    const model = createAircraft(data), surfaces = model.userData.controlSurfaces;
    const roles = role => surfaces.filter(surface => surface.role === role);
    assert.ok(roles('flap').length >= 2, data.id + ' inboard flaps');
    assert.ok(roles('aileron').length >= 2, data.id + ' outboard ailerons');
    assert.equal(roles('rudder').length, MODEL_SPECS[data.id].fins);
    assert.ok(roles(supportsAfterburner(data) ? 'stabilator' : 'elevator').length >= 2);
    const meshes = surfaces.map(surface => surface.pivot.children[0]);
    const vertices = meshes.map(mesh => Array.from(mesh.geometry.attributes.position.array));
    for (let i = 0; i < 60; i++) animateAircraft(model, data, 1, i / 60, 1 / 60, 0, data.cruise, { pitch: 1, roll: 1, yaw: 1, drift: true });
    assert.ok(roles('flap').every(surface => surface.deflection > .49));
    assert.ok(roles('aileron').some(surface => surface.deflection > .37));
    assert.ok(roles('aileron').some(surface => surface.deflection < -.37));
    assert.ok(roles('rudder').every(surface => surface.deflection < -.41));
    assert.ok(roles('elevator').every(surface => surface.deflection < -.39));
    assert.ok(surfaces.every(surface => surface.pivot.quaternion.angleTo(new (surface.pivot.quaternion.constructor)()) > .1));
    surfaces.forEach((surface, i) => {
      assert.equal(surface.pivot.children[0], meshes[i]);
      assert.deepEqual(Array.from(meshes[i].geometry.attributes.position.array), vertices[i], 'animation rotates hinges without rebuilding geometry');
    });
    const paused = surfaces.map(surface => surface.deflection);
    animateAircraft(model, data, 1, 1, 0, 0, data.cruise, {});
    assert.deepEqual(surfaces.map(surface => surface.deflection), paused);
    for (let i = 0; i < 60; i++) animateAircraft(model, data, 1, 2, 1 / 60, 0, data.cruise, {});
    assert.ok(surfaces.every(surface => Math.abs(surface.deflection) < .001));
    for (let i = 0; i < 60; i++) animateAircraft(model, data, 1, 3, 1 / 60, 0, data.stallSpeed * 1.2, {});
    assert.ok(roles('flap').every(surface => surface.deflection > .17 && surface.deflection < .19));
    assert.ok(roles('aileron').every(surface => Math.abs(surface.deflection) < .001));
    disposeAircraft(model);
  }
});
