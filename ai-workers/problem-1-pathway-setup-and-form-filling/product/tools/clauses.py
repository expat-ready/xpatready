#!/usr/bin/env python3
# A389 part 1 (founder 25 Nov ~15:1x IST: "Partial % = acceptance clauses the tester has confirmed ÷ all clauses in the
# row's capability text"): each R1 row's acceptance text ("Done when", what qa tests) split into clauses, held as data in
# qa/clauses.tsv, one line per clause. Only qa sets a clause's status (P-219, P-314); merging moves nothing. Stdlib, offline, US$0.
#   clauses.py seed     add the clauses of any R1 row missing from clauses.tsv, and re-split a row whose acceptance text
#                       changed (a clause whose text is unchanged keeps its status; a new or reworded clause starts "not")
#   clauses.py check    exit 1 on: an R1 row with no clauses or clauses that no longer match its acceptance text, a bad
#                       status, a Works row with an unconfirmed clause, a confirmed clause without evidence (a qa/ file
#                       that exists, a commit, a date), a line for a row that is not R1
#   clauses.py pct      row → confirmed/all and % (tab-separated), for the two-sided board (part 2)
# Seeding a Works row confirms its clauses from qa's own row verdict (its Tested-on commit and date, the first qa report
# path in its note that exists, else the row's note in qa/CAPABILITIES.md); every other row starts with every clause "not".
# Paths: CLAUSES_ROOT (the product folder), CLAUSES_TSV, CLAUSES_CAPS override the files (the check's throwaway copies).
import os, re, sys

