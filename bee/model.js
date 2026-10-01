// ミツバチ（働き蜂）の計算モデル。描画には依存しない純粋な関数で、node --test で検証する。
// 1. 分解図: 各部位が「本当の組み立ての向き」へ、外側の部位から順にずれていく
// 2. 翅の動き: 前後のストローク、上下のずれ（周期が半分＝2倍の速さで繰り返すので8の字になる）、翅のひねり（反転のたびに翅が立って裏返り、どちらへ動くときも前縁が先に進む）
// 数値はセイヨウミツバチの働き蜂の代表値（体長 約13 mm、はばたき 約230 回/秒（ホバリング時））

export const BODY_LENGTH_MM = 13;          // 働き蜂の体長（12〜14 mm）
export const WINGBEAT_HZ = 230;            // はばたき数（ホバリング時 約230 回/秒）
export const FOREWING_MM = 9.5;            // 前翅の長さ

// 分解の定義。axis は組み立ての向き（単位ベクトル）、distance は mm、order は外側から数えた順番（小さいほど先に離れる）
// parent があるものは、その部位（頭部）といっしょに動いたうえで、自分の向きへさらに離れる
export const PARTS = [
  {id: 'antenna', name: '触角', axis: [1, 0.3, 0], distance: 4.5, order: 0, parent: 'head'},
  {id: 'eye', name: '複眼', axis: [0, 0, 1], distance: 3, order: 1, mirror: true, parent: 'head'},
  {id: 'ocelli', name: '単眼', axis: [0, 1, 0], distance: 2.5, order: 1, parent: 'head'},
  {id: 'mouth', name: '口器', axis: [1, -0.6, 0], distance: 3.5, order: 1, parent: 'head'},
  {id: 'head', name: '頭部', axis: [1, 0, 0], distance: 4.5, order: 2},
  {id: 'forewing', name: '前翅', axis: [0, 1, 0.35], distance: 6, order: 0, mirror: true},
  {id: 'hindwing', name: '後翅', axis: [0, 1, 0.6], distance: 4, order: 1, mirror: true},
  {id: 'foreleg', name: '前脚', axis: [0.4, -1, 0.3], distance: 3.5, order: 1, mirror: true},
  {id: 'midleg', name: '中脚', axis: [0, -1, 0.35], distance: 4, order: 1, mirror: true},
  {id: 'hindleg', name: '後脚', axis: [-0.4, -1, 0.4], distance: 4.5, order: 1, mirror: true},
  {id: 'thorax', name: '胸部', axis: [0, 0, 0], distance: 0, order: 0},   // 胸部は基準。動かない
  {id: 'abdomen1', name: '腹部 第1節（見える順。形態学では第2節）', axis: [-1, 0, 0], distance: 2.5, order: 2},
  {id: 'abdomen2', name: '腹部 第2節', axis: [-1, 0, 0], distance: 4.3, order: 2},
  {id: 'abdomen3', name: '腹部 第3節', axis: [-1, 0, 0], distance: 6.1, order: 2},
  {id: 'abdomen4', name: '腹部 第4節', axis: [-1, 0, 0], distance: 7.9, order: 2},
  {id: 'abdomen5', name: '腹部 第5節', axis: [-1, 0, 0], distance: 9.7, order: 2},
  {id: 'abdomen6', name: '腹部 第6節', axis: [-1, 0, 0], distance: 11.5, order: 2},
  {id: 'sting', name: '毒針', axis: [-1, -0.2, 0], distance: 15, order: 0},
];
export const MAX_ORDER = Math.max(...PARTS.map((p) => p.order));

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : 1 - Math.pow(1 - x, 3));   // ゆっくり止まる

