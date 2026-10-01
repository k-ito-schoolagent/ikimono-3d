// 心臓の材質。拍動（頂点の変形）、部位ごとの色、内腔の血液色、ハイライト、興奮の光を 1 つのシェーダーに足す
import {T} from '../lib/stage.js';
import {PARTS} from './field.js';

export const COLORS = {
  artery: new T.Color(0xd7363d), vein: new T.Color(0x3f63b8), conduction: new T.Color(0xf2c14e),
  muscle: new T.Color(0x9b3338), atrium: new T.Color(0x9c3639),
  arteryWall: new T.Color(0xb8393f), veinWall: new T.Color(0x4a62a3),
  arteryInner: new T.Color(0xc9343a), veinInner: new T.Color(0x4a6cc0),
};
const partList = Object.values(PARTS).sort((a, b) => a.id - b.id);
const outerColors = partList.map((p) => (p.id === 0 || p.id === 1 ? COLORS.muscle : p.id <= 3 ? COLORS.atrium : p.blood === 'artery' ? COLORS.arteryWall : COLORS.veinWall));
const innerColors = partList.map((p) => (p.blood === 'artery' ? COLORS.arteryInner : COLORS.veinInner));

// 共有ユニフォーム（拍動・ハイライト・興奮）。すべての材質で同じオブジェクトを参照する
export const uniforms = {
  uLobeBase: {value: [new T.Vector3(1.0, 2.2, 0.0), new T.Vector3(-1.9, 2.0, 1.2), new T.Vector3(1.7, 4.6, -2.0), new T.Vector3(-2.3, 4.6, -0.8)]},
  uLobeScale: {value: [1, 1, 1, 1]},
  uHighlight: {value: -1}, uDim: {value: 0}, uSelected: {value: -1},
  uFlash: {value: [0, 0, 0, 0]},            // 部屋ごとの興奮の光（LV, RV, LA, RA）
  uInnerMix: {value: 0},                    // 内腔を血液の色で塗る強さ（透視・断面で 1）
  uVesselAlpha: {value: 0.55},              // 血管の透け具合（部屋は不透明のまま）
  uSchematic: {value: 0},
};

export const VERTEX_PARS = `
attribute vec2 part; attribute vec4 lobe; attribute float vess;
uniform vec3 uLobeBase[4]; uniform float uLobeScale[4];
varying vec2 vPart; varying vec4 vLobe; varying float vVess;
vec3 beat(vec3 p){
  vec3 q = p;
  for (int i = 0; i < 4; i++) q += lobe[i] * (uLobeScale[i] - 1.0) * (p - uLobeBase[i]);
  return q;
}`;
export const VERTEX_BODY = `
vPart = part; vLobe = lobe; vVess = vess;
transformed = beat(transformed);`;

export function patchVertex(material) {
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\n' + VERTEX_PARS).replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VERTEX_BODY);
    prev?.(shader, renderer);
  };
  material.customProgramCacheKey = () => 'beat' + (material.userData.key || '');
}

