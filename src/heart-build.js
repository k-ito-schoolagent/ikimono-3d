// 心臓のまわりの舞台装置: 心臓の外へ続く血管、肺、全身（毛細血管のある場所）、弁、刺激伝導系、部位のラベル、血液の通り道
import {T} from './stage.js';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {COLORS, createConductionMaterial} from './heart-materials.js';

const v3 = (p) => (p.isVector3 ? p : new T.Vector3(...p));
const curve = (pts) => new T.CatmullRomCurve3(pts.map(v3), false, 'centripetal', 0.5);

// 心臓の外へ続く血管（半透明。中を流れる粒が見える）
export function buildVessels(parent) {
  const art = new T.MeshPhysicalMaterial({color: COLORS.arteryWall, roughness: 0.35, transmission: 0, transparent: true, opacity: 0.5, depthWrite: false, clearcoat: 0.4});
  const vein = art.clone(); vein.color = COLORS.veinWall.clone();
  const tubes = [
    [art, [[2.95, -7.4, -3.4], [2.9, -8.6, -3.4], [2.8, -10.5, -3.2], [2.6, -12, -2.5]], 0.85],
    [vein, [[-2.7, -7.4, -2.8], [-2.7, -8.6, -2.8], [-2.8, -10.5, -2.9], [-2.6, -12, -2.5]], 0.9],
    [art, [[0.8, 10.4, -0.9], [0.8, 11.5, -0.95], [0.9, 13, -1.0], [1.0, 14.2, -0.8]], 0.4],
    [art, [[1.9, 10.4, -1.5], [1.9, 11.5, -1.5], [1.9, 13, -1.6], [1.6, 14.2, -1.2]], 0.4],
    [art, [[3.1, 10.4, -2.1], [3.1, 11.5, -2.1], [3.0, 13, -2.0], [2.6, 14.2, -1.6]], 0.4],
    [vein, [[-2.0, 10.4, -1.0], [-2.0, 11.5, -1.0], [-2.1, 13, -1.0], [-2.3, 14.2, -1.0]], 0.8],
    [vein, [[7.4, 5.5, -1.95], [8.6, 5.3, -2.05], [9.6, 5.2, -2.1]], 0.6],
    [vein, [[-7.4, 4.85, -1.55], [-8.6, 4.7, -1.7], [-9.6, 4.6, -1.8]], 0.6],
    [art, [[7.4, 4.25, -2.95], [8.6, 4.3, -3.05], [9.4, 3.9, -3.1]], 0.5],
    [art, [[7.4, 2.25, -3.25], [8.6, 2.2, -3.3], [9.4, 2.3, -3.3]], 0.5],
    [art, [[-7.4, 4.15, -3.25], [-8.6, 4.2, -3.3], [-9.4, 3.9, -3.3]], 0.5],
    [art, [[-7.4, 2.8, -3.65], [-8.6, 2.8, -3.7], [-9.4, 2.4, -3.6]], 0.5],
  ];
  const group = new T.Group(); parent.add(group);
  for (const [mat, pts, r] of tubes) {const m = new T.Mesh(new T.TubeGeometry(curve(pts), 24, r, 14, false), mat); m.renderOrder = 2; group.add(m);}
  return {group, materials: [art, vein]};
}

