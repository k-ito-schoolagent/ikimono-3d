import './navigation-layout.css';
import demos from '../demos.json';
export {demos};

// 埋め込み表示: <デモ>.html?embed で、3Dだけを全画面で表示する（トップページのショーケース用）
// サムネイル書き出し: <デモ>.html?embed&thumb で「サムネイルを保存」ボタンが出る（public/thumbs/<id>.webp に置く）
const params = new URLSearchParams(location.search);
export const EMBED = params.has('embed'), THUMB = params.has('thumb');
if (EMBED) document.documentElement.classList.add('embed');
if (THUMB) {
  // WebGL の画面はふだん描くたびに消える。サムネイル表示のときだけ描いた絵を残す設定にして、そのまま画像にする
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, attrs) {return getContext.call(this, type, /webgl/.test(type) ? {...attrs, preserveDrawingBuffer: true} : attrs);};
  window.captureThumb = () => {const c = document.querySelector('#scene canvas'); return c ? c.toDataURL('image/webp', 0.86) : null;};
  addEventListener('DOMContentLoaded', () => {
    const id = (location.pathname.split('/').pop() || 'index').replace(/\.html$/, '');
    const b = document.createElement('button'); b.className = 'thumb-save'; b.textContent = 'サムネイルを保存';
    b.onclick = () => {const url = window.captureThumb(); if (!url) return; const a = document.createElement('a'); a.href = url; a.download = id + '.webp'; a.click();};
    document.body.append(b);
  });
}

// ライト／ダークの切り替え。OS の設定を初期値にして、選んだ方を localStorage に覚える
const THEME_KEY = 'ikimono-theme';
export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try {localStorage.setItem(THEME_KEY, theme);} catch {}
  document.querySelectorAll('.theme-toggle').forEach((b) => {b.setAttribute('aria-pressed', String(theme === 'dark')); b.setAttribute('aria-label', theme === 'dark' ? 'ライトモードにする' : 'ダークモードにする');});
}
export function currentTheme() {
  let saved = null;
  try {saved = localStorage.getItem(THEME_KEY);} catch {}
  return saved || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}

// ヘッダーのナビ。demos.json の順に並ぶ（current はデモの id、一覧ページは 'home'）
export function mountNavigation(current) {
  const base = import.meta.env.BASE_URL, header = document.querySelector('header');
  const items = [['home', '', '一覧', 'すべてのデモ'], ...demos.map((d, i) => [d.id, d.page, String(i + 1).padStart(2, '0'), d.label])];
  header.innerHTML = `<a class="brand" href="${base}"><span class="brand-name">いきもの3D</span><span class="brand-sub">LIVING ANATOMY<br>LAB</span></a><nav aria-label="デモを選択">` +
    items.map(([id, url, n, label]) => `<a href="${base}${url}" ${id === current ? 'aria-current="page"' : ''}><span>${n}</span>${label}</a>`).join('') +
    `</nav><button class="theme-toggle" type="button" aria-pressed="false"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg></button>`;
  header.querySelector('[aria-current]')?.scrollIntoView({block: 'nearest', inline: 'center'});
  const theme = currentTheme();
  applyTheme(theme);
  header.querySelector('.theme-toggle').onclick = () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
}

export function addCameraControls(camera, controls) {
  // 埋め込み表示では、ゆっくり自動で回して見せる（動きを減らす設定のときは回さない）
  if (EMBED && !THUMB && !matchMedia('(prefers-reduced-motion: reduce)').matches) {controls.autoRotate = true; controls.autoRotateSpeed = 0.6;}
  const container = document.createElement('div'); container.className = 'camera-extra';
  container.innerHTML = '<button aria-label="視点を左へ回転">←</button><button aria-label="視点を右へ回転">→</button><button aria-label="拡大">＋</button><button aria-label="縮小">−</button>';
  document.querySelector('.viewport').append(container);
  [...container.children].forEach((b, i) => (b.onclick = () => {
    const v = camera.position.clone().sub(controls.target);
    if (i < 2) {const a = i === 0 ? 0.25 : -0.25; const x = v.x * Math.cos(a) - v.z * Math.sin(a); v.z = v.x * Math.sin(a) + v.z * Math.cos(a); v.x = x;}
    else {v.multiplyScalar(i === 2 ? 0.88 : 1.14); v.setLength(Math.min(controls.maxDistance, Math.max(controls.minDistance, v.length())));}
    camera.position.copy(controls.target).add(v); controls.update();
  }));
}
