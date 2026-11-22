#!/usr/bin/env python3
"""Step age against today's median (P-798, Lead 4 14:5x IST 22 Nov; ENF-798): a step older than twice its median today
gets a builder added or moved. Read-only; lead-watch.sh step 5c. Medians come from flow-measure.py --json (either its
--lead shape or its full shape); ages from the open PRs lead-watch already read.
  start→Proven   each R1 item named by an open PR (title, or an "Item:" / "Completes:" line): age since its oldest open
                 PR was created, against start_to_proven.median_days (days)
  approved→merged each open PR labelled `review: approved`: age since its label (the PR's "approvedAt", else the
                 "approved_at" of sle-watch.py --dump, given with --sle) against approved_to_merged_min.median (minutes;
                 flow-measure.py --lead gives it for PRs merged since 00:00 IST)
Records PRs (title "qa:", "lead:" or "records", branch lead/* or board/*) are no builds and are left out.
A step with no median in the JSON prints "warn", never ACT and never ok. An unreadable JSON is one ACT.
Usage: python3 -I step-age.py --flow FLOW.json --prs PRS.json [--sle SNAPSHOT.json] [--now ISO]     Exit code = number of ACT lines.
Test: test-enf-798.sh (planted and clean cases, no network).
"""
import argparse, json, re, sys
from datetime import datetime, timezone

R1 = re.compile(r"\bR1\.\d+\b")
RECORDS = re.compile(r"(?i)^\s*(qa|lead|records?)\b")
ITEM = re.compile(r"(?im)^[\s*>-]*(?:Item|Completes)[*]*:\s*(.*)$")


def t(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00")).astimezone(timezone.utc)


def items(p):
    found = set(R1.findall(p.get("title") or ""))
    for m in ITEM.finditer(p.get("body") or ""):
        found |= set(R1.findall(m.group(1)))
    return found


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--flow", required=True)
    ap.add_argument("--prs", required=True)
    ap.add_argument("--sle")
    ap.add_argument("--now")
    a = ap.parse_args(argv)
    now = t(a.now) if a.now else datetime.now(timezone.utc)
    try:
        flow = json.load(open(a.flow))
        prs = [p for p in json.load(open(a.prs)) if not re.match(r"(mergify|lead|board)/", p.get("headRefName") or "")
               and not RECORDS.match(p.get("title") or "")]
        sle = {}
        if a.sle:
            try:
                sle = {s["number"]: s.get("approved_at") for s in json.load(open(a.sle)).get("prs", [])}
            except (OSError, ValueError, KeyError, TypeError, AttributeError):
                print("warn  step-age: sle-watch's dump unreadable; approval times only from the PR list")
        for p in prs:
            if not p.get("approvedAt") and sle.get(p.get("number")):
                p["approvedAt"] = sle[p["number"]]
    except (OSError, ValueError) as e:
        print(f"ACT   step-age did not run ({e}): read flow-measure.py --json and the open PRs (P-798)")
        return 1
    acts, said = [], []
    med_d = (flow.get("start_to_proven") or {}).get("median_days")
    if isinstance(med_d, (int, float)) and med_d > 0:
        oldest = {}
        for p in prs:
            for i in items(p):
                c = t(p["createdAt"])
                if i not in oldest or c < oldest[i][0]:
                    oldest[i] = (c, p["number"])
        for i, (c, n) in sorted(oldest.items(), key=lambda kv: kv[1][0]):
            age = (now - c).total_seconds() / 86400
            if age > 2 * med_d:
                acts.append(f"step start→Proven: {i} open {age:.1f} d since #{n}, over twice today's median {med_d} d: add or move a builder (P-798)")
        said.append(f"start→Proven median {med_d} d, {len(oldest)} items open")
    else:
        print("warn  step-age: no start→Proven median in flow-measure's JSON; that step not checked")
    med_m = (flow.get("approved_to_merged_min") or {}).get("median")
    if isinstance(med_m, (int, float)) and med_m > 0:
        ap_ = [p for p in prs if "review: approved" in [l["name"] for l in p.get("labels") or []] and p.get("approvedAt")]
        for p in ap_:
            age = (now - t(p["approvedAt"])).total_seconds() / 60
            if age > 2 * med_m:
                acts.append(f"step approved→merged: #{p['number']} approved {age:.0f} min, over twice today's median {med_m} min: find what holds it (P-798)")
        said.append(f"approved→merged median {med_m} min, {len(ap_)} approved")
    else:
        print("warn  step-age: no approved→merged median in flow-measure's JSON; that step not checked")
    for l in acts:
        print("ACT   " + l)
    if said and not acts:
        print("ok    step-age: no step over twice its median (" + "; ".join(said) + ")")
    return len(acts)


if __name__ == "__main__":
    sys.exit(main())
