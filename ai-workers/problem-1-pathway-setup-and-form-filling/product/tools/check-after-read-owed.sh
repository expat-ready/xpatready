#!/usr/bin/env bash
# P-823: after-read-owed.sh lists the Lead's after-reads owed (money within the hour of the merge, the drawn others),
# with GitHub answered by a stand-in curl from files. US$0, no network.
#   bash product/tools/check-after-read-owed.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
command -v jq >/dev/null || { echo "jq is missing; nothing was checked"; exit 2; }
T=$(mktemp -d "${TMPDIR:-/tmp}/aro.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "$T"' EXIT
mkdir -p "$T/bin" "$T/fx"
cat > "$T/bin/curl" <<'EOF'
#!/usr/bin/env bash
u=""; m=GET; while [ $# -gt 0 ]; do case "$1" in -X) m=$2; shift;; -H) shift;; http*) u=$1;; esac; shift; done
[ "$m" = GET ] || { echo "WRITE $m $u" >> "$FX/log"; exit 22; }
p=${u#https://api.test/repos/o/r/}; pg=$(printf '%s' "$u" | sed -n 's/.*[?&]page=\([0-9]*\).*/\1/p')
[ "${pg:-1}" = 1 ] || { echo '[]'; exit 0; }
serve() { [ -f "$FX/$1" ] && cat "$FX/$1" || { echo '{"message":"Not Found"}'; exit 22; }; }
case "$p" in
  issues\?*after-read%3A%20money*) serve money.json;;
  issues\?*after-read%3A%20other*) serve other.json;;
  issues/*/comments*) n=${p#issues/}; serve "comments-${n%%/*}.json";;
  pulls/*) serve "pr-${p#pulls/}.json";;
  *) echo "unexpected $p" >> "$FX/log"; exit 22;;
esac
EOF
chmod +x "$T/bin/curl"
A="$TOOLS/after-read-owed.sh"; HA=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa; HB=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
[ -f "$A" ] || { ok "after-read-owed.sh exists (P-823)" 0 "no $A"; finish; }
lst() { printf '%s\n' "${@:2}" | jq -R 'select(length > 0) | {number: tonumber, pull_request: {}}' | jq -s . > "$T/fx/$1.json"; }
prj() { jq -n --arg h "$2" --arg m "${3:-}" --arg s "${4:-closed}" '{head: {sha: $h}, merged_at: (if $m == "" then null else $m end), state: $s}' > "$T/fx/pr-$1.json"; }
cmt() { jq -n --arg b "$2" --arg a "${3:-OWNER}" --arg u "${4:-2026-11-25T05:00:00Z}" '[{author_association: $a, body: $b, created_at: "2026-11-25T05:00:00Z", updated_at: $u}]' > "$T/fx/comments-$1.json"; }
run() { : > "$T/fx/log"; out=$(PATH="$T/bin:$PATH" FX="$T/fx" GH_TOKEN=x REPO=o/r API=https://api.test NOW="${NOW:-2026-11-25T06:00:00Z}" bash "$A" 2>&1); r=$?; }

lst money 10; lst other 12; prj 10 $HA 2026-11-25T05:30:00Z; prj 12 $HB 2026-11-25T04:00:00Z; cmt 10 "fine"; cmt 12 "fine"; run
ok "a money PR merged 30 min ago, not read: owed, 30 min left; a drawn other: owed; exit 0" "$([ $r = 0 ] && grep -qx 'OWED money #10 merged 2026-11-25T05:30:00Z: due 2026-11-25T06:30:00Z, 30 min left' <<< "$out" && grep -qx 'OWED other #12 merged 2026-11-25T04:00:00Z' <<< "$out" && echo 1)" "exit $r: $out"
NOW=2026-11-25T06:45:00Z run
ok "the money after-read 15 min past its hour: overdue, exit 1" "$([ $r = 1 ] && grep -q 'OWED money #10 .*15 min overdue' <<< "$out" && echo 1)" "exit $r: $out"
cmt 10 "Lead read the diff: $HA"; NOW=2026-11-25T06:45:00Z run
ok "the Lead's read line on the merged head clears it" "$([ $r = 0 ] && ! grep -q '#10' <<< "$out" && echo 1)" "exit $r: $out"
cmt 10 "Lead read the diff: $HB"; run
ok "a read line naming another commit does not clear it" "$(grep -q 'OWED money #10' <<< "$out" && echo 1)" "$out"
cmt 10 "Lead read the diff: $HA" NONE; run
ok "a read line by someone without write access does not clear it" "$(grep -q 'OWED money #10' <<< "$out" && echo 1)" "$out"
cmt 10 "Lead read the diff: $HA" OWNER 2026-11-25T05:10:00Z; run
ok "an edited read line does not clear it" "$(grep -q 'OWED money #10' <<< "$out" && echo 1)" "$out"
cmt 10 "fine"; prj 10 $HA "" open; run
ok "labelled, not merged yet: WAIT, not owed" "$([ $r = 0 ] && grep -qx 'WAIT money #10: labelled, not merged yet (the after-read starts at the merge)' <<< "$out" && echo 1)" "exit $r: $out"
prj 10 $HA "" closed; run
ok "closed without a merge: nothing owed" "$(! grep -q '#10' <<< "$out" && echo 1)" "$out"
rm -f "$T/fx/pr-12.json"; run
ok "a PR that cannot be read: exit 2 (never a silent nothing owed)" "$([ $r = 2 ] && echo 1)" "exit $r: $out"
prj 12 $HB 2026-11-25T04:00:00Z; rm -f "$T/fx/money.json"; run
ok "the label list cannot be read: exit 2" "$([ $r = 2 ] && echo 1)" "exit $r: $out"
lst money; run
ok "read-only: no write call" "$(! grep -q WRITE "$T/fx/log" && echo 1)" "$(cat "$T/fx/log")"
finish
