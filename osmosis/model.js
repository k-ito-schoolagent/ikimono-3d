// 浸透と細胞の体積の計算モデル（見本）。描画には依存しない純粋な関数で、node --test で検証する。
// 細胞膜は水だけを通す（半透膜）とし、細胞の体積はボイル＝ファントホッフの関係 V = Vb + (V0 − Vb) × C0 / C に従う。
// Vb は水が出入りしない部分（タンパク質など）、C0 は等張液の濃度、C は外液の濃度。

export const ISOTONIC = 0.3;          // 等張液の濃度 [osmol/L]（溶けている粒子の総濃度。0.9 % の食塩水は NaCl が 2 つのイオンに分かれるので約 0.3 osmol/L）
export const INACTIVE_FRACTION = 0.4; // 水が出入りしない体積の割合（赤血球ではおよそ 0.4）
export const LYSIS_RATIO = 1.7;       // 体積がこの倍率を超えると膜が耐えきれず破れる（溶血）とみなす
export const C_MIN = 0.05, C_MAX = 0.9;

export function relativeVolume(c) {
  c = Math.min(C_MAX, Math.max(C_MIN, c));
  return INACTIVE_FRACTION + (1 - INACTIVE_FRACTION) * (ISOTONIC / c);
}
// 外液の分類: 低張（水が入る）、等張、高張（水が出る）
export function tonicity(c) {
  const r = c / ISOTONIC;
  if (Math.abs(r - 1) < 0.03) return {kind: 'isotonic', label: '等張液', water: 0};
  return r < 1 ? {kind: 'hypotonic', label: '低張液', water: 1} : {kind: 'hypertonic', label: '高張液', water: -1};
}
export function lyses(c) {return relativeVolume(c) > LYSIS_RATIO;}
// 体積が変わる途中（時定数 tau の一次遅れ）。水の出入りは濃度差に比例するので、差が大きいほど速い
export function step(volume, c, dt, tau = 1.2) {
  const target = relativeVolume(c);
  return volume + (target - volume) * (1 - Math.exp(-dt / tau));
}
