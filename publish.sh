#!/bin/bash
# GitHub CLI（gh）でリポジトリを作成し、GitHub Pages（Actions 配信）を有効化します。
# 事前に git init とコミットを済ませておいてください。
#   使い方: ./publish.sh [リポジトリ名] [GitHub のアカウント]
#   アカウントを指定すると gh auth switch でそのアカウントに切り替えてから作成します（複数アカウントでログイン済みのとき）
set -e
REPO=${1:-ikimono-3d}
OWNER=${2:-$(gh api user -q .login)}
cd "$(dirname "$0")"
if [ "$(gh api user -q .login)" != "$OWNER" ]; then gh auth switch -u "$OWNER"; fi
gh repo create "$OWNER/$REPO" --public --source=. --push \
  --description "動物・ヒト・昆虫のからだと臓器のはたらきを3Dで動かして学ぶ、高校生物向けの日本語教材集。だれでもデモを追加できます（GitHub の練習にもどうぞ）" \
  --homepage "https://$OWNER.github.io/$REPO/"
gh api -X POST "repos/$OWNER/$REPO/pages" -f build_type=workflow >/dev/null
# issue フォームが使うラベル
gh label create "新しいデモ" --repo "$OWNER/$REPO" --color 4d7933 --description "デモのリクエスト・つくります宣言" --force
gh label create "説明・モデル" --repo "$OWNER/$REPO" --color 1d76db --description "説明文や計算モデルの修正提案" --force
gh label create "不具合" --repo "$OWNER/$REPO" --color d73a4a --description "表示や操作のおかしさ" --force
gh label create "練習" --repo "$OWNER/$REPO" --color 0e8a16 --description "GitHub の練習用（気軽にどうぞ）" --force
gh label create "good first issue" --repo "$OWNER/$REPO" --color 7057ff --description "はじめての方歓迎" --force
gh repo edit "$OWNER/$REPO" --add-topic education --add-topic biology --add-topic anatomy --add-topic physiology --add-topic threejs --add-topic vite --add-topic first-timers-only
echo "公開URL（Actions の完了後、1〜2分で有効）: https://$OWNER.github.io/$REPO/"
