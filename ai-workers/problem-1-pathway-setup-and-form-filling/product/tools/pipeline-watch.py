#!/usr/bin/env python3
"""Pipeline watch (OS-84; tech lead 26 Nov, founder ask A400: "every watcher must run inside the pipeline, not only in a
Lead session"). Run by .github/workflows/pipeline-watch.yml (main's copy) every 10 minutes and on a merge to main, a ci run
on main and a PR comment. It runs the Lead's existing detectors against GitHub and writes no detection of its own:
  sle    sle-watch.py, its Q target only ("MISS  Q #n: question for the tech lead unanswered ...");
  proof  proof-read-watch.py (a merged Completes: row with no qa PR; an approved PR waiting on the Lead's read);
  wake   merge-wake.py --post (it posts its own wake comments, OS-49; its ACT lines are posted here);
  owed   owed-watch.py starts (STATE.md) and, only when the board's data.json is in the checkout, lanes.
Each ACT goes as one line of a comment on every PR it names ("#n"): a cloud lane is subscribed to its own PR, so the
comment wakes it, as OS-49 does; the tech lead reads PR comments. Several acts for one PR go in one comment, one line
each. An act names no PR (owed starts, lanes): it goes to the job summary only.
No duplicate post: each line carries a hidden key, <!-- pipeline-watch:<key> -->, the act's text with its changing
numbers (minutes, times, counts) blanked, so "unanswered 12 min" and "unanswered 22 min" are the same act. A key found in
a comment by github-actions[bot] on that PR in the last 24 h is not posted again; one still standing after 24 h is posted
once more (a reminder, not a flood). Comments that cannot be read: nothing is posted to that PR (fails quiet, never a
double post) and it is said.
Read-only apart from the comments (and merge-wake.py's own). Without --post it prints what it would post. US$0.
   python3 -I product/tools/pipeline-watch.py --repo owner/name [--post] [--state DIR] [--summary FILE] [--now EPOCH]
Test: check-pipeline-watch.sh (stand-in detectors and gh, no network). Exit 0, or 1 when a post failed or a detector
could not run (the run shows red, so a broken watch is seen)."""
import argparse, hashlib, json, os, re, shlex, subprocess, sys, time
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
PRODUCT = os.path.dirname(HERE)
BOT = "github-actions[bot]"
AGAIN = 24 * 3600
MARK = re.compile(r"<!-- pipeline-watch:([0-9a-f]{16}) -->")
SLE_Q = re.compile(r"^MISS\s+(Q #\d+: .*)$")
ACT = re.compile(r"^ACT\s+(.*)$")
PRN = re.compile(r"#(\d+)\b")


def detectors(o):
    """(name, argv, pattern) for each detector; PW_CMD_<NAME> replaces one (the test's stand-ins)."""
    py = [sys.executable, "-I"]
    prs = os.path.join(o.state, "prs-body.json")
    data = os.path.join(PRODUCT, "cockpit", "data.json")
    out = [("sle", py + [os.path.join(HERE, "sle-watch.py")], SLE_Q),
           ("proof", py + [os.path.join(HERE, "proof-read-watch.py")], ACT),
           ("wake", py + [os.path.join(HERE, "merge-wake.py"), "--prs", prs, "--repo", o.git, "--state", o.state]
            + (["--post"] if o.post else []), ACT),
           ("owed", py + [os.path.join(HERE, "owed-watch.py"), "starts", "--state", os.path.join(PRODUCT, "STATE.md")], ACT)]
    if os.path.exists(data) or os.environ.get("PW_CMD_LANES"):
        out.append(("lanes", py + [os.path.join(HERE, "owed-watch.py"), "lanes", "--board", data], ACT))
    return [(n, shlex.split(os.environ[f"PW_CMD_{n.upper()}"]) if os.environ.get(f"PW_CMD_{n.upper()}") else a, p)
            for n, a, p in out]


def gh(*args):
    cmd = shlex.split(os.environ["PW_GH"]) if os.environ.get("PW_GH") else ["bash", os.path.join(HERE, "gh.sh")]
    return subprocess.run(cmd + list(args), capture_output=True, text=True, timeout=120)


def key(name, text):
    """The act without its changing numbers: digits not part of a PR (#n) or an item (R1.n) id become N."""
    norm = re.sub(r"(?<![#.\d])\d+(?:[.:]\d+)*", "N", text)
    return hashlib.sha1(f"{name}|{norm}".encode()).hexdigest()[:16]


