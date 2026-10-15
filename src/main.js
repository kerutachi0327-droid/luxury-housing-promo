// TYPE02 viewer: walk-through / dollhouse / floor plan / exterior, measuring,
// guided tour. Built on three.js; all geometry comes from plan.js.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FLOORS, LEVEL, EXTERIOR, JO, roomArea } from './plan.js';
import { materials, loadManifest, getManifest, setAnisotropy, trackProgress } from './materials.js';
import { buildHouse, inside, ceilingAt } from './build.js';

const $ = id => document.getElementById(id);
const ui = {
  stage: document.querySelector('.stage'), canvas: $('view'), photo: $('photo'), loading: $('loading'), bar: $('loadBar'), loadText: $('loadText'),
  error: $('error'), hint: $('hint'), title: $('sceneTitle'), text: $('sceneText'), eyebrow: $('eyebrow'), views: $('viewPoints'), labels: $('labels'),
  measure: $('measureLabel'), fact: $('fact'), zoom: $('zoomValue'),
};
const EYE = 1.5; // camera height above the floor (m)
const floorById = Object.fromEntries(FLOORS.map(f => [f.id, f]));
const state = { place: 'exterior', mode: 'exterior', photo: false, ready: false, floor: '2F', yaw: 0, pitch: 0, pos: new THREE.Vector3(), fovScale: 1, orbit: { theta: 0, phi: 1.1, dist: 22, target: new THREE.Vector3() }, measuring: false, touring: false };
const isTouch = matchMedia('(pointer: coarse)').matches;
const QUERY = new URLSearchParams(location.search);
const lowPower = QUERY.get('q') === 'low' || (QUERY.get('q') !== 'high' && (isTouch || (navigator.hardwareConcurrency || 8) <= 4));

// ------------------------------------------------------------------ renderer
let renderer, composer, gtao, scene, camera, house, mats, nav, lights = [], skyTex = null, roomEnv = null, skyEnv = null, sun, hemi;
let pixelRatio = Math.min(devicePixelRatio, lowPower ? 1.5 : 2);
const MIN_PR = Math.min(devicePixelRatio, lowPower ? 0.85 : 1);

