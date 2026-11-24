#!/usr/bin/env python3
"""Replay arm 2, one file (Python standard library only).

  arm2.py prepare  <clone> <work>     builds the pinned samples into <work>/store.git (offline; about 20 MB), compares them with manifest.json
  arm2.py pin      <clone> <work>     the same, and WRITES manifest.json (done once, before review)
  arm2.py folders  <work> <out>       writes every slice's folder out for a reader to look at
  arm2.py selftest <work> <stub>      the run below against a pretend program; no network
  arm2.py run      <clone> <work> --founder-go "<his words>"     the 41 reviews; only the founder starts this

Each slice is one folder, <work>/current, made just before its review and deleted after it: two commits (the merged tree
with this slice's files as they were before the PR, then the merged tree), no remote, no other history, no link files,
code files only. CodeAnt's command line reads only inside that folder (its own path check); it is started as
`~/codeant-replay/run review --headless --base-commit HEAD~1 --include <the slice's files> --max-files 10`, nothing else.
Whole = JSON with no error, every file of the slice reviewed, none capped, and no "[error]" line. A slice with a whole
result is skipped on the next start. The run stops at once, and writes <work>/STOP, on anything naming an app, card, plan,
token or sign-in; on a changed sample, package or runner; on 3 unfinished slices in a row.
"""
import hashlib, json, os, re, shutil, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
ST = "ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio/"
CODE = re.compile(r"\.(ts|tsx|js|cjs|mjs|sql|prisma|css)$")
DROP = re.compile(r"(^|/)(tests/qa|acceptance|samples|evidence|screens|var|node_modules|dist)/|(^|/)\.|\.min\.(js|css)$")
VERSION, INTEGRITY = "0.5.17", "sha512-SoNXM6sbujFctuUxxljOo50JIqspxg5cXjp03mDm1NMZFqcGm+IAPQmVCdoI00m/G+IXCmqFNOCD1zEY27UcQQ=="
BASE = os.path.expanduser("~/codeant-replay")
RUNNER = '#!/bin/sh\nexec env -i HOME="$HOME/codeant-replay/home" PATH="$HOME/codeant-replay/bin:/usr/bin:/bin" GIT_CONFIG_GLOBAL=/dev/null CODEANT_TELEMETRY_DISABLED=1 TERM=xterm node "$HOME/codeant-replay/cli/node_modules/codeant-cli/src/index.js" "$@"'
TIMEOUT, PAUSE = 1800, 15
ASK = re.compile(r"log ?in|log ?out|sign ?(in|up)|authenticat|unauthori[sz]ed|forbidden|access denied|\b40[123]\b|upgrade|payment|billing|\bcard\b|\bplan\b|trial|subscri|quota|credits?\b|\blimit|\b429\b|token|api.?key|\bapp\b|install", re.I)
MASK = re.compile(r"(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_\w+|eyJ[\w-]{20,}\.[\w-]+\.[\w-]+|(?i:bearer)\s+\S+|(?i:api[-_ ]?key)\S*\s*[:=]\s*\S+)")
GENV = {"PATH": "/usr/bin:/bin", "HOME": "/nonexistent", "GIT_CONFIG_GLOBAL": "/dev/null", "GIT_CONFIG_NOSYSTEM": "1", "GIT_TERMINAL_PROMPT": "0", "GIT_LFS_SKIP_SMUDGE": "1",
        "GIT_AUTHOR_NAME": "sample", "GIT_AUTHOR_EMAIL": "sample@example.invalid", "GIT_COMMITTER_NAME": "sample", "GIT_COMMITTER_EMAIL": "sample@example.invalid",
        "GIT_AUTHOR_DATE": "2026-01-01T00:00:00Z", "GIT_COMMITTER_DATE": "2026-01-01T00:00:00Z"}


def git(d, *a, stdin=None, raw=False, **env):
    r = subprocess.run(["git", "-C", d, "-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", "-c", "core.autocrlf=false", "-c", "core.quotePath=false", "-c", "protocol.allow=never", "-c", "protocol.file.allow=always", *a],
                       capture_output=True, env={**GENV, **env}, input=stdin)
    if r.returncode:
        raise SystemExit(f"git {a[0]} failed in {d}: {r.stderr.decode(errors='replace')[:300]}")
    return r.stdout if raw else r.stdout.decode()


