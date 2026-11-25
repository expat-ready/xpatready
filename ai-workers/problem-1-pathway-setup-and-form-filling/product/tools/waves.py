#!/usr/bin/env python3
"""Release 1 waves as code (B204; P-745, founder 20 Nov: "enforceable and ... followed mandatory by the agents through
the hooks"). The one hand-kept list is product/design/waves.tsv (R1 id, wave, journey, optional note); statuses come from
qa/CAPABILITIES.md (Works = Proven). Stdlib only, US$0, no network except `wip`, which asks gh for open PRs when no
--prs file is given.

  waves.py gen [--stdout]   write the generated block of design/waves.md (between the two "waves.py gen" markers)
  waves.py ids              exit 1 unless waves.tsv holds every R1 id of CAPABILITIES.md exactly once and no other
  waves.py check            exit 1 when the block differs from gen in anything but statuses (check-waves.sh, guards)
  waves.py allow R1.x ...   exit 0 only when every item may start a lane: wave 0 (already Proven: fixes, P-214), the
                            active wave, the next one, a wave below the active one (finishing its last 3 or fewer
                            items), or a note "allow: <reason>"; else one "OUTSIDE WAVE" line
  waves.py pr               stdin: a PR's title (first line) and body; one "OUTSIDE WAVE" line per item it names
                            (title R1.x, body "Item:" or "Completes:" lines) outside the open waves; exit 1 when any
                            (pr-rules.yml flags it with the label outside-wave and a warning, never a failure, P-214)
  waves.py none-ok          stdin: a lane brief whose Item line says "none"; exit 0 when the row it is for (after
                            "/next <area>" or "Row") has a tooling, qa, records or Lead area in BACKLOG*.md, or it
                            names no row; else exit 1 with the reason (brief-check.sh --brief; focus-check.py's rule)
  waves.py active           print the active wave and the waves open for lane starts
  waves.py wip [--prs F] [--lanes F]   building (an open non-draft PR or a lane naming the item) against cap 8 and
                            Built-not-Proven (status "Built...") against cap 12; one ACT line per breach and per item
                            building outside the open waves; exit = the number of ACT lines. Under the caps too
                            (ENF-761 part 1, founder 20 Nov: the Lead "always forgets" to fill lanes): an ACT when
                            under 8 are building while items of the open waves 1-4 (not Works, not Built) have no
                            open non-draft PR or lane, and when under 4 qa lanes (app view titles "qa N") run while
                            items are Built-not-Proven (skipped when the app view was not read: it is its own ACT)

Active wave: the lowest wave 1-4 with more than 3 unproven items (P-745 (2): wave N+2 waits until wave N has at most 3).
An item is named by a PR when its title says R1.x, its body has a line "Item: R1.x" or "Completes: R1.x", or its title
names a row that product/focus-list.md maps to the item; a lane, when its app view line (state/app-view-latest.txt,
app-view-save.sh) does the same. Env (tests): WAVES_TSV, WAVES_MD, WAVES_CAPS, WAVES_FOCUS, WAVES_APP_VIEW.
Tests: check-waves.sh."""
import json, os, re, subprocess, sys

PH = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TSV = os.environ.get("WAVES_TSV") or os.path.join(PH, "design", "waves.tsv")
MD = os.environ.get("WAVES_MD") or os.path.join(PH, "design", "waves.md")
CAPS = os.environ.get("WAVES_CAPS") or os.path.join(PH, "qa", "CAPABILITIES.md")
FOCUS = os.environ.get("WAVES_FOCUS") or os.path.join(PH, "focus-list.md")
BACKLOG_DIR = os.environ.get("FOCUS_BACKLOG_DIR") or PH
APP_VIEW = os.environ.get("WAVES_APP_VIEW") or os.path.join(PH, "state", "app-view-latest.txt")
CAP_BUILDING, CAP_BUILT, CAP_QA = 8, 12, 4
OPEN_AFTER = 3   # a wave stays active while it has more than 3 unproven items
START = "<!-- waves.py gen: start (generated from design/waves.tsv and qa/CAPABILITIES.md; edit waves.tsv, then run tools/waves.py gen) -->"
END = "<!-- waves.py gen: end -->"
ITEM = re.compile(r"(?<![A-Za-z0-9.])R1\.[0-9]+(?![0-9])")
ROW = re.compile(r"(?<![A-Za-z0-9/-])(?:[A-Z]{1,4}-[0-9A-Za-z]+|B[0-9]+[a-z]?)(?![A-Za-z0-9])")
OWN = re.compile(r"(?:/next [a-z]+|(?<![A-Za-z])[Rr]ow) (" + ROW.pattern + ")")
EXEMPT_AREA = re.compile(r"^\s*(tooling|qa|records|tech lead|lead)\s*([(;,:./]|$)", re.I)   # as focus-check.py
NAMES = {0: "Proven before the waves (fixes only)", 1: "Finish", 2: "Next", 3: "Rest of Partial", 4: "Not built"}
num = lambda i: int(i[3:])


