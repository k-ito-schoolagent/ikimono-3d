import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cycleTiming, strokeVolume, aorticPressure, stateAt, PHASES, HR_MIN, HR_MAX} from './heart-model.js';

const hrs = [40, 55, 70, 90, 110, 130, 150, 165, 180];
const samples = (hr, n = 400) => Array.from({length: n}, (_, i) => stateAt((i / n) * cycleTiming(hr).rr, hr));
const fromP = (t, tm) => (((t - tm.pOnset) % tm.rr) + tm.rr) % tm.rr;   // P 波の始まりを 0 にした時刻

test('心周期: 各区間が順に並び、心房収縮は房室弁が開いた後・心室収縮の前。合計は RR = 60 / 心拍数', () => {
  for (const hr of hrs) {
    const tm = cycleTiming(hr);
    assert.ok(Math.abs(tm.rr - 60 / hr) < 1e-9);
    assert.ok(0 < tm.ejectStart && tm.ejectStart < tm.ventEnd && tm.ventEnd < tm.relaxEnd && tm.relaxEnd <= tm.atrialStart);
    assert.ok(tm.atrialStart < tm.atrialEnd && tm.atrialEnd < tm.rr, `心房収縮が終わってから心室が収縮する (${hr})`);
    assert.ok(tm.diastoleDur > 0 && tm.fillWindow > 0);
    assert.ok(tm.pr >= 0.1 && tm.pr <= 0.2, 'PR 時間は 0.10〜0.20 s');
  }
});

test('安静時 (70 bpm) の代表値: 心室収縮期 約0.3 s、1回拍出量 約70 mL、心拍出量 約5 L/min、血圧 120/80', () => {
  const tm = cycleTiming(70), sv = strokeVolume(70), ao = aorticPressure(70);
  assert.ok(Math.abs(tm.ventEnd - tm.ventStart - 0.3) < 0.03);
  assert.ok(Math.abs(tm.pr - 0.16) < 0.01, 'PR 時間 約0.16 s');
  assert.ok(Math.abs(sv.sv - 70) < 1);
  assert.ok(Math.abs(sv.cardiacOutput - 4.9) < 0.1);
  assert.ok(Math.abs(ao.systolic - 120) < 1 && Math.abs(ao.diastolic - 80) < 1);
});

test('心拍数が上がると心周期と心室収縮期は短くなり、拡張期はそれ以上に短くなる', () => {
  let prev = cycleTiming(40);
  for (const hr of hrs.slice(1)) {
    const tm = cycleTiming(hr);
    assert.ok(tm.rr < prev.rr && tm.ventEnd < prev.ventEnd);
    assert.ok(tm.diastoleDur / tm.rr < prev.diastoleDur / prev.rr, `拡張期の割合が減る (${hr})`);
    prev = tm;
  }
});

test('心拍出量 = 心拍数 × 1回拍出量。運動で増え、180 bpm では 1回拍出量が頭打ちになる', () => {
  for (const hr of hrs) {
    const sv = strokeVolume(hr);
    assert.ok(Math.abs(sv.cardiacOutput - (hr * sv.sv) / 1000) < 1e-9);
    assert.ok(sv.sv > 0 && sv.edv > sv.esv && sv.esv > 0);
  }
  assert.ok(strokeVolume(160).cardiacOutput > 2 * strokeVolume(70).cardiacOutput);
  assert.ok(strokeVolume(160).sv > strokeVolume(70).sv && strokeVolume(110).sv > strokeVolume(70).sv, '運動のプリセットでは 1回拍出量も増える');
  assert.ok(strokeVolume(180).sv < strokeVolume(140).sv, '充満の時間が短すぎると 1回拍出量が減る');
  assert.ok(strokeVolume(180).cardiacOutput > strokeVolume(140).cardiacOutput);
});

