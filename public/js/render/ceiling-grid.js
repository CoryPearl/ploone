import * as THREE from 'three';

const CELL = 75, MAJOR = CELL * 5;
export function ceilingGridOpacity(altitude, ceiling, climbRate = 0, fadeDistance = 220) {
  const distance = Math.max(fadeDistance,Math.max(0,climbRate)*3);
  const t = THREE.MathUtils.clamp(1 - Math.max(0, ceiling - altitude) / distance, 0, 1);
  return t * t * (3 - 2 * t);
}

// A real horizontal surface at the race limit. A snapped world-space pattern
// stays still as the camera moves and the rendering origin shifts.
export class CeilingGrid {
  constructor(scene) {
    this.scene = scene;
    this.material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
      uniforms: { opacity: { value: 0 }, color: { value: new THREE.Color('#f45b53') }, offset: { value: new THREE.Vector2() } },
      vertexShader: `
        varying vec2 gridPosition;
        #include <common>
        #include <logdepthbuf_pars_vertex>
        void main() {
          gridPosition = position.xz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: `
        uniform float opacity;
        uniform vec3 color;
        uniform vec2 offset;
        varying vec2 gridPosition;
        #include <logdepthbuf_pars_fragment>
        float grid(float spacing) {
          vec2 cell = gridPosition / spacing;
          vec2 distanceToLine = abs(fract(cell - 0.5) - 0.5) / max(fwidth(cell), vec2(0.00001));
          return 1.0 - min(min(distanceToLine.x, distanceToLine.y), 1.0);
        }
        void main() {
          #include <logdepthbuf_fragment>
          float edge = 1.0 - smoothstep(1400.0, 2800.0, length(gridPosition + offset));
          float lines = max(grid(${CELL.toFixed(1)}) * 0.38, grid(${MAJOR.toFixed(1)}) * 0.72);
          float alpha = opacity * edge * (lines + 0.012);
          if (alpha < 0.002) discard;
          gl_FragColor = vec4(color, alpha);
          #include <colorspace_fragment>
        }`
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(10000, 10000).rotateX(-Math.PI / 2), this.material);
    this.mesh.name = 'race-ceiling-grid'; this.mesh.visible = false; this.mesh.renderOrder = 4;
    scene.add(this.mesh);
  }
  update(position, origin, ceiling, enabled, climbRate = 0, fadeDistance = 220) {
    const opacity = enabled ? ceilingGridOpacity(position.y, ceiling, climbRate,fadeDistance) : 0;
    this.material.uniforms.opacity.value = opacity; this.mesh.visible = opacity > .005;
    if (!this.mesh.visible) return;
    const x = Math.round(position.x / MAJOR) * MAJOR, z = Math.round(position.z / MAJOR) * MAJOR;
    this.mesh.position.set(x - origin.x, ceiling - origin.y, z - origin.z);
    this.material.uniforms.offset.value.set(x - position.x, z - position.z);
  }
  dispose() { this.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.material.dispose(); }
}
