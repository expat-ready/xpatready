import glob,re,json,statistics as st
pk={};red=[];src={}
for f in sorted(glob.glob('k-*.txt')):
  for l in open(f):
    if l.startswith('=='):
      r,s,k=map(int,re.search(r'pack \((\d), (\d+), (\d)',l).groups());con=l.split()[-3];src[k,s,r]=(f[2:-4],con)
    elif 'PACK total' in l:
      g=lambda n:float(re.search(n+r'=([\d.]+)',l)[1]); pk[k,s,r]=(g('wall_min'),g('cpu_mean'),g('mem_max'),g('swap_max'))
    elif l.strip(): red.append((k,s,r,l.strip()[:330]))
for s in (11,15,16,18,20,21,22):print(s,'serial',pk.get((1,s,1)),'k2',[pk.get((2,s,r)) for r in (1,2,3)])
for x in red:print(*x)
print(len(pk),len(src),[ (k,v) for k,v in src.items() if k not in pk or v[1]!='success'])
a=sum(pk[1,s,1][0] for s in (11,15,16,18,20,21,22) if (1,s,1) in pk)
for r in (1,2,3):print(r,sum(pk[2,s,r][0] for s in (11,15,16,18,20,21,22) if (2,s,r) in pk))
print('serial',a,'memmax',max(v[2] for v in pk.values()),'swap',max(v[3] for v in pk.values()))
