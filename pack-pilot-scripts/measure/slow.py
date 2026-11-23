import json,re,collections,statistics as st,fnmatch
ids=[l.split()[1] for l in open('green5')]
T=collections.defaultdict(list)
for i in ids:
    for j in json.load(open(f'../jobs/{i}.json'))['jobs']:
        if j['name'].startswith('shard (') :
            t=open(f'../logs/{j["id"]}',errors='replace').read()
            for a,res,s in re.findall(r'\| (check_\S+) \| ([^|]+) \| (\d+) s \|',t):
                if res.strip() in('PASS','passed on retry'): T[a].append(int(s))
tot=sum(sum(v) for v in T.values());print('suites',len(T),'runs',len(ids),'suite s per run mean',tot/len(ids))
scopes={};cur=None
for l in open('m.yml'):
    m=re.match(r'^      ([a-z0-9-]+):\s*$',l)
    if m:cur=m[1]
    m=re.match(r'^\s+- "(.*tests/check_[^"]*)"',l)
    if m and cur:scopes.setdefault(m[1].split('/')[-1],cur)
def own(s):
    for p,c in scopes.items():
        if fnmatch.fnmatch(s,p):return c
    return 'no scope'
rows=sorted(((st.median(v),len(v),sum(v),s) for s,v in T.items()),reverse=True)
out=open('slow.md','w');cum=0
for n,(m,k,su,s) in enumerate(rows[:100],1):
    cum+=su;out.write(f'| {n} | {s} | {m/60:.1f} | {k} | {100*su/tot:.2f}% | {own(s)} |\n')
print('top100 share',100*cum/tot,'top10',100*sum(r[2] for r in rows[:10])/tot)
c=collections.Counter()
for m,k,su,s in rows[:100]:c[own(s)]+=1
print(c); print(scopes.__len__())
print(''.join(open('slow.md').readlines()[:12]))
