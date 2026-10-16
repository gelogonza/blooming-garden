import * as THREE from 'three';

// Front-of-head height field in DEF-head bone space (sampled from the skinned mesh):
// rows y = -0.10 .. 0.14 (chin -> crown), cols x = -0.08 .. 0.08, value = surface z (bone +Z = face forward)
const G = [
  [0, 0, 0, 0.091, 0.099, 0.091, 0, 0, 0],
  [0, 0, 0.084, 0.1, 0.102, 0.099, 0.084, 0, 0],
  [0, 0.05, 0.102, 0.11, 0.112, 0.11, 0.102, 0.045, 0],
  [0, 0.087, 0.112, 0.121, 0.121, 0.12, 0.111, 0.086, 0],
  [0, 0.111, 0.122, 0.128, 0.128, 0.127, 0.122, 0.111, 0],
  [0.062, 0.119, 0.129, 0.134, 0.135, 0.133, 0.129, 0.119, 0.063],
  [0.092, 0.123, 0.13, 0.135, 0.135, 0.134, 0.13, 0.122, 0.092],
  [0.077, 0.121, 0.128, 0.132, 0.131, 0.131, 0.128, 0.12, 0.078],
  [0.043, 0.1, 0.115, 0.12, 0.118, 0.119, 0.115, 0.101, 0.042],
  [0, 0.071, 0.091, 0.099, 0.102, 0.101, 0.09, 0.072, 0.013],
  [0, 0, 0.062, 0.068, 0.069, 0.068, 0.062, 0, 0],
];
const X0 = -0.08, X1 = 0.08, Y0 = -0.1, Y1 = 0.14;
function surfaceZ(x, y) {
  const fx = THREE.MathUtils.clamp(((x - X0) / (X1 - X0)) * 8, 0, 8), fy = THREE.MathUtils.clamp(((y - Y0) / (Y1 - Y0)) * 10, 0, 10);
  const i = Math.min(7, Math.floor(fx)), j = Math.min(9, Math.floor(fy)), u = fx - i, v = fy - j;
  const g = (a, b) => G[b][a] || 0.07;
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(g(i, j), g(i + 1, j), u), THREE.MathUtils.lerp(g(i, j + 1), g(i + 1, j + 1), u), v);
}

// decal footprint on the face
const FX0 = -0.068, FX1 = 0.068, FY0 = -0.092, FY1 = 0.105;
const W = 384, H = Math.round(W * (FY1 - FY0) / (FX1 - FX0));
const toC = (x, y) => [((x - FX0) / (FX1 - FX0)) * W, (1 - (y - FY0) / (FY1 - FY0)) * H];

