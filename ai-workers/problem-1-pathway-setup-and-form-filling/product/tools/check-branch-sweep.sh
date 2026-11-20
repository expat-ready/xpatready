#!/usr/bin/env bash
# ENF-761 part 5 (Lead 2 (series 3), 20 Nov 14:03 IST: a lead-watch run was 29.7 KB, 61 lines of stale branches):
# branch-sweep.sh writes every branch ahead of main with no PR to $SWEEP_STATE_DIR/stale-branches.txt and prints one
# summary line; an ACT line only for a branch pushed in the last 24 h. Clock faked with NOW. US$0, no network.
#   bash product/tools/check-branch-sweep.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
command -v jq >/dev/null || { echo "jq is missing; nothing was checked"; exit 2; }
T=$(mktemp -d "${TMPDIR:-/tmp}/sweep.XXXXXXXX"); trap 'rm -rf "$T"' EXIT; mkdir "$T/bin"
O="$T/origin.git"; R="$T/repo"; git init -q --bare -b main "$O"; git init -q -b main "$R"
g() { git -C "$R" "$@"; }; g config user.email t@t; g config user.name t; g config commit.gpgsign false; g remote add origin "$O"
g commit -q --allow-empty -m base; g push -q origin main 2>/dev/null
for b in lane/a lane/b lane/open; do g checkout -q -b "$b" main; g commit -q --allow-empty -m "$b"; done
g push -q origin --all 2>/dev/null; g fetch -q origin
echo '[{"headRefName":"lane/open","headRefOid":"x","state":"OPEN"}]' > "$T/all.json"; echo '[]' > "$T/items.json"
printf '#!/bin/sh\ncat "%s"\n' "$T/all.json" > "$T/bin/fakegh"
sw() { out=$(cd "$R" && env SWEEP_GH="sh $T/bin/fakegh" ITEMS="$T/items.json" SWEEP_STATE_DIR="$T/state" "$@" bash "$TOOLS/branch-sweep.sh"); r=$?; }
L="$T/state/stale-branches.txt"; SUM="stale branches: 2 with commits not on main, no PR (list: $L)"
sw; ok "pushed now: one ACT per stale branch (2), the summary line, exit 2" "$([ $r = 2 ] && [ "$(grep -c '^ACT' <<< "$out")" = 2 ] && grep -qxF "$SUM" <<< "$out" && echo 1)" "exit $r: $out"
later=$(( $(date +%s) + 2 * 86400 ))
sw NOW=$later; ok "pushed 2 days ago: no ACT, only the one summary line, exit 0" "$([ $r = 0 ] && [ "$out" = "$SUM" ] && echo 1)" "exit $r: $out"
ok "... the list file names both branches, not the one with an open PR" "$([ "$(wc -l < "$L")" -eq 2 ] && grep -q '^lane/a: 1 commit(s) not on main' "$L" && grep -q '^lane/b: ' "$L" && ! grep -q lane/open "$L" && echo 1)" "$(cat "$L")"
sw NOW=$later SWEEP_ACT_HOURS=72; ok "the same branches inside a 72 h window still ACT (the quiet rule's fail case)" "$([ $r = 2 ] && echo 1)" "exit $r: $out"
echo '[{"headRefName":"lane/a","headRefOid":"x","state":"OPEN"},{"headRefName":"lane/b","headRefOid":"x","state":"OPEN"},{"headRefName":"lane/open","headRefOid":"x","state":"OPEN"}]' > "$T/all.json"
sw; ok "no stale branch: no output at all, and the list file is emptied" "$([ $r = 0 ] && [ -z "$out" ] && [ ! -s "$L" ] && echo 1)" "exit $r: $out"
grep -q 'SWEEP_STATE_DIR="$STATE_DIR" bash "$TOOLS/branch-sweep.sh"' "$TOOLS/lead-watch.sh"; ok "lead-watch.sh 3c runs branch-sweep.sh with its state folder" "$([ $? = 0 ] && echo 1)"
finish
