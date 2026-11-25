#!/usr/bin/env python3
"""The Lead's start read, summed (OS-16; P-615, P-440b, P-446).

Reads the table in product/LEAD-START.md (| # | File | Part | Why |), adds up the bytes of what each row names and
divides by 4 (about one token each). Prints one START READ line with the total and each row's share. Exit 0 under the
fail line (a WARN line over the warn line), 1 over the fail line or when a row names a missing file, section or part.
A file is looked up in product/, then at the repository root. Parts: `all`; `§ <heading start>` (from that heading to
the next heading at the same or a higher level; several joined by ` · `); `rows newer than RULES as-of` (DECISIONS rows
`| P-n |` with n above RULES.md's first-line "as of **P-NNN**").
    python3 -I start-read.py --product <product dir> --root <repository root> [--warn 40000] [--fail 70000]
Run by check-docs.sh; silent (exit 0) when LEAD-START.md is absent. Test: check-start-read.sh.
"""
import argparse, os, re, sys

WARN, FAIL = 40000, 70000   # P-615 says at most 70k today; 40k is OS-16's target until a Lead row amends P-615


def section(text, start):
    lines = text.split("\n"); out = None; level = 0
    for ln in lines:
        m = re.match(r"^(#{1,6}) +(.*)$", ln)
        if out is None:
            if m and m.group(2).strip().startswith(start):
                out = [ln]; level = len(m.group(1))
        else:
            if m and len(m.group(1)) <= level:
                break
            out.append(ln)
    return None if out is None else "\n".join(out) + "\n"


def newer_rows(product, text):
    try:
        with open(os.path.join(product, "RULES.md"), encoding="utf-8") as f:
            first = f.readline()
    except OSError:
        return None, "RULES.md is missing"
    m = re.search(r"as of \*\*P-(\d+)\*\*", first)
    if not m:
        return None, "RULES.md's first line has no 'as of **P-NNN**'"
    asof = int(m.group(1)); rows = []
    for ln in text.split("\n"):
        r = re.match(r"^\| P-(\d+) ", ln)
        if r and int(r.group(1)) > asof:
            rows.append(ln + "\n")
    return "".join(rows), None


def main():
    a = argparse.ArgumentParser()
    a.add_argument("--product", required=True); a.add_argument("--root", required=True)
    a.add_argument("--warn", type=int, default=WARN); a.add_argument("--fail", type=int, default=FAIL)
    o = a.parse_args()
    ls = os.path.join(o.product, "LEAD-START.md")
    if not os.path.isfile(ls):
        return 0
    with open(ls, encoding="utf-8") as f:
        table = f.read().split("\n")
    probs, parts, total, n = [], [], 0, 0
    for i, ln in enumerate(table, 1):
        c = [x.strip() for x in ln.split("|")]
        if len(c) < 6 or not re.fullmatch(r"\d+", c[1]):
            continue
        n += 1
        fm = re.fullmatch(r"`([^`]+)`", c[2])
        if not fm or ".." in fm.group(1).split("/") or os.path.isabs(fm.group(1)):
            probs.append("START READ: LEAD-START.md line %d: the File cell needs one backticked path inside the repository" % i); continue
        rel = fm.group(1)
        path = next((p for p in (os.path.join(o.product, rel), os.path.join(o.root, rel)) if os.path.isfile(p)), None)
        if not path:
            probs.append("START READ: LEAD-START.md line %d names %s, which is not in product/ or at the root" % (i, rel)); continue
        with open(path, encoding="utf-8", errors="replace") as f:
            text = f.read()
        part = c[3]
        if part == "all":
            got = text
        elif part == "rows newer than RULES as-of":
            got, err = newer_rows(o.product, text)
            if err:
                probs.append("START READ: LEAD-START.md line %d: %s" % (i, err)); continue
        elif part.startswith("§ "):
            got = ""; miss = []
            for h in [x.strip()[2:].strip() for x in part.split(" · ")]:
                s = section(text, h) if h else None
                if s is None: miss.append(h)
                else: got += s
            if miss:
                probs.append("START READ: LEAD-START.md line %d: %s has no heading starting '%s'" % (i, rel, "', '".join(miss))); continue
        else:
            probs.append("START READ: LEAD-START.md line %d: Part '%s' is not all, § <heading> or rows newer than RULES as-of" % (i, part[:40])); continue
        t = len(got.encode("utf-8")) // 4; total += t; parts.append("%s %.1fk" % (rel.replace(".claude/skills/", ""), t / 1000))
    if n == 0:
        probs.append("START READ: LEAD-START.md has no rows (| # | File | Part | Why |)")
    print("start read: %d tokens (bytes / 4) over %d row(s) of LEAD-START.md; warn over %d, fail over %d (P-615): %s"
          % (total, n, o.warn, o.fail, ", ".join(parts)))
    if total > o.fail:
        probs.append("START READ: %d tokens is over %d (P-615): cut a row or a section from LEAD-START.md, or shorten the file it names (records keep their facts: move old parts to product/history/)" % (total, o.fail))
    elif total > o.warn:
        print("WARN  START READ: %d tokens is over the %d target (OS-16, P-615)" % (total, o.warn))
    for p in probs:
        print(p)
    return 1 if probs else 0


if __name__ == "__main__":
    sys.exit(main())
