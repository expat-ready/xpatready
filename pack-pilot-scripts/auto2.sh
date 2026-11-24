S=/private/tmp/claude-501/-Users-ranjansingh-Desktop-Xpatready--claude-worktrees-pensive-easley-382eee/a46fa0a6-24b0-4b00-b7fe-e0619dabd65a/scratchpad; R=repos/expat-ready/xpatready; cd /Users/ranjansingh/Desktop/Xpatready/.claude/worktrees/pensive-easley-382eee
# spec: shards repeat k. Two shards a push, so "no batch is waiting" is read again about every 15 minutes.
for spec in "11,15 1 2" "16,18 1 2" "20,21 1 2" "22 1 2" "11,15 1 1" "16,18 1 1" "20,21 1 1" "22 1 1" "11,15 2 2" "16,18 2 2" "20,21 2 2" "22 2 2" "11,15 3 2" "16,18 3 2" "20,21 3 2" "22 3 2"; do
  ok=0; for i in $(seq 1 72); do w=$(zsh $S/waiting.sh) && [ -z "$(grep -v 'waiting 0' <<< "$w")" ] && { ok=1; break; }; sleep 300; done
  [ $ok = 1 ] || { echo "stop: machines wanted for 360 min"; exit 1; }
  old=$(zsh $S/api.sh "$R/actions/runs?branch=claude/lead-o2-pack&per_page=1" | jq -r '.workflow_runs[0].id')
  set -- ${=spec}; zsh $S/go.sh $1 $2 $3 || exit 1; sleep 45
  run=$(zsh $S/api.sh "$R/actions/runs?branch=claude/lead-o2-pack&per_page=1" | jq -r '.workflow_runs[0].id'); [ -n "$run" ] && [ "$run" != "$old" ] || { echo "stop: no new run"; exit 1; }
  echo "$run shards $1 repeat $2 at once $3 started $(TZ=Asia/Kolkata date +%H:%M)"
  n=0; while [ "$(zsh $S/api.sh $R/actions/runs/$run | jq -r .status)" != completed ]; do n=$((n+1)); [ $n -gt 40 ] && { echo "stop: $run over 120 min"; exit 1; }; sleep 180; done
  want=$(awk -F, '{print NF}' <<< "$1"); for k in 1 2 3; do zsh $S/rd.sh $run > $S/p24/k-$run.txt 2>&1; [ $(grep -c 'PACK total' $S/p24/k-$run.txt) -ge $want ] && break; sleep 60; done
  echo "$run done $(TZ=Asia/Kolkata date +%H:%M) red $(grep -c '^== .* failure' $S/p24/k-$run.txt) totals $(grep -c 'PACK total' $S/p24/k-$run.txt)/$want"
  [ $(grep -c 'PACK total' $S/p24/k-$run.txt) -lt $want ] && grep -cE '^== .* (failure|cancelled)' $S/p24/k-$run.txt >/dev/null && grep -q cancelled $S/p24/k-$run.txt && { echo "stop: cancelled job"; exit 1; }
done
echo "all done"
