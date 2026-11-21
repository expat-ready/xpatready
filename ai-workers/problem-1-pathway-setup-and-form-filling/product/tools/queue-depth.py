#!/usr/bin/env python3
"""Merge-queue depth from measured batch outcomes (CI-SPEED-3, founder A254, 21 Nov; SubmitQueue / Bors style).
Rule: .mergify.yml max_parallel_checks is 12 while the failed-batch rate over the last 20 merge-queue batches is under
10%, and 6 when it is over 20%; from 10% to 20% it holds its current value (a band, so it never flaps).
A batch = one Mergify batch PR branch (mergify/merge-queue/*); its outcome = the newest finished `ci` run on it.
Only success and failure, timed_out, startup_failure (failed) are outcomes; cancelled, skipped, neutral, stale,
action_required are none (a batch reset because one under it failed). A split retry is its own batch (its own branch):
the measure counts runs wasted, which is what the depth costs. A re-run of a batch older than the pages read is missed. Read-only: prints the change, never makes it (the Lead lands it as a one-line PR,
together with design/engineering-approved-setup.json, which conformance-check.py compares).
Source: GitHub REST /actions/workflows/ci.yml/runs with curl and `gh auth token` (P-363); GH_TOKEN or GITHUB_TOKEN first.
  python3 -I product/tools/queue-depth.py [--runs FILE] [--mergify FILE] [--repo OWNER/NAME]
Prints  rate=<n>% current=<n> want=<6|12> reason=<...>  then a source line.
Exit 0 no change due, 3 a change is due, 2 data unreadable (no change). Test: check-queue-depth.sh. US$0."""
import argparse, json, os, re, subprocess, sys, tempfile

N, LOW, HIGH, DEEP, SHALLOW = 20, 10, 20, 12, 6
FAILED = ("failure", "timed_out", "startup_failure")
PREFIX = "mergify/merge-queue/"


class Unreadable(Exception):
    pass


def token():
    t = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
    if t:
        return t
    r = subprocess.run(["gh", "auth", "token"], capture_output=True, text=True)
    if r.returncode != 0 or not r.stdout.strip():
        raise Unreadable("no token: gh auth token failed")
    return r.stdout.strip()


def get(url):
    with tempfile.NamedTemporaryFile("w") as a:
        a.write("Authorization: Bearer " + token() + "\n"); a.flush()   # in a file, not on the command line
        r = subprocess.run(["curl", "-sS", "--fail-with-body", "--max-time", "30", "-H", "@" + a.name,
                            "-H", "Accept: application/vnd.github+json", url], capture_output=True, text=True)
    if r.returncode != 0:
        raise Unreadable("GET %s failed: %s %s" % (url, r.stderr.strip()[:120], r.stdout.strip()[:120]))
    return r.stdout


def repo_name(arg):
    r = arg or os.environ.get("GH_REPO") or os.environ.get("GITHUB_REPOSITORY")
    if r:
        return r
    u = subprocess.run(["git", "remote", "get-url", "origin"], capture_output=True, text=True).stdout.strip()
    m = re.search(r"[:/]([^/:]+)/([^/]+?)(?:\.git)?/?$", u)
    if not m:
        raise Unreadable("cannot tell the repository from git remote origin; set GH_REPO")
    return m.group(1) + "/" + m.group(2)


def runs_of(page):
    try:
        d = json.loads(page)
    except ValueError:
        raise Unreadable("the runs answer is not JSON")
    pages = d if isinstance(d, list) else [d]
    out = []
    for p in pages:
        if not isinstance(p, dict) or not isinstance(p.get("workflow_runs"), list):
            msg = p.get("message") if isinstance(p, dict) else None
            raise Unreadable("no workflow_runs in the answer" + (": " + str(msg)[:80] if msg else ""))
        out += [r for r in p["workflow_runs"] if isinstance(r, dict)]
    return out


def batches(runs):
    """Newest finished outcome per batch branch, newest batch first."""
    best = {}
    for r in runs:
        b, c = r.get("head_branch"), r.get("conclusion")
        if not isinstance(b, str) or not b.startswith(PREFIX) or r.get("status", "completed") != "completed" or c not in ("success",) + FAILED:
            continue
        at = str(r.get("run_started_at") or r.get("created_at") or "")
        if b not in best or at > best[b][0]:
            best[b] = (at, c)
    return sorted(((at, b, c) for b, (at, c) in best.items()), reverse=True)


def current_depth(path):
    if path:
        try:
            text, where = open(path).read(), path
        except OSError:
            raise Unreadable("cannot read " + path)
    else:
        r = subprocess.run(["git", "show", "origin/main:.mergify.yml"], capture_output=True, text=True)
        if r.returncode != 0:
            raise Unreadable(".mergify.yml unreadable on origin/main (git fetch first)")
        text, where = r.stdout, "origin/main:.mergify.yml"
    m = re.findall(r"^\s*max_parallel_checks:\s*(\d+)\b", text, re.M)
    if len(m) != 1:
        raise Unreadable("max_parallel_checks not found once in " + where)
    return int(m[0])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--runs"); ap.add_argument("--mergify"); ap.add_argument("--repo")
    a = ap.parse_args()
    cur = None
    try:
        cur = current_depth(a.mergify)
        if a.runs:
            src = "file " + a.runs
            try:
                found = batches(runs_of(open(a.runs).read()))
            except OSError:
                raise Unreadable("cannot read " + a.runs)
        else:
            repo = repo_name(a.repo)
            src = "GitHub REST repos/%s/actions/workflows/ci.yml/runs, branches %s*" % (repo, PREFIX)
            runs = []
            for page in range(1, 11):   # up to 1000 finished ci runs, until 20 batches are found
                got = runs_of(get("https://api.github.com/repos/%s/actions/workflows/ci.yml/runs?status=completed&per_page=100&page=%d" % (repo, page)))
                runs += got
                found = batches(runs)
                if len(found) >= N + 1 or len(got) < 100:   # one spare: the 20th batch's newest run is then surely read
                    break
        if len(found) < N:
            raise Unreadable("only %d finished batch(es) found, %d needed" % (len(found), N))
    except (Unreadable, OSError, TypeError, ValueError, AttributeError) as e:   # a missing gh or curl, an odd field: never a traceback
        print("rate=? current=%s want=%s reason=unreadable, no change: %s" % (cur if cur is not None else "?", cur if cur is not None else "?", e))
        return 2
    last = found[:N]
    bad = sum(1 for _, _, c in last if c in FAILED)
    rate = "%g" % (bad * 100 / N)
    if bad * 100 < LOW * N:
        want, why = DEEP, "%d of %d batches failed, under %d%%" % (bad, N, LOW)
    elif bad * 100 > HIGH * N:
        want, why = SHALLOW, "%d of %d batches failed, over %d%%" % (bad, N, HIGH)
    else:
        want, why = cur, "%d of %d batches failed, inside the %d-%d%% band: hold" % (bad, N, LOW, HIGH)
    why += "" if want == cur else ": set %d" % want
    print("rate=%s%% current=%d want=%d reason=%s" % (rate, cur, want, why))
    print("source %s; batches %s to %s (UTC); a split retry counts as a batch (its own run)" % (src, last[-1][0][:16] or "?", last[0][0][:16] or "?"))
    return 0 if want == cur else 3


if __name__ == "__main__":
    sys.exit(main())
