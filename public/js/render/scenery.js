import * as THREE from 'three';
import { random } from '../core/seed.js';

export function createClouds(scene) {
  const group = new THREE.Group(), rng = random('ploon-clouds'), material = new THREE.MeshStandardMaterial({ color: '#fff5df', emissive:'#dfd6c0',emissiveIntensity:.2,flatShading: true, roughness: 1 });
  const geometry = new THREE.IcosahedronGeometry(1, 1);
  for (let n = 0; n < 28; n++) {
    const cluster = new THREE.Group();
    const x = (rng() - 0.5) * 11000, z = (rng() - 0.5) * 11000;
    for (let j = 0; j < 4; j++) {
      const puff = new THREE.Mesh(geometry, material); puff.position.set(j * 90, rng() * 35, rng() * 65);
      puff.scale.set(100 + rng() * 90, 35 + rng() * 50, 70 + rng() * 70); cluster.add(puff);
    }
    cluster.position.set(x, 1100 + rng() * 550, z); cluster.userData.home = { x, z }; group.add(cluster);
  }
  scene.add(group); return group;
}

export function createAirfield(world, scene) {
  const group = new THREE.Group(), ground = Math.max(0, world.height(250, 250));
  group.userData.world = new THREE.Vector3(250, ground + 1, 250);
  const runwayMat = new THREE.MeshStandardMaterial({ color: '#646c64', roughness: 1 });
  const runway = new THREE.Mesh(new THREE.BoxGeometry(38, 2, 340), runwayMat); runway.receiveShadow = true; group.add(runway);
  const white = new THREE.MeshStandardMaterial({ color: '#ece5c8' });
  for (let i = -6; i <= 6; i++) { const mark = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.15, 12), white); mark.position.set(0, 1.1, i * 23); group.add(mark); }
  const roof = new THREE.MeshStandardMaterial({ color: '#c0bba1', flatShading: true });
  for (let i = 0; i < 3; i++) {
    const hangar = new THREE.Mesh(new THREE.BoxGeometry(28, 15, 24), roof); hangar.position.set(47, 7.5, i * 38 - 50); group.add(hangar);
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.3, 10, 18), runwayMat); door.position.set(32.8, 5.5, i * 38 - 50); group.add(door);
  }
  scene.add(group); return group;
}

export class FinishRing {
  constructor(scene) {
    this.group = new THREE.Group(); this.group.name = 'finish-ring'; scene.add(this.group);
    const material = new THREE.MeshBasicMaterial({ color: '#f3ad65', fog: false });
    this.geometry = new THREE.TorusGeometry(145, 4.5, 6, 80);
    this.ring = new THREE.Mesh(this.geometry, material); this.group.add(this.ring);
    const inner = new THREE.Mesh(new THREE.TorusGeometry(153, 1.3, 5, 80), new THREE.MeshBasicMaterial({ color: '#fff1cc', fog: false }));
    this.group.add(inner);
    const marker = new THREE.Mesh(new THREE.ConeGeometry(11, 23, 4), material); marker.position.y = 177; marker.rotation.z = Math.PI; this.group.add(marker);
  }
  setCourse(course) {
    this.finish = course.finish; this.group.rotation.y = Math.atan2(course.finish.nx, course.finish.nz);
  }
  update(origin, visible) {
    this.group.visible = visible;
    this.group.position.set(this.finish.x - origin.x, this.finish.y - origin.y, this.finish.z - origin.z);
  }
  dispose() { /* Geometry is shared across course changes. */ }
}
