#!/usr/bin/env bash
# private-sync.sh: copy the Mac-only private notes into the private GitHub home (P-557, P-678, founder 17 Nov:
# "Private repo + Mac backup"). The private home is github.com/expat-ready/private (private; never public).
# What it copies: every session's side notes (~/Library/Application Support/Claude/side-session-notes) into notes/.
# What it never copies: sources/, code/, archive/ (about 1.3 GB, and the partner team's code capture): those go to
# the Mac's own backup (Time Machine or iCloud), not GitHub.
# It refuses to push when a file holds something that looks like a real key or token (a literal value, not a pattern).
# Test: check-pr-ready-sync.sh. Run by the Lead at each check (lead-watch) or by hand: bash product/tools/private-sync.sh
set -euo pipefail
HOME_DIR="${TMPDIR:-/tmp}/private-home"   # a working copy only; GitHub is the durable home (the sandbox refuses .git writes under the repo)
NOTES="$HOME/Library/Application Support/Claude/side-session-notes"
REMOTE="https://github.com/expat-ready/private.git"

# The remote must really be expat-ready/private and private on GitHub before anything is pushed (#2086 m4). The token
# goes to curl as a header file on a pipe, never on its command line.
meta="$(curl -sf -H @<(printf 'Authorization: Bearer %s\n' "$(gh auth token)") -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/expat-ready/private)" || { echo "private-sync: refused, GitHub did not answer for expat-ready/private" >&2; exit 4; }
python3 -c 'import json,sys;d=json.loads(sys.argv[1]);sys.exit(0 if d.get("full_name")=="expat-ready/private" and d.get("private") is True else 1)' "$meta" \
  || { echo "private-sync: refused, github.com/expat-ready/private is not a private repository" >&2; exit 4; }
if [ ! -d "$HOME_DIR/.git" ]; then
  git clone -q --depth 1 "$REMOTE" "$HOME_DIR"
fi
cd "$HOME_DIR"
[ "$(git config --get remote.origin.url)" = "$REMOTE" ] || { echo "private-sync: refused, $HOME_DIR pushes to $(git config --get remote.origin.url), not $REMOTE" >&2; exit 4; }
git pull -q --ff-only || true
mkdir -p notes
rsync -a --delete --exclude '.DS_Store' "$NOTES"/ notes/side-session-notes/

# Literal secrets only: a real token is a run of key characters, never a regex such as [A-Za-z0-9]{36}.
# GitHub app/user (ghs_, ghu_), Slack (xoxb-, xoxp-), OpenAI project (sk-proj-) and Stripe live (sk_live_) keys added (#2086 m4).
SECRET='sk-ant-[A-Za-z0-9_-]{20}|sk-proj-[A-Za-z0-9_-]{20}|sk_live_[A-Za-z0-9]{20}|gh[pousr]_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{30}|xox[bp]-[A-Za-z0-9-]{20}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----'
if grep -rlE "$SECRET" notes >/dev/null 2>&1; then
  echo "private-sync: refused, a file looks like it holds a real secret:" >&2
  grep -rlE "$SECRET" notes >&2
  exit 3
fi

git add -A
git diff --cached --quiet || git commit -qm "sync: side notes $(TZ=Asia/Kolkata date '+%Y-%m-%d %H:%M IST')"
# A commit an earlier run made but failed to push is pushed now, before "nothing new" (Devin on #2086).
if [ -n "$(git rev-parse -q --verify '@{u}' 2>/dev/null)" ] && [ "$(git rev-list --count '@{u}..HEAD')" = 0 ]; then
  echo "private-sync: nothing new"
  exit 0
fi
git push -q origin HEAD
echo "private-sync: pushed $(git rev-parse --short HEAD) ($(git ls-files | wc -l | tr -d ' ') files)"
