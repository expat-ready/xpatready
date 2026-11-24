#!/usr/bin/env python3
"""Retry-only passes (A348, founder 24 Nov): a suite that passed only on retry is an ACT in the Lead's check, with its PR,
until a pull request names its fix. No merge is blocked (only a Lead ruling may add that).
  Found: ci.yml's comment "Passed only on retry" (flaky.mjs, B122 F5; github-actions[bot] only), one row per suite.
  Named: a PR whose body has a line "Retry fix: check_x.ts" (several, comma-separated) and that is open, or was merged after
         the suite's newest such pass. A closed unmerged PR names nothing; a pass after the fix merged is an ACT again.
State: <dir>/retry-watch.json keeps what was found and how far the comments were read (first run: 7 days back), so a suite
stays until its fix, however old: one ACT per suite newest within 24 h, one ACT for all the older ones, listed in
<dir>/retry-watch.txt. A batch holding several PRs counts once. A read that fails or is cut short is an ACT, never a silent pass. Reads only, US$0.
Exit 0; lead-watch.sh counts the ACT lines. Test: check-retry-watch.sh (no network).
  python3 -I product/tools/retry-watch.py --state DIR [--fixture DIR] [--now 2026-11-24T08:30:00Z]"""
import argparse, json, os, re, subprocess, sys
from datetime import datetime, timedelta, timezone
from urllib.parse import quote
HERE = os.path.dirname(os.path.abspath(__file__)); REPO = "expat-ready/xpatready"
PAGES, PER = 10, 100
BATCH = re.compile(r"merge-queue batch (#\d+)")
SUITE = re.compile(r"^\| QA-\? \|[^|]*\| `(check_[A-Za-z0-9_.-]+)`", re.M)
FIX = re.compile(r"^[\s>*-]*Retry fix\s*:\s*(.+)$", re.M | re.I)
NAME = re.compile(r"check_[A-Za-z0-9_.-]*[A-Za-z0-9]")


def ist(s):
    return (datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ") + timedelta(hours=5, minutes=30)).strftime("%d %b %H:%M IST")


def main():
    a = argparse.ArgumentParser(); a.add_argument("--state", required=True); a.add_argument("--fixture"); a.add_argument("--now")
    o = a.parse_args(); now = datetime.fromisoformat(o.now.replace("Z", "+00:00")) if o.now else datetime.now(timezone.utc)

    def get(name, path):
        if o.fixture:
            f = os.path.join(o.fixture, name + ".json")
            return json.load(open(f)) if os.path.exists(f) else []
        r = subprocess.run(["bash", os.path.join(HERE, "gh.sh"), "api", path], capture_output=True, text=True, timeout=120)
        if r.returncode:
            raise RuntimeError((r.stderr.strip() or "GitHub read failed").splitlines()[-1][:120])
        return json.loads(r.stdout)
    f = os.path.join(o.state, "retry-watch.json")
    st = json.load(open(f)) if os.path.exists(f) else {"since": (now - timedelta(days=7)).strftime("%Y-%m-%dT%H:%M:%SZ"), "found": {}}
    found, since, whole = st["found"], st["since"], False
    for n in range(1, PAGES + 1):
        page = get(f"comments_{n}", f"repos/{REPO}/issues/comments?sort=updated&direction=asc&since={st['since']}&per_page={PER}&page={n}")
        for c in page:
            since = max(since, c["updated_at"])
            b = c.get("body") or ""
            if (c.get("user") or {}).get("login") != "github-actions[bot]" or "Passed only on retry" not in b:
                continue
            pr = c["issue_url"].rsplit("/", 1)[-1]
            k = BATCH.search(b); k = k.group(1) if k else str(c["id"])
            for s in SUITE.findall(b):
                found.setdefault(s, {})[k] = [c["created_at"], pr]
        if len(page) < PER:
            whole = True; break
    os.makedirs(o.state, exist_ok=True); tmp = f + ".tmp"
    fixes = {}
    if found:
        r = get("search", "search/issues?per_page=100&q=" + quote(f'repo:{REPO} is:pr "Retry fix" in:body'))
        r = r or {"items": []}
        if r.get("incomplete_results") or r.get("total_count", 0) > len(r["items"]):
            print("ACT   retry: the list of fix PRs was cut short: a fix may be missing below")
        for p in r["items"]:
            m = (p.get("pull_request") or {}).get("merged_at")
            if p["state"] != "open" and not m:
                continue
            for s in NAME.findall(" ".join(FIX.findall(p.get("body") or ""))):
                fixes.setdefault(s, []).append((p["number"], m))
    left, old = 0, []
    day = (now - timedelta(hours=24)).strftime("%Y-%m-%dT%H:%M:%SZ")
    for s in sorted(found):
        ev = sorted(found[s].values()); t, pr = ev[-1]
        ok = [n for n, m in fixes.get(s, []) if m is None or m >= t]
        if ok:
            continue
        left += 1
        back = [n for n, m in fixes.get(s, [])]
        line = (f"{s} passed only on retry {len(ev)} time{'s' * (len(ev) > 1)}, newest on #{pr} at {ist(t)}: "
              + (f"it came back after #{max(back)}'s fix" if back else f'no PR names its fix (body line "Retry fix: {s}")'))
        if t >= day:
            print("ACT   retry: " + line)
        else:
            old.append((len(ev), line))
    old.sort(key=lambda x: -x[0])
    with open(os.path.join(o.state, "retry-watch.txt"), "w") as fh:
        fh.writelines(l + "\n" for _, l in old)
    if old:
        print(f"ACT   retry: {len(old)} older suite{'s' * (len(old) > 1)} with no fix PR, most often: "
              + ", ".join(f"{l.split(' ', 1)[0]} ({n})" for n, l in old[:5]) + f"; all in {os.path.join(o.state, 'retry-watch.txt')}")
    if not whole:
        print(f"ACT   retry: comments read only to {ist(since)} ({PAGES} pages): the next check reads on")
    print(f"retry {left} of {len(found)} suites that passed only on retry have no fix PR; comments read to {ist(since)}")
    json.dump({"since": since, "found": found}, open(tmp, "w")); os.replace(tmp, f)


try:
    main()
except (Exception, SystemExit) as e:   # said, never a silent pass
    print(f"ACT   retry: not read ({type(e).__name__}: {str(e)[:140]})")
