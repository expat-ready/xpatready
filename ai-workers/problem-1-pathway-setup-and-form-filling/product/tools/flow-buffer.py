#!/usr/bin/env python3
"""Flow buffer (P-800, founder 15:1x IST 22 Nov: "We plan for 2, 3 day capability so that my pipeline doesn't get drained
completely or queue or overflowed completely"; ENF-798). Read-only; lead-watch.sh step 2f. One ACT line each when:
  1. a track board (design/board-lead-a-*.md, design/board-lead-b-*.md, the newest by the date in its name) lists under
     2 days of capabilities, or a track has no board;
  2. an open part on a board has no lane named (the row's "Left to build" is not "none", its "Lane" cell is empty,
     "none", "none yet", "-" or "?");
  3. a capability marked Partial in qa/CAPABILITIES.md (an R1 row) is in no table row of either board (one ACT naming
     them all; a mention in the board's prose does not count).
Days on a board: each heading (a line starting with #) that names a day ("Day 2", "tomorrow", "day after", "cycle")
starts a day section; a day counts when at least one capability row (a table row naming R1.n) sits under it. A board
with rows but no such heading is 1 day. A "Buffer: N days" line is text and never counted.
Usage: python3 -I flow-buffer.py [--design DIR] [--caps FILE]     Exit code = number of ACT lines.
Test: test-enf-798.sh (planted and clean boards, no network).
"""
import argparse, glob, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
DAY = re.compile(r"(?i)\bday\s*[1-9]\b|\btomorrow\b|\bday after\b|\bcycle\b")
R1 = re.compile(r"\bR1\.\d+\b")
NO_LANE = re.compile(r"(?i)^\W*(none( yet)?|no lane|tbd|-|—|\?)?\W*$")
MIN_DAYS = 2


def newest(design, track):
    files = []
    for f in glob.glob(os.path.join(design, f"board-lead-{track}-*.md")):
        m = re.search(r"(\d{4}-\d{2}-\d{2})", os.path.basename(f))
        if m:
            files.append((m.group(1), f))
    return max(files)[1] if files else None


def cells(line):
    return [c.strip() for c in line.strip().strip("|").split("|")]


def read_board(path):
    """-> (days, rows, ids) where rows = [(capability text, left to build, lane)] and ids the R1 ids in table rows."""
    days, cur_has, cur_day, rows, head = 0, False, False, [], None
    any_heading_day, ids = False, set()
    for line in open(path, encoding="utf-8"):
        if line.startswith("#"):
            if cur_day and cur_has:
                days += 1
            cur_day = bool(DAY.search(line))   # a title naming the cycle is the first day
            any_heading_day |= cur_day
            cur_has = False
            continue
        if not line.startswith("|"):
            continue
        c = cells(line)
        if set("".join(c)) <= set("-: "):
            continue
        low = [x.lower() for x in c]
        if not any(R1.search(x) for x in c) and (any("left to build" in x for x in low) or any(x.startswith("lane") for x in low)):
            head = low
            continue
        if not any(R1.search(x) for x in c):
            continue
        cur_has = True
        ids |= set(R1.findall(line))
        if head:
            li = next((i for i, x in enumerate(head) if "left to build" in x), None)
            ni = next((i for i, x in enumerate(head) if x.startswith("lane")), None)
            ci = next((i for i, x in enumerate(head) if "capabilit" in x), 1)
            get = lambda i: c[i] if i is not None and i < len(c) else ""
            rows.append((get(ci), get(li), get(ni)))
        else:
            rows.append((line.strip(), "", ""))
    if cur_day and cur_has:
        days += 1
    if not any_heading_day and rows:
        days = 1
    return days, rows, ids


def partial_r1(caps):
    head, out = None, []
    for line in open(caps, encoding="utf-8"):
        if not line.startswith("|"):
            continue
        c = cells(line)
        if c and c[0] == "#":
            head = [x.lower() for x in c]
            continue
        if head and c and re.fullmatch(r"R1\.\d+", c[0]) and "status" in head:
            if c[head.index("status")].strip("* ") == "Partial":
                out.append(c[0])
    return out


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--design", default=os.path.join(HERE, "..", "design"))
    ap.add_argument("--caps", default=os.path.join(HERE, "..", "qa", "CAPABILITIES.md"))
    a = ap.parse_args(argv)
    acts, on = [], set()
    for track in ("a", "b"):
        f = newest(a.design, track)
        T = track.upper()
        if not f:
            acts.append(f"buffer: Track {T} has no board (design/board-lead-{track}-<date>.md): plan its next 2-3 days of capabilities (P-800)")
            continue
        days, rows, ids = read_board(f)
        on |= ids   # a capability counts as on a board only in a table row, never in the board's prose
        name = os.path.basename(f)
        print(f"buffer {name}: {days} day(s), {len(rows)} capabilities")
        if days < MIN_DAYS:
            acts.append(f"buffer: {name} lists {days} day(s) of capabilities (under {MIN_DAYS}): add the next day's section (P-800)")
        for cap, left, lane in rows:
            if left and not re.match(r"(?i)^\W*none\b", left) and NO_LANE.match(lane or ""):
                rid = (R1.search(cap) or R1.search(left) or [cap[:30]])[0]
                acts.append(f"buffer: {name} {rid}: open part \"{left[:60]}\" has no lane named: name a lane or a ready brief (P-800)")
    try:
        part = partial_r1(a.caps)
    except OSError as e:
        acts.append(f"buffer: qa/CAPABILITIES.md unreadable ({e}): Partial capabilities not checked (P-800)")
        part = []
    off = [p for p in part if p not in on]
    if off:
        acts.append(f"buffer: {len(off)} Partial capabilit{'y' if len(off) == 1 else 'ies'} on no track board: {' '.join(off)}: put each on Track A or B (P-800)")
    for l in acts:
        print("ACT   " + l)
    if not acts:
        print("ok    buffer: both boards hold 2+ days, every open part has a lane, every Partial capability is on a board")
    return len(acts)


if __name__ == "__main__":
    sys.exit(main())
