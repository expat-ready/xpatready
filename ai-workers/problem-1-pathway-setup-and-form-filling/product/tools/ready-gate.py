#!/usr/bin/env python3
"""Readiness gate (ENF-782a part 1; founder P-782 (2), 21 Nov: "a PR that says 'Completes: R1.n' fails unless every
part of R1.n has merged and its journey file exists"). Measured cause: on 21 Nov all three morning proofs (R1.42, R1.32,
R1.108) came back Partial because a part was still missing, e.g. R1.42's J-42 row lists FO-3st3 and no PR naming
FO-3st3 had merged.

stdin: the PR's body; env TITLE: its title. For each item on its "Completes:" lines (item-proof.mjs detect, the reader
item-proof.yml uses), the PR fails unless
  (1) every part listed for the item has merged on main, or is this PR (the part's id is in the PR's title). The parts
      are the lists the existing tools already keep, never a new one:
        * the row ids of the item's line in product/focus-list.md (waves.py focus_rows(), as focus-check.py reads it);
        * the ids on the "Parts it joins:" line of the item's J-row in BACKLOG*.md (the J-row whose area cell says
          "map row <n>"); "FO-3a parts 2a and 2b" means FO-3a2a and FO-3a2b; a (parenthesis) is a note;
        * the acceptance packs (C ids) and studio/tests suites its qa/CAPABILITIES.md row names (item-proof.mjs plan,
          the plan item-proof.yml proves at the merge): each must exist on main or in this PR.
      "Merged" = a "Merge pull request #N" commit on main whose PR title leads with the id: the first " — " segment of
      the title that names an id ("migration — runtime: FO-3a part 2a — the consult record" leads with FO-3a2a;
      "FO-13s part 2" is FO-13s2). Records, lead and qa PRs (title "records:", "lead:", "qa:") never count: a concept or
      brief is not the part (review M2). "This PR" = this PR's title leads with the id, read the same way. A part merged
      under a title that does not lead with it is named in the body, one line each: "Part FO-3st3 merged in #2650"; the
      gate checks that #2650's merge is on main and prints the line (review m1).
      The item's own J-row part (J-<n> of its journey) counts when the journey file exists.
  (2) its journey tests/journeys/j_<n>.ts (item-proof.mjs journeyOf, so R1.40 -> j_38.ts) exists on main or in this
      PR (the run checks out GitHub's merge of the PR into main, so both count).
An item already Works on CAPABILITIES.md is a fix re-proof: checked the same way. An item with no focus-list line and no
J-row is checked on (2) and its CAPABILITIES packs and suites only, with a warning naming the gap.

Mode (the switch, P-782: report-only for 2 hours on main, then blocking): READY_GATE=report|block|auto (default auto).
auto = report until 2 hours after this file first reached main (the commit date of main's first commit that added it),
then block. report prints each missing part as a warning and exits 0; block exits 1. The product queue waits on it
through "-check-failure = completes-ready" in .mergify.yml (a missing run never stalls a PR). Kill switch: the
repository variable READY_GATE=report (pr-rules.yml passes it).

Env (tests): READY_BASE (main's commit; default HEAD^1, the merge's first parent), READY_ROOT (repository root),
READY_NOW (ISO time), WAVES_FOCUS, FOCUS_BACKLOG_DIR (BACKLOG*.md), READY_CAPS, READY_STUDIO.
Stdlib only, US$0, no network (git and node only). Test: check-ready-gate.sh."""
import glob, importlib.util, json, os, re, subprocess, sys
from datetime import datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
PH = os.path.dirname(HERE)
ROOT = os.environ.get("READY_ROOT") or os.path.abspath(os.path.join(PH, "..", "..", ".."))
STUDIO = os.environ.get("READY_STUDIO") or os.path.join(PH, "..", "prototype", "studio")
CAPS = os.environ.get("READY_CAPS") or os.path.join(PH, "qa", "CAPABILITIES.md")
BACKLOG_DIR = os.environ.get("FOCUS_BACKLOG_DIR") or PH
ITEM_PROOF = os.path.join(PH, "..", "prototype", "studio", "tools", "item-proof.mjs")
SELF = "ai-workers/problem-1-pathway-setup-and-form-filling/product/tools/ready-gate.py"
REPORT_HOURS = 2

