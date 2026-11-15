#!/usr/bin/env bash
# Row G-1 (P-611 (2)): the "needs Lead" queue. A fixture LANE-REPORT comment becomes an item; ACT at 46 min; FOUNDER at
# 91 min; an ack clears both; a second report on the same id reopens it; a re-read adds nothing. A stand-in gh answers
# from fixtures; the queue lives in a throwaway copy, never the main copy. No network, US$0.
#   bash product/tools/check-items.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/guard.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "$T"' EXIT
mkdir -p "$T/c/tools" "$T/c/state" "$T/bin"; cp "$TOOLS/items.py" "$TOOLS/lead-queue.sh" "$T/c/tools/"; echo '[]' > "$T/c/state/items.json"
export ITEMS_FILE="$T/c/state/items.json"
cat > "$T/bin/gh" <<'EOF'
#!/bin/bash
# stand-in gh: one open PR (#1801) updated in the window; #1796 holds the fixture report plus noise.
case "$1 $2" in
  "pr list") echo 1801;;
  "pr view") case "$3" in
    1796) cat "$FIX/1796.json";;
    1801) echo '{"number":1801,"headRefName":"lane/x","comments":[{"id":"c9","author":{"login":"lane"},"createdAt":"2026-11-15T06:00:00Z","body":"LANE-REPORT: ready OLD-1\nbefore the window"}]}';;
  esac;;
esac
EOF
chmod +x "$T/bin/gh"; export FIX="$T" LEAD_QUEUE_GH="$T/bin/gh"
cat > "$T/1796.json" <<'EOF'
{"number":1796,"headRefName":"lead/2026-11-07-lead31","comments":[
 {"id":"c1","author":{"login":"lane-g1"},"createdAt":"2026-11-15T08:00:00Z","body":"LANE-REPORT: ready G-1\nbranch: tools/g1-g2-needs-lead-queue\nhead abc123"},
 {"id":"c2","author":{"login":"lane"},"createdAt":"2026-11-15T08:01:00Z","body":"ready for Lead to merge (free text: 3b's job)"},
 {"id":"c3","author":{"login":"lane"},"createdAt":"2026-11-15T08:02:00Z","body":"see below\nLANE-REPORT: ready NOT-FIRST-LINE"}]}
EOF
Q="$T/c/tools/lead-queue.sh"; I="python3 -I $T/c/tools/items.py"; S=2026-11-15T07:30:00Z
run() { ITEMS_NOW="$1" bash "$Q" "$S" 2>&1; }

out=$(run 2026-11-15T08:10:00Z); r=$?
ok "a fixture LANE-REPORT on #1796 becomes one item" "$(python3 -c "import json,sys;d=json.load(open('$ITEMS_FILE'));sys.exit(0 if [i['id'] for i in d]==['G-1'] and d[0]['branch']=='tools/g1-g2-needs-lead-queue' and d[0]['pr']==1796 and d[0]['status']=='open' and d[0]['kind']=='ready' else 1)" && echo 1)" "$(cat "$ITEMS_FILE")"
ok "free text, a report not on the first line, and one before the window add nothing" "$(grep -c '"id"' "$ITEMS_FILE" | grep -qx 1 && echo 1)"
ok "no ACT at 10 min" "$([ $r = 0 ] && ! echo "$out" | grep -qE '^(ACT|FOUNDER)' && echo 1)" "exit $r: $out"
out=$(run 2026-11-15T08:46:00Z); r=$?
ok "ACT appears at 46 min, no FOUNDER line yet" "$([ $r = 1 ] && echo "$out" | grep -q '^ACT .*G-1' && ! echo "$out" | grep -q '^FOUNDER' && echo 1)" "exit $r: $out"
ok "a re-read adds nothing" "$(echo "$out" | grep -q 'ingest 0 new, 0 reopened' && grep -c '"id"' "$ITEMS_FILE" | grep -qx 1 && echo 1)" "$out"
out=$(run 2026-11-15T09:31:00Z); r=$?
ok "FOUNDER line appears at 91 min (with the ACT)" "$([ $r = 1 ] && echo "$out" | grep -q '^FOUNDER .*G-1 has waited 91 min' && echo "$out" | grep -q '^ACT' && echo 1)" "exit $r: $out"
out=$(ITEMS_NOW=2026-11-15T09:32:00Z $I list --stale 45); ok "list --stale shows it" "$(echo "$out" | grep -q '^open .*G-1' && echo 1)" "$out"
ITEMS_NOW=2026-11-15T09:32:00Z $I ack G-1 --by "Lead 55" >/dev/null
out=$(run 2026-11-15T09:40:00Z); r=$?
ok "an ack clears both ACT and FOUNDER" "$([ $r = 0 ] && ! echo "$out" | grep -qE '^(ACT|FOUNDER)' && echo 1)" "exit $r: $out"
ok "the ack is recorded" "$(grep -q '"last_ack_by": "Lead 55"' "$ITEMS_FILE" && grep -q '"status": "acked"' "$ITEMS_FILE" && echo 1)"
out=$(ITEMS_NOW=2026-11-15T09:40:00Z $I blocking); ok "an acked item does not block a hand-over" "$([ $? = 0 ] && echo 1)" "$out"
python3 - "$T/1796.json" <<'EOF'
import json,sys; p=json.load(open(sys.argv[1]))
p["comments"].append({"id":"c4","author":{"login":"lane-g1"},"createdAt":"2026-11-15T09:45:00Z","body":"LANE-REPORT: question G-1\nnext: rule on X"})
json.dump(p,open(sys.argv[1],"w"))
EOF
out=$(run 2026-11-15T09:50:00Z)
ok "a new report on an acked id reopens it, ack cleared" "$(echo "$out" | grep -q '1 reopened' && grep -q '"kind": "question"' "$ITEMS_FILE" && grep -q '"last_ack_by": null' "$ITEMS_FILE" && echo 1)" "$out $(cat "$ITEMS_FILE")"
out=$(ITEMS_NOW=2026-11-15T09:50:00Z $I blocking); r=$?
ok "an open item blocks a hand-over (exit 1, listed)" "$([ $r = 1 ] && echo "$out" | grep -q 'question G-1' && echo 1)" "exit $r: $out"
ITEMS_NOW=2026-11-15T10:00:00Z $I done G-1 --by "Lead 55" >/dev/null
out=$(run 2026-11-15T12:00:00Z); r=$?
ok "a done item never ACTs" "$([ $r = 0 ] && ! echo "$out" | grep -q '^ACT' && echo 1)" "exit $r: $out"
out=$(ITEMS_NOW=2026-11-15T12:00:00Z $I add X-1 approval --owner qa --pr 12 && ITEMS_NOW=2026-11-15T12:46:00Z $I watch); r=$?
ok "add by hand, then ACT at 46 min" "$([ $r = 1 ] && echo "$out" | grep -q '^ACT .*approval X-1 #12' && echo 1)" "exit $r: $out"
out=$($I add Y-1 maybe 2>&1); ok "a bad kind is refused" "$([ $? = 2 ] && echo 1)" "$out"
out=$(python3 - "$TOOLS/../state/items.schema.json" "$ITEMS_FILE" <<'EOF'
import json,sys
s=json.load(open(sys.argv[1]))["items"]; d=json.load(open(sys.argv[2]))
for it in d:
    assert set(s["required"])<=set(it) and set(it)<=set(s["properties"]), it
    assert it["kind"] in s["properties"]["kind"]["enum"] and it["status"] in s["properties"]["status"]["enum"]
print("ok")
EOF
); ok "every item has the schema's fields and enums" "$([ "$out" = ok ] && echo 1)" "$out"
finish
