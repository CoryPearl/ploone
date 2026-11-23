import * as THREE from 'three';
import { CHUNK_SIZE, generateChunk, gridHash } from '../core/world.js';
import { createRegion } from '../core/region.js';
import { hashString, normalizeSeed } from '../core/seed.js';

export class Terrain {
  constructor(scene, seed, quality = 'high') {
    this.scene = scene; this.origin = new THREE.Vector3(); this.chunks = new Map(); this.pending = new Set(); this.queue = []; this.generation = 0;
    this.groundMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, metalness: 0 });
    this.treeMaterial = new THREE.MeshStandardMaterial({ color: '#3b5843', flatShading: true, roughness: 1 });
    this.trunkMaterial = new THREE.MeshStandardMaterial({ color: '#726249', roughness: 1 });
    this.rockMaterial = new THREE.MeshStandardMaterial({ color: '#92907c', flatShading: true, roughness: 1 });
    this.treeGeo = new THREE.ConeGeometry(5.5, 20, 5); this.treeGeo.translate(0, 13, 0);
    this.trunkGeo = new THREE.CylinderGeometry(0.65, 0.85, 8, 5); this.trunkGeo.translate(0, 4, 0);
    this.leafGeo=new THREE.IcosahedronGeometry(8,0);this.leafGeo.scale(1,1.05,.9);this.leafGeo.translate(0,14,0);
    this.shrubGeo=new THREE.IcosahedronGeometry(1,0);this.shrubGeo.translate(0,.65,0);
    this.leafMaterial=new THREE.MeshStandardMaterial({color:'#789052',roughness:1,flatShading:true});
    this.rockGeo = new THREE.IcosahedronGeometry(1, 0); this.matrix = new THREE.Matrix4(); this.dummy = new THREE.Object3D(); this.instanceColor = new THREE.Color();
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(24000, 24000), new THREE.MeshStandardMaterial({ color: '#79a9a3', roughness: 0.55, metalness: 0.12, flatShading: true }));
    this.water.rotation.x = -Math.PI / 2; scene.add(this.water);
    this.workers = [];
    try {
      for (let i = 0; i < 2; i++) {
        const worker = new Worker(new URL('../terrain-worker.js', import.meta.url), { type: 'module' });
        const slot = { worker, busy: false };
        worker.onmessage = ({ data }) => { slot.busy = false; this.receive(data); this.dispatch(); };
        worker.onerror = () => {
          this.fallback = true; this.workers.forEach(s => s.worker.terminate()); this.workers = []; this.pending.clear(); this.queue = []; this.center = null;
        };
        this.workers.push(slot);
      }
    } catch { this.fallback = true; }
    this.setQuality(quality); this.reset(seed);
  }
  setQuality(quality) {
    const previousSegments = this.segments;
    this.radius = quality === 'low' ? 3 : quality === 'medium' ? 4 : 5;
    this.segments = quality === 'low' ? 18 : 24; this.center = null;
    // Rebuild together so low/high chunks never share mismatched edge grids.
    if (this.seed !== undefined && previousSegments !== this.segments) this.reset(this.seed);
  }
  reset(seed) {
    seed=normalizeSeed(seed);
    this.seed = seed; this.generation++;
    this.style = createRegion(seed).style; this.colorSeed = hashString(seed);
    const { palette } = this.style;
    this.treeMaterial.color.setRGB(...palette.conifer, THREE.SRGBColorSpace);
    this.leafMaterial.color.setRGB(...palette.leaf, THREE.SRGBColorSpace);
    this.rockMaterial.color.setRGB(...palette.boulder, THREE.SRGBColorSpace);
    this.water.material.color.setRGB(...palette.water, THREE.SRGBColorSpace);
    this.chunks.forEach(chunk => this.removeChunk(chunk)); this.chunks.clear(); this.pending.clear(); this.queue = []; this.center = null;
  }
  setOrigin(origin) {
    this.origin.copy(origin);
    this.chunks.forEach(chunk => chunk.position.set(chunk.userData.cx * CHUNK_SIZE - origin.x, -origin.y, chunk.userData.cz * CHUNK_SIZE - origin.z));
    this.water.position.y = -origin.y;
  }
  update(position) {
    const cx = Math.floor(position.x / CHUNK_SIZE), cz = Math.floor(position.z / CHUNK_SIZE), center = `${cx},${cz}`;
    this.water.position.x = position.x - this.origin.x; this.water.position.z = position.z - this.origin.z;
    if (this.center !== center) {
      this.center = center; this.cx = cx; this.cz = cz;
      for (const [key, chunk] of this.chunks) if (Math.abs(chunk.userData.cx - cx) > this.radius || Math.abs(chunk.userData.cz - cz) > this.radius) { this.removeChunk(chunk); this.chunks.delete(key); }
      this.queue = this.queue.filter(job => { const keep = Math.abs(job.cx - cx) <= this.radius && Math.abs(job.cz - cz) <= this.radius; if (!keep) this.pending.delete(`${job.cx},${job.cz}`); return keep; });
      for (let z = -this.radius; z <= this.radius; z++) for (let x = -this.radius; x <= this.radius; x++) {
        const key = `${cx + x},${cz + z}`;
        if (!this.chunks.has(key) && !this.pending.has(key)) {
          this.pending.add(key); this.queue.push({ seed: this.seed, cx: cx + x, cz: cz + z, segments: this.segments, generation: this.generation });
        }
      }
      this.queue.sort((a, b) => (a.cx - cx) ** 2 + (a.cz - cz) ** 2 - (b.cx - cx) ** 2 - (b.cz - cz) ** 2);
    }
    this.dispatch();
  }
  dispatch() {
    if (!this.workers.length) {
      const job = this.queue.shift(); if (job) this.receive({ ...generateChunk(job.seed, job.cx, job.cz, job.segments), generation: job.generation });
      return;
    }
    for (const slot of this.workers) if (!slot.busy && this.queue.length) { slot.busy = true; slot.worker.postMessage(this.queue.shift()); }
  }
  receive(data) {
    if (data.generation !== this.generation) return;
    const key = `${data.cx},${data.cz}`; this.pending.delete(key);
    if (Math.abs(data.cx - this.cx) > this.radius || Math.abs(data.cz - this.cz) > this.radius || this.chunks.has(key)) return;
    const group = new THREE.Group(); group.userData = { cx: data.cx, cz: data.cz };
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3)); geometry.setAttribute('color', new THREE.BufferAttribute(data.colors, 3)); geometry.setIndex(new THREE.BufferAttribute(data.indices, 1)); geometry.computeVertexNormals();
    const ground = new THREE.Mesh(geometry, this.groundMaterial); ground.receiveShadow = true; group.add(ground);
    const instances = (items, geo, mat, tree = false, varied = false) => {
      if (!items.length) return;
      const object = new THREE.InstancedMesh(geo, mat, items.length / 5);
      for (let i = 0; i < items.length; i += 5) {
        this.dummy.position.set(items[i], items[i + 1], items[i + 2]); this.dummy.rotation.set(0, items[i + 4], 0);
        this.dummy.scale.setScalar(items[i + 3]); if (!tree) this.dummy.scale.y *= 0.65;
        this.dummy.updateMatrix(); object.setMatrixAt(i / 5, this.dummy.matrix);
        if (varied) {
          const tint = .8 + gridHash(Math.floor(data.cx * CHUNK_SIZE + items[i]), Math.floor(data.cz * CHUNK_SIZE + items[i + 2]), this.colorSeed) * .4;
          this.instanceColor.setRGB(tint, tint, tint); object.setColorAt(i / 5, this.instanceColor);
        }
      }
      object.castShadow = false; object.receiveShadow = true; object.computeBoundingSphere(); group.add(object);
    };
    instances(data.trees, this.treeGeo, this.treeMaterial, true, true); instances(data.trees, this.trunkGeo, this.trunkMaterial, true); instances(data.rocks, this.rockGeo, this.rockMaterial, false, true);
    instances(data.broadleaf,this.leafGeo,this.leafMaterial,true,true);instances(data.broadleaf,this.trunkGeo,this.trunkMaterial,true);instances(data.shrubs,this.shrubGeo,this.leafMaterial,false,true);
    group.position.set(data.cx * CHUNK_SIZE - this.origin.x, -this.origin.y, data.cz * CHUNK_SIZE - this.origin.z); this.scene.add(group); this.chunks.set(key, group);
  }
  removeChunk(chunk) {
    this.scene.remove(chunk);
    chunk.traverse(object => { if (object.isMesh && !object.isInstancedMesh) object.geometry.dispose(); if (object.isInstancedMesh) object.dispose(); });
  }
  get ready() { return this.chunks.size >= 9; }
}
