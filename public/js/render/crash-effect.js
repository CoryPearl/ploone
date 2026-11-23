import * as THREE from 'three';
import { random } from '../core/seed.js';

// A fixed particle pool, using the same faceted meshes and warm colors as the
// terrain. No sprites, photographic fire, or allocations on each render frame.
export class CrashEffect {
  constructor(scene) {
    this.group = new THREE.Group(); this.group.name = 'crash-explosion'; scene.add(this.group);
    this.position = new THREE.Vector3(); this.age = 0; this.active = false;
    this.cloudGeometry = new THREE.IcosahedronGeometry(1, 0);
    this.debrisGeometry = new THREE.BoxGeometry(1, 1, 1);
    this.particles = [];
    for (const [kind, count] of [['fire', 12], ['smoke', 18], ['debris', 12]]) {
      for (let i = 0; i < count; i++) {
        const material = new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true, transparent: true, depthWrite: false, emissiveIntensity: kind === 'fire' ? .45 : 0 });
        const mesh = new THREE.Mesh(kind === 'debris' ? this.debrisGeometry : this.cloudGeometry, material);
        mesh.visible = false; this.group.add(mesh);
        this.particles.push({ kind, mesh, velocity: new THREE.Vector3(), spin: new THREE.Vector3(), color: new THREE.Color() });
      }
    }
    this.reset();
  }
  trigger(position, velocity, color, water = false, seed = 'crash') {
    this.reset(); this.position.copy(position); this.active = true; this.group.visible = true;
    const rng = random(seed), body = new THREE.Color(color);
    for (const particle of this.particles) {
      const { kind, mesh } = particle;
      particle.delay = kind === 'smoke' ? .10 + rng() * .35 : rng() * .07;
      particle.life = kind === 'fire' ? .65 + rng() * .55 : kind === 'smoke' ? 1.9 + rng() * 1.2 : 1.4 + rng() * .8;
      particle.size = kind === 'fire' ? 3.8 + rng() * 5 : kind === 'smoke' ? 2.5 + rng() * 4 : .6 + rng() * 1.6;
      particle.velocity.set((rng() - .5) * 2, .25 + rng(), (rng() - .5) * 2).normalize().multiplyScalar(kind === 'debris' ? 20 + rng() * 30 : kind === 'smoke' ? 6 + rng() * 12 : 6 + rng() * 15);
      particle.velocity.addScaledVector(velocity, kind === 'debris' ? .1 : .015);
      particle.spin.set(rng() * 3, rng() * 3, rng() * 3);
      particle.color.set(kind === 'fire' ? ['#f4d88a', '#efa558', '#d96e3d'][Math.floor(rng() * 3)] : kind === 'smoke' ? water ? '#bdcfc5' : ['#596057', '#737768', '#8b8976'][Math.floor(rng() * 3)] : body);
      mesh.material.color.copy(particle.color); mesh.material.opacity = 1;
      if (kind === 'fire') mesh.material.emissive.copy(particle.color);
      mesh.position.set(0, 0, 0); mesh.rotation.set(rng() * 3, rng() * 3, rng() * 3); mesh.scale.setScalar(.01);
    }
  }
  update(dt, origin) {
    if (!this.active) return;
    this.age += dt; this.group.position.copy(this.position).sub(origin);
    let visible = false;
    for (const particle of this.particles) {
      const { mesh, kind } = particle, age = this.age - particle.delay, progress = age / particle.life;
      mesh.visible = age >= 0 && progress < 1;
      if (!mesh.visible) continue;
      visible = true;
      const drag = kind === 'debris' ? age : (1 - Math.exp(-age * 1.7)) / 1.7;
      mesh.position.copy(particle.velocity).multiplyScalar(drag);
      mesh.position.y += kind === 'debris' ? -4.9 * age * age : kind === 'smoke' ? age * 8 : age * 4;
      mesh.rotation.x += particle.spin.x * dt; mesh.rotation.z += particle.spin.z * dt;
      const scale = particle.size * (kind === 'fire' ? Math.sin(Math.min(1, progress * 1.6) * Math.PI / 2) * (1 - progress * .45) : kind === 'smoke' ? .6 + progress * 2 : 1);
      mesh.scale.set(scale, kind === 'debris' ? scale * .22 : scale, kind === 'debris' ? scale * 1.8 : scale);
      mesh.material.opacity = kind === 'smoke' ? Math.sin(Math.PI * progress) * .8 : Math.min(1, (1 - progress) * 3);
    }
    if (!visible && this.age > .5) this.reset();
  }
  reset() {
    this.active = false; this.age = 0; this.group.visible = false;
    for (const particle of this.particles) particle.mesh.visible = false;
  }
  dispose() {
    this.group.removeFromParent(); this.cloudGeometry.dispose(); this.debrisGeometry.dispose();
    for (const particle of this.particles) particle.mesh.material.dispose();
  }
}