function initRenderer() {
  renderer = new THREE.WebGLRenderer({ canvas: ui.canvas, antialias: false, powerPreference: 'high-performance' });
  if (!renderer.capabilities.isWebGL2) throw new Error('WebGL2 unavailable');
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setPixelRatio(pixelRatio);
  setAnisotropy(Math.min(8, renderer.capabilities.getMaxAnisotropy()));
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xdfe6ea);
  camera = new THREE.PerspectiveCamera(60, 1, 0.05, 400);
  const pmrem = new THREE.PMREMGenerator(renderer);
  roomEnv = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = roomEnv;
  scene.environmentIntensity = 0.55;
  const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  if (!lowPower) {
    gtao = new GTAOPass(scene, camera, 1, 1);
    gtao.updateGtaoMaterial({ radius: 0.35, distanceExponent: 1.5, thickness: 1.5, scale: 1.1, samples: 16 });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
    gtao.blendIntensity = 0.9;
    composer.addPass(gtao);
  }
  composer.addPass(new OutputPass());
  // lighting
  hemi = new THREE.HemisphereLight(0xf3f6fa, 0x9c9283, 0.35);
  scene.add(hemi);
  sun = new THREE.DirectionalLight(0xfff0dc, 2.6);
  sun.position.set(-14, 16, -8);
  sun.target.position.set(2.1, 2, -6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(lowPower ? 1024 : 2048, lowPower ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 60 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02; sun.shadow.radius = 3;
  scene.add(sun, sun.target);
}

// ------------------------------------------------------------------ loading
function setProgress(done, total, label) {
  const p = total ? done / total : 0;
  ui.bar.style.width = Math.round(p * 100) + '%';
  if (label) ui.loadText.textContent = label;
}
async function loadModels() {
  const man = getManifest();
  const out = {};
  if (!man?.models) return out;
  const loader = new GLTFLoader();
  await Promise.all(Object.entries(man.models).map(async ([id, m]) => {
    try { const g = await loader.loadAsync('assets/lib/' + m.file); out[id] = g.scene; } catch (e) { console.warn('model', id, e); }
  }));
  return out;
}
async function loadSky() {
  const man = getManifest();
  if (!man?.hdri) return;
  try {
    const t = await new HDRLoader().loadAsync('assets/lib/' + man.hdri.file);
    t.mapping = THREE.EquirectangularReflectionMapping;
    skyTex = t;
    const pmrem = new THREE.PMREMGenerator(renderer);
    skyEnv = pmrem.fromEquirectangular(t).texture;
  } catch (e) { console.warn('sky', e); }
}

async function start3D() {
  ui.loading.hidden = false;
  setProgress(0, 1, '3Dモデルを準備しています');
  initRenderer();
  await loadManifest();
  let texDone = 0, texTotal = 0;
  trackProgress((d, t) => { texDone = d; texTotal = t; setProgress(d, t + 2, `素材を読み込み中 ${d}/${t}`); });
  mats = materials();
  const [models] = await Promise.all([loadModels(), loadSky()]);
  const built = buildHouse(mats, models);
  house = built.root; nav = built.nav;
  scene.add(house);
  if (!lowPower) for (const l of built.lightRig) {
    const p = new THREE.PointLight(0xfff0dc, 3.4, 6.5, 2);
    p.position.copy(l.pos); p.userData.floor = l.floor; scene.add(p); lights.push(p);
  }
  buildMarkers();
  // wait for textures (bounded)
  const t0 = performance.now();
  while (texDone < texTotal && performance.now() - t0 < 20000) await new Promise(r => setTimeout(r, 120));
  renderer.compile(scene, camera);
  state.ready = true;
  ui.loading.hidden = true;
  resize();
  requestAnimationFrame(frame);
}

// ------------------------------------------------------------------ visibility
const floorIndex = id => FLOORS.findIndex(f => f.id === id);
function applyVisibility() {
  const m = state.mode, fi = floorIndex(state.floor);
  house.traverse(o => {
    const g = o.userData.group;
    if (!g) return;
    const [fid, part] = g.split(':');
    const idx = floorIndex(fid);
    let v = true;
    if (m === 'dollhouse' || m === 'plan') {
      if (g === 'roof' || g === 'site') v = false;
      else if (fid === 'ext') v = m === 'dollhouse';
      else if (idx >= 0) v = (m === 'plan' ? idx === fi : idx <= fi) && part !== 'ceiling' && part !== 'band';
    } else if (part === 'caps') v = false;
    o.visible = v;
  });
  for (const p of lights) p.intensity = (m === 'walk' || m === 'dollhouse' || m === 'plan') ? (p.userData.floor === state.floor || m === 'walk' ? 3.4 : 0) : 2;
  const outdoor = m === 'exterior';
  scene.environment = outdoor && skyEnv ? skyEnv : roomEnv;
  scene.environmentIntensity = outdoor ? 0.9 : (lowPower ? 1.15 : 0.85);
  hemi.intensity = outdoor ? 0.35 : (lowPower ? 0.9 : 0.35);
  scene.background = skyTex && (m === 'exterior' || m === 'walk') ? skyTex : new THREE.Color(m === 'plan' ? 0xf1efea : 0xe4e8ea);
  scene.backgroundIntensity = 1;
  markers.forEach(mk => { mk.visible = m === 'walk' && mk.userData.floor === state.floor; });
}

// ------------------------------------------------------------------ markers (hotspots)
const markers = [];
let hoverRing;
function buildMarkers() {
  const discGeo = new THREE.RingGeometry(0.16, 0.22, 40); discGeo.rotateX(-Math.PI / 2);
  const fillGeo = new THREE.CircleGeometry(0.16, 40); fillGeo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false });
  const fill = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, depthWrite: false });
  const stairMat = new THREE.MeshBasicMaterial({ color: 0xd6b58b, transparent: true, opacity: 0.95, depthWrite: false });
  for (const f of FLOORS) {
    const pts = f.views.map((v, i) => ({ at: v.eye, kind: 'view', index: i }));
    for (const p of f.portals || []) pts.push({ at: p.at, kind: 'portal', portal: p });
    for (const p of pts) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(discGeo, p.kind === 'portal' ? stairMat : mat), new THREE.Mesh(fillGeo, fill));
      g.position.set(p.at[0], f.level + 0.015, p.at[1]);
      g.userData = { floor: f.id, ...p };
      g.renderOrder = 10;
      markers.push(g); scene.add(g);
    }
  }
  const rg = new THREE.RingGeometry(0.2, 0.24, 48); rg.rotateX(-Math.PI / 2);
  hoverRing = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false }));
  hoverRing.visible = false; hoverRing.renderOrder = 11;
  scene.add(hoverRing);
}

// ------------------------------------------------------------------ collision
function walkable(fid, x, z) {
  const n = nav?.[fid]; if (!n) return false;
  const m = 0.2;
  if (!n.footprint.some(r => x > r[0] + m && x < r[2] - m && z > r[1] + m && z < r[3] - m)) return false;
  return !n.blocked.some(r => inside(r, x, z, m - 0.02));
}

