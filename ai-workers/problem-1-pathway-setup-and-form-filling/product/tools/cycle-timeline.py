#!/usr/bin/env python3
"""Cycle timeline (founder A244, 21 Nov 08:2x IST; built by ENF-783b under P-783 (2)).

Prints the founder's view of the current 07:00 -> 07:00 IST cycle: one line per capability in the cycle plan,
  ETA IST · R1 id · plain name · current step · waits on · on time / late by N
split "First 8 by 19:00" and "Next 7 by 07:00" (the split comes from each row's "by"), proven rows ticked.

Inputs (read-only; never writes, never posts):
  * product/cycle-plan.json, edited by the Lead: the cycle's rows and their PRs (schema below).
  * GitHub's REST API: each PR's state, draft, labels, and Mergify's "Merge Queue" check summary
    ("estimated merge HH:MM UTC"). Read through curl with GITHUB_TOKEN / GH_TOKEN or `gh auth token` (P-363).
  * qa/CAPABILITIES.md on origin/main: a row at Works is proven; its plain name comes from there.

Plan schema (product/cycle-plan.json):
  {"cycle_start": "2026-11-21",          # the IST date the cycle starts at 07:00
   "proof_minutes": 60,                  # merge -> qa proof, added to a Mergify merge ETA
   "rows": [{"r1": "R1.49", "by": "19:00" | "07:00", "prs": [2618],
             "eta": "HH:MM" (optional, the Lead's own IST estimate, wins over Mergify's),
             "step": "..." (optional override), "waits_on": "..." (optional override),
             "name": "..." (optional, else CAPABILITIES.md's)}]}

Usage:
  python3 -I product/tools/cycle-timeline.py [--plan FILE] [--now ISO] [--fixture FILE] [--capabilities FILE]
  --fixture answers GitHub from a JSON file ({"pulls": {"2618": {...}}}) and is what the CI test uses; --now fixes the
  clock. Exit 0 always when the plan reads (a timeline is information, not a gate); 2 when the plan or CAPABILITIES.md
  is unreadable. After one network failure the remaining rows say "GitHub not answering" without waiting again.
"""
import argparse
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timedelta, timezone

IST = timezone(timedelta(hours=5, minutes=30))
HERE = os.path.dirname(os.path.abspath(__file__))
P = os.path.dirname(HERE)
CAPS_REL = "ai-workers/problem-1-pathway-setup-and-form-filling/product/qa/CAPABILITIES.md"
REPO = "expat-ready/xpatready"
ETA_RE = re.compile(r"estimated merge (?:[A-Z][a-z]{2},? )?(?:\d{1,2} [A-Z][a-z]{2},? )?(\d{1,2}):(\d{2}) UTC")


def cycle_bounds(now):
    """The 07:00 -> 07:00 IST cycle that contains `now`."""
    local = now.astimezone(IST)
    start = local.replace(hour=7, minute=0, second=0, microsecond=0)
    if local < start:
        start -= timedelta(days=1)
    return start, start + timedelta(days=1)


def at_cycle_time(start, hhmm):
    """An IST HH:MM inside the cycle starting at `start` (times before 07:00 fall on the next day)."""
    h, m = (int(x) for x in hhmm.split(":"))
    t = start.replace(hour=h, minute=m)
    return t + timedelta(days=1) if t <= start else t   # 07:00 is the cycle's end, not its start


def mergify_eta(summary, now):
    """Mergify writes 'estimated merge 06:32 UTC' with no date: take the reading nearest to now."""
    m = ETA_RE.search(summary or "")
    if not m:
        return None
    t = now.astimezone(timezone.utc).replace(hour=int(m.group(1)), minute=int(m.group(2)), second=0, microsecond=0)
    for cand in (t - timedelta(days=1), t + timedelta(days=1)):
        if abs(cand - now) < abs(t - now):
            t = cand
    return t.astimezone(IST)


def parse_capabilities(text):
    caps = {}
    for line in text.splitlines():
        m = re.match(r"^\|\s*(R1\.\d+)\s*\|\s*([^|]*)\|\s*[^|]*\|\s*([^|]*)\|", line)
        if m and m.group(1) not in caps:
            name = re.sub(r"^\d+\s+", "", m.group(2).strip())
            caps[m.group(1)] = {"name": name, "status": m.group(3).strip()}
    return caps


