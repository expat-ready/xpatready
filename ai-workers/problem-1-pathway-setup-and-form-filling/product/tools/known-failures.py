#!/usr/bin/env python3
"""Known failures (B202, founder A119 16 Nov: "looking for those problems proactively every time"; P-639).

One table, tools/known-failures.tsv: id, test, threshold, ACT text, the incident that taught it. lead-watch.sh step 9b
writes one facts file from what it already read (open PRs, file sizes, records commits off main, branches pushed in
90 min, the board's data.json, the lines it printed so far) and this script checks every table line against it.
Each line prints its count and its oldest item: `ok    known <id>: …` or `ACT   known <id>: <ACT text> — <count>, oldest …`.
A line whose source lead-watch or sle-watch already prints (test reuse:<regex>) is counted from those lines and never
printed again as a second ACT (`seen  known <id>: covered above …`); when that source did not run it is a `warn` line.
Read-only, no network, ~0.1 s. Exit code = number of ACT lines.
Usage: python3 tools/known-failures.py --facts facts.json [--table tools/known-failures.tsv]
Test:  bash tools/check-known-failures.sh (one pass and one fail case per table line).
"""
import argparse, json, os, re, sys
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
RECORDS_TITLE = re.compile(r"^(lead|qa):")              # cockpit-data.py's records PR rule
QA_BRANCH = re.compile(r"(^|/)qa[-/_]|(^|/)qa$")


def read_table(path):
    rows = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            if line.startswith("#") or not line.strip():
                continue
            c = line.rstrip("\n").split("\t")
            if c[0] == "id":
                continue
            if len(c) != 5:
                raise ValueError(f"known-failures.tsv: {len(c)} columns, want 5: {line[:80]!r}")
            rows.append(dict(zip(("id", "test", "threshold", "act", "incident"), c)))
    return rows


def ts(s):
    return datetime.fromisoformat(str(s).replace("Z", "+00:00"))


def age_h(now, at):
    return round((now - ts(at)).total_seconds() / 3600, 1)


def val(x):
    """A board number: {"value": n, ...} or a plain n."""
    return x.get("value") if isinstance(x, dict) else x


# Each test returns (count, oldest item text or None, None) when measured, or (None, None, reason) when not.
def t_size(F, row, arg):
    b = (F.get("files") or {}).get(arg)
    if b is None:
        return None, None, f"{arg} not read"
    return (1 if b > int(row["threshold"]) else 0), f"{arg} {b} B of {int(row['threshold'])} B", None


def t_records_pr(F, row, arg):
    prs = F.get("prs")
    if prs is None:
        return None, None, "open PRs not read"
    if prs and not any("additions" in p for p in prs):
        return None, None, "open PRs read without additions and deletions"
    big = [p for p in prs if RECORDS_TITLE.match(p.get("title") or "")
           and (p.get("additions") or 0) + (p.get("deletions") or 0) > int(row["threshold"])]
    big.sort(key=lambda p: p.get("createdAt") or "")
    worst = max(big, key=lambda p: p["additions"] + p["deletions"]) if big else None
    return len(big), (f"#{worst['number']} {worst['additions'] + worst['deletions']} lines" if worst else None), None


def t_records_age(F, row, arg, now):
    offs = F.get("records_off_main")
    if offs is None:
        return None, None, "records commits off main not read"
    old = sorted((c for c in offs if age_h(now, c["at"]) > float(row["threshold"])), key=lambda c: c["at"])
    return len(old), (f"{old[0]['sha'][:9]} {age_h(now, old[0]['at'])} h off main" if old else None), None


def t_proving(F, row, arg):
    b = F.get("board") or {}
    waiting = val(((b.get("first") or {}).get("release") or {}).get("waiting"))
    if waiting is None:
        return None, None, "the board's Built-waiting-for-qa count not read (data.json › first.release)"
    alive = F.get("alive")
    if alive is None:
        return None, None, "branches pushed in 90 min not read"
    qa = [a for a in alive if QA_BRANCH.search(a)]
    short = waiting > int(row["threshold"]) and len(qa) < 2
    return (waiting if short else 0), f"{waiting} Built waiting for qa, {len(qa)} qa lane(s) pushed in 90 min", None


