// ミツバチのからだ: 3D と操作の本体。計算は model.js、形と説明は build.js
import {T, createStage, drawDraftingPlate, REDUCED_MOTION} from '../lib/stage.js';
import {createIcons, Box, PanelTop, PanelLeft, LayoutGrid, ScanEye, RotateCcw} from 'lucide';
import {mountNavigation, EMBED} from '../lib/navigation.js';
import {createPaperMode} from '../lib/paper.js';
import {buildBee, PART_INFO, LABELS, INNER_LABELS, MAT} from './build.js';
import {PARTS, explodeOffset, explodeWorld, wingPose, wingTip, WINGBEAT_HZ, FOREWING_MM, noteName, audible} from './model.js';
import '../lib/style.css';
import '../lib/lab.css';

mountNavigation('bee');
createIcons({icons: {Box, PanelTop, PanelLeft, LayoutGrid, ScanEye, RotateCcw}});
const $ = (id) => document.getElementById(id);
const HOME = {position: [22, 11, 30], target: [-1.5, -0.8, 0]};
const VIEWS = {front: [[26, 3, 0.01], [0, -0.5, 0]], side: [[-2, 4, 28], [-1.5, -0.5, 0]], top: [[0.01, 30, 0.01], [-1.5, 0, 0]], macro: [[10, 2.5, 7], [4, 0.3, 0]]};
const stage = createStage({...HOME, floor: -4.95, views: VIEWS, minDistance: 5, maxDistance: 70, fov: 32});
const plateMat = drawDraftingPlate(stage.drafting, {radius: 15, hex: 1.55, opacity: 0});
const SURFACE = new T.Color(0x1d1916), PAPER = new T.Color(0xf1e9d8);

// ---- 状態 ----
let explode = REDUCED_MOTION ? 0 : 1, explodeTarget = 0, flying = false, hover = 0, wingPhase = 0, tempo = 1 / 50, playing = true, mode = 'solid', clean = false, selected = null, hovered = null;
const toggles = {labels: !EMBED && innerWidth > 760, guides: true, trail: true};

// ---- 舞台 ----
const body = new T.Group(); stage.group.add(body);
const bee = buildBee(body);
const PART_BY_ID = Object.fromEntries(PARTS.map((p) => [p.id, p]));
const infoKey = (id) => (id && id.startsWith('abdomen') ? 'abdomen' : id);
for (const [id, g] of Object.entries(bee.parts)) stage.pick(g, infoKey(id));
bee.organs.children.forEach((o) => stage.pick(o, o.userData.part));
for (const g of Object.values(bee.parts)) g.children.forEach((c) => (c.userData.basePos = c.position.clone()));
const shellMaterials = new Set();
body.traverse((o) => {if (o.isMesh && !o.userData.hair && o.parent !== bee.organs && !bee.organs.getObjectById(o.id)) shellMaterials.add(o.material);});
bee.organs.traverse((o) => {if (o.isMesh) shellMaterials.delete(o.material);});
const paper = createPaperMode(body, {skip: (m) => m.userData.hair || m.material === MAT.wing, width: 0.05});
const hairMeshes = []; body.traverse((o) => {if (o.userData.hair) hairMeshes.push(o);});

