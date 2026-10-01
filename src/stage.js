// 3D の舞台。カメラ、光、視点ボタン、部品のクリック、ラベル、描画ループをまとめて用意する。
// どのデモも createStage() を呼べば、同じ操作感（ドラッグで回転、視点ボタン、埋め込み表示）になる。
import * as T from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {CSS2DRenderer, CSS2DObject} from 'three/addons/renderers/CSS2DRenderer.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {addCameraControls} from './navigation.js';
export {T};

export const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches;

export function createStage({position = [0, 4, 30], target = [0, 0, 0], floor = -9, background = 0x1d1916, fov = 34, minDistance = 10, maxDistance = 60, views = {}} = {}) {
  const host = document.getElementById('scene'), scene = new T.Scene();
  scene.background = new T.Color(background);
  let renderer;
  try {renderer = new T.WebGLRenderer({antialias: true, stencil: true, powerPreference: 'high-performance'});}
  catch (error) {host.innerHTML = '<div class="failure" role="alert">3D表示を開始できません。WebGL対応ブラウザで再読み込みしてください。<button onclick="location.reload()">再読み込み</button></div>'; throw error;}
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.localClippingEnabled = true;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
  host.append(renderer.domElement);
  renderer.domElement.setAttribute('aria-label', '操作できる3Dモデル。視点ボタンと部位ボタンでも操作できます。');
  const env = new RoomEnvironment(), pm = new T.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(env, 0.04).texture; scene.environmentIntensity = 0.3; env.dispose(); pm.dispose();

  const camera = new T.PerspectiveCamera(fov, 1, 0.1, 400); camera.position.set(...position);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(...target); controls.enableDamping = true; controls.dampingFactor = 0.08; controls.minDistance = minDistance; controls.maxDistance = maxDistance; controls.maxPolarAngle = Math.PI * 0.62;

  // 光: 暖かいキーライト、冷たいリムライト、やわらかい環境光
  scene.add(new T.HemisphereLight(0xf1e4d2, 0x3a2c25, 0.5));
  const key = new T.DirectionalLight(0xfff1e0, 1.25); key.position.set(9, 14, 10); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048); key.shadow.camera.left = key.shadow.camera.bottom = -18; key.shadow.camera.right = key.shadow.camera.top = 18; key.shadow.camera.near = 1; key.shadow.camera.far = 60; key.shadow.bias = -0.0008; key.shadow.radius = 4;
  scene.add(key);
  const rim = new T.DirectionalLight(0xbfd2ee, 0.9); rim.position.set(-12, 6, -10); scene.add(rim);
  const fill = new T.DirectionalLight(0xffe6d0, 0.45); fill.position.set(-6, -3, 12); scene.add(fill);

  // 床: 影を受ける面と、うすい図面の線（六角格子と円）
  const floorMat = new T.ShadowMaterial({opacity: 0.22});
  const floorMesh = new T.Mesh(new T.PlaneGeometry(200, 200), floorMat); floorMesh.rotation.x = -Math.PI / 2; floorMesh.position.y = floor; floorMesh.receiveShadow = true; scene.add(floorMesh);
  const drafting = new T.Group(); drafting.position.y = floor + 0.01; scene.add(drafting);

  const labels = new CSS2DRenderer(); labels.domElement.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden'; host.append(labels.domElement);
  const group = new T.Group(); scene.add(group);
  function label(text, position, parent = group, onClick, className) {
    const el = document.createElement(onClick ? 'button' : 'span'); el.innerHTML = text; el.className = className || (onClick ? 'part-label' : 'measure-label');
    if (onClick) {el.type = 'button'; el.onclick = onClick;}
    const obj = new CSS2DObject(el); obj.position.set(...position); parent.add(obj); return obj;
  }

  // クリックで部品を選ぶ（ドラッグと区別するため、押した位置からほとんど動いていないときだけ）
  let selectedHandler, hoverHandler; const pickables = []; const ray = new T.Raycaster(); let down;
  function pick(obj, key) {obj.userData.part = key; pickables.push(obj);}
  function hitAt(e) {
    const r = host.getBoundingClientRect();
    ray.setFromCamera(new T.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, (-(e.clientY - r.top) / r.height) * 2 + 1), camera);
    const hit = ray.intersectObjects(pickables, true)[0];
    if (!hit) return null;
    let obj = hit.object; while (obj && obj.userData.part === undefined) obj = obj.parent;
    return obj ? {part: typeof obj.userData.part === 'function' ? obj.userData.part(hit) : obj.userData.part, hit} : null;
  }
  renderer.domElement.addEventListener('pointerdown', (e) => (down = [e.clientX, e.clientY]));
  renderer.domElement.addEventListener('pointerup', (e) => {if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return; selectedHandler?.(hitAt(e)?.part ?? null);});
  let hoverT = 0;
  renderer.domElement.addEventListener('pointermove', (e) => {if (e.pointerType !== 'mouse' || !hoverHandler) return; cancelAnimationFrame(hoverT); hoverT = requestAnimationFrame(() => hoverHandler(hitAt(e)?.part ?? null));});
  renderer.domElement.addEventListener('pointerleave', () => hoverHandler?.(null));

  new ResizeObserver(() => {
    const {width, height} = host.getBoundingClientRect(); if (!width || !height) return;
    camera.aspect = width / height; camera.zoom = Math.min(1, camera.aspect / 1.25); camera.updateProjectionMatrix();
    renderer.setSize(width, height); labels.setSize(width, height);
  }).observe(host);
  addCameraControls(camera, controls);

  // 視点の移動は補間して、カメラが飛ばないようにする
  const camFrom = new T.Vector3(), camTo = new T.Vector3(), tgtFrom = new T.Vector3(), tgtTo = new T.Vector3(); let camT = 1;
  function flyTo(pos, tgt, instant = REDUCED_MOTION) {
    camFrom.copy(camera.position); camTo.set(...pos); tgtFrom.copy(controls.target); tgtTo.set(...tgt);
    camT = instant ? 1 : 0; if (instant) {camera.position.copy(camTo); controls.target.copy(tgtTo); controls.update();}
  }
  const allViews = {iso: [position, target], ...views};
  document.querySelectorAll('[data-view]').forEach((b) => (b.onclick = () => {const v = allViews[b.dataset.view]; if (v) flyTo(v[0], v[1]);}));
  document.getElementById('reset-view')?.addEventListener('click', () => flyTo(position, target));

  let last = performance.now();
  return {
    scene, group, camera, renderer, controls, label, pick, drafting, key, flyTo, views: allViews,
    onPick: (fn) => (selectedHandler = fn), onHover: (fn) => (hoverHandler = fn),
    animate(fn) {
      renderer.setAnimationLoop((now) => {
        const dt = Math.min((now - last) / 1000, 0.05); last = now;
        if (camT < 1) {camT = Math.min(1, camT + dt / 0.9); const e = 1 - Math.pow(1 - camT, 3); camera.position.lerpVectors(camFrom, camTo, e); controls.target.lerpVectors(tgtFrom, tgtTo, e);}
        if (!document.hidden) fn(dt);
        controls.update(); renderer.render(scene, camera); labels.render(scene, camera);
      });
    },
  };
}

