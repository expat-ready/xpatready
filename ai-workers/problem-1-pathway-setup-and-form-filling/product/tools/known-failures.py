#!/usr/bin/env python3
"""Known failures (B202, founder A119 16 Nov: "looking for those problems proactively every time"; P-639).

One table, tools/known-failures.tsv: id, test, threshold, ACT text, the incident that taught it. lead-watch.sh step 12
writes one facts file from what it already read (open PRs, file sizes, the tip subject of each branch pushed in
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
RECORDS_TITLE = re.compile(r"^(lead|qa|records)\b[:\s]")   # cockpit-data.py's RECORDS_TITLE, plus its is_records() below
QA_SUBJECT = re.compile(r"^qa\b[:(]")                    # a qa lane's commits start "qa:" (its branch name is any claude/…)


class NotRead(Exception):
    """A fact this check could not read. board=True: the board step owns saying so (a warn here, never a second ACT)."""
    def __init__(self, why, board=False):
        super().__init__(why); self.why, self.board = why, board


def is_records(p):
    return (bool(RECORDS_TITLE.match(p.get("title") or "")) or "(records only)" in (p.get("title") or "")
            or any((l.get("name") if isinstance(l, dict) else l) == "records" for l in p.get("labels") or []))


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


# Each test returns (count, oldest item text) or raises NotRead.
def t_size(F, row, arg):
    b = (F.get("files") or {}).get(arg)
    if b is None:
        raise NotRead(f"{arg} not read")
    return (1 if b > int(row["threshold"]) else 0), f"{arg} {b} B of {int(row['threshold'])} B"


def t_records_pr(F, row, arg):
    prs = F.get("prs")
    if prs is None:
        raise NotRead("open PRs not read")
    if prs and not any("additions" in p for p in prs):
        raise NotRead("open PRs read without additions and deletions")
    big = sorted((p for p in prs if is_records(p) and (p.get("additions") or 0) + (p.get("deletions") or 0) > int(row["threshold"])),
                 key=lambda p: p.get("createdAt") or "")
    return len(big), (f"#{big[0]['number']} {big[0]['additions'] + big[0]['deletions']} lines" if big else "none")


def t_records_age(F, row, arg, now):
    """OS-17 (P-526c: no ruling lives only in an unmerged PR; records PRs over 24 h are merged or closed): every open
    records PR, draft or not, opened more than `threshold` hours ago; each is named, oldest first."""
    prs = F.get("prs")
    if prs is None:
        raise NotRead("open PRs not read")
    if prs and not any("createdAt" in p for p in prs):
        raise NotRead("open PRs read without createdAt")
    old = sorted((p for p in prs if is_records(p) and p.get("createdAt") and age_h(now, p["createdAt"]) > float(row["threshold"])),
                 key=lambda p: p["createdAt"])
    return len(old), ("; ".join(f"#{p['number']} open {age_h(now, p['createdAt']):g} h" for p in old) if old else "none")


def board_part(F, *path):
    b = F.get("board")
    if not isinstance(b, dict):
        raise NotRead("the board's data.json not read", board=True)
    x = b
    for k in path:
        x = x.get(k) if isinstance(x, dict) else None
    return x


def t_proving(F, row, arg):
    rel = board_part(F, "first", "release")
    if not isinstance(rel, dict) or val(rel.get("waiting")) is None:
        raise NotRead("the board has no Built-waiting-for-qa count (data.json › first.release, P-636)", board=True)
    waiting = val(rel["waiting"])
    subj = F.get("alive_subjects")
    if subj is None:
        raise NotRead("branches pushed in 90 min not read")
    branches = {b for b, t in subj.items() if QA_SUBJECT.match(t or "")}
    pushing = [s_ for s_ in board_part(F, "team", "sessions") or [] if s_.get("role") == "qa" and s_.get("chip") == "pushing"]
    named = {s_["branch"] for s_ in pushing if s_.get("branch")}
    unnamed = sum(1 for s_ in pushing if not s_.get("branch"))
    # One lane can be seen both ways (its branch and its session). A session naming its branch is matched by it; a session
    # with no branch is taken to be one of the qa branches no session names, and counts only beyond them (Devin, #1954).
    qa = len(branches | named) + max(0, unnamed - len(branches - named))
    short = waiting > int(row["threshold"]) and qa < 2
    ids = rel.get("waiting_ids") or []
    return (waiting if short else 0), (f"R1.{ids[0]} first of {waiting} Built waiting for qa" if ids else f"{waiting} Built waiting for qa") + f", {qa} qa lane(s) pushed in 90 min"


def t_feeding(F, row, arg):
    ready = val(board_part(F, "capacity", "ready_rows"))
    sessions = board_part(F, "team", "sessions")
    if ready is None:
        raise NotRead("the board has no ready-rows count (data.json › capacity.ready_rows)", board=True)
    builders = [s for s in sessions or [] if s.get("role") == "builder" and (s.get("state") or "").lower() != "done"]
    if not builders:                                     # cockpit-data writes [] when the Lead input has no sessions
        raise NotRead("no builder sessions in the board's Lead input (data.json › team.sessions): the feeding pipe cannot be measured", board=True)
    running = [s for s in builders if s.get("chip") == "pushing" or (s.get("state") or "").lower() in ("running", "working", "pushing")]
    idle = [s for s in builders if s not in running and not s.get("row")]
    short = ready < int(row["threshold"]) * len(running)
    item = (f"idle with no row: {', '.join(s.get('name') or '?' for s in idle)}; " if idle else "") + f"{ready} ready rows for {len(running)} running builder(s)"
    return (1 if short else 0) + len(idle), item


def t_reuse(F, row, arg):
    seen = F.get("seen")
    if seen is None:
        raise NotRead("lead-watch's lines not passed")
    hits = [s for s in seen if re.search(arg, s)]
    if not hits and not any(re.search(row["threshold"], s) for s in seen):   # a hit proves its source ran; else its "ran" line must
        raise NotRead("its source did not run in this check", board=True)
    return len(hits), (hits[0][6:90] if hits else "none")


def check(F, rows, now=None):
    now = now or (ts(F["now"]) if F.get("now") else datetime.now(timezone.utc))
    out, acts = [], 0
    for r in rows:
        kind, _, arg = r["test"].partition(":")
        try:
            if kind == "size":
                n, item = t_size(F, r, arg)
            elif kind == "records-pr-lines":
                n, item = t_records_pr(F, r, arg)
            elif kind == "records-pr-age":
                n, item = t_records_age(F, r, arg, now)
            elif kind == "proving":
                n, item = t_proving(F, r, arg)
            elif kind == "feeding":
                n, item = t_feeding(F, r, arg)
            elif kind == "reuse":
                n, item = t_reuse(F, r, arg)
            else:
                raise NotRead(f"unknown test {r['test']!r}")
            why = None
        except NotRead as e:
            n, item, why, owned = None, None, e.why, e.board
        except (KeyError, TypeError, ValueError, AttributeError, re.error) as e:   # a broken fact or table line is said, never a silent pass
            n, item, why, owned = None, None, f"check failed ({e.__class__.__name__}: {str(e)[:60]})", False
        if n is None and owned:                      # the board step or the reused source says it; counted once, there
            out.append(f"warn  known {r['id']}: not measured here: {why}")
        elif n is None:
            acts += 1
            out.append(f"ACT   known {r['id']}: not measured: {why} — fix the facts or the table line")
        elif kind == "reuse":
            out.append(f"seen  known {r['id']}: covered above, {n} ACT line(s); first: {item}" if n else f"ok    known {r['id']}: 0")
        elif n:
            acts += 1
            out.append(f"ACT   known {r['id']}: {r['act']} — {n}, oldest: {item} ({r['incident']})")
        else:
            out.append(f"ok    known {r['id']}: 0 ({item})")
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
