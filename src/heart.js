// 心臓と血液循環: 3D と操作の本体。計算は heart-model.js、形は heart-field.js、材質は heart-materials.js
import {T, createStage, drawDraftingPlate, REDUCED_MOTION} from './stage.js';
import {createIcons, Box, PanelTop, PanelLeft, LayoutGrid, ScanEye, RotateCcw} from 'lucide';
import {mountNavigation, EMBED} from './navigation.js';
import {polygonizeRaw, toGeometry} from './marching.js';
import {buildField, FIELD_BOUNDS, PARTS} from './heart-field.js';
import {stateAt, cycleTiming, strokeVolume, aorticPressure, PRESETS, HR_MIN, HR_MAX} from './heart-model.js';
import {uniforms, createHeartMaterial, createSchematicMaterial, createOutlineMaterial, createCapMaterial, createStencilMaterials} from './heart-materials.js';
import {buildVessels, buildOrgans, buildSegments, buildValves, buildConduction, PART_INFO, LABELS, INNER_LABELS} from './heart-build.js';
import {createFlow} from './heart-flow.js';
import {createHistory, drawMonitor, drawChart, buildSchematic, buildPhaseList} from './heart-ui.js';
import './style.css';
import './lab.css';

mountNavigation('heart');
createIcons({icons: {Box, PanelTop, PanelLeft, LayoutGrid, ScanEye, RotateCcw}});
const $ = (id) => document.getElementById(id);
const VIEWS = {front: [[0, 2, 56], [0, 0.5, 0]], left: [[56, 4, 3], [0, 0.5, 0]], top: [[0.01, 62, 0.01], [0, 0, 0]], macro: [[7, 6, 14], [0.2, 1.6, 0.3]]};
const HOME = {position: [18, 8, 56], target: [0, 0.8, -0.6]};
const stage = createStage({...HOME, floor: -16.3, views: VIEWS, minDistance: 7, maxDistance: 95});
const plateMat = drawDraftingPlate(stage.drafting, {radius: 24, hex: 2.3, opacity: 0});
const SURFACE = new T.Color(0x1d1916), PAPER = new T.Color(0xf1e9d8);

// ---- 状態 ----
let hr = 70, tempo = 1, playing = !REDUCED_MOTION, simT = 0, mode = 'solid', cutZ = 0.6, stepTarget = null, selected = null, hovered = null, clean = false;
const toggles = {flow: true, conduction: true, labels: !EMBED && innerWidth > 760};   // 埋め込み（ショーケース・サムネイル）と狭い画面では、はじめは名前を出さない
let state = stateAt(0, hr);

// ---- 舞台 ----
const heartGroup = new T.Group(); stage.group.add(heartGroup);
const plane = new T.Plane(new T.Vector3(0, 0, -1), 30);        // z ≤ constant を残す。遠くに置けば何も切れない
const vessels = buildVessels(stage.group);
['aorta', 'vc', 'aorta', 'aorta', 'aorta', 'vc', 'pa', 'pa', 'pv', 'pv', 'pv', 'pv'].forEach((p, i) => stage.pick(vessels.group.children[i], p));
const organs = buildOrgans(stage.group);
organs.group.children.forEach((m, i) => stage.pick(m, i < 2 ? 'lung' : 'body'));
const segments = buildSegments();
const flow = createFlow(stage.group, segments, EMBED ? 900 : 1400);
flow.material.clippingPlanes = [plane];
const valves = buildValves(heartGroup);
for (const v of valves.valves) {stage.pick(v.group, v.id); v.group.traverse((o) => (o.renderOrder = 2));}
for (const v of valves.valves) v.chords.forEach((c) => stage.pick(c.line, v.id));
valves.materials.forEach((m) => (m.clippingPlanes = [plane]));
const conduction = buildConduction(heartGroup);
conduction.material.clippingPlanes = [plane];
conduction.group.children.forEach((m, i) => stage.pick(m, i >= 14 ? (i === 14 ? 'sa' : 'av') : i < 3 ? 'sa' : 'purkinje'));
// 線画モードの寸法線
const dims = new T.Group(); dims.visible = false; stage.group.add(dims);
{
  const lm = new T.LineBasicMaterial({color: 0x3a2f28});
  const seg = (a, b) => dims.add(new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(...a), new T.Vector3(...b)]), lm));
  seg([-6.2, -6.6, 2.2], [-6.2, 5.6, 2.2]); seg([-6.6, -6.6, 2.2], [-5.8, -6.6, 2.2]); seg([-6.6, 5.6, 2.2], [-5.8, 5.6, 2.2]);
  seg([-4.6, -7.6, 2.2], [4.6, -7.6, 2.2]); seg([-4.6, -8.0, 2.2], [-4.6, -7.2, 2.2]); seg([4.6, -8.0, 2.2], [4.6, -7.2, 2.2]);
  stage.label('高さ 約12 cm', [-7.4, -0.5, 2.2], dims, null, 'dimension-label'); stage.label('幅 約9 cm', [0, -8.6, 2.2], dims, null, 'dimension-label');
}

