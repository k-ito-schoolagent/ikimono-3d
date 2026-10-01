// 心臓の形を別スレッドで計算する（ページの表示を止めないため）
import {polygonizeRaw} from '../lib/marching.js';
import {buildField, FIELD_BOUNDS} from './field.js';
self.onmessage = (e) => {
  const F = buildField();
  const raw = polygonizeRaw(F.field, {...FIELD_BOUNDS, step: e.data.step, attributes: {names: ['part', 'lobe', 'vess'], sizes: [2, 4, 1], at: (x, y, z) => F.classify(x, y, z)}});
  const buffers = [raw.position.buffer, raw.normal.buffer, raw.index.buffer, ...Object.values(raw.attributes).map((a) => a.array.buffer)];
  self.postMessage(raw, buffers);
};
