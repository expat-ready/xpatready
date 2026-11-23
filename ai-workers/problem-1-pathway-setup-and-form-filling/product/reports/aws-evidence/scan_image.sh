#!/bin/bash
# R1.15: the running image's whole file system, environment and history searched for each xr/staging secret's value (counts only).
set -u; IMG=$1; export AWS_PAGER=; HERE=$(cd "$(dirname "$0")" && pwd); REG=${IMG%%/*}
aws ecr get-login-password | docker login --username AWS --password-stdin "$REG" 2>&1 | grep -i succeeded
docker pull -q "$IMG"; docker image inspect -f 'user={{.Config.User}} size={{.Size}}' "$IMG"
ID=$(docker create "$IMG")
{ docker image inspect "$IMG"; docker history --no-trunc "$IMG"; docker export "$ID"; } | python3 -I -c '
import importlib.util,sys
sp=importlib.util.spec_from_file_location("s",sys.argv[1]); m=importlib.util.module_from_spec(sp); sp.loader.exec_module(m)
sec={k:v for k,v in m.secrets().items()}; pat=[(k,x.encode()) for k,v in sec.items() if v for x in v]; cnt={k:0 for k in sec}; tot=0; tail=b""; K=8192
while True:
    b=sys.stdin.buffer.read(1<<22)
    if not b: break
    tot+=len(b); buf=tail+b
    for k,x in pat: cnt[k]+=buf.count(x)-tail.count(x)
    tail=buf[-K:]
print("bytes read",tot)
for k,v in sec.items(): print("secret",k,"placeholder: not scanned" if v is None else "hits %d"%cnt[k])
sys.exit(1 if any(cnt.values()) or tot<1000000 else 0)' "$HERE/scan_logs.py"; rc=$?
docker rm "$ID" >/dev/null; exit $rc
