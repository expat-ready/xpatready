#!/usr/bin/env python3
"""Replay arm 2, one file (Python standard library only).

  arm2.py prepare  <clone> <work>            builds the pinned samples into <work>/store.git (offline; about 20 MB) and compares them with manifest.json
  arm2.py pin      <clone> <work>            the same, and WRITES manifest.json (done once, before review)
  arm2.py folder   <work> <slice> <out>      writes one slice's folder to <out>/current for a reader
  arm2.py selftest <work> <stub>             the run below against a pretend program; no network
  arm2.py run      <clone> <work> --founder-go "<his words>"     the 41 reviews; only the founder starts this

Each slice is one folder, <work>/current, made just before its review and deleted after it: two commits (the merged tree
with this slice's files as they were before the PR, then the merged tree), no remote, no other history, no links, code
files only. The program's Read, LS and Grep are held to that folder by its own check; Grep can be made to compare an
outside file's lines with the sample (an answer of yes or no, not the text). It is started only as
`~/codeant-replay/run review --headless --base-commit HEAD~1 --include <the slice's files> --max-files 10`.
Whole = exit 0, JSON with no error, every file taken and finished, no failed part, planner or parsing error. A first whole
result counts; at most two attempts a slice, each kept. The run stops at once, and writes <work>/STOP, on anything naming
an app, card, plan, token or sign-in; on a changed sample, program or runner; on 3 unfinished slices in a row (a slice
refused for its size is noted and passed over).
"""
import hashlib, json, os, re, shutil, signal, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
ST = "ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio/"
CODE = re.compile(r"\.(ts|tsx|js|cjs|mjs|sql|prisma|css)$")
DROP = re.compile(r"(^|/)(tests/qa|acceptance|samples|evidence|screens|var|node_modules|dist)/|(^|/)\.|\.min\.(js|css)$")
VERSION, INTEGRITY = "0.5.17", "sha512-SoNXM6sbujFctuUxxljOo50JIqspxg5cXjp03mDm1NMZFqcGm+IAPQmVCdoI00m/G+IXCmqFNOCD1zEY27UcQQ=="
BASE = os.path.expanduser("~/codeant-replay")
RUNNER = '#!/bin/sh\nexec env -i HOME="$HOME/codeant-replay/home" PATH="$HOME/codeant-replay/bin:/usr/bin:/bin" GIT_CONFIG_GLOBAL=/dev/null CODEANT_TELEMETRY_DISABLED=1 TERM=xterm node "$HOME/codeant-replay/cli/node_modules/codeant-cli/src/index.js" "$@"'
TIMEOUT, PAUSE = 1800, 15
ASK = re.compile(r"log ?in|log ?out|sign ?(in|up)|authenticat|unauthori[sz]ed|forbidden|access denied|\b40[123]\b|upgrade|payment|billing|\bcard\b|\bplan\b|trial|subscri|quota|credits?\b|\blimit|\b429\b|token|api.?key|\bapp\b|install", re.I)
ASK_MORE = re.compile(r"\bseat|contact sales|expired|\brate\b|too many|monthly|exceeded|not (found|allowed|enabled)|organi[sz]ation|workspace", re.I)
SIZE = re.compile(r"too long|context (length|window)|maximum.*tokens|\b413\b|too large", re.I)
NODE, MODULES = "23.11.0", "41293274b62dd36268c70e51778e3adc7a2f6649f883dc3f04569fc539d0ab06"
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
        if subprocess.run(["git", "-C", clone, "-c", "protocol.allow=never", "merge-base", "--is-ancestor", r["merge"], "refs/remotes/origin/main"], env=GENV).returncode:
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
    pack = subprocess.run(["git", "-C", clone, "-c", "protocol.allow=never", "pack-objects", "--stdout", "-q"], input=("\n".join(sorted(blobs)) + "\n").encode(), capture_output=True, env=GENV)
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


def node_modules_sha():
    h = hashlib.sha256(); top = f"{BASE}/cli/node_modules"
    for root, ds, fs in os.walk(top):
        ds.sort()
        for x in sorted(fs):
            p = os.path.join(root, x); r = os.path.relpath(p, top)
            h.update((r + "\0" + (os.readlink(p) if os.path.islink(p) else hashlib.sha256(open(p, "rb").read()).hexdigest()) + "\n").encode())
    return h.hexdigest()


