import {test} from 'node:test';
import assert from 'node:assert/strict';
import {relativeVolume, tonicity, lyses, step, ISOTONIC, LYSIS_RATIO} from './osmosis-model.js';

test('等張液では体積が変わらない', () => {
  assert.ok(Math.abs(relativeVolume(ISOTONIC) - 1) < 1e-9);
  assert.equal(tonicity(ISOTONIC).kind, 'isotonic');
});
test('高張液では縮み、低張液ではふくらむ。濃度に対して単調', () => {
  let prev = relativeVolume(0.05);
  for (let c = 0.06; c <= 0.9; c += 0.01) {const v = relativeVolume(c); assert.ok(v < prev, `濃度が上がると体積は減る (${c.toFixed(2)})`); prev = v;}
  assert.ok(relativeVolume(0.6) < 1 && relativeVolume(0.15) > 1);
  assert.equal(tonicity(0.6).kind, 'hypertonic'); assert.equal(tonicity(0.15).kind, 'hypotonic');
});
test('水が出入りしない部分より小さくはならない', () => {
  assert.ok(relativeVolume(0.9) > 0.4);
});
test('溶血: 低張液で体積が限界を超えると破れる', () => {
  assert.ok(!lyses(ISOTONIC) && !lyses(0.25));
  assert.ok(lyses(0.05));
  const c = ISOTONIC * (1 - 0.4) / (LYSIS_RATIO - 0.4);           // ちょうど限界になる濃度
  assert.ok(!lyses(c * 1.01) && lyses(c * 0.99));
});
test('時間変化: 目標の体積に単調に近づき、十分な時間でほぼ一致する', () => {
  let v = 1;
  const target = relativeVolume(0.6);
  for (let i = 0; i < 600; i++) {const next = step(v, 0.6, 0.01); assert.ok(next <= v && next >= target - 1e-9); v = next;}
  assert.ok(Math.abs(v - target) < 0.01);
});
