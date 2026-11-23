import { Vector3, Quaternion } from 'three';

// Presentation only: physics, collisions, recordings, and race times use the
// original fixed-step state. Camera and airframe sample the same smooth pose.
export class FlightPose {
  constructor() {
    this.previousPosition = new Vector3(); this.previousQuaternion = new Quaternion(); this.previousDirection = new Vector3();
    this.position = new Vector3(); this.quaternion = new Quaternion(); this.travelDirection = new Vector3(); this.velocity = new Vector3();
  }
  reset(flight) { this.capture(flight); return this.sample(flight, 1); }
  capture(flight) {
    this.previousPosition.copy(flight.position); this.previousQuaternion.copy(flight.quaternion);
    this.previousDirection.copy(flight.travelDirection); this.previousElapsed = flight.elapsed; this.previousBurner = flight.burner;
    this.previousSpeed = flight.speed; this.previousThrottle = flight.throttle;
    this.previousGear = flight.gear;
  }
  sample(flight, alpha) {
    const t = Math.max(0, Math.min(1, alpha));
    this.position.copy(this.previousPosition).lerp(flight.position, t);
    this.quaternion.copy(this.previousQuaternion).slerp(flight.quaternion, t);
    this.travelDirection.copy(this.previousDirection).lerp(flight.travelDirection, t).normalize();
    this.elapsed = this.previousElapsed + (flight.elapsed - this.previousElapsed) * t;
    this.burner = this.previousBurner + (flight.burner - this.previousBurner) * t;
    this.speed = this.previousSpeed + (flight.speed - this.previousSpeed) * t;
    this.throttle = this.previousThrottle + (flight.throttle - this.previousThrottle) * t;
    this.gear = this.previousGear + (flight.gear - this.previousGear) * t;
    this.velocity.copy(this.travelDirection).multiplyScalar(this.speed);
    return this;
  }
}