def package():
    lock = json.load(open(f"{BASE}/cli/package-lock.json"))["packages"]["node_modules/codeant-cli"]
    inst = json.load(open(f"{BASE}/cli/node_modules/codeant-cli/package.json"))["version"]
    if (lock.get("version"), lock.get("integrity"), inst) != (VERSION, INTEGRITY, VERSION):
        raise SystemExit("codeant-cli is not the pinned version and checksum")
    if node_modules_sha() != MODULES:
        raise SystemExit("the installed program files are not the reviewed ones")
    if NODE not in os.path.realpath(f"{BASE}/bin/node"):
        raise SystemExit(f"node is not {NODE}")
    if open(f"{BASE}/run").read().strip() != RUNNER:
        raise SystemExit("~/codeant-replay/run is not the reviewed runner")
    for x in ("gh", "glab"):
        for p in (f"{BASE}/bin", "/usr/bin", "/bin"):
            if os.path.exists(os.path.join(p, x)):
                raise SystemExit(f"{x} is reachable from the runner")


def own(work):
    """Only a folder this script made (it was empty then) is ever written to or deleted in."""
    os.makedirs(work, mode=0o700, exist_ok=True)
    mark = os.path.join(work, ".arm2")
    if not os.path.exists(mark):
        if os.listdir(work):
            raise SystemExit(f"{work} is not empty and not this script's folder; nothing was touched")
        open(mark, "w").write("made by arm2.py\n")
    return work


def again(f, *a, **k):
    """A passing operating-system fault (no process, no memory) is waited out, three times."""
    for i in range(4):
        try:
            return f(*a, **k)
        except (BlockingIOError, MemoryError, TimeoutError, InterruptedError):
            if i == 3: raise
            time.sleep(60)


def stop(work, why):
    open(os.path.join(work, "STOP"), "w").write(time.strftime("%Y-%m-%d %H:%M:%S %z ") + why + "\n")
    print("STOP:", why, flush=True); sys.exit(3)


def addresses(pgid):
    try:
        t = subprocess.run(["/usr/sbin/lsof", "-nP", "-a", "-i", "-g", str(pgid)], capture_output=True, text=True, timeout=10).stdout
        return set(re.findall(r"->(\S+)", t))
    except Exception:
        return set()


def alive(pid):
    try: os.kill(pid, 0); return True
    except ProcessLookupError: return False
    except PermissionError: return True


def end_group(pgid):
    for sig in (signal.SIGTERM, signal.SIGKILL):
        try: os.killpg(pgid, sig)
        except (ProcessLookupError, PermissionError): return
        for _ in range(50):
            time.sleep(0.1)
            try: os.killpg(pgid, 0)
            except (ProcessLookupError, PermissionError): return


def take_lock(work):
    lock = os.path.join(work, "RUNNING")
    for _ in range(2):
        try:
            with os.fdopen(os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY), "w") as f: f.write(json.dumps({"pid": os.getpid(), "child": None}))
            return lock
        except FileExistsError:
            try: old = json.load(open(lock))
            except ValueError: raise SystemExit(f"not started: {lock} cannot be read; look whether a run is going")
            if alive(old["pid"]):
                raise SystemExit(f"not started: another run is going (process {old['pid']})")
            c = old.get("child")          # a run that died: end its orphan, only if it is still ours by name
            if c:
                name = "\n".join(l for l in subprocess.run(["/bin/ps", "-axo", "pgid=,command="], capture_output=True, text=True).stdout.splitlines() if l.split()[:1] == [str(c)])
                if "codeant" in name or "stub.py" in name: end_group(c)
            os.remove(lock)
    raise SystemExit("not started: the lock changed hands")


def mask(x):
    if isinstance(x, str): return MASK.sub("[masked]", x)
    if isinstance(x, list): return [mask(v) for v in x]
    if isinstance(x, dict): return {k: mask(v) for k, v in x.items()}
    return x