def die(msg):
    print(msg); sys.exit(2)


def read_tsv():
    """[(id, wave, journey, note)] in file order; exits 2 on a malformed line, so a broken list never passes silently."""
    try:
        lines = open(TSV, encoding="utf-8").read().split("\n")
    except OSError:
        die(f"waves: cannot read {TSV}")
    out = []
    for n, l in enumerate(lines, 1):
        if not l.strip() or l.startswith("#"):
            continue
        c = l.split("\t")
        if len(c) < 3 or not ITEM.fullmatch(c[0]) or c[1] not in ("0", "1", "2", "3", "4") or not c[2].strip():
            die(f"waves: {TSV} line {n} is not 'R1.<n> <tab> 0-4 <tab> journey [<tab> note]': {l!r}")
        out.append((c[0], int(c[1]), c[2].strip(), c[3].strip() if len(c) > 3 else ""))
    return out


def read_caps():
    """{R1 id: status} from the R1 table of CAPABILITIES.md (the Status column by its header)."""
    try:
        text = open(CAPS, encoding="utf-8").read()
    except OSError:
        die(f"waves: cannot read {CAPS}")
    st, col = {}, None
    for l in text.split("\n"):
        c = [x.strip() for x in l.split("|")]
        if "Status" in c and c[1] == "#":
            col = c.index("Status")
        elif col and len(c) > col and ITEM.fullmatch(c[1]):
            st[c[1]] = c[col]
        elif not l.lstrip().startswith("|"):
            col = None   # the R1 table ended; a later table's columns are its own
    if not st:
        die(f"waves: no R1 rows with a Status column in {CAPS}")
    return st


proven = lambda s: (s.split() or [""])[0] == "Works"


def open_waves(rows, st):
    """(active wave or None, the set of waves open for lane starts)."""
    left = {w: sum(1 for i, ww, _, _ in rows if ww == w and not proven(st.get(i, ""))) for w in (1, 2, 3, 4)}
    active = next((w for w in (1, 2, 3, 4) if left[w] > OPEN_AFTER), None)
    # every wave up to the next one: a wave below the active one is finishing (its last 3 or fewer items), never closed
    return active, ({0} | (set(range(1, active + 2)) & {1, 2, 3, 4}) if active else {0, 1, 2, 3, 4})


def gen_block(rows, st):
    active, ok = open_waves(rows, st)
    count = {}
    for s in st.values():
        count[s] = count.get(s, 0) + 1
    out = [START, "## Waves as code (B204)", "",
           "Now: " + ", ".join(f"{n} {s}" for s, n in sorted(count.items(), key=lambda x: -x[1]))
           + f"; active wave {active or 'none'}; lane starts open for waves {', '.join(map(str, sorted(ok)))}"
           + "".join(f"; {i} by note" for i, w, _, note in rows if note.startswith("allow:") and w not in ok) + ".", ""]
    for w in (0, 1, 2, 3, 4):
        mine = [r for r in rows if r[1] == w]
        out += [f"### Wave {w}: {NAMES[w]} ({len(mine)})", "", "| Journey | Items |", "|---|---|"]
        for j in sorted({r[2] for r in mine}, key=lambda j: (not j.startswith("J"), int(j[1:]) if j[1:].isdigit() else 99, j)):
            out.append(f"| {j} | " + ", ".join(f"{i} ({st.get(i, 'not in CAPABILITIES')})" + (" *" if note else "")
                                              for i, _, jj, note in sorted(mine, key=lambda r: num(r[0])) if jj == j) + " |")
        out.append("")
    notes = [f"{i}: {note}" for i, _, _, note in sorted(rows, key=lambda r: num(r[0])) if note]
    if notes:
        out += ["\\* " + "; ".join(notes), ""]
    return "\n".join(out + [END])


def split_md():
    try:
        text = open(MD, encoding="utf-8").read()
    except OSError:
        return None, None, None
    a = text.find(START.split(" (")[0])   # the start marker by its fixed words; its explanation may differ
    b = text.find(END, a)
    if a < 0 or b < 0:
        return text, None, None
    return text[:a], text[a:b + len(END)], text[b + len(END):]


def norm(block):   # statuses and the "Now:" line move with every qa verdict; membership must not drift
    return [re.sub(r"(R1\.[0-9]+) \(.*?\)(?=(?: \*)?(?:, R1\.| \|))", r"\1", l) for l in block.split("\n") if not l.startswith("Now:")]


def names_in(text, rowmap):
    found = set(ITEM.findall(text))
    for r in ROW.findall(text):
        found |= rowmap.get(r, set())
    return found