// 組み立ての線（分解したとき、部位からもとの位置へ点線を引く）
const guideTargets = [];
for (const p of PARTS) {
  const g = bee.parts[p.id]; if (!g || p.distance === 0) continue;
  if (p.mirror) g.children.filter((c) => !c.userData.ghost && (c.userData.chain === 0 || c.userData.chain === undefined) && !c.isInstancedMesh).forEach((c) => guideTargets.push({obj: c, part: p, child: true}));
  else guideTargets.push({obj: g, part: p, child: false});
}
const guideGeo = new T.BufferGeometry(); guideGeo.setAttribute('position', new T.Float32BufferAttribute(new Float32Array(guideTargets.length * 6), 3));
const guides = new T.LineSegments(guideGeo, new T.LineDashedMaterial({color: 0xefe7d9, transparent: true, opacity: 0.45, dashSize: 0.35, gapSize: 0.25})); guides.visible = false; stage.group.add(guides);
const wa = new T.Vector3(), wb = new T.Vector3();
function updateGuides() {
  const show = toggles.guides && explode > 0.02 && !clean;
  guides.visible = show; if (!show) return;
  const pos = guideGeo.attributes.position;
  guideTargets.forEach((t, i) => {
    // 線の始点は「いまの親の位置での、もとの座席」（頭についた部位は頭といっしょに動く）
    const po = t.part.parent ? explodeWorld(PART_BY_ID[t.part.parent], explode) : [0, 0, 0];
    if (t.child) {wa.copy(t.obj.userData.basePos); wa.x += po[0]; wa.y += po[1]; wa.z += po[2]; t.obj.parent.localToWorld(wa); t.obj.getWorldPosition(wb);}
    else {wa.copy(t.obj.userData.base); wa.x += po[0]; wa.y += po[1]; wa.z += po[2]; t.obj.parent.localToWorld(wa); t.obj.getWorldPosition(wb);}
    pos.setXYZ(i * 2, wa.x, wa.y, wa.z); pos.setXYZ(i * 2 + 1, wb.x, wb.y, wb.z);
  });
  pos.needsUpdate = true; guides.computeLineDistances();
}
function applyExplode(t) {
  for (const p of PARTS) {
    const g = bee.parts[p.id]; if (!g) continue;
    if (p.mirror) for (const c of g.children) {
      const side = Math.sign(c.userData.basePos.z || c.userData.side || 1), k = 1 + 0.14 * (c.userData.chain || 0);
      const own = explodeOffset(p, t, side), po = p.parent ? explodeWorld(PART_BY_ID[p.parent], t, side) : [0, 0, 0];
      c.position.set(c.userData.basePos.x + own[0] * k + po[0], c.userData.basePos.y + own[1] * k + po[1], c.userData.basePos.z + own[2] * k + po[2]);
    } else {const off = explodeWorld(p, t); g.position.set(g.userData.base.x + off[0], g.userData.base.y + off[1], g.userData.base.z + off[2]);}
  }
}

// ---- ラベル（部位といっしょに動く）----
const labelObjs = [], leaderPts = [];
const leaderMat = new T.LineBasicMaterial({color: 0xefe7d9, transparent: true, opacity: 0.4});
function addLabel(part, text, target, anchor, inner) {
  const obj = stage.label(`${text}<small>${PART_INFO[part]?.en ?? ''}</small>`, anchor, stage.group, () => select(part, true));
  obj.element.dataset.part = part; obj.userData = {inner, target: new T.Vector3(...target), anchor: new T.Vector3(...anchor), leader: leaderPts.length / 6}; labelObjs.push(obj); leaderPts.push(...target, ...anchor); return obj;
}
LABELS.forEach(([p, t, target, anchor]) => addLabel(p, t, target, anchor, false));
INNER_LABELS.forEach(([p, t, target, anchor]) => addLabel(p, t, target, anchor, true));
const leaderGeo = new T.BufferGeometry(); leaderGeo.setAttribute('position', new T.Float32BufferAttribute(leaderPts, 3));
const leaders = new T.LineSegments(leaderGeo, leaderMat); stage.group.add(leaders);
const labelPartId = (part) => (part === 'abdomen' ? 'abdomen3' : part);
const sv2 = new T.Vector3(), tmpOff = new T.Vector3();
function layoutLabels() {
  const host = stage.renderer.domElement, W = host.clientWidth, H = host.clientHeight, items = [], pos = leaderGeo.attributes.position; let any = false;
  for (const o of labelObjs) {
    const show = toggles.labels && !clean && (!o.userData.inner || (mode === 'xray' && explode < 0.35)) && hover < 0.001 || (toggles.labels && !clean && !o.userData.inner && hover < 0.001);
    o.visible = show; const k = o.userData.leader * 6;
    if (!show) {for (let j = 0; j < 6; j++) pos.array[k + j] = 0; continue;}
    any = true;
    const pdef = PART_BY_ID[labelPartId(o.element.dataset.part)];
    const off = pdef ? explodeWorld(pdef, explode, Math.sign(o.userData.target.z || 1)) : [0, 0, 0];
    tmpOff.set(...off);
    o.position.copy(o.userData.anchor).add(tmpOff).add(body.position);
    const tgt = o.userData.target.clone().add(tmpOff).add(body.position);
    pos.setXYZ(o.userData.leader * 2, tgt.x, tgt.y, tgt.z); pos.setXYZ(o.userData.leader * 2 + 1, o.position.x, o.position.y, o.position.z);
    sv2.copy(o.position).project(stage.camera);
    if (!o.userData.w) o.userData.w = o.element.offsetWidth || 0;
    items.push({o, x: ((sv2.x + 1) / 2) * W, y: ((1 - sv2.y) / 2) * H, w: o.userData.w || 80, dy: 0});
  }
  pos.needsUpdate = true; leaders.visible = any;
  items.sort((a, b) => a.y - b.y);
  for (let i = 0; i < items.length; i++) {
    let dy = 0;
    for (let j = 0; j < i; j++) {const a = items[j], b = items[i]; if (Math.abs(a.x - b.x) < (a.w + b.w) / 2 + 8 && Math.abs(a.y + a.dy - b.y) < 32) dy = Math.max(dy, a.y + a.dy + 32 - b.y);}
    items[i].dy = dy; items[i].o.element.style.marginTop = dy ? `${dy}px` : '';
    items[i].o.element.setAttribute('aria-pressed', String(items[i].o.element.dataset.part === selected));
  }
}

