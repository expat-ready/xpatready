import json,glob,re,statistics as st
from datetime import datetime as D
d=lambda a,b:(D.fromisoformat(b[:-1])-D.fromisoformat(a[:-1])).total_seconds()/60
base={}
for f in glob.glob('base*.json'):
  for j in json.load(open(f))['jobs']:
    m=re.fullmatch(r'shard \((\d+)\)',j['name'])
    if m and j.get('completed_at') and j['conclusion']=='success':
      s=max(j['steps'],key=lambda x:d(x['started_at'],x['completed_at']) if x['completed_at'] and x['started_at'] else 0)
      base.setdefault(int(m[1]),[]).append(d(s['started_at'],s['completed_at']))
pk={};step={};job={};ser={};cpu={}
for f in glob.glob('read-*.txt'):
  for l in open(f):
    if l.startswith('=='):
      r,s=map(int,re.search(r'pack \((\d), (\d+)',l).groups())
    if 'PACK total' in l:
      pk[s,r]=float(re.search(r'wall_min=([\d.]+)',l)[1]);ser[s,r]=float(re.search(r'serial_min=([\d.]+)',l)[1]);cpu[s,r]=float(re.search(r'mem_max=([\d.]+)',l)[1])
for f in glob.glob('run*.json'):
  for j in json.load(open(f))['jobs']:
    m=re.match(r'pack \((\d), (\d+)',j['name'])
    if not m:continue
    r,s=map(int,m.groups());job[s,r]=d(j['started_at'],j['completed_at'])
    for x in j['steps']:
      if x['name'].startswith('the shard'):step[s,r]=d(x['started_at'],x['completed_at'])
tb=tk=0
for s in range(1,25):
  k=[pk.get((s,r)) for r in (1,2,3)]; kk=[x for x in k if x]; b=base.get(s,[0]); tb+=st.mean(b);tk+=st.mean(kk)
  print(f"| {s} | {st.mean(b):.1f} ({min(b):.1f}-{max(b):.1f}, n={len(b)}) | "+' | '.join(f'{x:.1f}' if x else '-' for x in k)+f' | {st.mean(kk):.1f} | {st.mean(b)/st.mean(kk):.2f} |')
print(tb,tk,tb/tk,len(pk),len(job),len(step)); print('job min total',sum(job.values()),'mean',st.mean(job.values()),'max wall',max(pk.values()),'memmax',max(cpu.values()),'serial mean',st.mean(ser.values()))
for r in (1,2,3):print(r,sum(v for (s,q),v in pk.items() if q==r), max(v for (s,q),v in pk.items() if q==r), sum(v for (s,q),v in job.items() if q==r))
