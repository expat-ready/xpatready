#!/usr/bin/env bash
# Private split, PS-1b (design/private-split-plan-2026-11-27.md): the Lead's records move to expat-ready/private and the
# readers find them through records-dir.sh. Checks: records-dir.sh's three answers and --private; check-docs.sh judges
# CURRENT-LEAD.md (0 or 2 lines, no session id, the file missing once STATE.md has gone), STATE's size in the private
# copy, a link to a moved record (accepted with no records here, checked in the private copy); current-lead.sh reads
# CURRENT-LEAD.md from the newest ref. Throwaway copies only, US$0.   bash product/tools/check-records-dir.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/guard.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "$T"' EXIT
docs_copy "$T/c"; PC="$T/c/$PRODREL"; R="$PC/tools/records-dir.sh"; CD="$PC/tools/check-docs.sh"

# records-dir.sh: in-tree while STATE.md is here; the private copy first; --private never answers the in-tree copy.
out=$(bash "$R"); ok "records-dir: this copy's product/ while STATE.md is here" "$([ "$out" = "$(cd "$PC" && pwd)" ] && echo 1)" "got: $out"
out=$(bash "$R" --private); r=$?; ok "records-dir --private: no private copy, exit 1, prints nothing" "$([ $r = 1 ] && [ -z "$out" ] && echo 1)" "exit $r: $out"
mkdir -p "$T/ph/xpatready/product" && cp "$PC/STATE.md" "$T/ph/xpatready/product/"
out=$(PRIVATE_HOME_DIR="$T/ph" bash "$R" --private); ok "records-dir --private: the private copy under PRIVATE_HOME_DIR" "$([ "$out" = "$T/ph/xpatready/product" ] && echo 1)" "got: $out"
out=$(PRIVATE_HOME_DIR="$T/ph" bash "$R"); ok "records-dir: the private copy wins over this copy" "$([ "$out" = "$T/ph/xpatready/product" ] && echo 1)" "got: $out"
out=$(XR_RECORDS="$T/x" bash "$R"); r=$?; ok "records-dir: XR_RECORDS naming no folder is exit 1" "$([ $r = 1 ] && echo 1)" "exit $r: $out"

# CURRENT-LEAD.md, once here, is the file judged.
grep '^current_lead: ' "$PC/STATE.md" > "$PC/CURRENT-LEAD.md"
out=$(bash "$CD" 2>&1); ok "one line in CURRENT-LEAD.md passes check-docs" "$([ $? = 0 ] && echo 1)" "$out"
sed -i.bak '/^current_lead: /d' "$PC/STATE.md"; out=$(bash "$CD" 2>&1); ok "... STATE.md's own line is then not needed" "$([ $? = 0 ] && echo 1)" "$out"
printf 'current_lead: local_bbb-0000-1111 Lead 2 · x\n' >> "$PC/CURRENT-LEAD.md"; out=$(bash "$CD" 2>&1); r=$?
ok "two lines in CURRENT-LEAD.md fail check-docs" "$([ $r = 1 ] && echo "$out" | grep -q 'CURRENT LEAD: CURRENT-LEAD.md has 2' && echo 1)" "exit $r: $out"
echo 'current_lead: Lead 3' > "$PC/CURRENT-LEAD.md"; out=$(bash "$CD" 2>&1); r=$?
ok "a CURRENT-LEAD.md line with no session id fails check-docs" "$([ $r = 1 ] && echo "$out" | grep -q "CURRENT-LEAD.md's current_lead line needs a session id" && echo 1)" "exit $r: $out"
echo 'current_lead: local_aaa-0000-1111 Lead 1 · 6 Nov 01:00 IST' > "$PC/CURRENT-LEAD.md"

