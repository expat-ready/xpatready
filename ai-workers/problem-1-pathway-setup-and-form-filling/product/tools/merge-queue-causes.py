#!/usr/bin/env python3
# Merge-queue causes (B194, P-502: measure, never guess). Reads Mergify's batch PRs (head mergify/merge-queue/*) and
# their ci runs from GitHub (GET only) and says, for each failed batch, which job and suite failed, whether the failure
# was carried in from a batch it was stacked on (cascade), whether the members later merged unchanged with the suite
# green (flaky), or a member needed a new push (a real break), and which member files overlap. Then the CI minutes of
# every batch run, by what became of it: merged, failed, or thrown away because something ahead left the queue.
# Usage: python3 -I product/tools/merge-queue-causes.py [--failed 24] [--pages 6] [--cache DIR] > causes.md
# Auth: GITHUB_TOKEN if set, else none (a cloud session's proxy signs requests). Test: test_merge_queue_causes.py
# (the classifier on fixtures; no network).
import argparse, json, os, re, subprocess, sys
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

API = os.environ.get("API", "https://api.github.com")

def repo():
    r = os.environ.get("GITHUB_REPOSITORY")
    if r: return r
    u = subprocess.run(["git", "remote", "get-url", "origin"], capture_output=True, text=True).stdout.strip()
    m = re.search(r"github\.com[:/]([^/]+/[^/.]+)", u) or re.search(r"/git/([^/]+/[^/.]+)", u)
    return m.group(1)

def get(path, cache, raw=False):
    key = os.path.join(cache, re.sub(r"[^A-Za-z0-9]+", "_", path)[:180] + (".txt" if raw else ".json"))
    if os.path.exists(key):
        s = open(key).read()
    else:
        h = ["-H", f"Authorization: Bearer {os.environ['GITHUB_TOKEN']}"] if os.environ.get("GITHUB_TOKEN") else []
        s = subprocess.run(["curl", "-sSL", "--fail", *h, f"{API}/{path}"], capture_output=True, text=True).stdout
        if s: open(key, "w").write(s)
    return s if raw else (json.loads(s) if s else {})

def t(s): return datetime.fromisoformat(s.replace("Z", "+00:00")) if s else None
def mins(a, b): return round((t(b) - t(a)).total_seconds() / 60, 1) if a and b else 0.0

def members(title):  # "checking #1808 + #1810 together on main ..." → [1808, 1810]
    head = re.split(r" on main| together|: ", title)[0]
    return [int(n) for n in re.findall(r"#(\d+)", head)]

def ahead(body):
    m = re.search(r"### Queued ahead of this batch(.*?)(<details|\Z)", body or "", re.S)
    return [int(n) for n in re.findall(r"\[#(\d+)\]", m.group(1))] if m else []

def suites(log):
    bad, ok = set(), set()
    for m in re.finditer(r"retries: \d+(.*)", log):
        line = m.group(1)
        for part, into in (("passed on retry:", ok), ("failed twice:", bad)):
            seg = re.search(re.escape(part) + r"([^·(]*)", line)
            if seg: into.update(seg.group(1).split())
    bad.update(re.findall(r"\| (check_[A-Za-z0-9_.-]+\.(?:ts|cjs)) \| FAIL \|", log))   # not retried (demo database, race)
    return sorted(bad), sorted(ok)

