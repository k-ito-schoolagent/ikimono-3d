// 心臓と血液循環の計算モデル。描画（three.js）には依存しない純粋な関数で、node --test で検証する。
// 時刻の原点は心室の収縮開始（R 波のころ）。心周期 RR = 60 / 心拍数 [s] で折り返す。
// 数値はヒト成人の代表値（安静時 EDV 120 mL・ESV 50 mL・1回拍出量 70 mL・大動脈圧 120/80 mmHg）を、心拍数で滑らかに変える簡略モデル。

export const HR_MIN = 40, HR_MAX = 180;
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));  // 0→1 を滑らかに
const wrap = (t, rr) => ((t % rr) + rr) % rr;
const bell = (t, c, w, rr) => {const d = wrap(t - c + rr / 2, rr) - rr / 2; return Math.exp(-(d * d) / (2 * w * w));};  // 周期的な山

// 心拍数から心周期の区切りを求める（単位: 秒。心室の収縮開始を 0 とする）
export function cycleTiming(hr) {
  hr = clamp(hr, HR_MIN, HR_MAX);
  const rr = 60 / hr;
  const delay = 0.04;                                              // 興奮が始まってから収縮が始まるまでの電気機械的な遅れ
  const pr = clamp(0.08 + 0.1 * rr, 0.1, 0.2);                     // P 波の始まりから QRS の始まりまで（房室結節での遅れを含む）
  const ventDur = 0.3 * Math.pow(rr / 0.857, 0.6);                 // 心室収縮期。安静時 0.3 s、心拍数が上がると短くなる
  const isoContract = Math.min(0.05, 0.17 * ventDur);              // 等容性収縮期
  const diastoleDur = rr - ventDur;                                // 心室拡張期（等容性弛緩期＋充満期）
  const isoRelax = Math.min(0.08, 0.3 * diastoleDur);              // 等容性弛緩期
  const relaxEnd = ventDur + isoRelax;
  const qrsOnset = rr - delay;                                     // 次の心室収縮の少し前に QRS
  const pOnset = qrsOnset - pr;                                    // 洞房結節の興奮（P 波の始まり）
  const atrialDur = Math.min(0.1, 0.25 * rr);
  const atrialEnd = rr - 0.005;                                    // 心房の収縮が終わると、すぐ心室が収縮する
  const atrialStart = Math.max(relaxEnd + 0.02, atrialEnd - atrialDur);   // 心房の収縮は房室弁が開いてから（受動的な充満を少しは残す）
  const qt = 0.4 * Math.sqrt(rr);                                  // QT 時間（Bazett）
  return {hr, rr, delay, pr, pOnset, qrsOnset, ventStart: 0, ejectStart: isoContract, ventEnd: ventDur, relaxEnd, atrialStart, atrialEnd, diastoleDur, fillWindow: atrialEnd - relaxEnd, qt, tCenter: wrap(qrsOnset + qt - 0.08, rr)};
}

// 心拍数から拍出量を求める。交感神経の緊張（心拍数が高いほど強い）で収縮力が上がり ESV が減る。
// 心拍数が高すぎると充満の時間が足りず EDV が減る（1回拍出量が頭打ちになり、やがて減る）。
export function strokeVolume(hr) {
  const tm = cycleTiming(hr);
  const c = clamp((tm.hr - 70) / 110, 0, 1);                      // 交感神経の緊張 0〜1（安静 70 bpm で 0）
  const fillPenalty = Math.max(0, 0.16 - tm.fillWindow) * 400;    // 充満の時間が 0.16 s を切ると充満不足
  const slowFill = 15 * clamp((60 - tm.hr) / 20, 0, 1);           // 心拍数が低いと充満の時間が長く EDV が少し増える
  const edv = 120 + 10 * c + slowFill - fillPenalty, esv = 50 - 20 * c;
  const sv = edv - esv;
  return {edv, esv, sv, cardiacOutput: (sv * tm.hr) / 1000, sympathetic: c, kickFraction: 0.2 + 0.2 * c};  // 心拍出量 [L/min]
}

