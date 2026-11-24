#!/usr/bin/env python3
"""Replay arm 2, unattended: one CodeAnt command-line review per slice, one at a time, resumable.

  run_arm2.py check     <work>            offline: slices, pinned package, no token reachable. Starts no CodeAnt program.
  run_arm2.py madeup    <work>            the 2-file made-up sample only. Needs <work>/GO-MADEUP.
  run_arm2.py real      <work>            the 41 slices. Needs <work>/GO-C6 and a clean made-up result.
  run_arm2.py selftest  <work> <stub>     the same loop against a stub program given by path; no network.

GO files hold the founder's yes, word for word with its time, written by the tech lead; without one nothing starts.
The script never opens ~/codeant-replay/home. It calls ~/codeant-replay/run (env -i, no gh, no tokens, analytics off).
It stops by itself at: a sign-in, App, card, plan or token request in the output; 3 failures in a row; 2 timeouts in a row;
a slice whose diff is not the recorded one; a package that is not the pinned one. A stop writes <work>/STOP with the reason
and needs a person to remove it.
"""
import hashlib, json, os, re, subprocess, sys, time

VERSION = "0.5.17"
INTEGRITY = "sha512-SoNXM6sbujFctuUxxljOo50JIqspxg5cXjp03mDm1NMZFqcGm+IAPQmVCdoI00m/G+IXCmqFNOCD1zEY27UcQQ=="
BASE = os.path.expanduser("~/codeant-replay")
TIMEOUT, PAUSE = 1200, 20
# Words that mean a person must decide. Checked on stderr and on output that is not JSON, never inside a finding's text.
ASK = re.compile(r"log ?in|sign ?in|not authenticated|unauthori[sz]ed|\b401\b|\b402\b|\b403\b|upgrade|payment|billing|credit card|trial (has )?(ended|expired)|install (the )?(github )?app|subscription|quota|rate.?limit|\b429\b|token (is )?(required|missing)", re.I)
MASK = re.compile(r"(gh[pousr]_[A-Za-z0-9]{20,}|eyJ[\w-]{20,}\.[\w-]+\.[\w-]+|(?i:bearer)\s+\S+|(?i:api[-_ ]?key)\S*\s*[:=]\s*\S+)")

mode, work = sys.argv[1], os.path.abspath(sys.argv[2])
stub = os.path.abspath(sys.argv[3]) if mode == "selftest" else None
out = os.path.join(work, "results-selftest" if stub else "results-madeup" if mode == "madeup" else "results")


def stop(why):
    with open(os.path.join(work, "STOP-selftest" if stub else "STOP"), "w") as f:
        f.write(time.strftime("%Y-%m-%d %H:%M:%S %z ") + why + "\n")
    print("STOP:", why)
    sys.exit(3)


def git(d, *a):
    env = {"PATH": "/usr/bin:/bin", "HOME": work, "GIT_CONFIG_GLOBAL": "/dev/null", "GIT_CONFIG_NOSYSTEM": "1"}
    return subprocess.run(["git", "-C", d, "-c", "core.hooksPath=/dev/null", *a], capture_output=True, check=True, env=env, text=True).stdout


def slices():
    man = json.load(open(os.path.join(work, "manifest.json")))
    if len(man) != 41 or len({m["slice"] for m in man}) != 41 or any(len(m["files"]) > 10 for m in man):
        stop("the manifest is not 41 slices of at most 10 files")
    return man


def checkout(m):
    d = os.path.join(work, m["repo"])
    git(d, "checkout", "-q", "-f", m["branch"]); git(d, "clean", "-q", "-fdx")
    if git(d, "remote").strip():
        stop(f"{m['slice']}: the sample has a remote")
    if hashlib.sha256(git(d, "diff", "HEAD~1", "HEAD").encode()).hexdigest() != m["diff_sha256"]:
        stop(f"{m['slice']}: the diff is not the recorded one")
    return d


