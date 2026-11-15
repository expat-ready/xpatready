#!/bin/zsh
# Lead B: prints a shaping branch whose head changed since the last run (P-604 fast-track specifying). State in shaping-seen.txt (git-ignored working file; do not commit).
W=${0:h}; S=$W/shaping-seen.txt; touch $S
for b in shaping/s1-platform-audit shaping/s2-front-office-case shaping/s3-money-unassigned; do
  h=$(git -C $W ls-remote origin refs/heads/$b 2>/dev/null | cut -c1-12)
  [[ -z $h ]] && continue
  grep -q "^$b $h$" $S && continue
  sed -i '' "\#^$b #d" $S; echo "$b $h" >> $S; echo "SHAPING $b $h"
done
