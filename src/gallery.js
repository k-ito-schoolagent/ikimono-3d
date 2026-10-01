import './style.css'; import './lab.css'; import './gallery.css';
import {mountNavigation, demos} from './navigation.js';
mountNavigation('home');
const base = import.meta.env.BASE_URL, $ = (id) => document.getElementById(id);
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const no = (i) => String(i + 1).padStart(2, '0');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

// 一覧（サムネイルは demos.json の thumb。なければ暗い地に名前だけ）
$('demo-list').innerHTML = demos.map((d, i) => `<a class="demo-card" href="${base}${esc(d.page)}" data-i="${i}">
 <span class="thumb">${d.thumb ? `<img src="${base}${esc(d.thumb)}" alt="" loading="lazy" width="800" height="500">` : `<span>${esc(d.label)}</span>`}</span>
 <span class="body"><span class="no">${no(i)}</span><span class="cat">${esc(d.category)}</span>
 <h2>${esc(d.title)}</h2><p>${esc(d.summary)}</p>
 ${d.authors?.length ? `<span class="by">つくった人：${d.authors.map(esc).join('、')}</span>` : ''}</span></a>`).join('');
$('count').textContent = `${demos.length} のデモ`;

// ショーケース: 本物のデモを ?embed で1つだけ埋め込み、自動で回して見せる
let cur = -1, timer = 0, hold = false;
$('show-dots').innerHTML = demos.map((d, i) => `<button type="button" data-i="${i}" aria-label="${esc(d.title)}">${no(i)}</button>`).join('');
function show(i) {
  if (i === cur) return; cur = i; const d = demos[i];
  $('show-meta').textContent = `${no(i)} / ${d.category}`; $('show-title').textContent = d.title; $('show-summary').textContent = d.summary;
  $('show-open').href = base + d.page;
  const poster = $('show-poster'); poster.src = d.thumb ? base + d.thumb : ''; poster.hidden = !d.thumb; poster.classList.remove('gone');
  const f = $('show-frame'); f.classList.remove('ready'); f.title = `${d.title}の3D表示`; f.src = `${base}${d.page}?embed`;
  document.querySelectorAll('#show-dots button').forEach((b, k) => b.setAttribute('aria-pressed', String(k === i)));
  document.querySelectorAll('.demo-card').forEach((c, k) => c.classList.toggle('on', k === i));
}
$('show-frame').addEventListener('load', () => setTimeout(() => {$('show-frame').classList.add('ready'); $('show-poster').classList.add('gone');}, 500));
function schedule() {clearTimeout(timer); if (reduce || hold || demos.length < 2) return; timer = setTimeout(() => {if (!document.hidden) show((cur + 1) % demos.length); schedule();}, 12000);}
let hoverT = 0;
document.querySelectorAll('.demo-card').forEach((c) => {const i = +c.dataset.i;
  c.addEventListener('mouseenter', () => {clearTimeout(hoverT); hoverT = setTimeout(() => show(i), 250);});
  c.addEventListener('mouseleave', () => clearTimeout(hoverT));
  c.addEventListener('focus', () => show(i));});
document.querySelectorAll('#show-dots button').forEach((b) => (b.onclick = () => {hold = true; clearTimeout(timer); show(+b.dataset.i);}));
document.querySelector('.show-stage').addEventListener('pointerdown', () => {hold = true; clearTimeout(timer);});
addEventListener('blur', () => {if (document.activeElement === $('show-frame')) {hold = true; clearTimeout(timer);}});   // iframe の中をドラッグしたときも止める
document.querySelectorAll('.demo-card img').forEach((img) => img.addEventListener('error', () => {const span = document.createElement('span'); span.textContent = img.closest('.demo-card').querySelector('h2').textContent; img.replaceWith(span);}));   // サムネイルがまだ無いときは名前を出す
show(0); schedule();

// フォークして別アカウントで公開しても、GitHub へのリンクがそのリポジトリを指すようにする
const seg = location.pathname.split('/').filter(Boolean);
if (/\.github\.io$/.test(location.hostname) && seg.length) {
  const repo = 'https://github.com/' + location.hostname.split('.')[0] + '/' + seg[0];
  $('gh-contrib').href = repo + '/blob/main/CONTRIBUTING.md'; $('gh-issue').href = repo + '/issues/new/choose'; $('gh-repo').href = repo;
}
