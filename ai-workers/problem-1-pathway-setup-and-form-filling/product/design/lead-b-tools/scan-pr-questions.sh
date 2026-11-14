#!/bin/zsh
# Lead B watch: new PF/FO PR comments that ask Lead B or the tech lead. Keeps seen ids next to the script (seen.txt; do not commit it).
# Run it in a background until-loop, e.g.: while true; do out=$(./scan-pr-questions.sh $SINCE | grep -E "^#|WATCH-ERROR"); [[ -n $out ]] && { echo $out; exit; }; sleep 180; done
# usage: scan.sh SINCE  — prints new PF/FO question comments, records seen ids
T=$(gh auth token 2>/dev/null); R=$(git -C ${0:h} remote get-url origin | sed -E "s#.*github.com[:/]##; s#\.git$##"); W=${0:h}; SEEN=$W/seen.txt; touch $SEEN
for p in 1 2 3 4 5 6; do
  curl -s --retry 3 -H "Authorization: Bearer $T" "https://api.github.com/repos/$R/issues/comments?since=$1&sort=created&direction=asc&per_page=100&page=$p" -o $W/page.json || { echo "WATCH-ERROR curl page $p"; break; }
  n=$(python3 -c "import json;d=json.load(open('$W/page.json'));print(len(d) if isinstance(d,list) else -1)" 2>/dev/null || echo -1)
  [[ $n == -1 ]] && { echo "WATCH-ERROR bad json page $p"; break; }
  [[ $n == 0 ]] && break
  python3 - $W/page.json $SEEN > $W/hits.tsv <<'PY'
import json,sys
cs=json.load(open(sys.argv[1])); seen=set(open(sys.argv[2]).read().split())
for c in cs:
  b=c.get("body") or ""; h=b[:300]
  if str(c["id"]) in seen: continue
  if "from Lead B" in h or "Answers from Lead B" in h or "Answer from Lead B" in h or h.lstrip().startswith("**Lead B (") or "Lead B (row owner of" in h[:80]: continue
  if "question for the tech lead" not in b.lower() and "lead b" not in b.lower(): continue
  print("\t".join([str(c["id"]), c["issue_url"].rsplit("/",1)[1], b[:160].replace("\n"," ").replace("\t"," ")]))
PY
  while IFS=$'\t' read -r id num body; do
    t=$(curl -s --retry 3 -H "Authorization: Bearer $T" "https://api.github.com/repos/$R/issues/$num" | python3 -c "import json,sys;print(json.load(sys.stdin).get('title',''))" 2>/dev/null)
    echo $id >> $SEEN
    [[ $t == *PF-* || $t == *FO-* ]] && echo "#$num [${t[1,60]}] comment $id: $body"
  done < $W/hits.tsv
  [[ $n -lt 100 ]] && break
done