_spec = importlib.util.spec_from_file_location("waves", os.path.join(HERE, "waves.py"))
waves = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(waves)
ROW = waves.ROW
OVERRIDE = re.compile(r"^[\s>*-]*Part\s+(" + ROW.pattern + r")\s+merged in\s+#([0-9]{1,7})\b", re.M)
NOT_A_PART = re.compile(r"^\s*(records|lead|qa)\s*:", re.I)
PARTS = re.compile(r"(" + ROW.pattern + r")\s+parts?\s+([0-9][0-9a-z-]*(?:\s*(?:,|and|&)\s*[0-9][0-9a-z-]*)*)")
MAP_ROW = re.compile(r"map rows? ([0-9]+(?:\s*(?:,|and)\s*[0-9]+)*)")


def ids(text, expand_only=False):
    """Row ids in a text. "X part 2" / "X parts 2a and 2b" also give X2 / X2a, X2b; with expand_only, X itself is
    dropped when parts follow it (a J-row asking for parts 2a and 2b does not ask for all of X)."""
    text = re.sub(r"\([^()]*\)", " ", text)
    out, whole = set(), set()
    for m in PARTS.finditer(text):
        for s in re.split(r"\s*(?:,|and|&)\s*", m.group(2)):
            if s:
                out.add(m.group(1) + s)
        whole.add(m.group(1))
    for r in ROW.findall(text):
        if not (expand_only and r in whole):
            out.add(r)
    return out


def leading(title):
    """The ids a PR title leads with: its first " — " (or " - ") segment that names one, plus every QA-<n> bug id it
    names anywhere, brackets too ("FO-13i part 2 — an expired document is refused (QA-510)" fixes QA-510: builders
    write fixed bug ids that way, review m6); nothing for records, lead, qa."""
    if NOT_A_PART.match(title or ""):
        return set()
    bugs = set(re.findall(r"(?<![A-Za-z0-9-])QA-[0-9]+(?![0-9])", title or ""))
    for seg in re.split(r"\s+[—–]\s+|\s+-\s+", title or ""):
        got = ids(seg)
        if got:
            return got | bugs
    return bugs


def jrow_parts():
    """{item: {part ids}} from each J-row's "Parts it joins:" line in BACKLOG*.md."""
    m = {}
    for f in sorted(glob.glob(os.path.join(BACKLOG_DIR, "BACKLOG*.md"))):
        for l in open(f, encoding="utf-8").read().split("\n"):
            c = l.split("|")
            if len(c) < 5 or not re.fullmatch(r"J-[0-9]+", c[1].strip()):
                continue
            items = {"R1." + c[1].strip()[2:]}
            mr = MAP_ROW.search(c[2])
            if mr:
                items |= {"R1." + n for n in re.findall(r"[0-9]+", mr.group(1))}
            seg = re.search(r"Parts it joins:\s*(.*?)(?:\.\s+Walk:|\*\*Touch|$)", c[3])
            if not seg:
                continue
            parts = ids(seg.group(1).replace("*", ""), expand_only=True) - {c[1].strip()}
            for i in items:
                m.setdefault(i, set()).update(parts)
    return m


def merged_titles(base):
    """{id: [PR numbers]} from main's "Merge pull request #N" commits (the PR title is the message's next line), and
    the set of every PR number merged so."""
    try:
        out = subprocess.run(["git", "-C", ROOT, "log", base, "--merges", "--format=%x1e%B"], capture_output=True,
                             text=True, check=True).stdout
    except (subprocess.CalledProcessError, OSError) as e:
        print(f"ready-gate: cannot read main's history at {base}: {getattr(e, 'stderr', e)}"); sys.exit(2)
    got, prs = {}, set()
    for msg in out.split("\x1e"):
        lines = msg.strip().split("\n")
        mm = re.match(r"Merge pull request #([0-9]+) from ", lines[0]) if lines else None
        if not mm:
            continue
        prs.add(int(mm.group(1)))
        for r in leading(next((l for l in lines[1:] if l.strip()), "")):
            got.setdefault(r, []).append(int(mm.group(1)))
    return got, prs


def node(*args, stdin=None):
    p = subprocess.run(["node", ITEM_PROOF, *args], input=stdin, capture_output=True, text=True)
    return p.returncode, p.stdout, p.stderr


def mode(base):
    m = (os.environ.get("READY_GATE") or "auto").strip().lower()
    if m in ("report", "block"):
        return m, f"READY_GATE={m}"
    now = datetime.fromisoformat(os.environ["READY_NOW"].replace("Z", "+00:00")) if os.environ.get("READY_NOW") \
        else datetime.now(timezone.utc)
    # --first-parent -m: the date main took the file (its merge commit), never the branch commit's own date (review M1)
    p = subprocess.run(["git", "-C", ROOT, "log", base, "--first-parent", "-m", "--diff-filter=A", "--format=%cI", "--", SELF],
                       capture_output=True, text=True)
    first = [l for l in p.stdout.split("\n") if l.strip()]
    if p.returncode or not first:
        return "report", "the gate is not on main yet: report-only"
    since = datetime.fromisoformat(first[-1])
    until = since + timedelta(hours=REPORT_HOURS)
    if now < until:
        return "report", f"report-only until {until.astimezone(timezone.utc):%Y-%m-%d %H:%M} UTC (2 h after it reached main)"
    return "block", f"blocking since {until.astimezone(timezone.utc):%Y-%m-%d %H:%M} UTC"