// ------------------------------------------------------------------ camera rig
const anim = { active: false };
function baseFov() { const a = camera.aspect; return a < 1 ? 74 : a < 1.4 ? 66 : 60; }
function walkFov() { return THREE.MathUtils.clamp(baseFov() * state.fovScale, 30, 90); }
function walkCameraState(pos, yaw, pitch) {
  const p = pos.clone();
  const dir = new THREE.Vector3(Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), -Math.cos(pitch) * Math.cos(yaw));
  return { pos: p, target: p.clone().add(dir), fov: walkFov(), up: new THREE.Vector3(0, 1, 0) };
}
function orbitCameraState() {
  const o = state.orbit;
  const p = new THREE.Vector3(o.target.x + o.dist * Math.sin(o.phi) * Math.sin(o.theta), o.target.y + o.dist * Math.cos(o.phi), o.target.z + o.dist * Math.sin(o.phi) * Math.cos(o.theta));
  return { pos: p, target: o.target.clone(), fov: state.mode === 'plan' ? 22 : 42, up: state.mode === 'plan' ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, 1, 0) };
}
function currentCam() {
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
  return { pos: camera.position.clone(), target: camera.position.clone().add(dir.multiplyScalar(state.mode === 'walk' ? 1 : (state.orbit.dist || 10))), fov: camera.fov, up: camera.up.clone() };
}
function animateTo(target, ms = 900, done) {
  anim.from = currentCam(); anim.to = target; anim.t0 = performance.now(); anim.ms = ms; anim.active = true; anim.done = done;
}
const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
function applyCam(c) { camera.position.copy(c.pos); camera.up.copy(c.up); camera.lookAt(c.target); if (camera.fov !== c.fov) { camera.fov = c.fov; camera.updateProjectionMatrix(); } }

function desiredCam() { return state.mode === 'walk' ? walkCameraState(state.pos, state.yaw, state.pitch) : orbitCameraState(); }

// ------------------------------------------------------------------ modes
const PLACE_TEXT = {
  exterior: ['EXTERIOR', 'TYPE02の外観', '3階建て・ビルトインガレージ', 'ドラッグで回転、ホイール・2本指で拡大できます。'],
  '1F': ['FIRST FLOOR', '1階 玄関・サービスルーム', 'サービスルーム5.1帖・5.2帖／玄関・収納・トイレ'],
  '2F': ['SECOND FLOOR', '2階 LDK 20.1帖', 'LDK20.1帖・天井高2.4m／浴室・洗面室'],
  '3F': ['THIRD FLOOR', '3階 主寝室・洋室', '主寝室7.2帖・洋室5.4帖／WIC・前後バルコニー'],
};
function setTexts() {
  const k = state.mode === 'exterior' ? 'exterior' : state.floor;
  const [eb, title, fact] = PLACE_TEXT[k];
  ui.eyebrow.textContent = eb; ui.title.textContent = title; ui.fact.textContent = fact;
  const hints = {
    exterior: 'ドラッグで回転、ホイール・2本指で拡大。建物をタップすると室内へ入れます。',
    walk: isTouch ? '床をタップするとその位置へ移動。指でなぞって見回せます。' : '床をクリックで移動、ドラッグで見回し。W・A・S・Dキーでも歩けます。',
    dollhouse: 'ドラッグで回転。床をタップするとその場所から室内を見られます。',
    plan: '間取りを上から表示しています。部屋をタップすると室内へ移動します。',
  };
  ui.text.textContent = state.photo ? '試作レンダリング画像です。' : hints[state.mode];
  ui.hint.textContent = state.measuring ? '2点をタップすると距離を測れます（もう一度押すと終了）。' : '';
  ui.hint.hidden = !state.measuring;
  for (const b of document.querySelectorAll('[data-place]')) { const on = b.dataset.place === (state.mode === 'exterior' ? 'exterior' : state.floor); b.classList.toggle('active', on); b.setAttribute('aria-pressed', on); }
  for (const b of document.querySelectorAll('[data-mode]')) { const on = b.dataset.mode === state.mode; b.classList.toggle('active', on); b.setAttribute('aria-pressed', on); b.disabled = state.mode === 'exterior' && b.dataset.mode !== 'dollhouse' && b.dataset.mode !== 'walk' ? false : false; }
  $('modeBar').hidden = false;
  renderViewChips();
  updateZoomLabel();
}

function renderViewChips() {
  ui.views.replaceChildren();
  if (state.mode === 'exterior') {
    for (const [label, theta, phi, dist] of [['正面', Math.PI, 1.36, 24], ['右斜め', Math.PI + 0.55, 1.25, 24], ['左斜め', Math.PI - 0.55, 1.25, 24], ['上から', Math.PI - 0.35, 0.55, 30]]) {
      const b = document.createElement('button'); b.textContent = label;
      b.onclick = () => { stopTour(); Object.assign(state.orbit, { theta, phi, dist }); animateTo(orbitCameraState(), 900); };
      ui.views.append(b);
    }
    return;
  }
  const f = floorById[state.floor];
  f.views.forEach((v, i) => {
    const b = document.createElement('button'); b.textContent = v.name;
    b.onclick = () => { stopTour(); goView(f.id, i); };
    ui.views.append(b);
  });
}

