import { Vector3 } from 'three';

const forward = new Vector3(), right = new Vector3(), up = new Vector3();
const degrees = 180 / Math.PI;

// Derive attitude from the airframe axes, without Euler angle order changes.
export function flightAttitude(quaternion) {
  forward.set(0, 0, -1).applyQuaternion(quaternion);
  right.set(1, 0, 0).applyQuaternion(quaternion);
  up.set(0, 1, 0).applyQuaternion(quaternion);
  return {
    pitch: Math.asin(Math.max(-1, Math.min(1, forward.y))),
    bank: Math.atan2(right.y, up.y),
    heading: (Math.atan2(forward.x, -forward.z) * degrees + 360) % 360
  };
}

export const headingDifference = (heading, reference) => ((heading - reference + 540) % 360) - 180;
