// 新しいデモの雛形をつくる:  npm run new-demo -- <id> "<ナビに出す名前>"
// 見本の「浸透と細胞」（osmosis/ フォルダ）をまるごとコピーして名前を置きかえ、demos.json に登録する
import {readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync} from 'node:fs';
import {resolve} from 'node:path';

const root = resolve(import.meta.dirname, '..');
const [id, label] = process.argv.slice(2);
if (!id || !/^[a-z][a-z0-9-]*$/.test(id)) {
  console.error('使い方: npm run new-demo -- <id> "<ナビに出す名前>"\n  id は英小文字・数字・ハイフン（例: nephron）');
  process.exit(1);
}
const dir = resolve(root, id);
if (existsSync(dir)) {console.error(`${id}/ はもうあります`); process.exit(1);}
mkdirSync(dir);
for (const name of readdirSync(resolve(root, 'osmosis'))) {
  const text = readFileSync(resolve(root, 'osmosis', name), 'utf8')
    .replaceAll("mountNavigation('osmosis')", `mountNavigation('${id}')`)
    .replaceAll('浸透と細胞（見本） / いきもの3D', `${label || id} / いきもの3D`);
  writeFileSync(resolve(dir, name), text);
  console.log(`つくりました: ${id}/${name}`);
}
const demosPath = resolve(root, 'demos.json');
const demos = JSON.parse(readFileSync(demosPath, 'utf8'));
demos.push({id, dir: id, label: label || id, category: 'ヒトのからだ', title: label || id, summary: '一覧に出る紹介文を1〜2文で書きます。', authors: ['@あなたのGitHubのID'], thumb: `thumbs/${id}.webp`});
writeFileSync(demosPath, JSON.stringify(demos, null, 2) + '\n');
console.log('demos.json に登録しました（title・summary・category・authors を書きかえてください。分野は既存のものに合わせると一覧でまとまります）');
console.log(`\n次は: npm run dev → http://127.0.0.1:5173/${id}/ を開き、${id}/index.html と ${id}/main.js・${id}/model.js を書きかえます`);
console.log(`できあがったら /${id}/?embed&thumb を開き「サムネイルを保存」→ public/thumbs/${id}.webp に置きます`);
