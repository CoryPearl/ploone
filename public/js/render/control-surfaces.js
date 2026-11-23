import * as THREE from 'three';
import { wing, fin } from './aircraft-geometry.js';

function hinge(root, parent, name, origin, axis, role, side = 1) {
  const pivot = new THREE.Group(); pivot.name = name; pivot.position.copy(origin); parent.add(pivot);
  root.userData.controlSurfaces.push({ pivot, axis: axis.normalize(), role, side, deflection: 0 });
  return pivot;
}
function localize(object, origin) { object.geometry.translate(-origin.x, -origin.y, -origin.z); }

// Cut the actual trailing edge out of the airfoil. Each span section follows
// its own hinge, including the Corsair's gull bends and swept fighter wings.
export function articulatedWing(root, name, stations, material, side, tail = false) {
  if (tail && root.userData.stabilators) {
    const [span, front, back, y] = stations[0];
    const origin = new THREE.Vector3(span * side, y, front + (back - front) * .4);
    const pivot = hinge(root, root, 'stabilator-hinge', origin, new THREE.Vector3(side, 0, 0), 'stabilator', side);
    localize(wing(pivot, name, stations, material, side), origin);
    return;
  }
  const fixed = stations.map(([span, front, back, y, thickness]) => [span, front, front + (back - front) * .72, y, thickness]);
  const body = wing(root, name, fixed, material, side);
  body.userData.stations = stations;
  for (let i = 0; i < stations.length - 1; i++) {
    const section = stations.slice(i, i + 2).map(([span, front, back, y, thickness]) =>
      [span, front + (back - front) * .72 + .012, back, y, thickness * .24]);
    const a = section[0], b = section[1];
    const origin = new THREE.Vector3(a[0] * side, a[3], a[1]);
    const axis = new THREE.Vector3((b[0] - a[0]) * side, b[3] - a[3], b[1] - a[1]);
    const role = tail ? 'elevator' : (a[0] + b[0]) / 2 < stations.at(-1)[0] * .6 ? 'flap' : 'aileron';
    const pivot = hinge(root, root, `${role}-hinge`, origin, axis, role, side);
    localize(wing(pivot, `${role}-panel`, section, material, side), origin);
  }
}

function clip(points, distance, sign) {
  const result = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length], da = distance(a) * sign, db = distance(b) * sign;
    if (da >= 0) result.push(a);
    if ((da < 0) !== (db < 0)) {
      const t = da / (da - db); result.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return result;
}
export function articulatedFin(root, name, x, rootY, points, material, cant = 0, thickness = .12) {
  const height = Math.max(...points.map(p => p[1]));
  const zs = points.map(p => p[0]), top = points.filter(p => p[1] >= height * .75).map(p => p[0]);
  const base = Math.min(...zs) + (Math.max(...zs) - Math.min(...zs)) * .7;
  const tip = Math.min(...top) + (Math.max(...top) - Math.min(...top)) * .6;
  const slope = (tip - base) / height, distance = ([z, y]) => z - slope * y - base;
  const fixed = clip(points, distance, -1), moving = clip(points, distance, 1);
  const parent = new THREE.Group(); parent.name = name; parent.position.set(x, rootY, 0); parent.rotation.z = cant; root.add(parent);
  fin(parent, 'fin-fixed', 0, 0, fixed, material, 0, thickness);
  const origin = new THREE.Vector3(0, 0, base);
  const pivot = hinge(root, parent, 'rudder-hinge', origin, new THREE.Vector3(0, 1, slope), 'rudder');
  localize(fin(pivot, 'rudder-panel', 0, 0, moving, material, 0, thickness), origin);
}

const clamp = value => THREE.MathUtils.clamp(value || 0, -1, 1);
export function animateControlSurfaces(root, controls = {}, airspeed, aircraft, dt) {
  const pitch = clamp(controls.pitch), roll = clamp(controls.roll), yaw = clamp(controls.yaw);
  const flap = controls.drift ? .5 : airspeed > 0 && airspeed < aircraft.stallSpeed * 1.4 ? .18 : 0;
  const blend = 1 - Math.exp(-Math.max(0, dt) * 18);
  for (const surface of root.userData.controlSurfaces) {
    const { role, side, pivot, axis } = surface;
    const target = role === 'flap' ? flap : role === 'aileron' ? side * roll * .38 :
      role === 'elevator' ? -pitch * .4 : role === 'stabilator' ? -pitch * .3 + side * roll * .12 : -yaw * .42;
    surface.deflection += (target - surface.deflection) * blend;
    pivot.quaternion.setFromAxisAngle(axis, surface.deflection * (role === 'rudder' ? 1 : side));
  }
}
