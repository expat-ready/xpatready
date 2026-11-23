import json,math,collections,datetime as D,os
S='../jobs/';R={}
for l in open('runs.jsonl'):
    r=json.loads(l);R[r['id']]=r
ts=lambda s:D.datetime.fromisoformat(s.replace('Z','+00:00'))
def mins(i):
    try:J=json.load(open(f'{S}{i}.json'))
    except Exception:return None
    t=0
    for j in J['jobs']:
        if j['started_at'] and j['completed_at'] and j['conclusion']!='skipped':
            s=(ts(j['completed_at'])-ts(j['started_at'])).total_seconds()
            if s>0:t+=math.ceil(s/60)
    if J.get('total_count',0)>len(J['jobs']): t*=J['total_count']/len(J['jobs'])
    return t
P='2026-11-23T08:34:00Z'
g=collections.defaultdict(list)
for i,r in R.items():
    if r['c']=='skipped':continue
    q='batch' if (r['b'] or '').startswith('mergify/') else 'pr'
    per='before pause' if r['s']<P else 'in pause'
    g[(per,r['path'],r['e'],q)].append(i)
cat=collections.Counter();n=collections.Counter();wf=collections.Counter();samp=collections.Counter()
# mean per group pooled over periods
pool=collections.defaultdict(list)
for (per,p,e,q),v in g.items():
    for i in v:
        m=mins(i)
        if m is not None:pool[(p,e,q)].append(m)
nodata=[]
for (per,p,e,q),v in g.items():
    if p=='ci.yml' and e=='workflow_dispatch':c='full runs (dispatched)'
    elif p=='nightly.yml':c='nightly'
    elif q=='batch':c='merge-queue batches'
    elif e in('pull_request','pull_request_target','dynamic'):c='PR runs'
    else:c='other (comments, pushes, schedules)'
    x=[mins(i) for i in v];k=[a for a in x if a is not None]
    po=pool[(p,e,q)]
    if not po: nodata.append((p,e,q,len(v)));continue
    tot=sum(k)+(len(v)-len(k))*sum(po)/len(po)
    for pp in(per,'all 24 h'):
        cat[(pp,c)]+=tot;n[(pp,c)]+=len(v);samp[(pp,c)]+=len(k)
    wf[(c,p)]+=tot
for per in('all 24 h','before pause','in pause'):
    T=sum(v for (a,b),v in cat.items() if a==per);print('##',per,round(T))
    for (a,b),v in cat.most_common():
        if a==per:print(f'  {v:8.0f} {100*v/T:5.1f}%  runs {n[(a,b)]} read {samp[(a,b)]}  {b}')
for k,v in wf.most_common(14):print(round(v),k)
print('no data',nodata)
