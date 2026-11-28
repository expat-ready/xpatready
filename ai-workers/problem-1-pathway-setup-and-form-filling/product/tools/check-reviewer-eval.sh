#!/usr/bin/env bash
# Test for reviewer-eval.py (LR-136): the set's own check, the blind brief and the scoring rule. A throwaway git
# repository and fixture answers: no network, no model, US$0.   bash product/tools/check-reviewer-eval.sh
set -u
cd "$(dirname "$0")"
D="$(mktemp -d)"; trap 'rm -rf "$D"' EXIT
pass=0; fail=0
ok() { if [ "$2" = 0 ]; then pass=$((pass + 1)); echo "PASS  $1"; else fail=$((fail + 1)); echo "FAIL  $1"; fi; }
R="$D/repo"; git init -q "$R"; git -C "$R" -c user.email=t@t -c user.name=t commit -q --allow-empty -m base
B=$(git -C "$R" rev-parse HEAD); mkdir -p "$R/src"; echo x > "$R/src/a.ts"; git -C "$R" add -A
git -C "$R" -c user.email=t@t -c user.name=t commit -q -m bug; M=$(git -C "$R" rev-parse HEAD)
mk() { python3 - "$1" "$2" "$B" "$M" "${3:-src/a.ts}" <<'PY'
import json, sys
n, out, b, m, f = int(sys.argv[1]), sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5]
json.dump([{"id": f"RT-{i:02d}", "culprit_pr": 100 + i, "culprit_merge_sha": m, "base_sha": b, "files": [f],
            "bug": "the secret bug words", "class": "off-by-one", "found_by": "fix #1"} for i in range(1, n + 1)], open(out, "w"))
