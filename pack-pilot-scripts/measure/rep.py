import re,collections
exec(open('red.py').read().split("cls={}")[0])
ORDER=sorted(red,key=lambda r:r['u']) # decided at end of run
allb=sorted(bat,key=lambda r:r['s'])
def wh(r):
    J=json.load(open(f'{S}{r["id"]}.json'))['jobs'];return min(j['started_at'] for j in J if j['started_at'])
# suite end = completed_at of red job with the suite
def suite_at(r):
    d={}
    for j in json.load(open(f'{S}{r["id"]}.json'))['jobs']:
        if j['conclusion']=='failure' and j['name'].startswith('shard ('):
            for s in set(re.findall(r'\| (check_\S+) \| (?:FAIL|failed twice)',open(f'../logs/{j["id"]}',errors='replace').read())):d[s]=j['completed_at']
    return d
ev=[]
for r in red:
    for s,t in suite_at(r).items():ev.append((t,s,r))
ev.sort(key=lambda e:e[0])
seen=collections.defaultdict(list);trig=[]
for t,s,r in ev:
    seen[s].append((t,r))
    if len(seen[s])>1 and seen[s][0][0] and True:
        a=seen[s][-2];
        if not any(x[1]==s for x in trig):trig.append((t,s))
print('first trigger per suite')
for t,s in sorted(trig):
    rs=[r for (tt,r) in seen[s]];common=set.intersection(*[set(I[r['id']][2]+I[r['id']][3]) for r in rs[:2]])
    owns=[set(I[r['id']][2]) for r in rs[:2]]
    later=[r for r in bat if r['c']=='failure' and r['s']>=t and s in I[r['id']][0]]
    rn=[r for r in bat if r['s']<t<r['u']]
    ob=[r for r in bat if r['s']>=t and r['c']=='failure' and I[r['id']][0]<=({s}|(MAIN if s in MAIN else set()))]
    print(t[5:16],s,'n',len(rs),'first two',[r['id'] for r in rs[:2]],'common',common,'| reds started after',len(later),round(sum(mins(r['id']) for r in later)),'only-this-suite',len([r for r in later if I[r['id']][0]=={s}]),round(sum(mins(r['id']) for r in later if I[r['id']][0]=={s})),[('#'+'+'.join(I[r['id']][2]),r['id']) for r in later][:8])