def package():
    lock = json.load(open(f"{BASE}/cli/package-lock.json"))["packages"]["node_modules/codeant-cli"]
    if lock.get("version") != VERSION or lock.get("integrity") != INTEGRITY:
        stop("codeant-cli is not the pinned version and checksum")
    if json.load(open(f"{BASE}/cli/node_modules/codeant-cli/package.json"))["version"] != VERSION:
        stop("the installed codeant-cli is not the pinned version")
    text = open(f"{BASE}/run").read()
    for need in ("env -i", "CODEANT_TELEMETRY_DISABLED=1", 'PATH="$HOME/codeant-replay/bin:/usr/bin:/bin"', "GIT_CONFIG_GLOBAL=/dev/null"):
        if need not in text:
            stop(f"the runner lost its isolation: {need}")
    if re.search(r"TOKEN|GH_|GITHUB_|API_KEY", text):
        stop("the runner names a token")
    for x in ("gh", "glab"):
        if any(os.path.exists(os.path.join(p, x)) for p in (f"{BASE}/bin", "/usr/bin", "/bin")):
            stop(f"{x} is reachable from the runner")


def madeup():
    """Two invented files with one planted fault; not our code."""
    d = os.path.join(work, "madeup")
    if os.path.isdir(os.path.join(d, ".git")):
        return d
    os.makedirs(d)
    env = {"PATH": "/usr/bin:/bin", "HOME": work, "GIT_CONFIG_GLOBAL": "/dev/null", "GIT_CONFIG_NOSYSTEM": "1", "GIT_AUTHOR_NAME": "sample", "GIT_AUTHOR_EMAIL": "sample@example.invalid", "GIT_COMMITTER_NAME": "sample", "GIT_COMMITTER_EMAIL": "sample@example.invalid"}
    run = lambda *a: subprocess.run(["git", "-C", d, *a], check=True, capture_output=True, env=env)
    run("init", "-q", "--template=", "-b", "main")
    open(f"{d}/cart.ts", "w").write("export const total = (xs: number[]) => xs.reduce((a, b) => a + b, 0);\n")
    open(f"{d}/price.ts", "w").write("export const withTax = (cents: number, rate: number) => Math.round(cents * (1 + rate));\n")
    run("add", "-A"); run("commit", "-q", "-m", "before")
    open(f"{d}/cart.ts", "w").write("export const total = (xs: number[]) => { let t = 0; for (let i = 0; i <= xs.length; i++) t += xs[i]; return t; };\n")
    open(f"{d}/price.ts", "w").write("export const withTax = (cents: number, rate: number) => cents + cents * rate;\n")
    run("add", "-A"); run("commit", "-q", "-m", "after")
    return d


def hosts(pid):
    """Best effort: remote addresses the review's processes hold open (addresses, not names)."""
    try:
        kids = subprocess.run(["pgrep", "-g", str(os.getpgid(pid))], capture_output=True, text=True).stdout.split()
        t = subprocess.run(["lsof", "-nP", "-a", "-i", "-p", ",".join(kids or [str(pid)])], capture_output=True, text=True, timeout=10).stdout
        return set(re.findall(r"->(\[?[0-9a-fA-F.:]+\]?:\d+)", t))
    except Exception:
        return set()