// ---- 心臓の本体（別スレッドで形を計算し、できたら組み立てる）----
const heartMat = createHeartMaterial(), schematicMat = createSchematicMaterial(), outlineMat = createOutlineMaterial();
heartMat.clippingPlanes = [plane]; schematicMat.clippingPlanes = [plane]; outlineMat.clippingPlanes = [plane];
const stencil = createStencilMaterials(plane);
const capMat = createCapMaterial();
let chamberMesh, outlineMesh, stencilGroup, cap, heartReady = false;
function assemble(raw) {
  const geo = toGeometry(raw);
  const partAt = (hit) => Object.keys(PARTS)[Math.round(hit.object.geometry.attributes.part.getX(hit.face.a))];
  chamberMesh = new T.Mesh(geo, heartMat); chamberMesh.castShadow = true; chamberMesh.receiveShadow = true; heartGroup.add(chamberMesh); stage.pick(chamberMesh, partAt);
  outlineMesh = new T.Mesh(geo, outlineMat); outlineMesh.visible = false; heartGroup.add(outlineMesh);
  stencilGroup = new T.Group(); stencilGroup.visible = false; heartGroup.add(stencilGroup);
  for (const m of [stencil.back, stencil.front]) {const s = new T.Mesh(geo, m); s.renderOrder = 1; stencilGroup.add(s);}
  cap = new T.Mesh(new T.PlaneGeometry(44, 44), capMat); cap.renderOrder = 1.1; cap.visible = false; cap.onAfterRender = (r) => r.clearStencil(); stage.group.add(cap);
  heartReady = true;
  $('assembly').textContent = '';
  applyMode(mode, true);
  startOpening();
}
try {
  const worker = new Worker(new URL('./heart-worker.js', import.meta.url), {type: 'module'});
  worker.onmessage = (e) => {assemble(e.data); worker.terminate();};
  worker.onerror = () => {worker.terminate(); assembleOnMainThread();};
  worker.postMessage({step: 0.17});
} catch {assembleOnMainThread();}
function assembleOnMainThread() {
  const F = buildField();
  assemble(polygonizeRaw(F.field, {...FIELD_BOUNDS, step: 0.19, attributes: {names: ['part', 'lobe', 'vess'], sizes: [2, 4, 1], at: (x, y, z) => F.classify(x, y, z)}}));
}
$('assembly').textContent = 'かたちを計算中';

// ---- 登場: 図面が描かれ、心臓がふくらんで現れ、血管と臓器が後から続く ----
let opening = REDUCED_MOTION ? 1 : 0;
const fadeMats = [...vessels.materials, organs.glass, ...organs.group.children.filter((m) => m.material.vertexColors).map((m) => m.material)];
const fadeTarget = new Map(fadeMats.map((m) => [m, m.opacity]));
heartGroup.scale.setScalar(REDUCED_MOTION ? 1 : 0.001); fadeMats.forEach((m) => (m.opacity = REDUCED_MOTION ? fadeTarget.get(m) : 0));
plateMat.uniforms.uOpacity.value = REDUCED_MOTION ? 0.18 : 0;
let openingStarted = REDUCED_MOTION;
function startOpening() {openingStarted = true;}

