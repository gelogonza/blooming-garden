import './style.css';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { isSupported, connect, disconnect, send } from './serial.js';
import { HeightField } from './garden/terrain.js';
import { Sky } from './garden/sky.js';
import { Water } from './garden/water.js';
import { KoiSchool } from './garden/koi.js';
import { Garden } from './garden/plants.js';
import { Grass } from './garden/grass.js';
import { Fireflies } from './garden/fireflies.js';
import { Bubbles } from './garden/bubbles.js';
import { toToon, addOutline, GradeShader } from './garden/toon.js';

// ───────────────────────── DOM ─────────────────────────
const $ = (s) => document.querySelector(s);
const ui = {
  connect: $('#connect'), status: $('#status'), mode: $('#mode'),
  lightBar: $('#light-bar'), lightVal: $('#light-val'),
  nearBar: $('#near-bar'), nearVal: $('#near-val'),
  btnDot: $('#btn-dot'), angle: $('#angle-val'), swatch: $('#swatch'), hint: $('#hint'),
};

// ───────────── Input state: hardware and the mouse/keyboard sim share one shape ─────────────
const input = { light: 0.75, near: 0, cm: null, button: false };
// ?day=0..1&near=0..1 pins a state on load: handy for screenshots and demo recordings
const params = new URLSearchParams(location.search);
if (params.has('day')) input.light = THREE.MathUtils.clamp(+params.get('day'), 0, 1);
if (params.has('near')) input.near = THREE.MathUtils.clamp(+params.get('near'), 0, 1);
let mode = 'sim';
let hwReady = false;

const cal = { min: Infinity, max: -Infinity };
function normalize(raw) {
  cal.min = Math.min(cal.min, raw);
  cal.max = Math.max(cal.max, raw);
  return THREE.MathUtils.clamp((raw - cal.min) / Math.max(cal.max - cal.min, 40), 0, 1);
}
const resetCal = () => { cal.min = Infinity; cal.max = -Infinity; };

const NEAR_CM = 10, FAR_CM = 50;   // IR sensor's reliable range -> 1..0 "nearness"
const cmToNear = (cm) => (!cm ? 0 : THREE.MathUtils.clamp(1 - (cm - NEAR_CM) / (FAR_CM - NEAR_CM), 0, 1));

// ───────────────────────── Renderer ─────────────────────────
const canvas = $('#scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 140);
// low, almost eye-level view so the horizon (and the sun setting behind the garden) is in frame
const CAM_HOME = new THREE.Vector3(0, 4.6, 13.5);
const LOOK = new THREE.Vector3(0, 1.5, 0);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.5, 0.55, 0.85);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const grade = new ShaderPass(GradeShader);      // cartoon punch: saturation + contrast, after tone mapping
composer.addPass(grade);

