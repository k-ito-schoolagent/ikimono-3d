// 線画モード: メッシュを紙色のベタ塗り＋陰のハッチングに置きかえ、裏返しの殻で墨の輪郭を描く（どのデモでも使える）
import * as T from 'three';

const PAPER = new T.Color(0xf1e9d8), INK = new T.Color(0x3a2f28);
export function createPaperMaterial({paper = PAPER, ink = INK, light = [0.45, 0.8, 0.6]} = {}) {
  return new T.ShaderMaterial({
    uniforms: {uPaper: {value: paper.clone()}, uInk: {value: ink.clone()}, uLight: {value: new T.Vector3(...light)}, uTint: {value: new T.Color(0xf1e9d8)}, uTintMix: {value: 0}},
    vertexShader: `varying vec3 vN;
#include <common>
#include <skinning_pars_vertex>
void main(){ vec3 transformed = position; vec3 objectNormal = normal;
  #ifdef USE_INSTANCING
    mat3 im = mat3(instanceMatrix); objectNormal = im * objectNormal; transformed = (instanceMatrix * vec4(transformed, 1.0)).xyz;
  #endif
  vN = normalize(normalMatrix * objectNormal); gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0); }`,
    fragmentShader: `uniform vec3 uPaper, uInk, uLight, uTint; uniform float uTintMix; varying vec3 vN;
void main(){ vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
  float l = dot(n, normalize(uLight)) * 0.5 + 0.5;
  float hatch = step(0.5, fract((gl_FragCoord.x + gl_FragCoord.y) * 0.16)) * smoothstep(0.56, 0.28, l);
  float hatch2 = step(0.5, fract((gl_FragCoord.x - gl_FragCoord.y) * 0.16)) * smoothstep(0.34, 0.1, l);
  vec3 col = mix(uPaper, uPaper * 0.93, 1.0 - l * 0.6); col = mix(col, uTint, uTintMix);
  col = mix(col, uInk, max(hatch, hatch2) * 0.55);
  gl_FragColor = vec4(col, 1.0); }`,
    side: T.DoubleSide,
  });
}
export function createOutlineMaterial({ink = INK, width = 0.06} = {}) {
  return new T.ShaderMaterial({
    uniforms: {uInk: {value: ink.clone()}, uWidth: {value: width}},
    vertexShader: `uniform float uWidth;
void main(){ vec3 transformed = position; vec3 n = normal;
  #ifdef USE_INSTANCING
    transformed = (instanceMatrix * vec4(transformed, 1.0)).xyz; n = mat3(instanceMatrix) * n;
  #endif
  transformed += normalize(n) * uWidth; gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0); }`,
    fragmentShader: `uniform vec3 uInk; void main(){ gl_FragColor = vec4(uInk, 1.0); }`,
    side: T.BackSide,
  });
}

// root 以下のメッシュを線画にしたり戻したりする。skip(mesh) が true のものは線画では隠す（毛など）
export function createPaperMode(root, {skip = () => false, width = 0.06} = {}) {
  const paper = createPaperMaterial(), outline = createOutlineMaterial({width});
  const entries = [];
  root.traverse((o) => {
    if (!o.isMesh || o.userData.noPaper) return;
    const hull = o.isInstancedMesh ? null : new T.Mesh(o.geometry, outline);
    if (hull) {hull.visible = false; hull.userData.noPaper = true; hull.renderOrder = o.renderOrder; o.add(hull);}
    entries.push({mesh: o, original: o.material, hull, hide: skip(o), wasVisible: o.visible});
  });
  return {
    set(on) {
      for (const e of entries) {
        if (on) {e.wasVisible = e.mesh.visible; e.mesh.material = paper; if (e.hull) e.hull.visible = true; if (e.hide) e.mesh.visible = false;}
        else {e.mesh.material = e.original; if (e.hull) e.hull.visible = false; if (e.hide) e.mesh.visible = e.wasVisible;}
      }
    },
    paper, outline,
  };
}