// ---- ラベル（部位から外へ引き出し線を引き、文字は外側に置く）----
const labelObjs = [], leaderPts = [];
const leaderMat = new T.LineBasicMaterial({color: 0xefe7d9, transparent: true, opacity: 0.4});
function addLabel(part, text, target, anchor, inner) {
  const obj = stage.label(`${text}<small>${PART_INFO[part]?.en ?? ''}</small>`, anchor, stage.group, () => select(part, true));
  obj.element.dataset.part = part; obj.userData.inner = inner; obj.userData.leader = leaderPts.length / 6; labelObjs.push(obj);
  leaderPts.push(...target, ...anchor); return obj;
}
LABELS.forEach(([p, t, target, anchor]) => addLabel(p, t, target, anchor, false));
INNER_LABELS.forEach(([p, t, target, anchor]) => addLabel(p, t, target, anchor, true));
const leaderGeo = new T.BufferGeometry(); leaderGeo.setAttribute('position', new T.Float32BufferAttribute(leaderPts, 3));
const leaders = new T.LineSegments(leaderGeo, leaderMat); stage.group.add(leaders);
const leaderVisible = new Float32Array(leaderPts);
const sv2 = new T.Vector3();
function layoutLabels() {
  const host = stage.renderer.domElement, W = host.clientWidth, H = host.clientHeight, items = [];
  const pos = leaderGeo.attributes.position; let anyLeader = false;
  for (const o of labelObjs) {
    const show = toggles.labels && !clean && (!o.userData.inner || mode === 'xray' || mode === 'section') && opening > 0.6;
    o.visible = show;
    const k = o.userData.leader * 6;
    for (let j = 0; j < 6; j++) pos.array[k + j] = show ? leaderVisible[k + j] : 0;   // 隠すときは線を点にする
    if (!show) continue; anyLeader = true;
    sv2.copy(o.position).project(stage.camera);
    items.push({o, x: ((sv2.x + 1) / 2) * W, y: ((1 - sv2.y) / 2) * H, w: o.element.offsetWidth || 80, dy: 0});
  }
  pos.needsUpdate = true; leaders.visible = anyLeader;
  items.sort((a, b) => a.y - b.y);
  for (let i = 0; i < items.length; i++) {
    let dy = 0;
    for (let j = 0; j < i; j++) {
      const a = items[j], b = items[i];
      if (Math.abs(a.x - b.x) < (a.w + b.w) / 2 + 8 && Math.abs(a.y + a.dy - b.y) < 32) dy = Math.max(dy, a.y + a.dy + 32 - b.y);
    }
    items[i].dy = dy; items[i].o.element.style.marginTop = dy ? `${dy}px` : '';
    items[i].o.element.setAttribute('aria-pressed', String(items[i].o.element.dataset.part === selected));
  }
}