P = os.environ.get("CLAUSES_ROOT") or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TSV = os.environ.get("CLAUSES_TSV", os.path.join(P, "qa", "clauses.tsv"))
CAPS = os.environ.get("CLAUSES_CAPS", os.path.join(P, "qa", "CAPABILITIES.md"))
HEAD = ["row", "no", "clause", "status", "evidence", "commit", "date"]
STATUS = ("confirmed", "not")
MON = {m: i + 1 for i, m in enumerate("Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split())}


def clean(s):
    return re.sub(r"\s+", " ", s.replace("**", "").replace("`", "")).strip(" .")


def split(text):
    """Clauses of an acceptance text: cut at ";" outside brackets; empty parts dropped."""
    out, depth, cur = [], 0, ""
    for ch in text:
        depth += (ch in "([") - (ch in ")]")
        if ch == ";" and depth <= 0:
            out.append(cur); cur = ""
        else:
            cur += ch
    out.append(cur)
    return [c for c in map(clean, out) if c]


def rows():
    """R1 rows of CAPABILITIES.md: id → dict(status, tested, note, accept)."""
    r = {}
    for line in open(CAPS, encoding="utf-8"):
        if not line.startswith("| R1."):
            continue
        c = [x.strip() for x in line.split("|")]
        if len(c) < 9:
            continue
        r[c[1]] = {"status": c[4].replace("*", "").strip(), "tested": c[5], "note": c[8], "accept": c[7] or c[2]}
    return r


def read():
    if not os.path.exists(TSV):
        return []
    out = []
    for n, line in enumerate(open(TSV, encoding="utf-8"), 1):
        line = line.rstrip("\n")
        if not line or line.startswith("#") or line.startswith("row\t"):
            continue
        f = line.split("\t") + [""] * 7
        out.append(dict(zip(HEAD, f[:7]), line=n))
    return out


def write(lines):
    with open(TSV, "w", encoding="utf-8") as fh:
        fh.write("# A389 clauses (tools/clauses.py). Status: confirmed / not, set only by qa (P-219, P-314) on a walk, with its\n"
                 "# evidence (a qa/ report path), the commit it tested and the date. Clause text is the row's Done when, cut at \";\".\n")
        fh.write("\t".join(HEAD) + "\n")
        for l in lines:
            fh.write("\t".join(str(l[k]) for k in HEAD) + "\n")


def num(r):
    return [int(x) for x in re.findall(r"\d+", r)]


def verdict(row):
    """A Works row's own qa verdict: (evidence, commit, date) or None."""
    m = re.match(r"([0-9a-f]{7,})\s+(\d{1,2}) (\w{3})", row["tested"])
    if not m or m.group(3) not in MON:
        return None
    paths = [p for p in re.findall(r"qa/(?:reports|verdicts)/[\w.+-]+(?:/[\w.+-]+)*\.md", row["note"]) if os.path.exists(os.path.join(P, p))]
    return (paths[0] if paths else "qa/CAPABILITIES.md", m.group(1), "2026-%02d-%02d" % (MON[m.group(3)], int(m.group(2))))


def seed():
    caps, old = rows(), read()
    by = {}
    for l in old:
        by.setdefault(l["row"], []).append(l)
    out, added, resplit = [], 0, 0
    for rid in sorted(caps, key=num):
        want = split(caps[rid]["accept"])
        have = by.get(rid, [])
        if [l["clause"] for l in have] == want:
            out += have; continue
        keep = {l["clause"]: l for l in have}
        v = verdict(caps[rid]) if caps[rid]["status"] == "Works" else None
        for i, t in enumerate(want, 1):
            k = keep.get(t)
            if k:
                out.append(dict(k, no=i))
            elif v and not have:
                out.append(dict(row=rid, no=i, clause=t, status="confirmed", evidence=v[0], commit=v[1], date=v[2]))
            else:
                out.append(dict(row=rid, no=i, clause=t, status="not", evidence="", commit="", date=""))
        added += not have; resplit += bool(have)
    write(out)
    print(f"clauses.tsv: {len(out)} clauses for {len(caps)} R1 rows ({added} rows added, {resplit} re-split)")


def check():
    caps, lines, bad = rows(), read(), []
    by = {}
    for l in lines:
        by.setdefault(l["row"], []).append(l)
    for rid, ls in by.items():
        if rid not in caps:
            bad.append(f"{rid}: in clauses.tsv but not an R1 row of qa/CAPABILITIES.md")
    for rid in sorted(caps, key=num):
        ls = by.get(rid, [])
        st = caps[rid]["status"]
        if not ls:
            bad.append(f"{rid}: no clauses (run tools/clauses.py seed)"); continue
        if [l["clause"] for l in ls] != split(caps[rid]["accept"]) or [l["no"] for l in ls] != [str(i) for i in range(1, len(ls) + 1)]:
            bad.append(f"{rid}: clauses no longer match its Done when (run tools/clauses.py seed; reworded clauses start \"not\")")
        for l in ls:
            w = f"{rid} clause {l['no']}"
            if l["status"] not in STATUS:
                bad.append(f"{w}: status \"{l['status']}\" is not confirmed or not (line {l['line']})"); continue
            if l["status"] == "confirmed":
                ev = l["evidence"]
                if not (ev.startswith("qa/") and os.path.exists(os.path.join(P, ev))):
                    bad.append(f"{w}: confirmed without evidence (a qa/ report path that exists; got \"{ev}\")")
                if not re.fullmatch(r"[0-9a-f]{7,40}", l["commit"]):
                    bad.append(f"{w}: confirmed without the commit it tested")
                if not re.fullmatch(r"\d{4}-\d\d-\d\d", l["date"]):
                    bad.append(f"{w}: confirmed without a date (YYYY-MM-DD)")
            elif st == "Works":
                bad.append(f"{w}: the row is Works but this clause is not confirmed: \"{l['clause'][:80]}\"")
    for b in bad:
        print("CLAUSES: " + b)
    print(f"clauses: {len(lines)} clauses, {len(caps)} R1 rows, {len(bad)} problems")
    return 1 if bad else 0


def pct():
    by = {}
    for l in read():
        c = by.setdefault(l["row"], [0, 0])
        c[1] += 1; c[0] += l["status"] == "confirmed"
    for rid in sorted(by, key=num):
        y, n = by[rid]
        print(f"{rid}\t{y}/{n}\t{100 * y // n if n else 0}")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "seed":
        seed()
    elif cmd == "check":
        sys.exit(check())
    elif cmd == "pct":
        pct()
    else:
        print(__doc__ or "usage: clauses.py seed|check|pct"); sys.exit(2)