def review(d, name):
    cmd = [stub if stub else f"{BASE}/run", "review", "--headless", "--base-commit", "HEAD~1"]
    t0, seen = time.time(), set()
    fo, fe = open(f"{out}/{name}.out.part", "w+b"), open(f"{out}/{name}.err.part", "w+b")
    p = subprocess.Popen(cmd, cwd=d, stdin=subprocess.DEVNULL, stdout=fo, stderr=fe, start_new_session=True, env={"HOME": os.path.expanduser("~"), "PATH": "/usr/bin:/bin"})
    timed = False
    while p.poll() is None:
        if time.time() - t0 > TIMEOUT:
            timed = True
            os.killpg(p.pid, 15); time.sleep(3)
            if p.poll() is None:
                os.killpg(p.pid, 9)
            p.wait()
            break
        if not stub:
            seen |= hosts(p.pid)
        time.sleep(0.1 if stub else 2)
    text = []
    for f, ext in ((fo, "out"), (fe, "err")):
        f.flush(); f.seek(0); s = MASK.sub("[masked]", f.read().decode(errors="replace")); f.close()
        os.remove(f"{out}/{name}.{ext}.part"); text.append(s)
        open(f"{out}/{name}.{ext}", "w").write(s)
    try:
        j = json.loads(text[0])
    except ValueError:
        j = None
    # Documented: exit 0 nothing at the threshold, 1 something at it. Anything else, no JSON or a timeout is a failure.
    ok = not timed and p.returncode in (0, 1) and isinstance(j, dict) and isinstance(j.get("suggestions"), list)
    asks = None if ok and not ASK.search(text[1]) else ASK.search(text[1] + ("" if j is not None else text[0]) + (json.dumps({k: v for k, v in j.items() if k != "suggestions"}) if isinstance(j, dict) else ""))
    return {"slice": name, "ok": ok, "timeout": timed, "exit": p.returncode, "seconds": round(time.time() - t0, 1), "suggestions": len(j["suggestions"]) if ok else None,
            "skipped_warning": bool(re.search(r"skipp", text[1] + text[0] if j is None else text[1], re.I)), "ask": asks.group(0) if asks else None, "addresses": sorted(seen)}


def save(rec):
    tmp = f"{out}/{rec['slice']}.json.tmp"
    json.dump(rec, open(tmp, "w"), indent=1); os.replace(tmp, f"{out}/{rec['slice']}.json")
    print(rec["slice"], "ok" if rec["ok"] else "FAILED", rec["suggestions"], f"{rec['seconds']}s", "SKIPPED FILES" if rec["skipped_warning"] else "", flush=True)


def go(name):
    p = os.path.join(work, name)
    if not os.path.exists(p) or len(open(p).read().strip()) < 10:
        print(f"Not started: {name} is missing (the founder's yes, word for word, written by the tech lead).")
        sys.exit(2)


if mode not in ("check", "madeup", "real", "selftest"):
    sys.exit("check, madeup, real or selftest")
if os.path.exists(os.path.join(work, "STOP")) and mode in ("madeup", "real"):
    sys.exit("Not started: STOP exists: " + open(os.path.join(work, "STOP")).read())
if mode == "madeup":
    go("GO-MADEUP")
if mode == "real":
    go("GO-C6")
    r = os.path.join(work, "results-madeup", "madeup.json")
    if not os.path.exists(r) or not json.load(open(r))["ok"]:
        sys.exit("Not started: no clean made-up result yet.")
if mode != "selftest":
    if not os.path.isdir(f"{BASE}/cli"):
        sys.exit("Not started: the pinned package is not installed (C3).")
    package()
if mode == "madeup":
    os.makedirs(out, exist_ok=True)
    rec = review(madeup(), "madeup"); save(rec)
    if not rec["ok"] or rec["ask"]:
        stop(f"made-up run: exit {rec['exit']}, asks for: {rec['ask']}")
    print("Addresses seen:", rec["addresses"]); sys.exit(0)
man = slices()
if mode == "check":
    for m in man:
        checkout(m)
    print("check passed: 41 slices as recorded, package pinned, no token reachable; no CodeAnt program was started."); sys.exit(0)
os.makedirs(out, exist_ok=True)
bad = slow = 0
for m in man:
    done = f"{out}/{m['slice']}.json"
    if os.path.exists(done) and json.load(open(done))["ok"]:
        continue
    rec = review(checkout(m), m["slice"]); rec["files"] = m["files"]; save(rec)
    if rec["ask"]:
        stop(f"{m['slice']} asks for: {rec['ask']}")
    bad, slow = (0, 0) if rec["ok"] else (bad + 1, slow + 1 if rec["timeout"] else 0)
    if bad >= 3 or slow >= 2:
        stop(f"{m['slice']}: {bad} failures in a row, {slow} of them timeouts")
    time.sleep(0 if stub else PAUSE)
left = [m["slice"] for m in man if not (os.path.exists(f"{out}/{m['slice']}.json") and json.load(open(f"{out}/{m['slice']}.json"))["ok"])]
print(f"finished: {41 - len(left)} of 41 slices; not done: {left}")
sys.exit(1 if left else 0)
