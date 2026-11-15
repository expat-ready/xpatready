#!/usr/bin/env bash
# Row G-2 (P-611 (2)): scripted hand-over and take-over, on a scratch clone of a throwaway origin (never the main copy).
# A dry run refuses (exit 2, listed) with one open fixture item and with an unmerged tools/* branch, and passes with
# none; the real run rewrites current_lead: and pushes it; takeover.sh prints the log, items and the CronCreate line.
# No network, US$0.   bash product/tools/check-handover.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/guard.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "$T"' EXIT
docs_copy "$T/src"; D="$PRODREL/tools"
cp "$TOOLS/items.py" "$TOOLS/handover.sh" "$TOOLS/takeover.sh" "$TOOLS/lane-branches.sh" "$T/src/$D/"
mkdir -p "$T/src/$PRODREL/state" && echo '[]' > "$T/src/$PRODREL/state/items.json"
git -C "$T/src" add -A && git -C "$T/src" commit -qm tools && git -C "$T/src" checkout -qb lead/x
git init -q --bare -b main "$T/origin.git"; git -C "$T/src" remote add origin "$T/origin.git"
git -C "$T/src" -c push.negotiate=false push -q origin main lead/x
git clone -q -b lead/x "$T/origin.git" "$T/c"; C="$T/c"; git -C "$C" config user.email t@t; git -C "$C" config user.name t
H="bash $C/$D/handover.sh"; NEXT=local_bbb-0000-2222; TITLE="Lead 2 · 15 Nov 14:00 IST"
ITEMS_NOW=2026-11-15T08:00:00Z python3 -I "$C/$D/items.py" add G-9 ready --owner lane --branch tools/g9 --pr 1796 >/dev/null
out=$($H "$NEXT" "$TITLE" --dry-run 2>&1); r=$?
ok "dry run refuses with one open fixture item (exit 2, item listed)" "$([ $r = 2 ] && echo "$out" | grep -q '^REFUSED' && echo "$out" | grep -q 'ready G-9' && echo 1)" "exit $r: $out"
ok "a refusal leaves current_lead: as it was" "$(grep -q '^current_lead: local_aaa-0000-1111 Lead 1' "$C/$PRODREL/STATE.md" && echo 1)"
python3 -I "$C/$D/items.py" ack G-9 --by "Lead 1" >/dev/null
out=$($H "$NEXT" "$TITLE" --dry-run 2>&1); r=$?
ok "dry run passes with no open item (an acked one does not block)" "$([ $r = 0 ] && echo "$out" | grep -q "would write:" && echo "$out" | grep -q "current_lead: $NEXT $TITLE (took over from Lead 1" && echo 1)" "exit $r: $out"
ok "a dry run writes nothing" "$(git -C "$C" diff --quiet -- "$PRODREL/STATE.md" && echo 1)"
git -C "$T/src" checkout -qb tools/g9 && echo fix > "$T/src/fix.txt" && git -C "$T/src" add fix.txt && git -C "$T/src" commit -qm fix && git -C "$T/src" -c push.negotiate=false push -q origin tools/g9
out=$($H "$NEXT" "$TITLE" --dry-run 2>&1); r=$?
ok "dry run refuses while a tools/* branch has commits not on the lead branch" "$([ $r = 2 ] && echo "$out" | grep -q 'unmerged  tools/g9: 1 commit' && echo 1)" "exit $r: $out"
git -C "$C" fetch -q origin tools/g9 && git -C "$C" merge -q --no-edit FETCH_HEAD
out=$($H "$NEXT" "$TITLE" --dry-run 2>&1); r=$?
ok "merged here, it passes again" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
out=$($H "bad id" "$TITLE" --dry-run 2>&1); ok "a bad session id is refused (exit 1)" "$([ $? = 1 ] && echo 1)" "$out"
out=$($H "$NEXT" "$TITLE" 2>&1); r=$?
ok "the real run rewrites current_lead: and pushes it" "$([ $r = 0 ] && git -C "$T/origin.git" show "lead/x:$PRODREL/STATE.md" | grep -qx "current_lead: $NEXT $TITLE (took over from Lead 1, local_aaa-0000)" && echo 1)" "exit $r: $out"
ok "it prints the lane line and the take-over text" "$(echo "$out" | grep -q "Current Lead is now Lead 2 ($NEXT)" && echo "$out" | grep -q '^  take over now: you are Lead 2' && echo 1)" "$out"
ok "only STATE.md is in the hand-over commit" "$([ "$(git -C "$C" show --name-only --format= HEAD)" = "$PRODREL/STATE.md" ] && echo 1)" "$(git -C "$C" show --stat HEAD)"
out=$(bash "$C/$D/takeover.sh" 2>&1); r=$?
ok "takeover prints the lead, the log since the previous hand-over, items, lanes and the CronCreate line" "$([ $r = 0 ] && echo "$out" | grep -q "^lead  $NEXT" && echo "$out" | grep -q 'Hand-over: Lead 1 -> Lead 2' && echo "$out" | grep -q 'acked .*G-9' && echo "$out" | grep -q '^lanes no board' && echo "$out" | grep -qE 'CronCreate\(cron: "[0-9]+,[0-9]+ \* \* \* \*", prompt: "run lead-watch; read STATE Start here", recurring: true\)' && echo 1)" "exit $r: $out"
finish