// 肺と全身（毛細血管のある場所）。すりガラスのような器の中に、色が変わる細い管を通す
export function buildOrgans(parent) {
  const glass = new T.MeshPhysicalMaterial({color: 0xd9cfc0, roughness: 0.6, metalness: 0, transparent: true, opacity: 0.2, depthWrite: false, side: T.DoubleSide});
  const group = new T.Group(); parent.add(group);
  const lungGeo = new T.SphereGeometry(1, 48, 32);
  for (const sx of [1, -1]) {
    const lung = new T.Mesh(lungGeo, glass); lung.position.set(sx * 10.4, 4.3, -2.4); lung.scale.set(3.3, 6.0, 2.9); lung.renderOrder = 1; group.add(lung);
  }
  const upper = new T.Mesh(new RoundedBoxGeometry(10, 2.2, 4.6, 4, 0.8), glass); upper.position.set(0, 15.2, -1.3); upper.renderOrder = 1; group.add(upper);
  const lower = new T.Mesh(new RoundedBoxGeometry(13, 2.6, 5.4, 4, 0.9), glass); lower.position.set(0, -13.2, -2.5); lower.renderOrder = 1; group.add(lower);
  // 毛細血管の管: 粒と同じ道に沿って、青→赤（肺）・赤→青（全身）に色が変わる
  function capillary(pts, from, to) {
    const c = curve(pts), geo = new T.TubeGeometry(c, 60, 0.16, 8, false), n = geo.attributes.position.count, col = new Float32Array(n * 3), uv = geo.attributes.uv;
    const a = new T.Color(from), b = new T.Color(to), tmp = new T.Color();
    for (let i = 0; i < n; i++) {tmp.copy(a).lerp(b, uv.getX(i)); col.set([tmp.r, tmp.g, tmp.b], i * 3);}
    geo.setAttribute('color', new T.BufferAttribute(col, 3));
    const m = new T.Mesh(geo, new T.MeshStandardMaterial({vertexColors: true, roughness: 0.6, transparent: true, opacity: 0.75})); m.renderOrder = 1; group.add(m); return m;
  }
  capillary(ROUTE.lungL, COLORS.vein, COLORS.artery); capillary(ROUTE.lungR, COLORS.vein, COLORS.artery);
  capillary(ROUTE.upperBody, COLORS.artery, COLORS.vein); capillary(ROUTE.lowerBody, COLORS.artery, COLORS.vein);
  return {group, glass};
}

