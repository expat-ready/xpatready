import json,re,collections,os
exec(open('tot.py').read().split("P='2026")[0])
runs=list(R.values());fr=[r for r in runs if r['path']=='ci.yml' and r['e']=='workflow_dispatch']
fr.sort(key=lambda r:r['s']);heads=collections.Counter()
bat=[r for r in runs if r['path']=='ci.yml' and (r['b'] or '').startswith('mergify/')]
both=0;bmin=0;redjobs=[]
for r in fr:
    m=re.match(r'full-run PR #(\d+) (\w+)',r['t'])
    if not m: print('?',r['t'],r['id']);continue
    pr,h=m[1],m[2];heads[(pr,h)]+=1
    hb=[x for x in runs if x['h']==h and x['e']=='pull_request'];br=hb[0]['b'] if hb else None
    later=sorted({(x['s'],x['h']) for x in runs if br and x['b']==br and x['e']=='pull_request' and x['h']!=h and x['s']>r['s']})
    cut=later[0][0] if later else '9'
    b=[x for x in bat if r['s']<x['s']<cut and re.search(rf"#{pr}\b",x['t'].split(' on main')[0])]
    prs=collections.Counter((x['path'],x['c']) for x in hb if x['path'] in('pr-suites.yml','ci.yml','walks.yml'))
    if b: both+=1;bmin+=mins(r['id']) or 0
    print(r['s'][5:16],r['id'],'#'+pr,h[:9],r['c'],mins(r['id']),'| batches same head:',[(x['id'],x['c'],mins(x['id'])) for x in b] if br else 'branch unknown','| PR:',dict((k[0]+':'+str(k[1]),v) for k,v in prs.items()))
    if r['c']=='failure':
        J=json.load(open(f'{S}{r["id"]}.json'))['jobs']
        for j in J:
            if j['conclusion']=='failure': redjobs.append((r['id'],j['id'],j['name'][:30]))
print('full runs',len(fr),'same head then in a batch',both,'full-run minutes',bmin,'| heads with >1',[(k,v) for k,v in heads.items() if v>1])
pr=collections.defaultdict(set)
for (p,h) in heads:pr[p].add(h)
print('PRs',len(pr),'PRs with >1 head run',{p:len(v) for p,v in pr.items() if len(v)>1})
print(collections.Counter(r['c'] for r in fr))
open('redj','w').write('\n'.join(f'{a} {b} {c}' for a,b,c in redjobs))
