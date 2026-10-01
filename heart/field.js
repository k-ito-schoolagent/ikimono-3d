// 心臓の形を「符号付き距離の場」として定義する。内側で負、外側で正。
// 4つの部屋（ふくらみ）を滑らかにつなぎ、内腔と血管の内側をくり抜くので、断面にすると壁の厚さがそのまま出る
// （左心室の壁は厚く、右心室と心房の壁は薄い）。座標は cm、y が上、+x が患者の左（見る人の右）、+z が前（胸側）。

export const PARTS = {
  lv: {id: 0, name: '左心室', en: 'Left ventricle', blood: 'artery'},
  rv: {id: 1, name: '右心室', en: 'Right ventricle', blood: 'vein'},
  la: {id: 2, name: '左心房', en: 'Left atrium', blood: 'artery'},
  ra: {id: 3, name: '右心房', en: 'Right atrium', blood: 'vein'},
  aorta: {id: 4, name: '大動脈', en: 'Aorta', blood: 'artery'},
  pa: {id: 5, name: '肺動脈', en: 'Pulmonary artery', blood: 'vein'},
  vc: {id: 6, name: '大静脈', en: 'Venae cavae', blood: 'vein'},
  pv: {id: 7, name: '肺静脈', en: 'Pulmonary veins', blood: 'artery'},
};

const smin = (a, b, k) => {const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25;};
const smax = (a, b, k) => -smin(-a, -b, k);

// 傾いた卵形: 中心 c、半径 r、上がふくらんで下がすぼまる（egg > 0 で下が細くなる）。tilt は z 軸まわりの傾き、lean は x 軸まわり
function egg(c, r, egg = 0, tilt = 0, lean = 0) {
  const ct = Math.cos(tilt), st = Math.sin(tilt), cl = Math.cos(lean), sl = Math.sin(lean);
  const rmin = Math.min(r[0], r[1], r[2]);
  return (x, y, z) => {
    let px = x - c[0], py = y - c[1], pz = z - c[2];
    let qx = ct * px + st * py, qy = -st * px + ct * py;      // z 軸まわりに回す
    let qz = cl * pz + sl * qy; qy = -sl * pz + cl * qy;        // x 軸まわりに回す
    const yn = qy / r[1];
    const w = 1 + egg * yn;                                    // 上で広く、下で狭く
    const dx = qx / (r[0] * w), dy = qy / r[1], dz = qz / (r[2] * w);
    return (Math.sqrt(dx * dx + dy * dy + dz * dz) - 1) * rmin;
  };
}
// 折れ線に沿ったチューブ（カプセルの連なり）。半径は点ごとに指定できる
function tubeAlong(points, radii) {
  const segs = [];
  for (let i = 0; i < points.length - 1; i++) segs.push([points[i], points[i + 1], radii[i], radii[i + 1]]);
  return (x, y, z) => {
    let d = Infinity;
    for (const [a, b, ra, rb] of segs) {
      const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
      const apx = x - a[0], apy = y - a[1], apz = z - a[2];
      const t = Math.max(0, Math.min(1, (apx * abx + apy * aby + apz * abz) / (abx * abx + aby * aby + abz * abz)));
      const dx = apx - abx * t, dy = apy - aby * t, dz = apz - abz * t;
      d = Math.min(d, Math.sqrt(dx * dx + dy * dy + dz * dz) - (ra + (rb - ra) * t));
    }
    return d;
  };
}
const shrink = (pts, r, w) => r.map((v) => Math.max(0.12, v - w));

// 形の定義（外側の面と、くり抜く内腔）
const LV = {c: [1.2, -1.7, 0.2], r: [3.3, 4.9, 3.1], wall: 1.15, tilt: 0.4, lean: 0.22};
const RV = {c: [-2.1, -1.1, 1.5], r: [2.5, 3.9, 2.3], wall: 0.5, tilt: 0.28, lean: 0.25};
const LA = {c: [1.8, 3.2, -1.8], r: [2.4, 2.0, 2.1], wall: 0.4};
const RA = {c: [-2.4, 2.9, -0.6], r: [2.3, 2.2, 2.0], wall: 0.4};