// 粒の通り道。心臓→肺→心臓→全身→心臓 の8の字を、分かれ道つきのグラフで表す
export const ROUTE = {
  lungL: [[9.6, 5.2, -2.1], [10.8, 6.3, -2.1], [11.9, 5.0, -2.6], [11.6, 3.0, -2.9], [10.4, 2.3, -3.1], [9.9, 3.1, -3.2]],
  lungR: [[-9.6, 4.6, -1.8], [-10.8, 5.9, -1.9], [-11.9, 4.5, -2.5], [-11.6, 2.6, -2.9], [-10.4, 2.1, -3.1], [-9.9, 3.0, -3.4]],
  upperBody: [[1.6, 14.2, -1.2], [2.9, 15.6, 0.3], [0.4, 16.3, -2.6], [-2.7, 15.4, 0.1], [-2.3, 14.2, -1.0]],
  lowerBody: [[2.6, -12, -2.5], [4.0, -13.6, -0.9], [0.9, -14.4, -4.2], [-2.0, -13.2, -0.7], [-2.6, -12, -2.5]],
};
export function buildSegments() {
  const S = {};
  const seg = (id, type, pts, next, extra = {}) => (S[id] = {id, type, curve: curve(pts), next, ...extra});
  seg('raTop', 'atrium', [[-2.1, 3.9, -0.9], [-2.4, 3.0, -0.4], [-2.2, 1.9, 0.1], [-2.1, 1.1, 0.5]], ['rv'], {chamber: 'ra'});
  seg('raLow', 'atrium', [[-2.4, 1.6, -1.3], [-2.6, 2.4, -0.8], [-2.3, 1.9, 0.1], [-2.1, 1.1, 0.5]], ['rv'], {chamber: 'ra'});
  seg('rv', 'ventricle', [[-2.1, 1.1, 0.5], [-2.2, -0.8, 1.4], [-2.5, -2.5, 1.8], [-1.9, -1.0, 2.2], [-1.5, 0.6, 1.8], [-1.3, 1.9, 1.65]], ['pa'], {chamber: 'rv'});
  seg('pa', 'artery', [[-1.3, 1.9, 1.65], [-1.1, 3.4, 1.6], [-0.8, 5.0, 1.0], [-0.9, 5.9, 0.2]], ['lpa', 'rpa']);
  seg('lpa', 'artery', [[-0.9, 5.9, 0.2], [1.6, 6.1, -0.9], [4.2, 5.8, -1.5], [7.4, 5.5, -1.95], [9.6, 5.2, -2.1]], ['lungL']);
  seg('rpa', 'artery', [[-0.9, 5.9, 0.2], [-3.0, 5.6, -0.7], [-5.5, 5.1, -1.2], [-7.4, 4.85, -1.55], [-9.6, 4.6, -1.8]], ['lungR']);
  seg('lungL', 'capillary', ROUTE.lungL, ['pvL1', 'pvL2'], {from: 0, to: 1});
  seg('lungR', 'capillary', ROUTE.lungR, ['pvR1', 'pvR2'], {from: 0, to: 1});
  seg('pvL1', 'vein', [[9.9, 3.1, -3.2], [9.4, 3.9, -3.1], [7.4, 4.25, -2.95], [5.6, 4.1, -2.7], [3.2, 3.7, -2.2]], ['laL'], {blood: 1});
  seg('pvL2', 'vein', [[9.9, 3.1, -3.2], [9.4, 2.3, -3.3], [7.4, 2.25, -3.25], [5.6, 2.4, -3.0], [3.2, 2.6, -2.4]], ['laL'], {blood: 1});
  seg('pvR1', 'vein', [[-9.9, 3.0, -3.4], [-9.4, 3.9, -3.3], [-7.4, 4.15, -3.25], [-4.6, 4.0, -3.1], [0.0, 3.6, -2.9]], ['laR'], {blood: 1});
  seg('pvR2', 'vein', [[-9.9, 3.0, -3.4], [-9.4, 2.4, -3.6], [-7.4, 2.8, -3.65], [-4.6, 2.9, -3.4], [0.0, 2.7, -3.0]], ['laR'], {blood: 1});
  seg('laL', 'atrium', [[3.2, 3.2, -2.3], [2.2, 3.1, -1.8], [1.7, 2.2, -1.3], [1.5, 1.5, -0.9]], ['lv'], {chamber: 'la', blood: 1});
  seg('laR', 'atrium', [[0.0, 3.1, -2.9], [1.0, 3.2, -2.1], [1.5, 2.3, -1.4], [1.5, 1.5, -0.9]], ['lv'], {chamber: 'la', blood: 1});
  seg('lv', 'ventricle', [[1.5, 1.5, -0.9], [1.3, -0.6, 0.0], [1.8, -3.4, 0.9], [1.0, -1.6, 1.2], [0.6, 0.4, 0.8], [0.3, 2.0, 0.6]], ['aorta'], {chamber: 'lv', blood: 1});
  seg('aorta', 'artery', [[0.3, 2.0, 0.6], [0.4, 3.6, 0.7], [0.7, 5.8, 0.3], [1.5, 7.3, -0.5]], ['down', 'down', 'up'], {blood: 1});
  seg('down', 'artery', [[1.5, 7.3, -0.5], [2.8, 7.5, -1.6], [3.5, 6.4, -2.6], [3.3, 3.5, -3.1], [3.0, -0.5, -3.3], [2.9, -8, -3.4], [2.8, -10.5, -3.2], [2.6, -12, -2.5]], ['lowerBody'], {blood: 1});
  seg('up', 'artery', [[1.5, 7.3, -0.5], [1.9, 7.5, -1.2], [1.9, 11, -1.5], [1.9, 13, -1.6], [1.6, 14.2, -1.2]], ['upperBody'], {blood: 1});
  seg('lowerBody', 'capillary', ROUTE.lowerBody, ['ivc'], {from: 1, to: 0});
  seg('upperBody', 'capillary', ROUTE.upperBody, ['svc'], {from: 1, to: 0});
  seg('ivc', 'vein', [[-2.6, -12, -2.5], [-2.8, -10.5, -2.9], [-2.7, -8, -2.8], [-2.6, -1.5, -2.3], [-2.4, 1.6, -1.3]], ['raLow'], {blood: 0});
  seg('svc', 'vein', [[-2.3, 14.2, -1.0], [-2.1, 13, -1.0], [-2.0, 11, -1.0], [-2.1, 6.5, -0.9], [-2.1, 3.9, -0.9]], ['raTop'], {blood: 0});
  for (const s of Object.values(S)) s.length = s.curve.getLength();
  return S;
}