def classify(b, failed, later):
    """b: a failed batch; failed: the failed batches before it in time; later: per PR {merged, pushed_after(ts)}.
    Returns (cause, detail). Order: cascade, then a member's or ahead PR's new push (real break), then flaky."""
    for e in failed:
        if e["n"] == b["n"] or t(e["created"]) >= t(b["created"]): continue
        same = set(e["suites"]) & set(b["suites"]) if e["suites"] and b["suites"] else e["jobs"] == b["jobs"]
        if set(e["members"]) & set(b["ahead"]) and same:
            return "cascade", f"stacked on #{e['n']} (members {', '.join('#%d' % m for m in e['members'])}), same failure"
    fixed = [p for p in b["members"] + b["ahead"] if later.get(p, {}).get("pushed_after") and later[p]["pushed_after"](b["created"])]
    if fixed:
        return "broke", "new push after the failure on " + ", ".join(f"#{p}" for p in fixed)
    unmerged = [p for p in b["members"] if not later.get(p, {}).get("merged")]
    if unmerged:
        return "broke", "never merged: " + ", ".join(f"#{p}" for p in unmerged)
    if b["suites"]:
        return "flaky", "members merged unchanged; the same suite(s) passed in their merge batch"
    return "flaky-job", "members merged unchanged; a non-suite job (" + ", ".join(b["jobs"]) + ") failed"

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--failed", type=int, default=24); ap.add_argument("--pages", type=int, default=6)
    ap.add_argument("--cache", default=os.path.join(os.environ.get("TMPDIR", "/tmp"), "mq-causes-cache")); a = ap.parse_args()
    os.makedirs(a.cache, exist_ok=True); R = repo(); pool = ThreadPoolExecutor(8)
    prs = []
    for p in range(1, a.pages + 1):
        prs += [x for x in get(f"repos/{R}/pulls?state=closed&per_page=100&page={p}&sort=created&direction=desc", a.cache) or []
                if x["head"]["ref"].startswith("mergify/merge-queue/")]
    runs = dict(zip([x["number"] for x in prs], pool.map(lambda x: [w for w in get(f"repos/{R}/actions/runs?head_sha={x['head']['sha']}&per_page=50", a.cache).get("workflow_runs", []) if w["name"] == "ci"], prs)))
    allruns = [w for x in prs for w in runs[x["number"]]]
    jobsof = dict(zip([w["id"] for w in allruns], pool.map(lambda w: get(f"repos/{R}/actions/runs/{w['id']}/jobs?per_page=50&filter=all", a.cache).get("jobs", []), allruns)))
    batches = []
    for x in prs:
        for w in runs[x["number"]]:
            jobs = jobsof[w["id"]]
            machine = round(sum(mins(j["started_at"], j["completed_at"]) for j in jobs if j.get("completed_at")), 1)
            batches.append({"n": x["number"], "title": x["title"], "created": x["created_at"], "merged_batch": "merged" in x["title"][:25],
                            "members": members(x["title"].split(": ", 1)[-1]), "ahead": ahead(x["body"]), "run": w["id"],
                            "concl": w["conclusion"] or w["status"], "machine": machine, "jobs_raw": jobs,
                            "wall": mins(w["run_started_at"], w["updated_at"])})
    failed = [b for b in batches if b["concl"] == "failure"]
    for b in failed:
        bad_jobs = [j for j in b["jobs_raw"] if j["conclusion"] == "failure" and j["name"] != "ci"]
        b["jobs"] = sorted({re.sub(r" \(.*", "", j["name"]) + ("" if not j["name"].startswith("shard") else " " + j["name"][6:]) for j in bad_jobs}) or ["ci (summary only)"]
        b["suites"], b["retried"] = [], []
        for j in bad_jobs:
            if j["name"].startswith("shard"):
                s, ok = suites(get(f"repos/{R}/actions/jobs/{j['id']}/logs", a.cache, raw=True)); b["suites"] += s; b["retried"] += ok
            elif j["name"].startswith("regression"):
                b["suites"].append("Works packs (regression job)")
    # Each PR's later life: merged? a commit pushed after a given time?
    nums = sorted({p for b in failed for p in b["members"] + b["ahead"]})
    def life(n):
        pr = get(f"repos/{R}/pulls/{n}", a.cache); cs = get(f"repos/{R}/pulls/{n}/commits?per_page=100", a.cache) or []
        files = [f["filename"] for f in (get(f"repos/{R}/pulls/{n}/files?per_page=100", a.cache) or [])]
        dates = [c["commit"]["committer"]["date"] for c in cs]
        end = pr.get("merged_at")
        return n, {"merged": bool(end), "files": files,
                   "pushed_after": (lambda ts, d=dates, e=end: any(t(x) > t(ts) and (not e or t(x) < t(e)) for x in d))}
    later = dict(pool.map(life, nums))
    failed.sort(key=lambda b: b["created"])
    for b in failed:
        b["cause"], b["detail"] = classify(b, failed, later)
        fs = [set(later[p]["files"]) for p in b["members"] + b["ahead"] if p in later]
        both = sorted(set.union(*[x & y for i, x in enumerate(fs) for y in fs[i + 1:]] or [set()]))
        b["overlap"] = both
    last = sorted(failed, key=lambda b: b["created"], reverse=True)[:a.failed]
    print(f"| batch | created (UTC) | members | ahead | failing job | suite(s) failed | cause | evidence | shared files | CI min |")
    print("|---|---|---|---|---|---|---|---|---|---|")
    for b in last:
        print(f"| #{b['n']} | {b['created'][:16]} | {' '.join('#%d' % m for m in b['members'])} | {' '.join('#%d' % m for m in b['ahead']) or '-'} | "
              f"{', '.join(b['jobs'])} | {', '.join(b['suites']) or '-'} | {b['cause']} | {b['detail']} | {len(b['overlap']) or '-'}{(': ' + ', '.join(x.split('/')[-1] for x in b['overlap'][:3])) if b['overlap'] else ''} | {b['machine']} |")
    print("\n| what became of the batch run | runs | CI machine min | share |\n|---|---|---|---|")
    tot = sum(b["machine"] for b in batches) or 1
    groups = {}
    for b in batches:
        k = "merged (useful)" if b["merged_batch"] and b["concl"] == "success" else (
            "failed: " + b.get("cause", "?") if b["concl"] == "failure" else f"thrown away ({b['concl']}: reset, something ahead left)")
        g = groups.setdefault(k, [0, 0.0]); g[0] += 1; g[1] += b["machine"]
    for k, (n, m) in sorted(groups.items(), key=lambda kv: -kv[1][1]):
        print(f"| {k} | {n} | {round(m)} | {round(100 * m / tot)}% |")
    by = {}
    for b in last:
        for s in b["suites"] or b["jobs"]:
            g = by.setdefault((b["cause"], s), [0, 0.0]); g[0] += 1; g[1] += b["machine"]
    print("\n| cause | suite or job | batches | CI min |\n|---|---|---|---|")
    for (c, s), (n, m) in sorted(by.items(), key=lambda kv: -kv[1][1])[:15]:
        print(f"| {c} | {s} | {n} | {round(m)} |")
    json.dump([{k: v for k, v in b.items() if k != "jobs_raw"} for b in last], open(os.path.join(a.cache, "last-failed.json"), "w"), indent=1)

if __name__ == "__main__":
    main()
