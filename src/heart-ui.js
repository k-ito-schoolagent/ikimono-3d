// 2D の表示: 心電図モニター、圧力・容積のグラフ、血液の通り道の模式図、心周期の5つの期
import {PHASES} from './heart-model.js';

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// 一定時間ぶんの履歴（シミュレーション時間で並べる）
export function createHistory(seconds = 2.6) {
  const buf = [];
  return {
    push(t, s) {buf.push({t, ecg: s.ecg, lv: s.pressures.lv, ao: s.pressures.aorta, vol: s.volumes.lv}); while (buf.length && buf[0].t < t - seconds) buf.shift();},
    reset() {buf.length = 0;}, get items() {return buf;}, seconds,
  };
}

// 画面の中の小さな心電図モニター
export function drawMonitor(canvas, history, now) {
  const ctx = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(239,231,217,.08)'; ctx.lineWidth = 1;
  for (let x = 0; x < W; x += W / 10) {ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();}
  ctx.strokeStyle = css('--conduction') || '#f2c14e'; ctx.lineWidth = 2.2; ctx.lineJoin = 'round'; ctx.beginPath();
  const items = history.items, span = history.seconds;
  let first = true;
  for (const it of items) {const x = W - ((now - it.t) / span) * W, y = H * 0.72 - it.ecg * H * 0.55; if (first) {ctx.moveTo(x, y); first = false;} else ctx.lineTo(x, y);}
  ctx.stroke();
}

// 心電図・圧力・容積を縦に並べたグラフ（ウィガース図の簡略版）
export function drawChart(canvas, history, now, state) {
  const ctx = canvas.getContext('2d'), W = canvas.width, H = canvas.height, span = history.seconds;
  const ink = css('--ink') || '#28231f', muted = css('--muted') || '#6f665c', line = css('--line') || '#d7cdbc';
  ctx.clearRect(0, 0, W, H);
  ctx.font = '500 15px JetBrains Mono, monospace'; ctx.textBaseline = 'top';
  const rows = [
    {label: '心電図', top: 0, h: 90, min: -0.35, max: 1.1, series: [['ecg', css('--conduction') || '#f2c14e', 2.4]]},
    {label: '圧 mmHg', top: 110, h: 150, min: 0, max: 180, series: [['ao', '#c08a7a', 2], ['lv', css('--artery') || '#d7363d', 2.6]], ticks: [0, 80, 120]},
    {label: '左心室の容積 mL', top: 285, h: 125, min: 0, max: 150, series: [['vol', '#8aa6d6', 2.6]], ticks: [50, 120]},
  ];
  const x0 = 54, x1 = W - 10;
  for (const r of rows) {
    ctx.fillStyle = muted; ctx.fillText(r.label, x0, r.top);
    const y0 = r.top + 22, y1 = r.top + r.h, sy = (v) => y1 - ((v - r.min) / (r.max - r.min)) * (y1 - y0);
    ctx.strokeStyle = line; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x0, y1); ctx.lineTo(x1, y1); ctx.stroke();
    if (r.ticks) for (const t of r.ticks) {ctx.strokeStyle = line; ctx.setLineDash([3, 5]); ctx.beginPath(); ctx.moveTo(x0, sy(t)); ctx.lineTo(x1, sy(t)); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = muted; ctx.textAlign = 'right'; ctx.fillText(String(t), x0 - 8, sy(t) - 8); ctx.textAlign = 'left';}
    for (const [key, color, width] of r.series) {
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = 'round'; ctx.beginPath(); let first = true;
      for (const it of history.items) {const x = x1 - ((now - it.t) / span) * (x1 - x0); if (x < x0) continue; const y = sy(it[key]); if (first) {ctx.moveTo(x, y); first = false;} else ctx.lineTo(x, y);}
      ctx.stroke();
    }
  }
  // いまの期を右端に
  ctx.fillStyle = ink; ctx.textAlign = 'right'; ctx.font = '500 14px JetBrains Mono, monospace'; ctx.fillText(state.phaseName, x1, 0); ctx.textAlign = 'left';
}

