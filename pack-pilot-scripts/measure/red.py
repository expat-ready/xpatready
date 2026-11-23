import re,collections
exec(open('tot.py').read().split("P='2026")[0])
bat=[r for r in R.values() if r['path']=='ci.yml' and (r['b'] or '').startswith('mergify/')]
allm=sum(mins(r['id']) or 0 for r in bat);red=[r for r in bat if r['c']=='failure']
st_=collections.Counter(r['c'] for r in bat)
def info(r):
    J=json.load(open(f'{S}{r["id"]}.json'))['jobs'];su=set();oth=[]
    for j in J:
        if j['conclusion']in('failure','timed_out') and j['name']!='ci':
            if j['name'].startswith('shard ('):
                t=open(f'../logs/{j["id"]}',errors='replace').read();m=set(re.findall(r'\| (check_\S+) \| (?:FAIL|failed twice)',t))
                su|=m or {'?'+j['name']}
            else:oth.append(j['name'].split(' (')[0])
    t=r['t'];own=re.findall(r'#(\d+)',t.split(' on main')[0]);ah=re.findall(r'#(\d+)',t.split('stacked on')[1]) if 'stacked on' in t else []
    return su,oth,own,ah,bool(re.search(r'\d+ pull requests ahead',t)), re.search(r'on main \((\w+)\)',t)[1]
I={r['id']:info(r) for r in red}
MAIN={'check_fo3st3_types_browser.ts'};FL={'check_pf30s_find_box_browser.ts':'fixed race','check_c69_page_browser.cjs':'hyp','check_c92_out_of_date_browser.ts':'hyp','check_c41_section_order_browser.cjs':'hang'}
# a PR's own red: its suites red in an unstacked single-PR batch
own=collections.defaultdict(set)
for i,(su,o,p,a,x,m) in I.items():
    if len(p)==1 and not a and not x: own[p[0]]|=su
own['3216'] |= {'check_pff1c_catchup_walls.ts','check_pf4s_system_signin.ts'}
cls={}
for r in red:
    su,o,p,a,x,m=I[r['id']];rest=su-MAIN-set(FL)
    if not su: c='unclassified: no suite named (%s)'%','.join(o)
    elif not rest:
        c='main fault' if su<=MAIN else ('flake (fixed race or likely race)' if not su&MAIN else 'main fault and flake')
    elif any(s.startswith('?') for s in rest): c='unclassified: no suite name in log'
    elif x: c='unclassified: PRs ahead not named'
    elif len(p)==1 and not a: c='one PR alone (its own fault, or main or flake not seen)'
    elif any(rest<=own.get(q,set()) for q in p+a):
        c='one PR: same suites red when that PR ran alone' + (' (a PR ahead)' if not any(rest<=own.get(q,set()) for q in p) else '')
    elif rest<=set().union(*[own.get(q,set()) for q in p+a]): c='several PRs, each red suite seen red alone with one of them'
    else: c='several PRs, no PR shown red alone (combination, or not tested alone)'
    cls[r['id']]=c
g=collections.defaultdict(list)
for r in red:g[cls[r['id']]].append(r)
tm=sum(mins(r['id']) for r in red)
print('ci batches',len(bat),dict(st_),'all ci batch min',round(allm),'red n',len(red),'red min',round(tm))
for c,v in sorted(g.items(),key=lambda z:-len(z[1])):
    print(f'| {c} | {len(v)} | {round(sum(mins(r["id"]) for r in v))} | '+' '.join(str(r['id']) for r in sorted(v,key=lambda r:r['s'])))
# was "alone" suite also red in many different PRs -> maybe main
al=[r for r in red if cls[r['id']].startswith('one PR alone')]
sc=collections.defaultdict(set)
for r in al:
    for s in I[r['id']][0]:sc[s].add(I[r['id']][2][0])
print('alone suites by PRs',{s:sorted(v) for s,v in sc.items() if len(v)>1})
print('alone, has main+flake too',[(r['id'],sorted(I[r['id']][0])[:4]) for r in al if I[r['id']][0]&(MAIN|set(FL))])
for r in sorted(red,key=lambda r:r['s']): print(r['id'],'#'+'+'.join(I[r['id']][2]),'<-',','.join(I[r['id']][3]) or ('more' if I[r['id']][4] else '-'),sorted(I[r['id']][0])[:5],I[r['id']][1],'|',cls[r['id']][:40])
