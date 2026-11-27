#!/usr/bin/env python3
"""Measures (lab lane automation-measures, 27 Nov; audit sections "Measures" and "What we expect to gain"): the 7-day
baseline, DORA's five software delivery measures and tokens per proven capability. Read from tools only: git history of
main, qa/CAPABILITIES.md and cockpit/usage-log.tsv at the ref, and GitHub's runs API (read-only). Never prose, never
estimated: a number that cannot be read prints as "unreadable (<why>)".

Definitions (DORA's five as named in the audit, design/software-factory-2026-11-27.html "Measures"; dora.dev could not
be reached from the cloud container on 27 Nov, so the Lead re-checks the wording there):
  deployment         a merge to main (first-parent merge commit): every merge redeploys the demo (demo-update.yml,
                     on: push to main). App-code deployments: the merge touched app code (app-code-prs.sh's paths, P-500).
  1 deployment frequency          deployments per day over the window (all, and app code).
  2 lead time for changes         per merged PR, its first commit's author time → merge time; median and p90 hours.
  3 change fail rate              failed deployments / app-code deployments. Failed = reverted by a later merge
                                  ("This reverts commit <sha>" in its branch's commits, or a PR titled
                                  Revert "<that PR's title>"), or a Release 1 capability
                                  that was Works on main went to Partial/Broken/Not built in the window (qa's regression,
                                  counted once per row and event). Failures are counted by event, so in a window
                                  with more failures than app-code deployments the rate can pass 100%: read the
                                  count beside it.
  4 failed deployment recovery    for each failure: time until it was undone (the revert merged, or the row Works again);
                                  median hours; open failures are listed, never dropped.
  5 deployment rework rate        unplanned deployments made because of a failure in production: merges whose PR title
                                  starts "Revert", "fix" or "hotfix", or names a regression or a qa bug (QA-n), over all
                                  deployments; qa reports, records and Lead PRs (titles starting qa, records, lead)
                                  only mention bugs and are never counted.
  works per day                   Release 1 rows newly Works in the window (distinct rows whose Works streak started then), and the
                                  net change in Works rows; per day.
  tokens per proven capability    percent of a weekly plan used in the window (cockpit/usage-log.tsv: rises between
                                  readings on the same account; a fall is a new week or account and counts from 0) per
                                  newly Works row.
  deploy job                      demo-update.yml runs on main in the window: success / failure / cancelled (a cancelled
                                  run was superseded by a newer merge).
Usage: python3 -I product/tools/measures.py [--days 7] [--until <ISO time>] [--ref origin/main] [--no-github] [--line]
  --line prints one tab-separated line (the daily line for the job summary or a log); default is a readable block.
History: fetch main deep enough (git fetch --shallow-since=<window start minus 30 days> origin main, or fetch-depth 0).
Test: test_measures.py (no network)."""
import argparse, importlib.util, json, os, re, statistics, subprocess, sys
from datetime import datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
os.environ.setdefault("GITHUB_REPOSITORY", "local/none")
_spec = importlib.util.spec_from_file_location("flow_measure", os.path.join(HERE, "flow-measure.py"))
fm = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(fm)
P = "ai-workers/problem-1-pathway-setup-and-form-filling"
APP = re.compile(rf"^{P}/prototype/studio/(api/src|web/src|engine|prisma|contracts|samples|packages)/")
USAGE = f"{P}/product/cockpit/usage-log.tsv"
NOT_FIX = re.compile(r"^(qa\b|records\b|lead\b)", re.I)
REWORK = re.compile(r"^(revert\b|fix\b|fix\(|hotfix\b)|\bregression|\bQA-\d+", re.I)


