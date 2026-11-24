#!/usr/bin/env python3
"""Retry-only passes (A348, founder 24 Nov): a suite that passed only on retry is an ACT in the Lead's check, with its PR,
until a pull request names its fix. No merge is blocked (only a Lead ruling may add that).
  Found: ci.yml's comment "Passed only on retry" (flaky.mjs report, or run-suites.sh's line when that report fails; B122 F5;
         github-actions[bot] only). Such a comment that names no suite is an ACT with its PR for a day.
  Named: a PR whose body has a line of its own, "Retry fix: check_x.ts" (several, by commas; nothing else on the line; not
         in a code block, HTML comment or quote), that is open, or was merged after the suite's newest such pass. A closed
         unmerged PR names nothing; a pass after the merge, or in the fix's own batch, is an ACT again.
One ACT per suite with a pass not seen at the last check, then one ACT for the rest, listed in <dir>/retry-watch.txt. A
batch holding several PRs counts once. Memory: <dir>/retry-watch.json, found suites and how far the comments were read; a
missing or unreadable memory is an ACT and the last 14 days are read again. A read that fails or is cut short is an ACT
and what is known is still printed. Reads only, US$0. Exit 0; lead-watch.sh counts the ACT lines. Test: check-retry-watch.sh.
  python3 -I product/tools/retry-watch.py --state DIR [--now 2026-11-24T08:30:00Z]"""
import argparse, json, os, re, subprocess
from datetime import datetime, timedelta, timezone
from urllib.parse import quote
HERE = os.path.dirname(os.path.abspath(__file__)); REPO = "expat-ready/xpatready"
CALLS, PER, DAYS = 10, 100, 14
BATCH = re.compile(r"merge-queue batch (#\d+)")
PHRASE = re.compile(r"Passed only on retry", re.I)
ROW = re.compile(r"^\|[^|\n]*\|[^|\n]*\| `(check_[A-Za-z0-9_.-]+)`", re.M)
PLAIN = re.compile(r"Passed only on retry, a possible race[^:\n]*:\*\*([^\n]*?)(?:\. The bug report failed|$)", re.M)
NAME = re.compile(r"(?<![\w.-])check_[A-Za-z0-9_.-]*[A-Za-z0-9]")
FIX = re.compile(r"^[ \t*-]*Retry fix[ \t*]*:[ \t*]*((?:`?check_[A-Za-z0-9_.-]+`?[ \t]*,?[ \t]*)+)[ \t*]*$", re.M | re.I)
HIDDEN = re.compile(r"<!--.*?(?:-->|\Z)|^[ \t]*(```|~~~).*?(?:^[ \t]*\1[^\n]*$|\Z)", re.M | re.S)
Z = "%Y-%m-%dT%H:%M:%SZ"


def ist(s):
    return (datetime.strptime(s, Z) + timedelta(hours=5, minutes=30)).strftime("%d %b %H:%M IST")


def get(path):
    r = subprocess.run(["bash", os.path.join(HERE, "gh.sh"), "api", path], capture_output=True, text=True, timeout=120)
    if r.returncode:
        raise RuntimeError((r.stderr.strip() or "GitHub read failed").splitlines()[-1][:120])
    return json.loads(r.stdout)


def memory(f, now):
    """(since, found, why): why says what is wrong with the memory, or is empty."""
    try:
        st = json.load(open(f)); datetime.strptime(st["since"], Z)
        ok = st["since"] <= now.strftime(Z) and all(ev and all(len(e) == 3 for e in ev.values()) for ev in st["found"].values())
        if ok:
            return st["since"], st["found"], ""
        why = "not as written"
    except FileNotFoundError:
        why = "missing"
    except Exception as e:
        why = f"unreadable ({type(e).__name__})"
    return (now - timedelta(days=DAYS)).strftime(Z), {}, why


def suites(body):
    out = ROW.findall(body)
    for l in PLAIN.findall(body):
        out += NAME.findall(l)
    return sorted({s.rstrip(".") for s in out})


def read(since, found):
    """Comments updated since, oldest first. Always the first page after the newest time read, so a comment edited between
    two reads moves to the end and no other is skipped; a later page only inside one second."""
    new, unread, page = set(), [], 1
    for _ in range(CALLS):
        got = get(f"repos/{REPO}/issues/comments?sort=updated&direction=asc&since={since}&per_page={PER}&page={page}")
        last = since
        for c in got:
            last = max(last, c["updated_at"]); b = c.get("body") or ""
            if (c.get("user") or {}).get("login") != "github-actions[bot]" or not PHRASE.search(b):
                continue
            pr, k = c["issue_url"].rsplit("/", 1)[-1], BATCH.search(b)
            k = k.group(1) if k else str(c["id"]); names = suites(b)
            for s in names or ["(no suite read)"]:
                ev = found.setdefault(s, {})
                key = k if names else str(c["id"])
                if key not in ev:
                    ev[key] = [c["created_at"], [], "#" + pr]; new.add(s)
                if pr not in ev[key][1]:
                    ev[key][1].append(pr)
        if len(got) < PER:
            return last, new, True
        page = page + 1 if last == since else 1
        since = last
    return since, new, False


