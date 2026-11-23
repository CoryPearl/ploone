import * as THREE from 'three';
import { LANDMARK_CELL, ROTOR_SPEED, ROTOR_OFFSET_Z } from '../core/landmarks.js';
import { VillageBuilder, releaseVillage } from './village.js';
import { turbineBladeGeometry } from './turbine.js';

const standard=color=>new THREE.MeshStandardMaterial({color,roughness:.85,flatShading:true});
function part(group,name,geometry,material,x=0,y=0,z=0) {const object=new THREE.Mesh(geometry,material);object.name=name;object.position.set(x,y,z);object.receiveShadow=true;group.add(object);return object;}
function balloonGeometry(variant) {
  const geometry=new THREE.SphereGeometry(1,12,8).toNonIndexed(),positions=geometry.getAttribute('position'),colors=[];
  const palettes=[['#d67b4e','#f0c876','#f8e8b7'],['#6b9e98','#efe1b3','#4f7b78'],['#bb665c','#edb17d','#f0d9ad']];
  for(let i=0;i<positions.count;i+=3) {
    const x=positions.getX(i)+positions.getX(i+1)+positions.getX(i+2),z=positions.getZ(i)+positions.getZ(i+1)+positions.getZ(i+2);
    const angle=Math.atan2(x,z),stripe=Math.floor((angle+Math.PI)/(Math.PI*2)*12);
    const color=new THREE.Color(palettes[variant][((stripe%3)+3)%3]);
    for(let v=0;v<3;v++)colors.push(color.r,color.g,color.b);
  }
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));return geometry;
}

