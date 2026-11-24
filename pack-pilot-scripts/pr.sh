# pr.sh <dir> <branch> <title> <bodyfile> : commits files under <dir> that differ from origin/main, pushes, opens the PR
set -e
D=$1; BR=$2; B=$(git rev-parse ${5:-origin/main}); export GIT_INDEX_FILE=/private/tmp/claude-501/-Users-ranjansingh-Desktop-Xpatready--claude-worktrees-pensive-easley-382eee/a46fa0a6-24b0-4b00-b7fe-e0619dabd65a/scratchpad/idx-pr-$$
git read-tree $B
(cd $D && find ai-workers .github .claude -type f 2>/dev/null) | while read f; do h=$(git hash-object -w "$D/$f"); o=$(git ls-tree $B -- "$f"); [ "$(awk '{print $3}' <<< "$o")" = "$h" ] && continue; case "$f" in *__pycache__*) continue;; esac
 m=$(awk '{print $1}' <<< "$o"); [ -z "$m" ] && { case "$f" in *.sh) m=100755;; *) m=100644;; esac; }; git update-index --add --cacheinfo "$m,$h,$f"; done
C=$(printf '%s\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\n' "$3" | git commit-tree $(git write-tree) -p $B); unset GIT_INDEX_FILE
git diff --stat $B $C; git push -q origin "${C}:refs/heads/$BR" 2>&1 | grep -iE 'reject|refus|error' || true
[ -n "$4" ] && jq -n --arg t "$3" --arg h "$BR" --rawfile b "$4" '{title:$t,head:$h,base:"main",body:$b}' | curl -sS -X POST -H "Authorization: Bearer $(gh auth token)" https://api.github.com/repos/expat-ready/xpatready/pulls -d @- | jq -r '"PR \(.number) \(.html_url) \(.message // "") \(.errors // "")"'
echo $C
