#!/usr/bin/env bash
# Full run on ask (OS-06): full-run-ask.py posts "/run full" once for an open PR whose "Question for the tech lead" asks
# for the full run. Pass and fail case for each rule, with a stand-in gh. US$0, no network.   bash product/tools/check-full-run-ask.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/fra.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "${T:?}"' EXIT
printf '#!/bin/sh\n[ -n "${FAIL:-}" ] && { echo "HTTP 403" >&2; exit 1; }\necho "$@" >> "%s/posts"\n' "$T" > "$T/gh"; chmod +x "$T/gh"
echo '[{"number":101},{"number":102}]' > "$T/prs.json"
c() { python3 -I -c 'import json,sys; d={"n":sys.argv[1],"b":sys.argv[2]}; d.update({"id":int(sys.argv[3])} if len(sys.argv)>3 else {}); print(json.dumps(d))' "$@"; }
run() { : > "$T/posts"; printf '%s\n' "$@" > "$T/c.jsonl"
  o=$(FULL_RUN_ASK_GH="$T/gh" python3 -I "$TOOLS/full-run-ask.py" --comments "$T/c.jsonl" --prs "$T/prs.json" --state "$T/s" ${POST---post} 2>&1); rc=$?; }
posts() { grep -c . "$T/posts"; }; has() { grep -qF -- "$1" <<<"$o"; }; acts() { grep -c '^ACT' <<<"$o"; }
Q=$'## Question for the tech lead\nCould you dispatch the full run on this head?'

run "$(c 101 "$Q")"; ok "ask on an open PR: one /run full posted on it, said, exit 0" "$([ "$rc" = 0 ] && [ "$(posts)" = 1 ] && grep -qxF 'api -X POST repos/{owner}/{repo}/issues/101/comments -f body=/run full' "$T/posts" && has '#101 asked for the full run; /run full posted' && echo 1)" "$o $(cat "$T/posts")"
run "$(c 101 "$Q")"; ok "the same ask at the next check: not posted again" "$([ "$(posts)" = 0 ] && has '0 new ask' && echo 1)" "$o"
rm -rf "$T/s"
for b in $'**Question for the tech lead:** please start a full-run' $'- Question for the tech lead: could you trigger the full run on abc123?' $'_Question for the tech lead_: please kick off the full run' $'Question for the tech lead: `/run full`?' $'## Question for the tech lead\nCould you dispatch\nthe full run on this head?'; do
  rm -rf "$T/s"; run "$(c 102 "$b")"; ok "asks: '${b//$'\n'/ / }'" "$([ "$(posts)" = 1 ] && echo 1)" "$o"; done
for b in $'Question for the tech lead: may I touch core.ts?' $'Please dispatch the full run on this head.' $'I asked the tech lead. Question for the tech lead: full run?' \
         $'Question for the tech lead: see\n```\nstart the full run\n```' $'<!-- Question for the tech lead: start the full run -->ok' \
         $'Question for the tech lead: the full run failed on flaky X; is that a known flake?' $'Question for the tech lead: may I touch core.ts?\n\nStatus: full run green on abc123.' \
         $'Question for the tech lead: do I need the full run, or is the fast set enough?' $'Question for the tech lead: no full run needed here, right?' \
         $'Question for the tech lead: could you start the full runtime lane?' $'> Question for the tech lead: could you start the full run?\nStarted it.' \
         $'Question for the tech lead: please run the full run again, it was red' \
         $'Question for the tech lead: please don\'t start the full run yet' $'Question for the tech lead: please don’t start the full run' \
         $'Question for the tech lead: should I /run full or wait?' $'Question for the tech lead: when should we trigger the full run, after #123 lands?' \
         $'Question for the tech lead: will you start the full run after the reviewer approves?' $'Question for the tech lead: is it OK if I run the full run locally?' \
         $'Question for the tech lead: who can start the full run here?' $'Question for the tech lead: we can\'t start the full run' ; do
  rm -rf "$T/s"; run "$(c 101 "$b")"; ok "no ask: '${b//$'\n'/ / }', and nothing printed" "$([ "$(posts)" = 0 ] && [ -z "$o" ] && echo 1)" "$o"; done
