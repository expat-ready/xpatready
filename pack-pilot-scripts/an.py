import json,re,glob,collections,datetime as D,statistics as st
S='/private/tmp/claude-501/-Users-ranjansingh-Desktop-Xpatready--claude-worktrees-pensive-easley-382eee/a46fa0a6-24b0-4b00-b7fe-e0619dabd65a/scratchpad/'
B={}
for l in open(S+'batches.jsonl'):
    b=json.loads(l);B[b['id']]=b
ts=lambda s:D.datetime.fromisoformat(s.replace('Z','+00:00'))
job2=collections.defaultdict(list); code={}; steps=collections.defaultdict(list)
for i,b in B.items():
    try: J=json.load(open(f'{S}jobs/{i}.json'))['jobs']
    except Exception: print('no jobs',i);continue
    sh=[j for j in J if j['name'].startswith('shard (')]
    code[i]=len(sh)>0
    b['redother']=[j['name'].split(' (')[0] for j in J if j['conclusion']=='failure' and not j['name'].startswith('shard')]
    for j in sh:
        if j['conclusion']=='failure': job2[i].append(j['id'])
        if j['conclusion']=='success':
            for s in j['steps']:
                if s['started_at'] and s['completed_at']:
                    n=re.sub(r'part \d+ of.*','',s['name'])[:48]
                    steps[n].append((ts(s['completed_at'])-ts(s['started_at'])).total_seconds())
code_b=[b for i,b in B.items() if code.get(i)]
print('batch runs',len(B),'code',len(code_b))
for w,lo in (('from 22 Nov 11:30 IST','2026-11-22T06:00:00'),('from #2434, 23 Nov 13:22 IST','2026-11-23T07:52:00')):
    x=[b for b in code_b if b['s']>lo]
    print(w,'code',len(x),'red',sum(b['c']!='success' for b in x))
    for k in (1,2,3):
        y=[b for b in x if len(re.findall(r'#\d+',b['t'].split(' on main')[0]))==k]
        print('   PRs tested',k,'n',len(y),'red',sum(b['c']!='success' for b in y))
    for n,f in (('stacked',lambda b:'stacked on' in b['t']),('not stacked',lambda b:'stacked on' not in b['t'])):
        y=[b for b in x if f(b)];print('   ',n,len(y),'red',sum(b['c']!='success' for b in y))
su=collections.defaultdict(list);unk=[]
for i,js in job2.items():
    for j in js:
        t=open(f'{S}logs/{j}',errors='replace').read()
        m=set(re.findall(r'\| (check_\S+) \| (?!PASS)(?!passed)[^|]*\|', t))
        ok=re.findall(r'\| (check_\S+) \| (?!failed)[^|]*retry',t)
        if not m: unk.append((i,j))
        for s in m: su[s].append(i)
print('red code batches w/ suite names',len({i for v in su.values() for i in v}),'shards w/o name',len(unk))
for s,v in sorted(su.items(),key=lambda z:-len(set(z[1])))[:25]:
    prs=[set(re.findall(r'#(\d+)',B[i]['t'])) for i in v]
    print(len(set(v)),s,'alone in',sum(1 for i in set(v) if sum(i in w for w in su.values())==1),'common PR',set.intersection(*prs) or '-','last',max(B[i]['s'] for i in v)[5:16])
print('--- steps (green shards)')
for n,v in sorted(steps.items(),key=lambda z:-st.mean(z[1])):
    if st.mean(v)>1: print(f'{st.mean(v):7.1f}s med {st.median(v):6.0f} p90 {sorted(v)[int(.9*len(v))]:6.0f} n={len(v)} {n}')
for t in ('c69_page','c92_out_of','c41_section','pf5s1_signup'):
    print('##',t,[(B[i]['s'][5:16],B[i]['t'][22:90]) for k,v in su.items() if t in k for i in v])