// ---- 表示モード ----
let bgMix = 0, xrayMix = 0, cutCurrent = 30;
function applyMode(m, instant = false) {
  mode = m;
  document.querySelectorAll('[data-render]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.render === m)));
  document.querySelector('.viewport').classList.toggle('paper', m === 'schematic');
  if (!heartReady) return;
  const schematic = m === 'schematic';
  chamberMesh.material = schematic ? schematicMat : heartMat;
  outlineMesh.visible = schematic; dims.visible = schematic;
  stencilGroup.visible = m === 'section'; cap.visible = m === 'section';
  heartMat.depthWrite = m !== 'xray';
  uniforms.uVesselAlpha.value = m === 'xray' ? 0.75 : 0.55;
  if (instant) {xrayMix = m === 'xray' ? 1 : 0; bgMix = schematic ? 1 : 0; cutCurrent = m === 'section' ? cutZ : 30;}
  organs.group.visible = true;
  $('run-status').textContent = playing ? (tempo < 0.999 ? `スロー ${tempoLabel()}` : '実時間で再生中') : '停止中';
}
const MODES = ['solid', 'xray', 'section', 'schematic'];
document.querySelectorAll('[data-render]').forEach((b) => (b.onclick = () => applyMode(b.dataset.render)));

// ---- 選択とハイライト ----
const FOCUS = {
  lv: [[11, -1, 17], [1.5, -2, 0.5]], rv: [[-8, -1, 17], [-2, -1.2, 1.5]], la: [[10, 7, 15], [1.7, 3.1, -1.7]], ra: [[-10, 6, 15], [-2.3, 2.8, -0.5]],
  aorta: [[9, 11, 17], [2, 6, -1.5]], pa: [[-7, 9, 17], [-0.9, 5, 0.5]], vc: [[-11, 5, 17], [-2.1, 3, -1]], pv: [[13, 6, 11], [6, 3.3, -3]],
  lung: [[20, 9, 20], [10.6, 4.3, -2.3]], body: [[7, -8, 24], [0, -13, -2.5]],
  mitral: [[7, 5, 13], [1.5, 1.5, -0.9]], tricuspid: [[-5, 4, 13], [-2.1, 1.1, 0.5]], aortic: [[5, 6, 12], [0.3, 2.1, 0.6]], pulmonary: [[-4, 6, 13], [-1.3, 2, 1.65]],
  sa: [[-7, 8, 13], [-2.1, 4.2, -1.4]], av: [[-4, 4, 13], [-0.7, 1.6, -0.3]], purkinje: [[3, -2, 15], [0.5, -2.5, 0.5]],
};
const INTERNAL = new Set(['mitral', 'tricuspid', 'aortic', 'pulmonary', 'sa', 'av', 'purkinje']);
function describe(part) {
  const info = PART_INFO[part] || PART_INFO.heart;
  $('part-name').textContent = info.name; $('part-description').textContent = info.desc; $('part-fact').innerHTML = `<b>POINT</b>${info.fact}`;
  document.querySelectorAll('#part-selector button').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.part || 'heart') === (part || 'heart'))));
}
function select(part, fly = true) {
  selected = part;
  describe(part);
  if (part && INTERNAL.has(part) && (mode === 'solid' || mode === 'schematic')) applyMode('xray');
  if (part && FOCUS[part] && fly) stage.flyTo(...FOCUS[part]);
  else if (!part && fly) stage.flyTo(HOME.position, HOME.target);
}
stage.onPick((part) => select(part, true));
stage.onHover((part) => {hovered = part; stage.renderer.domElement.style.cursor = part ? 'pointer' : '';});
const SELECTOR = ['heart', 'lv', 'rv', 'la', 'ra', 'aorta', 'pa', 'vc', 'pv', 'mitral', 'tricuspid', 'aortic', 'pulmonary', 'sa', 'av', 'purkinje', 'lung', 'body'];
$('part-selector').innerHTML = SELECTOR.map((p) => `<button type="button" data-part="${p === 'heart' ? '' : p}" aria-pressed="${p === 'heart'}">${p === 'heart' ? '全体' : PART_INFO[p].name.replace(/（.*）/, '')}</button>`).join('');
document.querySelectorAll('#part-selector button').forEach((b) => (b.onclick = () => select(b.dataset.part || null, true)));

