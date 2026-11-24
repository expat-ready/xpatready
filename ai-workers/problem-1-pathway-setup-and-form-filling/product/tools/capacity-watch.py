#!/usr/bin/env python3
"""Capacity (A348, founder 24 Nov), in the Lead's check. Never deletes or moves anything.
  standbys  under 2 standby Leads is an ACT. Only the Lead's list_sessions can count them, so the Lead passes
            LEAD_STANDBYS=<n> (as LEAD_CONTEXT); no value, or not a number, is an ACT.
  disk      under 7 GB free is an ACT: no session or lane copy can start (lane-preflight.sh's limit).
  exports   while under 10 GB is free: folders in /private/tmp/claude-<uid> (its own entries, and each session's scratchpad
            entries) over 100 MB, untouched 6 h or more, with "on remote: yes|no|unknown". Yes only when every file is a
            blob on an origin branch, or, for a git copy, its every commit is on origin and nothing is uncommitted,
            stashed or ignored except folders a rebuild makes (node_modules, dist, __pycache__). The Lead decides; this
            only lists. Read at most once an hour, at most 60 s; a listing cut short says so.
   LEAD_STANDBYS=2 python3 -I product/tools/capacity-watch.py --state DIR      exit 0; lead-watch.sh counts the ACT lines
Test: check-capacity-watch.sh."""
import argparse, json, os, shutil, stat, subprocess, sys, time
HERE = os.path.dirname(os.path.abspath(__file__)); REBUILT = {"node_modules", "dist", "__pycache__"}
MIN_STANDBYS, START_GB, LIST_GB, BIG, AGE_H, BUDGET = 2, 7, 10, 100 * 2**20, 6, 60
MAX_FILES = 20000


class Late(Exception):
    pass


def git(d, *a, inp=None, cap=30):
    r = subprocess.run(["git", "-c", "core.fsmonitor=false", "-C", d, *a], capture_output=True, text=True, input=inp, timeout=cap)
    if r.returncode:
        raise RuntimeError((r.stderr.strip() or "git failed").splitlines()[0][:80])
    return r.stdout


def walk(d, end, skip=()):
    """(path, lstat) of every file under d, links never followed."""
    st = os.lstat(d)
    if not stat.S_ISDIR(st.st_mode):
        yield d, st; return
    for base, dirs, files in os.walk(d):
        if time.time() > end:
            raise Late
        dirs[:] = [x for x in dirs if x not in skip]
        for n in files + [x for x in dirs if os.path.islink(os.path.join(base, x))]:
            p = os.path.join(base, n)
            try:
                yield p, os.lstat(p)
            except OSError:
                pass


def entries(root):
    for n in sorted(os.listdir(root)):
        p = os.path.join(root, n)
        yield p
        if n.startswith("-") and os.path.isdir(p):      # a session's folder: <path-as-name>/<session id>/scratchpad/*
            for s in sorted(os.listdir(p)):
                sp = os.path.join(p, s, "scratchpad")
                if os.path.isdir(sp) and not os.path.islink(sp):
                    for x in sorted(os.listdir(sp)):
                        yield os.path.join(sp, x)


def on_remote(d, repo, end):
    if os.path.exists(os.path.join(d, ".git")):
        if os.path.isfile(os.path.join(d, ".git")):
            return "unknown (a worktree of another copy)"
        dirty = [l for l in git(d, "status", "--porcelain", "--ignored", "--untracked-files=all").splitlines()
                 if not (l.startswith("!!") and set(l[3:].strip('"').split("/")) & REBUILT)]
        if dirty:
            return f"no ({len(dirty)} files not committed)"
        if git(d, "stash", "list").strip():
            return "no (it holds a stash)"
        heads = set(git(d, "for-each-ref", "--format=%(objectname)", "refs/heads", "refs/tags").split()) | set(git(d, "rev-parse", "HEAD").split())
        for c in heads:
            try:
                git(repo, "cat-file", "-e", c)
                if not git(repo, "branch", "-r", "--contains", c, "--list", "origin/*").strip():
                    return f"no (commit {c[:9]} is on no origin branch)"
            except RuntimeError:
                return f"no (commit {c[:9]} is on no origin branch)"
        return "yes"
    fs = list(walk(d, end, REBUILT))
    if len(fs) > MAX_FILES:
        return f"unknown ({len(fs)} files, over {MAX_FILES})"
    plain = [p for p, st in fs if stat.S_ISREG(st.st_mode) and "\n" not in p]
    odd = len(fs) - len(plain)
    have = git(repo, "hash-object", "--no-filters", "--stdin-paths", inp="\n".join(plain) + "\n").split() if plain else []
    blobs = {l.split(" ", 1)[0] for l in git(repo, "rev-list", "--objects", "--remotes=origin").splitlines()}
    miss = odd + sum(1 for h in have if h not in blobs)
    return "yes" if fs and not miss else f"no ({miss} of {len(fs)} files on no origin branch)"