// 大動脈圧（収縮期／拡張期）の代表値。運動時は収縮期だけが上がる
export function aorticPressure(hr) {
  const c = strokeVolume(hr).sympathetic;
  return {systolic: 120 + 45 * c, diastolic: 80 + 2 * c};
}

export const PHASES = ['心房収縮期', '等容性収縮期', '駆出期', '等容性弛緩期', '充満期'];

// 心周期内の時刻 t [s] での状態（t は RR で折り返す）
export function stateAt(time, hr) {
  const tm = cycleTiming(hr), sv = strokeVolume(hr), ao = aorticPressure(hr);
  const t = wrap(time, tm.rr);
  let phase;
  if (t < tm.ejectStart) phase = 1;
  else if (t < tm.ventEnd) phase = 2;
  else if (t < tm.relaxEnd) phase = 3;
  else if (t >= tm.atrialStart) phase = 0;                        // 心房収縮期は次の心室収縮まで
  else phase = 4;
  const avOpen = phase === 0 || phase === 4, semilunarOpen = phase === 2;
  const ejectT = clamp((t - tm.ejectStart) / Math.max(1e-3, tm.ventEnd - tm.ejectStart), 0, 1);
  // 受動的な充満の進み 0→1: 房室弁が開いた直後が速く（急速充満）、だんだん遅くなり（緩徐充満）、次の収縮開始でちょうど 1 になる
  const tau = 0.06, remain = Math.max(1e-3, tm.rr - tm.relaxEnd), since = Math.max(0, t - tm.relaxEnd);
  const fillX = t < tm.relaxEnd ? 0 : (1 - Math.exp(-since / tau)) / (1 - Math.exp(-remain / tau));
  const kickX = clamp((t - tm.atrialStart) / Math.max(1e-3, tm.atrialEnd - tm.atrialStart), 0, 1);  // 心房収縮の進み

  // 心室容積: 駆出期に EDV→ESV、充満期に急速充満（受動）→ 心房収縮による最後のひと押し
  const kick = sv.kickFraction * sv.sv;
  let lv;
  if (phase === 1) lv = sv.edv;
  else if (phase === 2) lv = sv.edv - sv.sv * smooth(ejectT);
  else if (phase === 3) lv = sv.esv;
  else lv = sv.esv + (sv.sv - kick) * fillX + kick * smooth(kickX);

  // 心房容積: 心室が収縮している間にふくらみ（静脈から流入し続ける）、房室弁が開くとしぼむ。心房収縮で最小
  const laMax = 70, laMin = 30, laRange = laMax - laMin;
  let la;
  if (t < tm.relaxEnd) la = laMin + laRange * smooth(t / tm.relaxEnd);
  else la = laMax - laRange * (0.5 * fillX + 0.5 * smooth(kickX));

  // 圧力 [mmHg]: 左心室は駆出期に大動脈と同じ山を描き、それ以外は低い。大動脈は駆出後ゆっくり下がる（弾性＝ウィンドケッセル）
  const pulse = ao.systolic - ao.diastolic;
  const notch = ao.diastolic + 0.6 * pulse;                         // 駆出の終わりの圧（切痕）
  const ejectShape = (x) => (x < 0.35 ? Math.sin((Math.PI / 2) * (x / 0.35)) : 1 - 0.4 * Math.pow((x - 0.35) / 0.65, 1.5));
  let lvp, aop;
  if (phase === 1) lvp = 8 + (ao.diastolic - 8) * smooth(t / Math.max(1e-3, tm.ejectStart));
  else if (phase === 2) lvp = ao.diastolic + pulse * ejectShape(ejectT);
  else if (phase === 3) {const x = (t - tm.ventEnd) / Math.max(1e-3, tm.relaxEnd - tm.ventEnd), s = 1 - (1 - x) * (1 - x); lvp = notch * (1 - s) + 6 * s;}   // 弁が閉じた直後は速く下がり、左心房の圧（6）まで落ちると房室弁が開く
  else lvp = 5 + (1 - fillX) + 3 * smooth(kickX);                  // 充満中は心房よりわずかに低い
  if (phase === 2) aop = lvp;                                       // 駆出中は弁が開いていて、心室と大動脈はほぼ同じ圧
  else aop = ao.diastolic + (notch - ao.diastolic) * Math.exp((-3 * wrap(t - tm.ventEnd, tm.rr)) / Math.max(1e-3, tm.diastoleDur));
  const lap = t < tm.ejectStart ? 6 + 4 * (1 - smooth(t / Math.max(1e-3, tm.ejectStart))) : 6 + 4 * smooth(kickX) * (t >= tm.atrialStart ? 1 : 0);   // 心房収縮で上がり、心室が収縮を始めるともとに戻る
  const scaleR = 0.2;                                               // 右心系は左心系の約 1/5 の圧（肺循環は低圧）。容積の変化は左右で等しい

  // 心電図（Ⅱ誘導の形を模した合成波形）
  const ecg = 0.15 * bell(t, tm.pOnset + 0.045, 0.022, tm.rr) - 0.12 * bell(t, tm.qrsOnset + 0.02, 0.006, tm.rr) + bell(t, tm.qrsOnset + 0.04, 0.009, tm.rr) - 0.25 * bell(t, tm.qrsOnset + 0.062, 0.007, tm.rr) + 0.3 * bell(t, tm.tCenter, 0.045, tm.rr);

  // 刺激伝導系: 洞房結節 → 心房筋（P 波）→ 房室結節（遅い）→ ヒス束・プルキンエ線維（速い。PR 区間の終わり）→ 心室筋（QRS）
  const sinceP = wrap(t - tm.pOnset, tm.rr), atriumLen = 0.06, purkinjeLen = 0.03, avEnd = tm.pr - purkinjeLen, ventLen = 0.05;
  let conduction;
  if (sinceP < atriumLen) conduction = {segment: 'atrium', progress: sinceP / atriumLen};
  else if (sinceP < avEnd) conduction = {segment: 'av', progress: (sinceP - atriumLen) / (avEnd - atriumLen)};
  else if (sinceP < tm.pr) conduction = {segment: 'purkinje', progress: (sinceP - avEnd) / purkinjeLen};
  else if (sinceP < tm.pr + ventLen) conduction = {segment: 'ventricle', progress: (sinceP - tm.pr) / ventLen};
  else conduction = {segment: 'rest', progress: 0};

  // 流れの強さ（粒子の速さに使う 0〜1）。動脈は駆出期に強く、毛細血管・静脈は大動脈の弾性のおかげでほぼ一定
  const ejection = phase === 2 ? Math.sin(Math.PI * ejectT) : 0;
  const avFlow = t < tm.relaxEnd ? 0 : Math.min(1, 0.7 * Math.exp(-since / 0.08) + (phase === 0 ? 0.5 * Math.sin(Math.PI * kickX) : 0));   // E 波（急速充満）＋ A 波（心房収縮）

  return {
    t, phase, phaseName: PHASES[phase], timing: tm,
    valves: {tricuspid: avOpen, mitral: avOpen, pulmonary: semilunarOpen, aortic: semilunarOpen},
    volumes: {lv, rv: lv, la, ra: la, edv: sv.edv, esv: sv.esv},
    pressures: {lv: lvp, aorta: aop, la: lap, rv: lvp * scaleR, pulmonary: aop * scaleR, ra: lap * 0.6},
    ecg, conduction,
    flow: {ejection, avFlow, arterial: 0.25 + 0.75 * ejection, capillary: 0.55, venous: 0.5},
    strokeVolume: sv.sv, cardiacOutput: sv.cardiacOutput,
  };
}

// 自律神経のプリセット（心拍数のみを変える簡略化。実際は収縮力・血管も変わる）
export const PRESETS = [
  {id: 'rest', label: '安静', hr: 70, note: '副交感神経（迷走神経）が優位。洞房結節の興奮の頻度は低い。'},
  {id: 'walk', label: '軽い運動', hr: 110, note: '副交感神経の抑制がゆるみ、交感神経が働き始める。'},
  {id: 'run', label: '激しい運動', hr: 160, note: '交感神経が優位。ノルアドレナリンで洞房結節の興奮の頻度が上がる。'},
];