// ---- 操作パネル ----
function tempoLabel() {return tempo >= 0.995 ? '1×' : tempo >= 0.45 ? `${tempo.toFixed(1)}×` : `1/${Math.round(1 / tempo)}`;}
function setHr(v, fromPreset) {
  const old = cycleTiming(hr).rr; hr = Math.round(Math.min(HR_MAX, Math.max(HR_MIN, v)));
  const rr = cycleTiming(hr).rr; simT = (simT % old) / old * rr + Math.floor(simT / old) * rr;   // 位相を保つ
  history.reset();
  $('hr').value = hr; $('hr-value').innerHTML = `${hr}<small>bpm</small>`; $('bpm-big').textContent = hr;
  const sv = strokeVolume(hr), ao = aorticPressure(hr);
  $('sv').innerHTML = `${Math.round(sv.sv)}<small>mL</small>`; $('co').innerHTML = `${sv.cardiacOutput.toFixed(1)}<small>L/分</small>`;
  $('bp').innerHTML = `${Math.round(ao.systolic)}/${Math.round(ao.diastolic)}<small>mmHg</small>`; $('rr').innerHTML = `${rr.toFixed(2)}<small>秒</small>`;
  const preset = fromPreset || PRESETS.find((p) => p.hr === hr)?.id;
  document.querySelectorAll('[data-preset]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.preset === preset)));
  $('preset-note').textContent = preset ? PRESETS.find((p) => p.id === preset).note : hr < 90 ? '副交感神経（迷走神経）が優位。洞房結節の興奮の頻度は低い。' : hr < 130 ? '副交感神経の抑制がゆるみ、交感神経が働き始める。' : '交感神経が優位。ノルアドレナリンで洞房結節の興奮の頻度が上がる。';
  schematic.setTempo(hr, tempo, playing);
}
$('hr').oninput = (e) => setHr(+e.target.value);
document.querySelectorAll('[data-preset]').forEach((b) => (b.onclick = () => setHr(PRESETS.find((p) => p.id === b.dataset.preset).hr, b.dataset.preset)));
function setTempo(v) {tempo = Math.pow(50, v - 1); $('tempo').value = v; $('tempo-value').innerHTML = tempo >= 0.995 ? '1<small>×</small>' : tempo >= 0.45 ? `${tempo.toFixed(1)}<small>×</small>` : `1/${Math.round(1 / tempo)}`; applyMode(mode); schematic.setTempo(hr, tempo, playing);}
$('tempo').oninput = (e) => setTempo(+e.target.value);
function setPlaying(p) {playing = p; stepTarget = null; $('play').textContent = playing ? '停止' : '再生'; applyMode(mode); schematic.setTempo(hr, tempo, playing);}
$('play').onclick = () => setPlaying(!playing);
$('step').onclick = () => {const rr = cycleTiming(hr).rr; stepTarget = (Math.floor(simT / rr + 1e-6) + 1) * rr; playing = true; $('play').textContent = '停止';};
for (const key of ['flow', 'conduction', 'labels']) {$(`show-${key}`).checked = toggles[key]; $(`show-${key}`).onchange = (e) => (toggles[key] = e.target.checked);}
const phaseList = buildPhaseList($('phase-list'), (phase) => {
  const tm = cycleTiming(hr), starts = {1: 0, 2: tm.ejectStart, 3: tm.ventEnd, 4: tm.relaxEnd, 0: tm.atrialStart};
  simT = Math.floor(simT / tm.rr) * tm.rr + starts[phase] + 0.002; setPlaying(false); history.reset();
  if (mode === 'solid' || mode === 'schematic') applyMode('xray');
});
const schematic = buildSchematic($('schematic'));
const history = createHistory(2.6);
setHr(70, 'rest'); setTempo(1); $('play').textContent = playing ? '停止' : '再生';
document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => document.querySelectorAll('[data-view]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)))));

// UI を隠す（きれいな画面録画のため）
function setClean(c) {clean = c; document.querySelector('.viewport').classList.toggle('clean', c);}
$('ui-restore').onclick = () => setClean(false);
addEventListener('keydown', (e) => {
  if (e.target instanceof Element && e.target.matches('input,select,textarea') ) return;          // 入力中は何もしない
  if (e.target instanceof Element && e.target.matches('button') && e.key === ' ') return;          // ボタンの上の space はボタンに任せる
  if (e.key === ' ') {e.preventDefault(); setPlaying(!playing);}
  else if (e.key === 'r' || e.key === 'R') applyMode(MODES[(MODES.indexOf(mode) + 1) % MODES.length]);
  else if (e.key === 'h' || e.key === 'H') setClean(!clean);
  else if (e.key === 'Escape') select(null, true);
  else if (/^[1-5]$/.test(e.key)) document.querySelectorAll('[data-view]')[+e.key - 1]?.click();
});

// ---- 毎フレーム ----
const LA_MAX = 70, LA_MIN = 30;
const flash = [0, 0, 0, 0];
let lastPhase = -1, lastAv = null, lastSl = null;
const ecgCanvas = $('ecg'), chartCanvas = $('chart');
stage.animate((dt) => {
  // 登場
  if (openingStarted && opening < 1) {
    opening = Math.min(1, opening + dt / 1.6);
    const e = 1 - Math.pow(1 - Math.min(1, opening * 1.3), 3);
    heartGroup.scale.setScalar(0.001 + 0.999 * e);
    plateMat.uniforms.uOpacity.value = 0.18 * Math.min(1, opening * 2);
    const late = Math.max(0, (opening - 0.45) / 0.55);
    fadeMats.forEach((m) => (m.opacity = fadeTarget.get(m) * late));
  } else if (!openingStarted) plateMat.uniforms.uOpacity.value = Math.min(0.18, plateMat.uniforms.uOpacity.value + dt * 0.15);

  // 時間
  if (playing) {
    simT += dt * tempo;
    if (stepTarget !== null && simT >= stepTarget) {simT = stepTarget; setPlaying(false);}
  }
  state = stateAt(simT, hr);
  history.push(simT, state);

  // 拍動（部屋ごとの縮み）と興奮の光
  const c = (state.volumes.edv - state.volumes.lv) / (state.volumes.edv - state.volumes.esv), ca = (LA_MAX - state.volumes.la) / (LA_MAX - LA_MIN);
  uniforms.uLobeScale.value[0] = uniforms.uLobeScale.value[1] = 1 - 0.13 * c;
  uniforms.uLobeScale.value[2] = uniforms.uLobeScale.value[3] = 1 - 0.1 * ca;
  const seg = state.conduction.segment, pr = state.conduction.progress;
  const targetA = toggles.conduction ? (seg === 'atrium' ? 0.9 * Math.sin(pr * Math.PI) + 0.2 : seg === 'av' ? 0.25 : 0) : 0;
  const targetV = toggles.conduction ? (seg === 'ventricle' ? 0.9 * Math.sin(pr * Math.PI) + 0.3 : seg === 'purkinje' ? 0.15 : 0) : 0;
  const k = Math.min(1, dt * 20);
  flash[2] += (targetA - flash[2]) * k; flash[3] += (targetA - flash[3]) * k; flash[0] += (targetV - flash[0]) * k; flash[1] += (targetV - flash[1]) * k;
  uniforms.uFlash.value = flash;
  const inside = mode === 'xray' || mode === 'section';
  conduction.group.visible = toggles.conduction && inside && opening > 0.5;
  for (const v of valves.valves) v.group.visible = inside;
  for (const v of valves.valves) v.chords.forEach((c) => (c.line.visible = inside));
  if (toggles.conduction) conduction.update(state.conduction);
  valves.update(state.valves, dt);
  flow.update(state, playing ? dt * tempo : 0, toggles.flow && opening > 0.3);

  // 表示モードの移り変わり（背景の色、透け具合、切る位置）
  const want = mode === 'schematic' ? 1 : 0; bgMix += (want - bgMix) * Math.min(1, dt * 5);
  stage.scene.background.copy(SURFACE).lerp(PAPER, bgMix);
  leaderMat.color.setRGB(0.94 - 0.72 * bgMix, 0.9 - 0.72 * bgMix, 0.85 - 0.69 * bgMix);
  xrayMix += ((mode === 'xray' ? 1 : 0) - xrayMix) * Math.min(1, dt * 6);
  heartMat.opacity = 1 - 0.7 * xrayMix;
  uniforms.uInnerMix.value = mode === 'solid' ? 0 : 1;
  cutCurrent += ((mode === 'section' ? cutZ : 30) - cutCurrent) * Math.min(1, dt * 4);
  plane.constant = cutCurrent; if (cap) cap.position.z = cutCurrent;
  const dimTarget = hovered || selected ? 1 : 0; uniforms.uDim.value += (dimTarget - uniforms.uDim.value) * Math.min(1, dt * 8);
  uniforms.uHighlight.value = hovered && PARTS[hovered] ? PARTS[hovered].id : -1;
  uniforms.uSelected.value = selected && PARTS[selected] ? PARTS[selected].id : -1;

  // 2D
  if (state.phase !== lastPhase) {lastPhase = state.phase; $('phase-name').textContent = state.phaseName; phaseList.update(state.phase);}
  if (state.valves.mitral !== lastAv) {lastAv = state.valves.mitral; $('v-av').classList.toggle('open', lastAv);}
  if (state.valves.aortic !== lastSl) {lastSl = state.valves.aortic; $('v-sl').classList.toggle('open', lastSl);}
  $('live-dot').style.transform = `scale(${1 + 0.5 * c})`;
  if (!clean) {drawMonitor(ecgCanvas, history, simT); if (!EMBED) drawChart(chartCanvas, history, simT, state);}
  schematic.update(state);
  layoutLabels();
});
// 開発用: ブラウザのコンソールから材質やユニフォームを触れるようにする
window.__dbg = {stage, uniforms, heartMat, get chamberMesh() {return chamberMesh;}, applyMode, select, setHr, setTempo, setPlaying, getState: () => state};
