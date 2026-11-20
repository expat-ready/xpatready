#!/usr/bin/env bash
# B204 (P-745, founder 20 Nov: "enforceable and ... followed mandatory by the agents through the hooks"), guard 28: the
# waves list and its page. First the real files: design/waves.tsv holds every R1 id of qa/CAPABILITIES.md exactly once
# (101; waves.py ids) and design/waves.md's generated block matches tools/waves.py gen (statuses aside). Then waves.py on throwaway
# files: a missing id fails, the full list passes, a drifted page fails, allow refuses a wave 4 item and passes a wave 1
# item, the next wave and a noted exception, the active wave moves on when wave 1 has 3 unproven left, and wip counts
# building and Built-not-Proven against caps 8 and 12. No network, US$0.
#   bash product/tools/check-waves.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
PH="$TOOLS/.."; W="$TOOLS/waves.py"
T=$(mktemp -d "${TMPDIR:-/tmp}/waves.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "$T"' EXIT

# 1. The real list against the real CAPABILITIES.md: every R1 id once, nothing else, 101 in all.
o=$(python3 -I "$W" ids 2>&1); ok "design/waves.tsv has every R1 id of CAPABILITIES.md once, and no other" "$([ $? = 0 ] && echo 1)" "$o"
n=$(grep -cE '^\| R1\.[0-9]+ ' "$PH/qa/CAPABILITIES.md"); ok "CAPABILITIES.md has the 101 R1 items (so waves.tsv has exactly 101)" "$([ "$n" = 101 ] && echo 1)" "$n"
o=$(python3 -I "$W" check 2>&1); ok "design/waves.md's generated block matches waves.py gen" "$([ $? = 0 ] && echo 1)" "$o"

# 2. waves.py on throwaway files: eleven items, wave 1 with 4 unproven (active), wave 2 next (4), wave 3 with a noted exception, wave 4.
cat > "$T/caps.md" <<'C'
| # | Map row: capability | Module | Status | Tested on |
|---|---|---|---|---|
| R1.1 | a | P | Partial | x |
| R1.2 | b | P | Partial | x |
| R1.3 | c | P | Built, awaiting qa | x |
| R1.4 | d | P | Not built | x |
| R1.5 | e | P | Partial | x |
| R1.6 | f | P | Not built | x |
| R1.7 | g | P | Partial | x |
| R1.8 | h | P | Works | x |
| R1.40 | i | P | Partial | x |
| R1.41 | j | P | Partial | x |
| R1.42 | k | P | Partial | x |
C
printf '# id\twave\tjourney\tnote\nR1.1\t1\tJ0\nR1.2\t1\tJ0\nR1.3\t1\tJ4\nR1.4\t1\tJ4\nR1.5\t2\tJ2\nR1.6\t4\tJ8\nR1.7\t3\tJ5\tallow: test exception\nR1.8\t0\tJ0\nR1.40\t2\tJ2\nR1.41\t2\tJ2\nR1.42\t2\tJ3\n' > "$T/waves.tsv"
printf '# Waves (test)\n\n<!-- waves.py gen: start (x) -->\n<!-- waves.py gen: end -->\n\nTail kept.\n' > "$T/waves.md"
export WAVES_TSV="$T/waves.tsv" WAVES_CAPS="$T/caps.md" WAVES_MD="$T/waves.md" WAVES_FOCUS="$T/none.md" WAVES_APP_VIEW="$T/none.txt"
wv() { out=$(python3 -I "$W" "$@" 2>&1); r=$?; }
wv ids; ok "ids passes on the full list" "$([ $r = 0 ] && echo 1)" "$out"
grep -v '^R1.4	' "$T/waves.tsv" > "$T/short.tsv"; out=$(WAVES_TSV="$T/short.tsv" python3 -I "$W" ids 2>&1); r=$?
ok "ids fails on a missing id, naming it" "$([ $r = 1 ] && grep -q '^WAVES LIST: design/waves.tsv lacks R1.4 ' <<<"$out" && echo 1)" "rc=$r $out"
{ cat "$T/waves.tsv"; printf 'R1.5\t3\tJ2\nR1.77\t1\tJ7\n'; } > "$T/long.tsv"; out=$(WAVES_TSV="$T/long.tsv" python3 -I "$W" ids 2>&1); r=$?
ok "ids fails on an id twice and an id not in CAPABILITIES.md" "$([ $r = 1 ] && grep -q 'not in CAPABILITIES.md: R1.77; has twice: R1.5' <<<"$out" && echo 1)" "rc=$r $out"
wv gen; ok "gen writes the block between the markers and keeps the text around it" "$([ $r = 0 ] && grep -q '^### Wave 4: Not built (1)' "$T/waves.md" && grep -q '^Tail kept.' "$T/waves.md" && head -1 "$T/waves.md" | grep -q '^# Waves (test)' && echo 1)" "$out"
wv check; ok "check passes right after gen" "$([ $r = 0 ] && echo 1)" "$out"
sed -i.bak 's/^| J8 | R1.6 (Not built) |$/| J8 | R1.6 (Not built), R1.9 (Not built) |/' "$T/waves.md"
wv check; ok "check fails when the page's block drifts from waves.tsv" "$([ $r = 1 ] && grep -q 'run tools/waves.py gen' <<<"$out" && echo 1)" "$out"
python3 -I "$W" gen >/dev/null; sed -i.bak 's/^| J0 | R1.1 (Partial)/| J0 | R1.1 (Works (re-scored, QA-1))/' "$T/waves.md"
wv check; ok "check ignores a status that moved since the last gen (brackets inside it too)" "$([ $r = 0 ] && echo 1)" "$out"
rm -f "$T/waves.md"; wv check; ok "check fails when the page is missing" "$([ $r = 1 ] && echo 1)" "$out"
wv allow R1.6; ok "allow refuses a wave 4 item with the reason" "$([ $r = 1 ] && grep -q '^OUTSIDE WAVE: R1.6 is in wave 4; lane starts are open for waves 0, 1, 2 only' <<<"$out" && echo 1)" "rc=$r $out"
wv allow R1.1; ok "allow passes a wave 1 item (the active wave)" "$([ $r = 0 ] && echo 1)" "rc=$r $out"
wv allow R1.5; ok "allow passes a wave 2 item (the next wave)" "$([ $r = 0 ] && echo 1)" "rc=$r $out"
wv allow R1.8; ok "allow passes a Proven item (wave 0: fixes, P-214)" "$([ $r = 0 ] && echo 1)" "rc=$r $out"
wv allow R1.7; ok "allow passes a wave 3 item with an 'allow:' note" "$([ $r = 0 ] && echo 1)" "rc=$r $out"
wv allow R1.1 R1.6; ok "allow refuses when any one item is outside" "$([ $r = 1 ] && echo 1)" "rc=$r $out"
wv allow R1.99; ok "allow refuses an id not in waves.tsv" "$([ $r = 1 ] && grep -q 'not in design/waves.tsv' <<<"$out" && echo 1)" "rc=$r $out"
sed -i.bak 's/^| R1.1 | a | P | Partial/| R1.1 | a | P | Works/' "$T/caps.md"
wv active; ok "with 3 unproven left in wave 1, wave 2 is active and wave 3 opens" "$(grep -q '^active wave 2; lane starts open for waves 0, 1, 2, 3$' <<<"$out" && echo 1)" "$out"
wv allow R1.3; ok "... and wave 1's last items stay open (finishing, P-745 (2) holds back only the wave above)" "$([ $r = 0 ] && echo 1)" "rc=$r $out"
wv allow R1.6; ok "... while wave 4 (above active + 1) is still refused" "$([ $r = 1 ] && echo 1)" "rc=$r $out"
sed -i.bak 's/^| R1.1 | a | P | Works/| R1.1 | a | P | Partial/' "$T/caps.md"
printf 'x\tbroken\n' >> "$T/waves.tsv"; wv allow R1.1; ok "a malformed waves.tsv line stops allow (exit 2), never a pass" "$([ $r = 2 ] && echo 1)" "rc=$r $out"
sed -i.bak '$d' "$T/waves.tsv"

# pr (pr-rules.yml): the items a PR names, outside the open waves.
pr() { out=$(printf '%s' "$1" | python3 -I "$W" pr 2>&1); r=$?; }
pr $'runtime: X-9 — R1.6 part 1\nDuplicate check: none'; ok "pr: a title naming a wave 4 item is flagged (exit 1)" "$([ $r = 1 ] && grep -q '^OUTSIDE WAVE: R1.6 is in wave 4; open waves 0, 1, 2' <<<"$out" && echo 1)" "rc=$r $out"
pr $'runtime: X-1\nItem: R1.1\nClash: R1.6 is next door'; ok "pr: an Item line in an open wave passes; R1.x in free body text is not read" "$([ $r = 0 ] && [ -z "$out" ] && echo 1)" "rc=$r $out"
pr $'runtime: X-1\n- Completes: R1.6'; ok "pr: a Completes line outside the open waves is flagged" "$([ $r = 1 ] && echo 1)" "rc=$r $out"
pr $'records: notes\n'; ok "pr: a PR naming no item passes" "$([ $r = 0 ] && echo 1)" "rc=$r $out"
ROOTD="$(cd "$TOOLS/../../../.." && pwd)"; PRW="$ROOTD/.github/workflows/pr-rules.yml"
grep -qF 'base/ai-workers/problem-1-pathway-setup-and-form-filling/product/tools/waves.py pr' "$PRW" && grep -qF 'labels[]=outside-wave' "$PRW" && grep -q '::warning' "$PRW" && grep -q 'pull-requests: write' "$PRW"
ok "pr-rules.yml runs the base commit's waves.py pr, adds the label outside-wave and a warning" "$([ $? = 0 ] && echo 1)"
awk '/name: an item outside the open waves/,/^      - name: [^a]/' "$PRW" | grep -q 'exit 0$' && ! awk '/name: an item outside the open waves/,/^      - name: [^a]/' "$PRW" | grep -qE 'exit 1|exit "\$'
ok "pr-rules.yml's waves step always exits 0 (flag, never fail: P-214)" "$([ $? = 0 ] && echo 1)"
grep -q 'waves.py" wip' "$TOOLS/lead-watch.sh" && grep -q "grep -c '^ACT' <<<\"\$wp\"" "$TOOLS/lead-watch.sh"
ok "lead-watch.sh runs waves.py wip each check and counts its ACT lines" "$([ $? = 0 ] && echo 1)"

# 3. wip: an open PR naming R1.1 in its title, one with "Item: R1.6" (wave 4), a draft (not counted), a lane naming R1.2.
jq -n '[{number:1,title:"runtime: X-1 — R1.1 part",body:"",isDraft:false,headRefName:"a"},{number:2,title:"runtime: Y",body:"Item: R1.6\nDuplicate check: none",isDraft:false,headRefName:"b"},
  {number:3,title:"runtime: R1.4 draft",body:"",isDraft:true,headRefName:"c"},{number:4,title:"merge",body:"R1.5",isDraft:false,headRefName:"mergify/x"}]' > "$T/prs.json"