function orbitTargetFor(mode, fid) {
  const f = floorById[fid];
  const cx = EXTERIOR.width / 2, cz = -5.8;
  if (mode === 'exterior') return { target: new THREE.Vector3(cx, 4.3, -6.2), theta: Math.PI, phi: 1.36, dist: 24 };
  if (mode === 'plan') return { target: new THREE.Vector3(cx, f.level, cz), theta: Math.PI, phi: 0.0001, dist: 34 };
  return { target: new THREE.Vector3(cx, f.level + 0.8, cz), theta: Math.PI - 0.6, phi: 0.95, dist: 19 };
}

function setMode(mode, opts = {}) {
  stopTour(false);
  if (!state.ready) return;
  if (state.photo) setPhoto(false);
  const prevMode = state.mode;
  state.mode = mode;
  if (opts.floor) state.floor = opts.floor;
  if (mode === 'walk') {
    const f = floorById[state.floor];
    if (!opts.keepPose) {
      const v = f.views[0];
      setWalkPose(f, v.eye, v.look);
    }
  } else {
    const o = orbitTargetFor(mode, state.floor);
    if (!(prevMode === mode && opts.keepAngle)) Object.assign(state.orbit, { theta: o.theta, phi: o.phi, dist: o.dist });
    state.orbit.target.copy(o.target);
    if (mode === 'dollhouse' && prevMode === 'walk') { state.orbit.theta = Math.PI - state.yaw * 0 - 0.6; }
  }
  applyVisibility();
  setTexts();
  hoverRing.visible = false;
  animateTo(desiredCam(), prevMode === mode ? 700 : 1100);
  clearMeasure();
}

function setWalkPose(f, eye, look) {
  state.pos.set(eye[0], f.level + EYE, eye[1]);
  state.yaw = Math.atan2(look[0] - eye[0], -(look[1] - eye[1]));
  state.pitch = -0.06;
}
function goView(fid, i, ms = 1000) {
  const f = floorById[fid];
  const changeFloor = fid !== state.floor || state.mode !== 'walk';
  state.floor = fid;
  const v = f.views[i];
  setWalkPose(f, v.eye, v.look);
  if (changeFloor) { state.mode = 'walk'; applyVisibility(); setTexts(); }
  animateTo(desiredCam(), ms);
}
function moveTo(fid, x, z, keepYaw = true) {
  const f = floorById[fid];
  const from = state.pos.clone();
  const to = new THREE.Vector3(x, f.level + EYE, z);
  const d = from.distanceTo(to);
  if (!keepYaw) state.yaw = Math.atan2(x - from.x, -(z - from.z));
  state.pos.copy(to);
  animateTo(desiredCam(), Math.min(1400, 350 + d * 260));
}
function usePortal(p) {
  const target = floorById[p.to];
  fade(() => {
    state.floor = p.to;
    setWalkPose(target, p.arrive.eye, p.arrive.look);
    applyVisibility(); setTexts();
    applyCam(desiredCam());
  });
}
function fade(mid) {
  ui.stage.classList.add('fading');
  setTimeout(() => { mid(); setTimeout(() => ui.stage.classList.remove('fading'), 60); }, 260);
}

// ------------------------------------------------------------------ input
const pointers = new Map();
let drag = null, pinchDist = 0, moved = 0;
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function pick(ev, filter) {
  const r = ui.canvas.getBoundingClientRect();
  ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const objs = [];
  house.traverse(o => { if (o.isMesh && o.visible && isVisibleChain(o) && (!filter || filter(o))) objs.push(o); });
  for (const m of markers) if (m.visible) objs.push(...m.children);
  const hits = ray.intersectObjects(objs, false).filter(h => !(h.object.material?.transparent && !h.object.parent?.userData?.kind));
  return hits[0] || null;
}
function isVisibleChain(o) { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; }
function floorOfY(y) { let best = null; for (const f of FLOORS) if (y > f.level - 0.3 && y < f.level + 2.2) best = f; return best; }