def main():
    a = argparse.ArgumentParser(); a.add_argument("--state", required=True); a.add_argument("--root", default=f"/private/tmp/claude-{os.getuid()}")
    a.add_argument("--repo", default=os.path.join(HERE, "..", "..", "..", "..")); a.add_argument("--free-gb", type=float); a.add_argument("--now", type=float)
    a.add_argument("--budget", type=float, default=BUDGET); a.add_argument("--big", type=int, default=BIG)
    o = a.parse_args(); now = o.now or time.time()
    v = os.environ.get("LEAD_STANDBYS", "").strip()
    if not v.isdigit():
        print("ACT   capacity: standbys not given: run the check with LEAD_STANDBYS=<standby Leads in list_sessions>")
    elif int(v) < MIN_STANDBYS:
        print(f"ACT   capacity: {v} standby Lead{'s' * (v != '1')}, under {MIN_STANDBYS}: start the rest at the founder's next typed turn")
    gb = o.free_gb if o.free_gb is not None else shutil.disk_usage("/").free / 2**30
    if gb < START_GB:
        print(f"ACT   capacity: {gb:.1f} GB free, under {START_GB}: no session or lane copy can start")
    print(f"capacity standbys {v or '?'} · {gb:.1f} GB free")
    if gb >= LIST_GB:
        return
    f = os.path.join(o.state, "exports.json")
    try:
        c = json.load(open(f)); fresh = 0 <= now - c["t"] < 3600 and c["root"] == o.root
    except (OSError, ValueError, KeyError, TypeError):
        fresh = False
    if not fresh:
        end = time.time() + o.budget; lines, cut, listed = [], "", []
        try:
            for p in entries(o.root):
                if any(p.startswith(q + "/") for q in listed):
                    continue
                size, newest = 0, 0
                for _, st in walk(p, end):
                    size += st.st_blocks * 512; newest = max(newest, st.st_mtime)
                if os.path.basename(p).startswith("-") and os.path.dirname(p) == o.root.rstrip("/"):
                    continue   # a session's own folder: its scratchpad entries are read one by one
                if size < o.big or now - newest < AGE_H * 3600:
                    continue
                listed.append(p)
                try:
                    r = on_remote(p, o.repo, end)
                except Late:
                    r = "unknown (out of time)"
                except Exception as e:
                    r = f"unknown ({str(e)[:60]})"
                lines.append([size, f"{size / 2**20:.0f} MB, untouched {(now - newest) / 3600:.0f} h, on remote: {r}: {p}"])
        except Late:
            cut = f"the listing stopped after {o.budget:.0f} s: some folders were not read"
        c = {"t": now, "root": o.root, "lines": [l for _, l in sorted(lines, reverse=True)], "cut": cut}
        os.makedirs(o.state, exist_ok=True); json.dump(c, open(f + ".tmp", "w")); os.replace(f + ".tmp", f)
    if c["lines"]:
        print(f"ACT   capacity: {len(c['lines'])} old exports over {o.big // 2**20} MB (read {(now - c['t']) / 60:.0f} min ago; nothing is deleted here):")
        for l in c["lines"]:
            print("      export  " + l)
    if c["cut"]:
        print("ACT   capacity: " + c["cut"])


try:
    main()
except Exception as e:   # said, never a silent pass
    print(f"ACT   capacity: not measured ({type(e).__name__}: {str(e)[:120]})")
