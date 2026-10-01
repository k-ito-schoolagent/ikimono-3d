import {defineConfig} from 'vite';
import {resolve} from 'node:path';
import {readFileSync} from 'node:fs';

// デモの一覧は demos.json で管理する。新しいデモはフォルダをつくって demos.json に1件足すだけでビルド対象になる
const demos = JSON.parse(readFileSync(resolve(import.meta.dirname, 'demos.json'), 'utf8'));
const input = {home: resolve(import.meta.dirname, 'index.html')};
for (const d of demos) input[d.id] = resolve(import.meta.dirname, d.dir, 'index.html');   // <dir>/index.html がデモのページ

export default defineConfig({
  // GitHub Pages ではリポジトリ名の下に公開されるので、Actions がリポジトリ名を渡す
  base: process.env.GITHUB_PAGES === 'true' ? `/${process.env.PAGES_REPO || 'ikimono-3d'}/` : '/',
  build: {
    rollupOptions: {
      input,
      output: {manualChunks: {three: ['three'], controls: ['three/addons/controls/OrbitControls.js', 'three/addons/renderers/CSS2DRenderer.js']}},
    },
  },
});