// 本体の材質（物理ベース）。部位の色と内腔の色、ハイライト、興奮の光
export function createHeartMaterial() {
  const m = new T.MeshPhysicalMaterial({color: 0xffffff, roughness: 0.52, metalness: 0, clearcoat: 0.3, clearcoatRoughness: 0.45, sheen: 0.12, sheenRoughness: 0.8, sheenColor: new T.Color(0x6a2a2a), side: T.DoubleSide, transparent: true});
  m.userData.key = 'heart';
  patchVertex(m);
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, renderer) => {
    prev(shader, renderer);
    shader.uniforms.uOuter = {value: outerColors}; shader.uniforms.uInner = {value: innerColors};
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform vec3 uOuter[8]; uniform vec3 uInner[8]; uniform float uHighlight, uDim, uSelected, uInnerMix, uSchematic, uVesselAlpha; uniform float uFlash[4]; varying vec2 vPart; varying vec4 vLobe; varying float vVess;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
int pid = int(vPart.x + 0.5);
vec3 outerC = uOuter[pid]; vec3 innerC = uInner[pid];
vec3 base = mix(outerC, innerC, vPart.y * uInnerMix);
// 内腔は少し暗く湿った感じ
base *= mix(1.0, 0.82, vPart.y);
diffuseColor.rgb *= base;
diffuseColor.a *= mix(1.0, uVesselAlpha, vVess);
float isTarget = (uHighlight >= 0.0 && abs(vPart.x - uHighlight) < 0.5) ? 1.0 : 0.0;
float isSel = (uSelected >= 0.0 && abs(vPart.x - uSelected) < 0.5) ? 1.0 : 0.0;
float keep = max(isTarget, isSel);
diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.38 + vec3(0.06, 0.05, 0.05), uDim * (1.0 - keep));`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
float flash = dot(vLobe, vec4(uFlash[0], uFlash[1], uFlash[2], uFlash[3]));
totalEmissiveRadiance += vec3(0.95, 0.72, 0.25) * flash * 0.5;
vec3 nv = normalize(vNormal); vec3 vv = normalize(vViewPosition);
float fres = pow(1.0 - max(dot(nv, vv), 0.0), 2.5);
totalEmissiveRadiance += vec3(1.0, 0.86, 0.6) * fres * 0.55 * max(isTarget, isSel * 0.6);`);
  };
  return m;
}

// 線画モード: 紙の色のベタ塗りに、陰の側だけハッチング。輪郭は裏返しの殻（別メッシュ）で描く
export function createSchematicMaterial() {
  const m = new T.ShaderMaterial({
    uniforms: {...uniforms, uPaper: {value: new T.Color(0xf1e9d8)}, uInk: {value: new T.Color(0x3a2f28)}, uLight: {value: new T.Vector3(0.45, 0.8, 0.6)}, uClip: {value: 0}},
    vertexShader: `${VERTEX_PARS}
varying vec3 vN; varying vec3 vP;
#include <clipping_planes_pars_vertex>
void main(){ vPart = part; vLobe = lobe; vVess = vess; vec3 transformed = beat(position);
  vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0); vN = normalize(normalMatrix * normal); vP = mvPosition.xyz; gl_Position = projectionMatrix * mvPosition;
  #include <clipping_planes_vertex>
}`,
    fragmentShader: `uniform vec3 uPaper, uInk, uLight; uniform float uHighlight, uSelected, uDim, uInnerMix; uniform float uFlash[4];
varying vec3 vN; varying vec3 vP; varying vec2 vPart; varying vec4 vLobe; varying float vVess;
#include <clipping_planes_pars_fragment>
void main(){
  #include <clipping_planes_fragment>
  vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
  float l = dot(n, normalize(uLight)) * 0.5 + 0.5;
  // 画面空間のハッチング（暗いほど線が増える）
  float hatch = step(0.5, fract((gl_FragCoord.x + gl_FragCoord.y) * 0.16)) * smoothstep(0.56, 0.28, l);
  float hatch2 = step(0.5, fract((gl_FragCoord.x - gl_FragCoord.y) * 0.16)) * smoothstep(0.34, 0.1, l);
  vec3 col = mix(uPaper, uPaper * 0.93, 1.0 - l * 0.6);
  col = mix(col, uInk, max(hatch, hatch2) * 0.55);
  float isTarget = (uHighlight >= 0.0 && abs(vPart.x - uHighlight) < 0.5) ? 1.0 : 0.0;
  float isSel = (uSelected >= 0.0 && abs(vPart.x - uSelected) < 0.5) ? 1.0 : 0.0;
  col = mix(col, vec3(0.93, 0.62, 0.5), max(isTarget, isSel) * 0.35);
  float flash = dot(vLobe, vec4(uFlash[0], uFlash[1], uFlash[2], uFlash[3]));
  col = mix(col, vec3(0.95, 0.76, 0.3), flash * 0.5);
  col = mix(col, uPaper, 0.65 * uDim * (1.0 - max(isTarget, isSel)));   // 線画では暗くせず、紙に溶かして薄くする
  gl_FragColor = vec4(col, 1.0);
}`,
    side: T.DoubleSide, clipping: true,
  });
  return m;
}
export function createOutlineMaterial() {
  const m = new T.ShaderMaterial({
    uniforms: {...uniforms, uInk: {value: new T.Color(0x2b2420)}, uWidth: {value: 0.11}},
    vertexShader: `${VERTEX_PARS}
uniform float uWidth;
#include <clipping_planes_pars_vertex>
void main(){ vPart = part; vLobe = lobe; vVess = vess; vec3 transformed = beat(position) + normal * uWidth;
  vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0); gl_Position = projectionMatrix * mvPosition;
  #include <clipping_planes_vertex>
}`,
    fragmentShader: `uniform vec3 uInk;
#include <clipping_planes_pars_fragment>
void main(){
  #include <clipping_planes_fragment>
  gl_FragColor = vec4(uInk, 1.0);
}`,
    side: T.BackSide, clipping: true,
  });
  return m;
}