def t_feeding(F, row, arg):
    b = F.get("board") or {}
    ready = val((b.get("capacity") or {}).get("ready_rows"))
    sessions = (b.get("team") or {}).get("sessions")
    if ready is None or sessions is None:
        return None, None, "the board's ready rows or sessions not read (data.json › capacity, team; Lead input)"
    builders = [s for s in sessions if s.get("role") == "builder" and (s.get("state") or "").lower() != "done"]
    running = [s for s in builders if s.get("chip") == "pushing" or (s.get("state") or "").lower() in ("running", "working", "pushing")]
    idle = [s for s in builders if s not in running and not s.get("row")]
    per = int(row["threshold"])
    short = ready < per * len(running)
    item = f"{ready} ready rows for {len(running)} running builder(s)" + (f"; idle with no row: {', '.join(s.get('name') or '?' for s in idle)}" if idle else "")
    return (1 if short else 0) + len(idle), item, None


def t_reuse(F, row, arg):
    seen = F.get("seen")
    if seen is None:
        return None, None, "lead-watch's lines not passed"
    if not any(re.search(row["threshold"], s) for s in seen):
        return None, None, "its source did not run in this check"
    hits = [s for s in seen if re.search(arg, s)]
    return len(hits), (hits[0][6:90] if hits else None), None


def check(F, rows, now=None):
    now = now or (ts(F["now"]) if F.get("now") else datetime.now(timezone.utc))
    out, acts = [], 0
    for r in rows:
        kind, _, arg = r["test"].partition(":")
        try:
            if kind == "size":
                n, item, why = t_size(F, r, arg)
            elif kind == "records-pr-lines":
                n, item, why = t_records_pr(F, r, arg)
            elif kind == "records-age-h":
                n, item, why = t_records_age(F, r, arg, now)
            elif kind == "proving":
                n, item, why = t_proving(F, r, arg)
            elif kind == "feeding":
                n, item, why = t_feeding(F, r, arg)
            elif kind == "reuse":
                n, item, why = t_reuse(F, r, arg)
            else:
                n, item, why = None, None, f"unknown test {r['test']!r}"
        except (KeyError, TypeError, ValueError, re.error) as e:      # a broken fact or table line is said, never a silent pass
            n, item, why = None, None, f"check failed ({e.__class__.__name__}: {str(e)[:60]})"
        if n is None and kind == "reuse":            # the source owns its ACTs; that it did not run is said, not counted
            out.append(f"warn  known {r['id']}: not measured here: {why}")
        elif n is None:
            acts += 1
            out.append(f"ACT   known {r['id']}: not measured: {why} — fix the facts or the table line")
        elif kind == "reuse":
            out.append(f"{'seen ' if n else 'ok   '} known {r['id']}: " + (f"covered above, {n} ACT line(s); first: {item}" if n else "none"))
        elif n:
            acts += 1
            out.append(f"ACT   known {r['id']}: {r['act']} — {n}, oldest: {item} ({r['incident']})")
        else:
            out.append(f"ok    known {r['id']}: 0 ({item})" if item else f"ok    known {r['id']}: 0")
    return out, acts


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument("--facts", required=True)
    ap.add_argument("--table", default=os.path.join(HERE, "known-failures.tsv"))
    a = ap.parse_args(argv)
    try:
        rows = read_table(a.table)
        with open(a.facts, encoding="utf-8") as f:
            F = json.load(f)
    except (OSError, ValueError) as e:
        print(f"ACT   known: table or facts not read ({e.__class__.__name__}: {str(e)[:80]}): no known failure was checked")
        return 1
    out, acts = check(F, rows)
    print("\n".join(out))
    return acts


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
