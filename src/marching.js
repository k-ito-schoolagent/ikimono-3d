// スカラー場（符号付き距離）から等値面を三角形メッシュにする（マーチングキューブ法）。
// 表のデータは three.js の MarchingCubes アドオンのものを使い、頂点は辺ごとに共有して法線は場の勾配から求める。
import {edgeTable, triTable} from 'three/addons/objects/MarchingCubes.js';
import {BufferGeometry, Float32BufferAttribute, Uint32BufferAttribute, Uint16BufferAttribute} from 'three';

// 立方体の 12 本の辺: [始点の頂点番号, 軸 (0=x,1=y,2=z)]。頂点番号は三 js の表と同じ並び
const EDGE_DEF = [[0, 0], [1, 1], [3, 0], [0, 1], [4, 0], [5, 1], [7, 0], [4, 1], [0, 2], [1, 2], [2, 2], [3, 2]];
const CORNER = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];

// field(x, y, z) は内側で負・外側で正の値を返す。attributes(x, y, z) は頂点ごとの追加属性（任意）
// 結果は型付き配列（Worker から転送できる）。three.js のジオメトリにするには toGeometry() を使う
export function polygonizeRaw(field, {min, max, step, attributes, normalEps}) {
  const nx = Math.ceil((max[0] - min[0]) / step) + 1, ny = Math.ceil((max[1] - min[1]) / step) + 1, nz = Math.ceil((max[2] - min[2]) / step) + 1;
  const values = new Float32Array(nx * ny * nz);
  const idx = (x, y, z) => (x * ny + y) * nz + z;
  for (let x = 0; x < nx; x++) for (let y = 0; y < ny; y++) for (let z = 0; z < nz; z++) values[idx(x, y, z)] = field(min[0] + x * step, min[1] + y * step, min[2] + z * step);
  const positions = [], normals = [], indices = [], extra = attributes ? attributes.names.map(() => []) : null;
  const edgeCache = new Map();
  const eps = normalEps || step * 0.5;
  function vertexOn(x, y, z, axis) {
    const key = idx(x, y, z) * 3 + axis;
    let i = edgeCache.get(key);
    if (i !== undefined) return i;
    const a = values[idx(x, y, z)], b = values[idx(x + (axis === 0), y + (axis === 1), z + (axis === 2))];
    const t = Math.abs(b - a) < 1e-9 ? 0.5 : a / (a - b);
    const px = min[0] + (x + (axis === 0 ? t : 0)) * step, py = min[1] + (y + (axis === 1 ? t : 0)) * step, pz = min[2] + (z + (axis === 2 ? t : 0)) * step;
    let gx = field(px + eps, py, pz) - field(px - eps, py, pz), gy = field(px, py + eps, pz) - field(px, py - eps, pz), gz = field(px, py, pz + eps) - field(px, py, pz - eps);
    const l = Math.hypot(gx, gy, gz) || 1; gx /= l; gy /= l; gz /= l;
    i = positions.length / 3;
    positions.push(px, py, pz); normals.push(gx, gy, gz);
    if (attributes) {const vals = attributes.at(px, py, pz); for (let k = 0; k < extra.length; k++) extra[k].push(...vals[k]);}
    edgeCache.set(key, i);
    return i;
  }
  for (let x = 0; x < nx - 1; x++) for (let y = 0; y < ny - 1; y++) for (let z = 0; z < nz - 1; z++) {
    let cube = 0;
    for (let c = 0; c < 8; c++) if (values[idx(x + CORNER[c][0], y + CORNER[c][1], z + CORNER[c][2])] < 0) cube |= 1 << c;
    const edges = edgeTable[cube];
    if (!edges) continue;
    const v = new Array(12);
    for (let e = 0; e < 12; e++) if (edges & (1 << e)) {const [c, axis] = EDGE_DEF[e]; v[e] = vertexOn(x + CORNER[c][0], y + CORNER[c][1], z + CORNER[c][2], axis);}
    // 表は「内側 = 値が大きい」向きなので、内側を負にしている本モジュールでは頂点の順を入れかえて外向きの面にする
    for (let t = cube * 16; triTable[t] !== -1; t += 3) indices.push(v[triTable[t]], v[triTable[t + 2]], v[triTable[t + 1]]);
  }
  const out = {position: new Float32Array(positions), normal: new Float32Array(normals), index: new Uint32Array(indices), attributes: {}};
  if (attributes) attributes.names.forEach((name, k) => (out.attributes[name] = {array: new Float32Array(extra[k]), size: attributes.sizes[k]}));
  return out;
}
export function toGeometry(raw) {
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(raw.position, 3));
  geo.setAttribute('normal', new Float32BufferAttribute(raw.normal, 3));
  for (const [name, a] of Object.entries(raw.attributes)) geo.setAttribute(name, new Float32BufferAttribute(a.array, a.size));
  geo.setIndex(new (raw.index.length > 65535 ? Uint32BufferAttribute : Uint16BufferAttribute)(raw.index, 1));
  return geo;
}
export function polygonize(field, options) {return toGeometry(polygonizeRaw(field, options));}
