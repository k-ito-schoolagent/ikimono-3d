// ミツバチ（働き蜂）のからだを、部位ごとのグループとして組み立てる。座標は mm、+x が前（頭）、+y が上、+z が右
import {T} from '../lib/stage.js';

const v3 = (p) => new T.Vector3(...p);
export const COLORS = {chitin: 0x2b1d14, amber: 0xd79a33, eye: 0x17110d, hair: 0xd2a24a, wing: 0xe9e2d4, pollen: 0xe9c23a, muscle: 0xa5533f, organ: 0xd8b48c, trachea: 0xdfe7ee, vessel: 0xc2574a, nerve: 0xe6d4c3, venom: 0xe5e0c8};
export const MAT = {
  chitin: new T.MeshPhysicalMaterial({color: COLORS.chitin, roughness: 0.45, clearcoat: 0.45, clearcoatRoughness: 0.35}),
  amber: new T.MeshPhysicalMaterial({color: COLORS.amber, roughness: 0.5, clearcoat: 0.4, clearcoatRoughness: 0.4}),
  eye: new T.MeshPhysicalMaterial({color: COLORS.eye, roughness: 0.25, clearcoat: 0.8, clearcoatRoughness: 0.2}),
  hair: new T.MeshStandardMaterial({color: COLORS.hair, roughness: 0.8}),
  wing: new T.MeshPhysicalMaterial({color: COLORS.wing, transparent: true, opacity: 0.42, roughness: 0.2, iridescence: 0.55, iridescenceIOR: 1.3, side: T.DoubleSide, depthWrite: false}),
  vein: new T.LineBasicMaterial({color: 0x3a2a1c, transparent: true, opacity: 0.8}),
  pollen: new T.MeshStandardMaterial({color: COLORS.pollen, roughness: 0.9}),
  muscle: new T.MeshPhysicalMaterial({color: COLORS.muscle, roughness: 0.6, transparent: true, opacity: 0.95}),
  organ: new T.MeshPhysicalMaterial({color: COLORS.organ, roughness: 0.5, transparent: true, opacity: 0.9, clearcoat: 0.3}),
  crop: new T.MeshPhysicalMaterial({color: 0xe0a640, roughness: 0.3, transparent: true, opacity: 0.85, clearcoat: 0.6}),
  trachea: new T.MeshPhysicalMaterial({color: COLORS.trachea, roughness: 0.3, transparent: true, opacity: 0.7, clearcoat: 0.5}),
  vessel: new T.MeshPhysicalMaterial({color: COLORS.vessel, roughness: 0.4, transparent: true, opacity: 0.95}),
  nerve: new T.MeshStandardMaterial({color: COLORS.nerve, roughness: 0.6}),
  venom: new T.MeshPhysicalMaterial({color: COLORS.venom, roughness: 0.3, transparent: true, opacity: 0.85}),
  sting: new T.MeshStandardMaterial({color: 0x1a120d, roughness: 0.3, metalness: 0.1}),
};

const capsuleBetween = (a, b, r, mat, parent, segs = 8) => {
  const A = v3(a), B = v3(b), d = B.clone().sub(A), len = d.length();
  const m = new T.Mesh(new T.CapsuleGeometry(r, Math.max(0.001, len), 4, segs), mat);
  m.position.copy(A).add(B).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize()); m.castShadow = true; parent.add(m); return m;
};
const ellipsoid = (c, r, mat, parent, segs = 40) => {const m = new T.Mesh(new T.SphereGeometry(1, segs, Math.round(segs * 0.7)), mat); m.position.set(...c); m.scale.set(...r); m.castShadow = true; parent.add(m); return m;};

// 毛: 曲面にランダムに生やした細い円錐（インスタンス描画）
function hairs(parent, center, radii, count, length = 0.45, color = COLORS.hair, yMin = -1) {
  const geo = new T.ConeGeometry(0.014, length, 4, 1); geo.translate(0, length / 2, 0);
  const mesh = new T.InstancedMesh(geo, MAT.hair, count); mesh.userData.hair = true;
  const m = new T.Matrix4(), q = new T.Quaternion(), up = new T.Vector3(0, 1, 0), n = new T.Vector3(), p = new T.Vector3(), tilt = new T.Vector3();
  let i = 0, guard = 0;
  while (i < count && guard++ < count * 20) {
    n.randomDirection(); if (n.y < yMin) continue;
    p.set(center[0] + n.x * radii[0], center[1] + n.y * radii[1], center[2] + n.z * radii[2]);
    tilt.randomDirection().multiplyScalar(0.7); n.add(tilt).normalize();
    q.setFromUnitVectors(up, n); m.compose(p, q, new T.Vector3(1, 0.7 + Math.random() * 0.6, 1)); mesh.setMatrixAt(i++, m);
  }
  mesh.count = i; parent.add(mesh); return mesh;
}

