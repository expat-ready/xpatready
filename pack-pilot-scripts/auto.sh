S=/private/tmp/claude-501/-Users-ranjansingh-Desktop-Xpatready--claude-worktrees-pensive-easley-382eee/a46fa0a6-24b0-4b00-b7fe-e0619dabd65a/scratchpad; R=repos/expat-ready/xpatready; run=$1; cd /Users/ranjansingh/Desktop/Xpatready/.claude/worktrees/pensive-easley-382eee
for spec in "17,18,19,20,21,22,23,24 1" "1,2,3,4,5,6,7,8 2" "9,10,11,12,13,14,15,16 2" "17,18,19,20,21,22,23,24 2" "1,2,3,4,5,6,7,8 3" "9,10,11,12,13,14,15,16 3" "17,18,19,20,21,22,23,24 3" END; do
  n=0; while [ "$(zsh $S/api.sh $R/actions/runs/$run | jq -r .status)" != completed ]; do n=$((n+1)); [ $n -gt 50 ] && { echo "stop: $run not done after 150 min"; exit 1; }; sleep 180; done
  zsh $S/rd.sh $run > $S/p24/read-$run.txt 2>&1; red=$(grep -c '^== .* failure' $S/p24/read-$run.txt); none=$(grep -c 'PACK total' $S/p24/read-$run.txt); echo "$run done $(TZ=Asia/Kolkata date +%H:%M) red jobs $red totals $none"
  [ "$none" -lt 8 ] && { echo "stop: $none of 8 jobs printed totals"; exit 1; }; [ "$red" -gt 4 ] && { echo "stop: $red jobs red, read first"; exit 1; }
  [ "$spec" = END ] && { echo "all pushes done"; exit 0; }
  ok=0; for i in $(seq 1 40); do w=$(zsh $S/waiting.sh); if [ -z "$(grep -v 'waiting 0' <<< "$w")" ]; then ok=1; break; fi; sleep 300; done
  [ $ok = 1 ] || { echo "stop: machines wanted for 200 min"; exit 1; }
  set -- ${=spec}; zsh $S/go.sh $1 $2 3; sleep 40
  new=$(zsh $S/api.sh "$R/actions/runs?branch=claude/lead-o2-pack&per_page=1" | jq -r '.workflow_runs[0].id'); [ "$new" != "$run" ] && [ -n "$new" ] || { echo "stop: no new run after push"; exit 1; }
  run=$new; echo "started $run shards $1 repeat $2 $(TZ=Asia/Kolkata date +%H:%M)"
done