// スライダーの値 t（0 組み立て 〜 1 分解）に対する、部位ごとの進み具合 0〜1。外側（order が小さい）から順に動き出す
export function partProgress(part, t, stagger = 0.18) {
  const start = part.order * stagger, span = 1 - MAX_ORDER * stagger;
  return ease((clamp(t, 0, 1) - start) / span);
}
// 部位のずれ [mm]（右側の部位は z を反転）
export function explodeOffset(part, t, side = 1) {
  const p = partProgress(part, t), l = Math.hypot(...part.axis) || 1;
  const z = (v) => v || 0;                                   // -0 を 0 にそろえる
  return [z((part.axis[0] / l) * part.distance * p), z((part.axis[1] / l) * part.distance * p), z((part.axis[2] / l) * part.distance * p * side)];
}
// 親（頭部）のずれも足した、組み立て位置からの実際のずれ
export function explodeWorld(part, t, side = 1) {
  const own = explodeOffset(part, t, side);
  if (!part.parent) return own;
  const parent = PARTS.find((p) => p.id === part.parent), po = explodeWorld(parent, t, side);
  return [own[0] + po[0], own[1] + po[1], own[2] + po[2]];
}
export function explodeAll(t) {
  const out = {};
  for (const p of PARTS) out[p.id] = explodeWorld(p, t);
  return out;
}

// 翅の姿勢（角度は度）。phase は 1 回のはばたきを 0〜1 で表す（0 が前いっぱい、0.5 が後ろいっぱい。0〜0.5 は後ろへ、0.5〜1 は前へ動く）
// stroke: 前後に振る角度（振れ幅 = amplitude）。deviation: 上下のずれ（周期が半分 → 翅先が 8 の字を描く）。
// pitch: 翅のひねり。翅の面が水平で前縁が前を向く向きを 0° とし、90° で翅が立つ。反転の瞬間に 90° で立ち、前へ動くとき 45°（前縁が前・上）、後ろへ動くとき 135°（裏返って前縁が後ろ・上）。
// こうすると、どちらへ動くときも前縁が先に進み、迎え角は約 45° で空気を下へ押せる
export const WING = {amplitude: 90, deviation: 14, pitch: 45};
export function wingPose(phase, w = WING) {
  const a = phase * Math.PI * 2;
  return {
    stroke: (w.amplitude / 2) * Math.cos(a),
    deviation: w.deviation * Math.sin(2 * a),
    pitch: 90 + w.pitch * Math.sin(a),
  };
}
// 翅先の位置 [mm]。翅のつけ根を原点、x が前、y が上、z が外側
export function wingTip(phase, length = FOREWING_MM, w = WING) {
  const {stroke, deviation} = wingPose(phase, w), s = (stroke * Math.PI) / 180, d = (deviation * Math.PI) / 180;
  return [length * Math.cos(d) * Math.sin(s), length * Math.sin(d), length * Math.cos(d) * Math.cos(s)];
}
// 翅先の軌跡が自分と交わる回数（8 の字なら 1 回）
export function selfCrossings(n = 241, w = WING) {   // 交点が頂点にちょうど乗らないよう 4 で割り切れない数にする
  const pts = Array.from({length: n}, (_, i) => {const [x, y] = wingTip(i / n, FOREWING_MM, w); return [x, y];});
  const cross = (a, b, c, d) => {
    const den = (b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0]);
    if (Math.abs(den) < 1e-12) return false;
    const u = ((c[0] - a[0]) * (d[1] - c[1]) - (c[1] - a[1]) * (d[0] - c[0])) / den, v = ((c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0])) / den;
    return u > 1e-9 && u < 1 - 1e-9 && v > 1e-9 && v < 1 - 1e-9;
  };
  let count = 0;
  for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
    if (i === 0 && j === n - 1) continue;                      // 隣り合う線分は除く
    if (cross(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) count++;
  }
  return count;
}

// 羽音の高さ: はばたき数がそのまま音の周波数になる。ピアノの鍵盤の名前に直す（A4 = 440 Hz）
const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
export function noteName(freq) {
  if (!(freq > 0)) return '—';
  const n = Math.round(12 * Math.log2(freq / 440)) + 69;      // MIDI ノート番号
  return `${NAMES[((n % 12) + 12) % 12]}${Math.floor(n / 12) - 1}`;
}
export function audible(freq) {return freq >= 20 && freq <= 20000;}