def read_capabilities(path):
    if path:
        with open(path, encoding="utf-8") as f:
            return f.read(), path
    root = subprocess.run(["git", "-C", HERE, "rev-parse", "--show-toplevel"], capture_output=True, text=True).stdout.strip()
    r = subprocess.run(["git", "-C", root or HERE, "show", "origin/main:" + CAPS_REL], capture_output=True, text=True)
    if r.returncode == 0:
        return r.stdout, "origin/main"
    with open(os.path.join(P, "qa", "CAPABILITIES.md"), encoding="utf-8") as f:
        return f.read(), "working copy (origin/main unreadable)"


class GitHub:
    def __init__(self):
        self.token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
        if not self.token:
            try:
                self.token = subprocess.run(["gh", "auth", "token"], capture_output=True, text=True).stdout.strip()
            except OSError:
                self.token = ""
        self.down = None                                 # after one network failure, stop asking (lead-watch must not stall)

    def get(self, path):
        if self.down:
            raise OSError(self.down)
        r = subprocess.run(["curl", "-s", "--max-time", "20", "-H", "Authorization: Bearer " + self.token,
                            "-H", "Accept: application/vnd.github+json", "https://api.github.com/repos/%s/%s" % (REPO, path)],
                           capture_output=True, text=True)
        if r.returncode != 0:
            self.down = "GitHub not answering (curl exit %d)" % r.returncode
            raise OSError(self.down)
        return json.loads(r.stdout)

    def pull(self, n):
        d = self.get("pulls/%d" % n)
        if "state" not in d:
            raise OSError(d.get("message", "no PR"))
        pr = {"state": d["state"], "draft": d.get("draft", False), "merged": d.get("merged", False),
              "labels": [l["name"] for l in d.get("labels", [])], "queue_title": "", "queue_summary": ""}
        if pr["state"] == "open" and "review: approved" in pr["labels"]:
            runs = self.get("commits/%s/check-runs?per_page=100" % d["head"]["sha"]).get("check_runs", [])
            for c in runs:
                if c.get("name") == "Mergify Merge Queue":
                    pr["queue_title"] = c["output"].get("title") or ""
                    pr["queue_summary"] = c["output"].get("summary") or ""
        return pr


class Fixture:
    def __init__(self, path):
        with open(path, encoding="utf-8") as f:
            self.pulls = json.load(f).get("pulls", {})

    def pull(self, n):
        if str(n) not in self.pulls:
            raise OSError("not in fixture")
        pr = {"draft": False, "merged": False, "labels": [], "queue_title": "", "queue_summary": ""}
        pr.update(self.pulls[str(n)])
        return pr


def row_view(row, caps, gh, now, proof_minutes):
    """-> (eta datetime or None, eta text, step, waits on, proven)"""
    cap = caps.get(row["r1"], {})
    if cap.get("status") == "Works":
        return None, "✅", "proven (Works on main)", "—", True
    step, waits, eta, eta_txt = "not started", "a builder", None, None
    open_seen = False
    merged, closed = [], []
    for n in row.get("prs", []):
        try:
            pr = gh.pull(int(n))
        except (OSError, ValueError) as e:
            step, waits = "#%s unreadable" % n, "GitHub (%s)" % e
            open_seen = True
            break
        if pr.get("merged"):
            merged.append(n)
            continue
        if pr["state"] != "open":
            closed.append(n)
            continue                                     # closed unmerged: replaced; the Lead drops it from the plan
        open_seen = True
        if pr.get("draft"):
            step, waits = "building #%s (draft)" % n, "builder"
        elif "review: approved" not in pr["labels"]:
            step, waits = "review #%s" % n, "reviewer Approve, then label"
        else:
            m_eta = mergify_eta(pr.get("queue_summary"), now)
            if m_eta:
                step = "merge queue #%s" % n
                waits = "Mergify batch (merge ~%s), then qa proof" % m_eta.strftime("%H:%M")
                eta = m_eta + timedelta(minutes=proof_minutes)
                eta_txt = "~" + eta.strftime("%H:%M")
            elif "Waiting for queue conditions" in pr.get("queue_title", ""):
                step, waits = "approved, not queued #%s" % n, "queue conditions (Mergify summary)"
            else:
                step, waits = "labelled #%s" % n, "Mergify to queue it"
        break
    if not open_seen and merged:
        step, waits = "qa proof (merged #%s)" % ", #".join(str(m) for m in merged), "qa"
    elif not open_seen and closed:
        step = "no open PR (#%s closed unmerged)" % ", #".join(str(c) for c in closed)
    if row.get("eta"):
        try:
            eta = at_cycle_time(cycle_bounds(now)[0], row["eta"])
            eta_txt = eta.strftime("%H:%M")
        except ValueError:
            eta_txt = "?" + row["eta"]
    step = row.get("step") or step
    waits = row.get("waits_on") or waits
    return eta, eta_txt or "—", step, waits, False