// 教科書の模式図。肺が上、全身が下。見る人の左が右心（解剖図の向き）
export function buildSchematic(host) {
  host.innerHTML = `<svg class="schematic" viewBox="0 0 520 470" role="img" aria-label="血液の通り道の模式図。右心室から肺へ行って左心房に戻る肺循環と、左心室から全身へ行って右心房に戻る体循環">
  <rect class="organ" x="150" y="18" width="220" height="64" rx="32"/><text x="260" y="44" text-anchor="middle">肺</text><text class="en" x="260" y="64" text-anchor="middle">GAS EXCHANGE · 静脈血 → 動脈血</text>
  <rect class="organ" x="110" y="388" width="300" height="64" rx="32"/><text x="260" y="414" text-anchor="middle">全身（頭・腕・内臓・脚）</text><text class="en" x="260" y="434" text-anchor="middle">SYSTEMIC CAPILLARIES · 動脈血 → 静脈血</text>
  <!-- 肺循環: 右心室 → 肺動脈（心房のあいだを上る）→ 肺 → 肺静脈 → 左心房 -->
  <path class="flow v" d="M205 240 Q240 240 240 200 L240 120 Q240 50 215 50"/><path class="dots" d="M205 240 Q240 240 240 200 L240 120 Q240 50 215 50"/>
  <path class="flow a" d="M305 50 Q350 50 350 120 L350 170"/><path class="dots" d="M305 50 Q350 50 350 120 L350 170"/>
  <!-- 体循環: 左心室 → 大動脈 → 全身 → 大静脈（心臓の外側を回って）→ 右心房 -->
  <path class="flow a" d="M350 300 L350 340 Q350 420 300 420"/><path class="dots" d="M350 300 L350 340 Q350 420 300 420"/>
  <path class="flow v" d="M220 420 Q90 420 90 300 L90 200 L120 200"/><path class="dots" d="M220 420 Q90 420 90 300 L90 200 L120 200"/>
  <g id="s-ra"><rect class="box" x="120" y="170" width="100" height="60" rx="8"/><text x="170" y="196" text-anchor="middle">右心房</text><text class="en" x="170" y="214" text-anchor="middle">RA</text></g>
  <g id="s-la"><rect class="box" x="300" y="170" width="100" height="60" rx="8"/><text x="350" y="196" text-anchor="middle">左心房</text><text class="en" x="350" y="214" text-anchor="middle">LA</text></g>
  <g id="s-rv"><rect class="box" x="120" y="240" width="100" height="60" rx="8"/><text x="170" y="266" text-anchor="middle">右心室</text><text class="en" x="170" y="284" text-anchor="middle">RV</text></g>
  <g id="s-lv"><rect class="box" x="300" y="240" width="100" height="60" rx="8"/><text x="350" y="266" text-anchor="middle">左心室</text><text class="en" x="350" y="284" text-anchor="middle">LV</text></g>
  <line id="s-tri" class="valve" x1="155" y1="235" x2="185" y2="235"/><line id="s-mit" class="valve" x1="335" y1="235" x2="365" y2="235"/>
  <line id="s-pul" class="valve" x1="225" y1="200" x2="255" y2="200"/><line id="s-aor" class="valve" x1="335" y1="320" x2="365" y2="320"/>
  <text class="en" x="248" y="150">肺動脈</text><text class="en" x="360" y="112">肺静脈</text>
  <text class="en" x="360" y="356">大動脈</text><text class="en" x="84" y="300" text-anchor="end">大静脈</text>
  <text class="en" x="108" y="238" text-anchor="end">三尖弁</text><text class="en" x="412" y="238">僧帽弁</text>
  <text class="en" x="262" y="204">肺動脈弁</text><text class="en" x="372" y="324">大動脈弁</text>
  <text x="298" y="124" text-anchor="middle" style="font-size:13px;font-weight:600">肺循環</text><text class="en" x="298" y="140" text-anchor="middle">RV → 肺 → LA</text>
  <text x="298" y="352" text-anchor="middle" style="font-size:13px;font-weight:600">体循環</text><text class="en" x="298" y="368" text-anchor="middle">LV → 全身 → RA</text>
</svg>`;
  const $ = (id) => host.querySelector('#' + id);
  const boxes = {ra: $('s-ra'), la: $('s-la'), rv: $('s-rv'), lv: $('s-lv')};
  const valves = {tri: $('s-tri'), mit: $('s-mit'), pul: $('s-pul'), aor: $('s-aor')};
  const svg = host.firstElementChild;
  return {
    update(state) {
      const atria = state.phase === 0, vent = state.phase === 1 || state.phase === 2;
      for (const k of ['ra', 'la']) boxes[k].firstElementChild.classList.toggle('active', atria);
      for (const k of ['rv', 'lv']) boxes[k].firstElementChild.classList.toggle('active', vent);
      valves.tri.classList.toggle('closed', !state.valves.tricuspid); valves.mit.classList.toggle('closed', !state.valves.mitral);
      valves.pul.classList.toggle('closed', !state.valves.pulmonary); valves.aor.classList.toggle('closed', !state.valves.aortic);
    },
    setTempo(hr, tempo, playing) {svg.style.setProperty('--dur', `${(84 / hr) / Math.max(0.02, tempo)}s`); svg.style.setProperty('--play', playing ? 'running' : 'paused'); host.querySelectorAll('.dots').forEach((d) => (d.style.animationPlayState = playing ? 'running' : 'paused'));},
  };
}

export const PHASE_NOTES = [
  ['心房収縮期', '心房が縮み、心室に最後のひと押し。房室弁は開いたまま。心電図は P 波。'],
  ['等容性収縮期', '心室が縮み始めて圧が上がり、房室弁が閉じる。まだ半月弁は開かず、容積は変わらない。QRS 波。'],
  ['駆出期', '心室の圧が動脈の圧を上回り、半月弁が開いて血液が押し出される。'],
  ['等容性弛緩期', '心室がゆるんで圧が下がり、半月弁が閉じる。房室弁もまだ閉じていて、容積は変わらない。'],
  ['充満期', '心室の圧が心房の圧を下回り、房室弁が開いて血液が流れ込む。はじめは速く（急速充満）、だんだんゆっくり。'],
];
// 期は時間の順に並べる（心室の収縮から始まり、心房収縮で終わる）
export const PHASE_ORDER = [1, 2, 3, 4, 0];
export function buildPhaseList(host, onJump) {
  host.innerHTML = PHASE_ORDER.map((p, i) => `<button type="button" data-phase="${p}"><span class="no">${String(i + 1).padStart(2, '0')}</span><b>${PHASES[p]}</b><small>${PHASE_NOTES[p][1]}</small></button>`).join('');
  host.querySelectorAll('button').forEach((b) => (b.onclick = () => onJump(+b.dataset.phase)));
  return {update(phase) {host.querySelectorAll('button').forEach((b) => b.classList.toggle('active', +b.dataset.phase === phase));}};
}
