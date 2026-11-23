import { Vector3 } from 'three';
import { SUN_DIRECTION } from './atmosphere.js';

const right = new Vector3().crossVectors(new Vector3(0, 1, 0), SUN_DIRECTION).normalize();
const up = new Vector3().crossVectors(SUN_DIRECTION, right).normalize();
const center = new Vector3(), anchor = new Vector3();
const EXTENT = 120, DISTANCE = 2400;

export function configureSunShadow(light, quality) {
  light.shadow.mapSize.set(quality === 'high' ? 2048 : 1024, quality === 'high' ? 2048 : 1024);
  const camera = light.shadow.camera;
  camera.left = camera.bottom = -EXTENT; camera.right = camera.top = EXTENT;
  camera.near = DISTANCE - 400; camera.far = DISTANCE + 400; camera.updateProjectionMatrix();
  light.shadow.bias = -.0001; light.shadow.normalBias = .025;
  light.shadow.map?.dispose(); light.shadow.map = null;
}

export function updateSunShadow(light, position, origin) {
  const texel = EXTENT * 2 / light.shadow.mapSize.x;
  // Snap in WORLD light space, before subtracting the rendering origin. This
  // prevents subpixel shadow swimming and preserves the grid after a rebase.
  center.copy(position);
  center.addScaledVector(right, Math.round(position.dot(right) / texel) * texel - position.dot(right));
  center.addScaledVector(up, Math.round(position.dot(up) / texel) * texel - position.dot(up));
  anchor.copy(center).sub(origin);
  light.target.position.copy(anchor); light.position.copy(anchor).addScaledVector(SUN_DIRECTION, DISTANCE);
}
