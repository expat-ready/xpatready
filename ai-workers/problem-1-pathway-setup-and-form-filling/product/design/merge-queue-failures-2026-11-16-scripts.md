# Scripts for `merge-queue-failures-2026-11-16.md` (B199 step 1)

These are kept here as records, word for word, so the page's numbers can be reproduced (P-557). An evidence copy may
not add files under `product/tools/`. Both scripts are read-only (GET only), and they use the cache folder that
`product/tools/merge-queue-causes.py --cache DIR` writes, including its `last-failed.json`. Run them from the
repository root:

```
python3 -I parts.py DIR 50
python3 -I replay.py DIR
```

To use them, copy each block below into its own file.

## parts.py: the parts of approved-to-merged time (§2)

```python
import json,os,re,subprocess,sys,statistics as st
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor
C=sys.argv[1]; _m=re.search(r"github\.com[:/]([^/]+/[^/.]+)|/git/([^/]+/[^/.]+)", subprocess.run(["git", "remote", "get-url", "origin"], capture_output=True, text=True).stdout); R=os.environ.get("GITHUB_REPOSITORY") or next(g for g in _m.groups() if g)  # owner/name, never written in a file
def get(p):
    k=os.path.join(C,re.sub(r"[^A-Za-z0-9]+","_",p)[:180]+'.json')
    if os.path.exists(k): s=open(k).read()
    else:
        s=subprocess.run(['curl','-sSL','--fail','https://api.github.com/'+p],capture_output=True,text=True).stdout
        if s: open(k,'w').write(s)
    return json.loads(s) if s else {}
t=lambda s: datetime.fromisoformat(s.replace('Z','+00:00'))
m=lambda a,b: (t(b)-t(a)).total_seconds()/60
prs=[]
for p in range(1,7): prs+= get(f"repos/{R}/pulls?state=closed&per_page=100&page={p}&sort=created&direction=desc") or []
batches=[x for x in prs if x['head']['ref'].startswith('mergify/merge-queue/')]
def mem(title):
    h=re.split(r" on main| together|: ",title.split('queue: ',1)[-1])[0]; return [int(n) for n in re.findall(r"#(\d+)",h)]
for b in batches: b['mem']=mem(b['title']); b['ok']=b['title'].startswith('merge queue: merged')
pool=ThreadPoolExecutor(8)
def run(b):
    ws=[w for w in get(f"repos/{R}/actions/runs?head_sha={b['head']['sha']}&per_page=50").get('workflow_runs',[]) if w['name']=='ci']
    return ws[0] if ws else None
for b,w in zip(batches,pool.map(run,batches)): b['run']=w
merged=[x for x in prs if x.get('merged_at') and not x['head']['ref'].startswith('mergify/')]
merged.sort(key=lambda x:x['merged_at'],reverse=True)
N=int(sys.argv[2]) if len(sys.argv)>2 else 50
rows=[]
def ev(n):
    e=[]; 
    for pg in (1,2,3):
        d=get(f"repos/{R}/issues/{n}/events?per_page=100&page={pg}") or []
        e+=d
        if len(d)<100: break
    return e
cand=merged[:N*2]
evs=dict(zip([x['number'] for x in cand],pool.map(lambda x:ev(x['number']),cand)))
for x in cand:
    n=x['number']
    L=[e['created_at'] for e in evs[n] if e.get('event')=='labeled' and (e.get('label') or {}).get('name')=='review: approved' and e['created_at']<=x['merged_at']]
    if not L: continue
    lab=max(L); lab0=min(L)
    mine=sorted([b for b in batches if n in b['mem'] and b['created_at']>=lab and b['created_at']<=x['merged_at']],key=lambda b:b['created_at'])
    fin=[b for b in mine if b['ok']]
    if not mine or not fin: continue
    f=fin[-1]; first=mine[0]
    ci=m(f['run']['run_started_at'],f['run']['updated_at']) if f['run'] else None
    tot=m(lab,x['merged_at'])
    a=m(lab,first['created_at']); r=m(first['created_at'],f['created_at']); c=m(f['created_at'],x['merged_at'])
    rows.append(dict(n=n,tot0=m(lab0,x['merged_at']),before=m(lab0,lab),relabels=len(L)-1,tot=tot,wait=a,rerun=r,final=c,ci=ci,tries=len(mine),records='records' in [l['name'] for l in x['labels']]))
    if len(rows)>=N: break
def q(v): v=sorted(v); return f"median {st.median(v):.0f}, p90 {v[int(0.9*(len(v)-1))]:.0f}, mean {st.mean(v):.0f}"
for name,sel in (("all",rows),("code",[r for r in rows if not r['records']]),("records",[r for r in rows if r['records']])):
    if not sel: continue
    print(f"## {name} n={len(sel)} (merged {merged[0]['merged_at'][:16]} back)")
    for k in ('tot0','before','tot','wait','rerun','final','ci'):
        v=[r[k] for r in sel if r[k] is not None]; print(f"  {k}: {q(v)}; sum {sum(v):.0f}")
    print("  tries>1:",sum(r['tries']>1 for r in sel),"labelled more than once:",sum(r['relabels']>0 for r in sel))
json.dump(rows,open(os.path.join(C,'parts.json'),'w'),indent=1)
```

