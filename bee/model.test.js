import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PARTS, MAX_ORDER, partProgress, explodeOffset, explodeAll, wingPose, wingTip, selfCrossings, noteName, audible, WING, WINGBEAT_HZ} from './model.js';

test('分解図: 0 では組み立ての位置、1 では決めた距離だけ離れる。胸部は動かない', () => {
  for (const p of PARTS) {
    const at0 = explodeOffset(p, 0), at1 = explodeOffset(p, 1);
    assert.deepEqual(at0, [0, 0, 0]);
    assert.ok(Math.abs(Math.hypot(...at1) - p.distance) < 1e-9, `${p.id} は ${p.distance} mm 離れる`);
  }
  assert.deepEqual(explodeAll(1).thorax, [0, 0, 0]);
  assert.deepEqual(explodeAll(0.5).thorax, [0, 0, 0]);
});

test('分解図: スライダーを動かすと各部位は単調に離れ、途中で飛ばない', () => {
  for (const p of PARTS) {
    let prev = 0;
    for (let i = 1; i <= 200; i++) {
      const d = Math.hypot(...explodeOffset(p, i / 200));
      assert.ok(d >= prev - 1e-9, `${p.id} が戻らない`);
      assert.ok(d - prev < p.distance * 0.03 + 1e-9, `${p.id} が飛ばない (t=${i / 200})`);
      prev = d;
    }
  }
});

test('分解図: 外側の部位から順に離れる（触角や毒針は胴体より先に動き出す）', () => {
  const outer = PARTS.filter((p) => p.order === 0), inner = PARTS.filter((p) => p.order === 2);
  for (const t of [0.05, 0.15, 0.3]) for (const o of outer) for (const i of inner) assert.ok(partProgress(o, t) >= partProgress(i, t), `${o.id} ≥ ${i.id} at ${t}`);
  assert.ok(partProgress(inner[0], 0.1) === 0, '内側の部位は最初は動かない');
  assert.ok(partProgress(outer[0], 0.1) > 0, '外側の部位は最初から動く');
  assert.ok(MAX_ORDER >= 2);
});

test('分解図: 腹部の節は後ろの節ほど遠くへ（入れ子になって伸びる）、右側の部位は z を反転できる', () => {
  const ab = PARTS.filter((p) => p.id.startsWith('abdomen'));
  for (let i = 1; i < ab.length; i++) assert.ok(ab[i].distance > ab[i - 1].distance);
  const eye = PARTS.find((p) => p.id === 'eye');
  assert.ok(explodeOffset(eye, 1, 1)[2] > 0 && explodeOffset(eye, 1, -1)[2] < 0);
});

test('翅の動き: ストロークは ±45°（振幅 90°）、上下のずれは 2 倍の周期、ひねりは打ち下ろしと打ち上げで逆向き', () => {
  const s = (ph) => wingPose(ph).stroke;
  assert.ok(Math.abs(s(0) - 45) < 1e-9 && Math.abs(s(0.5) + 45) < 1e-9);
  assert.ok(Math.abs(wingPose(0.25).deviation) < 1e-9 && Math.abs(wingPose(0.125).deviation - WING.deviation) < 1e-9);
  assert.ok(wingPose(0.25).pitch > 0 && wingPose(0.75).pitch < 0, '反転するたびにひねりの向きが変わる');
  assert.ok(Math.abs(wingPose(0).pitch) < 1e-9 && Math.abs(wingPose(0.5).pitch) < 1e-9, '反転の瞬間にひねりが切り替わる');
  for (let i = 0; i < 100; i++) {const t = wingTip(i / 100); assert.ok(Math.abs(Math.hypot(...t) - 9.5) < 1e-9, '翅の長さは変わらない');}
});

test('翅の動き: 翅先の軌跡は 8 の字（自分と 1 回だけ交わる）。上下のずれが無ければ交わらない', () => {
  assert.equal(selfCrossings(), 1);
  assert.equal(selfCrossings(241, {...WING, deviation: 0}), 0);
});

test('羽音: はばたき数がそのまま音の高さになる', () => {
  assert.equal(noteName(440), 'A4');
  assert.equal(noteName(261.63), 'C4');
  assert.equal(noteName(WINGBEAT_HZ), 'A♯3');
  assert.ok(audible(WINGBEAT_HZ) && !audible(WINGBEAT_HZ / 50), '1/50 のスローでは音にならない');
  assert.equal(noteName(0), '—');
});
