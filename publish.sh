#!/bin/bash
# GitHub CLI（gh）でリポジトリを作成し、GitHub Pages（Actions 配信）を有効化します。
# 事前に git init とコミットを済ませておいてください。
set -e
REPO=${1:-ikimono-3d}
cd "$(dirname "$0")"
gh repo create "$REPO" --public --source=. --push
gh api -X POST "repos/{owner}/{repo}/pages" -f build_type=workflow >/dev/null
OWNER=$(gh api user -q .login)
echo "公開URL（反映まで1〜2分）: https://${OWNER}.github.io/${REPO}/"
