#!/usr/bin/env bash
# private-sync.sh: copy the Mac-only private notes into the private GitHub home (P-557, P-678, founder 17 Nov:
# "Private repo + Mac backup"). The private home is github.com/expat-ready/private (private; never public).
# What it copies: every session's side notes (~/Library/Application Support/Claude/side-session-notes) into notes/.
# What it never copies: sources/, code/, archive/ (about 1.3 GB, and the partner team's code capture): those go to
# the Mac's own backup (Time Machine or iCloud), not GitHub.
# It refuses to push when a file holds something that looks like a real key or token (a literal value, not a pattern),
# and (exit 4) when its source copy is missing or holds no note, before or after the copy, when its working copy has no
# commits or is not a clone of REMOTE, so it can never empty the mirror; a failed pull is exit 5, never "nothing new".
# Run by the Lead at each check (lead-watch) or by hand: bash product/tools/private-sync.sh
set -euo pipefail
HOME_DIR="${PRIVATE_HOME_DIR:-${TMPDIR:-/tmp}/private-home}"   # a working copy only; GitHub is the durable home (the sandbox refuses .git writes under the repo)
NOTES="${PRIVATE_NOTES_DIR:-$HOME/Library/Application Support/Claude/side-session-notes}"
REMOTE="${PRIVATE_REMOTE:-https://github.com/expat-ready/private.git}"   # PRIVATE_*: the test's stand-ins

# Never empty the mirror (Lead 4, 23 Nov): rsync --delete below mirrors the source, so a missing or empty source
# would delete every note on GitHub. Refuse (exit 4) before touching anything.
# A note is a regular file whose name does not start with a dot: folders (git keeps none), .DS_Store, ._* and .localized
# are not notes (breaker, 23 Nov: a source of empty session folders emptied the mirror).
# (no path part under the folder starting with a dot either: .trash/x.md is not a note; breaker round 2).
notes_in() { (cd "$1" 2>/dev/null && find -H . -type f ! -path '*/.*' -print -quit 2>/dev/null); }
if [ ! -d "$NOTES" ] || [ -z "$(notes_in "$NOTES")" ]; then
  echo "private-sync: refused, the source copy is missing or holds no note ($NOTES): nothing synced, the mirror untouched" >&2
  exit 4
fi
if [ ! -d "$HOME_DIR/.git" ]; then
  git clone -q --depth 1 "$REMOTE" "$HOME_DIR"
fi
cd "$HOME_DIR"
# ...never push into another repository (a leftover working copy of something else)...
# (the stored URL, not get-url's insteadOf rewrite; a trailing slash or .git is the same repository)
same_repo() { local a="${1%/}" b="${2%/}"; [ "${a%.git}" = "${b%.git}" ]; }
if ! same_repo "$(git config --get remote.origin.url 2>/dev/null)" "$REMOTE"; then
  echo "private-sync: refused, the working copy $HOME_DIR is not a clone of $REMOTE: nothing synced" >&2
  exit 4
fi
# (a pushurl sends the push elsewhere even when the fetch URL is right; breaker round 3)
while IFS= read -r u; do
  [ -z "$u" ] || same_repo "$u" "$REMOTE" || { echo "private-sync: refused, origin's pushurl $u is not $REMOTE: nothing synced" >&2; exit 4; }
done <<< "$(git config --get-all remote.origin.pushurl 2>/dev/null)"
# (with no pushurl, a url.<base>.pushInsteadOf rule rewrites the push URL; refused when any rule that applies leads
# elsewhere, F4; git applies none to an explicit pushurl, which the loop above checks)
u=$(git config --get remote.origin.url 2>/dev/null || true)
[ -n "$(git config --get-all remote.origin.pushurl 2>/dev/null)" ] || while read -r k v; do
  [ -n "$k" ] || continue; base="${k#url.}"; base="${base%.pushinsteadof}"   # an empty value matches every URL in git
  case "$u" in "$v"*) same_repo "$base${u#"$v"}" "$REMOTE" || { echo "private-sync: refused, a pushInsteadOf rule sends the push for $u to $base${u#"$v"}, not $REMOTE: nothing synced" >&2; exit 4; };; esac