// 弁: 輪に蝶番でついた花弁が、閉じると面をふさぎ、開くと流れの向きへ倒れる
export function buildValves(parent) {
  const leafMat = new T.MeshPhysicalMaterial({color: 0xf3e6d8, roughness: 0.45, clearcoat: 0.3, side: T.DoubleSide, transparent: true, opacity: 0.95});
  const ringMat = new T.MeshStandardMaterial({color: 0xe6d2c3, roughness: 0.6});
  const chordMat = new T.LineBasicMaterial({color: 0xf0e4d6, transparent: true, opacity: 0.8});
  const defs = [
    {id: 'mitral', name: '僧帽弁（左房室弁）', pos: [1.5, 1.5, -0.9], dir: [-0.6, -4.6, 2.0], r: 1.25, n: 2, open: 1.25, flip: true, papillary: [[0.6, -2.4, 1.4], [2.2, -2.6, -0.4]]},
    {id: 'tricuspid', name: '三尖弁（右房室弁）', pos: [-2.1, 1.1, 0.5], dir: [0.3, -3.8, 2.0], r: 1.15, n: 3, open: 1.2, flip: true, papillary: [[-3.0, -1.6, 1.6], [-1.4, -2.2, 2.0], [-2.4, -2.0, 0.4]]},
    {id: 'aortic', name: '大動脈弁', pos: [0.3, 2.1, 0.6], dir: [0.08, 0.99, 0.08], r: 0.82, n: 3, open: 1.3, flip: false},
    {id: 'pulmonary', name: '肺動脈弁', pos: [-1.3, 2.0, 1.65], dir: [0.12, 0.99, -0.04], r: 0.75, n: 3, open: 1.3, flip: false},
  ];
  const valves = [];
  for (const d of defs) {
    const g = new T.Group(); g.position.set(...d.pos);
    g.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), new T.Vector3(...d.dir).normalize());   // ローカル +y が流れの向き
    const ring = new T.Mesh(new T.TorusGeometry(d.r, 0.07, 10, 48), ringMat); ring.rotation.x = Math.PI / 2; g.add(ring);
    const leaves = [];
    for (let i = 0; i < d.n; i++) {
      const a0 = (i / d.n) * Math.PI * 2, a1 = ((i + 1) / d.n) * Math.PI * 2, am = (a0 + a1) / 2;
      const shape = new T.Shape(); shape.moveTo(0, 0); shape.absarc(0, 0, d.r * 0.98, a0 + 0.02, a1 - 0.02, false); shape.lineTo(0, 0);
      const geo = new T.ShapeGeometry(shape, 12); geo.rotateX(-Math.PI / 2);                 // XZ 平面に置く（法線 +y）
      const hx = Math.cos(am) * d.r, hz = -Math.sin(am) * d.r;                              // 蝶番の位置（輪の上）
      geo.translate(-hx, 0, -hz);
      const pivot = new T.Group(); pivot.position.set(hx, 0, hz); g.add(pivot);
      const leaf = new T.Mesh(geo, leafMat); pivot.add(leaf);
      const axis = new T.Vector3(-Math.sin(am), 0, -Math.cos(am)).normalize();              // 蝶番の軸（接線）
      leaves.push({pivot, axis, am, tip: new T.Vector3(-hx, 0, -hz)});
    }
    const chords = [];
    if (d.papillary) for (const [k, leaf] of leaves.entries()) {
      const pp = new T.Vector3(...d.papillary[k % d.papillary.length]);
      for (const f of [0.35, 0.7]) {const geo = new T.BufferGeometry().setFromPoints([pp, pp]); const line = new T.Line(geo, chordMat); parent.add(line); chords.push({line, leaf, f, pp});}
    }
    parent.add(g);
    valves.push({...d, group: g, leaves, chords, state: 0});
  }
  const tmp = new T.Vector3();
  function update(valveOpen, dt) {
    for (const v of valves) {
      const target = valveOpen[v.id] ? 1 : 0;
      v.state += (target - v.state) * Math.min(1, dt * 18);
      for (const l of v.leaves) l.pivot.quaternion.setFromAxisAngle(l.axis, (v.flip ? 1 : -1) * v.open * v.state);
      for (const c of v.chords) {
        tmp.copy(c.leaf.tip).multiplyScalar(c.f); c.leaf.pivot.localToWorld(tmp);
        const pos = c.line.geometry.attributes.position; pos.setXYZ(0, tmp.x, tmp.y, tmp.z); pos.setXYZ(1, c.pp.x, c.pp.y, c.pp.z); pos.needsUpdate = true;
      }
    }
  }
  return {valves, update, materials: [leafMat, ringMat, chordMat]};
}