ui.canvas.addEventListener('pointerdown', e => {
  ui.canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, [e.clientX, e.clientY]);
  drag = [e.clientX, e.clientY]; moved = 0; pinchDist = 0;
  if (state.touring) stopTour();
});
ui.canvas.addEventListener('pointermove', e => {
  if (!state.ready) return;
  if (!pointers.has(e.pointerId)) { if (!isTouch) hover(e); return; }
  pointers.set(e.pointerId, [e.clientX, e.clientY]);
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
    if (pinchDist) zoom(pinchDist / d); pinchDist = d; moved = 99; return;
  }
  if (!drag) return;
  const dx = e.clientX - drag[0], dy = e.clientY - drag[1];
  drag = [e.clientX, e.clientY]; moved += Math.abs(dx) + Math.abs(dy);
  if (anim.active) return;
  if (state.mode === 'walk') {
    const k = (camera.fov / 60) * 0.0042;
    state.yaw -= dx * k; state.pitch = THREE.MathUtils.clamp(state.pitch + dy * k, -1.2, 1.2);
  } else if (state.mode !== 'plan') {
    state.orbit.theta -= dx * 0.006;
    state.orbit.phi = THREE.MathUtils.clamp(state.orbit.phi - dy * 0.005, 0.15, state.mode === 'exterior' ? 1.5 : 1.35);
  } else {
    // pan plan
    const s = state.orbit.dist * 0.0012;
    state.orbit.target.x -= dx * s; state.orbit.target.z -= dy * s;
  }
  hoverRing.visible = false;
});
function endPointer(e) {
  const wasClick = pointers.size === 1 && moved < 8;
  pointers.delete(e.pointerId);
  if (pointers.size === 0) drag = null;
  if (wasClick && e.type === 'pointerup') click(e);
}
ui.canvas.addEventListener('pointerup', endPointer);
ui.canvas.addEventListener('pointercancel', endPointer);
ui.canvas.addEventListener('pointerleave', () => { hoverRing && (hoverRing.visible = false); });
ui.canvas.addEventListener('wheel', e => { e.preventDefault(); stopTour(); zoom(Math.exp(Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY), 120) * 0.0016)); }, { passive: false });

function zoom(f) {
  if (!state.ready) return;
  if (state.mode === 'walk') { state.fovScale = THREE.MathUtils.clamp(state.fovScale * f, 0.5, 1.4); }
  else state.orbit.dist = THREE.MathUtils.clamp(state.orbit.dist * f, state.mode === 'exterior' ? 9 : 6, state.mode === 'plan' ? 60 : 45);
  updateZoomLabel();
}
function updateZoomLabel() {
  if (!camera) return;
  ui.zoom.textContent = state.mode === 'walk' ? `${Math.round(walkFov())}°` : `${Math.round((orbitTargetFor(state.mode, state.floor).dist / state.orbit.dist) * 100)}%`;
}

function hover(e) {
  if (state.mode !== 'walk' || anim.active || state.measuring) { if (hoverRing) hoverRing.visible = false; return; }
  const h = pick(e);
  const f = floorById[state.floor];
  if (h && h.face && h.face.normal && Math.abs(h.point.y - f.level) < 0.2 && walkable(f.id, h.point.x, h.point.z)) {
    hoverRing.position.set(h.point.x, h.point.y + 0.01, h.point.z); hoverRing.visible = true; ui.canvas.style.cursor = 'pointer';
  } else { hoverRing.visible = false; ui.canvas.style.cursor = 'grab'; }
}

function click(e) {
  if (!state.ready || anim.active) return;
  if (state.measuring) { measureClick(e); return; }
  const h = pick(e);
  if (!h) return;
  const mk = h.object.parent?.userData;
  if (mk?.kind === 'portal') { usePortal(mk.portal); return; }
  if (mk?.kind === 'view') { goView(mk.floor, mk.index); return; }
  if (state.mode === 'walk') {
    const f = floorById[state.floor];
    let { x, z } = h.point;
    if (Math.abs(h.point.y - f.level) > 0.2) {
      // clicked a wall/furniture: walk towards it and stop short
      const dir = new THREE.Vector3(x - state.pos.x, 0, z - state.pos.z); const len = dir.length(); dir.normalize();
      let d = len - 0.6; while (d > 0.3 && !walkable(f.id, state.pos.x + dir.x * d, state.pos.z + dir.z * d)) d -= 0.15;
      if (d <= 0.3) return; x = state.pos.x + dir.x * d; z = state.pos.z + dir.z * d;
    } else if (!walkable(f.id, x, z)) return;
    moveTo(f.id, x, z);
    return;
  }
  // exterior / dollhouse / plan: dive into the room that was hit
  const f = state.mode === 'exterior' ? floorOfY(h.point.y) : (floorOfY(h.point.y) || floorById[state.floor]);
  if (!f) return;
  let { x, z } = h.point;
  if (state.mode === 'exterior') { const v = f.views[0]; x = v.eye[0]; z = v.eye[1]; }
  if (!walkable(f.id, x, z)) { const v = nearestView(f, x, z); x = v.eye[0]; z = v.eye[1]; }
  state.floor = f.id; state.mode = 'walk';
  state.pos.set(x, f.level + EYE, z);
  const c = new THREE.Vector3(EXTERIOR.width / 2, 0, -5.8);
  state.yaw = Math.atan2(c.x - x, -(c.z - z)) + (Math.abs(c.z - z) < 1.5 ? Math.PI / 2 : 0);
  state.pitch = -0.05;
  applyVisibility(); setTexts();
  animateTo(desiredCam(), 1300);
}
function nearestView(f, x, z) { return f.views.reduce((b, v) => (Math.hypot(v.eye[0] - x, v.eye[1] - z) < Math.hypot(b.eye[0] - x, b.eye[1] - z) ? v : b)); }