// ---- ハイライト（部位の外側に色のついた殻をかぶせる）----
const hullMat = new T.ShaderMaterial({uniforms: {uColor: {value: new T.Color(0xf2c14e)}, uWidth: {value: 0.09}}, vertexShader: 'uniform float uWidth;void main(){vec3 p=position+normalize(normal)*uWidth;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}', fragmentShader: 'uniform vec3 uColor;void main(){gl_FragColor=vec4(uColor,0.85);}', side: T.BackSide, transparent: true, depthWrite: false});
const hulls = {};
function hullsFor(part) {
  if (hulls[part]) return hulls[part];
  const list = [];
  const roots = part === 'abdomen' ? [1, 2, 3, 4, 5, 6].map((i) => bee.parts[`abdomen${i}`]) : bee.parts[part] ? [bee.parts[part]] : bee.organs.children.filter((o) => o.userData.part === part);
  for (const r of roots) r.traverse((o) => {if (o.isMesh && !o.isInstancedMesh && !o.userData.noPaper && o.material !== MAT.wing && o.material !== paper.outline) {const h = new T.Mesh(o.geometry, hullMat); h.visible = false; h.userData.noPaper = true; h.renderOrder = 5; o.add(h); list.push(h);}});
  hulls[part] = list; return list;
}
let hullShown = null;
function showHull(part) {
  if (hullShown === part) return;
  if (hullShown) hullsFor(hullShown).forEach((h) => (h.visible = false));
  hullShown = part; if (part) hullsFor(part).forEach((h) => (h.visible = true));
}