// 刺激伝導系: 洞房結節 → 心房の経路 → 房室結節 → ヒス束と左右の脚 → プルキンエ線維
export function buildConduction(parent) {
  const SA = [-2.1, 4.2, -1.4], AV = [-0.7, 1.6, -0.3];
  const paths = [
    [0, [SA, [-3.2, 3.3, 0.3], [-2.7, 2.1, 0.6], AV]],
    [0, [SA, [-3.6, 3.5, -1.6], [-3.1, 2.1, -1.8], AV]],
    [0, [SA, [-0.5, 4.6, -1.9], [1.8, 4.4, -2.2], [3.3, 3.3, -1.7]]],
    [2, [AV, [-0.5, 0.9, 0.1], [-0.4, 0.0, 0.3], [-0.9, -1.6, 0.9], [-1.6, -3.2, 1.4], [-2.3, -3.1, 2.2]]],
    [2, [[-0.4, 0.0, 0.3], [0.4, -1.4, 0.0], [1.0, -3.2, 0.0], [1.8, -4.6, 0.6]]],
    [2, [[0.4, -1.4, 0.0], [1.5, -1.7, -1.6], [2.2, -2.6, -1.8]]],
    [2, [[0.4, -1.4, 0.0], [1.9, -1.9, 1.5], [2.6, -3.0, 1.6]]],
    [3, [[1.8, -4.6, 0.6], [3.2, -3.0, 1.6], [3.3, -0.8, 1.0]]],
    [3, [[1.8, -4.6, 0.6], [2.6, -3.4, -1.8], [2.9, -1.0, -2.0]]],
    [3, [[2.2, -2.6, -1.8], [3.0, -0.6, -2.1]]],
    [3, [[2.6, -3.0, 1.6], [3.3, -1.2, 1.8]]],
    [3, [[-2.3, -3.1, 2.2], [-3.2, -1.6, 2.2], [-3.3, 0.3, 1.6]]],
    [3, [[-2.3, -3.1, 2.2], [-1.2, -2.2, 3.0], [-0.6, -0.4, 2.9]]],
    [3, [[-1.6, -3.2, 1.4], [-3.0, -3.0, 0.4], [-3.5, -1.2, 0.4]]],
  ];
  const group = new T.Group(); parent.add(group);
  const mat = createConductionMaterial();
  for (const [segId, pts] of paths) {
    const geo = new T.TubeGeometry(curve(pts), 32, 0.075, 7, false);
    const n = geo.attributes.position.count, ct = new Float32Array(n), cs = new Float32Array(n).fill(segId);
    for (let i = 0; i < n; i++) ct[i] = geo.attributes.uv.getX(i);
    geo.setAttribute('ct', new T.BufferAttribute(ct, 1)); geo.setAttribute('cseg', new T.BufferAttribute(cs, 1));
    const m = new T.Mesh(geo, mat); m.renderOrder = 3; group.add(m);
  }
  const nodeMat = new T.MeshBasicMaterial({color: COLORS.conduction, transparent: true, opacity: 0.9});
  const sa = new T.Mesh(new T.SphereGeometry(0.28, 20, 14), nodeMat); sa.position.set(...SA); group.add(sa);
  const av = new T.Mesh(new T.SphereGeometry(0.24, 20, 14), nodeMat.clone()); av.position.set(...AV); group.add(av);
  const SEG = {atrium: 0, av: 1, purkinje: 2, ventricle: 3, rest: 4};
  function update(conduction) {
    const seg = SEG[conduction.segment];
    mat.uniforms.uSeg.value = seg; mat.uniforms.uProgress.value = conduction.progress;
    const pulse = seg === 1 ? 1 + 0.6 * Math.sin(conduction.progress * Math.PI) : seg === 0 ? 1.4 : 1;
    av.scale.setScalar(pulse); av.material.opacity = seg === 1 ? 1 : 0.7;
    sa.scale.setScalar(seg === 0 && conduction.progress < 0.3 ? 1.6 : 1);
  }
  return {group, update, material: mat, SA, AV};
}