const keys = new Set();
addEventListener('keydown', e => {
  if (e.target instanceof HTMLInputElement || $('info').open) return;
  if (['w', 'a', 's', 'd', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && state.mode === 'walk') { keys.add(e.key); e.preventDefault(); stopTour(); }
  if (e.key === 'Escape' && state.measuring) toggleMeasure();
});
addEventListener('keyup', e => keys.delete(e.key));
addEventListener('blur', () => keys.clear());
function keyMove(dt) {
  if (state.mode !== 'walk' || anim.active) return;
  let f = 0, s = 0;
  if (keys.has('w') || keys.has('ArrowUp')) f += 1;
  if (keys.has('s') || keys.has('ArrowDown')) f -= 1;
  if (keys.has('a')) s -= 1; if (keys.has('d')) s += 1;
  if (keys.has('ArrowLeft')) state.yaw -= dt * 1.4;
  if (keys.has('ArrowRight')) state.yaw += dt * 1.4;
  if (!f && !s) return;
  const sp = 1.3 * dt;
  const dx = (Math.sin(state.yaw) * f + Math.cos(state.yaw) * s) * sp, dz = (-Math.cos(state.yaw) * f + Math.sin(state.yaw) * s) * sp;
  const nx = state.pos.x + dx, nz = state.pos.z + dz;
  if (walkable(state.floor, nx, nz)) { state.pos.x = nx; state.pos.z = nz; }
  else if (walkable(state.floor, nx, state.pos.z)) state.pos.x = nx;
  else if (walkable(state.floor, state.pos.x, nz)) state.pos.z = nz;
}

// ------------------------------------------------------------------ measuring
let mPts = [], mLine = null, mDots = [];
function toggleMeasure() {
  state.measuring = !state.measuring;
  $('measure').classList.toggle('active', state.measuring);
  $('measure').setAttribute('aria-pressed', state.measuring);
  clearMeasure(); setTexts();
}
function clearMeasure() {
  mPts = []; if (mLine) { scene.remove(mLine); mLine = null; } mDots.forEach(d => scene.remove(d)); mDots = []; ui.measure.hidden = true;
}
function measureClick(e) {
  const h = pick(e); if (!h) return;
  if (mPts.length === 2) clearMeasure();
  mPts.push(h.point.clone());
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.025, 16, 12), new THREE.MeshBasicMaterial({ color: 0xd6542d, depthTest: false }));
  dot.position.copy(h.point); dot.renderOrder = 20; scene.add(dot); mDots.push(dot);
  if (mPts.length === 2) {
    const g = new THREE.BufferGeometry().setFromPoints(mPts);
    mLine = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xd6542d, depthTest: false, linewidth: 2 }));
    mLine.renderOrder = 20; scene.add(mLine);
    const d = mPts[0].distanceTo(mPts[1]);
    const dh = Math.hypot(mPts[0].x - mPts[1].x, mPts[0].z - mPts[1].z), dv = Math.abs(mPts[0].y - mPts[1].y);
    ui.measure.innerHTML = `<b>${d.toFixed(2)} m</b><small>水平 ${dh.toFixed(2)} m／高さ ${dv.toFixed(2)} m</small>`;
    ui.measure.hidden = false;
  }
}

// ------------------------------------------------------------------ labels (plan / dollhouse)
const labelEls = [];
function buildLabels() {
  for (const f of FLOORS) for (const r of f.rooms) {
    if (!r.jo && !['玄関', 'ホール', '洗面室', '浴室', 'トイレ', 'WIC'].includes(r.name)) continue;
    const el = document.createElement('div'); el.className = 'room-label';
    const [x1, z1, x2, z2] = r.rect;
    const w = Math.abs(x2 - x1), d = Math.abs(z2 - z1);
    el.innerHTML = r.jo ? `<b>${r.name}</b><span>${r.jo}帖</span><small>約${w.toFixed(1)}×${d.toFixed(1)}m</small>` : `<b>${r.name}</b>`;
    ui.labels.append(el);
    labelEls.push({ el, floor: f.id, pos: new THREE.Vector3((x1 + x2) / 2, f.level + 0.05, (z1 + z2) / 2) });
  }
  const bar = document.createElement('div'); bar.className = 'scale-bar'; bar.innerHTML = '<i></i><span>1m</span>'; ui.labels.append(bar);
  labelEls.scale = bar;
}
const v3 = new THREE.Vector3();
function updateLabels() {
  const show = state.mode === 'plan' || state.mode === 'dollhouse';
  const r = ui.canvas.getBoundingClientRect();
  for (const l of labelEls) {
    const on = show && l.floor === state.floor && !anim.active;
    l.el.hidden = !on;
    if (!on) continue;
    v3.copy(l.pos).project(camera);
    l.el.style.transform = `translate(${(v3.x * 0.5 + 0.5) * r.width}px, ${(-v3.y * 0.5 + 0.5) * r.height}px) translate(-50%,-50%)`;
  }
  const bar = labelEls.scale;
  if (bar) {
    bar.hidden = state.mode !== 'plan' || anim.active;
    if (!bar.hidden) {
      const f = floorById[state.floor];
      const a = new THREE.Vector3(0, f.level, 0).project(camera), b = new THREE.Vector3(1, f.level, 0).project(camera);
      bar.querySelector('i').style.width = Math.abs(b.x - a.x) * 0.5 * r.width + 'px';
    }
  }
  if (!ui.measure.hidden && mPts.length === 2) {
    v3.copy(mPts[0]).add(mPts[1]).multiplyScalar(0.5).project(camera);
    ui.measure.style.transform = `translate(${(v3.x * 0.5 + 0.5) * r.width}px, ${(-v3.y * 0.5 + 0.5) * r.height}px) translate(-50%,-140%)`;
  }
}