// 複眼の個眼: 六角形の模様を描いたテクスチャ
function facetTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#1b1410'; g.fillRect(0, 0, 256, 256);
  const r = 7, h = Math.sqrt(3) / 2 * r;
  for (let y = -r; y < 256 + r; y += h * 2) for (let x = -r; x < 256 + r; x += 3 * r) for (const [ox, oy] of [[0, 0], [1.5 * r, h]]) {
    g.beginPath(); for (let k = 0; k < 6; k++) {const a = (Math.PI / 3) * k + Math.PI / 6; g.lineTo(x + ox + r * 0.92 * Math.cos(a), y + oy + r * 0.92 * Math.sin(a));} g.closePath();
    g.fillStyle = `hsl(28, 30%, ${10 + Math.random() * 8}%)`; g.fill(); g.strokeStyle = 'rgba(120,90,60,.35)'; g.stroke();
  }
  const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(3, 4); return t;
}

// 翅: 輪郭の形（つけ根が原点、+z が外側、+x が前縁側）と翅脈
function wing(length, chord, veins, parent) {
  const shape = new T.Shape();
  const pts = [[0, 0.25], [0.15, 0.42], [0.45, 0.5], [0.75, 0.45], [0.93, 0.3], [1.0, 0.05], [0.97, -0.2], [0.8, -0.42], [0.5, -0.5], [0.2, -0.38], [0, -0.1]];
  shape.moveTo(pts[0][1] * chord, pts[0][0] * length);
  for (let i = 1; i < pts.length; i++) {const a = pts[i - 1], b = pts[i]; shape.quadraticCurveTo(((a[1] + b[1]) / 2) * chord + (b[0] - a[0]) * 0.1, ((a[0] + b[0]) / 2) * length, b[1] * chord, b[0] * length);}
  shape.closePath();
  const geo = new T.ShapeGeometry(shape, 16); geo.rotateX(Math.PI / 2);   // 形は x=弦, y=長さ → x=弦, z=長さ（水平、法線は上下）
  const mesh = new T.Mesh(geo, MAT.wing); mesh.renderOrder = 4; parent.add(mesh);
  const lines = [];
  for (const v of veins) for (let i = 0; i < v.length - 1; i++) lines.push(new T.Vector3(v[i][1] * chord, 0.01, v[i][0] * length), new T.Vector3(v[i + 1][1] * chord, 0.01, v[i + 1][0] * length));
  const veinMesh = new T.LineSegments(new T.BufferGeometry().setFromPoints(lines), MAT.vein); veinMesh.userData.noPaper = true; parent.add(veinMesh);
  return mesh;
}
const FORE_VEINS = [[[0, 0.3], [0.5, 0.4], [0.95, 0.25]], [[0, 0.1], [0.55, 0.1], [0.9, 0.0]], [[0, -0.05], [0.4, -0.2], [0.75, -0.35]], [[0.3, 0.4], [0.35, 0.1], [0.3, -0.15]], [[0.55, 0.4], [0.6, 0.1], [0.55, -0.25]], [[0.75, 0.3], [0.78, 0.0]]];
const HIND_VEINS = [[[0, 0.3], [0.5, 0.4], [0.95, 0.2]], [[0, 0.0], [0.6, -0.05], [0.9, -0.15]], [[0.4, 0.4], [0.42, -0.05]], [[0.7, 0.35], [0.72, -0.1]]];

