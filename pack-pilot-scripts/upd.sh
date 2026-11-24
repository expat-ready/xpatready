# upd.sh <dir> <branch> <message>: commits the dir's changed files on top of the branch's own tip and pushes
set -e
git fetch -q origin $2; P0=$(git rev-parse FETCH_HEAD); export GIT_INDEX_FILE=/private/tmp/claude-501/idx-upd-$$; git read-tree $P0; D=$1
BASE=$(git merge-base $P0 origin/main)
(cd $D && find ai-workers .github -type f 2>/dev/null | grep -v __pycache__) | while read f; do h=$(git hash-object -w "$D/$f"); o=$(git ls-tree $P0 -- "$f"); b=$(git ls-tree $BASE -- "$f"); [ "$(awk '{print $3}' <<< "$o")" = "$h" ] && continue; m=$(awk '{print $1}' <<< "$o"); [ -z "$m" ] && m=100755; git update-index --add --cacheinfo "$m,$h,$f"; done
C=$(printf '%s\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\n' "$3" | git commit-tree $(git write-tree) -p $P0); rm -f "/private/tmp/claude-501/idx-upd-$$"; unset GIT_INDEX_FILE; git diff --stat $P0 $C; git push -q origin "${C}:refs/heads/$2" 2>&1 | grep -iE 'reject|refus|error' || true; echo $C
