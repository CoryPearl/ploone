import * as THREE from 'three';
import { landingProfile } from '../core/landing.js';
import { mesh, beam } from './aircraft-geometry.js';

export function addLandingGear(group, data, mat) {
  const profile = landingProfile(data), gear = new THREE.Group();
  gear.name = 'landing-gear'; group.userData.landingGear = gear;
  gear.userData.legs = []; gear.userData.wheels = []; group.add(gear);
  if (profile.fixed) {
    // Retain the Skyhawk's existing spring legs and wheel fairings.
    const parts = group.children.filter(part => ['main-gear-leg', 'main-wheel', 'nose-gear-leg', 'nose-wheel', 'wheel-fairing'].includes(part.name));
    for (const part of parts) gear.add(part);
    gear.userData.wheels = parts.filter(part => part.name.endsWith('-wheel'));
    gear.userData.fixed = true; return;
  }
  for (const wheel of profile.wheels) {
    const leg = new THREE.Group(); leg.name = `${wheel.kind}-gear`;
    leg.position.set(wheel.kind === 'main' ? wheel.x * .65 : wheel.x, -.45, wheel.z);
    gear.add(leg); gear.userData.legs.push({ pivot: leg, side: Math.sign(wheel.x), kind: wheel.kind });
    const x = wheel.x - leg.position.x, y = wheel.y - leg.position.y;
    beam(leg, 'gear-strut', [0, 0, 0], [x, y, 0], wheel.kind === 'tail' ? .035 : .065, mat.metal);
    beam(leg, 'gear-brace', [0, .08, .32], [x, y * .63, 0], .035, mat.metal);
    const tire = mesh(leg, `${wheel.kind}-wheel`, new THREE.CylinderGeometry(wheel.radius, wheel.radius, wheel.radius * .65, 10), mat.rubber, x, y, 0);
    tire.rotation.z = Math.PI / 2; tire.userData.radius = wheel.radius; gear.userData.wheels.push(tire);
    const hub = mesh(tire, 'wheel-hub', new THREE.CylinderGeometry(wheel.radius * .42, wheel.radius * .42, wheel.radius * .68, 8), mat.metal);
    hub.rotation.set(0, 0, 0);
    if (wheel.kind !== 'tail') {
      const door = mesh(leg, 'gear-door', new THREE.BoxGeometry(.09, Math.abs(y) * .6, .5), mat.body, x * .7 + (Math.sign(wheel.x) || 1) * .15, y * .35, 0);
      door.rotation.z = -.08 * (Math.sign(wheel.x) || 1);
    }
  }
  gear.visible = false;
}

export function animateLandingGear(group, extension, speed, dt) {
  const gear = group.userData.landingGear;
  if (!gear) return;
  const deployed = gear.userData.fixed ? 1 : THREE.MathUtils.clamp(extension || 0, 0, 1);
  gear.visible = deployed > .001 && !group.userData.cockpit;
  gear.userData.extension = deployed;
  for (const { pivot, side, kind } of gear.userData.legs) {
    pivot.rotation.z = kind === 'main' ? -side * (1 - deployed) * Math.PI / 2 : 0;
    pivot.rotation.x = kind !== 'main' ? -(1 - deployed) * Math.PI / 2 : 0;
  }
  for (const wheel of gear.userData.wheels) {
    wheel.rotateY(speed * dt / (wheel.userData.radius || .23));
  }
}
