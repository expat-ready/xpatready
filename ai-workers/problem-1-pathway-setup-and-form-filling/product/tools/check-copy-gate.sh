#!/usr/bin/env bash
# Test of LR-166 (founder A455): a copy over 20 commits behind origin/main, or on a base over 24 h older than main's tip, is
# refused: copy-gate.sh prints one ACT line with the recut (or, with work only here, the clone) command and exits 3;
# lead-watch.sh in such a throwaway clone prints that one line and exits 3 before any other step; session-start.sh in the
# same clone carries the line. A fresh clone passes. Throwaway repositories, no network, US$0.
#   bash product/tools/check-copy-gate.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
command -v jq >/dev/null || { echo "jq is missing; nothing was checked"; exit 2; }
T=$(mktemp -d "${TMPDIR:-/tmp}/copygate.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "$T"' EXIT
export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t
NOW=$(date +%s); D() { date -u -d "@$1" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -r "$1" +%Y-%m-%dT%H:%M:%SZ; }
git init -q --bare -b main "$T/origin.git" 2>/dev/null || git init -q --bare "$T/origin.git"
git clone -q "$T/origin.git" "$T/seed" 2>/dev/null; cd "$T/seed" || exit 2; git checkout -q -b main 2>/dev/null
mkdir -p "$PRODREL/tools"; cp -R "$TOOLS/." "$PRODREL/tools/"; printf '# State\n' > "$PRODREL/STATE.md"
c() { echo "$1" >> log.txt; git add -A; GIT_COMMITTER_DATE="$(D "$2")" GIT_AUTHOR_DATE="$(D "$2")" git commit -qm "$1"; }
c base $((NOW - 3600)); git push -q origin main
cl() { git clone -q "$T/origin.git" "$T/$1" 2>/dev/null; git -C "$T/$1" checkout -q -b "lead/$1" origin/main; }
cl behind; cl pushed
for i in $(seq 1 21); do c "main $i" $((NOW - 1800)); done; git push -q origin main
cl fresh
G="$PRODREL/tools/copy-gate.sh"
out=$(bash "$T/fresh/$G" "$T/fresh"); r=$?
ok "a fresh clone passes (exit 0, an ok line)" "$([ "$r" = 0 ] && grep -q '^copy   gate ok: 0 behind' <<<"$out" && echo 1)" "rc=$r $out"
out=$(bash "$T/behind/$G" "$T/behind"); r=$?
ok "a clone 21 behind is refused: exit 3" "$([ "$r" = 3 ] && echo 1)" "rc=$r $out"
ok "... with one ACT line naming the count and the recut command" "$([ "$(wc -l <<<"$out")" = 1 ] && grep -q '^ACT   stale copy (LR-166): 21 behind origin/main' <<<"$out" && grep -q 'switch -C lead/' <<<"$out" && echo 1)" "$out"
out=$(COPY_GATE_BEHIND=25 bash "$T/behind/$G" "$T/behind"); r=$?
ok "the limit is COPY_GATE_BEHIND (21 behind passes a limit of 25)" "$([ "$r" = 0 ] && echo 1)" "rc=$r $out"
# 20 behind exactly passes (over 20 is refused)
git -C "$T/pushed" fetch -q origin main; git -C "$T/pushed" merge -q --ff-only "$(git -C "$T/pushed" rev-parse origin/main~20)"
out=$(bash "$T/pushed/$G" "$T/pushed"); r=$?
ok "exactly 20 behind passes" "$([ "$r" = 0 ] && echo 1)" "rc=$r $out"
# work only here: the clone command, never the recut
echo mine > "$T/behind/mine.txt"; git -C "$T/behind" add mine.txt; git -C "$T/behind" commit -qm mine
out=$(bash "$T/behind/$G" "$T/behind"); r=$?
ok "a stale copy with a commit only here gets the clone command, not the recut" "$([ "$r" = 3 ] && grep -q 'git clone ' <<<"$out" && ! grep -q 'switch -C' <<<"$out" && echo 1)" "rc=$r $out"
git -C "$T/behind" reset -q --hard HEAD~1
echo changed >> "$T/behind/log.txt"
out=$(bash "$T/behind/$G" "$T/behind"); r=$?
ok "a stale copy with a changed tracked file gets the clone command, not the recut" "$([ "$r" = 3 ] && grep -q 'git clone ' <<<"$out" && grep -q 'changed files' <<<"$out" && ! grep -q 'switch -C' <<<"$out" && echo 1)" "rc=$r $out"
git -C "$T/behind" checkout -q -- log.txt
# a local lead/<today> (not checked out) holding a commit not on main would be reset by the recut: the clone command instead
td=$(TZ=Asia/Kolkata date +%Y-%m-%d)
git -C "$T/behind" branch -q "lead/$td" origin/main && git -C "$T/behind" checkout -q "lead/$td" && echo rec > "$T/behind/rec.txt" && git -C "$T/behind" add rec.txt && git -C "$T/behind" commit -qm "unpushed record" && git -C "$T/behind" checkout -q lead/behind
out=$(bash "$T/behind/$G" "$T/behind"); r=$?
ok "a local lead/<today> holding an unpushed record: the clone command, never the recut that would reset it" "$([ "$r" = 3 ] && grep -q 'git clone ' <<<"$out" && grep -q "lead/$td holds 1 commit" <<<"$out" && ! grep -q 'switch -C' <<<"$out" && echo 1)" "rc=$r $out"
git -C "$T/behind" branch -q -D "lead/$td"
# base over 24 h older than main's tip, only 2 behind
git clone -q "$T/origin.git" "$T/old" 2>/dev/null; cd "$T/seed" || exit 2
c "late 1" $((NOW + 26 * 3600)); c "late 2" $((NOW + 26 * 3600)); git push -q origin main
git -C "$T/old" checkout -q -b lead/old "$(git -C "$T/old" rev-parse origin/main)"
out=$(bash "$T/old/$G" "$T/old"); r=$?
ok "a copy 2 behind on a base over 24 h older than main's tip is refused" "$([ "$r" = 3 ] && grep -q 'base over 24 h old' <<<"$out" && echo 1)" "rc=$r $out"
# lead-watch.sh refuses before any other step
out=$(cd "$T/old" && LEAD_WATCH_STATE_DIR="$T/lw" bash "$PRODREL/tools/lead-watch.sh" 30 2>&1); r=$?
ok "lead-watch.sh in a stale clone exits 3" "$([ "$r" = 3 ] && echo 1)" "rc=$r $(head -3 <<<"$out")"
ok "... printing only the one ACT line, and no check stamp" "$([ "$(wc -l <<<"$out")" = 1 ] && grep -q '^ACT   stale copy (LR-166)' <<<"$out" && [ ! -e "$T/lw/last-check" ] && echo 1)" "$out"
# lead-watch judges its own copy, not the folder it is run from
git -C "$T/fresh" pull -q --ff-only origin main 2>/dev/null
ok "(the fresh clone is fresh again after main moved)" "$(bash "$T/fresh/$G" "$T/fresh" >/dev/null && echo 1)"
out=$(cd "$T/fresh" && LEAD_WATCH_STATE_DIR="$T/lw" bash "$T/old/$PRODREL/tools/lead-watch.sh" 30 2>&1 | head -1)
ok "... its own copy decides (run from a fresh folder, the stale copy's script still refuses)" "$(grep -q '^ACT   stale copy (LR-166)' <<<"$out" && echo 1)" "$out"
# session-start says the same
ss=$(cd "$T/old" && echo "{\"cwd\":\"$T/old\"}" | bash "$PRODREL/tools/session-start.sh" 2>/dev/null | jq -r '.hookSpecificOutput.additionalContext // empty')
ok "session-start.sh in the stale clone carries the same ACT line" "$(grep -q '^ACT   stale copy (LR-166)' <<<"$ss" && echo 1)" "$(head -5 <<<"$ss")"
ss=$(cd "$T/fresh" && echo "{\"cwd\":\"$T/fresh\"}" | bash "$PRODREL/tools/session-start.sh" 2>/dev/null | jq -r '.hookSpecificOutput.additionalContext // empty')
ok "... and not in a fresh one" "$(! grep -q 'LR-166' <<<"$ss" && [ -n "$ss" ] && echo 1)" "$(head -5 <<<"$ss")"
finish