def focus_rows():
    """{row id: {R1 ids}} from the focus list (focus-check.py's table format)."""
    m = {}
    try:
        for l in open(FOCUS, encoding="utf-8").read().split("\n"):
            c = [x.strip() for x in l.split("|")]
            if len(c) >= 4 and ITEM.match(c[1]):
                for r in ROW.findall(c[2]):
                    m.setdefault(r, set()).update(ITEM.findall(c[1]))
    except OSError:
        pass
    return m


def pr_items(p, rowmap):
    got = names_in(p.get("title") or "", rowmap)
    for l in (p.get("body") or "").replace("\r", "").split("\n"):
        if re.match(r"^[\s>*-]*(item|completes):", l, re.I):
            got |= set(ITEM.findall(l))
    return got


def wip(args):
    rows, st = read_tsv(), read_caps()
    wave = {i: w for i, w, _, _ in rows}
    note = {i: n for i, _, _, n in rows}
    active, ok = open_waves(rows, st)
    rowmap = focus_rows()
    val = lambda k: args[args.index(k) + 1] if k in args[:-1] else die(f"waves: {k} needs a file") if k in args else None
    prf = val("--prs")
    try:
        raw = open(prf, encoding="utf-8").read() if prf else subprocess.run(
            ["gh", "pr", "list", "--state", "open", "--limit", "200", "--json", "number,title,body,isDraft,headRefName"],
            capture_output=True, text=True, timeout=60).stdout
        prs = json.loads(raw)
    except (OSError, ValueError, subprocess.SubprocessError) as e:
        print(f"ACT   wip: open PRs unreadable ({e}): building not counted"); return 1
    lanef = val("--lanes") or APP_VIEW
    try:
        view = open(lanef, encoding="utf-8").read()
        lanes = [l.split(" · ")[0] for l in view.split("\n") if re.match(r"^(FLAG|ok) ", l)]
        # ENF-761 review: a saved UNREADABLE line (signed out) or no "app view N sessions" header is not a read view:
        # 0 qa lanes from it would be a false ACT, so it counts as not read.
        if re.search(r"^UNREADABLE", view, re.M) or not re.search(r"^app view \d+ sessions", view, re.M):
            lanes = None
    except OSError:
        lanes = None
    by = {}
    for p in prs:
        if p.get("isDraft") or (p.get("headRefName") or "").startswith("mergify/"):
            continue
        for i in pr_items(p, rowmap):
            by.setdefault(i, []).append(f"#{p.get('number')}")
    for t in lanes or []:
        for i in names_in(t, rowmap):
            by.setdefault(i, []).append("lane")
    building = sorted((i for i in by if not proven(st.get(i, ""))), key=num)
    built = sorted((i for i, s in st.items() if s.startswith("Built")), key=num)
    acts = 0
    print(f"wip   building {len(building)} (cap {CAP_BUILDING}): " + (", ".join(f"{i} {'/'.join(dict.fromkeys(by[i]))}" for i in building) or "none")
          + f" · Built-not-Proven {len(built)} (cap {CAP_BUILT}): " + (", ".join(built) or "none")
          + f" · active wave {active or 'none'}, open {', '.join(map(str, sorted(ok)))}"
          + ("" if lanes is not None else " · lanes not read (no app view file)"))
    if len(building) > CAP_BUILDING:
        acts += 1; print(f"ACT   wip: {len(building)} items building, over the cap of {CAP_BUILDING} (P-745): no new item starts; builders help close proofs")
    if len(built) > CAP_BUILT:
        acts += 1; print(f"ACT   wip: {len(built)} items Built-not-Proven, over the cap of {CAP_BUILT} (P-745): qa and builders prove before building")
    # ENF-761 part 1: running UNDER the caps while work waits is an ACT too (Built items wait for qa, not a lane).
    waiting = sorted((i for i, w, _, _ in rows if w in ok - {0} and i not in by and not proven(st.get(i, ""))
                      and not st.get(i, "").startswith("Built")), key=num)
    if len(building) < CAP_BUILDING and waiting:
        acts += 1; print(f"ACT   capacity: building {len(building)} of {CAP_BUILDING} while the active or next wave has {len(waiting)} items with no "
                         f"lane or open PR: start lanes (cards if this is not a founder-typed turn) · first: {', '.join(waiting[:5])}")
    qa = sum(1 for t in lanes if re.match(r"^(?:FLAG|ok)\s+qa\s*\d", t, re.I)) if lanes is not None else None
    if qa is not None and qa < CAP_QA and built:
        acts += 1; print(f"ACT   capacity: qa lanes {qa} of {CAP_QA} while {len(built)} items are built and not proven")
    for i in sorted(by, key=num):
        if i in wave and wave[i] not in ok and not note.get(i, "").startswith("allow:"):
            acts += 1; print(f"ACT   wip: {i} (wave {wave[i]}) is being built by {', '.join(dict.fromkeys(by[i]))}, outside the open waves {', '.join(map(str, sorted(ok)))} (P-745 (3)): finish the current PR, then stop")
    return acts


