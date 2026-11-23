import * as THREE from 'three';
import { ROTOR_RADIUS } from '../core/landmarks.js';

// One closed blade with colored faces, rather than a tip box sharing a surface
// with the blade. This removes the overlapping faces that flickered in flight.
export function turbineBladeGeometry() {
  const positions = [], colors = [], white = new THREE.Color('#e5e0cd'), red = new THREE.Color('#bd6954');
  const sections = [[4, 2.4, 1.6], [15, 7, 1.4], [40, 2.6, .9], [ROTOR_RADIUS, 1.8, .65]];
  const ring = ([y, width, thickness]) => [[-width / 2, y, -thickness / 2], [width / 2, y, -thickness / 2], [width / 2, y, thickness / 2], [-width / 2, y, thickness / 2]];
  const triangle = (a, b, c, color) => { positions.push(...a, ...b, ...c); for (let i = 0; i < 3; i++) colors.push(color.r, color.g, color.b); };
  for (let index = 0; index < sections.length - 1; index++) {
    const lower = ring(sections[index]), upper = ring(sections[index + 1]), color = index === 2 ? red : white;
    for (let side = 0; side < 4; side++) {
      const next = (side + 1) % 4;
      triangle(lower[side], upper[side], lower[next], color); triangle(lower[next], upper[side], upper[next], color);
    }
  }
  const bottom = ring(sections[0]), top = ring(sections.at(-1));
  triangle(bottom[0], bottom[1], bottom[2], white); triangle(bottom[0], bottom[2], bottom[3], white);
  triangle(top[0], top[2], top[1], red); triangle(top[0], top[3], top[2], red);
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geometry.computeVertexNormals(); geometry.computeBoundingBox();
  return geometry;
}