def git(repo, *a):
    r = subprocess.run(["git", "-C", repo, *a], capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError((r.stderr.strip() or "git failed").splitlines()[0][:160])
    return r.stdout


def merges(repo, ref, since, until):
    """First-parent merges of ref in (since, until]: dicts sha, time, pr, title, app, first (first commit's author time)."""
    out = []
    log = git(repo, "log", "--first-parent", "--merges", f"--since={since.isoformat()}", f"--until={until.isoformat()}",
              "--format=%H%x09%cI%x09%s%x09%b%x1e", ref)
    for rec in log.split("\x1e"):
        rec = rec.strip("\n")
        if not rec:
            continue
        parts = (rec + "\t\t").split("\t")
        sha, when, subj = parts[0], parts[1], parts[2]
        title = parts[3].split("\n")[0].strip() if len(parts) > 3 else ""
        m = re.search(r"#(\d+)", subj)
        files = git(repo, "diff", "--name-only", f"{sha}^1", sha).splitlines()
        firsts = git(repo, "log", "--format=%at", f"{sha}^1..{sha}^2").split()
        body = rec + "\n" + git(repo, "log", "--format=%B", f"{sha}^1..{sha}^2")   # a GitHub merge's own message never holds "This reverts commit"
        out.append({"sha": sha, "time": datetime.fromisoformat(when).astimezone(timezone.utc), "pr": int(m.group(1)) if m else None,
                    "title": title or subj, "app": any(APP.match(f) for f in files),
                    "first": datetime.fromtimestamp(min(map(int, firsts)), timezone.utc) if firsts else None,
                    "reverts": re.findall(r"This reverts commit ([0-9a-f]{7,40})", body)})
    return out


def pct(xs, q):
    xs = sorted(xs)
    if not xs:
        return None
    k = (len(xs) - 1) * q
    lo = int(k)
    return xs[lo] + (xs[min(lo + 1, len(xs) - 1)] - xs[lo]) * (k - lo)


def usage_used(rows, since, until):
    """rows: (time, pct, account) sorted. Percent of a weekly plan used in (since, until]: rises between consecutive
    readings on the same account; a fall or an account change starts again from 0 (a new week or account)."""
    used, prev, n = 0.0, None, 0
    for t, p, a in rows:
        if t > until:
            break
        if prev and t > since:
            pt, pp, pa = prev
            used += (p - pp) if (pa == a and p >= pp) else p
            n += 1
        prev = (t, p, a)
    return (used, n)


def read_usage(text):
    rows = []
    for line in text.splitlines():
        f = line.split("\t")
        if len(f) >= 3 and re.match(r"\d{4}-\d\d-\d\dT", f[0]) and f[1].isdigit():
            rows.append((datetime.fromisoformat(f[0]).astimezone(timezone.utc), int(f[1]), f[2]))
    return sorted(rows)


def compute(ms, hist, usage_rows, since, until, runs=None):
    days = (until - since).total_seconds() / 86400
    app = [m for m in ms if m["app"]]
    r = {"since": since, "until": until, "days": days, "deploys": len(ms), "app_deploys": len(app)}
    r["deploy_freq"] = len(ms) / days
    r["app_freq"] = len(app) / days
    lt = [(m["time"] - m["first"]).total_seconds() / 3600 for m in ms if m["first"] and m["first"] <= m["time"]]
    r["lead_median_h"], r["lead_p90_h"], r["lead_n"] = pct(lt, 0.5), pct(lt, 0.9), len(lt)
    # failures: reverts of a merge in or before the window, reverted in the window; and Works → not Works events
    fails = []
    for m in ms:   # a "Revert \"<title>\"" PR names what it reverts by title
        rt = re.match(r'^Revert "(.+)"$', m["title"] or "")
        if rt and not m["reverts"]:
            bad = next((x for x in ms if x["title"] == rt.group(1) and x["time"] < m["time"]), None)
            if bad:
                m["reverts"] = [bad["sha"]]
    for m in ms:
        for s in m["reverts"]:
            bad = next((x for x in ms if x["sha"].startswith(s)), None)
            fails.append({"what": f"revert of {s[:9]}" + (f" (#{bad['pr']})" if bad and bad["pr"] else ""),
                          "start": bad["time"] if bad else None, "end": m["time"]})
    for row, ev in sorted(hist.items()):
        for i in range(1, len(ev)):
            t, st, _, base = ev[i]
            if since < t <= until and ev[i - 1][1] == "Works" and st != "Works" and not base:
                back = next((e[0] for e in ev[i + 1:] if e[1] == "Works"), None)
                fails.append({"what": f"{row} Works → {st}", "start": t, "end": back})
    r["fails"] = fails
    r["cfr"] = (len(fails) / len(app)) if app else None
    rec = [(f["end"] - f["start"]).total_seconds() / 3600 for f in fails if f["start"] and f["end"]]
    r["recovery_median_h"], r["recovery_n"] = pct(rec, 0.5), len(rec)
    r["open_fails"] = [f["what"] for f in fails if not f["end"]]
    # qa reports, records and Lead PRs only mention bugs and regressions; they are never the fix (reviewer of #3902)
    rw = [m for m in ms if m["reverts"] or (not NOT_FIX.match(m["title"] or "") and REWORK.search(m["title"] or ""))]
    r["rework"] = (len(rw) / len(ms)) if ms else None
    r["rework_n"] = len(rw)
    # distinct rows whose Works streak started in the window (a row that regressed and came back counts once)
    newly = sum(1 for ev in hist.values() if any(since < e[0] <= until and e[1] == "Works" and not e[3] and (i == 0 or ev[i - 1][1] != "Works")
                                                 for i, e in enumerate(ev)))
    w_end = sum(1 for ev in hist.values() if fm.status_at(ev, until) == "Works")
    w_start = sum(1 for ev in hist.values() if fm.status_at(ev, since) == "Works")
    r["newly_works"], r["works_net"], r["works_now"], r["rows"] = newly, w_end - w_start, w_end, len(hist)
    used, n = usage_used(usage_rows, since, until)
    last = usage_rows[-1][0] if usage_rows else None
    if n == 0:
        r["tokens"] = f"unreadable (cockpit/usage-log.tsv has no reading in the window; last {last.astimezone(fm.IST).strftime('%d %b %H:%M IST') if last else 'none'})"
    elif newly == 0:
        r["tokens"] = f"{used:.0f}% of a weekly plan used, 0 newly Works: no per-capability number"
    else:
        r["tokens"] = f"{used / newly:.1f}% of a weekly plan per newly Works row ({used:.0f}% / {newly})"
    if runs is None:
        r["deploy_job"] = "not read (--no-github)"
    elif isinstance(runs, str):
        r["deploy_job"] = f"unreadable ({runs})"
    else:
        c = {}
        for x in runs:
            c[x.get("conclusion") or x.get("status")] = c.get(x.get("conclusion") or x.get("status"), 0) + 1
        r["deploy_job"] = ", ".join(f"{k} {v}" for k, v in sorted(c.items())) or "no runs"
    return r


def fmt(v, unit="", nd=1):
    return "unreadable" if v is None else f"{v:.{nd}f}{unit}"


def main():
    a = argparse.ArgumentParser()
    a.add_argument("--days", type=float, default=7); a.add_argument("--until"); a.add_argument("--ref", default="origin/main")
    a.add_argument("--repo", default=ROOT); a.add_argument("--no-github", action="store_true"); a.add_argument("--line", action="store_true")
    o = a.parse_args()
    until = (datetime.fromisoformat(o.until) if o.until else datetime.now(timezone.utc)).astimezone(timezone.utc)
    since = until - timedelta(days=o.days)
    sh = git(o.repo, "rev-parse", "--git-path", "shallow").strip()
    sh = sh if os.path.isabs(sh) else os.path.join(o.repo, sh)
    shallow = set(open(sh).read().split()) if os.path.exists(sh) else set()
    if shallow:   # the oldest first-parent commit this clone holds must be well before the window
        edge = git(o.repo, "log", "--first-parent", "--format=%cI", o.ref).split()[-1]
        if datetime.fromisoformat(edge).astimezone(timezone.utc) > since - timedelta(days=3):
            sys.exit(f"measures: this clone's history starts {edge}, too close to the window start {since.isoformat()}: "
                     f"git fetch --shallow-since={(since - timedelta(days=30)).date()} origin main")
    ms = merges(o.repo, o.ref, since, until)
    hist = fm.cap_history(git(o.repo, "log", "--reverse", "--first-parent", "--diff-merges=first-parent", "-p",
                              "--format=@@C %H %cI", o.ref, "--", fm.CAPS), shallow)
    try:
        usage = read_usage(git(o.repo, "show", f"{o.ref}:{USAGE}"))
    except RuntimeError:
        usage = []
    runs = None
    if not o.no_github:
        try:
            q = f"created={since.strftime('%Y-%m-%dT%H:%M:%SZ')}..{until.strftime('%Y-%m-%dT%H:%M:%SZ')}"
            j = subprocess.run(["gh", "api", "-X", "GET", f"repos/{fm.REPO if fm.REPO != 'local/none' else _origin(o.repo)}/actions/workflows/demo-update.yml/runs",
                                "-f", "branch=main", "-f", q, "-f", "per_page=100", "--paginate", "--jq", ".workflow_runs[] | {conclusion, status}"],
                               capture_output=True, text=True, timeout=120)
            runs = [json.loads(l) for l in j.stdout.splitlines() if l.strip()] if j.returncode == 0 else (j.stderr.strip().splitlines() or ["gh failed"])[-1][:120]
        except Exception as e:  # never a silent zero
            runs = str(e)[:120]
    r = compute(ms, hist, usage, since, until, runs)
    d = r["days"]
    if o.line:
        print("\t".join([until.astimezone(fm.IST).strftime("%Y-%m-%d %H:%M IST"), f"{d:g}d",
                         f"deploys {r['deploys']} ({fmt(r['deploy_freq'], '/day')}), app {r['app_deploys']} ({fmt(r['app_freq'], '/day')})",
                         f"lead time median {fmt(r['lead_median_h'], ' h')} p90 {fmt(r['lead_p90_h'], ' h')} (n {r['lead_n']})",
                         f"change fail rate {fmt(None if r['cfr'] is None else 100 * r['cfr'], '%', 0)} ({len(r['fails'])}/{r['app_deploys']})",
                         f"recovery median {fmt(r['recovery_median_h'], ' h')} (n {r['recovery_n']}, open {len(r['open_fails'])})",
                         f"rework rate {fmt(None if r['rework'] is None else 100 * r['rework'], '%', 0)} ({r['rework_n']}/{r['deploys']})",
                         f"newly Works {r['newly_works']} ({r['newly_works'] / d:.1f}/day), net {r['works_net']:+d}, {r['works_now']}/{r['rows']}",
                         f"tokens {r['tokens']}", f"deploy job {r['deploy_job']}"]))
        return
    ist = lambda t: t.astimezone(fm.IST).strftime("%d %b %H:%M IST")
    print(f"Measures, {ist(since)} → {ist(until)} ({d:g} days), main {git(o.repo, 'rev-parse', '--short=9', o.ref).strip()}")
    print(f"  1 deployment frequency   {r['deploys']} merges to main = {fmt(r['deploy_freq'])}/day; app code {r['app_deploys']} = {fmt(r['app_freq'])}/day")
    print(f"  2 lead time for changes  median {fmt(r['lead_median_h'])} h, p90 {fmt(r['lead_p90_h'])} h (first commit → merge, {r['lead_n']} PRs)")
    print(f"  3 change fail rate       {fmt(None if r['cfr'] is None else 100 * r['cfr'], '%', 0)} ({len(r['fails'])} failures / {r['app_deploys']} app-code deployments)")
    for f in r["fails"]:
        print(f"      - {f['what']}: {ist(f['start']) if f['start'] else '?'} → {ist(f['end']) if f['end'] else 'open'}")
    print(f"  4 recovery time          median {fmt(r['recovery_median_h'])} h ({r['recovery_n']} recovered, {len(r['open_fails'])} open)")
    print(f"  5 deployment rework rate {fmt(None if r['rework'] is None else 100 * r['rework'], '%', 0)} ({r['rework_n']} of {r['deploys']} merges were fixes or reverts)")
    print(f"  works                    {r['newly_works']} newly Works ({r['newly_works'] / d:.1f}/day; target 10/day), net {r['works_net']:+d}, now {r['works_now']} of {r['rows']}")
    print(f"  tokens per capability    {r['tokens']}")
    print(f"  deploy job               demo-update.yml on main: {r['deploy_job']}")


def _origin(repo):
    u = git(repo, "remote", "get-url", "origin").strip()
    m = re.search(r"github\.com[:/]([^/]+/[^/]+?)(\.git)?$", u)
    return m.group(1) if m else "local/none"


if __name__ == "__main__":
    try:
        main()
    except RuntimeError as e:
        sys.exit(f"measures: {e}")