export function buildBee(parent) {
  const parts = {};
  const group = (id, base) => {const g = new T.Group(); g.position.set(...base); g.userData.base = v3(base); g.userData.part = id; parent.add(g); parts[id] = g; return g;};

  // ---- 胸部（基準）----
  const thorax = group('thorax', [0, 0, 0]);
  ellipsoid([0, 0, 0], [2.3, 2.2, 2.1], MAT.chitin, thorax);
  ellipsoid([-1.9, 0.1, 0], [0.8, 1.6, 1.5], MAT.chitin, thorax);        // 後胸と前伸腹節
  hairs(thorax, [0, 0, 0], [2.35, 2.25, 2.15], 2200, 0.26);
  capsuleBetween([-2.0, -0.4, 0], [-2.8, -0.4, 0], 0.42, MAT.chitin, thorax);   // 腹柄（くびれ）
  // 胸部の気門 3 対
  for (const [x, y] of [[1.6, -0.4], [-0.6, -0.5], [-2.2, 0.2]]) for (const s of [1, -1]) {const d = new T.Mesh(new T.CircleGeometry(0.14, 12), MAT.sting); d.position.set(x, y, s * 2.05); d.rotation.y = s * Math.PI / 2; thorax.add(d);}

  // ---- 頭部 ----
  const head = group('head', [3.6, 0.2, 0]);
  ellipsoid([0, 0, 0], [1.35, 1.9, 2.05], MAT.chitin, head);
  hairs(head, [0, 0, 0], [1.4, 1.95, 2.1], 380, 0.18);
  const eyeTex = facetTexture();
  const eye = group('eye', [3.7, 0.4, 0]);
  for (const s of [1, -1]) {const e = ellipsoid([0.05, 0.1, s * 1.75], [0.95, 1.5, 0.6], MAT.eye.clone(), eye); e.material.map = eyeTex; e.material.bumpMap = eyeTex; e.material.bumpScale = 0.02; e.userData.side = s;}
  const ocelli = group('ocelli', [3.9, 2.0, 0]);
  for (const [x, y, z] of [[0.15, 0.1, 0], [-0.15, -0.05, 0.45], [-0.15, -0.05, -0.45]]) ellipsoid([x, y, z], [0.17, 0.17, 0.17], MAT.eye, ocelli, 16);
  // 触角: 柄節（長い第1節）、短い梗節（第2節）、そこで折れ曲がった鞭節 10 節 ＝ 計 12 節（働き蜂）
  const antenna = group('antenna', [4.7, 0.9, 0]);
  for (const s of [1, -1]) {
    const base = [0, 0, s * 0.55], elbow = [1.2, 1.0, s * 1.0];
    capsuleBetween(base, elbow, 0.09, MAT.chitin, antenna);
    let dir = new T.Vector3(0.75, -0.45, s * 0.55).normalize(), p = v3(elbow).add(dir.clone().multiplyScalar(0.3));
    capsuleBetween(elbow, p.toArray(), 0.1, MAT.chitin, antenna);   // 梗節
    for (let i = 0; i < 10; i++) {const q = p.clone().add(dir.clone().multiplyScalar(0.34)); capsuleBetween(p.toArray(), q.toArray(), 0.075, MAT.chitin, antenna, 6); p = q; dir.applyAxisAngle(new T.Vector3(0, 0, 1), -0.04);}
  }
  // 口器: 大あご 2 枚と、折りたたんだ吻（舌）
  const mouth = group('mouth', [4.6, -1.3, 0]);
  for (const s of [1, -1]) {const m = new T.Mesh(new T.BoxGeometry(0.7, 0.25, 0.35), MAT.chitin); m.position.set(0.3, 0, s * 0.45); m.rotation.y = -s * 0.5; mouth.add(m);}
  capsuleBetween([0.2, -0.2, 0], [-0.8, -0.65, 0], 0.11, MAT.amber, mouth); capsuleBetween([-0.8, -0.65, 0], [-1.6, -0.3, 0], 0.09, MAT.amber, mouth);

  // ---- 腹部: 6 つの節（前半が琥珀色、後半が暗い帯）----
  const radii = [[1.9, 1.7], [2.1, 1.85], [2.05, 1.8], [1.85, 1.6], [1.5, 1.3], [1.05, 0.9]];
  let x0 = -3.2;
  radii.forEach(([ry, rz], i) => {
    const g = group(`abdomen${i + 1}`, [x0, -0.2, 0]);
    const len = 1.5, prof = [];
    for (let k = 0; k <= 16; k++) {const u = k / 16, r = Math.sin(Math.PI * (0.08 + 0.84 * u)); prof.push(new T.Vector2(Math.max(0.05, r), (0.5 - u) * len));}
    const geo = new T.LatheGeometry(prof, 36); geo.rotateZ(-Math.PI / 2);          // y 軸 → x 軸（前が +x）
    const pos = geo.attributes.position, col = new Float32Array(pos.count * 3), amber = new T.Color(COLORS.amber), dark = new T.Color(COLORS.chitin), tmp = new T.Color();
    for (let k = 0; k < pos.count; k++) {const u = 0.5 - pos.getX(k) / len; tmp.copy(amber).lerp(dark, u > 0.66 ? 1 : u > 0.56 ? (u - 0.56) / 0.1 : 0); if (pos.getY(k) < -0.5) tmp.lerp(new T.Color(0x5a3a22), 0.5); col.set([tmp.r, tmp.g, tmp.b], k * 3);}
    geo.setAttribute('color', new T.BufferAttribute(col, 3));
    const m = new T.Mesh(geo, new T.MeshPhysicalMaterial({vertexColors: true, roughness: 0.5, clearcoat: 0.45, clearcoatRoughness: 0.35})); m.scale.set(1, ry, rz); m.castShadow = true; g.add(m);
    hairs(g, [0, 0, 0], [0.75, ry * 1.0, rz * 1.0], 140, 0.14, COLORS.hair, -0.2);
    // 気門（腹部 7 対のうち見える 6 対）と、蝋腺（第 4〜7 節の腹側）
    for (const s of [1, -1]) {const d = new T.Mesh(new T.CircleGeometry(0.12, 12), MAT.sting); d.position.set(-0.15, -0.2 * ry, s * rz * 0.99); d.rotation.y = s * Math.PI / 2; g.add(d);}
    if (i >= 2) for (const s of [1, -1]) {const w = new T.Mesh(new T.PlaneGeometry(0.6, 0.45), MAT.amber); w.position.set(-0.2, -ry * 0.98, s * rz * 0.35); w.rotation.x = Math.PI / 2; w.userData.noPaper = true; g.add(w);}
    x0 -= 1.15 - i * 0.03;
  });
  // 毒針（と、透視で見える毒嚢）
  const sting = group('sting', [x0 + 0.4, -0.35, 0]);
  const needle = new T.Mesh(new T.ConeGeometry(0.09, 1.7, 10), MAT.sting); needle.rotation.z = Math.PI / 2; needle.position.x = -0.85; sting.add(needle);
  ellipsoid([-0.2, 0.1, 0], [0.3, 0.26, 0.26], MAT.chitin, sting, 16);

  // ---- 脚 3 対（基節→腿節→脛節→跗節）----
  const legs = {
    foreleg: [[1.3, -1.5, 1.0], [1.6, -1.9, 1.5], [2.9, -1.2, 3.0], [3.6, -3.3, 3.4], [4.3, -4.6, 3.0], [4.9, -4.9, 2.7]],
    midleg: [[0.1, -1.7, 1.2], [0.1, -2.1, 1.8], [-0.2, -1.4, 3.6], [0.2, -3.8, 4.2], [0.8, -4.8, 4.6], [1.3, -4.9, 4.9]],
    hindleg: [[-1.2, -1.6, 1.3], [-1.5, -2.0, 1.9], [-2.6, -1.0, 3.9], [-3.4, -3.9, 4.3], [-3.8, -4.9, 3.8], [-4.3, -4.9, 3.4]],
  };
  for (const [id, pts] of Object.entries(legs)) {
    const g = group(id, [0, 0, 0]);
    for (const s of [1, -1]) {
      const P = pts.map(([x, y, z]) => [x, y, z * s]);
      const r = [0.27, 0.23, 0.19, 0.14, 0.11];
      for (let i = 0; i < P.length - 1; i++) {
        const seg = capsuleBetween(P[i], P[i + 1], r[i], MAT.chitin, g); seg.userData.chain = i;
        if (id === 'hindleg' && i === 2) {seg.scale.set(2.2, 1, 1.2); const pollen = ellipsoid([(P[2][0] + P[3][0]) / 2 + 0.1, (P[2][1] + P[3][1]) / 2, (P[2][2] + P[3][2]) / 2 + s * 0.35], [0.55, 0.45, 0.4], MAT.pollen, g, 20); pollen.userData.chain = 2;}   // 花粉かごと花粉団子
      }
      for (const k of [1, -1]) {const claw = new T.Mesh(new T.ConeGeometry(0.05, 0.3, 6), MAT.sting); claw.position.set(P[5][0] + 0.15, P[5][1] - 0.05, P[5][2] + k * 0.08); claw.rotation.z = -Math.PI / 2; claw.userData.chain = 4; g.add(claw);}
    }
  }

  // ---- 翅 2 対（前翅と後翅。後翅の前縁に翅鉤）----
  const wingSets = {left: [], right: []};
  const forewing = group('forewing', [0.6, 2.0, 0]), hindwing = group('hindwing', [-0.3, 1.9, 0]);
  for (const s of [1, -1]) {
    const makeSet = (holder, length, chord, veins, hooks) => {
      const list = [];
      for (let k = 0; k < 5; k++) {                   // 0 が本体、1〜4 はブレ表示のゴースト
        const pivot = new T.Group(); pivot.position.z = s * 1.3; pivot.scale.z = s; holder.add(pivot);
        const w = wing(length, chord, veins, pivot); if (k > 0) {w.material = MAT.wing.clone(); w.material.opacity = 0.1; pivot.visible = false; pivot.userData.ghost = true;}
        if (hooks && k === 0) {const hg = new T.ConeGeometry(0.03, 0.14, 5); const hm = new T.InstancedMesh(hg, MAT.sting, 20); const m = new T.Matrix4(); for (let i = 0; i < 20; i++) {m.makeRotationZ(-Math.PI / 2); m.setPosition(0.46 * chord + 0.02, 0.03, length * (0.35 + i * 0.022)); hm.setMatrixAt(i, m);} pivot.add(hm);}
        list.push(pivot);
      }
      return list;
    };
    wingSets[s > 0 ? 'right' : 'left'].push(makeSet(forewing, 9.5, 3.2, FORE_VEINS, false), makeSet(hindwing, 6.5, 2.1, HIND_VEINS, true));
  }

  // ---- 透視で見える中身 ----
  const organs = new T.Group(); organs.visible = false; parent.add(organs);
  const organ = (id, mesh) => {mesh.userData.part = id; organs.add(mesh); return mesh;};
  // 間接飛翔筋: 背縦走筋（前後方向）と背腹筋（上下方向）。翅は胸部をたわませて動かす
  organ('flightMuscle', (() => {const g = new T.Group(); const a = new T.Mesh(new T.BoxGeometry(3.0, 1.0, 1.5), MAT.muscle); a.position.set(0.1, 0.55, 0); g.add(a); for (const s of [1, -1]) {const b = new T.Mesh(new T.BoxGeometry(1.0, 2.1, 0.55), MAT.muscle); b.position.set(0.5, -0.3, s * 1.0); g.add(b);} return g;})());
  // 消化管: 食道 → 蜜胃 → 中腸 → 後腸・直腸
  const gut = new T.CatmullRomCurve3([v3([3.2, -0.4, 0]), v3([0.5, -0.6, 0]), v3([-2.4, -0.4, 0]), v3([-3.3, -0.1, 0])]);
  organ('crop', (() => {const g = new T.Group(); g.add(new T.Mesh(new T.TubeGeometry(gut, 24, 0.14, 8, false), MAT.organ)); const c = new T.Mesh(new T.SphereGeometry(1, 24, 16), MAT.crop); c.position.set(-3.9, -0.1, 0); c.scale.set(0.95, 0.85, 0.85); g.add(c); return g;})());
  const mid = new T.CatmullRomCurve3([v3([-4.8, -0.2, 0]), v3([-5.4, 0.5, 0.6]), v3([-6.1, -0.5, -0.5]), v3([-6.8, 0.4, 0.5]), v3([-7.5, -0.4, -0.3]), v3([-8.1, 0.0, 0])]);
  organ('midgut', new T.Mesh(new T.TubeGeometry(mid, 48, 0.36, 10, false), MAT.organ));
  organ('hindgut', new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3([v3([-8.1, 0.0, 0]), v3([-8.9, -0.2, 0]), v3([-9.6, -0.35, 0])]), 12, 0.28, 8, false), MAT.organ));
  // 背脈管: 腹部の「心臓」から胸を通って頭まで走る管。開放血管系なので血管はこれだけ
  const dv = new T.CatmullRomCurve3([v3([-9.0, 1.1, 0]), v3([-7.5, 1.45, 0]), v3([-6.0, 1.6, 0]), v3([-4.5, 1.7, 0]), v3([-3.2, 1.5, 0]), v3([-1.5, 1.6, 0]), v3([1.0, 1.75, 0]), v3([3.0, 1.0, 0]), v3([4.3, 0.6, 0])]);
  organ('dorsalVessel', (() => {const g = new T.Group(); g.add(new T.Mesh(new T.TubeGeometry(dv, 64, 0.13, 8, false), MAT.vessel)); for (const x of [-8.2, -6.8, -5.4, -4.0]) {const o = new T.Mesh(new T.SphereGeometry(0.22, 12, 8), MAT.vessel); o.position.copy(dv.getPointAt((x + 9.0) / 13.3)); o.userData.ostium = true; g.add(o);} return g;})());
  // 気管系: 気門から入った空気が気管と気嚢で体のすみずみへ（肺はない）
  organ('trachea', (() => {const g = new T.Group(); for (const s of [1, -1]) {const trunk = new T.CatmullRomCurve3([v3([-9.0, -0.3, s * 0.9]), v3([-6.5, 0.1, s * 1.5]), v3([-3.6, 0.2, s * 1.55]), v3([-0.8, -0.3, s * 1.75]), v3([1.6, -0.4, s * 1.7]), v3([3.4, -0.2, s * 1.3])]); g.add(new T.Mesh(new T.TubeGeometry(trunk, 48, 0.12, 7, false), MAT.trachea)); const sac1 = new T.Mesh(new T.SphereGeometry(1, 20, 14), MAT.trachea); sac1.position.set(-5.0, 0.7, s * 1.0); sac1.scale.set(1.7, 0.7, 0.55); g.add(sac1); const sac2 = new T.Mesh(new T.SphereGeometry(1, 20, 14), MAT.trachea); sac2.position.set(0.2, 0.8, s * 1.35); sac2.scale.set(0.9, 0.6, 0.45); g.add(sac2); for (const x of [-3.35, -4.5, -5.65, -6.8, -7.9, -8.9]) g.add(new T.Mesh(new T.TubeGeometry(new T.LineCurve3(v3([x, -0.4, s * 1.5]), v3([x, -0.3, s * 1.0])), 2, 0.07, 6, false), MAT.trachea));} return g;})());
  // 神経: 脳と腹神経索（節ごとの神経節）
  organ('nerve', (() => {const g = new T.Group(); for (const s of [1, -1]) {const b = new T.Mesh(new T.SphereGeometry(0.42, 16, 12), MAT.nerve); b.position.set(3.6, 0.9, s * 0.42); g.add(b);} const chain = [[3.4, -1.1, 0], [2.0, -1.5, 0], [0.4, -1.6, 0], [-1.3, -1.5, 0], [-3.5, -1.3, 0], [-4.7, -1.2, 0], [-5.9, -1.1, 0], [-7.1, -0.9, 0], [-8.3, -0.7, 0]]; g.add(new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3([v3([3.6, 0.6, 0]), ...chain.map(v3)]), 48, 0.06, 6, false), MAT.nerve)); for (const c of chain) {const n = new T.Mesh(new T.SphereGeometry(0.19, 10, 8), MAT.nerve); n.position.set(...c); g.add(n);} return g;})());
  // 毒腺と毒嚢
  organ('venom', (() => {const g = new T.Group(); const sac = new T.Mesh(new T.SphereGeometry(1, 16, 12), MAT.venom); sac.position.set(-8.6, 0.25, 0); sac.scale.set(0.55, 0.42, 0.42); g.add(sac); g.add(new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3([v3([-8.6, 0.5, 0]), v3([-7.6, 0.9, 0.5]), v3([-7.0, 0.6, -0.4]), v3([-6.4, 1.0, 0.3])]), 24, 0.06, 6, false), MAT.venom)); return g;})());
  organs.traverse((o) => {if (o.isMesh) {o.renderOrder = 3;}});

  return {parts, wingSets, organs, floorY: -4.95};
}

