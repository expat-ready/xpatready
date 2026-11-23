#!/usr/bin/env bash
# private-sync.sh: copy the Mac-only private notes into the private GitHub home (P-557, P-678, founder 17 Nov:
# "Private repo + Mac backup"). The private home is github.com/expat-ready/private (private; never public).
# What it copies: every session's side notes (~/Library/Application Support/Claude/side-session-notes) into notes/.
# What it never copies: sources/, code/, archive/ (about 1.3 GB, and the partner team's code capture): those go to
# the Mac's own backup (Time Machine or iCloud), not GitHub.
# It refuses to push when a file holds something that looks like a real key or token (a literal value, not a pattern),
# and (exit 4) when its source copy is missing or empty or its working copy has no commits, so it can never empty the mirror.
# Run by the Lead at each check (lead-watch) or by hand: bash product/tools/private-sync.sh
set -euo pipefail
HOME_DIR="${PRIVATE_HOME_DIR:-${TMPDIR:-/tmp}/private-home}"   # a working copy only; GitHub is the durable home (the sandbox refuses .git writes under the repo)
NOTES="${PRIVATE_NOTES_DIR:-$HOME/Library/Application Support/Claude/side-session-notes}"
REMOTE="${PRIVATE_REMOTE:-https://github.com/expat-ready/private.git}"   # PRIVATE_*: the test's stand-ins

# Never empty the mirror (Lead 4, 23 Nov): rsync --delete below mirrors the source, so a missing or empty source
# would delete every note on GitHub. Refuse (exit 4) before touching anything.
if [ ! -d "$NOTES" ] || [ -z "$(find "$NOTES" -mindepth 1 -not -name .DS_Store -print -quit 2>/dev/null)" ]; then
  echo "private-sync: refused, the source copy is missing or empty ($NOTES): nothing synced, the mirror untouched" >&2
  exit 4
fi
if [ ! -d "$HOME_DIR/.git" ]; then
  git clone -q --depth 1 "$REMOTE" "$HOME_DIR"
fi
cd "$HOME_DIR"
git pull -q --ff-only || true
# ...and never push from a working copy that holds no history of the mirror (a failed or empty clone).
if ! git rev-parse -q --verify HEAD >/dev/null 2>&1; then
  echo "private-sync: refused, the working copy $HOME_DIR has no commits (git rev-parse HEAD): nothing synced, the mirror untouched" >&2
  exit 4
fi
mkdir -p notes
rsync -a --delete --exclude '.DS_Store' "$NOTES"/ notes/side-session-notes/

# Literal secrets only: a real token is a run of key characters, never a regex such as [A-Za-z0-9]{36}.
if grep -rlE 'sk-ant-[A-Za-z0-9_-]{20}|ghp_[A-Za-z0-9]{36}|gho_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{30}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----' notes >/dev/null 2>&1; then
  echo "private-sync: refused, a file looks like it holds a real secret:" >&2
  grep -rlE 'sk-ant-[A-Za-z0-9_-]{20}|ghp_[A-Za-z0-9]{36}|gho_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{30}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----' notes >&2
  exit 3
fi

git add -A
if git diff --cached --quiet; then
  echo "private-sync: nothing new"
  exit 0
fi
git commit -qm "sync: side notes $(TZ=Asia/Kolkata date '+%Y-%m-%d %H:%M IST')"
git push -q origin HEAD
echo "private-sync: pushed $(git rev-parse --short HEAD) ($(git ls-files | wc -l | tr -d ' ') files)"