def lateness(eta, deadline, now, proven):
    if proven:
        return "proven"
    when = max(eta, now) if eta else (now if now > deadline else None)   # a passed ETA cannot keep a row on time
    if when is None:
        return "no ETA"
    stale = " (ETA %s passed: re-estimate)" % eta.strftime("%H:%M") if eta and eta < now else ""
    if when <= deadline:
        return "on time" + stale
    mins = int((when - deadline).total_seconds() // 60)
    return ("late by %dh%02dm" % (mins // 60, mins % 60) if mins >= 60 else "late by %d min" % mins) + stale


def render(plan, caps, caps_src, gh, now):
    start, end = cycle_bounds(now)
    out = []
    rows = plan.get("rows", [])
    proof = int(plan.get("proof_minutes", 60))
    views = [(r, row_view(r, caps, gh, now, proof)) for r in rows]
    proven = sum(1 for _, v in views if v[4])
    out.append("Cycle %s → %s IST · now %s IST · proven %d of %d (A244; capabilities from %s)" % (
        start.strftime("%d %b %H:%M"), end.strftime("%d %b %H:%M"), now.astimezone(IST).strftime("%H:%M"),
        proven, len(rows), caps_src))
    plan_start = plan.get("cycle_start")
    if plan_start and plan_start != start.strftime("%Y-%m-%d"):
        out.append("ACT   cycle-plan.json is for the cycle starting %s 07:00, not %s: the Lead rewrites it" % (
            plan_start, start.strftime("%Y-%m-%d")))
    groups = [("19:00", "First"), ("07:00", "Next")]
    for by, word in groups:
        g = [(r, v) for r, v in views if r.get("by") == by]
        deadline = at_cycle_time(start, by)
        g.sort(key=lambda rv: (not rv[1][4], rv[1][0] is None, rv[1][0] or end))
        out.append("%s %d by %s — %d of %d proven" % (word, len(g), by, sum(1 for _, v in g if v[4]), len(g)))
        for r, (eta, eta_txt, step, waits, ok) in g:
            name = r.get("name") or caps.get(r["r1"], {}).get("name") or "(not in CAPABILITIES.md)"
            if ok:
                out.append("  ✅     %-7s %s · proven" % (r["r1"], name))
                continue
            out.append("  %-6s %-7s %s · %s · waits on %s · %s" % (
                eta_txt, r["r1"], name, step, waits, lateness(eta, deadline, now, ok)))
    other = [r["r1"] for r in rows if r.get("by") not in ("19:00", "07:00")]
    if other:
        out.append("ACT   rows with no \"by\" of 19:00 or 07:00: %s (cycle-plan.json)" % ", ".join(other))
    return "\n".join(out)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--plan", default=os.path.join(P, "cycle-plan.json"))
    ap.add_argument("--now", help="ISO time (tests); default the clock")
    ap.add_argument("--fixture", help="answer GitHub from this JSON file (tests)")
    ap.add_argument("--capabilities", help="read CAPABILITIES.md from this file instead of origin/main")
    a = ap.parse_args(argv)
    try:
        with open(a.plan, encoding="utf-8") as f:
            plan = json.load(f)
    except (OSError, ValueError) as e:
        print("cycle-timeline: plan unreadable (%s): %s" % (a.plan, e), file=sys.stderr)
        return 2
    now = datetime.fromisoformat(a.now) if a.now else datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=IST)
    try:
        text, src = read_capabilities(a.capabilities)
    except OSError as e:
        print("cycle-timeline: CAPABILITIES.md unreadable: %s" % e, file=sys.stderr)
        return 2
    gh = Fixture(a.fixture) if a.fixture else GitHub()
    print(render(plan, parse_capabilities(text), src, gh, now))
    return 0


if __name__ == "__main__":
    sys.exit(main())