// ---- 表示モード ----
let bgMix = 0;
function applyMode(m) {
  mode = m;
  document.querySelectorAll('[data-render]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.render === m)));
  document.querySelector('.viewport').classList.toggle('paper', m === 'schematic');
  paper.set(m === 'schematic');
  for (const mat of shellMaterials) {mat.transparent = m === 'xray'; mat.opacity = m === 'xray' ? 0.26 : 1; mat.depthWrite = m !== 'xray'; mat.needsUpdate = true;}
  hairMeshes.forEach((h) => (h.visible = m === 'solid'));
  bee.organs.visible = m === 'xray';
}
const MODES = ['solid', 'xray', 'schematic'];
document.querySelectorAll('[data-render]').forEach((b) => (b.onclick = () => applyMode(b.dataset.render)));

// ---- 選択 ----
const INTERNAL = new Set(['flightMuscle', 'crop', 'midgut', 'hindgut', 'dorsalVessel', 'trachea', 'nerve', 'venom']);
function describe(part) {
  const info = PART_INFO[part] || PART_INFO.bee;
  $('part-name').textContent = info.name; $('part-description').textContent = info.desc; $('part-fact').innerHTML = `<b>POINT</b>${info.fact}`;
  document.querySelectorAll('#part-selector button').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.part || 'bee') === (part || 'bee'))));
}
function focusPoint(part) {
  const l = [...LABELS, ...INNER_LABELS].find((x) => x[0] === part); if (!l) return null;
  const pdef = PART_BY_ID[labelPartId(part)], off = pdef ? explodeWorld(pdef, explode, Math.sign(l[2][2] || 1)) : [0, 0, 0];
  return new T.Vector3(l[2][0] + off[0], l[2][1] + off[1], l[2][2] + off[2]).add(body.position);
}
function select(part, fly = true) {
  selected = part; describe(part); showHull(hovered || selected);
  if (part && INTERNAL.has(part) && mode !== 'xray') {applyMode('xray'); explodeTarget = 0; $('explode').value = 0;}
  if (part && fly) {const p = focusPoint(part); if (p) stage.flyTo([p.x + 7, p.y + 4, p.z + 9], p.toArray());}
  else if (!part && fly) stage.flyTo(HOME.position, HOME.target);
}
stage.onPick((part) => select(part, true));
stage.onHover((part) => {hovered = part; stage.renderer.domElement.style.cursor = part ? 'pointer' : ''; showHull(hovered || selected);});
const SELECTOR = ['bee', 'head', 'eye', 'ocelli', 'antenna', 'mouth', 'thorax', 'foreleg', 'midleg', 'hindleg', 'forewing', 'hindwing', 'abdomen', 'sting', 'flightMuscle', 'crop', 'midgut', 'hindgut', 'dorsalVessel', 'trachea', 'nerve', 'venom'];
$('part-selector').innerHTML = SELECTOR.map((p) => `<button type="button" data-part="${p === 'bee' ? '' : p}" aria-pressed="${p === 'bee'}">${p === 'bee' ? '全体' : PART_INFO[p].name.replace(/（.*）/, '')}</button>`).join('');
document.querySelectorAll('#part-selector button').forEach((b) => (b.onclick = () => select(b.dataset.part || null, true)));

// ---- 操作 ----
const tempoLabel = () => (tempo >= 0.995 ? '1×' : tempo >= 0.45 ? `${tempo.toFixed(1)}×` : `1/${Math.round(1 / tempo)}`);
function setTempo(v) {tempo = Math.pow(50, v - 1); $('tempo').value = v; $('tempo-value').innerHTML = tempo >= 0.995 ? '1<small>×</small>' : tempo >= 0.45 ? `${tempo.toFixed(1)}<small>×</small>` : `1/${Math.round(1 / tempo)}<small>スロー</small>`; updateBuzz(); updateStatus();}
$('tempo').oninput = (e) => setTempo(+e.target.value);
function setFlying(f) {flying = f; $('fly').textContent = flying ? '翅を休める' : 'はばたく'; updateBuzz(); updateStatus();}
$('fly').onclick = () => setFlying(!flying);
function updateStatus() {
  const f = WINGBEAT_HZ * tempo;
  $('run-status').textContent = !playing ? '停止中' : flying ? (tempo < 0.995 ? `はばたき · スロー ${tempoLabel()}` : 'はばたき · 実時間') : '翅を休めている';
  $('beat-readout').textContent = flying ? `${f < 10 ? f.toFixed(1) : Math.round(f)} 回/秒` : '—';
  $('beat-note').textContent = flying ? (tempo >= 0.995 ? '実時間。翅は扇のように見える' : `画面では ${tempoLabel()} の速さ。本当は 230 回/秒`) : '翅を休めている';
}
$('explode').oninput = (e) => {explodeTarget = +e.target.value; explode = explodeTarget;};
function toggleExplode() {explodeTarget = explodeTarget > 0.5 ? 0 : 1; $('explode').value = explodeTarget;}
for (const key of ['labels', 'guides', 'trail']) {$(`show-${key}`).checked = toggles[key]; $(`show-${key}`).onchange = (e) => (toggles[key] = e.target.checked);}