def tree(clone, ref):
    """path -> (mode, blob) of the code files of the app at a commit, as it stands in the public history."""
    out = {}
    for l in git(clone, "ls-tree", "-r", "-z", "--long", ref, "--", ST).split("\0"):
        if not l:
            continue
        meta, p = l.split("\t", 1); mode, typ, sha, size = meta.split()
        if typ == "blob" and mode in ("100644", "100755"):     # no link files, no submodules
            q = p[len(ST):] if p.startswith(ST) else p
            if CODE.search(q) and not DROP.search(q) and int(size) <= 400000:
                out[q] = ("100644", sha, p)
    return out


def build(clone, work):
    """Writes the 41 slices as refs of a bare repository; returns the manifest."""
    sample = json.load(open(os.path.join(HERE, "..", "sample.json")))
    store = os.path.join(work, "store.git"); shutil.rmtree(store, ignore_errors=True); os.makedirs(store)
    git(work, "init", "-q", "--bare", "--template=", store)
    blobs, man = set(), []
    plan = []
    for r in sample:
        if subprocess.run(["git", "-C", clone, "merge-base", "--is-ancestor", r["merge"], "refs/remotes/origin/main"], env=GENV).returncode:
            raise SystemExit(f"{r['id']}: its commit is not in the public main")
        head = tree(clone, r["merge"]); par = tree_any(clone, r["merge"] + "^1", [f for s in r["slices"] for f in s])
        hd = tree_any(clone, r["merge"], [f for s in r["slices"] for f in s])
        for s in r["slices"]:
            for f in s:
                q = f[len(ST):] if f.startswith(ST) else f
                assert CODE.search(q), f
                if hd.get(f): head[q] = ("100644", hd[f], f)
        blobs |= {v[1] for v in head.values()} | {b for b in par.values() if b}
        plan.append((r, head, par))
    pack = subprocess.run(["git", "-C", clone, "pack-objects", "--stdout", "-q"], input=("\n".join(sorted(blobs)) + "\n").encode(), capture_output=True, env=GENV)
    if pack.returncode: raise SystemExit(pack.stderr.decode()[:300])
    git(store, "unpack-objects", "-q", stdin=pack.stdout) if len(blobs) < 50 else git(store, "index-pack", "--stdin", "--fix-thin", stdin=pack.stdout)
    for r, head, par in plan:
        for n, s in enumerate(r["slices"], 1):
            rel = {(f[len(ST):] if f.startswith(ST) else f): f for f in s}
            assert 1 <= len(rel) <= 10
            base = dict(head)
            for q, f in rel.items():
                base.pop(q, None)
                if par.get(f): base[q] = ("100644", par[f], f)
            t = []
            for x in (base, head):
                idx = os.path.join(work, "idx"); 
                if os.path.exists(idx): os.remove(idx)
                git(store, "update-index", "-z", "--index-info", stdin="".join(f"{m} {b}\t{q}\0" for q, (m, b, _) in sorted(x.items())).encode(), GIT_INDEX_FILE=idx)
                t.append(git(store, "write-tree", GIT_INDEX_FILE=idx).strip()); os.remove(idx)
            c1 = git(store, "commit-tree", t[0], "-m", "before").strip(); c2 = git(store, "commit-tree", t[1], "-p", c1, "-m", "after").strip()
            name = f"{r['id']}-{n}"
            git(store, "update-ref", f"refs/heads/{name}", c2)
            got = sorted(git(store, "diff", "--name-only", "--no-renames", "-z", c1, c2).split("\0")[:-1])
            assert got == sorted(rel), (name, set(got) ^ set(rel))
            man.append({"slice": name, "files": got, "commit": c2, "tree_before": t[0], "tree_after": t[1], "files_in_folder": len(head)})
    assert len(man) == 41, len(man)
    return man


def tree_any(clone, ref, paths):
    out = {p: None for p in paths}
    for l in git(clone, "ls-tree", "-r", "-z", ref, "--", *paths).split("\0"):
        if l:
            meta, p = l.split("\t", 1); mode, typ, sha = meta.split()
            assert mode in ("100644", "100755"), (p, mode)
            out[p] = sha
    return out


def prepare(clone, work, pin=False):
    os.makedirs(work, exist_ok=True)
    man, f = build(clone, work), os.path.join(HERE, "manifest.json")
    if pin:
        json.dump(man, open(f, "w"), indent=1)
    if man != json.load(open(f)):
        raise SystemExit("the samples are not the reviewed ones (manifest.json)")
    print(f"41 slices match manifest.json; {sum(m['files_in_folder'] for m in man) // 41} files in a folder on average")
    return man


