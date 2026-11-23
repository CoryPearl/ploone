import * as THREE from 'three';

export function mesh(group, name, geometry, material, x = 0, y = 0, z = 0) {
  const object = new THREE.Mesh(geometry, material);
  object.name = name; object.position.set(x, y, z); object.castShadow = true; object.receiveShadow = false;
  group.add(object); return object;
}
function geometry(positions, indices) {
  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  result.setIndex(indices); result.computeVertexNormals(); return result;
}

// Closed cross sections: [z, half width, top, bottom, optional lateral offset].
// Nose -Z; right wing +X; up +Y.
export function loft(group, name, sections, material, { sides = 12, box = false, x = 0 } = {}) {
  const positions = [], indices = [];
  const rectangle = [[1,-.65],[1,.65],[.65,1],[-.65,1],[-1,.65],[-1,-.65],[-.65,-1],[.65,-1]];
  const count = box ? 8 : sides;
  for (const [z, width, top, bottom, offsetX = 0] of sections) {
    const center = (top + bottom) / 2, height = (top - bottom) / 2;
    for (let k = 0; k < count; k++) {
      const [rx, ry] = box ? rectangle[k] : [Math.cos(k/count*Math.PI*2), Math.sin(k/count*Math.PI*2)];
      positions.push(x + offsetX + rx * width, center + ry * height, z);
    }
  }
  for (let i = 0; i < sections.length - 1; i++) for (let k = 0; k < count; k++) {
    const a = i*count+k, c = i*count+(k+1)%count, b = a+count, d = c+count;
    indices.push(a,c,b,c,d,b);
  }
  for (const end of [0, sections.length - 1]) {
    const section = sections[end], centerIndex = positions.length/3;
    positions.push(x + (section[4] || 0), (section[2]+section[3])/2, section[0]);
    for (let k = 0; k < count; k++) {
      const a = end*count+k, b = end*count+(k+1)%count;
      indices.push(centerIndex, end ? a : b, end ? b : a);
    }
  }
  return mesh(group, name, geometry(positions, indices), material);
}

// One continuous airfoil. Stations: [half span, leading Z, trailing Z, Y, thickness].
// Station heights produce dihedral and both Corsair gull bends without disconnected panels.
export function wing(group, name, stations, material, side = 1) {
  const positions = [], indices = [];
  for (const [span, front, back, y, thickness] of stations) {
    const chord = back-front, x = span*side;
    positions.push(x,y,front, x,y+thickness/2,front+chord*.28, x,y+thickness*.08,back, x,y-thickness/2,front+chord*.35);
  }
  for (let i = 0; i < stations.length - 1; i++) for (let k = 0; k < 4; k++) {
    const a=i*4+k,b=a+4,c=i*4+(k+1)%4,d=c+4;
    if (side>0) indices.push(a,c,b,c,d,b); else indices.push(a,b,c,c,b,d);
  }
  for (const end of [0,stations.length-1]) {
    const a=end*4;
    if ((end>0)===(side>0)) indices.push(a,a+1,a+2,a,a+2,a+3);
    else indices.push(a,a+2,a+1,a,a+3,a+2);
  }
  const object=mesh(group,name,geometry(positions,indices),material);
  object.userData.stations=stations; object.userData.side=side; return object;
}

// Fin points: [longitudinal Z, height above root], extruded across X.
export function fin(group,name,x,rootY,points,material,cant=0,thickness=.12) {
  const shape=new THREE.Shape(); points.forEach(([z,y],i)=>i?shape.lineTo(z,y):shape.moveTo(z,y)); shape.closePath();
  const result=new THREE.ExtrudeGeometry(shape,{depth:thickness,bevelEnabled:false});
  const attribute=result.getAttribute('position');
  for(let i=0;i<attribute.count;i++) {
    const z=attribute.getX(i),y=attribute.getY(i),width=attribute.getZ(i)-thickness/2;
    attribute.setXYZ(i,width,y,z);
  }
  result.computeVertexNormals();
  const object=mesh(group,name,result,material,x,rootY,0); object.rotation.z=cant; return object;
}
export function plate(group,name,points,material) {
  const indices=[]; for(let i=1;i<points.length-1;i++) indices.push(0,i,i+1);
  return mesh(group,name,geometry(points.flat(),indices),material);
}
export function beam(group,name,from,to,radius,material) {
  const a=new THREE.Vector3(...from),b=new THREE.Vector3(...to);
  const object=mesh(group,name,new THREE.CylinderGeometry(radius,radius,a.distanceTo(b),5),material);
  object.position.copy(a).add(b).multiplyScalar(.5);
  object.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),b.sub(a).normalize()); return object;
}
export function disc(group,name,x,y,z,radius,material) {
  const object=mesh(group,name,new THREE.CircleGeometry(radius,12),material,x,y,z);
  object.rotation.y=Math.PI; return object;
}
