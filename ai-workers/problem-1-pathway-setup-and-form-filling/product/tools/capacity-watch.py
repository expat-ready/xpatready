#!/usr/bin/env python3
"""Capacity (A348, founder 24 Nov), in the Lead's check. Never deletes or moves anything.
  standbys  under 2 standby Leads is an ACT. Only the Lead's list_sessions can count them, so the Lead passes
            LEAD_STANDBYS=<n> (as LEAD_CONTEXT); no value, or not a number, is an ACT.
  disk      under 7 GB free is an ACT: no session or lane copy can start (lane-preflight.sh's limit).
  exports   while under 10 GB is free: folders in /private/tmp/claude-<uid> (its own entries, each session's folders, each
            scratchpad's entries) over 100 MB, untouched 6 h or more (no file or folder in it written or put there since),
            with "on remote: yes|no|unknown". Yes only when every file in it, with no exception, is a blob reachable from a
            branch GitHub lists right now (git ls-remote, never a kept local copy of a deleted branch). A git copy, a folder
            that cannot be read whole, and a remote that cannot be asked are "unknown": look by hand. The Lead decides;
            this only lists. Read at most once an hour, about 60 s; a listing cut short says so.
   LEAD_STANDBYS=2 python3 -I product/tools/capacity-watch.py --state DIR      exit 0; lead-watch.sh counts the ACT lines
Test: check-capacity-watch.sh."""
import argparse, json, os, shutil, stat, subprocess, sys, time
HERE = os.path.dirname(os.path.abspath(__file__))
MIN_STANDBYS, START_GB, LIST_GB, BIG, AGE_H, BUDGET = 2, 7, 10, 100 * 2**20, 6, 60
MAX_FILES = 20000


class Late(Exception):
    pass


def git(d, *a, inp=None, cap=30):
    r = subprocess.run(["git", "-c", "core.fsmonitor=false", "-C", d, *a], capture_output=True, text=True, input=inp, timeout=cap)
    if r.returncode:
        raise RuntimeError((r.stderr.strip() or "git failed").splitlines()[0][:80])
    return r.stdout


def walk(d, end):
    """(path, lstat) of everything under d, folders and d itself included, links never followed. An entry that cannot be
    read raises, so the caller never calls a folder whole that it did not read."""
    def stop(e):
        raise e
    yield d, os.lstat(d)
    for base, dirs, files in os.walk(d, onerror=stop):
        if time.time() > end:
            raise Late
        for n in dirs + files:
            p = os.path.join(base, n)
            yield p, os.lstat(p)


def entries(root):
    """The folders judged one by one, never one inside another."""
    for n in sorted(os.listdir(root)):
        p = os.path.join(root, n)
        if not (n.startswith("-") and os.path.isdir(p) and not os.path.islink(p)):
            yield p; continue
        for s in sorted(os.listdir(p)):      # a session's folder: <path as a name>/<session id>/<entry>, scratchpad opened too
            sp = os.path.join(p, s)
            for x in sorted(os.listdir(sp)) if os.path.isdir(sp) and not os.path.islink(sp) else []:
                q = os.path.join(sp, x)
                if x == "scratchpad" and os.path.isdir(q) and not os.path.islink(q):
                    yield from (os.path.join(q, y) for y in sorted(os.listdir(q)))
                else:
                    yield q


def remote_blobs(repo):
    """Every object reachable from the branches GitHub lists now, as far as this copy holds them."""
    tips = {l.split("\t")[0] for l in git(repo, "ls-remote", "--heads", "origin").splitlines()}
    have = [c for c in tips if c] and [l.split()[0] for l in git(repo, "cat-file", "--batch-check", inp="\n".join(sorted(tips)) + "\n").splitlines() if l.endswith(" missing") is False]
    if not have:
        raise RuntimeError("no branch of the remote is in this copy")
    return {l.split(" ", 1)[0] for l in git(repo, "rev-list", "--objects", "--stdin", inp="\n".join(have) + "\n", cap=60).splitlines()}


def on_remote(d, repo, end, blobs):
    all_ = list(walk(d, end))
    if any(os.path.basename(p) == ".git" for p, _ in all_):
        return "unknown (a git copy: look by hand)"
    fs = [(p, st) for p, st in all_ if not stat.S_ISDIR(st.st_mode)]
    if len(fs) > MAX_FILES:
        return f"unknown ({len(fs)} files, over {MAX_FILES})"
    plain = [p for p, st in fs if stat.S_ISREG(st.st_mode) and "\n" not in p]
    have = git(repo, "hash-object", "--no-filters", "--stdin-paths", inp="\n".join(plain) + "\n").split() if plain else []
    if len(have) != len(plain):
        return "unknown (not every file could be read)"
    known = blobs()
    miss = len(fs) - len(plain) + sum(1 for h in have if h not in known)
    return "yes" if fs and not miss else f"no ({miss} of {len(fs)} files on no branch of the remote)"


def main():
    a = argparse.ArgumentParser(); a.add_argument("--state", required=True); a.add_argument("--root", default=f"/private/tmp/claude-{os.getuid()}")
    a.add_argument("--repo", default=os.path.join(HERE, "..", "..", "..", "..")); a.add_argument("--free-gb", type=float); a.add_argument("--now", type=float)
    a.add_argument("--budget", type=float, default=BUDGET); a.add_argument("--big", type=int, default=BIG)
    a.add_argument("--age", type=float, default=AGE_H)
    o = a.parse_args(); now = o.now or time.time()
    v = os.environ.get("LEAD_STANDBYS", "").strip()
    if not (v.isascii() and v.isdigit()):
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
        end = time.time() + o.budget; lines, cut, memo = [], "", []

        def blobs():
            if not memo:
                memo.append(remote_blobs(o.repo))
            return memo[0]
        try:
            for p in entries(o.root):
                size, newest, why = 0, 0, ""
                try:
                    for _, st in walk(p, end):
                        size += st.st_blocks * 512; newest = max(newest, st.st_mtime, st.st_ctime)
                except FileNotFoundError:
                    continue   # gone, or changing, while it was read: not an old export
                except OSError as e:
                    why = f"unknown (part of it cannot be read: {type(e).__name__})"
                if (size < o.big and not why) or now - newest < o.age * 3600:
                    continue
                try:
                    r = why or on_remote(p, o.repo, end, blobs)
                except Late:
                    r = "unknown (out of time)"
                except Exception as e:
                    r = f"unknown ({type(e).__name__}: {str(e)[:60]})"
                lines.append([size, f"{size / 2**20:.0f} MB, untouched {(now - newest) / 3600:.0f} h, on remote: {r}: {p}"])
        except Late:
            cut = f"the listing stopped after {o.budget:.0f} s: some folders were not read"
        c = {"t": now, "root": o.root, "lines": [l for _, l in sorted(lines, reverse=True)], "cut": cut}
        os.makedirs(o.state, exist_ok=True); json.dump(c, open(f + ".tmp", "w")); os.replace(f + ".tmp", f)
    if c["lines"]:
        print(f"ACT   capacity: {len(c['lines'])} old exports over {o.big // 2**20} MB (read {(now - c['t']) / 60:.0f} min ago; look again before any removal; nothing is removed here):")
        for l in c["lines"]:
            print("      export  " + l)
    if c["cut"]:
        print("ACT   capacity: " + c["cut"])


try:
    main()
except Exception as e:   # said, never a silent pass
    print(f"ACT   capacity: not measured ({type(e).__name__}: {str(e)[:120]})")
