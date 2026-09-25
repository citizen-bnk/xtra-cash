#!/bin/bash
# XTRA-CASH - Push to GitHub (macOS / Linux). Double-click in Finder, or run: ./push-to-github.command
REPO_URL="https://github.com/citizen-bnk/xtra-cash.git"
BRANCH="main"
cd "$(dirname "$0")" || exit 1
finish() { echo; read -r -p "Press Enter to close..." _; exit "$1"; }

echo; echo "  XTRA-CASH - Push to GitHub  ($REPO_URL)"; echo
command -v git >/dev/null || { echo "Git is not installed. On a Mac, run: xcode-select --install  then try again."; finish 1; }
[ -d .git ] || { echo "Put this file inside the unzipped xtra-cash folder, then run it again."; finish 1; }

git remote get-url origin >/dev/null 2>&1 && git remote set-url origin "$REPO_URL" || git remote add origin "$REPO_URL"
git config user.name >/dev/null || git config user.name "XTRA-CASH Developer"
git config user.email >/dev/null || git config user.email "meshthang@gmail.com"
git checkout -B "$BRANCH" >/dev/null 2>&1

git add -A
if ! git diff --cached --quiet; then
  echo "Saving your latest changes..."
  git commit -m "Update from $(hostname) on $(date '+%Y-%m-%d %H:%M')"
else
  echo "No new changes to save - pushing existing commits."
fi

echo; echo "Pushing to GitHub (sign in if asked)..."; echo
if ! git push -u origin "$BRANCH"; then
  echo; echo "GitHub has commits this computer doesn't have. Merging and retrying..."
  git pull origin "$BRANCH" --no-rebase --allow-unrelated-histories --no-edit || { echo "Conflicting changes - nothing was lost. Ask Claude for help."; finish 1; }
  git push -u origin "$BRANCH" || { echo "Push failed. Check you have write access to citizen-bnk/xtra-cash and are online."; finish 1; }
fi
echo; echo "SUCCESS - https://github.com/citizen-bnk/xtra-cash"
finish 0