done <<< "$(git config --get-regexp '^url\..*\.pushinsteadof$' 2>/dev/null)"
# ...never push from a working copy that holds no history of the mirror (a failed or empty clone).
if ! git rev-parse -q --verify HEAD >/dev/null 2>&1; then
  echo "private-sync: refused, the working copy $HOME_DIR has no commits (git rev-parse HEAD): nothing synced, the mirror untouched" >&2
  exit 4
fi
# The push goes to the branch the working copy tracks (a local branch of another name would create a new one).
# Asked before the pull, so a copy that tracks nothing is exit 4, not the pull's exit 5 (F4).
up=$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null || true)
case "$up" in origin/?*) ;; *) echo "private-sync: refused, the working copy tracks no branch of origin ($up): nothing synced" >&2; exit 4;; esac
# ...and never report success when GitHub could not be read (a swallowed pull said "nothing new")...
if ! git pull -q --ff-only; then
  echo "private-sync: the pull from $REMOTE failed: nothing synced" >&2
  exit 5
fi
mkdir -p notes
rsync -a --delete --exclude '.DS_Store' "$NOTES"/ notes/side-session-notes/
# Checked again after the copy, on what git will commit (breaker round 2): the source can empty while the pull runs, a
# copied .git folder becomes a gitlink, ignored files are never committed. Nothing is pushed unless a note remains.
# Only regular files are notes (a symlink, mode 120000, is not); a session folder that is its own git repository would be
# committed as a gitlink without its notes, so it is refused and named. A refusal resets notes/ only.
undo() { git reset -q -- notes; git checkout -q HEAD -- notes 2>/dev/null || true; git clean -qffdx notes; }
# A session folder that is a git repository with no commit makes git add fail (exit 128): refused and named (F4).
if ! adderr=$(git add -A notes 2>&1); then
  undo
  echo "private-sync: refused, git add failed (a session folder that is a git repository with no commit?): $(tr "\n" " " <<<"$adderr")nothing pushed, the mirror untouched" >&2
  exit 4
fi
subs=$(git ls-files -s -- notes/side-session-notes | awk '$1 == "160000"' | cut -f2-)
if [ -n "$subs" ]; then
  undo
  echo "private-sync: refused, a session folder is its own git repository, so its notes would not be backed up: $(echo $subs)" >&2
  exit 4
fi
if [ -z "$(git ls-files -s -- notes/side-session-notes/ | awk '$1 == "100644" || $1 == "100755"' | cut -f2- | grep -v -E '(^|/)[.]' | head -1)" ]; then
  undo
  echo "private-sync: refused, no note would be committed after the copy (the source emptied while syncing, or holds only a .git folder, symlinks, ignored or dot files): nothing pushed, the mirror untouched" >&2
  exit 4
fi

# Literal secrets only: a real token is a run of key characters, never a regex such as [A-Za-z0-9]{36}.
if grep -rlE 'sk-ant-[A-Za-z0-9_-]{20}|ghp_[A-Za-z0-9]{36}|gho_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{30}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----' notes >/dev/null 2>&1; then
  echo "private-sync: refused, a file looks like it holds a real secret:" >&2
  grep -rlE 'sk-ant-[A-Za-z0-9_-]{20}|ghp_[A-Za-z0-9]{36}|gho_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{30}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----' notes >&2
  exit 3
fi

# notes/ only (private split PS-1b): the Lead's records share this working copy and are committed by hand, never half-written.
git add -A notes
# A commit an earlier run made but GitHub refused is still ahead of origin: push it, never "nothing new" (breaker round 2).
ahead=$(git rev-list --count '@{u}..HEAD' 2>/dev/null || echo 1)
if git diff --cached --quiet && [ "$ahead" = 0 ]; then
  echo "private-sync: nothing new"
  exit 0
fi
git diff --cached --quiet || git commit -qm "sync: side notes $(TZ=Asia/Kolkata date '+%Y-%m-%d %H:%M IST')"
git push -q origin "HEAD:refs/heads/${up#origin/}"
echo "private-sync: pushed $(git rev-parse --short HEAD) ($(git ls-files | wc -l | tr -d ' ') files)"