const aortaPts = [[0.2, 1.2, 0.5], [0.4, 3.6, 0.7], [0.7, 5.8, 0.3], [1.5, 7.3, -0.5], [2.8, 7.5, -1.6], [3.5, 6.4, -2.6], [3.3, 3.5, -3.1], [3.0, -0.5, -3.3], [2.9, -8, -3.4]];
const aortaR = [1.15, 1.05, 1.0, 0.98, 0.95, 0.92, 0.88, 0.85, 0.85];
const branch1 = [[1.0, 7.2, -0.6], [0.8, 11, -0.9]], branch2 = [[1.9, 7.5, -1.2], [1.9, 11, -1.5]], branch3 = [[2.7, 7.4, -1.7], [3.1, 11, -2.1]];
const paPts = [[-1.4, 1.0, 1.7], [-1.1, 3.4, 1.6], [-0.8, 5.0, 1.0], [-0.9, 5.9, 0.2]];
const paR = [1.0, 0.95, 0.9, 0.85];
const lpaPts = [[-0.9, 5.9, 0.2], [1.6, 6.1, -0.9], [4.2, 5.8, -1.5], [8, 5.4, -2.0]], lpaR = [0.85, 0.7, 0.62, 0.6];
const rpaPts = [[-0.9, 5.9, 0.2], [-3.0, 5.6, -0.7], [-5.5, 5.1, -1.2], [-8, 4.8, -1.6]], rpaR = [0.85, 0.7, 0.62, 0.6];
const svcPts = [[-2.0, 3.6, -0.7], [-2.1, 6.5, -0.9], [-2.0, 11, -1.0]], svcR = [0.85, 0.82, 0.8];
const ivcPts = [[-2.3, 2.0, -1.2], [-2.6, -1.5, -2.3], [-2.7, -8, -2.8]], ivcR = [0.9, 0.9, 0.9];
const pvL1 = [[3.2, 3.7, -2.2], [5.6, 4.1, -2.7], [8, 4.3, -3.0]], pvL2 = [[3.2, 2.6, -2.4], [5.6, 2.4, -3.0], [8, 2.2, -3.3]];
const pvR1 = [[0.0, 3.6, -2.9], [-4.6, 4.0, -3.1], [-8, 4.2, -3.3]], pvR2 = [[0.0, 2.7, -3.0], [-4.6, 2.9, -3.4], [-8, 2.8, -3.7]];
const pvR = [0.5, 0.5, 0.5];

