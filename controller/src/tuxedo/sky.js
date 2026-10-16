import * as THREE from 'three';

/** Night sky: stars, drifting clouds that swallow the moon as it gets darker, and the moon itself. */
export class NightSky {
  constructor(scene) {
    this.uniforms = { uTime: { value: 0 }, uCloud: { value: 0.3 }, uMoonDir: { value: new THREE.Vector3(0.18, 0.32, -1).normalize() } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }',
      fragmentShader: /* glsl */ `
        uniform float uTime, uCloud; uniform vec3 uMoonDir; varying vec3 vDir;
        float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        float h3(vec3 p){ p = fract(p*0.3183099+0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
        float n2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(h2(i),h2(i+vec2(1,0)),f.x), mix(h2(i+vec2(0,1)),h2(i+vec2(1,1)),f.x), f.y); }
        float fbm(vec2 p){ float s=0.0,a=0.5; for(int i=0;i<5;i++){ s+=a*n2(p); p=p*2.02+7.1; a*=0.5; } return s; }
        void main(){
          vec3 d = normalize(vDir); float h = d.y;
          vec3 col = mix(vec3(0.035,0.04,0.07), vec3(0.008,0.01,0.025), smoothstep(0.0, 0.6, h));
          col = mix(col, vec3(0.02,0.02,0.03), smoothstep(0.0,-0.2,h));
          float mg = max(dot(d, uMoonDir), 0.0);
          col += vec3(0.35,0.42,0.6) * pow(mg, 18.0) * 0.35 * (1.0 - uCloud * 0.7);   // moon haze
          vec3 g = floor(d * 260.0);
          float star = step(0.9965, h3(g)) * (0.5 + 0.5*sin(uTime*2.0 + h3(g+1.0)*50.0));
          float cloud = 0.0;
          if (h > 0.0) {
            vec2 uv = d.xz / (h + 0.15) * 0.9 + vec2(uTime * 0.02, uTime * 0.006);
            float c = fbm(uv);
            cloud = smoothstep(0.62 - uCloud * 0.35, 0.82 - uCloud * 0.2, c) * smoothstep(0.0, 0.12, h);
            vec3 cc = mix(vec3(0.03,0.035,0.05), vec3(0.22,0.25,0.33), pow(mg, 6.0) * (1.0 - uCloud*0.6));  // moonlit edges
            col = mix(col, cc, cloud * 0.9);
          }
          col += vec3(star) * 0.8 * smoothstep(0.02, 0.2, h) * (1.0 - cloud);
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(90, 48, 24), mat);
    this.dome.frustumCulled = false; this.dome.renderOrder = -1;
    scene.add(this.dome);

    // the moon: cratered disc + halo billboard
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#e6e9f2'; g.beginPath(); g.arc(128, 128, 126, 0, 7); g.fill();
    for (const [x, y, r, a] of [[95, 100, 55, 0.5], [165, 80, 40, 0.4], [150, 170, 50, 0.45], [70, 175, 30, 0.35]]) {
      const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(120,128,150,${a})`); gr.addColorStop(1, 'rgba(120,128,150,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
    for (let i = 0; i < 35; i++) { const x = 30 + Math.random() * 196, y = 30 + Math.random() * 196, r = 3 + Math.random() * 10; g.fillStyle = 'rgba(100,105,125,0.3)'; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    this.moon = new THREE.Mesh(new THREE.CircleGeometry(4.2, 48), new THREE.MeshBasicMaterial({ map: tex, transparent: true, fog: false, color: '#ffffff' }));
    this.halo = new THREE.Mesh(new THREE.PlaneGeometry(26, 26), new THREE.ShaderMaterial({
      uniforms: { uA: { value: 1 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform float uA; varying vec2 vUv; void main(){ float r = length(vUv-0.5)*2.0; gl_FragColor = vec4(vec3(0.55,0.62,0.85)*pow(max(1.0-r,0.0),3.0)*0.6*uA, 1.0); }',
    }));
    for (const m of [this.halo, this.moon]) { m.frustumCulled = false; scene.add(m); }
  }
  update(t, camera, cloud) {
    this.uniforms.uTime.value = t;
    this.uniforms.uCloud.value = cloud;
    this.dome.position.copy(camera.position);
    const p = camera.position.clone().addScaledVector(this.uniforms.uMoonDir.value, 85);
    this.moon.position.copy(p); this.moon.quaternion.copy(camera.quaternion);
    this.halo.position.copy(p); this.halo.quaternion.copy(camera.quaternion);
    this.moon.material.color.setScalar(1 - cloud * 0.75);
    this.halo.material.uniforms.uA.value = 1 - cloud * 0.8;
  }
}