// 部位の説明（教科書の用語に合わせる）
export const PART_INFO = {
  heart: {name: '心臓の全体', en: 'HEART', desc: 'にぎりこぶしほどの大きさの筋肉のポンプ。右側は肺へ、左側は全身へ血液を送る。2つのポンプが同じ拍子で、同じ量を送り出す。', fact: '心臓は一生で約25億回拍動する。安静時でも1分間に約5 L、全身の血液量とほぼ同じ量を送り出している。'},
  lv: {name: '左心室', en: 'LEFT VENTRICLE', desc: '肺から戻った動脈血を、大動脈を通して全身へ送り出す。全身の血管の抵抗に打ち勝つ高い圧（約120 mmHg）が要るので、壁がいちばん厚い。', fact: '左心室の壁の厚さは右心室の約3倍。送り出す血液の量は左右で同じでも、必要な圧がちがう。'},
  rv: {name: '右心室', en: 'RIGHT VENTRICLE', desc: '全身から戻った静脈血を、肺動脈を通して肺へ送る。肺はすぐ隣にあって血管の抵抗が小さいので、低い圧（約25 mmHg）でよく、壁は薄い。', fact: '右心室は左心室の壁を抱きかかえるような三日月形。断面にすると心室中隔が左心室の壁の一部だと分かる。'},
  la: {name: '左心房', en: 'LEFT ATRIUM', desc: '肺静脈（左右2本ずつ）から動脈血を受け取り、僧帽弁を通して左心室へ送る。心房の収縮は心室の充満の「最後のひと押し」で、安静時は全体の2〜3割を受け持つ（心拍数が上がって充満の時間が短くなると、この割合は増える）。', fact: '心房は心室が収縮している間もふくらみ続け、静脈からの血液をためておく「待合室」の役目をする。'},
  ra: {name: '右心房', en: 'RIGHT ATRIUM', desc: '上大静脈と下大静脈から静脈血を受け取り、三尖弁を通して右心室へ送る。壁の中に洞房結節（ペースメーカー）があり、拍動のリズムはここから始まる。', fact: '洞房結節は自分で周期的に興奮する特別な心筋の集まり。自律神経はこのリズムを速めたり遅くしたりする。'},
  aorta: {name: '大動脈', en: 'AORTA', desc: '左心室から出る、体でいちばん太い動脈。壁が厚く弾性に富み、心室が縮んだときに広がって血液をため、ゆるんでいる間に縮んで押し出す。', fact: 'この弾性のおかげで、心臓は断続的に送り出しているのに、毛細血管では血液がほぼ連続して流れる。'},
  pa: {name: '肺動脈', en: 'PULMONARY ARTERY', desc: '右心室から出て左右に分かれ、肺へ向かう。「動脈」だが流れているのは酸素の少ない静脈血。', fact: '動脈・静脈は「心臓から出る／戻る」で名づけられ、中の血液の色では決まらない。肺動脈と肺静脈はその例外的な組み合わせ。'},
  vc: {name: '大静脈', en: 'VENAE CAVAE', desc: '上半身からの上大静脈と、下半身からの下大静脈。全身を回って酸素を渡した静脈血を右心房へ戻す。', fact: '静脈の圧はとても低い。筋肉の動きと静脈の中の弁が、血液を心臓へ戻すのを助けている。'},
  pv: {name: '肺静脈', en: 'PULMONARY VEINS', desc: '肺で酸素を受け取った動脈血を左心房へ運ぶ。左右の肺から2本ずつ、計4本。', fact: '成人では、動脈血を運ぶ唯一の静脈（胎児の臍静脈は例外）。'},
  mitral: {name: '僧帽弁（左房室弁）', en: 'MITRAL VALVE', desc: '左心房と左心室の間の弁。2枚の弁膜からなる（二尖弁）。心室が縮むと圧で閉じ、腱索が弁膜を引いて心房側へ裏返るのを防ぐ。', fact: '「僧帽」はカトリックの司教がかぶる帽子の形から。'},
  tricuspid: {name: '三尖弁（右房室弁）', en: 'TRICUSPID VALVE', desc: '右心房と右心室の間の弁。3枚の弁膜からなる。房室弁は心室の充満中に開き、心室が収縮を始めると最初に閉じる。', fact: '房室弁が閉じる音が心音の「ドッ」（I 音）、半月弁が閉じる音が「クン」（II 音）。'},
  aortic: {name: '大動脈弁', en: 'AORTIC VALVE', desc: '左心室と大動脈の間の半月弁。左心室の圧が大動脈の圧を上回っている間だけ開く。', fact: '弁には筋肉がなく、圧力の差だけで受動的に開閉する。'},
  pulmonary: {name: '肺動脈弁', en: 'PULMONARY VALVE', desc: '右心室と肺動脈の間の半月弁。3枚のポケット状の弁膜が、逆流しようとする血液を受け止めて閉じる。', fact: '半月弁は心室が収縮している間（駆出期）だけ開く。'},
  sa: {name: '洞房結節', en: 'SA NODE', desc: '右心房の壁にある特別な心筋の集まり。自分で周期的に興奮し、心臓全体のリズムを決める（ペースメーカー）。興奮はまず心房に広がり、心房が収縮する。', fact: '交感神経は興奮の頻度を上げ、副交感神経（迷走神経）は下げる。心臓を体から取り出しても、しばらく拍動が続くのはこの自動性のため。'},
  av: {name: '房室結節', en: 'AV NODE', desc: '心房と心室の境にある中継点。ここで興奮の伝わりがわざと遅れる（約0.1秒）ので、心房が収縮し終えてから心室が収縮する。', fact: '心房と心室の間は結合組織で電気的に絶縁されていて、興奮が通れる道は房室結節だけ。'},
  purkinje: {name: 'ヒス束・プルキンエ線維', en: 'HIS BUNDLE / PURKINJE', desc: '房室結節から心室中隔を下り、左右に分かれて心室の内側に広がる速い伝導路。心室全体がほぼ同時に興奮し、心尖から大血管へ向かって絞り出すように収縮する。', fact: '心電図の QRS 波は、この経路を通って心室が興奮する瞬間を表す。'},
  lung: {name: '肺（毛細血管）', en: 'LUNGS', desc: '肺胞を囲む毛細血管で、血液は二酸化炭素を渡して酸素を受け取る。ここで静脈血が動脈血に変わる。', fact: '肺循環は右心室→肺動脈→肺→肺静脈→左心房。'},
  body: {name: '全身（毛細血管）', en: 'SYSTEMIC CAPILLARIES', desc: '頭・腕・内臓・脚のすべての組織で、血液は酸素と養分を渡し、二酸化炭素を受け取る。ここで動脈血が静脈血に変わる。', fact: '体循環は左心室→大動脈→全身→大静脈→右心房。'},
};
export const LABELS = [
  ['ra', '右心房', [-3.4, 3.3, -0.4], [-8.6, 2.4, 1.6]], ['rv', '右心室', [-3.0, -1.9, 2.6], [-8.6, -3.6, 2.6]], ['la', '左心房', [2.6, 3.6, -2.4], [8.6, 2.0, 1.6]], ['lv', '左心室', [2.8, -2.3, 2.6], [8.6, -4.2, 2.6]],
  ['aorta', '大動脈', [2.4, 8.1, -1.4], [7.6, 10.4, -1.0]], ['pa', '肺動脈', [-0.9, 4.9, 1.9], [-6.8, 7.2, 2.4]], ['vc', '上大静脈', [-2.1, 9.0, -1.0], [-7.8, 11.6, -1.0]], ['vc', '下大静脈', [-2.8, -5.5, -2.8], [-8.4, -7.6, -2.0]], ['pv', '肺静脈', [6.4, 3.1, -3.2], [8.6, -0.9, -2.4]],
  ['lung', '肺', [10.6, 10.0, -2.3], [10.6, 11.4, -2.3]], ['lung', '肺', [-10.6, 10.0, -2.3], [-10.6, 11.4, -2.3]], ['body', '頭・腕', [4.6, 15.6, -1.3], [7.6, 17.2, -1.3]], ['body', '内臓・脚', [6.2, -13.6, -2.5], [9.0, -15.6, -2.5]],
];
export const INNER_LABELS = [['mitral', '僧帽弁', [1.5, 1.5, -0.9], [5.6, 0.4, 4.0]], ['tricuspid', '三尖弁', [-2.1, 1.1, 0.5], [-6.2, -0.2, 4.0]], ['aortic', '大動脈弁', [0.3, 2.1, 0.6], [4.4, 5.0, 4.0]], ['pulmonary', '肺動脈弁', [-1.3, 2.0, 1.65], [-4.6, 4.6, 4.2]], ['sa', '洞房結節', [-2.1, 4.2, -1.4], [-6.2, 6.0, 0.6]], ['av', '房室結節', [-0.7, 1.6, -0.3], [-3.6, 0.0, 4.4]], ['purkinje', 'プルキンエ線維', [1.0, -3.2, 0.0], [5.6, -6.6, 3.0]]];