// 羽音: はばたき数そのままの周波数で鳴らす（スローにすると低くなり、20 Hz を切ると聞こえない）
let audio = null, osc = null, gain = null, buzzing = false;
function updateBuzz() {
  const f = WINGBEAT_HZ * tempo, ok = flying && audible(f);
  $('buzz-note').textContent = !flying ? 'はばたき 230 回/秒 の振動が、そのまま 230 Hz の羽音になる（A♯3 くらいの高さ）。' : !ok ? `画面の速さ（${f.toFixed(1)} 回/秒）では、20 Hz を下回るので音にならない。` : tempo >= 0.995 ? `実時間。230 Hz（${noteName(WINGBEAT_HZ)}）の羽音。` : `画面の速さでは ${Math.round(f)} Hz（${noteName(f)}）に下がって聞こえる。実時間なら 230 Hz（${noteName(WINGBEAT_HZ)}）。`;
  if (!buzzing) return;
  if (!audio) {audio = new (window.AudioContext || window.webkitAudioContext)(); osc = audio.createOscillator(); osc.type = 'sawtooth'; const lp = audio.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1200; gain = audio.createGain(); gain.gain.value = 0; osc.connect(lp); lp.connect(gain); gain.connect(audio.destination); osc.start();}
  if (audio.state === 'suspended') audio.resume();
  osc.frequency.setTargetAtTime(Math.max(20, f), audio.currentTime, 0.05);
  gain.gain.setTargetAtTime(ok ? 0.06 : 0, audio.currentTime, 0.05);
}
$('buzz').onclick = () => {buzzing = !buzzing; $('buzz').setAttribute('aria-pressed', String(buzzing)); $('buzz').textContent = buzzing ? '羽音をとめる' : '羽音を聞く'; if (buzzing && !flying) setFlying(true); if (!buzzing && gain) gain.gain.setTargetAtTime(0, audio.currentTime, 0.05); updateBuzz();};
function setPlaying(p) {playing = p; updateStatus();}
function setClean(c) {clean = c; document.querySelector('.viewport').classList.toggle('clean', c);}
$('ui-restore').onclick = () => setClean(false);
const pressView = (name) => document.querySelectorAll('[data-view]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.view === name)));
document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => pressView(b.dataset.view)));
$('reset-view').addEventListener('click', () => pressView('iso')); pressView('iso');
addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target instanceof Element && e.target.matches('input,select,textarea')) return;
  if (e.target instanceof Element && e.target.matches('button') && e.key === ' ') return;
  if (e.key === ' ') {e.preventDefault(); setPlaying(!playing);}
  else if (e.key === 'e' || e.key === 'E') toggleExplode();
  else if (e.key === 'f' || e.key === 'F') setFlying(!flying);
  else if (e.key === 'r' || e.key === 'R') applyMode(MODES[(MODES.indexOf(mode) + 1) % MODES.length]);
  else if (e.key === 'h' || e.key === 'H') setClean(!clean);
  else if (e.key === 'Escape') select(null, true);
  else if (/^[1-5]$/.test(e.key)) document.querySelectorAll('[data-view]')[+e.key - 1]?.click();
});
setTempo(0); setFlying(false); applyMode('solid'); updateStatus();