// ------------------------------------------------------------------ tour
const TOUR = [
  { mode: 'exterior', theta: Math.PI - 0.5, phi: 1.3, dist: 24, ms: 2200, hold: 1500 },
  { mode: 'exterior', theta: Math.PI + 0.45, phi: 1.2, dist: 21, ms: 3000, hold: 800 },
  { view: ['1F', 0] }, { view: ['1F', 1] }, { view: ['1F', 2] },
  { view: ['2F', 0] }, { view: ['2F', 1] }, { view: ['2F', 2] }, { view: ['2F', 3] }, { view: ['2F', 4] },
  { view: ['3F', 0] }, { view: ['3F', 1] }, { view: ['3F', 2] },
  { mode: 'dollhouse', floor: '3F', ms: 1600, hold: 2500 },
];
let tourTimer = null, tourStep = 0;
function startTour() {
  if (!state.ready) return;
  if (state.touring) { stopTour(); return; }
  state.touring = true; tourStep = 0;
  $('tour').classList.add('active'); $('tour').textContent = 'ツアーを停止';
  $('tourProgress').hidden = false;
  nextTour();
}
function nextTour() {
  if (!state.touring) return;
  if (tourStep >= TOUR.length) { stopTour(); return; }
  const s = TOUR[tourStep++];
  $('tourProgress').firstElementChild.style.width = (tourStep / TOUR.length * 100) + '%';
  let wait = 3600;
  if (s.view) {
    const [fid, i] = s.view;
    if (fid !== state.floor && state.mode === 'walk') { fade(() => { goView(fid, i, 10); }); wait = 3800; }
    else goView(fid, i, 1500);
    // slow look-around while holding
    const yaw0 = state.yaw;
    const t0 = performance.now() + 1500;
    tourPan = { t0, yaw0, amp: 0.35, dur: 2400 };
  } else {
    tourPan = null;
    if (s.mode !== state.mode || s.floor) setMode(s.mode, { floor: s.floor });
    if (s.theta !== undefined) { Object.assign(state.orbit, { theta: s.theta, phi: s.phi, dist: s.dist }); animateTo(orbitCameraState(), s.ms); }
    wait = (s.ms || 1500) + (s.hold || 1500);
  }
  tourTimer = setTimeout(nextTour, wait);
}
let tourPan = null;
function stopTour(updateUi = true) {
  if (!state.touring) return;
  state.touring = false; clearTimeout(tourTimer); tourPan = null;
  $('tour').classList.remove('active'); $('tour').textContent = '自動ツアー ▷';
  $('tourProgress').hidden = true;
  if (updateUi) setTexts();
}

// ------------------------------------------------------------------ frame loop
let last = performance.now(), slowFrames = 0, fastFrames = 0;
function frame(t) {
  const dt = Math.min(0.05, (t - last) / 1000); last = t;
  keyMove(dt);
  if (tourPan && !anim.active && t > tourPan.t0) {
    const u = Math.min(1, (t - tourPan.t0) / tourPan.dur);
    state.yaw = tourPan.yaw0 + Math.sin(u * Math.PI) * tourPan.amp;
  }
  if (anim.active) {
    const u = Math.min(1, (t - anim.t0) / anim.ms), k = ease(u);
    const a = anim.from, b = desiredCamLive(anim.to);
    applyCam({ pos: a.pos.clone().lerp(b.pos, k), target: a.target.clone().lerp(b.target, k), fov: a.fov + (b.fov - a.fov) * k, up: a.up.clone().lerp(b.up, k).normalize() });
    if (u >= 1) { anim.active = false; anim.done?.(); }
  } else applyCam(desiredCam());
  updateLabels();
  composer.render();
  // adaptive resolution
  // (browsers in energy-saver mode cap at 30 fps, so only react to real stalls)
  if (dt > 1 / 22) slowFrames++; else fastFrames++;
  if (slowFrames > 45 && pixelRatio > MIN_PR) { pixelRatio = Math.max(MIN_PR, pixelRatio - 0.25); slowFrames = 0; fastFrames = 0; resize(); }
  else if (slowFrames > 45 && gtao?.enabled) { gtao.enabled = false; slowFrames = 0; }
  if (fastFrames > 240) { fastFrames = 0; slowFrames = 0; }
  requestAnimationFrame(frame);
}
function desiredCamLive(to) { return to; }