def fixes():
    out, n = {}, 1
    while True:
        r = get("search/issues?sort=updated&order=desc&per_page=100&q=" + quote(f'repo:{REPO} is:pr "Retry fix" in:body') + f"&page={n}")
        for p in r["items"]:
            m = (p.get("pull_request") or {}).get("merged_at")
            if p["state"] == "open" or m:
                for l in FIX.findall(HIDDEN.sub("", (p.get("body") or "").replace("\r", ""))):
                    for s in NAME.findall(l):
                        out.setdefault(s, []).append((p["number"], m))
        if r.get("incomplete_results"):
            return out, "GitHub's search answered in part"
        if n * 100 >= r["total_count"]:
            return out, ""
        n += 1
        if n > 10:
            return out, "over 1000 pull requests match"


def main():
    a = argparse.ArgumentParser(); a.add_argument("--state", required=True); a.add_argument("--now"); o = a.parse_args()
    now = datetime.fromisoformat(o.now.replace("Z", "+00:00")) if o.now else datetime.now(timezone.utc)
    os.makedirs(o.state, exist_ok=True); f = os.path.join(o.state, "retry-watch.json")
    since, found, why = memory(f, now)
    if why:
        print(f"ACT   retry: memory {why}: {f}; reading again from {ist(since)}")
    new, whole, fx = set(), False, {}
    try:
        since, new, whole = read(since, found)
        if not whole:
            print(f"ACT   retry: comments read only to {ist(since)} ({CALLS} reads): the next check reads on")
    except Exception as e:
        print(f"ACT   retry: comments not read ({type(e).__name__}: {str(e)[:120]})")
    try:
        if found:
            fx, cut = fixes()
            if cut:
                print(f"ACT   retry: the list of fix PRs is cut short ({cut}): a fix may be missing below")
    except Exception as e:
        print(f"ACT   retry: fix PRs not read ({type(e).__name__}: {str(e)[:120]}): every suite is shown")
    tmp = f"{f}.{os.getpid()}"
    json.dump({"since": since, "found": found}, open(tmp, "w")); os.replace(tmp, f)   # before the lines: a later crash loses nothing read
    day = (now - timedelta(hours=24)).strftime(Z)
    for t, prs, _ in sorted(found.pop("(no suite read)", {}).values()):
        if t >= day:
            print(f"ACT   retry: CI's retry comment on #{prs[0]} at {ist(t)} names no suite this check can read")
    bad = []
    for s in sorted(found):
        ev = sorted(found[s].values()); t, prs, _ = ev[-1]
        if any(n for n, m in fx.get(s, []) if (m is None or m >= t) and not (m and str(n) in prs)):
            continue
        back = [n for n, _ in fx.get(s, [])]
        line = f"{s} passed only on retry {len(ev)} time{'s' * (len(ev) > 1)}, newest on #{prs[-1]} at {ist(t)}: " + (
            f"it came back after #{max(back)}'s fix" if back else f'no PR names its fix (body line "Retry fix: {s}")')
        bad.append((s not in new, -len(ev), line))
    bad.sort()
    with open(os.path.join(o.state, "retry-watch.txt"), "w") as fh:
        fh.writelines(l + "\n" for _, _, l in bad)
    first = [l for seen, _, l in bad if not seen and not why]
    for l in first:
        print("ACT   retry: " + l)
    rest = [l for _, _, l in bad if l not in first]
    if rest:
        print(f"ACT   retry: {len(rest)} suite{'s' * (len(rest) > 1)} with no fix PR, most often: "
              + ", ".join(f"{l.split(' ', 1)[0]} ({l.split(' newest on ')[1].split(' ')[0]})" for l in rest[:5]) + f"; all in {os.path.join(o.state, 'retry-watch.txt')}")
    print(f"retry {len(bad)} of {len(found)} suites that passed only on retry have no fix PR; comments read to {ist(since)}")


try:
    main()
except (Exception, SystemExit) as e:   # said, never a silent pass
    print(f"ACT   retry: not read ({type(e).__name__}: {str(e)[:140]})")