// ---- 翅先の軌跡（3D の尾と、下の 2D の 8 の字）----
const TRAIL = 220, trailPos = new Float32Array(TRAIL * 3), trailCol = new Float32Array(TRAIL * 3); let trailN = 0;
const trailGeo = new T.BufferGeometry(); trailGeo.setAttribute('position', new T.BufferAttribute(trailPos, 3)); trailGeo.setAttribute('color', new T.BufferAttribute(trailCol, 3));
const trail = new T.Line(trailGeo, new T.LineBasicMaterial({vertexColors: true, transparent: true, opacity: 0.9})); trail.frustumCulled = false; stage.group.add(trail);
const tipLocal = new T.Vector3(0.2, 0, FOREWING_MM * 0.98), tipWorld = new T.Vector3(), accent = new T.Color(0xf2c14e), tmpC = new T.Color();
function pushTrail(p) {
  trailPos.copyWithin(3, 0, (TRAIL - 1) * 3); trailPos.set([p.x, p.y, p.z], 0); trailN = Math.min(TRAIL, trailN + 1);
  for (let i = 0; i < trailN; i++) {tmpC.copy(mode === 'schematic' ? PAPER : SURFACE).lerp(accent, 1 - i / TRAIL); trailCol.set([tmpC.r, tmpC.g, tmpC.b], i * 3);}
  trailGeo.setDrawRange(0, trailN); trailGeo.attributes.position.needsUpdate = true; trailGeo.attributes.color.needsUpdate = true;
}
const traceCanvas = $('trace');
function drawTrace(phase) {
  const ctx = traceCanvas.getContext('2d'), W = traceCanvas.width, H = traceCanvas.height, cs = getComputedStyle(document.documentElement);
  const ink = cs.getPropertyValue('--ink').trim(), muted = cs.getPropertyValue('--muted').trim(), line = cs.getPropertyValue('--line').trim(), acc = cs.getPropertyValue('--accent').trim();
  ctx.clearRect(0, 0, W, H); const cx = W / 2, cy = H * 0.55, S = W * 0.042;
  ctx.strokeStyle = line; ctx.lineWidth = 1; ctx.setLineDash([3, 5]); ctx.beginPath(); ctx.moveTo(30, cy); ctx.lineTo(W - 30, cy); ctx.stroke(); ctx.setLineDash([]);
  ctx.font = '500 13px JetBrains Mono, monospace'; ctx.fillStyle = muted; ctx.textAlign = 'left'; ctx.fillText('後', 30, cy - 10); ctx.textAlign = 'right'; ctx.fillText('前', W - 30, cy - 10);
  ctx.strokeStyle = ink; ctx.lineWidth = 2.2; ctx.beginPath();
  for (let i = 0; i <= 240; i++) {const [x, y] = wingTip(i / 240); const px = cx + x * S, py = cy - y * S * 2.2; if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);}
  ctx.stroke();
  // 進む向きの矢印（4 か所）
  for (const ph of [0.125, 0.375, 0.625, 0.875]) {
    const [x0, y0] = wingTip(ph - 0.004), [x1, y1] = wingTip(ph + 0.004), px = cx + x1 * S, py = cy - y1 * S * 2.2, ang = Math.atan2(-(y1 - y0) * 2.2, x1 - x0);
    ctx.fillStyle = ink; ctx.beginPath(); ctx.moveTo(px + Math.cos(ang) * 9, py + Math.sin(ang) * 9); ctx.lineTo(px + Math.cos(ang + 2.5) * 9, py + Math.sin(ang + 2.5) * 9); ctx.lineTo(px + Math.cos(ang - 2.5) * 9, py + Math.sin(ang - 2.5) * 9); ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = muted; ctx.textAlign = 'center'; ctx.fillText('前へ振る半周期 ＝ 打ち下ろし', cx, cy + S * 2.6);
  const [x, y] = wingTip(phase % 1); ctx.fillStyle = acc; ctx.beginPath(); ctx.arc(cx + x * S, cy - y * S * 2.2, 6, 0, Math.PI * 2); ctx.fill();
  const pose = wingPose(phase % 1); ctx.fillStyle = ink; ctx.textAlign = 'left'; ctx.font = '500 14px JetBrains Mono, monospace';
  ctx.fillText(`ストローク ${pose.stroke >= 0 ? '+' : ''}${pose.stroke.toFixed(0)}°  翅の立ち ${pose.pitch.toFixed(0)}°`, 30, 26);
}

// ---- 登場: 分解された状態から組み上がる ----
let opening = REDUCED_MOTION ? 1 : 0, openingDelay = 0.5;
plateMat.uniforms.uOpacity.value = REDUCED_MOTION ? 0.18 : 0;
$('assembly').textContent = REDUCED_MOTION ? '' : '組み立て中';
$('explode').value = explode;