test('弁の論理: 房室弁と半月弁が同時に開くことはない。等容性の期間は全部閉じている', () => {
  for (const hr of hrs) for (const s of samples(hr)) {
    assert.ok(!(s.valves.mitral && s.valves.aortic), `同時に開かない (${hr} bpm, t=${s.t.toFixed(3)})`);
    assert.equal(s.valves.mitral, s.valves.tricuspid);
    assert.equal(s.valves.aortic, s.valves.pulmonary);
    if (s.phase === 1 || s.phase === 3) assert.ok(!s.valves.mitral && !s.valves.aortic);
    if (s.phase === 2) assert.ok(s.valves.aortic);
    if (s.phase === 0 || s.phase === 4) assert.ok(s.valves.mitral);
  }
});

test('圧力と弁の整合: 駆出期は左心室圧 ≥ 大動脈圧、房室弁が開く期間は左心房圧 ≥ 左心室圧、右心系は低圧', () => {
  for (const hr of hrs) for (const s of samples(hr)) {
    if (s.phase === 2) assert.ok(s.pressures.lv >= s.pressures.aorta - 1e-6);
    if (s.valves.mitral) assert.ok(s.pressures.la >= s.pressures.lv - 1e-6, `${hr} t=${s.t.toFixed(3)} la=${s.pressures.la} lv=${s.pressures.lv}`);
    assert.ok(s.pressures.aorta >= aorticPressure(hr).diastolic - 1e-6, '大動脈圧は拡張期圧を下回らない');
    assert.ok(s.pressures.rv <= s.pressures.lv + 1e-6 && s.pressures.pulmonary < s.pressures.aorta);
  }
  const peak = Math.max(...samples(70, 800).map((s) => s.pressures.lv));
  assert.ok(Math.abs(peak - aorticPressure(70).systolic) < 2, '左心室圧の最大値は収縮期血圧');
});

test('心室容積: 等容性収縮期は EDV、等容性弛緩期は ESV、駆出期に単調減少、充満期に単調増加。周期の境目で連続', () => {
  for (const hr of hrs) {
    const ss = samples(hr, 800);
    for (let i = 1; i < ss.length; i++) {
      const a = ss[i - 1], b = ss[i];
      assert.ok(b.volumes.lv <= b.volumes.edv + 1e-6 && b.volumes.lv >= b.volumes.esv - 1e-6);
      if (a.phase === 2 && b.phase === 2) assert.ok(b.volumes.lv <= a.volumes.lv + 1e-9);
      if (a.phase >= 3 && b.phase !== 1 && b.phase !== 2) assert.ok(b.volumes.lv >= a.volumes.lv - 1e-9, `充満中は減らない (${hr}, t=${b.t.toFixed(3)})`);
      if (b.phase === 1) assert.ok(Math.abs(b.volumes.lv - b.volumes.edv) < 1e-6);
      if (b.phase === 3) assert.ok(Math.abs(b.volumes.lv - b.volumes.esv) < 1e-6);
      assert.ok(Math.abs(b.volumes.lv - a.volumes.lv) < 0.08 * (b.volumes.edv - b.volumes.esv), `容積が飛ばない (${hr} bpm, t=${b.t.toFixed(3)})`);
      assert.ok(Math.abs(b.volumes.la - a.volumes.la) < 4, `心房の容積が飛ばない (${hr} bpm, t=${b.t.toFixed(3)})`);
    }
    const first = ss[0], last = ss[ss.length - 1];
    assert.ok(Math.abs(first.volumes.lv - last.volumes.lv) < 0.08 * (first.volumes.edv - first.volumes.esv), '周期の境目で連続');
    assert.ok(Math.abs(first.volumes.la - last.volumes.la) < 4);
    for (const s of ss) {assert.equal(s.volumes.lv, s.volumes.rv, '左右の心室の容積変化は等しい'); assert.ok(Math.abs(s.pressures.rv - 0.2 * s.pressures.lv) < 1e-9, '右心室の圧は左心室の 1/5');}
  }
});

