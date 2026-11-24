#!/usr/bin/env python3
"""The cycle plan is today's (A363): cycle-plan.json's cycle_start is the 07:00 -> 07:00 IST cycle now. One line, an ACT when
it is not, or cannot be read; exit 1 then. lead-watch.sh prints it before the rest; founder-report.py gives no forecast on 1.
  python3 -I product/tools/plan-fresh.py [--plan F] [--now ISO]          Test: check-lead-run.sh"""
import argparse, json, os, sys
from datetime import datetime, timedelta, timezone
IST = timezone(timedelta(hours=5, minutes=30))


def check(path, now):
    """-> (line, fresh)"""
    cycle = (now.astimezone(IST) - timedelta(hours=7)).strftime("%Y-%m-%d")
    try:
        with open(path, encoding="utf-8") as f:
            got = json.load(f).get("cycle_start")
        datetime.strptime(got, "%Y-%m-%d")
    except (OSError, ValueError, AttributeError, TypeError) as e:
        return "ACT   plan: cycle-plan.json unreadable (%s): no forecast; the Lead writes today's" % type(e).__name__, False
    if got == cycle:
        return "plan   cycle-plan.json is this cycle's (%s)" % got, True
    return ("ACT   plan: cycle-plan.json is of %s, this cycle is %s: no forecast from it; land today's in a small records PR"
            % (got, cycle)), False


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--plan", default=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "cycle-plan.json"))
    ap.add_argument("--now")
    a = ap.parse_args()
    line, fresh = check(a.plan, datetime.fromisoformat(a.now) if a.now else datetime.now(timezone.utc))
    print(line)
    sys.exit(0 if fresh else 1)