function paint() {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const e = document.createElement('canvas'); e.width = W; e.height = H;      // emissive: pinprick glints only
  const ge = e.getContext('2d'); ge.fillStyle = '#000'; ge.fillRect(0, 0, W, H);

  // bruised, veiny skin around the sockets
  const bruise = (x, y, r) => {
    const [cx, cy] = toC(x, y);
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r);
    gr.addColorStop(0, 'rgba(40,10,20,0.85)'); gr.addColorStop(0.6, 'rgba(60,20,40,0.35)'); gr.addColorStop(1, 'rgba(60,20,40,0)');
    g.fillStyle = gr; g.beginPath(); g.ellipse(cx, cy, r, r * 1.25, 0, 0, 7); g.fill();
  };
  // sunken eye sockets: pitch black, uneven, dripping
  const socket = (x, y, sx, sy, tilt) => {
    const [cx, cy] = toC(x, y);
    g.save(); g.translate(cx, cy); g.rotate(tilt);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, sy);
    gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.82, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(10,0,4,0)');
    g.fillStyle = gr; g.beginPath();
    for (let k = 0; k <= 24; k++) { const a = (k / 24) * Math.PI * 2, j = 1 + (Math.sin(a * 5 + x * 50) * 0.08); g.lineTo(Math.cos(a) * sx * j, Math.sin(a) * sy * j); }
    g.fill();
    // black tears running down
    g.fillStyle = 'rgba(0,0,0,0.85)';
    for (let k = 0; k < 3; k++) { const dx = (k - 1) * sx * 0.45; g.beginPath(); g.moveTo(dx - 3, sy * 0.6); g.quadraticCurveTo(dx + 2, sy * 1.6, dx, sy * (1.8 + k * 0.5)); g.lineTo(dx + 3, sy * 0.6); g.fill(); }
    g.restore();
    // pinprick of light deep inside (the only thing that glows)
    ge.save(); ge.translate(cx + sx * 0.12, cy - sy * 0.05);
    const pe = ge.createRadialGradient(0, 0, 0, 0, 0, 3.5); pe.addColorStop(0, '#fff'); pe.addColorStop(0.35, '#ffe9d0'); pe.addColorStop(1, 'rgba(0,0,0,0)');
    ge.fillStyle = pe; ge.beginPath(); ge.arc(0, 0, 3.5, 0, 7); ge.fill(); ge.restore();
    g.fillStyle = '#e8e2d8'; g.beginPath(); g.arc(cx + sx * 0.12, cy - sy * 0.05, 1.5, 0, 7); g.fill();
  };
  bruise(-0.029, 0.045, 58); bruise(0.029, 0.045, 58);
  // veins
  g.strokeStyle = 'rgba(50,15,35,0.55)'; g.lineWidth = 1.6;
  for (let k = 0; k < 26; k++) {
    const side = k % 2 ? 1 : -1; let [x, y] = toC(side * 0.029, 0.045);
    g.beginPath(); g.moveTo(x, y); let a = Math.random() * Math.PI * 2;
    for (let s = 0; s < 9; s++) { a += (Math.random() - 0.5) * 0.9; x += Math.cos(a) * 9; y += Math.sin(a) * 9; g.lineTo(x, y); }
    g.stroke();
  }
  socket(-0.03, 0.043, 40, 52, 0.25); socket(0.03, 0.043, 40, 52, -0.25);

  // the mouth: torn far too wide, a long black gape with needle teeth
  const [mx, my] = toC(0, -0.038);
  const mw = 0.052 / (FX1 - FX0) * W, mh = 0.04 / (FY1 - FY0) * H;
  const lip = (t, top) => {          // t: -1..1 across the mouth
    const open = Math.cos(t * Math.PI / 2) ** 0.7;
    return my + (top ? -1 : 1) * mh * open + (top ? 0 : mh * 0.15) - Math.abs(t) * mh * 0.2;
  };
  // cracks tearing out to the cheeks
  g.strokeStyle = 'rgba(25,0,8,0.9)'; g.lineWidth = 3;
  for (const s of [-1, 1]) {
    g.beginPath(); g.moveTo(mx + s * mw * 0.95, my); let x = mx + s * mw * 0.95, y = my;
    for (let k = 0; k < 6; k++) { x += s * (9 + Math.random() * 6); y -= 6 + Math.random() * 8; g.lineTo(x, y); }
    g.stroke();
  }
  g.fillStyle = 'rgba(70,10,20,0.6)'; g.beginPath(); g.ellipse(mx, my, mw * 1.15, mh * 1.35, 0, 0, 7); g.fill();   // raw lips
  const gr = g.createRadialGradient(mx, my, 0, mx, my, mw);
  gr.addColorStop(0, '#000'); gr.addColorStop(0.75, '#050002'); gr.addColorStop(1, '#2a0008');
  g.fillStyle = gr; g.beginPath();
  for (let k = 0; k <= 30; k++) { const t = -1 + (k / 30) * 2; g.lineTo(mx + t * mw, lip(t, true)); }
  for (let k = 30; k >= 0; k--) { const t = -1 + (k / 30) * 2; g.lineTo(mx + t * mw, lip(t, false)); }
  g.fill();
  // teeth: thin, uneven, yellowed
  for (const top of [true, false]) {
    for (let k = 0; k < 15; k++) {
      const t = -0.92 + (k / 14) * 1.84, x = mx + t * mw, y = lip(t, top);
      const len = (0.35 + Math.random() * 0.5) * mh * (1 - Math.abs(t) * 0.5), w = 2.5 + Math.random() * 2.5;
      const tg = g.createLinearGradient(x, y, x, y + (top ? len : -len));
      tg.addColorStop(0, '#9a8a64'); tg.addColorStop(0.4, '#ddd3b6'); tg.addColorStop(1, '#f2ecdc');
      g.fillStyle = tg; g.beginPath();
      g.moveTo(x - w, y); g.lineTo(x + w, y); g.lineTo(x + (Math.random() - 0.5) * 3, y + (top ? len : -len)); g.fill();
    }
  }
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace;
  const emissiveMap = new THREE.CanvasTexture(e); emissiveMap.colorSpace = THREE.SRGBColorSpace;
  return { map, emissiveMap };
}

/** Mesh conforming to his head, parented to the head bone. Hidden except during scares. */
export function makeScareFace(headBone) {
  const geo = new THREE.PlaneGeometry(FX1 - FX0, FY1 - FY0, 24, 32);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + (FX0 + FX1) / 2, y = p.getY(i) + (FY0 + FY1) / 2;
    p.setXYZ(i, x, y, surfaceZ(x, y) + 0.003);
  }
  geo.computeVertexNormals();
  const { map, emissiveMap } = paint();
  const mat = new THREE.MeshStandardMaterial({
    map, emissiveMap, emissive: '#ffffff', emissiveIntensity: 1.6, roughnessMap: null, metalness: 0, transparent: true, depthWrite: false,
    roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -4,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 2;
  mesh.visible = false;
  mesh.frustumCulled = false;
  headBone.add(mesh);
  return mesh;
}
