#!/usr/bin/env python3
"""Pilot A (claude/lead-o2-pack, never merged): run one shard's suites K at a time on one machine. US$0, no model calls.
   python3 pack-run.py <shard> <of> <k> <out dir>
Each suite runs through run-suites.sh (its own isolated copy, port and database: one COPY_PREFIX per worker). Serial, after
the packed part: the R1 group, check_studio_browser.cjs and every plain suite on the shared demo database. No --retry, so a
red is never hidden. Prints PACK lines."""
import os, re, subprocess, sys, threading, time, queue
P = "ai-workers/problem-1-pathway-setup-and-form-filling"; RS = f"{P}/product/tools/run-suites.sh"; TESTS = f"{P}/prototype/studio/tests"
shard, of, k, out = sys.argv[1], sys.argv[2], int(sys.argv[3]), os.path.abspath(sys.argv[4])
os.makedirs(out, exist_ok=True)
PREFIXES = ["lead", "screens", "forms", "evidence"]   # run-suites.sh gives each of these its own port slot
assert 1 <= k <= len(PREFIXES)
deal = subprocess.run(["bash", RS, "--demo", "--skip-quarantined", "--shard", f"{shard}/{of}"], env={**os.environ, "PACK_DEAL": "1", "COPY_PREFIX": ""},
                      capture_output=True, text=True, check=True).stdout.split()
assert deal, "the shard's deal is empty"
def serial(f):
    if f in ("check_studio_browser.cjs", "check_runtime_r1a.ts"): return True
    try: t = open(f"{TESTS}/{f}").read()
    except FileNotFoundError: return True   # a suite outside tests/ (case engine, drafting guard): not judged, so serial
    usage = next((l for l in t.splitlines() if f"studio/tests/{f}" in l), "")
    if re.search(r"isolated\.sh [a-z0-9_]+ [0-9]+ start", usage) or re.search(r"\[port=\d+\] \[name=", usage): return False
    return bool(re.search(r"xr_studio_demo|DATABASE_URL|prisma", t))
ser = [f for f in deal if serial(f)]; par = [f for f in deal if f not in ser]
times = {}
for l in open(f"{P}/product/tools/suite-times.tsv"):
    a = l.rstrip("\n").split("\t")
    if not l.startswith("#") and len(a) > 1: times[a[0]] = a[1]
par.sort(key=lambda f: -float(times.get(f, 30)))
samples, done = [], threading.Event()
def cpu():
    v = [int(x) for x in open("/proc/stat").readline().split()[1:9]]; return sum(v), v[3] + v[4], v[7]
def mem():
    m = {l.split(":")[0]: int(l.split()[1]) for l in open("/proc/meminfo")}
    return (m["MemTotal"] - m["MemAvailable"]) / 1048576, (m["SwapTotal"] - m["SwapFree"]) / 1048576
def sample():
    a = cpu()
    while not done.wait(5):
        b = cpu(); d = b[0] - a[0]
        if d: samples.append(((1 - (b[1] - a[1]) / d), (b[2] - a[2]) / d, *mem()))
        a = b
lock, results = threading.Lock(), []
def one(f, prefix, tag="PACK"):
    t = time.time(); env = {**os.environ, "PACK_UNITS": f, "COPY_PREFIX": prefix, "COPY_CAP": "16", "SUITES_OUT": f"{out}/{tag}-{f}"}
    r = subprocess.run(["bash", RS, "--demo", "--skip-quarantined", "--shard", f"{shard}/{of}"], env=env, capture_output=True, text=True, stdin=subprocess.DEVNULL)
    rows = [l for l in r.stdout.splitlines() if l.startswith("| check_")]
    open(f"{out}/{tag}-{f}.txt", "w").write(r.stdout + r.stderr)
    with lock:
        for l in rows or [f"| {f} | FAIL | | no row, exit {r.returncode} |"]:
            c = [x.strip() for x in l.strip("|").split("|")]
            tag == "PACK" and results.append((c[0], c[1])); print(f"{tag} suite={c[0]} result={c[1].replace(' ', '_')} s={time.time()-t:.0f} why={'' if c[1] in ('PASS', 'quarantined') else c[-1][:140]}", flush=True)
        if r.returncode and all(x.split("|")[2].strip() in ("PASS", "quarantined") for x in rows): print(f"{tag} suite={f} result=EXIT_{r.returncode} s=0 why=non-zero exit with green rows", flush=True); tag == "PACK" and results.append((f, "FAIL"))
q = queue.Queue()
for f in par: q.put(f)
def worker(prefix):
    while True:
        try: f = q.get_nowait()
        except queue.Empty: return
        one(f, prefix)
threading.Thread(target=sample, daemon=True).start()
t0 = time.time(); ws = [threading.Thread(target=worker, args=(PREFIXES[i],)) for i in range(k)]
[w.start() for w in ws]; [w.join() for w in ws]; t1 = time.time(); ns = len(samples)
for f in ser: one(f, "")   # as CI runs them: no prefix
t2 = time.time(); done.set()
def stats(v): v = sorted(v); return (sum(v) / len(v), v[min(len(v) - 1, int(.95 * len(v)))], v[-1]) if v else (0, 0, 0)
n = os.cpu_count(); s = samples[:ns]   # the packed part only
c, m = stats([x[0] * n for x in s]), stats([x[2] for x in s])
red = sorted({a for a, b in results if b not in ("PASS", "quarantined", "skipped")})
print(f"PACK total k={k} shard={shard}/{of} cpus={n} packed_suites={len(par)} serial_suites={len(ser)} packed_min={(t1-t0)/60:.1f} serial_min={(t2-t1)/60:.1f} wall_min={(t2-t0)/60:.1f}"
      f" cpu_mean={c[0]:.2f} cpu_p95={c[1]:.2f} cpu_max={c[2]:.2f} steal_mean={stats([x[1] for x in s])[0]*100:.1f}% mem_mean={m[0]:.2f} mem_p95={m[1]:.2f} mem_max={m[2]:.2f} swap_max={stats([x[3] for x in s])[2]:.2f} red={','.join(red) or 'none'}")
print("PACK serial=" + ",".join(ser))
# Every red once more, alone on the now idle machine (founder, 23 Nov): shown as ALONE lines, never replacing the red.
for f in red:
    if f in deal: one(f, "", "ALONE")
    else: print(f"ALONE suite={f} result=NOT_RUN s=0 why=part of a group (its unit is not its own)")
