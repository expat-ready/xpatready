# go.sh "<shards comma>" <repeat> <k>: merge-free: branch tip gets main f33cbe803's tree once, then config + pack-go
set -e
S=/private/tmp/claude-501/-Users-ranjansingh-Desktop-Xpatready--claude-worktrees-pensive-easley-382eee/a46fa0a6-24b0-4b00-b7fe-e0619dabd65a/scratchpad
MAIN=f33cbe803; MAIN=$(git rev-parse $MAIN); T=ai-workers/problem-1-pathway-setup-and-form-filling/product/tools
BASE=$(git ls-remote origin refs/heads/claude/lead-o2-pack | cut -f1)
git show "${MAIN}:$T/run-suites.sh" > $S/pk/rs.sh
python3 -I - "$S/pk/rs.sh" "$1" "$2" "$3" "$S/pk" <<'P'
import sys,json
f,sh,r,k,d=sys.argv[1:]
s=open(f).read();a='if [ "$LIST" = 1 ]; then\n  for u in ${units';assert s.count(a)==1
open(f,'w').write(s.replace(a,'''# PILOT ONLY (claude/lead-o2-pack, never merged): print this shard's deal, or run only the named units of it.
if [ "${PACK_DEAL:-}" = 1 ]; then for u in $MINE; do echo "$u"; done; exit 0; fi
if [ -n "${PACK_UNITS:-}" ]; then MINE=" $PACK_UNITS "; fi
'''+a))
json.dump({"shards":[int(x) for x in sh.split(',')],"at_once":[int(k)],"repeat":int(r)},open(d+'/pack-config.json','w'))
P
echo "shards $1 repeat $2 at once $3 main $MAIN" > $S/pk/pack-go
export GIT_INDEX_FILE=$S/idxgo; git read-tree $MAIN
put() { git update-index --add --cacheinfo "$3,$(git hash-object -w "$S/pk/$1"),$2"; }
put rs.sh $T/run-suites.sh $(git ls-tree $MAIN $T/run-suites.sh | cut -d' ' -f1); put pack-run.py pack-pilot/pack-run.py 100644; put pack-server.sh pack-pilot/pack-server.sh 100755; put pack-config.json pack-pilot/pack-config.json 100644; put pack-go pack-pilot/pack-go 100644; put lead-o2-pack.yml .github/workflows/lead-o2-pack.yml 100644
git update-index --add --cacheinfo "100644,$(git rev-parse "49e51683c:pack-pilot/RESULTS-PILOT-A.md"),pack-pilot/RESULTS-PILOT-A.md"
if git merge-base --is-ancestor $MAIN $BASE; then PA="-p $BASE"; else PA="-p $BASE -p $MAIN"; fi
C=$(printf 'pilot: go, shards %s, repeat %s, %s at once\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\n' "$1" "$2" "$3" | git commit-tree $(git write-tree) ${=PA}); unset GIT_INDEX_FILE
git push origin "${C}:refs/heads/claude/lead-o2-pack" 2>&1 | tail -1