def main(argv):
    cmd = argv[0] if argv else ""
    if cmd == "wip":
        return wip(argv[1:])
    if cmd == "none-ok":
        import glob
        own = OWN.search(sys.stdin.read().replace("\r", ""))
        if not own:
            return 0
        area = {}
        for f in sorted(glob.glob(os.path.join(BACKLOG_DIR, "BACKLOG*.md"))):
            for l in open(f, encoding="utf-8").read().split("\n"):
                c = l.split("|")
                if len(c) > 3 and ROW.fullmatch(c[1].strip()):
                    area.setdefault(c[1].strip(), c[2].strip())
        r = own.group(1)
        if r in area and EXEMPT_AREA.match(area[r]):
            return 0
        print(f"row {r} is " + (f"a build row (area: {area[r][:40]})" if r in area else "not a BACKLOG row")
              + ", so its brief names its R1 item (Item: R1.x), not none (B204)")
        return 1
    rows, st = read_tsv(), read_caps()
    if cmd == "gen":
        block = gen_block(rows, st)
        if "--stdout" in argv:
            print(block); return 0
        head, old, tail = split_md()
        if head is None:
            die(f"waves: cannot read {MD}")
        if old is None:
            die(f"waves: {MD} has no '{START[:25]}...' and '{END}' markers; add them where the block goes")
        open(MD, "w", encoding="utf-8").write(head + block + tail)
        print(f"waves: wrote the generated block of {MD}"); return 0
    if cmd == "ids":
        have = [r[0] for r in rows]
        miss = sorted(set(st) - set(have), key=num); extra = sorted(set(have) - set(st), key=num)
        dup = sorted({i for i in have if have.count(i) > 1}, key=num)
        if miss or extra or dup:
            print("WAVES LIST: design/waves.tsv " + "; ".join(x for x in (
                miss and "lacks " + ", ".join(miss), extra and "has ids not in CAPABILITIES.md: " + ", ".join(extra),
                dup and "has twice: " + ", ".join(dup)) if x) + " (P-745: every R1 item has one wave)"); return 1
        print(f"waves.tsv: all {len(have)} R1 ids of CAPABILITIES.md, once each"); return 0
    if cmd == "check":
        head, old, _ = split_md()
        if old is None:
            print(f"WAVES PAGE: {MD} is missing or has no generated block; run tools/waves.py gen"); return 1
        if norm(old) != norm(gen_block(rows, st)):
            print(f"WAVES PAGE: the generated block of {MD} differs from design/waves.tsv; run tools/waves.py gen and commit"); return 1
        return 0
    if cmd == "pr":
        title, _, body = sys.stdin.read().replace("\r", "").partition("\n")
        wave = {i: (w, note) for i, w, _, note in rows}
        active, ok = open_waves(rows, st)
        out = [f"OUTSIDE WAVE: {i} is in wave {wave[i][0]}; open waves {', '.join(map(str, sorted(ok)))} (P-745). A fix still merges (P-214); new work on it waits for its wave."
               for i in sorted(pr_items({"title": title, "body": body}, {}), key=num)
               if i in wave and wave[i][0] not in ok and not wave[i][1].startswith("allow:")]
        print("\n".join(out)) if out else None
        return 1 if out else 0
    if cmd == "active":
        active, ok = open_waves(rows, st)
        print(f"active wave {active or 'none'}; lane starts open for waves {', '.join(map(str, sorted(ok)))}"); return 0
    if cmd == "allow":
        ids = argv[1:]
        if not ids or not all(ITEM.fullmatch(i) for i in ids):
            die("usage: waves.py allow R1.<n> [R1.<n> ...]")
        wave = {i: (w, note) for i, w, _, note in rows}
        active, ok = open_waves(rows, st)
        bad = []
        for i in ids:
            if i not in wave:
                bad.append(f"{i} is not in design/waves.tsv")
            elif wave[i][0] not in ok and not wave[i][1].startswith("allow:"):
                bad.append(f"{i} is in wave {wave[i][0]}")
        if bad:
            print(f"OUTSIDE WAVE: {'; '.join(bad)}; lane starts are open for waves {', '.join(map(str, sorted(ok)))} only "
                  f"(active wave {active}, the waves below it finishing, the next one; wave 0 = Proven, fixes) (P-745: at most 8 items building, one wave "
                  "built while the previous is proved). Brief an item of an open wave, or the Lead changes design/waves.tsv with a DECISIONS row first.")
            return 1
        return 0
    print(__doc__); return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