export function buildField() {
  const lvOut = egg(LV.c, LV.r, 0.3, LV.tilt, LV.lean), lvIn = egg(LV.c, LV.r.map((v) => v - LV.wall), 0.3, LV.tilt, LV.lean);
  const rvOut = egg(RV.c, RV.r, 0.18, RV.tilt, RV.lean), rvIn = egg(RV.c, RV.r.map((v) => v - RV.wall), 0.18, RV.tilt, RV.lean);
  const laOut = egg(LA.c, LA.r, -0.1), laIn = egg(LA.c, LA.r.map((v) => v - LA.wall), -0.1);
  const raOut = egg(RA.c, RA.r, -0.1), raIn = egg(RA.c, RA.r.map((v) => v - RA.wall), -0.1);
  const laAur = egg([3.6, 3.3, 0.6], [1.1, 0.8, 0.8], 0, 0.5), raAur = egg([-4.0, 2.9, 1.4], [1.2, 0.9, 0.9], 0, -0.6);
  const vessels = [
    ['aorta', aortaPts, aortaR, 0.24], ['aorta', branch1, [0.42, 0.4], 0.2], ['aorta', branch2, [0.42, 0.4], 0.2], ['aorta', branch3, [0.42, 0.4], 0.2],
    ['pa', paPts, paR, 0.22], ['pa', lpaPts, lpaR, 0.2], ['pa', rpaPts, rpaR, 0.2],
    ['vc', svcPts, svcR, 0.2], ['vc', ivcPts, ivcR, 0.2],
    ['pv', pvL1, pvR, 0.24], ['pv', pvL2, pvR, 0.24], ['pv', pvR1, pvR, 0.24], ['pv', pvR2, pvR, 0.24],
  ].map(([part, pts, r, wall]) => ({part, out: tubeAlong(pts, r), inn: tubeAlong(pts, shrink(pts, r, wall))}));

  // 外側の形: 部屋どうしは幅広く（溝ができる）、血管は細く滑らかにつなぐ
  function outer(x, y, z) {
    let d = smin(lvOut(x, y, z), rvOut(x, y, z), 0.8);
    let atria = smin(laOut(x, y, z), raOut(x, y, z), 0.6);
    atria = smin(atria, laAur(x, y, z), 0.5); atria = smin(atria, raAur(x, y, z), 0.5);
    d = smin(d, atria, 0.55);
    for (const v of vessels) d = smin(d, v.out(x, y, z), 0.55);
    return d;
  }
  // 内腔: 左心室は厚い壁の内側。右心室は左心室の壁（心室中隔）を避けて三日月形になる
  function cavity(x, y, z) {
    const lvc = lvIn(x, y, z);
    const rvc = smax(rvIn(x, y, z), -(lvc - 1.0), 0.3);
    let d = Math.min(lvc, rvc);
    d = smin(d, laIn(x, y, z), 0.3); d = smin(d, raIn(x, y, z), 0.3);
    for (const v of vessels) d = smin(d, v.inn(x, y, z), 0.25);
    return d;
  }
  const field = (x, y, z) => smax(outer(x, y, z), -cavity(x, y, z), 0.12);

  // 頂点がどの部位に属するか（いちばん近い形）と、拍動で動かすときの重み
  const chambers = [['lv', lvOut, lvIn], ['rv', rvOut, rvIn], ['la', laOut, laIn], ['ra', raOut, raIn]];
  function classify(x, y, z) {
    let best = 'lv', bestD = Infinity, inner = 0;
    for (const [part, out, inn] of chambers) {
      const o = out(x, y, z), i = inn(x, y, z);
      if (Math.abs(o) < bestD) {bestD = Math.abs(o); best = part; inner = 0;}
      if (Math.abs(i) < bestD) {bestD = Math.abs(i); best = part; inner = 1;}
    }
    if (Math.abs(laAur(x, y, z)) < bestD) {bestD = Math.abs(laAur(x, y, z)); best = 'la'; inner = 0;}
    if (Math.abs(raAur(x, y, z)) < bestD) {bestD = Math.abs(raAur(x, y, z)); best = 'ra'; inner = 0;}
    for (const v of vessels) {
      const o = v.out(x, y, z), i = v.inn(x, y, z);
      if (Math.abs(o) < bestD) {bestD = Math.abs(o); best = v.part; inner = 0;}
      if (Math.abs(i) < bestD) {bestD = Math.abs(i); best = v.part; inner = 1;}
    }
    // 拍動の重み: 各部屋の中心からの距離で滑らかに。血管は根元だけ少し動く
    const w = chambers.map(([, out]) => Math.exp(-Math.max(0, out(x, y, z) + 0.6) / 0.9));
    const sum = w.reduce((a, b) => a + b, 0) || 1;
    const vesselFade = PARTS[best].id >= 4 ? Math.min(1, Math.max(0, 1 - (y - 2.5) / 3.5)) * 0.6 : 1;
    // 血管らしさ 0〜1（部屋との境目で滑らかに変わる。血管だけ透けて見せるために使う）
    let chamberD = Infinity, vesselD = Infinity;
    for (const [, out] of chambers) chamberD = Math.min(chamberD, out(x, y, z));
    chamberD = Math.min(chamberD, laAur(x, y, z), raAur(x, y, z));
    for (const v of vessels) vesselD = Math.min(vesselD, v.out(x, y, z));
    const t = (chamberD - vesselD + 0.45) / 0.9, vess = t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
    return [[PARTS[best].id, inner], w.map((v) => (v / sum) * vesselFade), [vess]];
  }
  return {field, classify, outer, cavity, LV, RV, LA, RA, paths: {aortaPts, paPts, lpaPts, rpaPts, svcPts, ivcPts, pvL1, pvL2, pvR1, pvR2, branch1, branch2, branch3}};
}

export const FIELD_BOUNDS = {min: [-8.2, -8.6, -5.6], max: [8.2, 11.2, 5.2]};
