#!/usr/bin/env bash
# Test of LR-156 (founder A433/A434, trunk-based development): (1) session-start.sh recuts a stale fixture Lead copy onto
# lead/<today IST> from origin/main, and warns loudly (never recutting) when work is unpushed or files are changed; (2)
# lane.sh whoami says lead-stale for a lead/* copy over 24 h or 200 commits behind; (3) the zero-token watch line;
# (4) the records-PR check (git and GitHub's compare answer). Throwaway repositories, a stand-in uname (whoami needs the
# Mac); no network, US$0.   bash product/tools/check-lead-age.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
command -v jq >/dev/null || { echo "jq is missing; nothing was checked"; exit 2; }
T=$(mktemp -d "${TMPDIR:-/tmp}/leadage.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "$T"' EXIT
mkdir "$T/bin"; printf '#!/bin/sh\necho Darwin\n' > "$T/bin/uname"; chmod +x "$T/bin/uname"
export PATH="$T/bin:$PATH" GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t; unset CLAUDE_CODE_REMOTE
NOW=$(date -d '2026-11-27T08:00:00Z' +%s 2>/dev/null || date -j -f '%Y-%m-%dT%H:%M:%SZ' 2026-11-27T08:00:00Z +%s); export NOW
D() { date -u -d "@$1" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -r "$1" +%Y-%m-%dT%H:%M:%SZ; }
git init -q --bare -b main "$T/origin.git" 2>/dev/null || git init -q --bare "$T/origin.git"
git clone -q "$T/origin.git" "$T/seed" 2>/dev/null; cd "$T/seed" || exit 2; git checkout -q -b main 2>/dev/null
mkdir -p "$PRODREL/tools"; cp -R "$TOOLS/." "$PRODREL/tools/"; printf '# State\n' > "$PRODREL/STATE.md"
c() { echo "$1" >> log.txt; git add -A; GIT_COMMITTER_DATE="$(D "$2")" GIT_AUTHOR_DATE="$(D "$2")" git commit -qm "$1"; }
c base $((NOW - 60 * 3600)); git push -q origin main
copy() {  # $1 name, $2 branch: a Lead copy on lead/$2 cut at the 60-h-old base, pushed
  git clone -q "$T/origin.git" "$T/$1" 2>/dev/null; git -C "$T/$1" checkout -q -b "lead/$2" origin/main
  git -C "$T/$1" push -q -u origin "lead/$2" 2>/dev/null; }
copy old 2026-11-24
c "main moves" $((NOW - 3600)); git push -q origin main
ss() { out=$(cd "$T/$1" && echo "{\"cwd\":\"$T/$1\"}" | bash "$PRODREL/tools/session-start.sh" 2>&1 | jq -r '.hookSpecificOutput.additionalContext // empty' | head -4); }
wh() { (cd "$T/$1" && git fetch -q origin main && bash "$PRODREL/tools/lane.sh" whoami); }
# (2) whoami
ok "(2) a lead/* copy whose base is 60 h old: whoami says lead-stale" "$([ "$(wh old)" = lead-stale ] && echo 1)" "$(wh old)"
copy fresh 2026-11-27; git -C "$T/fresh" pull -q --ff-only origin main 2>/dev/null
ok "(2) a lead copy cut from today's main: whoami says lead" "$([ "$(wh fresh)" = lead ] && echo 1)" "$(wh fresh)"
out=$(cd "$T/old" && LEAD_STALE_HOURS=100 LEAD_STALE_BEHIND=0 bash "$PRODREL/tools/lead-age.sh" stale && echo stale)
ok "(2) over 200 commits behind is stale too (threshold 0 here)" "$([ "$out" = stale ] && echo 1)" "$out"
# (1) session-start
cp -R "$T/old" "$T/dirty"; echo x >> "$T/dirty/log.txt"; ss dirty
ok "(1) a stale copy with a changed tracked file: LOUD warning with the exact commands, not recut" "$(grep -q 'STALE LEAD COPY, NOT RECUT' <<< "$out" && grep -q 'git switch -C lead/2026-11-27 origin/main' <<< "$out" && [ "$(git -C "$T/dirty" branch --show-current)" = lead/2026-11-24 ] && echo 1)" "$out"
cp -R "$T/old" "$T/unpushed"; (cd "$T/unpushed" && echo y >> log.txt && git commit -qam "a record not pushed"); ss unpushed
ok "(1) a stale copy with a commit not pushed: LOUD warning naming 1 commit, not recut, the commit kept" "$(grep -q '1 commit(s) exist only here' <<< "$out" && [ "$(git -C "$T/unpushed" branch --show-current)" = lead/2026-11-24 ] && git -C "$T/unpushed" log -1 --format=%s | grep -q 'not pushed' && echo 1)" "$out"
ss old
ok "(1) a stale, clean, pushed copy is recut by session-start onto lead/<today IST> from origin/main, one line" "$(grep -q '^Lead copy recut (LR-156, P-388): lead/2026-11-24 → lead/2026-11-27' <<< "$out" && [ "$(git -C "$T/old" branch --show-current)" = lead/2026-11-27 ] && [ "$(git -C "$T/old" rev-parse HEAD)" = "$(git -C "$T/old" rev-parse origin/main)" ] && echo 1)" "$out"
ok "(1) ... with its upstream set to origin/lead/<today>, and whoami now says lead" "$([ "$(git -C "$T/old" config branch.lead/2026-11-27.merge)" = refs/heads/lead/2026-11-27 ] && [ "$(wh old)" = lead ] && echo 1)" "$(git -C "$T/old" config --get-regexp 'branch.lead')"
ss fresh; ok "(1) a fresh copy is left alone; the context shows its age line" "$(! grep -q 'recut' <<< "$out" && grep -q '^lead copy: lead/2026-11-27 · base 0 h old · 0 behind origin/main' <<< "$out" && echo 1)" "$out"
copy yday 2026-11-26; git -C "$T/yday" pull -q --ff-only origin main 2>/dev/null
(cd "$T/fresh" && echo z > records.txt && git add records.txt && git commit -qm "records" && git push -q 2>/dev/null)
(cd "$T/yday" && echo w > yrecords.txt && git add yrecords.txt && git commit -qm "y records" && git push -q 2>/dev/null)
git -C "$T/seed" fetch -q origin; git -C "$T/seed" merge -q --no-edit origin/lead/2026-11-27; git -C "$T/seed" merge -q --no-edit origin/lead/2026-11-26
c "main after the records" $((NOW - 300)); git -C "$T/seed" push -q origin main
ss yday; ok "(1) an earlier day's branch whose records are all on main, main moved on: recut even under 24 h" "$(grep -q 'its records are all on main' <<< "$out" && [ "$(git -C "$T/yday" branch --show-current)" = lead/2026-11-27 ] && echo 1)" "$out"
ss fresh; ok "(1) today's branch with its records on main is not recut on that alone (a standby may share the copy)" "$(! grep -q 'recut' <<< "$out" && [ "$(git -C "$T/fresh" branch --show-current)" = lead/2026-11-27 ] && echo 1)" "$out"
# Review of #3926 (Major): an existing local lead/<today> holding a commit not on main is never reset.
copy keep 2026-11-25; (cd "$T/keep" && git branch -q lead/2026-11-27 origin/main && git switch -q lead/2026-11-27 && echo k > keep.txt && git add keep.txt && git commit -qm "unpushed record on today's branch" && git switch -q lead/2026-11-25)
c "later main" $((NOW - 100)); git -C "$T/seed" push -q origin main
ss keep; ok "(1) an existing local lead/<today> with a commit not on main: NOT recut, named, its commit kept" "$(grep -q 'already exists here with 1 commit' <<< "$out" && git -C "$T/keep" log -1 --format=%s lead/2026-11-27 | grep -q 'unpushed record' && [ "$(git -C "$T/keep" branch --show-current)" = lead/2026-11-25 ] && echo 1)" "$out"
out=$(cd "$T/keep" && LEAD_FETCH_FAILED=1 bash "$PRODREL/tools/lead-age.sh" recut); ok "(1) after a failed fetch: no recut, said" "$(grep -q 'GitHub could not be reached' <<< "$out" && echo 1)" "$out"
out=$(cd "$T/old" && NOW=$((NOW + 100 * 3600)) bash "$PRODREL/tools/lead-age.sh" line); r=$?
ok "(2) a quiet main (no merge for 100 h) never makes a copy cut from its tip stale" "$([ $r = 0 ] && ! grep -q STALE <<< "$out" && echo 1)" "exit $r: $out"
# (3) the watch line
out=$(cd "$T/unpushed" && bash "$PRODREL/tools/lead-age.sh" watch once)
ok "(3) the zero-token watch prints STALE-COPY for a stale Lead copy" "$(grep -qE '^STALE-COPY [0-9]+ behind origin/main, base [0-9]+ h old' <<< "$out" && echo 1)" "$out"
out=$(cd "$T/old" && bash "$PRODREL/tools/lead-age.sh" watch once); ok "(3) ... and nothing for a fresh one" "$([ -z "$out" ] && echo 1)" "$out"
# (4) CI on records PRs
b=$(git -C "$T/seed" rev-parse main); h=$(git -C "$T/unpushed" rev-parse HEAD); git -C "$T/seed" fetch -q "$T/unpushed" "$h" 2>/dev/null
out=$(cd "$T/seed" && bash "$PRODREL/tools/lead-age.sh" ci "$b" "$h"); r=$?
ok "(4) a records branch cut 60 h before main's tip fails, naming the recut" "$([ $r = 1 ] && grep -q 'REFUSED (LR-156' <<< "$out" && grep -q 'git switch -C lead/<today IST> origin/main' <<< "$out" && echo 1)" "exit $r: $out"
cj() { jq -n --arg b "$1" --arg m "$2" '{base_commit:{commit:{committer:{date:$b}}}, merge_base_commit:{commit:{committer:{date:$m}}}}' | bash "$TOOLS/lead-age.sh" ci-json; }
out=$(cj 2026-11-27T08:00:00Z 2026-11-26T02:00:00Z); r=$?; ok "(4) GitHub's compare answer: 30 h apart fails" "$([ $r = 1 ] && grep -q 'REFUSED' <<< "$out" && echo 1)" "exit $r: $out"
out=$(cj 2026-11-27T08:00:00Z 2026-11-27T01:00:00Z); r=$?; ok "(4) ... 7 h apart passes" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
out=$(echo '{}' | bash "$TOOLS/lead-age.sh" ci-json); r=$?; ok "(4) an unreadable answer fails, never a silent pass" "$([ $r = 1 ] && echo 1)" "exit $r: $out"
grep -q 'lead-age.sh" ci-json' "$TOOLS/../../../../.github/workflows/pr-rules.yml"; ok "(4) pr-rules.yml runs it on records and lead/* PRs" "$([ $? = 0 ] && echo 1)"
grep -q 'lead-age.sh" line' "$TOOLS/lead-watch.sh"; ok "the lead-watch report has the branch age line" "$([ $? = 0 ] && echo 1)"
finish
