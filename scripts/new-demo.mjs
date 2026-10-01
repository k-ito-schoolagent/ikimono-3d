// 新しいデモの雛形をつくる:  npm run new-demo -- <id> "<ナビに出す名前>"
// 見本の「浸透と細胞」（osmosis.html / src/osmosis*.js）をコピーして名前を置きかえ、demos.json に登録する
import {readFileSync, writeFileSync, existsSync} from 'node:fs';
import {resolve} from 'node:path';

const root = resolve(import.meta.dirname, '..');
const [id, label] = process.argv.slice(2);
if (!id || !/^[a-z][a-z0-9-]*$/.test(id)) {
  console.error('使い方: npm run new-demo -- <id> "<ナビに出す名前>"\n  id は英小文字・数字・ハイフン（例: nephron）');
  process.exit(1);
}
const files = [
  ['osmosis.html', `${id}.html`],
  ['src/osmosis.js', `src/${id}.js`],
  ['src/osmosis-model.js', `src/${id}-model.js`],
  ['src/osmosis-model.test.js', `src/${id}-model.test.js`],
];
for (const [, to] of files) if (existsSync(resolve(root, to))) {console.error(`${to} はもうあります`); process.exit(1);}
for (const [from, to] of files) {
  const text = readFileSync(resolve(root, from), 'utf8')
    .replaceAll('/src/osmosis.js', `/src/${id}.js`)
    .replaceAll('./osmosis-model.js', `./${id}-model.js`)
    .replaceAll("mountNavigation('osmosis')", `mountNavigation('${id}')`);
  writeFileSync(resolve(root, to), text);
  console.log(`つくりました: ${to}`);
}
const demosPath = resolve(root, 'demos.json');
const demos = JSON.parse(readFileSync(demosPath, 'utf8'));
demos.push({id, page: `${id}.html`, label: label || id, category: 'ヒトのからだ', title: label || id, summary: '一覧に出る紹介文を1〜2文で書きます。', authors: ['@あなたのGitHubのID'], thumb: `thumbs/${id}.webp`});
writeFileSync(demosPath, JSON.stringify(demos, null, 2) + '\n');
console.log('demos.json に登録しました（title・summary・category・authors を書きかえてください）');
console.log(`\n次は: npm run dev → http://127.0.0.1:5173/${id}.html を開き、${id}.html と src/${id}*.js を書きかえます`);
console.log(`できあがったら /${id}.html?embed&thumb を開き「サムネイルを保存」→ public/thumbs/${id}.webp に置きます`);