function resize() {
  if (!renderer) return;
  const r = ui.stage.getBoundingClientRect();
  const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(w, h, false);
  composer.setPixelRatio(pixelRatio);
  composer.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
new ResizeObserver(resize).observe(document.querySelector('.stage'));

// ------------------------------------------------------------------ photos
const PHOTOS = { exterior: [['昼の外観', 'assets/exterior-day.png'], ['夕方の外観', 'assets/exterior-dusk.png']], '2F': [['リビングから', 'assets/interior.png'], ['ダイニングへ', 'assets/interior-reverse.png']] };
function setPhoto(on) {
  state.photo = on;
  ui.stage.classList.toggle('photo-mode', on);
  ui.photo.hidden = !on; ui.canvas.hidden = on;
  $('photoBtn').classList.toggle('active', on); $('photoBtn').setAttribute('aria-pressed', on);
  if (on) {
    stopTour();
    const set = PHOTOS[state.mode === 'exterior' ? 'exterior' : state.floor] || PHOTOS.exterior;
    ui.photo.src = set[0][1]; ui.views.replaceChildren();
    for (const [label, src] of set) { const b = document.createElement('button'); b.textContent = label; b.onclick = () => { ui.photo.src = src; }; ui.views.append(b); }
    ui.text.textContent = '従来の試作レンダリング画像です。3Dに戻るには「画像」をもう一度押してください。';
  } else { setTexts(); }
}

// ------------------------------------------------------------------ UI wiring
for (const b of document.querySelectorAll('[data-place]')) b.onclick = () => {
  const p = b.dataset.place;
  if (!state.ready) return;
  if (p === 'exterior') setMode('exterior');
  else if (state.mode === 'walk' || state.mode === 'exterior') { state.floor = p; setMode('walk', { floor: p }); }
  else setMode(state.mode, { floor: p });
};
for (const b of document.querySelectorAll('[data-mode]')) b.onclick = () => {
  const m = b.dataset.mode;
  if (m === 'walk' && state.mode !== 'walk') { setMode('walk', { floor: state.floor }); return; }
  setMode(m, { floor: state.floor });
};
$('measure').onclick = () => { if (state.photo) setPhoto(false); toggleMeasure(); };
$('tour').onclick = () => { if (state.photo) setPhoto(false); startTour(); };
$('photoBtn').onclick = () => setPhoto(!state.photo);
$('zoomIn').onclick = () => zoom(0.88);
$('zoomOut').onclick = () => zoom(1 / 0.88);
$('zoomReset').onclick = () => { state.fovScale = 1; const o = orbitTargetFor(state.mode, state.floor); if (state.mode !== 'walk') state.orbit.dist = o.dist; updateZoomLabel(); };
$('fullscreen').onclick = async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch { ui.hint.hidden = false; ui.hint.textContent = 'この端末では全画面表示に対応していません。'; } };
document.addEventListener('fullscreenchange', () => { $('fullscreen').textContent = document.fullscreenElement ? '全画面を終了' : '全画面'; });
const info = $('info');
$('help').onclick = $('details').onclick = () => { stopTour(); info.showModal(); };
$('closeInfo').onclick = $('startExplore').onclick = () => info.close();
info.addEventListener('click', e => { if (e.target === info) info.close(); });
document.querySelector('.brand').onclick = e => { e.preventDefault(); if (state.ready) setMode('exterior'); };
ui.canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); ui.error.hidden = false; });
$('fallback').onclick = () => { ui.error.hidden = true; setPhoto(true); };

// ------------------------------------------------------------------ boot
(async () => {
  try {
    await start3D();
    buildLabels();
    state.mode = 'exterior';
    const o = orbitTargetFor('exterior');
    Object.assign(state.orbit, { theta: Math.PI - 0.35, phi: 1.32, dist: 30 }); state.orbit.target.copy(o.target);
    applyVisibility(); setTexts();
    applyCam(orbitCameraState());
    Object.assign(state.orbit, { theta: o.theta, phi: o.phi, dist: o.dist });
    animateTo(orbitCameraState(), 2200);
    ui.photo.hidden = true; ui.canvas.hidden = false;
    document.body.classList.add('ready');
    if (QUERY.has('tour')) startTour();
    window.__viewer = { state, setMode, goView, camera, scene, renderer, walkable, nav };
  } catch (e) {
    console.error(e);
    ui.loading.hidden = true; ui.error.hidden = false;
    setPhoto(true);
  }
})();