def main():
    body = sys.stdin.read()
    title = os.environ.get("TITLE", "")
    base = os.environ.get("READY_BASE") or "HEAD^1"
    rc, out, err = node("detect", stdin=body)
    try:
        items = json.loads(out)["items"]
    except (ValueError, KeyError):
        print(f"ready-gate: item-proof.mjs detect failed: {err.strip()}"); return 2
    if not items:
        print("PASS  no Completes: line: nothing to check"); return 0
    md, why = mode(base)
    os.environ.setdefault("WAVES_FOCUS", os.path.join(PH, "focus-list.md"))
    focus = {}
    for r, its in waves.focus_rows().items():
        for i in its:
            focus.setdefault(i, set()).add(r)
    (merged, prs), jparts, mine = merged_titles(base), jrow_parts(), leading(title)
    said = {}
    for r, n in OVERRIDE.findall(body):
        said[r] = int(n)
    missing_all = 0
    for item in items:
        rc, out, err = node("plan", item, "--caps", CAPS, "--studio", STUDIO)
        try:
            pl = json.loads(out)
        except ValueError:
            print(f"FAIL  {item}: item-proof.mjs plan failed: {err.strip()}"); missing_all += 1; continue
        parts = sorted(focus.get(item, set()) | jparts.get(item, set()))
        jm = re.search(r"j_([0-9]+)\.ts$", pl.get("journey") or "")
        jid = f"J-{jm.group(1)}" if jm else None   # the J-row part is the journey file itself
        miss = []
        if not focus.get(item) and not jparts.get(item):
            print(f"::warning title=ready-gate {item}::{item} has no line in focus-list.md and no J-row with \"Parts it joins:\" "
                  f"in BACKLOG.md, so only its journey and its CAPABILITIES packs and suites were checked")
        for p in parts:
            if p in mine:
                print(f"ok    {item}: part {p} is this PR")
            elif p in merged:
                print(f"ok    {item}: part {p} merged in #{max(merged[p])}")
            elif p == jid and pl.get("journeyExists"):
                print(f"ok    {item}: part {p} is its journey {pl.get('journey')}, on main or in this PR")
            elif p in said and said[p] in prs:
                print(f"ok    {item}: part {p} merged in #{said[p]} (the body says so; #{said[p]}'s merge is on main)")
            else:
                src = " and ".join(s for s, d in (("focus-list.md", focus), ("its J-row", jparts)) if p in d.get(item, set()))
                miss.append(f"part {p} (listed in {src}) has not merged on main and is not this PR (no merged PR title names it; "
                            f"if this PR is that part, lead its title with {p}; if a PR merged it under another name, add a line \"Part {p} merged in #<n>\")")
        for c in pl.get("packsMissing", []):
            miss.append(f"acceptance pack {c} (named on its qa/CAPABILITIES.md row) has no file under studio/acceptance on main or in this PR")
        for s in pl.get("suitesMissing", []):
            miss.append(f"suite tests/{s} (named in its Done when on qa/CAPABILITIES.md) is not on main or in this PR")
        if not pl.get("found"):
            miss.append(f"{item} has no row in qa/CAPABILITIES.md")
        if not pl.get("journeyExists"):
            miss.append(f"its journey {pl.get('journey')} is not on main or in this PR")
        for x in miss:
            print(f"FAIL  {item}: {x}")
        if not miss:
            print(f"PASS  {item}: every listed part is on main or this PR ({len(parts)} parts), and {pl.get('journey')} exists")
        missing_all += len(miss)
    if not missing_all:
        return 0
    if md == "report":
        print(f"::warning title=ready-gate (report-only)::{missing_all} missing part(s) above; {why}. "
              "Once blocking, this PR cannot enter the product queue until they merge (re-run: edit the body or push).")
        return 0
    print(f"::error title=ready-gate::{missing_all} missing part(s) above ({why}). Merge them first, or move the "
          "\"Completes:\" line to the PR that lands the last part; once they merge, re-run this check (edit the body or push).")
    return 1


if __name__ == "__main__":
    sys.exit(main())