def posted(repo, n, now):
    """Keys github-actions[bot] posted on #n in the last 24 h, or None when the comments cannot be read."""
    keys = set()
    for page in range(1, 11):
        r = gh("api", f"repos/{repo}/issues/{n}/comments?per_page=100&page={page}")
        if r.returncode != 0:
            return None
        try:
            cs = json.loads(r.stdout or "[]")
        except ValueError:
            return None
        for c in cs:
            if (c.get("user") or {}).get("login") != BOT:
                continue
            try:
                t = datetime.strptime(c.get("created_at", ""), "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc).timestamp()
            except ValueError:
                t = now
            if now - t < AGAIN:
                keys.update(MARK.findall(c.get("body") or ""))
        if len(cs) < 100:
            return keys
    return keys


def main():
    a = argparse.ArgumentParser()
    a.add_argument("--repo", required=True); a.add_argument("--post", action="store_true")
    a.add_argument("--state", default=os.environ.get("RUNNER_TEMP", "/tmp")); a.add_argument("--git", default=".")
    a.add_argument("--summary"); a.add_argument("--now", type=float)
    o = a.parse_args(); now = o.now or time.time(); bad = 0; lines = []
    os.makedirs(o.state, exist_ok=True)
    acts = []   # (detector, text)
    for name, argv, pat in detectors(o):
        try:
            r = subprocess.run(argv, capture_output=True, text=True, timeout=600)
            out = r.stdout.splitlines()
        except Exception as e:   # a detector that cannot run is said and turns the run red
            lines.append(f"ACT   watch: {name} did not run ({type(e).__name__}: {str(e)[:120]})"); bad = 1; continue
        found = [m.group(1).strip() for m in map(pat.match, out) if m]
        # sle-watch and proof-read-watch exit with their count of acts; merge-wake and owed-watch exit 0. A detector
        # that printed nothing, exited otherwise, or says it could not read GitHub is a broken watch: said, and red.
        broke = [l for l in out if l.startswith("MISS  SLE:") or "could not run" in l or "could not read GitHub" in l]
        if not out or (name in ("wake", "owed", "lanes") and r.returncode != 0) or broke:
            lines.append(f"ACT   watch: {name} is broken (exit {r.returncode}): {(broke[0] if broke else r.stderr.strip())[:160]}"); bad = 1
        lines.append(f"watch {name}: {len(found)} act(s)")
        acts += [(name, t) for t in found]
    by_pr, loose = {}, []
    for name, text in acts:
        prs = sorted({int(x) for x in PRN.findall(text)})
        if not prs:
            loose.append(f"{name}: {text}")
        for n in prs:
            by_pr.setdefault(n, []).append((name, text))
    for n in sorted(by_pr):
        have = posted(o.repo, n, now)
        if have is None:
            lines.append(f"ACT   watch: the comments of #{n} cannot be read: nothing posted there ({len(by_pr[n])} act(s))"); continue
        new, seen = [], set()
        for name, text in by_pr[n]:
            k = key(name, text)
            if k in have or k in seen:
                continue
            seen.add(k); new.append(f"* {name}: {text} <!-- pipeline-watch:{k} -->")
        if not new:
            lines.append(f"watch #{n}: {len(by_pr[n])} act(s) already posted in the last 24 h"); continue
        body = "**Pipeline watch (OS-84):** " + ("this pull request has an act:" if len(new) == 1 else f"{len(new)} acts on this pull request:") \
               + "\n" + "\n".join(new) + "\n\n_Posted by pipeline-watch.yml from the Lead's detectors; the same act is posted again only after 24 h._"
        if not o.post:
            lines.append(f"watch #{n}: would post {len(new)} line(s)"); continue
        r = gh("api", "-X", "POST", f"repos/{o.repo}/issues/{n}/comments", "-f", f"body={body}")
        if r.returncode != 0:
            lines.append(f"ACT   watch: the post on #{n} failed: {(r.stderr or r.stdout).strip()[:160]}"); bad = 1; continue
        lines.append(f"watch #{n}: posted {len(new)} line(s)")
    for t in loose:
        lines.append(f"ACT   watch (no PR named; summary only): {t}")
    print("\n".join(lines))
    if o.summary:
        with open(o.summary, "a", encoding="utf-8") as f:
            f.write("**Pipeline watch (OS-84)**\n\n```\n" + "\n".join(lines) + "\n```\n")
    return bad


if __name__ == "__main__":
    sys.exit(main())