// 部位の説明（教科書の用語に合わせる）
export const PART_INFO = {
  bee: {name: 'ミツバチ（働き蜂）の全体', en: 'HONEY BEE · WORKER', desc: '昆虫のからだは頭部・胸部・腹部の3つに分かれ、外骨格（クチクラ）でおおわれている。脚3対と翅2対はすべて胸部につく。', fact: '働き蜂はふつう卵を産まないメス。体長は12〜14 mm、はばたきはホバリング時で1秒に約230回。'},
  head: {name: '頭部', en: 'HEAD', desc: '感覚と食べることの中心。複眼、単眼、触角、口器がつく。脳もここにある。', fact: '頭を自由に回せるのは、頭と胸が細い首でつながっているから。'},
  eye: {name: '複眼', en: 'COMPOUND EYES', desc: '小さな目（個眼）が数千個集まったもの。それぞれが別の方向を見ていて、動くものにとても敏感。紫外線が見え、赤はほとんど見えない。', fact: '働き蜂の複眼は片側に約4,000〜5,000個の個眼。花の「紫外線の模様」を目印にする。'},
  ocelli: {name: '単眼', en: 'OCELLI', desc: '頭のてっぺんに3つ。像は結ばず、明るさの変化を感じて姿勢や飛ぶ向きを保つのに使う。', fact: 'ミツバチのように単眼が3つある昆虫では、複眼2つと合わせて「目が5つ」。'},
  antenna: {name: '触角', en: 'ANTENNAE', desc: 'においと振動を感じる。長い柄節と短い梗節の間で折れ曲がる「く」の字の形。鞭節の表面に多数の感覚器がある。', fact: '働き蜂（メス）は12節、オスは13節。仲間のにおいを嗅ぎ分けて巣を守る。'},
  mouth: {name: '口器', en: 'MOUTHPARTS', desc: '大あごで花粉や蜜ろうをかみ、吻（舌）をのばして蜜を吸う。使わないときは吻を折りたたむ。', fact: '吸った蜜は蜜胃にためて巣へ運び、仲間に口移しで渡す。'},
  thorax: {name: '胸部', en: 'THORAX', desc: '運動の中心。前胸・中胸・後胸の3節からなり、脚3対と翅2対がつく。中は飛翔筋でいっぱい。', fact: 'ミツバチの翅は筋肉が直接動かすのではなく、胸部の壁を変形させて動かす（間接飛翔筋）。'},
  foreleg: {name: '前脚', en: 'FORELEGS', desc: '歩くだけでなく、触角をきれいにする「触角掃除器」の切れこみがある。', fact: '脚の先の爪と肉盤で、ガラスのようなつるつるの面にもとまれる。'},
  midleg: {name: '中脚', en: 'MIDLEGS', desc: '歩行と、体についた花粉を後脚の花粉かごへ送るのに使う。', fact: '昆虫の脚は 基節・転節・腿節・脛節・跗節 の順につながる。'},
  hindleg: {name: '後脚', en: 'HINDLEGS · POLLEN BASKET', desc: '脛節の外側が平らにくぼみ、まわりの長い毛で囲まれた「花粉かご」がある。集めた花粉を団子にしてここにつけて運ぶ。', fact: '花粉団子は幼虫のタンパク質源。1回の採餌で体重の数割の花粉を運ぶ。'},
  forewing: {name: '前翅', en: 'FOREWINGS', desc: '2対の翅のうち大きい方。薄い膜を翅脈が支える。飛ぶときは前翅と後翅がつながって1枚の翅として動く。', fact: '翅の先は8の字を描く。ゆっくりにすると、反転のたびにひねりの向きが変わるのが見える。'},
  hindwing: {name: '後翅・翅鉤', en: 'HINDWINGS · HAMULI', desc: '前縁に並んだ小さなかぎ（翅鉤）が前翅の後縁に引っかかり、2枚が連結して動く。休むときは外れて重ねてたたむ。', fact: 'ハチの仲間（膜翅目）の「膜翅」は膜のような翅のこと。翅鉤で2枚を連結するのはハチ類の特徴で、働き蜂では片側20個ほど。'},
  abdomen: {name: '腹部', en: 'ABDOMEN', desc: '消化、呼吸、循環、生殖の器官が入る。節が入れ子になっていて、伸び縮みして呼吸の動きをつくる。黄色と黒の帯は警告色。見えている節は形態学では第2〜7節で、第1節は胸にくっついて前伸腹節になっている。', fact: '腹部の側面に気門が並ぶ。腹側には蝋腺があり、巣の材料の蜜ろうを分泌する。'},
  sting: {name: '毒針', en: 'STING', desc: '産卵管が変化したもの（だからメスにしかない）。先に返しがあり、ヒトなど哺乳類の弾力のある皮ふを刺すと抜けなくなって毒嚢ごと残る。', fact: 'そのときは刺した働き蜂は死んでしまう（ほかの昆虫を刺すときは抜ける）。女王蜂の針は返しが小さく、何度も刺せる。'},
  flightMuscle: {name: '飛翔筋（間接飛翔筋）', en: 'FLIGHT MUSCLES', desc: '胸部を前後に縮める背縦走筋と、上下に縮める背腹筋。交互に縮んで胸部の壁をたわませ、その振動で翅を打ち下ろし・打ち上げる。', fact: '神経の信号1回で何回も収縮する特別な筋肉（非同期筋）。だから1秒に230回も動ける。'},
  crop: {name: '食道と蜜胃', en: 'CROP · HONEY STOMACH', desc: '吸った花の蜜をためる袋。巣に戻って口移しで渡した蜜が、仲間の酵素と水分の蒸発でハチミツになる。', fact: '蜜胃と中腸の間には弁（前胃）があり、自分に必要な分だけ中腸へ送って、残りを巣へ運ぶ。'},
  midgut: {name: '中腸', en: 'MIDGUT', desc: '消化と吸収の中心。花粉のタンパク質をここで消化する。', fact: 'ヒトの小腸にあたる。'},
  hindgut: {name: '後腸・直腸', en: 'HINDGUT', desc: '水分を回収して排泄する。冬のあいだは巣の中で排泄せず、直腸にためておく。', fact: '暖かい日に巣の外へ出て「脱糞飛行」をする。'},
  dorsalVessel: {name: '背脈管（心臓）', en: 'DORSAL VESSEL', desc: '背中側を走る1本の管。腹部の部分が心臓で、小さな穴（心門）から体液を取りこみ、頭へ向かって送り出す。血管はこれだけで、体液は体のすき間を流れて戻る（開放血管系）。', fact: '昆虫の体液（血リンパ）は酸素を運ばない。酸素は気管が直接届けるので、ヒトの血液のように赤くない。'},
  trachea: {name: '気門・気管・気嚢', en: 'SPIRACLES · TRACHEAE · AIR SACS', desc: '体の側面の気門から空気が入り、枝分かれした気管が細胞のすぐそばまで酸素を届ける。ふくらんだ気嚢は腹部の伸び縮みでポンプになる。肺はない。', fact: '気門は10対（胸に3対、腹に7対）。気管の壁はらせん状の肥厚で、つぶれないようになっている。'},
  nerve: {name: '脳と腹神経索', en: 'BRAIN · VENTRAL NERVE CORD', desc: '頭の脳から、腹側を走る神経のひもが後ろへのび、節ごとに神経節（小さな脳）がある。', fact: '脳は約100万個の神経細胞。それでも仲間の踊りで花の場所を伝え合う。'},
  venom: {name: '毒腺・毒嚢', en: 'VENOM GLAND · SAC', desc: '毒腺でつくった毒を毒嚢にためておき、刺すときに針から注入する。', fact: '毒の主成分はメリチンというタンパク質。'},
};
export const LABELS = [
  ['head', '頭部', [4.6, 2.4, 0], [8.5, 5.5, 1]], ['eye', '複眼', [3.8, 0.5, 2.4], [7.0, -0.5, 6.5]], ['ocelli', '単眼', [3.9, 2.3, 0], [3.5, 6.2, -2]], ['antenna', '触角', [7.5, 1.3, 1.2], [11, 4.2, 3]], ['mouth', '口器', [4.3, -1.9, 0], [8.5, -3.6, 2.5]],
  ['thorax', '胸部', [0, 2.3, 0], [-1.5, 6.5, 0.5]], ['forewing', '前翅', [-5.0, 2.3, 4.0], [-7, 7.5, 7]], ['hindwing', '後翅・翅鉤', [-3.4, 1.9, 2.8], [-11, 4.5, 6]],
  ['foreleg', '前脚', [3.6, -3.3, 3.4], [7.5, -5.5, 6]], ['midleg', '中脚', [0.2, -3.8, 4.2], [1.5, -6.5, 8]], ['hindleg', '後脚（花粉かご）', [-3.4, -3.9, 4.3], [-6, -6.5, 8]],
  ['abdomen', '腹部', [-6.0, 1.9, 0], [-8, 6.0, -3]], ['sting', '毒針', [-10.5, -0.5, 0], [-14, -2.5, 2]],
];
export const INNER_LABELS = [
  ['flightMuscle', '飛翔筋', [0.1, 0.5, 0], [2.5, 6.0, -4]], ['crop', '蜜胃', [-3.9, -0.1, 0], [-2, -5.5, -5]], ['midgut', '中腸', [-6.5, 0, 0], [-7, -5.0, -6]], ['dorsalVessel', '背脈管', [-5.5, 1.7, 0], [-5, 6.5, -5]],
  ['trachea', '気管と気嚢', [-5.0, 0.7, 1.0], [-10, 2.5, 7]], ['nerve', '脳と腹神経索', [0.4, -1.6, 0], [4.5, -5.8, -5]], ['venom', '毒嚢', [-8.6, 0.25, 0], [-12.5, 3, -4]],
];
