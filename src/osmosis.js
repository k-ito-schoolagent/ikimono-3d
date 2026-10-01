// 見本デモ：浸透と細胞。新しいデモはこのファイルと osmosis.html をコピーしてつくる
import {T, createStage, drawDraftingPlate, material, add, REDUCED_MOTION} from './stage.js';
import {createIcons, Box, PanelTop, LayoutGrid, RotateCcw} from 'lucide';
import {mountNavigation} from './navigation.js';
import {relativeVolume, tonicity, lyses, step, ISOTONIC} from './osmosis-model.js';
import './style.css';
import './lab.css';

mountNavigation('osmosis');          // demos.json の id
createIcons({icons: {Box, PanelTop, LayoutGrid, RotateCcw}});
const $ = (id) => document.getElementById(id);
const stage = createStage({position: [9, 5, 14], target: [0, 0.6, 0], floor: -4, views: {front: [[0, 1, 17], [0, 0.6, 0]], top: [[0.01, 18, 0.01], [0, 0, 0]]}, minDistance: 5, maxDistance: 40});
drawDraftingPlate(stage.drafting, {radius: 12, hex: 1.4});

// 3Dの部品: 外液（すりガラスの箱）、細胞（赤い球）、水の粒
const glass = new T.MeshPhysicalMaterial({color: 0xcfd9e6, roughness: 0.4, transparent: true, opacity: 0.18, depthWrite: false, side: T.DoubleSide});
add(new T.BoxGeometry(9, 7, 9), glass, stage.group, [0, 0.5, 0]);
const cellMat = new T.MeshPhysicalMaterial({color: 0xd7363d, roughness: 0.45, clearcoat: 0.4, clearcoatRoughness: 0.4});
const cell = add(new T.SphereGeometry(1.6, 64, 40), cellMat, stage.group, [0, 0.6, 0]); cell.castShadow = true;
stage.pick(cell, 'cell');
const N = 240, water = new T.InstancedMesh(new T.SphereGeometry(0.08, 10, 8), material(0x8ab4e8, 0, 0.5), N); stage.group.add(water);
const drops = Array.from({length: N}, () => ({dir: new T.Vector3().randomDirection(), r: 1.9 + Math.random() * 2.6, phase: Math.random()}));

// 状態
let c = ISOTONIC, volume = 1, playing = !REDUCED_MOTION, burst = 0;
function setConc(v) {
  c = +v; $('conc').value = c; $('conc-value').innerHTML = `${c.toFixed(2)}<small>osmol/L</small>`;
  const t = tonicity(c); $('tonicity').textContent = t.label;
  $('note').textContent = t.water > 0 ? '外液の方がうすいので、水が細胞に入ってふくらむ。' : t.water < 0 ? '外液の方が濃いので、水が細胞から出て縮む。' : '水の出入りはつり合っていて、体積は変わらない。';
  document.querySelectorAll('[data-c]').forEach((b) => b.setAttribute('aria-pressed', String(Math.abs(+b.dataset.c - c) < 1e-9)));
}
$('conc').oninput = (e) => setConc(e.target.value);
document.querySelectorAll('[data-c]').forEach((b) => (b.onclick = () => setConc(b.dataset.c)));
$('play').onclick = () => {playing = !playing; $('play').textContent = playing ? '停止' : '再生'; $('run-status').textContent = playing ? '実時間で再生中' : '停止中';};
$('play').textContent = playing ? '停止' : '再生';
stage.onPick((part) => {if (part) {$('part-name').textContent = '細胞（赤血球）'; $('part-description').textContent = '半透膜である細胞膜に包まれている。体積の約4割は水が出入りしない成分で、残りが水。'; }});
setConc(ISOTONIC);

const m = new T.Matrix4(), p = new T.Vector3();
let time = 0;
stage.animate((dt) => {
  if (playing) {
    time += dt;
    volume = step(volume, c, dt);
    if (lyses(c) && volume > 1.6) burst = Math.min(1, burst + dt * 1.5); else burst = Math.max(0, burst - dt * 2);
  }
  const s = Math.cbrt(volume);
  cell.scale.setScalar(s * (1 - 0.6 * burst)); cellMat.opacity = 1 - 0.7 * burst; cellMat.transparent = burst > 0;
  $('volume').innerHTML = `${volume.toFixed(2)}<small>倍</small>`;
  // 水の粒: 低張なら細胞へ向かい、高張なら細胞から離れる。等張ならその場でゆらぐ
  const w = tonicity(c).water, R = 1.6 * s;
  for (let i = 0; i < N; i++) {
    const d = drops[i]; let r = d.r;
    if (w !== 0 && playing) {d.r -= w * dt * 1.2; if (d.r < R + 0.1) d.r = 4.4; if (d.r > 4.5) d.r = R + 0.15;}
    r = d.r + 0.08 * Math.sin(time * 3 + d.phase * 6.28);
    p.copy(d.dir).multiplyScalar(r); p.y += 0.6;
    m.makeTranslation(p.x, p.y, p.z); water.setMatrixAt(i, m);
  }
  water.instanceMatrix.needsUpdate = true;
});