export class LandmarkRenderer {
  constructor(scene) {
    this.scene=scene;this.objects=new Map();this.templates=new Map();
    this.materials={white:standard('#e5e0cd'),red:standard('#bd6954'),stone:standard('#a48f6c'),wall:standard('#ddc9a2'),roof:standard('#a56349'),basket:standard('#88704c'),dark:standard('#52645c')};
    this.materials.beacon=new THREE.MeshStandardMaterial({color:'#ff9c6a',emissive:'#ef693a',emissiveIntensity:.8});
    this.envelope=new THREE.MeshStandardMaterial({vertexColors:true,flatShading:true,roughness:.9});
    this.materials.blade = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: .85 });
    this.materials.boulder = standard('#ffffff');
    this.boulderGeometry = new THREE.DodecahedronGeometry(1, 0);
    this.dummy = new THREE.Object3D();
    this.villages = new VillageBuilder(this.materials);
  }
  template(type,variant) {
    const key=`${type}:${type==='balloon'?variant:0}`;if(this.templates.has(key))return this.templates.get(key);
    const group=new THREE.Group(),m=this.materials;
    if(type==='balloon') {
      part(group,'envelope',balloonGeometry(variant),this.envelope).scale.set(25,31,25);
      part(group,'neck',new THREE.CylinderGeometry(6,3.5,7,8),m.red,0,-28,0);
      part(group,'basket',new THREE.BoxGeometry(9,6,9),m.basket,0,-35,0);
      const points=[];for(const x of [-4,4])for(const z of [-4,4])points.push(x,-27,z,x,-33,z);
      const rope=new THREE.BufferGeometry();rope.setAttribute('position',new THREE.Float32BufferAttribute(points,3));group.add(new THREE.LineSegments(rope,new THREE.LineBasicMaterial({color:'#806d4e'})));
    } else if(type==='wind') {
      part(group,'foundation',new THREE.BoxGeometry(22,1,22),m.stone);
      part(group,'mast',new THREE.CylinderGeometry(3.1,6,1,12),m.white);
      part(group,'nacelle',new THREE.BoxGeometry(10,8,20),m.white);
      const rotor=new THREE.Group();rotor.name='rotor';group.add(rotor);
      const hub=part(rotor,'hub',new THREE.SphereGeometry(4.7,10,6),m.white);hub.scale.z=1.25;
      const geometry=turbineBladeGeometry();
      for(let i=0;i<3;i++) {
        const blade=new THREE.Group();blade.rotation.z=-i*Math.PI*2/3;rotor.add(blade);
        part(blade,'blade',geometry,m.blade);
      }
    } else if(type==='tower') {
      const mast=new THREE.Group();mast.name='mast';group.add(mast);
      for(let i=0;i<6;i++){const lower=8-i*1.05,upper=8-(i+1)*1.05;part(mast,'stripe',new THREE.CylinderGeometry(upper,lower,1/6,4),i%2?m.white:m.red,0,(i+.5)/6,0);}
      part(group,'beacon',new THREE.SphereGeometry(3,6,4),m.beacon);
      part(group,'foundation',new THREE.BoxGeometry(22,4,22),m.wall,0,1,0);
    }
    this.templates.set(key,group);return group;
  }
  outcrop(item, world) {
    const group = new THREE.Group(); group.name = 'boulder-outcrop';
    const stones = new THREE.InstancedMesh(this.boulderGeometry, this.materials.boulder, item.rocks.length); stones.name = 'boulders';
    const palette = world.style.palette;
    item.rocks.forEach((rock, index) => {
      this.dummy.position.set(rock.x - item.x, rock.y - item.y, rock.z - item.z);
      this.dummy.rotation.set(0, rock.yaw, 0); this.dummy.scale.set(rock.width / 2, rock.height / 2, rock.depth / 2);
      this.dummy.updateMatrix(); stones.setMatrixAt(index, this.dummy.matrix);
      const color = palette.rock.map((channel, i) => THREE.MathUtils.lerp(channel, palette.rockLight[i], .16 + index * .1));
      stones.setColorAt(index, new THREE.Color().setRGB(...color, THREE.SRGBColorSpace));
    });
    stones.receiveShadow = true; stones.computeBoundingSphere(); group.add(stones); return group;
  }
  setField(field) {this.field=field;this.objects.forEach(object=>{releaseVillage(object);this.scene.remove(object);});this.objects.clear();this.cell=null;}
  update(position,origin,time,quality='high') {
    if(!this.field)return;
    const radius=quality==='low'?2:3,cx=Math.floor(position.x/LANDMARK_CELL),cz=Math.floor(position.z/LANDMARK_CELL),key=`${cx}:${cz}:${radius}`;
    if(this.cell!==key) {
      this.cell=key;const items=this.field.nearby(position,radius),wanted=new Set(items.map(item=>item.id));
      for(const [id,object] of this.objects)if(!wanted.has(id)){releaseVillage(object);this.scene.remove(object);this.objects.delete(id);}
      for(const item of items)if(!this.objects.has(item.id)) {
        const object=item.type==='village'?this.villages.build(item,this.field.world):item.type==='outcrop'?this.outcrop(item,this.field.world):this.template(item.type,item.variant).clone(true);object.userData.item=item;
        if(item.type==='wind'){const mast=object.getObjectByName('mast');mast.scale.y=item.height;mast.position.y=item.height/2;object.getObjectByName('rotor').position.set(0,item.height,ROTOR_OFFSET_Z);object.getObjectByName('nacelle').position.set(0,item.height,2);}
        if(item.type==='tower'){object.getObjectByName('mast').scale.y=item.height;object.getObjectByName('beacon').position.y=item.height+3;}
        if(item.type==='wind'||item.type==='tower') {
          const foundation=object.getObjectByName('foundation'),depth=item.footing?.depth||8;
          foundation.scale.y=depth/(item.type==='tower'?4:1);foundation.position.y=-depth/2;
        }
        this.scene.add(object);this.objects.set(item.id,object);
      }
    }
    for(const object of this.objects.values()) {
      const item=object.userData.item;object.position.set(item.x-origin.x,item.y-origin.y,item.z-origin.z);
      object.visible=Math.hypot(item.x-position.x,item.z-position.z)<this.scene.fog.far+160;
      if(item.type==='village')for(const child of object.children)if(child.userData.detail)child.visible=Math.hypot(item.x-position.x,item.z-position.z)<(quality==='low'?900:1600);
      if(item.type==='balloon')object.position.y+=Math.sin(time*.45+item.phase)*2;
      if(item.type==='wind')object.getObjectByName('rotor').rotation.z=-(time*ROTOR_SPEED+item.phase);
    }
    this.materials.beacon.emissiveIntensity=.6+Math.max(0,Math.sin(time*3))*1.3;
  }
}