printf 'saved x epoch 1\napp view 1 sessions · 0 flagged\nok    Builder R1.2 lane · cloud · working\n' > "$T/av.txt"
wv wip --prs "$T/prs.json" --lanes "$T/av.txt"
ok "wip counts PRs and lanes naming items, not drafts or merge-queue PRs" "$(grep -q '^wip   building 3 (cap 8): R1.1 #1, R1.2 lane, R1.6 #2 · Built-not-Proven 1 (cap 12): R1.3' <<<"$out" && echo 1)" "$out"
ok "wip gives one ACT for an item building outside the open waves" "$([ "$(grep -c '^ACT   wip:' <<<"$out")" = 1 ] && grep -q '^ACT   wip: R1.6 (wave 4) is being built by #2' <<<"$out" && echo 1)" "rc=$r $out"
# ENF-761 part 1: under the caps. Building 3 of 8 while open waves 1-2 hold R1.4 (its PR a draft), R1.5, R1.40-42 with
# no PR or lane (R1.3 is Built: qa's, not a lane's); no qa lane while R1.3 waits for qa. exit = 3 ACTs (R1.6 too).
ok "capacity: building 3 of 8 with 5 open-wave items unstarted is an ACT naming the first (pass case)" "$(grep -qx 'ACT   capacity: building 3 of 8 while the active or next wave has 5 items with no lane or open PR: start lanes (cards if this is not a founder-typed turn) · first: R1.4, R1.5, R1.40, R1.41, R1.42' <<<"$out" && echo 1)" "$out"
ok "capacity: qa lanes 0 of 4 while 1 item is built and not proven is an ACT; exit counts all 3" "$([ $r = 3 ] && grep -qx 'ACT   capacity: qa lanes 0 of 4 while 1 items are built and not proven' <<<"$out" && echo 1)" "rc=$r $out"
printf 'saved x epoch 1\napp view 4 sessions · 0 flagged\nok    qa 11 · cloud\nok    QA 12 · cloud\nok    qa13 x · cloud\nok    qa 14 · mac\nok    quality review · cloud\n' > "$T/av4.txt"
jq -n '[range(1;8) as $i | {number:(100+$i), title:"Item work", body:"Item: R1.\([1,2,4,5,40,41,42][$i-1])", isDraft:false, headRefName:"p\($i)"}]' > "$T/full.json"
wv wip --prs "$T/full.json" --lanes "$T/av4.txt"
ok "capacity: every open-wave item started and 4 qa lanes (\"qa N\" titles, any case): no capacity ACT (fail case)" "$(! grep -q '^ACT   capacity' <<<"$out" && grep -q '^wip   building 7 (cap 8)' <<<"$out" && [ $r = 0 ] && echo 1)" "rc=$r $out"
wv wip --prs "$T/prs.json" --lanes "$T/none.txt"
ok "capacity: no app view read: no qa-lanes ACT (the stale view is its own ACT), the building ACT stays" "$(! grep -q '^ACT   capacity: qa lanes' <<<"$out" && grep -q '^ACT   capacity: building 2 of 8 while the active or next wave has 6 items' <<<"$out" && echo 1)" "$out"
printf 'saved x epoch 1\nUNREADABLE app view: HTTP 401 (signed out? ask the founder to sign in to claude.ai)\n' > "$T/av-unread.txt"
wv wip --prs "$T/prs.json" --lanes "$T/av-unread.txt"
ok "capacity: a saved UNREADABLE view is not read: no qa-lanes ACT from it, and 'lanes not read' is said (review on efd0118)" "$(! grep -q '^ACT   capacity: qa lanes' <<<"$out" && grep -q 'lanes not read' <<<"$out" && echo 1)" "rc=$r $out"
jq -n '[range(10;19) | {number:., title:"R1.\(.)", body:"", isDraft:false, headRefName:"x"}]' > "$T/many.json"
for n in $(seq 10 18); do printf 'R1.%s\t1\tJ0\n' "$n" >> "$T/waves.tsv"; printf '| R1.%s | x | P | Partial | x |\n' "$n" >> "$T/caps.md"; done
wv wip --prs "$T/many.json" --lanes "$T/none.txt"
ok "wip: 9 items building is an ACT over the cap of 8" "$(grep -q '^ACT   wip: 9 items building, over the cap of 8' <<<"$out" && grep -q 'lanes not read' <<<"$out" && echo 1)" "$out"
for n in $(seq 20 32); do printf 'R1.%s\t1\tJ0\n' "$n" >> "$T/waves.tsv"; printf '| R1.%s | x | P | Built, awaiting qa | x |\n' "$n" >> "$T/caps.md"; done
wv wip --prs "$T/prs.json" --lanes "$T/none.txt"
ok "wip: 14 Built-not-Proven is an ACT over the cap of 12" "$(grep -q '^ACT   wip: 14 items Built-not-Proven, over the cap of 12' <<<"$out" && echo 1)" "$out"
out=$(python3 -I "$W" wip --prs 2>&1); r=$?; ok "wip --prs with no file stops (exit 2), no traceback" "$([ $r = 2 ] && grep -q 'needs a file' <<<"$out" && echo 1)" "rc=$r $out"
echo 'not json' > "$T/bad.json"; wv wip --prs "$T/bad.json"
ok "wip: unreadable open PRs is an ACT, never a silent zero" "$([ $r = 1 ] && grep -q '^ACT   wip: open PRs unreadable' <<<"$out" && echo 1)" "$out"
finish
