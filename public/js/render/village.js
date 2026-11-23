import * as THREE from 'three';

export class VillageBuilder {
  constructor(materials) {
    this.materials = { ...materials,
      timber: new THREE.MeshStandardMaterial({ color: '#8e7957', roughness: 1 }),
      crop: new THREE.MeshStandardMaterial({ color: '#c4b36b', roughness: 1 }),
      leaf: new THREE.MeshStandardMaterial({ color: '#698448', roughness: 1, flatShading: true }) };
    const shape = new THREE.Shape(); shape.moveTo(-.5, 0); shape.lineTo(.5, 0); shape.lineTo(0, 1); shape.closePath();
    const roof = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false }); roof.translate(0, 0, -.5);
    this.geometry = { box: new THREE.BoxGeometry(1, 1, 1), roof, cylinder: new THREE.CylinderGeometry(1, 1, 1, 10),
      cone: new THREE.ConeGeometry(1, 1, 10), leaves: new THREE.IcosahedronGeometry(1, 0),
      well: new THREE.CylinderGeometry(4.2, 4.2, 3, 12, 1, true), rim: new THREE.RingGeometry(3.4, 4.2, 12), water: new THREE.CircleGeometry(3.4, 12) };
    this.dummy = new THREE.Object3D(); this.axis = new THREE.Vector3(1, 0, 0);
  }
  build(item, world) {
    const group = new THREE.Group(), m = this.materials, geo = this.geometry;
    group.name = 'farm-village';
    const local = (x, y, z) => new THREE.Vector3(x - item.x, y - item.y, z - item.z);
    const records = [];
    const record = (x, y, z, sx, sy, sz, yaw = 0) => ({ position: local(x, y, z), scale: new THREE.Vector3(sx, sy, sz), yaw });
    const instances = (name, geometry, material, entries, detail = false) => {
      if (!entries.length) return;
      const mesh = new THREE.InstancedMesh(geometry, material, entries.length); mesh.name = name; mesh.userData.detail = detail;
      entries.forEach((entry, index) => {
        this.dummy.position.copy(entry.position); this.dummy.scale.copy(entry.scale); this.dummy.rotation.set(0, entry.yaw || 0, 0);
        if (entry.quaternion) this.dummy.quaternion.copy(entry.quaternion);
        this.dummy.updateMatrix(); mesh.setMatrixAt(index, this.dummy.matrix);
      });
      mesh.computeBoundingSphere(); group.add(mesh); return mesh;
    };
    for (const barn of [false, true]) {
      const buildings = item.houses.filter(h => h.barn === barn);
      instances(barn ? 'barns' : 'houses', geo.box, barn ? m.red : m.wall, buildings.map(h => record(h.x, h.y + h.height / 2, h.z, h.width, h.height, h.depth, h.yaw)));
      instances(barn ? 'barn-roofs' : 'house-roofs', geo.roof, barn ? m.dark : m.roof, buildings.map(h => record(h.x, h.y + h.height, h.z, h.width + 2, h.roof, h.depth + 2, h.yaw)));
    }
    instances('foundations', geo.box, m.stone, item.houses.map(h => record(h.x, h.y - .7, h.z, h.width + .6, 3, h.depth + .6, h.yaw)));
    const doors = [], windows = [];
    for (const h of item.houses) {
      const c = Math.cos(h.yaw), s = Math.sin(h.yaw), front = -h.depth / 2 - .18;
      doors.push(record(h.x + front * s, h.y + 3.8, h.z + front * c, h.barn ? 10 : 4.2, 7.6, .28, h.yaw));
      for (const side of [-1, 1]) {
        const x = side * h.width * .29;
        windows.push(record(h.x + x * c + front * s, h.y + h.height * .65, h.z - x * s + front * c, 3.2, 3.2, .3, h.yaw));
      }
    }
    instances('doors', geo.box, m.dark, doors); instances('windows', geo.box, m.white, windows);
    const well = new THREE.Group(); well.name = 'village-well'; well.userData.detail = true;
    const stone = new THREE.Mesh(geo.well, m.stone); stone.position.copy(local(item.well.x, item.well.y + 1.5, item.well.z)); well.add(stone);
    for (const [geometry, y, material] of [[geo.rim, 3.02, m.stone], [geo.water, 1.4, m.dark]]) {
      const mesh = new THREE.Mesh(geometry, material); mesh.rotation.x = -Math.PI / 2; mesh.position.copy(local(item.well.x, item.well.y + y, item.well.z)); well.add(mesh);
    }
    group.add(well);
    instances('well-posts', geo.box, m.timber, [-1, 1].map(side => record(item.x + side * 4, item.well.y + 4, item.z, .6, 8, .6)), true);
    instances('well-roof', geo.roof, m.roof, [record(item.x, item.well.y + 7, item.z, 12, 4, 9)], true);

    const posts = [], rails = [], crops = [];
    for (const field of item.fields) {
      const x0 = field.x - field.width / 2, x1 = field.x + field.width / 2, z0 = field.z - field.depth / 2, z1 = field.z + field.depth / 2;
      for (const [ax, az, bx, bz] of [[x0,z0,x1,z0], [x1,z0,x1,z1], [x1,z1,x0,z1], [x0,z1,x0,z0]]) {
        const count = Math.ceil(Math.hypot(bx - ax, bz - az) / 18);
        for (let index = 0; index < count; index++) {
          const t = index / count, next = (index + 1) / count;
          const x = ax + (bx - ax) * t, z = az + (bz - az) * t, nx = ax + (bx - ax) * next, nz = az + (bz - az) * next;
          const y = world.height(x, z), ny = world.height(nx, nz);
          posts.push(record(x, y + 1.8, z, .45, 3.6, .45));
          for (const lift of [1.1, 2.6]) {
            const a = local(x, y + lift, z), b = local(nx, ny + lift, nz), delta = b.clone().sub(a);
            rails.push({ position: a.add(b).multiplyScalar(.5), scale: new THREE.Vector3(delta.length(), .25, .25), quaternion: new THREE.Quaternion().setFromUnitVectors(this.axis, delta.normalize()) });
          }
        }
      }
      for (let x = x0 + 9; x < x1; x += 18) for (let z = z0 + 8; z < z1; z += 14) crops.push(record(x, world.height(x, z) + .7, z, 1.5, 1.4, 8));
    }
    instances('fence-posts', geo.box, m.timber, posts, true); instances('fence-rails', geo.box, m.timber, rails, true);
    instances('crop-rows', geo.box, m.crop, crops, true);
    instances('orchard-trunks', geo.cylinder, m.timber, item.orchard.map(t => record(t.x, t.y + 3, t.z, .55, 6, .55)), true);
    instances('orchard-trees', geo.leaves, m.leaf, item.orchard.map(t => record(t.x, t.y + 8, t.z, 5 * t.scale, 6 * t.scale, 5 * t.scale)), true);
    const barn = item.houses.find(h => h.barn), sx = item.silo.x, sz = item.silo.z, sy = item.silo.y;
    instances('grain-silo', geo.cylinder, m.white, [record(sx, sy + 13, sz, 5.5, 26, 5.5)]);
    instances('silo-roof', geo.cone, m.dark, [record(sx, sy + 29, sz, 5.8, 6, 5.8)]);
    for (let i = 0; i < 4; i++) records.push(record(barn.x + 12 + i * 6, world.height(barn.x + 12 + i * 6, barn.z - 24) + 1.8, barn.z - 24, 4, 3.6, 4));
    instances('hay-bales', geo.box, m.crop, records, true);
    return group;
  }
}

export function releaseVillage(group) { group.traverse(object => { if (object.isInstancedMesh) object.dispose(); }); }