function resize() {
  const w = innerWidth, h = innerHeight;
  // keep renderer and post-processing at the same pixel ratio (it changes when a window moves between screens)
  const pr = Math.min(devicePixelRatio, 1.5);   // bloom + shadows at 2x is wasted GPU on retina
  renderer.setPixelRatio(pr);
  composer.setPixelRatio(pr);
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

const sky = new Sky(scene);
const water = new Water(scene);
const fireflies = new Fireflies(scene);
const bubbles = new Bubbles(scene, (x, z, s) => water.addRing(x, z, s));
let garden = null, koi = null, grass = null, lantern = null, inkMats = [];

// ───────────────────────── Load baked Blender assets ─────────────────────────
ui.status.textContent = 'Growing the garden…';
const loader = new GLTFLoader();
Promise.all([loader.loadAsync('/models/garden.glb'), loader.loadAsync('/models/assets.glb')]).then(([g, a]) => {
  const world = g.scene;
  const spots = [];
  let ground = null, stones = null, lanternAnchor = new THREE.Vector3(2.7, 0.85, 1.5);
  world.traverse((o) => {
    if (o.name.startsWith('Spot_')) spots.push(o.getWorldPosition(new THREE.Vector3()));
    if (o.name === 'LanternLight') lanternAnchor = o.getWorldPosition(new THREE.Vector3());
    if (!o.isMesh) return;
    o.receiveShadow = true;
    o.castShadow = o.name !== 'Ground';
    if (o.name === 'Ground') ground = o;
    if (o.name === 'Stones') stones = o;
    const m = o.material;
    if (m.name === 'M_LanternWindow') {
      o.material = new THREE.MeshStandardMaterial({ color: '#3a2a1a', emissive: '#ffb25e', emissiveIntensity: 0 });
      o.material.name = 'window';
    } else if (m.aoMap) {
      // baked albedo + AO from Blender, re-lit with stepped toon shading and tinted brighter
      const tint = { Ground: '#d2ff9e', Stones: '#e4ecff' }[o.name] || '#fff0dc';
      o.material = toToon(m, tint);
    }
  });
  scene.add(world);

  // ink outlines (inverted hull). Thickness is in each mesh's local units.
  // collect first, then add: adding hull children while traversing would visit them too
  const targets = [];
  world.traverse((o) => { if (o.isMesh && o.material.name !== 'window') targets.push(o); });
  const outlines = [];
  for (const o of targets) {
    const inLantern = o.name.startsWith('Lantern') || o.parent?.name === 'Lantern';
    if (o.name === 'Ground') outlines.push(addOutline(o, 0.035, '#20301a'));
    else if (o.name === 'Stones') outlines.push(addOutline(o, 0.013));
    else if (inLantern) outlines.push(addOutline(o, 0.007));
  }
  inkMats = outlines;

  // lantern: emissive windows + a warm point light that only shows at night
  const lanternLight = new THREE.PointLight('#ffb25e', 0, 4.5, 1.6);
  lanternLight.position.copy(lanternAnchor);
  scene.add(lanternLight);
  const windowMats = [];
  world.traverse((o) => { if (o.isMesh && o.material.name === 'window') windowMats.push(o.material); });
  lantern = { light: lanternLight, windows: windowMats };

  const hf = new HeightField(ground);
  grass = new Grass(scene, hf, stones ? new HeightField(stones) : null);

  const leafGeo = a.scene.getObjectByName('Leaf').geometry;
  const petalGeo = a.scene.getObjectByName('Petal').geometry;
  garden = new Garden(scene, { leafGeo, petalGeo }, spots);
  // start with a garden already half-grown
  const order = spots.map((_, i) => i).sort(() => Math.random() - 0.5);
  order.slice(0, 20).forEach((i) => garden.plantAt(i, true));
  for (const p of garden.plants.values()) p.open = Math.pow(day, 0.8);

  koi = new KoiSchool(scene, a.scene.getObjectByName('Koi'), 6, {
    onRing: (x, z, s) => water.addRing(x, z, s),
    onBubble: (x, y, z) => bubbles.emit(x, y, z),
  });
  ui.status.textContent = mode === 'hardware' ? ui.status.textContent : 'Simulated input';
}).catch((err) => {
  console.error(err);
  ui.status.textContent = 'Could not load models: ' + err.message;
});

// ───────────────────── Simulated input ─────────────────────
canvas.addEventListener('pointermove', (e) => { if (mode === 'sim' && !params.has('day')) input.light = 1 - e.clientY / innerHeight; });
canvas.addEventListener('pointerdown', () => { if (mode === 'sim') input.button = true; });
addEventListener('pointerup', () => { if (mode === 'sim') input.button = false; });
canvas.addEventListener('wheel', (e) => {
  if (mode !== 'sim') return;
  input.cm = THREE.MathUtils.clamp((input.cm ?? FAR_CM) + e.deltaY * 0.05, NEAR_CM, FAR_CM + 10);
  input.near = cmToNear(input.cm);
  e.preventDefault();
}, { passive: false });
addEventListener('keydown', (e) => {
  if (e.code === 'Space' && mode === 'sim') { input.button = true; e.preventDefault(); }
  if (e.code === 'KeyR') resetCal();
});
addEventListener('keyup', (e) => { if (e.code === 'Space' && mode === 'sim') input.button = false; });

// ───────────────────── Hardware connection ─────────────────────
function setMode(next, status) {
  mode = next;
  ui.mode.textContent = next === 'hardware' ? 'LIVE' : 'SIM';
  ui.mode.classList.toggle('live', next === 'hardware');
  ui.connect.textContent = next === 'hardware' ? 'Disconnect' : 'Connect device';
  ui.hint.hidden = next === 'hardware';
  ui.status.textContent = status;
}
if (!isSupported()) {
  ui.connect.disabled = true;
  ui.status.textContent = 'Web Serial needs Chrome or Edge — running simulated';
}
ui.connect.addEventListener('click', async () => {
  if (mode === 'hardware') return disconnect();
  try {
    ui.status.textContent = 'Opening port…';
    await connect({
      onData: ({ raw, button, cm }) => {
        input.light = normalize(raw);
        input.button = button;
        if (cm !== null) { input.cm = cm; input.near = cmToNear(cm); }
      },
      onReady: () => {
        hwReady = true;
        ui.status.textContent = 'Connected — the garden is listening';
        lastAngle = -1;
        if (lastBloom) sendColor(lastBloom);
      },
      onClose: () => {
        hwReady = false;
        input.button = false; input.near = 0; input.cm = null;
        setMode('sim', 'Disconnected — back to simulated');
      },
    });
    resetCal();
    setMode('hardware', 'Waiting for board…');
  } catch (err) {
    setMode('sim', err.name === 'NotFoundError' ? 'Simulated input' : err.message);
  }
});

// ───────────────────── Outputs → hardware ─────────────────────
let lastBloom = null;
function sendColor(hex) {
  if (mode !== 'hardware' || !hwReady) return;
  const c = new THREE.Color(hex);
  send(`C:${(c.r * 255) | 0},${(c.g * 255) | 0},${(c.b * 255) | 0}`);
}

// ───────────────────────── Loop ─────────────────────────
let day = input.light, near = input.near, wasPressed = false;
let lastSent = 0, lastAngle = -1;
const hand = new THREE.Vector2(0.3, 1.9);
const inkNight = new THREE.Color('#0a0f22');
const bloomCam = { plant: null, t: 0, blend: 0, focus: new THREE.Vector3(), offset: null };
const homePos = new THREE.Vector3(), shotPos = new THREE.Vector3(), lookNow = new THREE.Vector3();
const tipNow = new THREE.Vector3(), tmpDir = new THREE.Vector3();       // the hand approaches from the viewer's side of the pond
const timer = new THREE.Timer();

function tick() {
  timer.update();
  const dt = Math.min(timer.getDelta(), 0.05);
  const t = timer.getElapsed();

  // button = sow a seed (edge-detected so holding it plants once)
  if (input.button && !wasPressed && garden) {
    const plant = garden.sow();
    lastBloom = plant.hex;
    sendColor(lastBloom);
    bloomCam.plant = plant;          // fly the camera to it
    bloomCam.t = 0;
  }
  wasPressed = input.button;

  // smoothing: daylight drifts slowly (like real dusk), nearness reacts fast (like a flinch)
  day += (input.light - day) * (1 - Math.exp(-dt * 1.5));
  near += (input.near - near) * (1 - Math.exp(-dt * 7));
  const night = 1 - THREE.MathUtils.smoothstep(day, 0.05, 0.4);

  fireflies.update(t, night, renderer.getPixelRatio());
  if (garden) garden.update(dt, t, day, near);
  if (koi) koi.update(dt, t, near, hand, day);
  if (grass) grass.update(t, near);
  if (lantern) {
    lantern.light.intensity = night * 3.2 * (0.92 + Math.sin(t * 9) * 0.04 + Math.sin(t * 13.7) * 0.04);
    for (const m of lantern.windows) m.emissiveIntensity = night * 4;
  }
  bloom.strength = 0.25 + night * 0.55;
  for (const ink of inkMats) ink.uniforms.uColor.value.set('#20301a').lerp(inkNight, night);

  // camera: slow idle orbit; leans in a little as the visitor approaches
  const az = Math.sin(t * 0.05) * 0.22;
  // tall/narrow windows: back the camera off so the whole diorama stays in frame
  const fit = Math.max(1, Math.pow(1.5 / camera.aspect, 0.75));
  const dolly = (1 - near * 0.15) * fit;
  homePos.set(Math.sin(az) * CAM_HOME.z * dolly, CAM_HOME.y * dolly, Math.cos(az) * CAM_HOME.z * dolly);

  // bloom cam: when a seed is sown, glide in, follow the stem tip as it grows,
  // hold on the open flower, then drift back to the wide shot
  let want = 0;
  if (bloomCam.plant) {
    bloomCam.t += dt;
    const hold = bloomCam.plant.growTime + 2.5;
    if (bloomCam.t < hold) {
      want = 1;
      if (bloomCam.plant.root.parent) bloomCam.plant.tipWorld(tipNow);       // still alive -> track it
      bloomCam.focus.lerp(tipNow, bloomCam.blend < 0.01 ? 1 : 1 - Math.exp(-dt * 3));
    } else if (bloomCam.blend < 0.005) bloomCam.plant = null;
  }
  bloomCam.blend += (want - bloomCam.blend) * (1 - Math.exp(-dt * (want ? 1.4 : 0.9)));
  const e = bloomCam.blend * bloomCam.blend * (3 - 2 * bloomCam.blend);    // smoothstep ease
  if (e > 1e-3) {
    const f = bloomCam.focus;
    tmpDir.set(homePos.x - f.x, 0, homePos.z - f.z).normalize();          // approach from the viewer's side
    if (bloomCam.offset) shotPos.copy(f).add(bloomCam.offset);          // dev: custom framing
    else shotPos.set(f.x + tmpDir.x * 1.8, f.y + 0.7, f.z + tmpDir.z * 1.8);
    shotPos.x += Math.sin(t * 0.3) * 0.12;                                // gentle handheld drift
    camera.position.lerpVectors(homePos, shotPos, e);
    lookNow.lerpVectors(LOOK, f, e);
  } else {
    camera.position.copy(homePos);
    lookNow.copy(LOOK);
  }
  camera.lookAt(lookNow);
  camera.updateMatrixWorld();

  // sky after the camera moves: the dome, sun and moon are placed relative to the eye
  sky.update(day, t, dt, camera);
  water.update(t, sky, near, dt, koi ? koi.wake : []);
  bubbles.update(dt, t, camera, renderer);

  // servo = sundial: follows the sun across the sky
  const angle = Math.round(day * 180);
  if (mode === 'hardware' && hwReady && t - lastSent > 0.05 && angle !== lastAngle) {
    send(`S:${angle}`);
    lastSent = t; lastAngle = angle;
  }

  // HUD
  ui.lightBar.style.width = Math.round(day * 100) + '%';
  ui.lightVal.textContent = Math.round(day * 100) + '%';
  ui.nearBar.style.width = Math.round(near * 100) + '%';
  ui.nearVal.textContent = input.cm ? Math.round(input.cm) + 'cm' : '—';
  ui.btnDot.classList.toggle('on', input.button);
  ui.angle.textContent = angle + '°';
  if (lastBloom) ui.swatch.style.background = lastBloom;

  composer.render();
  requestAnimationFrame(tick);
}

// dev-only handle for testing from the console (stripped from production builds)
if (import.meta.env.DEV) window.shy = { input, bloomCam, water, bubbles, get garden() { return garden; }, get koi() { return koi; } };
requestAnimationFrame(tick);
