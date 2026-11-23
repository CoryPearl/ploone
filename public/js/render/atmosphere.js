import * as THREE from 'three';
export const SUN_DIRECTION=new THREE.Vector3(-.24,.24,-.94).normalize();
export const HORIZON_COLOR='#dcdcc5';

export class Atmosphere {
  constructor(scene) {
    const geometry=new THREE.SphereGeometry(9000,24,12);
    const material=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,fog:false,toneMapped:false,
      uniforms:{zenith:{value:new THREE.Color('#79afb9')},horizon:{value:new THREE.Color(HORIZON_COLOR)},sunDirection:{value:SUN_DIRECTION}},
      vertexShader:'varying vec3 direction; void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader:`varying vec3 direction;
        uniform vec3 zenith; uniform vec3 horizon; uniform vec3 sunDirection;
        void main(){
          vec3 d=normalize(direction); float height=pow(max(0.0,d.y),0.55);
          vec3 color=mix(horizon,zenith,height);
          float glow=pow(max(0.0,dot(d,sunDirection)),32.0);
          color=mix(color,vec3(1.0,0.79,0.45),glow*0.22*smoothstep(0.0,0.15,d.y));
          gl_FragColor=vec4(color,1.0);
          #include <colorspace_fragment>
        }`
    });
    this.sky=new THREE.Mesh(geometry,material);this.sky.renderOrder=-20;this.sky.frustumCulled=false;scene.add(this.sky);
    const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
    const context=canvas.getContext('2d'),gradient=context.createRadialGradient(64,64,0,64,64,64);
    gradient.addColorStop(0,'rgba(255,250,205,1)');gradient.addColorStop(.28,'rgba(255,246,185,1)');gradient.addColorStop(.32,'rgba(255,223,143,.8)');gradient.addColorStop(.52,'rgba(255,210,122,.23)');gradient.addColorStop(1,'rgba(255,201,115,0)');
    context.fillStyle=gradient;context.fillRect(0,0,128,128);
    this.sun=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(canvas),transparent:true,depthWrite:false,depthTest:true,fog:false,toneMapped:false}));
    this.sun.scale.set(1150,1150,1);this.sun.renderOrder=-10;scene.add(this.sun);
    const birdShape=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-5,0,0),new THREE.Vector3(0,-1.5,0),new THREE.Vector3(5,0,0)]);
    const birds=new THREE.Group(),birdMat=new THREE.LineBasicMaterial({color:'#526b65',transparent:true,opacity:.7});
    for(let i=0;i<9;i++){const bird=new THREE.Line(birdShape,birdMat);bird.position.set((i%3)*19,Math.floor(i/3)*5,Math.floor(i/3)*15);birds.add(bird);}
    this.birds=birds;scene.add(birds);
  }
  update(camera,position,origin,time) {
    this.sky.position.copy(camera.position);this.sun.position.copy(camera.position).addScaledVector(SUN_DIRECTION,7000);
    const tile=6000;
    this.birds.position.set(Math.round(position.x/tile)*tile+Math.sin(time*.035)*350-origin.x,
      750+Math.sin(time*.1)*25-origin.y,Math.round(position.z/tile)*tile-500+Math.cos(time*.04)*300-origin.z);
    this.birds.rotation.y=time*.025;
    this.birds.children.forEach((bird,index)=>{bird.scale.y=.6+Math.sin(time*4+index*.7)*.35;});
  }
}