// 断面のふた: ステンシルで「壁の中」だけを塗る。筋肉の切り口はやや暗い赤に細いハッチング
export function createCapMaterial(plane) {
  const m = new T.MeshStandardMaterial({color: 0x8e3537, roughness: 0.85, metalness: 0, stencilWrite: true, stencilRef: 0, stencilFunc: T.NotEqualStencilFunc, stencilFail: T.ReplaceStencilOp, stencilZFail: T.ReplaceStencilOp, stencilZPass: T.ReplaceStencilOp});
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
float h = step(0.5, fract((gl_FragCoord.x + gl_FragCoord.y) * 0.1));
diffuseColor.rgb *= mix(1.0, 0.78, h);`);
  };
  return m;
}
export function createStencilMaterials(plane) {
  const base = new T.MeshBasicMaterial({depthWrite: false, depthTest: false, colorWrite: false, stencilWrite: true, stencilFunc: T.AlwaysStencilFunc, clippingPlanes: [plane]});
  const back = base.clone(); back.side = T.BackSide; back.stencilFail = back.stencilZFail = back.stencilZPass = T.IncrementWrapStencilOp; back.clippingPlanes = [plane]; back.userData.key = 'sb';
  const front = base.clone(); front.side = T.FrontSide; front.stencilFail = front.stencilZFail = front.stencilZPass = T.DecrementWrapStencilOp; front.clippingPlanes = [plane]; front.userData.key = 'sf';
  patchVertex(back); patchVertex(front);
  return {back, front};
}

// 刺激伝導系の線: 進み具合（0〜1）までが光り、後ろへ尾を引く
export function createConductionMaterial() {
  return new T.ShaderMaterial({
    uniforms: {uProgress: {value: -1}, uSeg: {value: -1}, uColor: {value: COLORS.conduction.clone()}, uRest: {value: 0.18}, uOpacity: {value: 1}},
    vertexShader: `attribute float ct; attribute float cseg; varying float vT; varying float vS; void main(){ vT = ct; vS = cseg; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uProgress, uSeg, uRest, uOpacity; uniform vec3 uColor; varying float vT; varying float vS;
void main(){
  float lit = 0.0;
  if (abs(vS - uSeg) < 0.5) lit = smoothstep(uProgress - 0.35, uProgress, vT) * step(vT, uProgress + 0.02);
  else if (vS < uSeg) lit = 0.35;
  float a = uRest + lit * (1.0 - uRest);
  gl_FragColor = vec4(mix(uColor * 0.45, uColor * 1.6, lit), a * uOpacity);
}`,
    transparent: true, depthWrite: false, blending: T.AdditiveBlending,
  });
}
