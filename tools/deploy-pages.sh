#!/usr/bin/env bash
# Publish the app to GitHub Pages: a fresh production build of dist/, pushed
# to the gh-pages branch of `origin`.
#
#   npm run deploy            build and publish
#   npm run deploy -- --dry   build into .deploy/site only, to test locally:
#                             node tools/serve.js .deploy/site 8125
#
# Why a gh-pages branch rather than GitHub Actions: Actions are disabled by
# default on forks, and the github-pages environment only lets the default
# branch deploy, so the Actions route needs several settings changes first.
#
# .nojekyll matters: Pages runs Jekyll by default, and Jekyll silently drops
# files whose names start with "_" - including the _list.json files behind
# the Community Creations menus.

set -euo pipefail
cd "$(dirname "$0")/.."

DRY=0
[ "${1:-}" = "--dry" ] && DRY=1

REMOTE="$(git remote get-url origin)"
SHA="$(git rev-parse --short HEAD)"
DIRTY="$(git status --porcelain --untracked-files=no | head -1)"
OUT=".deploy/site"

rm -rf .deploy
mkdir -p .deploy

# Start from the published branch if it exists, so the push is a normal
# fast-forward rather than a force-push.
if [ "$DRY" = 0 ] && git ls-remote --exit-code --heads origin gh-pages >/dev/null 2>&1; then
    git clone -q --depth 1 --branch gh-pages "$REMOTE" "$OUT"
else
    git init -q -b gh-pages "$OUT"
    git -C "$OUT" remote add origin "$REMOTE"
fi

# Replace the published files with a fresh copy of dist/, minus the dev
# build output, then build production bundles straight into it - so no stale
# chunks from old dev builds get published.
find "$OUT" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
cp -r dist/. "$OUT"/
rm -rf "$OUT/js"
npx webpack --mode=production --output-path "$OUT/js"
rm -f "$OUT/CNAME"
touch "$OUT/.nojekyll"

if [ "$DRY" = 1 ]; then
    echo "dry run: built into $OUT"
    exit 0
fi

git -C "$OUT" add -A
if git -C "$OUT" diff --cached --quiet; then
    echo "nothing changed - already deployed"
    exit 0
fi
git -C "$OUT" commit -q -m "Deploy ${SHA}${DIRTY:+ (built with uncommitted changes)}"
git -C "$OUT" push -q origin gh-pages
echo "deployed ${SHA} to gh-pages"
