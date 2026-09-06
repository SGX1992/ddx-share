#!/usr/bin/env bash
# Publishes the speaker build to speak.ddxconference.com.
#
# GitHub Pages allows one custom domain per repository, so the two audiences
# need two repositories. The code is identical — the speaker build is chosen at
# runtime from the hostname (see assets/js/variant.js) — and the only file that
# differs is CNAME. This copies the site, swaps that one line, and publishes.
#
# Run it again after any change to republish; it force-pushes the mirror.
set -euo pipefail

GH="${GH:-$HOME/.local/bin/gh}"
SRC="$(cd "$(dirname "$0")" && pwd)"
MIRROR="$(dirname "$SRC")/ddx-speak"
DOMAIN="speak.ddxconference.com"
REPO="ddx-speak"

echo "→ mirroring $SRC to $MIRROR"
rm -rf "$MIRROR"
mkdir -p "$MIRROR"
# everything except git history and the mirror script itself
rsync -a --exclude '.git' --exclude 'deploy-speaker.sh' "$SRC/" "$MIRROR/"
printf '%s\n' "$DOMAIN" > "$MIRROR/CNAME"

cd "$MIRROR"
git init -q
git add -A
git -c user.name="Sebastian Gier" -c user.email="sebastian@fastforward.global" \
    commit -q -m "Speaker build of the DDX poster tool"
git branch -M main

if "$GH" repo view "$REPO" >/dev/null 2>&1; then
  echo "→ repo exists, force-pushing"
  git remote add origin "https://github.com/$($GH api user --jq .login)/$REPO.git" 2>/dev/null || true
  git push -qf origin main
else
  echo "→ creating $REPO"
  "$GH" repo create "$REPO" --public --source=. --remote=origin --push \
    --description "DDX poster tool — speaker build"
  "$GH" api -X POST "repos/$($GH api user --jq .login)/$REPO/pages" \
    -f "source[branch]=main" -f "source[path]=/" >/dev/null
fi

echo "✓ done — https://$DOMAIN (give Pages a couple of minutes)"
