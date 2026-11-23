#!/usr/bin/env python3
"""Night checklist (A334 fix 1, founder 23 Nov "Yes, beside product"; A332 "Keep both"): the Lead runs operating-system work
beside product with an objective and a checklist, enforced at every check. lead-watch.sh step 10b runs it.

Reads product/design/night-checklist.json: items with id, track ("product" or "operating system"), title, owner, done_when,
due_ist ("YYYY-MM-DD HH:MM", IST), proof. An item is done only when proof is {"pr": N} and PR #N is merged on main (a
"Merge pull request #N " or "... (#N)" subject on origin/main); prose, a PR not merged, or no proof is not done (rule 3).
Prints one ACT per item not done (overdue first within its track, product items before operating-system items), then
"operating system: n done of m". An unreadable file or item is an ACT too, never a silent pass. Exit = number of ACT lines.

  python3 -I product/tools/night-checklist.py [--file F] [--subjects F] [--now EPOCH]
--subjects: a file of commit subjects standing in for `git log --format=%s origin/main` (tests). Read-only, no network.
Test: check-lead-watch-idle.sh.
"""
import argparse, datetime as dt, json, os, re, subprocess, sys, time

IST = dt.timezone(dt.timedelta(hours=5, minutes=30))
TRACKS = ("product", "operating system")
FIELDS = ("id", "track", "title", "owner", "done_when", "due_ist", "proof")
HERE = os.path.dirname(os.path.abspath(__file__))


def merged_prs(subjects):
    out = set()
    for s in subjects:
        m = re.match(r"Merge pull request #(\d+) ", s) or re.search(r"\(#(\d+)\)\s*$", s)
        if m:
            out.add(int(m.group(1)))
    return out


def main_subjects():
    r = subprocess.run(["git", "log", "--format=%s", "origin/main"], cwd=HERE, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError("git log origin/main failed: " + r.stderr.strip()[:200])
    return r.stdout.splitlines()


def hours(sec):
    return f"{abs(sec) / 3600:.1f} h"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", default=os.path.join(HERE, "..", "design", "night-checklist.json"))
    ap.add_argument("--subjects")
    ap.add_argument("--now", type=float)
    a = ap.parse_args()
    now = a.now if a.now is not None else time.time()
    acts = []
    try:
        items = json.load(open(a.file, encoding="utf-8"))["items"]
        assert isinstance(items, list)
    except Exception as e:  # noqa: BLE001 - any failure to read is one ACT
        print(f"ACT   night checklist unreadable ({a.file}): {e}")
        return 1
    try:
        merged = merged_prs(open(a.subjects, encoding="utf-8").read().splitlines() if a.subjects else main_subjects())
    except Exception as e:  # noqa: BLE001
        print(f"ACT   night checklist: merged PRs on main unreadable, no item counts as done: {e}")
        merged, acts = set(), [None]
    rows, os_done, os_all = [], 0, 0
    for i, it in enumerate(items):
        iid = it.get("id", f"item {i + 1}") if isinstance(it, dict) else f"item {i + 1}"
        miss = [f for f in FIELDS if not isinstance(it, dict) or f not in it]
        if miss or it["track"] not in TRACKS:
            rows.append((0, 0, f"night checklist {iid} unreadable: " + (f"missing {', '.join(miss)}" if miss else f"track {it['track']!r} is not product or operating system")))
            continue
        try:
            due = dt.datetime.strptime(it["due_ist"], "%Y-%m-%d %H:%M").replace(tzinfo=IST).timestamp()
        except (TypeError, ValueError):
            rows.append((0, 0, f"night checklist {iid} unreadable: due_ist {it['due_ist']!r} is not YYYY-MM-DD HH:MM"))
            continue
        p, done = it["proof"], False
        if isinstance(p, dict) and isinstance(p.get("pr"), int) and not isinstance(p.get("pr"), bool):
            done = p["pr"] in merged
            why = f"proof #{p['pr']} not merged on main"
        elif p in (None, "", {}):
            why = "no proof"
        else:
            why = f"proof is not a PR number merged on main ({json.dumps(p)[:60]}): give {{\"pr\": N}}"
        if it["track"] == "operating system":
            os_all += 1
            os_done += done
        if done:
            continue
        late = now - due
        when = f"overdue {hours(late)}" if late > 0 else f"due in {hours(late)}"
        rows.append((1 if it["track"] == "product" else 2, due,
                     f"{it['track']} {iid} {when}, {why}: {it['title']} · owner {it['owner']} · done when {it['done_when']}"))
    rows.sort(key=lambda r: (r[0], r[1]))
    for _, _, line in rows:
        print("ACT   " + line)
    print(f"operating system: {os_done} done of {os_all}")
    return len(rows) + len(acts)


if __name__ == "__main__":
    sys.exit(main())