rm -rf "$T/s"; run "$(c 101 "$Q" 11)"; run "$(c 101 "$Q" 12)"; ok "the same words in a new comment (a new id) are a new ask" "$([ "$(posts)" = 1 ] && echo 1)" "$o"
run "$(c 101 "$Q" 12)"; ok "the same comment id at the next check: not again" "$([ "$(posts)" = 0 ] && echo 1)" "$o"
rm -rf "$T/s"; run "$(c 999 "$Q")"; ok "a PR not open: nothing posted" "$([ "$(posts)" = 0 ] && echo 1)" "$o"
rm -rf "$T/s"; run "$(c 101 "$Q")" "$(c 101 "$Q again")"; ok "two asks on one PR in one check: one post, both remembered" "$([ "$(posts)" = 1 ] && echo 1)" "$o"
run "$(c 101 "$Q again")"; ok "the second ask is not answered at the next check" "$([ "$(posts)" = 0 ] && echo 1)" "$o"
rm -rf "$T/s"; FAIL=1 run "$(c 101 "$Q")"; ok "a failed post is an ACT with the words to type, and not remembered" "$([ "$(acts)" = 1 ] && has 'posting /run full failed (HTTP 403): type it' && echo 1)" "$o"
run "$(c 101 "$Q")"; ok "after a failed post the next check posts" "$([ "$(posts)" = 1 ] && echo 1)" "$o"
rm -rf "$T/s"; POST= run "$(c 101 "$Q")"; ok "without --post: an ACT with the words, nothing posted" "$([ "$(posts)" = 0 ] && has 'ACT   #101 asks for the full run: type /run full' && echo 1)" "$o"
echo 'not json' > "$T/prs.json"; rm -rf "$T/s"; run "$(c 101 "$Q")"; ok "an unreadable open-PR list: an ACT, nothing posted" "$([ "$(posts)" = 0 ] && [ "$(acts)" = 1 ] && echo 1)" "$o"
run "$(c 101 'Question for the tech lead: may I?')"; ok "an unreadable open-PR list and no ask: nothing printed" "$([ -z "$o" ] && echo 1)" "$o"
echo '[{"number":101}]' > "$T/prs.json"
rm -rf "$T/s"; run 'garbage' "$(c 101 "$Q")"; ok "an unreadable comment line: an ACT, the others still answered" "$([ "$(posts)" = 1 ] && has '1 comment line(s) unreadable' && echo 1)" "$o"
mkdir -p "$T/s"; echo '{broken' > "$T/s/full-run-ask.json"; run "$(c 101 "$Q")"; ok "an unreadable memory: rebuilt and said, the ask answered" "$([ "$(posts)" = 1 ] && has 'memory unreadable' && echo 1)" "$o"
rm -rf "$T/s"; python3 -I -c 'import json; print(json.dumps([{"number":n} for n in range(1,20)]))' > "$T/prs.json"
L=(); for n in $(seq 1 12); do L+=("$(c "$n" "$Q")"); done; run "${L[@]}"
ok "more than 10 PRs asking: 10 posts, then one ACT" "$([ "$(posts)" = 10 ] && [ "$(acts)" = 1 ] && has 'more than 10 PRs asked' && echo 1)" "$o"
printf '#!/bin/sh\necho "$@" >> "%s/posts"\nsleep 70\n' "$T" > "$T/ghslow"; chmod +x "$T/ghslow"; echo '[{"number":101}]' > "$T/prs.json"
rm -rf "$T/s"; : > "$T/posts"; printf '%s\n' "$(c 101 "$Q" 77)" > "$T/c.jsonl"; o=$(FULL_RUN_ASK_GH="$T/ghslow" timeout 120 python3 -I "$TOOLS/full-run-ask.py" --comments "$T/c.jsonl" --prs "$T/prs.json" --state "$T/s" --post 2>&1)
ok "a post with no answer in 60 s: an ACT, remembered (it may have landed)" "$(has 'may have landed' && grep -q '101:id77' "$T/s/full-run-ask.json" && echo 1)" "$o"
run "$(c 101 "$Q" 77)"; ok "after a timed-out post nothing is posted again" "$([ "$(posts)" = 0 ] && echo 1)" "$o"
rm -rf "$T/s"; mkdir -p "$T/s/full-run-ask.json.tmp"; run "$(c 101 "$Q" 78)"
ok "a memory that cannot be written: nothing posted, an ACT with the words" "$([ "$(posts)" = 0 ] && has 'memory cannot be written' && has 'type /run full on it' && echo 1)" "$o"
finish