def folder(work, m, to):
    """One slice's folder: two commits, no remote, no other branch, no reflog."""
    shutil.rmtree(to, ignore_errors=True); os.makedirs(to)
    git(work, "init", "-q", "--template=", "-b", "sample", to)
    git(to, "fetch", "-q", "--no-tags", "--depth=2", os.path.join(work, "store.git"), m["slice"])
    git(to, "reset", "-q", "--hard", m["commit"])
    for x in ("FETCH_HEAD", "ORIG_HEAD", "shallow", "logs"):
        p = os.path.join(to, ".git", x)
        shutil.rmtree(p) if os.path.isdir(p) else os.path.exists(p) and os.remove(p)
    assert git(to, "rev-list", "--all", "--count").strip() == "2" and not git(to, "remote").strip()
    assert git(to, "rev-parse", "HEAD").strip() == m["commit"] and not git(to, "status", "--porcelain", "--ignored").strip()
    assert git(to, "rev-parse", "HEAD~1^{tree}").strip() == m["tree_before"] and git(to, "rev-parse", "HEAD^{tree}").strip() == m["tree_after"]
    for root, ds, fs in os.walk(to):
        assert not any(os.path.islink(os.path.join(root, x)) for x in ds + fs), root
    n = sum(len(fs) for root, _, fs in os.walk(to) if "/.git" not in root[len(to):])
    assert n == m["files_in_folder"], (n, m["files_in_folder"])


def package():
    lock = json.load(open(f"{BASE}/cli/package-lock.json"))["packages"]["node_modules/codeant-cli"]
    inst = json.load(open(f"{BASE}/cli/node_modules/codeant-cli/package.json"))["version"]
    if (lock.get("version"), lock.get("integrity"), inst) != (VERSION, INTEGRITY, VERSION):
        raise SystemExit("codeant-cli is not the pinned version and checksum")
    if open(f"{BASE}/run").read().strip() != RUNNER:
        raise SystemExit("~/codeant-replay/run is not the reviewed runner")
    for x in ("gh", "glab"):
        for p in (f"{BASE}/bin", "/usr/bin", "/bin"):
            if os.path.exists(os.path.join(p, x)):
                raise SystemExit(f"{x} is reachable from the runner")


def stop(work, why):
    open(os.path.join(work, "STOP"), "w").write(time.strftime("%Y-%m-%d %H:%M:%S %z ") + why + "\n")
    print("STOP:", why, flush=True); sys.exit(3)


def addresses(pgid):
    try:
        t = subprocess.run(["/usr/sbin/lsof", "-nP", "-a", "-i", "-g", str(pgid)], capture_output=True, text=True, timeout=10).stdout
        return set(re.findall(r"->(\S+)", t))
    except Exception:
        return set()


def asks(text, files):
    """A stop word in what the program says about itself, never in a file name or a progress line."""
    for l in text.splitlines():
        if re.match(r"\[(progress|files)\]", l):
            continue
        for f in sorted(files, key=len, reverse=True):
            l = l.replace(f, "")
        m = ASK.search(l)
        if m:
            return m.group(0)
    return None


def review(work, m, res, cmd, timeout):
    cur, n = os.path.join(work, "current"), m["slice"]
    folder(work, m, cur)
    args = [cmd, "review", "--headless", "--base-commit", "HEAD~1", "--include", ",".join(m["files"]), "--max-files", "10"]
    start, seen, late = time.time(), set(), False
    with open(f"{res}/{n}.stdout.part", "w+b") as fo, open(f"{res}/{n}.stderr.part", "w+b") as fe:
        p = subprocess.Popen(args, cwd=cur, stdin=subprocess.DEVNULL, stdout=fo, stderr=fe, start_new_session=True, env={"HOME": os.path.expanduser("~"), "PATH": "/usr/bin:/bin"})
        try:
            while p.poll() is None:
                if time.time() - start > timeout:
                    late = True; break
                seen |= addresses(p.pid); time.sleep(1)
        finally:
            if p.poll() is None:
                for sig in (15, 9):
                    try: os.killpg(p.pid, sig)
                    except ProcessLookupError: pass
                    try: p.wait(5); break
                    except subprocess.TimeoutExpired: pass
        texts = []
        for f in (fo, fe):
            f.seek(0); texts.append(MASK.sub("[masked]", f.read().decode(errors="replace")))
    out, err = texts
    for x in ("stdout", "stderr"): os.remove(f"{res}/{n}.{x}.part")
    open(f"{res}/{n}.stdout", "w").write(out); open(f"{res}/{n}.stderr", "w").write(err)
    try: j = json.loads(out)
    except ValueError: j = None
    ok = isinstance(j, dict) and isinstance(j.get("issues"), list) and isinstance(j.get("meta"), dict)
    reviewed = sorted(j["meta"].get("reviewed_files") or []) if ok else []
    whole = bool(ok and not late and p.returncode == 0 and j.get("error") is None and not j.get("noFiles") and not j["meta"].get("capped")
                 and reviewed == sorted(m["files"]) and not re.search(r"^\[error\]", err, re.M))
    said = err + "\n" + (str(j.get("error") or "") if isinstance(j, dict) else out)
    rec = {"slice": n, "whole": whole, "exit": p.returncode, "timed_out": late, "start": time.strftime("%Y-%m-%dT%H:%M:%S%z", time.localtime(start)),
           "end": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "seconds": round(time.time() - start, 1), "claims": len(j["issues"]) if ok else None, "files": m["files"], "reviewed": reviewed,
           "skipped": j["meta"].get("skipped") if ok else None, "planner_failed": "Risk planner failed" in err, "addresses": sorted(seen), "asks": None if whole else asks(said, m["files"]), "result": j if ok else None}
    tmp = f"{res}/{n}.json.tmp"; json.dump(rec, open(tmp, "w"), indent=1); os.replace(tmp, f"{res}/{n}.json")
    shutil.rmtree(cur, ignore_errors=True)
    return rec