PY
}
e() { python3 -I ./reviewer-eval.py "$@" > "$D/out" 2>&1; echo $?; }
mk 10 "$D/set.json"
[ "$(e check --set "$D/set.json" --repo "$R")" = 0 ]; ok "10 complete cases, shas present, bug file in the diff: check passes" $?
mk 9 "$D/s9.json"; [ "$(e check --set "$D/s9.json" --repo "$R")" = 1 ] && grep -q '9 cases' "$D/out"; ok "9 cases: refused (10-20)" $?
mk 21 "$D/s21.json"; [ "$(e check --set "$D/s21.json" --repo "$R")" = 1 ]; ok "21 cases: refused" $?
mk 10 "$D/sf.json" src/other.ts; [ "$(e check --set "$D/sf.json" --repo "$R")" = 1 ] && grep -q 'not in its diff' "$D/out"; ok "a bug file outside the diff: refused" $?
python3 -c 'import json,sys;d=json.load(open(sys.argv[1]));d[0]["base_sha"]="f"*40;json.dump(d,open(sys.argv[1],"w"))' "$D/sf.json"
mk 10 "$D/ss.json"; python3 -c 'import json,sys;d=json.load(open(sys.argv[1]));d[0]["base_sha"]="f"*40;json.dump(d,open(sys.argv[1],"w"))' "$D/ss.json"
[ "$(e check --set "$D/ss.json" --repo "$R")" = 1 ] && grep -q 'not in this clone' "$D/out"; ok "a sha not in the clone: refused" $?
python3 -c 'import json,sys;d=json.load(open(sys.argv[1]));del d[0]["bug"];json.dump(d,open(sys.argv[1],"w"))' "$D/set.json"
[ "$(e check --set "$D/set.json" --repo "$R")" = 1 ] && grep -q 'RT-01: missing bug' "$D/out"; ok "a case without its bug: refused" $?
mk 10 "$D/set.json"
[ "$(e brief RT-02 --set "$D/set.json")" = 0 ] && grep -q "git diff $B $M" "$D/out" && ! grep -q 'secret bug words\|off-by-one\|fix #1' "$D/out"; ok "the brief names the diff and never the bug, class or fix" $?
A="$D/answers"; mkdir -p "$A"
printf '1 Important\n\n1. Important (off-by-one). src/a.ts:3 loops one too far. Fix: <.\n\nTokens: 1,200\nReviewer: Changes %s\n' "$M" > "$A/RT-01.md"
printf '0 Important\n\nReviewer: Approve %s\n' "$M" > "$A/RT-02.md"
printf '1 Important\n\n1. Important: web/x.tsx:9 wrong label.\n2. Nit: a.ts naming.\n\nReviewer: Changes %s\n' "$M" > "$A/RT-03.md"
printf 'no verdict here, a.ts Important\n' > "$A/RT-04.md"
printf 'Block: approach wrong.\n\n- Important: a.ts:1 never read.\n\nTokens: 800\nReviewer: Block %s\n' "$M" > "$A/RT-05.md"
[ "$(e score "$A" --set "$D/set.json")" = 0 ]; ok "score runs" $?
grep -q '^RT-01 #101 CAUGHT' "$D/out"; ok "Changes with an Important finding on the bug file: caught" $?
grep -q '^RT-02 #102 MISSED  approved' "$D/out"; ok "Approve: missed" $?
grep -q '^RT-03 #103 MISSED' "$D/out"; ok "Important elsewhere, the bug file only in a Nit: missed" $?
grep -q '^RT-04 #104 MISSED  no verdict line' "$D/out"; ok "no verdict line: missed" $?
grep -q '^RT-05 #105 CAUGHT' "$D/out"; ok "Block with an Important on the bug file name: caught" $?
grep -q '^reviewer-eval: caught 2 of 5 (40%), tokens 2000 (5 cases not run)$' "$D/out"; ok "summary: caught, rate, tokens, cases not run" $?
python3 -c 'import json,sys;d=json.load(open(sys.argv[1]));d[0]["match"]="one too far";d[4]["match"]="one too far";json.dump(d,open(sys.argv[1],"w"))' "$D/set.json"
e score "$A" --set "$D/set.json" >/dev/null
grep -q '^RT-01 #101 CAUGHT' "$D/out"; ok "match: the Important on the bug file that describes the bug is caught" $?
grep -q '^RT-05 #105 MISSED  Block, Important on a.ts but for another problem' "$D/out"; ok "match: the bug file named for another problem is missed" $?
printf '## Important\n\n**1. Off by one.**\n`src/a.ts:3` loops one too far.\n\n## Nit\n\n**2. Naming.** `src/a.ts:9`.\n\nReviewer: Changes %s\n' "$M" > "$A/RT-06.md"
printf '1 Important, 1 Nit\n\n## Nit\n\n**1.** `src/a.ts:3` loops one too far.\n\nReviewer: Changes %s\n' "$M" > "$A/RT-07.md"
e score "$A" --set "$D/set.json" >/dev/null
grep -q '^RT-06 #106 CAUGHT' "$D/out"; ok "a finding under a '## Important' heading counts as Important" $?
grep -q '^RT-07 #107 MISSED' "$D/out"; ok "the same finding under '## Nit' does not" $?
# Code Review on #4078: whole findings, path-boundary file match, every heading resets the section.
python3 -c 'import json,sys;d=json.load(open(sys.argv[1]));[c.__setitem__("match","one too far") for c in d[7:10]];json.dump(d,open(sys.argv[1],"w"))' "$D/set.json"
printf '1 Important, 0 Nit\n\n## Findings\n\n**1. Important: off by one** (bug class: off-by-one)\n- **Where:** `src/a.ts:3`\n- **What goes wrong:** the loop runs one too far.\n\nReviewer: Changes %s\n' "$M" > "$A/RT-08.md"
printf '1 Important\n\n1. Important: `lib/other/a.ts:3` loops one too far.\n\nReviewer: Changes %s\n' "$M" > "$A/RT-09.md"
printf '1 Important\n\n## Important\n\n1. Important: `x.ts:1` wrong label.\n\n## Checked and fine\n\n- `src/a.ts:3` loops one too far, which is intended.\n\nReviewer: Changes %s\n' "$M" > "$A/RT-10.md"
e score "$A" --set "$D/set.json" >/dev/null
grep -q '^RT-08 #108 CAUGHT' "$D/out"; ok "one finding laid out as Where/What sub-bullets is judged whole: caught" $?
grep -q '^RT-09 #109 MISSED' "$D/out"; ok "a file of the same name on another path (other/a.ts) is not the bug file" $?
grep -q '^RT-10 #110 MISSED' "$D/out"; ok "a note under '## Checked and fine' after '## Important' is not an Important finding" $?
# Round-3 review of #4078: layouts the whole-finding split must still read right.
mk 19 "$D/s15.json"; python3 -c 'import json,sys;d=json.load(open(sys.argv[1]));[c.__setitem__("match","one too far") for c in d];json.dump(d,open(sys.argv[1],"w"))' "$D/s15.json"
B2="$D/answers2"; mkdir -p "$B2"
printf '1 Important, 1 Nit\n\n**Nit (naming):** `x.ts:1` naming.\n\n**Important (off-by-one):** `src/a.ts:3` loops one too far.\n\nReviewer: Changes %s\n' "$M" > "$B2/RT-11.md"
printf '1 Important\n\n## Important\n\n- `src/a.ts:3` reads well.\n- `lib/bug.ts:9` loops one too far.\n\nReviewer: Changes %s\n' "$M" > "$B2/RT-12.md"
printf '1 Important\n\n1. Important: `../src/a.ts:3` loops one too far (also https://github.com/o/r/blob/0123abcd/src/a.ts#L3).\n\nReviewer: Changes %s\n' "$M" > "$B2/RT-13.md"
printf '1 Important\n\n## Pre-existing\n\n1. The root of Important 1: `src/a.ts:3` loops one too far.\n\nReviewer: Changes %s\n' "$M" > "$B2/RT-14.md"
printf '# Review\n1 Important, 0 Nit\nImportant: `src/a.ts:3` loops one too far.\n\nReviewer: Changes %s\n' "$M" > "$B2/RT-15.md"
e score "$B2" --set "$D/s15.json" >/dev/null
grep -q '^RT-11 #111 CAUGHT' "$D/out"; ok "a paragraph finding after a Nit paragraph keeps its own Important tag: caught" $?
grep -q '^RT-12 #112 MISSED' "$D/out"; ok "two untagged bullets under '## Important' are two findings: the file of one and the words of the other are no catch" $?
grep -q '^RT-13 #113 CAUGHT' "$D/out"; ok "a ../ prefix still names the file: caught" $?
grep -q '^RT-14 #114 MISSED' "$D/out"; ok "'Important' mentioned later in a Pre-existing line is not its tag" $?
grep -q '^RT-15 #115 CAUGHT' "$D/out"; ok "a finding right after the count line is not dropped with it: caught" $?
# Code Review on 55937258a: headings and code fences.
printf '1 Important\n\n## Important\n\n### Off by one\n\n`src/a.ts:3` loops one too far.\n\nReviewer: Changes %s\n' "$M" > "$B2/RT-16.md"
printf '2 Important\n\n## Important\n\n**1. Wrong label.** `x.ts:1`.\n\n```bash\n# reproduce\nrun it\n```\n\n**2. Off by one.** `src/a.ts:3` loops one too far.\n\nReviewer: Changes %s\n' "$M" > "$B2/RT-17.md"
printf '### 1. Important: `src/a.ts:3` loops one too far\n\nThe fix: stop one earlier.\n\nReviewer: Changes %s\n' "$M" > "$B2/RT-18.md"
printf '### Important: `src/a.ts:3`\n\nIt loops one too far.\n\nReviewer: Changes %s\n' "$M" > "$B2/RT-19.md"
e score "$B2" --set "$D/s15.json" >/dev/null
grep -q '^RT-16 #116 CAUGHT' "$D/out"; ok "a deeper sub-heading under '## Important' keeps the section: caught" $?
grep -q '^RT-17 #117 CAUGHT' "$D/out"; ok "a '# comment' inside a code block is no heading: the section holds, caught" $?
grep -q '^RT-18 #118 CAUGHT' "$D/out"; ok "a finding titled as a heading ('### 1. Important: file ...') is judged with its heading: caught" $?
grep -q '^RT-19 #119 CAUGHT' "$D/out"; ok "a heading 'Important: file' with the bug words in its body: caught" $?
echo "check-reviewer-eval: $pass passed, $fail failed"
[ "$fail" = 0 ]
