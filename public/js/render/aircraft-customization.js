import * as THREE from 'three';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';
import { normalizeCustomization } from '../core/customization.js';
import { stickerTexture } from './sticker-art.js';

function dispose(group) {
  const textures=new Set();group.traverse(object=>{object.geometry?.dispose();if(object.material){if(object.material.map)textures.add(object.material.map);object.material.dispose();}});textures.forEach(texture=>texture.dispose());
}
function projector(model,slot) {
  const spec=model.userData.spec,side=slot.startsWith('left')?-1:1;
  if(slot.endsWith('Wing')) {
    const wing=model.getObjectByName(`main-wing-${side<0?'left':'right'}`),stations=wing?.userData.stations;if(!stations)return null;
    const span=stations.at(-1)[0]*.53;let index=1;while(index<stations.length-1&&stations[index][0]<span)index++;
    const a=stations[index-1],b=stations[index],t=(span-a[0])/(b[0]-a[0]),mix=i=>a[i]+(b[i]-a[i])*t;
    const chord=mix(2)-mix(1);
    const panel=model.getObjectByName(`wing-panel-${side<0?'left':'right'}`);
    return { meshes:[wing,panel].filter(Boolean),origin:new THREE.Vector3(side*span,mix(3)+4,mix(1)+chord*.43),direction:new THREE.Vector3(0,-1,0),size:Math.min(1.65,chord*.46) };
  }
  const meshes=[];model.traverse(object=>{if(object.isMesh&&object.name.includes('fuselage'))meshes.push(object);});
  return {meshes,origin:new THREE.Vector3(side*spec.span,.12,-spec.length*(spec.blades?.14:.28)),direction:new THREE.Vector3(-side,0,0),size:Math.min(.95,spec.length*.065)};
}
export function applyAircraftCustomization(model,value,{ghost=false,textureFactory=stickerTexture}={}) {
  const appearance=normalizeCustomization(value),signature=JSON.stringify(appearance.stickers);
  if(model.userData.stickerSignature===signature)return;
  const old=model.userData.stickers;if(old){model.remove(old);dispose(old);}
  const group=new THREE.Group();group.name='aircraft-stickers';model.userData.stickers=group;model.userData.stickerSignature=signature;
  model.updateMatrixWorld(true);const inverse=model.matrixWorld.clone().invert(),textures=new Map();
  for(const [slot,id]of Object.entries(appearance.stickers)) {
    if(id==='none')continue;const projection=projector(model,slot);if(!projection)continue;
    const ray=new THREE.Raycaster(projection.origin.clone().applyMatrix4(model.matrixWorld),projection.direction.clone().transformDirection(model.matrixWorld));
    const hit=ray.intersectObjects(projection.meshes,false)[0];if(!hit)continue;
    const normal=hit.face.normal.clone().applyMatrix3(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld)).normalize();
    if(normal.dot(ray.ray.direction)>0)normal.negate();
    const orientation=new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),normal));
    const geometry=new DecalGeometry(hit.object,hit.point.clone().addScaledVector(normal,.025),orientation,new THREE.Vector3(projection.size,projection.size,.18));
    const positions=geometry.attributes.position,normals=geometry.attributes.normal;
    for(let i=0;i<positions.count;i++)positions.setXYZ(i,positions.getX(i)+normals.getX(i)*.008,positions.getY(i)+normals.getY(i)*.008,positions.getZ(i)+normals.getZ(i)*.008);
    geometry.applyMatrix4(inverse);
    if(!textures.has(id))textures.set(id,textureFactory(id));
    const material=new THREE.MeshBasicMaterial({map:textures.get(id),color:ghost?'#83e5df':'#ffffff',transparent:true,opacity:ghost?.22:1,alphaTest:.03,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,side:THREE.DoubleSide});
    const sticker=new THREE.Mesh(geometry,material);sticker.name=`sticker-${slot}`;sticker.userData.design=id;group.add(sticker);
  }
  model.add(group);
}