## replay.py: part times of merged batches and suite selection for failed batches (§2, §3)

```python
# B199 §2–§3 replays on the cache merge-queue-causes.py wrote (--cache DIR): shard times of the newest 40 merged batches,
# and select-suites.mjs fed each failed batch's files. Usage (repository root): python3 -I replay.py DIR
import json, glob, os, re, subprocess, sys, statistics as st
from datetime import datetime
C = sys.argv[1]; _m = re.search(r"github\.com[:/]([^/]+/[^/.]+)|/git/([^/]+/[^/.]+)", subprocess.run(["git", "remote", "get-url", "origin"], capture_output=True, text=True).stdout); R = os.environ.get("GITHUB_REPOSITORY") or next(g for g in _m.groups() if g)
t = lambda s: datetime.fromisoformat(s.replace("Z", "+00:00"))
key = lambda p: os.path.join(C, re.sub(r"[^A-Za-z0-9]+", "_", p)[:180] + ".json")
def get(p):
    k = key(p)
    if not os.path.exists(k): open(k, "w").write(subprocess.run(["curl", "-sSL", "--fail", "https://api.github.com/" + p], capture_output=True, text=True).stdout)
    s = open(k).read(); return json.loads(s) if s else {}
prs = []
for p in range(1, 7): prs += get(f"repos/{R}/pulls?state=closed&per_page=100&page={p}&sort=created&direction=desc") or []
ok = sorted([x for x in prs if x["head"]["ref"].startswith("mergify/merge-queue/") and x["title"].startswith("merge queue: merged")], key=lambda x: x["created_at"], reverse=True)
rows = []
for b in ok:
    w = [r for r in get(f"repos/{R}/actions/runs?head_sha={b['head']['sha']}&per_page=50").get("workflow_runs", []) if r["name"] == "ci"]
    if not w: continue
    w = w[0]; jobs = get(f"repos/{R}/actions/runs/{w['id']}/jobs?per_page=50&filter=all").get("jobs", [])
    sh = [j for j in jobs if j["name"].startswith("shard") and j.get("completed_at") and j.get("started_at")]
    kind = [j for j in jobs if j["name"] == "kind" and j.get("completed_at")]
    if not sh or not kind: continue
    rows.append((max((t(j["completed_at"]) - t(j["started_at"])).total_seconds() / 60 for j in sh),
                 max((t(j["started_at"]) - t(kind[0]["completed_at"])).total_seconds() / 60 for j in sh),
                 (t(w["updated_at"]) - t(w["run_started_at"])).total_seconds() / 60))
    if len(rows) == 40: break
for i, n in enumerate(("longest part", "wait for a runner after kind", "run wall time")):
    v = [r[i] for r in rows]; print(f"{n}: n={len(v)} median {st.median(v):.1f} max {max(v):.1f}")
P = "ai-workers/problem-1-pathway-setup-and-form-filling/product"
for b in json.load(open(os.path.join(C, "last-failed.json"))):
    fs = set()
    for p in b["members"] + b["ahead"]: fs |= {f["filename"] for f in get(f"repos/{R}/pulls/{p}/files?per_page=100") or []}
    out = subprocess.run(["node", P + "/tools/select-suites.mjs"], input="\n".join(sorted(fs)) + "\n", capture_output=True, text=True).stdout.splitlines()
    sel = {l.split("\t")[0] for l in out}; full = bool(out) and out[0].startswith("ALL")
    hit = ["ALL" if full else ("yes" if s in sel else "NO") for s in b["suites"] if s.startswith("check_")]
    print(f"#{b['n']} chosen: {'ALL' if full else len(sel)} failing suite chosen: {hit or '-'}")
```