// ---- 毎フレーム ----
const REST = {stroke: -0.85, dev: 0.1, pitch: 0}, cur = {l: [0, 0, 0], r: [0, 0, 0]};
const wingRest = new T.Euler();
let simT = 0, lastExplodeShown = -1;
stage.animate((dt) => {
  if (!playing) dt = 0;
  simT += dt;
  // 登場
  if (opening < 1) {
    openingDelay -= dt; plateMat.uniforms.uOpacity.value = Math.min(0.18, plateMat.uniforms.uOpacity.value + dt * 0.25);
    if (openingDelay <= 0) {opening = Math.min(1, opening + dt / 2.2); explode = 1 - (1 - Math.pow(1 - opening, 3)); $('explode').value = explode; if (opening >= 1) $('assembly').textContent = '';}
  } else {
    explode += (explodeTarget - explode) * Math.min(1, dt * 4);
  }
  applyExplode(explode); updateGuides();
  $('assembly').textContent = opening >= 1 ? (explode > 0.01 ? `分解 ${Math.round(explode * 100)}%` : '') : '組み立て中';

  // ホバリング（はばたいているときは少し浮く）
  hover += ((flying ? 1 : 0) - hover) * Math.min(1, dt * 2.5);
  body.position.y = hover * (2.6 + 0.12 * Math.sin(simT * 5.3)); body.rotation.z = hover * 0.03 * Math.sin(simT * 2.1);

  // 翅
  const f = WINGBEAT_HZ * tempo;
  if (flying) wingPhase += dt * f;
  const pose = wingPose(wingPhase % 1), d2r = Math.PI / 180;
  // 右翅の角度 [上下, 前後, ひねり]。左翅は鏡像なので上下と前後の符号を反転する（形は scale.z = -1 で反転済み）
  const target = flying ? [-pose.deviation * d2r, pose.stroke * d2r, pose.pitch * d2r] : [-REST.dev, REST.stroke, REST.pitch];
  const k = flying ? 1 : Math.min(1, dt * 6);
  MAT.wing.opacity = flying && f > 12 ? 0.2 : 0.42;   // 速いときは本体の翅も薄くして、残像といっしょに扇に見せる
  const mirror = (a, side) => (side === 'left' ? [-a[0], -a[1], a[2]] : a);
  for (const sideKey of ['right', 'left']) {
    const c = cur[sideKey[0]]; for (let i = 0; i < 3; i++) c[i] += (target[i] - c[i]) * k;
    for (const set of bee.wingSets[sideKey]) set.forEach((pivot, gi) => {
      if (gi === 0) {const m = mirror(c, sideKey); pivot.rotation.set(m[0], m[1], m[2], 'YXZ'); return;}
      const show = flying && f > 12; pivot.visible = show; if (!show) return;
      const gp = wingPose((wingPhase + gi * 0.2) % 1), m = mirror([-gp.deviation * d2r, gp.stroke * d2r, gp.pitch * d2r], sideKey); pivot.rotation.set(m[0], m[1], m[2], 'YXZ');
    });
  }
  // 翅先の尾（スローのときだけ）
  const slow = flying && f < 15 && toggles.trail && mode !== 'schematic';
  trail.visible = slow || (trailN > 0 && toggles.trail && !flying);
  if (slow) {bee.wingSets.right[0][0].localToWorld(tipWorld.copy(tipLocal)); pushTrail(tipWorld);}
  else if (!flying && trailN > 0) {trailN = Math.max(0, trailN - 2); trailGeo.setDrawRange(0, trailN);}

  // 背脈管の拍動（透視のとき）
  if (bee.organs.visible) bee.organs.traverse((o) => {if (o.userData.ostium) o.scale.setScalar(1 + 0.25 * Math.sin(simT * 4 + o.position.x));});

  // 表示モードの移り変わり
  bgMix += ((mode === 'schematic' ? 1 : 0) - bgMix) * Math.min(1, dt * 5);
  stage.scene.background.copy(SURFACE).lerp(PAPER, bgMix);
  leaderMat.color.setRGB(0.94 - 0.72 * bgMix, 0.9 - 0.72 * bgMix, 0.85 - 0.69 * bgMix); guides.material.color.copy(leaderMat.color);
  $('live-dot').style.transform = `scale(${1 + 0.4 * hover * (0.5 + 0.5 * Math.sin(simT * 6))})`;
  if (!clean && !EMBED) drawTrace(wingPhase);
  layoutLabels();
});
if (import.meta.env.DEV) window.__dbg = {stage, bee, applyMode, select, setFlying, setTempo, get explode() {return explode;}, set explode(v) {explodeTarget = v; explode = v;}};