def asks(text):
    """A stop word in what the program says about itself: never a file name, a progress line or a size refusal."""
    for l in text.splitlines():
        if re.match(r"\[(progress|files)\]", l) or SIZE.search(l):
            continue
        l = re.sub(r"\S+\.(tsx?|[cm]?js|sql|prisma|css)\b", "", l)
        m = ASK.search(l) or (ASK_MORE.search(l) if re.match(r"(API Error:|\[error\])", l) else None)
        if m:
            return m.group(0)
    return None


def review(work, lock, m, res, cmd, timeout, attempt):
    cur, n = os.path.join(work, "current"), m["slice"]
    again(folder, work, m, cur)
    args = [cmd, "review", "--headless", "--base-commit", "HEAD~1", "--include", ",".join(m["files"]), "--max-files", "10"]
    stamp, start, seen, late = time.strftime("%Y-%m-%dT%H:%M:%S%z"), time.monotonic(), set(), False
    parts = [os.path.join(work, "part.out"), os.path.join(work, "part.err")]
    with open(parts[0], "w+b") as fo, open(parts[1], "w+b") as fe:
        p = again(subprocess.Popen, args, cwd=cur, stdin=subprocess.DEVNULL, stdout=fo, stderr=fe, start_new_session=True, env={"HOME": os.path.expanduser("~"), "PATH": "/usr/bin:/bin"})
        open(lock, "w").write(json.dumps({"pid": os.getpid(), "child": p.pid}))
        try:
            while p.poll() is None:
                if time.monotonic() - start > timeout:
                    late = True; break
                seen |= addresses(p.pid); time.sleep(1)
        finally:
            if p.poll() is None:
                keep = signal.signal(signal.SIGINT, signal.SIG_IGN)     # a second Ctrl-C never leaves the child behind
                end_group(p.pid); p.wait(); signal.signal(signal.SIGINT, keep)
            open(lock, "w").write(json.dumps({"pid": os.getpid(), "child": None}))
        texts = []
        for f in (fo, fe):
            f.seek(0); texts.append(f.read().decode(errors="replace"))
    out, err = texts
    for x in parts: os.remove(x)
    try: j = json.loads(out)
    except ValueError: j = None
    for x, t in (("stdout", out), ("stderr", err)): open(f"{res}/{n}.{attempt}.{x}", "w").write(mask(t))
    ok = isinstance(j, dict) and isinstance(j.get("issues"), list) and isinstance(j.get("meta"), dict)
    want = sorted(m["files"])
    done = sorted({f.strip() for l in re.findall(r"^\[progress\] Done reviewing (.+)$", err, re.M) for f in l.split(", ")})
    had = re.findall(r"^\[progress\] (\d+) files? have suggestions", err, re.M)
    why = [w for w, bad in (("no JSON", not ok), ("timed out", late), (f"exit {p.returncode}", p.returncode != 0), ("error in the JSON", isinstance(j, dict) and j.get("error") is not None),
           ("no files", isinstance(j, dict) and bool(j.get("noFiles"))), ("capped", ok and bool(j["meta"].get("capped"))), ("not all files taken", ok and sorted(j["meta"].get("reviewed_files") or []) != want),
           ("not all files finished", done != want), ("a part failed", bool(re.search(r"^\[error\]", err, re.M))), ("planner failed", "Risk planner failed" in err), ("parsing error", "parsing error" in err)) if bad]
    said = err + "\n" + ("[error] " + str(j["error"]) if isinstance(j, dict) and j.get("error") else "" if isinstance(j, dict) else out[:2000])
    rec = {"slice": n, "attempt": attempt, "whole": not why, "not_whole_because": why, "size_failure": bool(SIZE.search(said)), "exit": p.returncode, "start": stamp, "end": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
           "seconds": round(time.monotonic() - start, 1), "claims": len(j["issues"]) if ok else None, "files_with_suggestions_before_its_own_filter": int(had[-1]) if had else None, "files": want,
           "skipped": j["meta"].get("skipped") if ok else None, "addresses": sorted(seen), "asks": asks(said) if why else None, "result": mask(j) if ok else None}
    tmp = f"{res}/{n}.{attempt}.json.tmp"; json.dump(rec, open(tmp, "w"), indent=1); os.replace(tmp, f"{res}/{n}.{attempt}.json")
    shutil.rmtree(cur, ignore_errors=True)
    return rec


