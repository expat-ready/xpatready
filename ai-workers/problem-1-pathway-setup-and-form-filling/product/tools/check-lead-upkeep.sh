#!/usr/bin/env bash
# E12 (P-446) and E13 (P-678): lead-upkeep.py context on made-up values and STATE lines, sync with stand-in commands,
# and lead-watch.sh's wiring (steps 1c and 6b count their ACT lines). Guard 33 in check-guards.sh. No network, US$0.
#   bash product/tools/check-lead-upkeep.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/guard.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "$T"' EXIT
U="python3 -I $TOOLS/lead-upkeep.py"
acts() { grep -c '^ACT' <<<"$1"; }
printf '# State\ncurrent_lead: local_aaa Lead 2 · 21 Nov 01:00 IST (series 3); start read ~100k\n' > "$T/s.md"
printf '# State\ncurrent_lead: local_aaa Lead 2 · 21 Nov 01:00 IST (series 3)\n' > "$T/n.md"
ctx() { env -u LEAD_START_READ LEAD_CONTEXT="$1" $U context --state "${2:-$T/s.md}"; }

# --- E12: context beyond the start read
out=$(env -u LEAD_CONTEXT -u LEAD_START_READ $U context --state "$T/s.md"); r=$?
ok "no LEAD_CONTEXT: an ACT naming get_usage, exit 0 (never a silent pass)" "$([ $r = 0 ] && [ "$(acts "$out")" = 1 ] && grep -q 'Lead context not given: read it with get_usage' <<<"$out" && echo 1)" "$out"
out=$(ctx "lots"); ok "an unreadable value: an ACT" "$([ "$(acts "$out")" = 1 ] && grep -q 'unreadable' <<<"$out" && echo 1)" "$out"
out=$(ctx 240k); ok "240k with start read ~100k (STATE): 140k beyond, no ACT, the line shows both" "$([ "$(acts "$out")" = 0 ] && grep -q 'context 240k · start read 100k (STATE current_lead:) · 140k beyond' <<<"$out" && echo 1)" "$out"
out=$(ctx 250k); ok "250k: 150k beyond: ACT tell the first standby to read RULES+STATE" "$([ "$(acts "$out")" = 1 ] && grep -q '^ACT   Lead context 150k beyond the start read (over 150k): tell the first standby' <<<"$out" && echo 1)" "$out"
out=$(ctx 299k); ok "299k: 199k beyond: still the standby ACT, not the hand-over" "$(grep -q 'tell the first standby' <<<"$out" && ! grep -q 'hand over to the first standby now' <<<"$out" && echo 1)" "$out"
out=$(ctx 300k); ok "300k: 200k beyond (P-446): ACT hand over now" "$([ "$(acts "$out")" = 1 ] && grep -q '^ACT   Lead context 200k beyond the start read (over 200k): refresh RULES.md, then hand over' <<<"$out" && echo 1)" "$out"
out=$(ctx 300000); ok "a raw token count (300000) reads as 300k" "$(grep -q 'context 300k' <<<"$out" && grep -q 'hand over' <<<"$out" && echo 1)" "$out"
out=$(ctx "~312k tokens"); ok "'~312k tokens' reads as 312k" "$(grep -q 'context 312k' <<<"$out" && echo 1)" "$out"
out=$(ctx 285k "$T/n.md"); ok "no start read on STATE: P-446's ~90k assumed and said so; 195k beyond = standby ACT" "$(grep -q "start read 90k (assumed, P-446" <<<"$out" && grep -q 'tell the first standby' <<<"$out" && echo 1)" "$out"
out=$(LEAD_CONTEXT=300k LEAD_START_READ=150k $U context --state "$T/s.md"); ok "LEAD_START_READ wins over STATE (150k: 150k beyond)" "$(grep -q 'start read 150k (LEAD_START_READ)' <<<"$out" && grep -q 'tell the first standby' <<<"$out" && echo 1)" "$out"
out=$(ctx 300k "$T/none.md"); ok "STATE unreadable: the start read is assumed, the context still judged" "$(grep -q 'assumed' <<<"$out" && grep -q 'hand over' <<<"$out" && echo 1)" "$out"

out=$(LEAD_CONTEXT=300k LEAD_START_READ=abc $U context --state "$T/s.md"); ok "a set but unreadable LEAD_START_READ: an ACT, not a quiet fall-back" "$([ "$(acts "$out")" = 1 ] && grep -q '^ACT   LEAD_START_READ unreadable' <<<"$out" && echo 1)" "$out"
out=$(LEAD_CONTEXT=300k LEAD_START_READ=500k $U context --state "$T/s.md"); ok "a start read over the context (a typo): an ACT, never a silent switch-off" "$([ "$(acts "$out")" = 1 ] && grep -q 'is under its start read 500k' <<<"$out" && echo 1)" "$out"
out=$(ctx "300 tokens"); ok "'300 tokens' is 0.3k, not 300k (no false hand-over)" "$(! grep -q 'hand over to the first standby now' <<<"$out" && echo 1)" "$out"
out=$(ctx 4999); ok "a bare 4999 is tokens (5k), no jump at 5000" "$(grep -q 'context 5k' <<<"$out" && echo 1)" "$out"
printf 'current_lead: local_aaa Lead 2; start read ~120000\n' > "$T/t.md"; out=$(ctx 300k "$T/t.md")
ok "a start read written in tokens on STATE (~120000) reads as 120k" "$(grep -q 'start read 120k (STATE current_lead:)' <<<"$out" && echo 1)" "$out"

# --- E13: the private sync at every check
mk() { printf '#!/bin/bash\n%s\n' "$2" > "$T/$1"; chmod +x "$T/$1"; }
mk ok.sh 'echo "private-sync: pushed abc1234 (443 files)"'; mk same.sh 'echo "private-sync: nothing new"'
mk sec.sh 'echo "private-sync: refused, a file looks like it holds a real secret:" >&2; echo notes/x.md >&2; exit 3'
mk bad.sh 'echo "fatal: could not read from remote" >&2; exit 128'; mk slow.sh 'sleep 5; echo late'
out=$(env -u PRIVATE_SYNC $U sync --notes "$T" --cmd "bash $T/ok.sh"); r=$?
ok "pushed: one line, no ACT, exit 0" "$([ $r = 0 ] && [ "$(acts "$out")" = 0 ] && grep -q '^private sync pushed abc1234 (443 files) (P-678)' <<<"$out" && echo 1)" "$out"
out=$(env -u PRIVATE_SYNC $U sync --notes "$T" --cmd "bash $T/same.sh"); ok "nothing new: one line, no ACT" "$([ "$(acts "$out")" = 0 ] && grep -q 'private sync nothing new' <<<"$out" && echo 1)" "$out"
out=$(env -u PRIVATE_SYNC $U sync --notes "$T" --cmd "bash $T/sec.sh"); ok "exit 3 (a note looks like a real secret): ACT refused, the file named" "$([ "$(acts "$out")" = 1 ] && grep -q '^ACT   private sync refused' <<<"$out" && grep -q 'notes/x.md' <<<"$out" && echo 1)" "$out"
out=$(env -u PRIVATE_SYNC $U sync --notes "$T" --cmd "bash $T/bad.sh"); ok "any other failure: ACT with the exit code and the error" "$([ "$(acts "$out")" = 1 ] && grep -q '^ACT   private sync failed (exit 128): fatal: could not read from remote' <<<"$out" && echo 1)" "$out"
out=$(env -u PRIVATE_SYNC $U sync --notes "$T" --cmd "bash $T/slow.sh" --timeout 1); ok "over the time bound: ACT, the check goes on" "$([ "$(acts "$out")" = 1 ] && grep -q 'did not finish in 1 s' <<<"$out" && echo 1)" "$out"
out=$(env -u PRIVATE_SYNC $U sync --notes "$T" --cmd "$T/nothing-here.sh"); ok "the command cannot start: ACT, no traceback" "$([ "$(acts "$out")" = 1 ] && ! grep -q Traceback <<<"$out" && echo 1)" "$out"
mk r3.sh 'echo "rsync error: some files could not be transferred (code 3)" >&2; exit 3'
out=$(env -u PRIVATE_SYNC $U sync --notes "$T" --cmd "bash $T/r3.sh"); ok "exit 3 without the refusal text (rsync's own 3) is a failure, not a secret" "$(grep -q '^ACT   private sync failed (exit 3)' <<<"$out" && echo 1)" "$out"
mk kid.sh "bash -c 'sleep 3; touch $T/survived' & wait"
out=$(env -u PRIVATE_SYNC $U sync --notes "$T" --cmd "bash $T/kid.sh" --timeout 1); sleep 3
ok "a timeout stops the whole group: a grandchild (git, rsync) does not keep running" "$(grep -q 'did not finish in 1 s (stopped' <<<"$out" && [ ! -e "$T/survived" ] && echo 1)" "$out; survived: $(ls "$T/survived" 2>/dev/null)"
mk ask.sh 'read -r x || true; echo "GIT_TERMINAL_PROMPT=$GIT_TERMINAL_PROMPT stdin=${x:-empty}"'
out=$(echo typed | env -u PRIVATE_SYNC $U sync --notes "$T" --cmd "bash $T/ask.sh"); ok "no stdin and no git credential prompt for the sync" "$(grep -q 'GIT_TERMINAL_PROMPT=0 stdin=empty' <<<"$out" && echo 1)" "$out"
out=$(PRIVATE_SYNC=0 $U sync --notes "$T" --cmd "bash $T/bad.sh"); ok "PRIVATE_SYNC=0 skips it and says so" "$([ "$(acts "$out")" = 0 ] && grep -q 'skipped (PRIVATE_SYNC=0)' <<<"$out" && echo 1)" "$out"
out=$(env -u PRIVATE_SYNC $U sync --notes "$T/no-such-folder" --cmd "bash $T/bad.sh"); ok "no side-notes folder (a cloud copy): skips quietly, no ACT, the sync is not run (Lead 9, 21 Nov)" "$([ "$(acts "$out")" = 0 ] && grep -q 'skipped: no side-notes folder' <<<"$out" && echo 1)" "$out"
ok "the default command is this folder's private-sync.sh" "$(grep -q 'os.path.join(here, "private-sync.sh")' "$TOOLS/lead-upkeep.py" && echo 1)"

# --- private-sync.sh never empties the mirror (Lead 4, 23 Nov): it refuses when its source copy is missing or empty, or
# when its working copy of the private home has no commits (git rev-parse); a local bare repository stands in for GitHub.
export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t GIT_CONFIG_GLOBAL=/dev/null
git init -q --bare "$T/remote.git"; git clone -q "$T/remote.git" "$T/seed" 2>/dev/null
mkdir -p "$T/seed/notes/side-session-notes"; echo kept > "$T/seed/notes/side-session-notes/a.md"
git -C "$T/seed" add -A; git -C "$T/seed" commit -qm seed; git -C "$T/seed" push -q origin HEAD 2>/dev/null
before=$(git --git-dir="$T/remote.git" rev-parse HEAD)
if ! command -v rsync >/dev/null; then   # a container without rsync: a stand-in for "rsync -a --delete --exclude X src/ dst/"
  mkdir -p "$T/bin"; printf '#!/bin/sh\nfor d; do :; done; s=""; for a; do [ "$a" = "$d" ] && break; s=$a; done\nrm -rf "$d"; mkdir -p "$d"; cp -a "$s". "$d"\n' > "$T/bin/rsync"; chmod +x "$T/bin/rsync"; PATH="$T/bin:$PATH"
fi
ps() { PRIVATE_NOTES_DIR="$1" PRIVATE_HOME_DIR="$2" PRIVATE_REMOTE="file://$T/remote.git" bash "$TOOLS/private-sync.sh" 2>&1; }
out=$(ps "$T/no-notes" "$T/h1"); r=$?
ok "private-sync: source folder missing → refused (exit 4), the mirror untouched" "$([ $r = 4 ] && grep -q 'refused' <<<"$out" && [ "$(git --git-dir="$T/remote.git" rev-parse HEAD)" = "$before" ] && echo 1)" "exit $r: $out"
mkdir -p "$T/empty-notes"; out=$(ps "$T/empty-notes" "$T/h2"); r=$?
ok "private-sync: source folder empty → refused (exit 4), nothing deleted on the mirror" "$([ $r = 4 ] && grep -q 'refused' <<<"$out" && [ "$(git --git-dir="$T/remote.git" rev-parse HEAD)" = "$before" ] && echo 1)" "exit $r: $out"
mkdir -p "$T/notes"; echo new > "$T/notes/b.md"; git init -q "$T/h3"; git -C "$T/h3" remote add origin "file://$T/remote.git"
out=$(ps "$T/notes" "$T/h3"); r=$?
ok "private-sync: a working copy with no commits (git rev-parse HEAD fails) → refused (exit 4), the mirror untouched" "$([ $r = 4 ] && grep -q 'has no commits (git rev-parse HEAD)' <<<"$out" && [ "$(git --git-dir="$T/remote.git" rev-parse HEAD)" = "$before" ] && echo 1)" "exit $r: $out"
out=$(ps "$T/notes" "$T/h4"); r=$?
ok "private-sync: a real source pushes (exit 0) and the mirror gains the note" "$([ $r = 0 ] && grep -q 'private-sync: pushed' <<<"$out" && git --git-dir="$T/remote.git" show HEAD:notes/side-session-notes/b.md 2>/dev/null | grep -q new && echo 1)" "exit $r: $out"
# Private split (PS-1b): the Lead's records share this working copy; a sync commits notes/ only, never a half-written STATE.
mkdir -p "$T/h4/xpatready/product" && echo "half written" > "$T/h4/xpatready/product/STATE.md" && echo more > "$T/notes/c.md"
out=$(ps "$T/notes" "$T/h4"); r=$?
ok "private-sync: commits notes/ only; a records file beside it stays uncommitted" "$([ $r = 0 ] && git --git-dir="$T/remote.git" show HEAD:notes/side-session-notes/c.md >/dev/null 2>&1 && ! git --git-dir="$T/remote.git" show HEAD:xpatready/product/STATE.md >/dev/null 2>&1 && echo 1)" "exit $r: $out"
rm -rf "$T/h4/xpatready"
# Breaker, 23 Nov: folders, .DS_Store and hidden files are not notes; the source can empty during the pull; a working copy
# of another remote or a failed pull must not report success. Each case: refused, the mirror's HEAD unchanged.
untouched() { [ "$(git --git-dir="$T/remote.git" rev-parse HEAD)" = "$before" ]; }
before=$(git --git-dir="$T/remote.git" rev-parse HEAD)
mkdir -p "$T/n-dirs/local_aaa" "$T/n-dirs/local_bbb"; out=$(ps "$T/n-dirs" "$T/h5"); r=$?
ok "private-sync: a source of empty session folders only → refused (exit 4), the mirror untouched" "$([ $r = 4 ] && untouched && echo 1)" "exit $r: $out"
mkdir -p "$T/n-ds/local_aaa"; : > "$T/n-ds/local_aaa/.DS_Store"; out=$(ps "$T/n-ds" "$T/h6"); r=$?
ok "private-sync: only .DS_Store inside a session folder → refused (exit 4), the mirror untouched" "$([ $r = 4 ] && untouched && echo 1)" "exit $r: $out"
mkdir -p "$T/n-hid"; : > "$T/n-hid/._n1.md"; : > "$T/n-hid/.localized"; out=$(ps "$T/n-hid" "$T/h7"); r=$?
ok "private-sync: only hidden files → refused (exit 4), the mirror untouched" "$([ $r = 4 ] && untouched && echo 1)" "exit $r: $out"
mkdir -p "$T/n-race/local_aaa" "$T/gitw"; echo note > "$T/n-race/local_aaa/r.md"
printf '#!/bin/sh\ncase "$1" in pull) "%s" "$@"; r=$?; rm -rf "%s"/*; exit $r;; esac\nexec "%s" "$@"\n' "$(command -v git)" "$T/n-race" "$(command -v git)" > "$T/gitw/git"; chmod +x "$T/gitw/git"
out=$(PATH="$T/gitw:$PATH" ps "$T/n-race" "$T/h8"); r=$?
ok "private-sync: the source empties during the pull (after the first check) → refused after rsync (exit 4), the mirror untouched" "$([ $r = 4 ] && untouched && echo 1)" "exit $r: $out"
git init -q --bare "$T/other.git"; git clone -q "$T/remote.git" "$T/h9" 2>/dev/null; git -C "$T/h9" remote set-url origin "file://$T/other.git"
out=$(ps "$T/notes" "$T/h9"); r=$?
ok "private-sync: a working copy whose origin is another repository → refused (exit 4)" "$([ $r = 4 ] && grep -q 'refused' <<<"$out" && echo 1)" "exit $r: $out"
mv "$T/remote.git" "$T/remote.away"; out=$(ps "$T/notes" "$T/h4"); r=$?; mv "$T/remote.away" "$T/remote.git"
ok "private-sync: the pull fails (GitHub unreachable) → exit 5, never 'nothing new'" "$([ $r = 5 ] && ! grep -q 'nothing new' <<<"$out" && echo 1)" "exit $r: $out"
# Breaker round 2 (23 Nov): judged on what git will commit, not on the disk; a failed push is retried; the stored origin
# URL is compared (insteadOf rewriting and a trailing slash or .git do not refuse the Lead's own clone).
before=$(git --git-dir="$T/remote.git" rev-parse HEAD)
mkdir -p "$T/n-git"; git init -q "$T/n-git"; out=$(ps "$T/n-git" "$T/h10"); r=$?
ok "private-sync: a source holding only a .git folder → refused (exit 4), the mirror untouched" "$([ $r = 4 ] && untouched && echo 1)" "exit $r: $out"
mkdir -p "$T/n-ign"; echo x > "$T/n-ign/n1.md.swp"; printf '*.swp\n' > "$T/excl"
out=$(GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.excludesFile GIT_CONFIG_VALUE_0="$T/excl" ps "$T/n-ign" "$T/h11"); r=$?
ok "private-sync: a source of git-ignored files only → refused (exit 4), the mirror untouched" "$([ $r = 4 ] && untouched && echo 1)" "exit $r: $out"
mkdir -p "$T/n-trash/.trash"; echo x > "$T/n-trash/.trash/x.md"; out=$(ps "$T/n-trash" "$T/h12"); r=$?
ok "private-sync: a note only under a dot-folder (.trash/x.md) → refused (exit 4), the mirror untouched" "$([ $r = 4 ] && untouched && echo 1)" "exit $r: $out"
mkdir -p "$T/n-push"; echo a > "$T/n-push/a.md"; ps "$T/n-push" "$T/h13" >/dev/null 2>&1
echo b > "$T/n-push/new.md"; printf '#!/bin/sh\nexit 1\n' > "$T/remote.git/hooks/pre-receive"; chmod +x "$T/remote.git/hooks/pre-receive"
out1=$(ps "$T/n-push" "$T/h13"); r1=$?; rm -f "$T/remote.git/hooks/pre-receive"; out=$(ps "$T/n-push" "$T/h13"); r=$?
ok "private-sync: a push GitHub refused is pushed by the next run, never 'nothing new'" "$([ $r1 != 0 ] && [ $r = 0 ] && grep -q 'private-sync: pushed' <<<"$out" && git --git-dir="$T/remote.git" show HEAD:notes/side-session-notes/new.md >/dev/null 2>&1 && echo 1)" "first exit $r1; then exit $r: $out"
out=$(GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0="url.file://$T/.insteadOf" GIT_CONFIG_VALUE_0="file:///alias/" PRIVATE_NOTES_DIR="$T/n-push" PRIVATE_HOME_DIR="$T/h14" PRIVATE_REMOTE="file:///alias/remote.git" bash "$TOOLS/private-sync.sh" 2>&1); r=$?
ok "private-sync: an insteadOf rule on the Mac does not refuse its own clone (the stored URL is compared)" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
out=$(PRIVATE_NOTES_DIR="$T/n-push" PRIVATE_HOME_DIR="$T/h13" PRIVATE_REMOTE="file://$T/remote.git/" bash "$TOOLS/private-sync.sh" 2>&1); r=$?
ok "private-sync: REMOTE with a trailing slash still matches a clone made without one" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
mkdir -p "$T/n-race2/local_aaa" "$T/gitw2"; echo note > "$T/n-race2/local_aaa/r.md"
printf '#!/bin/sh\ncase "$1" in pull) "%s" "$@"; r=$?; rm -rf "%s"/*; mkdir -p "%s/.trash"; echo x > "%s/.trash/y.md"; exit $r;; esac\nexec "%s" "$@"\n' "$(command -v git)" "$T/n-race2" "$T/n-race2" "$T/n-race2" "$(command -v git)" > "$T/gitw2/git"; chmod +x "$T/gitw2/git"
before=$(git --git-dir="$T/remote.git" rev-parse HEAD); out=$(PATH="$T/gitw2:$PATH" ps "$T/n-race2" "$T/h15"); r=$?
ok "private-sync: only a dot-folder note left after the pull → refused after the copy (exit 4), the mirror untouched" "$([ $r = 4 ] && untouched && echo 1)" "exit $r: $out"
# Breaker round 3 (23 Nov): a symlink is not a note; a session folder that is its own git repository is refused, not
# silently skipped; a refusal resets only notes/; a pushurl elsewhere is refused; the push goes to the upstream branch.
mkdir -p "$T/n-race3/local_aaa" "$T/gitw3"; echo note > "$T/n-race3/local_aaa/c.md"
printf '#!/bin/sh\ncase "$1" in pull) "%s" "$@"; r=$?; rm -rf "%s"/*; ln -s /nonexistent "%s/link.md"; exit $r;; esac\nexec "%s" "$@"\n' "$(command -v git)" "$T/n-race3" "$T/n-race3" "$(command -v git)" > "$T/gitw3/git"; chmod +x "$T/gitw3/git"
before=$(git --git-dir="$T/remote.git" rev-parse HEAD); out=$(PATH="$T/gitw3:$PATH" ps "$T/n-race3" "$T/h16"); r=$?
ok "private-sync: only a symlink left after the pull → refused after the copy (exit 4), the mirror untouched" "$([ $r = 4 ] && untouched && echo 1)" "exit $r: $out"
mkdir -p "$T/n-sub/s2"; echo a > "$T/n-sub/a.md"; echo z > "$T/n-sub/s2/z.md"; git init -q "$T/n-sub/s2"; git -C "$T/n-sub/s2" add -A; git -C "$T/n-sub/s2" commit -qm z
before=$(git --git-dir="$T/remote.git" rev-parse HEAD); out=$(ps "$T/n-sub" "$T/h17"); r=$?
ok "private-sync: a session folder that is its own git repository → refused (exit 4, named), never 'pushed' without its notes" "$([ $r = 4 ] && grep -q 's2' <<<"$out" && untouched && echo 1)" "exit $r: $out"
ps "$T/notes" "$T/h18" >/dev/null 2>&1; mkdir -p "$T/h18/other"; echo k > "$T/h18/other/keep.md"; git -C "$T/h18" add other/keep.md
out=$(GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.excludesFile GIT_CONFIG_VALUE_0="$T/excl" ps "$T/n-ign" "$T/h18"); r=$?
ok "private-sync: a refusal after the copy resets notes/ only (work staged elsewhere in the working copy stays)" "$([ $r = 4 ] && git -C "$T/h18" diff --cached --name-only | grep -qx other/keep.md && echo 1)" "exit $r: $out; staged: $(git -C "$T/h18" diff --cached --name-only)"
git -C "$T/h18" reset -q; rm -rf "$T/h18/other"
ps "$T/notes" "$T/h19" >/dev/null 2>&1; git -C "$T/h19" config remote.origin.pushurl "file://$T/other.git"; echo c > "$T/notes/c.md"
out=$(ps "$T/notes" "$T/h19"); r=$?
ok "private-sync: a pushurl pointing elsewhere → refused (exit 4)" "$([ $r = 4 ] && grep -q 'refused' <<<"$out" && echo 1)" "exit $r: $out"
def=$(git --git-dir="$T/remote.git" symbolic-ref --short HEAD); ps "$T/notes" "$T/h20" >/dev/null 2>&1
git -C "$T/h20" checkout -q -b work --track "origin/$def"; echo d > "$T/notes/d.md"; out=$(ps "$T/notes" "$T/h20"); r=$?
ok "private-sync: a working copy on another local branch pushes to the upstream branch ($def), not a new branch" "$([ $r = 0 ] && git --git-dir="$T/remote.git" show "$def:notes/side-session-notes/d.md" >/dev/null 2>&1 && ! git --git-dir="$T/remote.git" rev-parse -q --verify refs/heads/work >/dev/null && echo 1)" "exit $r: $out"
# F4 (follow-up on #2590, 23 Nov): no upstream is refused (exit 4) before the pull, not exit 5; a pushInsteadOf rule that
# sends the push to another repository is refused; a session folder that is a git repository with no commit is refused
# (exit 4, named, notes/ reset), never git add's bare exit 128.
before=$(git --git-dir="$T/remote.git" rev-parse HEAD); git clone -q "file://$T/remote.git" "$T/h21" 2>/dev/null; git -C "$T/h21" branch -q --unset-upstream;   # a full clone: there git pull fails with no upstream (a --depth 1 one still pulls)
echo e > "$T/notes/e.md"
out=$(ps "$T/notes" "$T/h21"); r=$?
ok "private-sync: a working copy that tracks no branch → refused (exit 4) before the pull, not exit 5" "$([ $r = 4 ] && grep -q 'tracks no branch of origin' <<<"$out" && ! grep -q 'pull from' <<<"$out" && echo 1)" "exit $r: $out"
ps "$T/notes" "$T/h22" >/dev/null 2>&1; echo f > "$T/notes/f.md"; ob=$(git --git-dir="$T/other.git" for-each-ref | wc -l)
out=$(GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0="url.file://$T/other.git.pushInsteadOf" GIT_CONFIG_VALUE_0="file://$T/remote.git" ps "$T/notes" "$T/h22"); r=$?
ok "private-sync: a pushInsteadOf rule that sends the push to another repository → refused (exit 4), nothing pushed there" "$([ $r = 4 ] && grep -q 'pushInsteadOf' <<<"$out" && [ "$(git --git-dir="$T/other.git" for-each-ref | wc -l)" = "$ob" ] && echo 1)" "exit $r: $out"
out=$(GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0="url.file://$T/remote.git/.pushInsteadOf" GIT_CONFIG_VALUE_0="file://$T/remote.git" ps "$T/notes" "$T/h22"); r=$?
ok "private-sync: a pushInsteadOf rule that still names the private home (a trailing slash) is not refused" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
out=$(GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0="url.file://$T/other.git#.pushInsteadOf" GIT_CONFIG_VALUE_0="" ps "$T/notes" "$T/h22"); r=$?
ok "private-sync: an empty pushInsteadOf value (git applies it to every URL) that sends the push elsewhere → refused (exit 4)" "$([ $r = 4 ] && grep -q 'pushInsteadOf' <<<"$out" && echo 1)" "exit $r: $out"
mkdir -p "$T/n-sub0/s3"; echo a > "$T/n-sub0/a.md"; echo z > "$T/n-sub0/s3/z.md"; git init -q "$T/n-sub0/s3"
before=$(git --git-dir="$T/remote.git" rev-parse HEAD); out=$(ps "$T/n-sub0" "$T/h23"); r=$?
ok "private-sync: a session folder that is a git repository with no commit → refused (exit 4, named), notes/ reset, the mirror untouched" "$([ $r = 4 ] && grep -q 's3' <<<"$out" && untouched && [ -z "$(git -C "$T/h23" status --porcelain 2>&1)" ] && echo 1)" "exit $r: $out; status: $(git -C "$T/h23" status --porcelain 2>&1)"
: > "$T/afile"; out=$(env -u PRIVATE_SYNC $U sync --notes "$T/afile" --cmd "bash $T/bad.sh"); ok "the side-notes path is a file, not a folder: no quiet skip, the sync runs and its failure is an ACT" "$([ "$(acts "$out")" = 1 ] && echo 1)" "$out"
ln -s /nonexistent "$T/dangling"; out=$(env -u PRIVATE_SYNC $U sync --notes "$T/dangling" --cmd "bash $T/bad.sh"); ok "the side-notes path is a dangling symlink: no quiet skip, an ACT" "$([ "$(acts "$out")" = 1 ] && echo 1)" "$out"
W="$TOOLS/../../../../.claude/skills/lead-watch/SKILL.md"
ok "skill lead-watch step 1 passes the context to lead-watch.sh (LEAD_CONTEXT, Lead 9 21 Nov)" "$(grep -q 'LEAD_CONTEXT=<k> bash product/tools/lead-watch.sh 30' "$W" && echo 1)" "no LEAD_CONTEXT in $W step 1"

# --- wiring in lead-watch.sh
L="$TOOLS/lead-watch.sh"
ok "lead-watch.sh step 1c reads the context against STATE and counts its ACT lines" "$(grep -q 'lead-upkeep.py" context --state "\$RECS/STATE.md"' "$L" && grep -q 'echo "\$lc"; act=\$((act + \$(grep -c .^ACT. <<<"\$lc")))' "$L" && echo 1)" "no 1c wiring in $L"
ok "lead-watch.sh step 6b runs the private sync and counts its ACT lines" "$(grep -q 'lead-upkeep.py" sync' "$L" && grep -q 'echo "\$ps"; act=\$((act + \$(grep -c .^ACT. <<<"\$ps")))' "$L" && echo 1)" "no 6b wiring in $L"
finish