# STATE.md gone from this copy (after PS-1c): its checks run on the private copy, or not at all.
mv "$PC/STATE.md" "$T/STATE.keep"; out=$(bash "$CD" 2>&1); ok "no STATE.md here and no private copy: check-docs passes on CURRENT-LEAD.md" "$([ $? = 0 ] && echo 1)" "$out"
rm "$PC/CURRENT-LEAD.md"; out=$(bash "$CD" 2>&1); r=$?
ok "neither CURRENT-LEAD.md nor STATE.md: check-docs fails" "$([ $r = 1 ] && echo "$out" | grep -q 'no CURRENT-LEAD.md' && echo 1)" "exit $r: $out"
echo 'current_lead: local_aaa-0000-1111 Lead 1 · 6 Nov 01:00 IST' > "$PC/CURRENT-LEAD.md"
head -c 13000 /dev/zero | tr '\0' x >> "$T/ph/xpatready/product/STATE.md"; out=$(PRIVATE_HOME_DIR="$T/ph" bash "$CD" 2>&1); r=$?
ok "STATE TOO BIG is judged in the private copy" "$([ $r = 1 ] && echo "$out" | grep -q 'STATE TOO BIG' && echo 1)" "exit $r: $out"
cp "$T/STATE.keep" "$T/ph/xpatready/product/STATE.md"

# A link to a moved record: accepted with no records here; checked where the records are.
printf 'See `history/old-page.md` and `product/history/old-page.md`.\n' > "$PC/NOTE.md"
out=$(bash "$CD" 2>&1); ok "a link to history/ with no records here is taken as moved" "$([ $? = 0 ] && echo 1)" "$out"
out=$(PRIVATE_HOME_DIR="$T/ph" bash "$CD" 2>&1); r=$?
ok "... and fails when the private copy lacks it" "$([ $r = 1 ] && echo "$out" | grep -q 'MISSING LINK in .*NOTE.md: history/old-page.md' && echo "$out" | grep -q 'NOTE.md: product/history/old-page.md' && echo 1)" "exit $r: $out"
mkdir -p "$T/ph/xpatready/product/history" && echo x > "$T/ph/xpatready/product/history/old-page.md"
out=$(PRIVATE_HOME_DIR="$T/ph" bash "$CD" 2>&1); ok "... and passes when the private copy has it" "$([ $? = 0 ] && echo 1)" "$out"
printf 'See `design/no-such-page.md`.\n' > "$PC/NOTE.md"; out=$(bash "$CD" 2>&1); r=$?
ok "a link to a kept folder still fails when missing" "$([ $r = 1 ] && echo "$out" | grep -q 'no-such-page.md' && echo 1)" "exit $r: $out"
rm "$PC/NOTE.md"

# current-lead.sh: CURRENT-LEAD.md on a newer ref wins; STATE.md on a still newer ref wins over it (transition).
docs_copy "$T/s"; git init -q --bare -b main "$T/o.git"; git -C "$T/s" remote add origin "$T/o.git"; git -C "$T/s" -c push.negotiate=false push -q origin main
git -C "$T/s" checkout -qb lead/x; sleep 1; echo 'current_lead: local_ccc-0000-1111 Lead 3 · c' > "$T/s/$PRODREL/CURRENT-LEAD.md"
git -C "$T/s" add -A && git -C "$T/s" commit -qm "current lead file" && git -C "$T/s" -c push.negotiate=false push -q origin lead/x
git clone -q "$T/o.git" "$T/lane"; L="$T/lane/$PRODREL/tools/current-lead.sh"
out=$(bash "$L" --id); ok "current-lead: CURRENT-LEAD.md on the newer lead branch" "$([ "$out" = local_ccc-0000-1111 ] && echo 1)" "got: $out"
git -C "$T/s" checkout -q main; sleep 1; sed -i.bak 's/^current_lead: .*/current_lead: local_ddd-0000-1111 Lead 4 · d/' "$T/s/$PRODREL/STATE.md"
git -C "$T/s" commit -qam "newer STATE on main" && git -C "$T/s" -c push.negotiate=false push -q origin main
out=$(bash "$L" --id); ok "current-lead: a newer STATE.md line on a ref without CURRENT-LEAD.md still wins" "$([ "$out" = local_ddd-0000-1111 ] && echo 1)" "got: $out"
mkdir -p "$T/solo" && cp -r "$T/c/ai-workers" "$T/solo/" && rm -f "$T/solo/$PRODREL/STATE.md"
out=$(bash "$T/solo/$PRODREL/tools/current-lead.sh" --where); ok "current-lead: no origin, no STATE.md: reads this copy's CURRENT-LEAD.md" "$([ "$out" = "CURRENT-LEAD.md (this copy)" ] && echo 1)" "got: $out"
finish
