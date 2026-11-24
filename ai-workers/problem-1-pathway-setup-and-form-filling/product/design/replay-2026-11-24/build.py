import subprocess,re,json,os,random,io,tarfile,sys
G='/Users/ranjansingh/Desktop/Xpatready/.claude/worktrees/friendly-gauss-dbd512'
OUT=os.path.dirname(os.path.abspath(__file__))
P='ai-workers/problem-1-pathway-setup-and-form-filling/'
ST=P+'prototype/studio/'
def run(*a,b=False):
    r=subprocess.run(['git','-C',G,*a],capture_output=True)
    return r.stdout if b else r.stdout.decode(errors='replace')
POS={356:['QA-397'],1760:['QA-453'],1910:['QA-499'],2011:['QA-510'],1823:['QA-517'],2253:['QA-520'],2268:['QA-526'],2214:['QA-595'],1824:['QA-601'],2029:['QA-608'],2814:['QA-701'],2922:['QA-750','QA-751'],3065:['QA-770']}
merges={}
for rec in run('log','origin/main','--first-parent','--since=2026-11-01','--until=2026-11-23T23:59:59Z','--format=%H%x1f%cI%x1f%s%x1f%b%x1e').split('\x1e'):
    f=rec.strip().split('\x1f')
    if len(f)<4: continue
    m=re.search(r'pull request #(\d+)',f[2])
    if m: merges[int(m[1])]=(f[0],f[1],f[3].strip().split('\n')[0])
def files(h):
    return [l for l in run('diff','--name-only','--diff-filter=ACMR',h+'^1',h).splitlines()
      if (l.startswith(ST) or l.startswith('packages/')) and re.search(r'\.(ts|tsx|cjs|mjs|js|sql|prisma)$',l) and '/tests/journeys/' not in l and '/acceptance/' not in l]
bugs=run('show','origin/main:'+P+'product/qa/BUGS.md')+run('show','origin/main:'+P+'product/qa/BUGS-CLOSED.md')
cited=set()
for l in bugs.splitlines():
    if l.startswith('| QA-') and re.search('Major|Critical|Blocker',l): cited|={int(x) for x in re.findall(r'#(\d{3,4})',l)}
info={}
for n,(h,d,t) in merges.items():
    if not re.search(r'\bruntime\b|\bscreens\b',t) or 'records' in t.lower() or 'concept' in t: continue
    fs=files(h)
    if any('/api/src/' in f for f in fs): info[n]=(h,d,t,fs)
missing=[n for n in POS if n not in info]; print('positives outside filter',missing)
for n in missing: h,d,t=merges[n]; info[n]=(h,d,t,files(h))
import datetime as dt
day=lambda s:dt.datetime.fromisoformat(s)
used=set(POS); ctrl={}
order=sorted(POS)
def pick(n,rank):
    h,d,t,fs=info[n]
    c=[(abs(len(info[m][3])-len(fs)),abs((day(info[m][1])-day(d)).total_seconds()),m) for m in info if m not in used and m not in cited and abs((day(info[m][1])-day(d)).total_seconds())<=4*86400 and 'QA-' not in info[m][2]]
    c.sort(); m=c[0][2]; used.add(m); ctrl[m]=n
for n in order: pick(n,0)
for n in (2922,3065): pick(n,1)   # 15 controls: 13 + 2 for the double-miss PR and the largest
allp=sorted(list(POS)+list(ctrl)); random.Random(20261124).shuffle(allp)
rows=[]
for i,n in enumerate(allp,1):
    sid=f'S{i:02d}'; h,d,t,fs=info[n]
    fs=sorted(fs,key=lambda f:('/tests/' in f,f)); slices=[fs[k:k+10] for k in range(0,len(fs),10)]
    rows.append(dict(id=sid,pr=n,merge=h,date=d[:10],title=t,files=len(fs),slices=slices,miss=POS.get(n,[]),matched=ctrl.get(n)))
json.dump(rows,open(OUT+'/sample.json','w'),indent=1)
for r in rows: print(r['id'],r['pr'],r['date'],r['files'],len(r['slices']),r['miss'] or ('ctrl for %s'%r['matched']),r['title'][:90])
print(len(rows),sum(len(r['slices']) for r in rows))
if 'cases' in sys.argv:
    ex=re.compile(r'/(tests/qa|acceptance|samples|evidence|screens|var)/|\.(png|jpg|jpeg|pdf|svg|woff2?|ico|gz|zip)$|/(MODULE[^/]*|[^/]*REVIEW)\.md$')
    for r in rows:
        D=f"{OUT}/cases/{r['id']}"; os.makedirs(D+'/repo',exist_ok=True)
        for which,ref in (('head',r['merge']),):
            data=run('archive','--format=tar',ref,ST.rstrip('/'),b=True)
            with tarfile.open(fileobj=io.BytesIO(data)) as T:
                for m in T.getmembers():
                    if not m.isfile() or ex.search('/'+m.name): continue
                    if m.size>400000: continue
                    rel=m.name[len(ST):]; dst=os.path.join(D,'repo',rel); os.makedirs(os.path.dirname(dst),exist_ok=True)
                    open(dst,'wb').write(T.extractfile(m).read())
        for k,s in enumerate(r['slices'],1):
            open(f'{D}/slice-{k}.diff','w').write(run('diff','-U12',r['merge']+'^1',r['merge'],'--',*s).replace(ST,''))
        # requirement text: the backlog row as main had it just before the PR, and any R1 capability row it names
        par=r['merge']+'^1'; ids=set(re.findall(r'\b(?:FO|PF|CS|AUD|BK|J|PQ|DEMO)-[A-Za-z]*\d+[a-z0-9]*\b|\bB\d{2,3}\b|\bC\d+\.\d+\b',r['title'])); rs=set(re.findall(r'R1\.\d+',r['title']))
        rs|={'R1.'+x for x in re.findall(r'(?:map|R1) row (\d+)',r['title'])}
        out=[]
        for f in run('ls-tree','-r','--name-only',par,P+'product').splitlines():
            if not re.search(r'product/(BACKLOG[^/]*|qa/CAPABILITIES)\.md$',f): continue
            for l in run('show',f'{par}:{f}').splitlines():
                m=re.match(r'\|\s*\**([A-Za-z0-9.\-]+)',l)
                if m and m[1].rstrip('.') in ids|rs: out.append(re.sub(r'QA-\d+','(a qa row)',l)[:3500])
        open(D+'/requirement.md','w').write(f"Change title: {re.sub(r'QA-[0-9]+','(a qa row)',r['title'])}\n\nRows this change is built to (as recorded before it):\n\n"+('\n\n'.join(out) or '(none found under the ids in the title)')+'\n')
        print(r['id'],len(out))