def run(work, man, cmd, check=lambda: None, timeout=TIMEOUT, pause=PAUSE):
    if os.path.exists(os.path.join(work, "STOP")):
        raise SystemExit("not started: " + open(os.path.join(work, "STOP")).read() + "(remove STOP when the reason is settled)")
    lock = os.path.join(work, "RUNNING")
    try: os.close(os.open(lock, os.O_CREAT | os.O_EXCL))
    except FileExistsError: raise SystemExit(f"not started: another run holds {lock} (remove it if none is running)")
    res = os.path.join(work, "results"); os.makedirs(res, exist_ok=True)
    try:
        bad, t0 = 0, time.time()
        whole = lambda n: os.path.exists(f"{res}/{n}.json") and json.load(open(f"{res}/{n}.json"))["whole"]
        for i, m in enumerate(man, 1):
            if whole(m["slice"]):
                continue
            check()
            if shutil.disk_usage(work).free < 500 * 2**20:
                stop(work, "under 500 MB of disk left")
            rec = review(work, m, res, cmd, timeout)
            print(f"{i}/41 {m['slice']} {'whole' if rec['whole'] else 'NOT WHOLE'} claims={rec['claims']} {rec['seconds']:.0f}s", flush=True)
            if rec["asks"]:
                stop(work, f"{m['slice']} names: {rec['asks']} (read results/{m['slice']}.stderr)")
            bad = 0 if rec["whole"] else bad + 1
            if bad >= 3:
                stop(work, f"3 unfinished slices in a row, last {m['slice']}")
            time.sleep(pause)
        left = [m["slice"] for m in man if not whole(m["slice"])]
        print(f"finished: {41 - len(left)} of 41 whole, {(time.time() - t0) / 60:.0f} min; not whole: {left}")
        return 1 if left else 0
    finally:
        shutil.rmtree(os.path.join(work, "current"), ignore_errors=True)
        if os.path.exists(lock): os.remove(lock)


def main(a):
    mode = a[0] if a else ""
    if mode in ("prepare", "pin") and len(a) == 3:
        prepare(os.path.abspath(a[1]), os.path.abspath(a[2]), mode == "pin")
    elif mode == "folders" and len(a) == 3:
        for m in json.load(open(os.path.join(HERE, "manifest.json"))):
            folder(os.path.abspath(a[1]), m, os.path.join(os.path.abspath(a[2]), m["slice"]))
    elif mode == "selftest" and len(a) == 3:
        return run(os.path.abspath(a[1]), json.load(open(os.path.join(HERE, "manifest.json"))), os.path.abspath(a[2]), timeout=float(os.environ.get("ARM2_TIMEOUT", "20")), pause=0)
    elif mode == "run" and len(a) == 5 and a[3] == "--founder-go" and len(a[4].strip()) >= 3:
        work = os.path.abspath(a[2]); package(); man = prepare(os.path.abspath(a[1]), work)
        open(os.path.join(work, "FOUNDER-GO.txt"), "a").write(time.strftime("%Y-%m-%d %H:%M:%S %z ") + a[4] + "\n")
        return run(work, man, f"{BASE}/run", check=package)
    else:
        print(__doc__); return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
