// 血液の粒。分かれ道つきの通り道（セグメント）を進み、弁が閉じていると手前で止まる。毛細血管で色が変わる
import {T} from '../lib/stage.js';
import {COLORS} from './materials.js';

export function createFlow(parent, segments, count = 1400) {
  const geo = new T.IcosahedronGeometry(0.17, 1);
  const mat = new T.MeshStandardMaterial({roughness: 0.35, metalness: 0, emissive: 0x000000});
  const mesh = new T.InstancedMesh(geo, mat, count); mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
  mesh.castShadow = false; mesh.frustumCulled = false; parent.add(mesh);
  const colorAttr = new T.InstancedBufferAttribute(new Float32Array(count * 3), 3); mesh.instanceColor = colorAttr;
  const list = Object.values(segments), total = list.reduce((a, s) => a + s.length, 0);
  const particles = [];
  const pickNext = (s) => segments[s.next[Math.floor(Math.random() * s.next.length)]];
  for (let i = 0; i < count; i++) {
    let r = Math.random() * total, s = list[0];
    for (const x of list) {if (r < x.length) {s = x; break;} r -= x.length;}
    particles.push({seg: s, u: Math.random(), mix: s.blood ?? (s.type === 'capillary' ? s.from : 0), jitter: new T.Vector3((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5), speed: 0.8 + Math.random() * 0.4});
  }
  const m = new T.Matrix4(), p = new T.Vector3(), col = new T.Color(), sc = new T.Vector3();
  const a = COLORS.artery, b = COLORS.vein;
  function update(state, dt, visible) {
    mesh.visible = visible; if (!visible) return;
    const f = state.flow, av = state.valves.mitral, sl = state.valves.aortic;
    for (let i = 0; i < count; i++) {
      const q = particles[i], s = q.seg;
      let speed;
      if (s.type === 'atrium') speed = 2.5 + 9 * f.avFlow;
      else if (s.type === 'ventricle') speed = 1.5 + 16 * f.ejection;
      else if (s.type === 'artery') speed = 4 + 12 * f.ejection;
      else if (s.type === 'capillary') speed = 4.5;
      else speed = 5;
      let u = q.u + (speed * q.speed * dt) / s.length;
      // 弁が閉じているときは、弁の手前で待つ（後ろから来た粒は詰まる）
      if (s.type === 'atrium' && !av) u = Math.min(u, 0.84 + (i % 7) * 0.012);
      if (s.type === 'ventricle' && !sl) u = Math.min(u, 0.86 + (i % 7) * 0.012);
      if (u >= 1) {
        const n = pickNext(s); q.seg = n; u -= 1; u = Math.min(u, 0.05);
        if (n.blood !== undefined) q.mix = n.blood;
      }
      q.u = u;
      if (q.seg.type === 'capillary') q.mix = q.seg.from + (q.seg.to - q.seg.from) * u;
      q.seg.curve.getPointAt(Math.min(0.9999, Math.max(0, u)), p);
      p.add(q.jitter);
      m.makeTranslation(p.x, p.y, p.z); m.scale(sc.setScalar(0.85 + 0.3 * q.speed));
      mesh.setMatrixAt(i, m);
      col.copy(b).lerp(a, q.mix); mesh.setColorAt(i, col);
    }
    mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true;
  }
  return {mesh, update, material: mat};
}