def run(work, get_man, cmd, check=lambda: None, timeout=TIMEOUT, pause=PAUSE):
    if os.path.exists(os.path.join(work, "STOP")):
        raise SystemExit("not started: " + open(os.path.join(work, "STOP")).read() + "(remove STOP when the reason is settled)")
    def quit_(*_): raise KeyboardInterrupt
    signal.signal(signal.SIGTERM, quit_); signal.signal(signal.SIGHUP, quit_)
    lock = take_lock(work)
    try:
        for x in ("part.out", "part.err", "current"):          # leftovers of a run that died
            p = os.path.join(work, x); shutil.rmtree(p, ignore_errors=True) if os.path.isdir(p) else os.path.exists(p) and os.remove(p)
        check(); man = get_man()
        res = os.path.join(work, "results"); os.makedirs(res, exist_ok=True)
        past = lambda n: [json.load(open(f"{res}/{n}.{k}.json")) for k in (1, 2) if os.path.exists(f"{res}/{n}.{k}.json")]
        settled = lambda n: any(r["whole"] for r in past(n)) or len(past(n)) >= 2
        bad, t0 = 0, time.monotonic()
        for i, m in enumerate(man, 1):
            if settled(m["slice"]):
                continue
            check()
            if shutil.disk_usage(work).free < 500 * 2**20:
                stop(work, "under 500 MB of disk left")
            rec = review(work, lock, m, res, cmd, timeout, len(past(m["slice"])) + 1)
            print(f"{i}/41 {m['slice']} {'whole' if rec['whole'] else 'NOT WHOLE: ' + '; '.join(rec['not_whole_because'])} claims={rec['claims']} {rec['seconds']:.0f}s", flush=True)
            if rec["asks"]:
                stop(work, f"{m['slice']} names: {rec['asks']} (read results/{m['slice']}.{rec['attempt']}.stderr)")
            bad = 0 if rec["whole"] else bad if rec["size_failure"] else bad + 1
            if bad >= 3:
                stop(work, f"3 unfinished slices in a row, last {m['slice']}")
            time.sleep(pause)
        w = [m["slice"] for m in man if any(r["whole"] for r in past(m["slice"]))]
        print(f"finished: {len(w)} of 41 whole, {(time.monotonic() - t0) / 60:.0f} min; not whole: {[m['slice'] for m in man if m['slice'] not in w]}")
        return 0 if len(w) == 41 else 1
    finally:
        shutil.rmtree(os.path.join(work, "current"), ignore_errors=True)
        if os.path.exists(lock): os.remove(lock)


def main(a):
    mode, pinned = a[0] if a else "", lambda: json.load(open(os.path.join(HERE, "manifest.json")))
    if mode in ("prepare", "pin") and len(a) == 3:
        prepare(os.path.abspath(a[1]), own(os.path.abspath(a[2])), mode == "pin")
    elif mode == "folder" and len(a) == 4:
        folder(own(os.path.abspath(a[1])), next(m for m in pinned() if m["slice"] == a[2]), os.path.join(own(os.path.abspath(a[3])), "current"))
    elif mode == "selftest" and len(a) == 3:
        return run(own(os.path.abspath(a[1])), pinned, os.path.abspath(a[2]), timeout=float(os.environ.get("ARM2_TIMEOUT", "20")), pause=0)
    elif mode == "run" and len(a) == 5 and a[3] == "--founder-go" and len(a[4].strip()) >= 3:
        work = os.path.abspath(a[2])
        if os.path.realpath(work).startswith(os.path.realpath(os.path.expanduser("~"))):
            raise SystemExit("the work folder must be outside the home folder (its path is sent): use /Users/Shared/arm2")
        own(work); open(os.path.join(work, "FOUNDER-GO.txt"), "a").write(time.strftime("%Y-%m-%d %H:%M:%S %z ") + a[4] + "\n")
        return run(work, lambda: prepare(os.path.abspath(a[1]), work), f"{BASE}/run", check=package)
    else:
        print(__doc__); return 2


if __name__ == "__main__":
    try: sys.exit(main(sys.argv[1:]))
    except KeyboardInterrupt: sys.exit("stopped by a person or a closed window; start it again to go on")
