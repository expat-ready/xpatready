# mergemain.sh <branch> <tests anchor (line start)> <row anchor (line start)> <lead-watch anchor or ->
set -e
T=ai-workers/problem-1-pathway-setup-and-form-filling/product/tools; S=$5; BR=$1; H=$(git rev-parse origin/$BR); MN=$(git rev-parse origin/main); MB=$(git merge-base $H $MN)
TREE=$(git merge-tree --write-tree $MN $H 2>/dev/null | head -1) || true
mkdir -p $S/mm; for x in base:$MB head:$H main:$MN; do for f in check-guards.sh lead-watch.sh; do git show ${x#*:}:$T/$f > $S/mm/${x%%:*}-$f; done; done
python3 - $S/mm "$2" "$3" "$4" <<'P'
import sys,difflib
d,ta,ra,la=sys.argv[1:]
rd=lambda n:open(f'{d}/{n}').read().split('\n')
b,h,m=(rd(x+'-check-guards.sh') for x in('base','head','main'))
add=[l for l in h if l not in b]; gone=[l for l in b if l not in h]
assert not gone,gone
tests=[l for l in add if l.startswith('TESTS=')]; rows=[l for l in add if l.startswith('A3')]
assert len(tests)+len(rows)==len(add),[l for l in add if l not in tests+rows]
assert all(l not in m for l in add)
def ins(lst,anchor,new):
    k=[i for i,l in enumerate(lst) if l.startswith(anchor)]; assert len(k)==1,(anchor,len(k)); return lst[:k[0]+1]+new+lst[k[0]+1:]
m=ins(m,ta,tests); m=ins(m,ra,rows); open(f'{d}/out-check-guards.sh','w').write('\n'.join(m))
b,h,m=(open(f'{d}/{x}-lead-watch.sh').read() for x in('base','head','main'))
if la!='-':
    i=h.index(la); j=h.index('\n\n',i)+2; step=h[i:j]; assert step not in m
    nxt=h[j:].split('\n',1)[0]+'\n'; assert m.count(nxt)==1,nxt; assert h.replace(step,'')==b
    open(f'{d}/out-lead-watch.sh','w').write(m.replace(nxt,step+nxt))
P
export GIT_INDEX_FILE=$S/idx-mm-$$; git read-tree $TREE
for f in check-guards.sh lead-watch.sh; do [ $f = lead-watch.sh ] && [ "$4" = - ] && continue; git update-index --cacheinfo 100755,$(git hash-object -w $S/mm/out-$f),$T/$f; done
for f in check-guards.sh lead-watch.sh; do git ls-files -s $T/$f | cut -c1-6 | grep -qx "$(git ls-tree $MN $T/$f | cut -c1-6)" || git update-index --cacheinfo $(git ls-tree $MN $T/$f | cut -c1-6),$(git ls-files -s $T/$f | awk '{print $2}'),$T/$f; done
W=$(git write-tree); git grep -nE '^(<<<<<<<|>>>>>>>) ' $W -- $T/check-guards.sh $T/lead-watch.sh && exit 1
C=$(printf 'Merge main into %s: its guard rows and tests keep places of their own\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\n' $BR | git commit-tree $W -p $H -p $MN); unset GIT_INDEX_FILE
echo "$BR $C"; git diff --stat $MN $C | tail -8; git update-ref refs/lo2/$BR $C