// 図面の線: 床に描く六角格子と同心円（うすく、遠くほど消える）
export function drawDraftingPlate(parent, {color = 0x8c7b6a, radius = 16, hex = 1.6, opacity = 0.18} = {}) {
  const pts = [];
  const h = Math.sqrt(3) / 2;
  for (let q = -14; q <= 14; q++) for (let r = -14; r <= 14; r++) {
    const cx = hex * 1.5 * q, cz = hex * h * (2 * r + (q & 1));
    if (Math.hypot(cx, cz) > radius) continue;
    for (let i = 0; i < 6; i++) {
      const a0 = (Math.PI / 3) * i, a1 = (Math.PI / 3) * (i + 1);
      pts.push(cx + hex * 0.5 * Math.cos(a0) * 1.0, 0, cz + hex * 0.5 * Math.sin(a0) * 1.0, cx + hex * 0.5 * Math.cos(a1), 0, cz + hex * 0.5 * Math.sin(a1));
    }
  }
  const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(pts, 3));
  const mat = new T.ShaderMaterial({transparent: true, depthWrite: false, uniforms: {uColor: {value: new T.Color(color)}, uRadius: {value: radius}, uOpacity: {value: opacity}},
    vertexShader: 'varying float vD;void main(){vD=length(position.xz);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'uniform vec3 uColor;uniform float uRadius,uOpacity;varying float vD;void main(){float a=uOpacity*smoothstep(uRadius,uRadius*0.35,vD);gl_FragColor=vec4(uColor,a);}'});
  parent.add(new T.LineSegments(geo, mat));
  for (const r of [radius * 0.33, radius * 0.66, radius * 0.98]) {
    const c = new T.EllipseCurve(0, 0, r, r, 0, Math.PI * 2, false, 0).getPoints(128).map((p) => new T.Vector3(p.x, 0, p.y));
    const ring = new T.Line(new T.BufferGeometry().setFromPoints(c), new T.LineBasicMaterial({color, transparent: true, opacity: opacity * 0.9, depthWrite: false}));
    parent.add(ring);
  }
  const cross = new T.LineSegments(new T.BufferGeometry().setFromPoints([new T.Vector3(-radius, 0, 0), new T.Vector3(radius, 0, 0), new T.Vector3(0, 0, -radius), new T.Vector3(0, 0, radius)]), new T.LineBasicMaterial({color, transparent: true, opacity: opacity * 0.6, depthWrite: false}));
  parent.add(cross);
  return mat;
}

export function material(color, metalness = 0.1, roughness = 0.45) {return new T.MeshStandardMaterial({color, metalness, roughness});}
export function add(geo, mat, parent, position = [0, 0, 0]) {const m = new T.Mesh(geo, mat); m.position.set(...position); parent.add(m); return m;}
export function tube(points, r, mat, parent, segments = 64, closed = false) {return add(new T.TubeGeometry(new T.CatmullRomCurve3(points.map((v) => (v.isVector3 ? v : new T.Vector3(...v))), closed, 'centripetal'), segments, r, 12, closed), mat, parent);}