test('期の順番: 1周期に 等容性収縮期→駆出期→等容性弛緩期→充満期→心房収縮期 が1回ずつ、この順で現れる', () => {
  for (const hr of hrs) {
    const seq = [];
    for (const s of samples(hr, 2000)) if (seq[seq.length - 1] !== s.phase) seq.push(s.phase);
    assert.deepEqual(seq, [1, 2, 3, 4, 0], `${hr} bpm: ${seq.join('→')}`);
  }
});

test('弁は圧力の差と一致する: 僧帽弁が開く ⇔ 左心房圧 ≥ 左心室圧、大動脈弁が開く ⇔ 左心室圧 ≥ 大動脈圧（切り替わりの前後 5 ms は除く）', () => {
  for (const hr of hrs) {
    const tm = cycleTiming(hr), edges = [tm.ejectStart, tm.ventEnd, tm.relaxEnd, tm.ventStart, tm.rr];
    for (const s of samples(hr, 1000)) {
      if (edges.some((e) => Math.abs(s.t - e) < 0.008)) continue;
      assert.equal(s.valves.mitral, s.pressures.la >= s.pressures.lv, `僧帽弁 ${hr} bpm t=${s.t.toFixed(3)} la=${s.pressures.la.toFixed(1)} lv=${s.pressures.lv.toFixed(1)}`);
      assert.equal(s.valves.aortic, s.pressures.lv >= s.pressures.aorta, `大動脈弁 ${hr} bpm t=${s.t.toFixed(3)} lv=${s.pressures.lv.toFixed(1)} ao=${s.pressures.aorta.toFixed(1)}`);
    }
  }
});

test('心電図と刺激伝導系: P → QRS → T の順。R 波は心室収縮の始まり。房室結節の遅れが心房と心室の収縮のずれになる', () => {
  for (const hr of hrs) {
    const tm = cycleTiming(hr), ss = samples(hr, 1200);
    const inP = ss.map((s) => ({...s, tp: fromP(s.t, tm)})).sort((a, b) => a.tp - b.tp);
    const peakAt = (lo, hi) => inP.filter((s) => s.tp >= lo && s.tp < hi).reduce((m, s) => (s.ecg > m.ecg ? s : m)).tp;
    const p = peakAt(0, tm.pr - 0.02), r = peakAt(tm.pr, tm.pr + 0.08), tw = peakAt(tm.pr + 0.1, tm.rr);
    assert.ok(p < r && r < tw, `P(${p.toFixed(3)}) < R(${r.toFixed(3)}) < T(${tw.toFixed(3)}) at ${hr}`);
    assert.ok(Math.abs(r - (tm.pr + tm.delay)) < 0.01, 'R 波は QRS の始まりの直後＝心室収縮の始まり');
    assert.ok(fromP(tm.atrialStart, tm) < r, '心房の収縮は R 波より前に始まる');
    const seq = [];
    for (const s of inP) if (seq[seq.length - 1] !== s.conduction.segment) seq.push(s.conduction.segment);
    assert.deepEqual(seq, ['atrium', 'av', 'purkinje', 'ventricle', 'rest']);
    for (const s of ss) assert.ok(s.conduction.progress >= 0 && s.conduction.progress <= 1);
  }
});

test('相の名前と範囲外の入力', () => {
  assert.equal(PHASES.length, 5);
  assert.equal(stateAt(cycleTiming(70).atrialStart + 0.01, 70).phaseName, '心房収縮期');
  assert.equal(stateAt(0.01, 70).phaseName, '等容性収縮期');
  assert.equal(stateAt(-0.01, 70).phase, stateAt(cycleTiming(70).rr - 0.01, 70).phase, '負の時刻は周期に折り返す');
  assert.equal(cycleTiming(10).hr, HR_MIN);
  assert.equal(cycleTiming(500).hr, HR_MAX);
});
