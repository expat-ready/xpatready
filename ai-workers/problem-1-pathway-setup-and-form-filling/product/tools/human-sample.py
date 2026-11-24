#!/usr/bin/env python3
# Human sample, enforced in code (ENF-782b part 2; founder P-782 (1), 21 Nov: "documented and implemented and enforced by
# hook or code"). Each week the founder walks 2 capabilities newly Proven that week on the demo and says, for each, whether
# everything is aligned. lead-watch.sh runs `check` every check:
#   due        Monday 10:00 IST (no ask yet that week), or 7 days since the last answer, with no ask open: picks 2 R1 rows
#              whose current Works streak on main began in the last 7 days (fewer: the most recently Proven rows not asked
#              before), writes the ask to product/qa/human-sample.md (row, demo path at :4400 from its journey file, what to
#              look for from the row's "Done when", "aligned? yes/no") and prints ACT "founder: human sample due".
#   open       the newest ask has a row with no answer line: ACT "founder: human sample due" each check; asked 7 days ago or
#              more: also a red "Needs you" ACT line.
#   no         an answer "no" whose row is still Works on main: ACT "reopen R1.n as Partial and log a qa bug" (qa sets the
#              status, P-314; the line stops once main no longer says Works).
#   answered   every row of the newest ask answered and nothing due: one quiet line.
#   on GitHub  (ENF-782b, P-557) an ask or answer counts only once it is on GitHub: origin/main's file, or this branch's
#              pushed upstream. Measured 24 Nov 23:3x IST: the first ask was due Monday 23 Nov 10:00 IST and no copy, branch
#              or PR held qa/human-sample.md, while each check that wrote one locally then read it back as "asked". Now an
#              ask or answer only in this copy is a red "Not on GitHub" ACT every check until it is pushed; a copy that lacks
#              an ask GitHub has is read from GitHub and writes nothing (it never asks a second time; pull first).
# Answers are recorded by the Lead from the founder's click: `human-sample.py answer R1.n yes|no "note"`, then committed.
# Usage: python3 -I product/tools/human-sample.py [check] [--now <ISO>] [--file F] [--caps-log F --caps F [--pushed F]] [--journeys D]
#        python3 -I product/tools/human-sample.py answer R1.26 no "the source filter is missing"
# Exit (check): number of ACT lines. Test: test_human_sample.py (no network, no git; run by cockpit-tests.yml).
import argparse, os, random, re, subprocess, sys
from datetime import datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
P = "ai-workers/problem-1-pathway-setup-and-form-filling"
CAPS = f"{P}/product/qa/CAPABILITIES.md"
FILE = os.path.join(ROOT, P, "product", "qa", "human-sample.md")
JOURNEYS = os.path.join(ROOT, P, "prototype", "studio", "tests", "journeys")
IST = timezone(timedelta(hours=5, minutes=30))
DEMO = "http://localhost:4400"
WEEK = timedelta(days=7)
ROW = re.compile(r"^\+\| (R1\.\d+) \|[^|]*\|[^|]*\| ([^|]+?) \|")
LINE = re.compile(r"^\| (R1\.\d+) \| ([^|]*)\|[^|]*\| ([^|]+?) \|[^|]*\|[^|]*\| ([^|]*)\|")
ASK = re.compile(r"^## Ask (\d{4}-\d{2}-\d{2} \d{2}:\d{2}) IST")
ANSWER = re.compile(r"^(?:[-*]\s+)?answer: (R1\.\d+) (yes|no)\b(?: \((\d{4}-\d{2}-\d{2} \d{2}:\d{2}) IST\))?(.*)$", re.I)
HEAD = ("# Human sample: the founder walks 2 newly Proven capabilities a week (P-782 (1))\n\n"
        "Written by `tools/human-sample.py` (lead-watch.sh). The Lead records the founder's answer for each row under its ask with "
        "`python3 -I product/tools/human-sample.py answer R1.n yes|no \"note\"` and commits. A \"no\" reopens the row as Partial "
        "with a qa bug; an ask unanswered for 7 days is a red \"Needs you\" line.\n")


def ist(d):
    return d.astimezone(IST).strftime("%Y-%m-%d %H:%M")


def parse_ist(s):
    return datetime.strptime(s, "%Y-%m-%d %H:%M").replace(tzinfo=IST)


def proven_since(log):
    """`git log --reverse --first-parent --diff-merges=first-parent -p --format='@@C %H %cI' -- CAPABILITIES.md` → per R1 row
    the time its current Works streak began on main (rows not Works now are left out)."""
    ev, cur = {}, None
    for line in log.splitlines():
        if line.startswith("@@C "):
            cur = datetime.fromisoformat(line.split()[2]); continue
        m = ROW.match(line)
        if m and cur:
            ev.setdefault(m.group(1), []).append((cur, m.group(2).strip()))
    out = {}
    for r, e in ev.items():
        if e[-1][1] != "Works":
            continue
        i = len(e) - 1
        while i > 0 and e[i - 1][1] == "Works":
            i -= 1
        out[r] = e[i][0]
    return out


def rows(caps):
    """CAPABILITIES.md on main → {R1.n: (name, status, done_when)}."""
    out = {}
    for line in caps.splitlines():
        m = LINE.match(line)
        if m:
            out[m.group(1)] = (m.group(2).strip(), m.group(3).strip(), m.group(4).strip())
    return out


def demo_path(row, jdir):
    f = os.path.join(jdir, f"j_{row.split('.')[1]}.ts")
    try:
        # the first page the journey opens (goto), never an API call
        with open(f, encoding="utf-8") as fh:
            m = re.search(r"\.goto\(\s*`\$\{BASE\}(/(?!api/)[^`$]*)`", fh.read())
    except OSError:
        m = None
    return (DEMO + m.group(1), True) if m else (DEMO + "/", False)


def read_asks(text):
    asks = []
    for line in text.splitlines():
        m = ASK.match(line)
        if m:
            asks.append({"at": parse_ist(m.group(1)), "rows": [], "answers": {}}); continue
        if not asks:
            continue
        a = ANSWER.match(line.strip())
        if a:
            asks[-1]["answers"][a.group(1).upper()] = (a.group(2).lower(), parse_ist(a.group(3)) if a.group(3) else None, a.group(4).strip(" —-"))
            continue
        r = re.match(r"^\| (R1\.\d+)\b", line)
        if r and r.group(1) not in asks[-1]["rows"]:
            asks[-1]["rows"].append(r.group(1))
    return asks


def monday_10(now):
    d = now.astimezone(IST)
    return (d - timedelta(days=d.weekday())).replace(hour=10, minute=0, second=0, microsecond=0)


def pick(proven, asked, now, seed, since=None):
    # "newly Proven that week": since the last ask (or 7 days, whichever reaches further back), never asked before
    lo = min(now - WEEK, since) if since else now - WEEK
    fresh = sorted(r for r, t in proven.items() if lo <= t <= now and r not in asked)
    rnd = random.Random(seed)
    got = rnd.sample(fresh, 2) if len(fresh) > 2 else fresh
    older = sorted((r for r in proven if r not in asked and r not in got and proven[r] <= now), key=lambda r: proven[r], reverse=True)
    return sorted(got + older[:2 - len(got)], key=lambda r: int(r.split(".")[1])), len(got)


def ask_block(now, picked, info, jdir, n_fresh):
    out = [f"\n## Ask {ist(now)} IST", "",
           f"Rows newly Proven on main (since the last ask, at least 7 days back): {n_fresh} of 2 picked from them" + ("" if n_fresh == 2 else "; the rest are the most recently Proven rows not asked before") + ".",
           "Walk each on the demo like a person; is everything aligned with what the row promises?", "",
           "| Row | On the demo (:4400) | What to look for | Aligned? |", "|---|---|---|---|"]
    for r in picked:
        name, _, done = info.get(r, ("?", "?", ""))
        url, known = demo_path(r, jdir)
        look = re.sub(r"\s+", " ", done.replace("|", "/"))[:280]
        out.append(f"| {r} {name} | {url}{'' if known else ' (no journey path on main: start here)'} | {look} | yes / no |")
    return "\n".join(out) + "\n"


def github_gap(text, pushed):
    """What of this copy's file is not on GitHub, and what GitHub has that this copy lacks (P-557).
    → (asks only here, answers only here as (ask time, row), asks only on GitHub)."""
    la, pa = read_asks(text), read_asks(pushed)
    pk, lk = {a["at"]: a for a in pa}, {a["at"] for a in la}
    here = [a for a in la if a["at"] not in pk]
    ans = [(a["at"], r) for a in la if a["at"] in pk for r in a["answers"] if r not in pk[a["at"]]["answers"]]
    return here, ans, [a for a in pa if a["at"] not in lk]


def check(now, text, proven, info, jdir, write, pushed=None):
    """→ (lines, new_text or None). pushed: the file as GitHub has it (None: not known, as before)."""
    pre = []
    if pushed is not None:
        here, ans, behind = github_gap(text, pushed)
        if behind:   # this copy is behind GitHub: judge GitHub's file, write nothing here
            pre.append(f"warn  this copy's product/qa/human-sample.md lacks the {', '.join(ist(a['at']) for a in behind)} IST ask GitHub has: read from GitHub; pull this copy")
            text, write = pushed, False
        elif here or ans:
            what = "; ".join([f"the {ist(a['at'])} IST ask ({', '.join(a['rows'])})" for a in here] + [f"the answer for {r} ({ist(t)} IST ask)" for t, r in ans])
            pre.append(f"ACT   \033[31mNot on GitHub\033[0m: {what} only in this copy's product/qa/human-sample.md, not on origin/main or this "
                       "branch's upstream (P-557): push it in a records PR now; until then the founder was not asked on the record")
    lines, new = check_text(now, text, proven, info, jdir, write)
    return pre + lines, new


def check_text(now, text, proven, info, jdir, write):
    """→ (lines, new_text or None)."""
    lines, asks = [], read_asks(text)
    for a in asks:   # a "no" stays an ACT while main says Works from before the answer (re-proven after it: done)
        for r, (ans, at, note) in a["answers"].items():
            if ans == "no" and info.get(r, (None, None))[1] == "Works" and (r not in proven or proven[r] <= (at or a["at"])):
                lines.append(f"ACT   reopen {r} as Partial and log a qa bug (founder said not aligned on the {ist(a['at'])[:10]} human sample{': ' + note if note else ''}; P-782 (1))")
    last = asks[-1] if asks else None
    if last and any(r not in last["answers"] for r in last["rows"]):
        left = [r for r in last["rows"] if r not in last["answers"]]
        lines.append(f"ACT   founder: human sample due ({', '.join(left)} unanswered, asked {ist(last['at'])} IST; product/qa/human-sample.md; card and push)")
        age = now - last["at"]
        if age >= WEEK:
            lines.append(f"ACT   \033[31mNeeds you\033[0m: human sample unanswered {age.days} days (asked {ist(last['at'])} IST; P-782 (1))")
        return lines, None
    answered = max([t for a in asks for (_, t, _) in a["answers"].values() if t] + ([last["at"]] if last else []), default=None)
    due = last is None or (answered and now - answered >= WEEK) or (now >= monday_10(now) and last["at"] < monday_10(now))
    if not due:
        nos = [r for r, (ans, _, _) in last["answers"].items() if ans == "no"]
        lines.append(f"human sample answered for the {ist(last['at'])[:10]} ask: " + (f"not aligned: {', '.join(nos)}" if nos else "all aligned") + f"; next due {ist(monday_10(now) + WEEK)} IST")
        return lines, None
    asked = {r for a in asks for r in a["rows"]}
    picked, n_fresh = pick(proven, asked, now, ist(now)[:10], last["at"] if last else None)
    if not picked:
        lines.append("warn  human sample due, but no Proven row is left to sample (every Works row on main was asked before); nothing written")
        return lines, None
    new = (text if text.strip() else HEAD) + ask_block(now, picked, info, jdir, n_fresh)
    lines.append(f"ACT   founder: human sample due ({', '.join(picked)}; written to product/qa/human-sample.md{'' if write else ' (not written: --no-write)'}: commit and push it now so no other copy writes a second ask, then ask the founder, card and push)")
    return lines, new


def answer(text, row, ans, note, now):
    asks = read_asks(text)
    if not asks or row not in asks[-1]["rows"]:
        sys.exit(f"human-sample: {row} is not in the newest ask")
    return text.rstrip("\n") + f"\nanswer: {row} {ans} ({ist(now)} IST){' — ' + note if note else ''}\n"


def git(*a):
    return subprocess.run(["git", "-C", ROOT, *a], capture_output=True, text=True).stdout


def on_github(rel, ref):
    """The file as GitHub has it: of this branch's upstream and origin/main (ref), the copy with the newest ask ("" when
    neither holds it). Tests pass --caps-log and skip this (no git)."""
    best = ""
    for r in ("@{u}", ref):
        if not git("rev-parse", "--verify", "-q", r).strip():
            continue
        t = git("show", f"{r}:{rel}") if subprocess.run(["git", "-C", ROOT, "cat-file", "-e", f"{r}:{rel}"], capture_output=True).returncode == 0 else ""
        newest = lambda x: max((q["at"] for q in read_asks(x)), default=datetime.min.replace(tzinfo=timezone.utc))
        if newest(t) > newest(best):
            best = t
    return best


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", nargs="?", default="check", choices=["check", "answer"])
    ap.add_argument("args", nargs="*")
    ap.add_argument("--now"); ap.add_argument("--file", default=FILE); ap.add_argument("--journeys", default=JOURNEYS)
    ap.add_argument("--caps-log"); ap.add_argument("--caps"); ap.add_argument("--no-write", action="store_true")
    ap.add_argument("--pushed", help="the file as GitHub has it (tests); default: read from this branch's upstream and origin/main")
    a = ap.parse_args()
    now = datetime.fromisoformat(a.now.replace("Z", "+00:00")) if a.now else datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)   # a --now with no zone is UTC
    text = open(a.file, encoding="utf-8").read() if os.path.exists(a.file) else ""
    if a.cmd == "answer":
        if len(a.args) < 2 or a.args[1].lower() not in ("yes", "no") or not re.fullmatch(r"R1\.\d+", a.args[0]):
            sys.exit('usage: human-sample.py answer R1.n yes|no ["note"]')
        open(a.file, "w", encoding="utf-8").write(answer(text, a.args[0], a.args[1].lower(), " ".join(a.args[2:]), now))
        print(f"recorded {a.args[0]} {a.args[1].lower()} in {os.path.relpath(a.file, ROOT)}: commit it"); return 0
    ref = "origin/main" if git("rev-parse", "--verify", "-q", "origin/main").strip() else "HEAD"
    log = open(a.caps_log).read() if a.caps_log else git("log", "--reverse", "--first-parent", "--diff-merges=first-parent", "-p", "--format=@@C %H %cI", ref, "--", CAPS)
    caps = open(a.caps).read() if a.caps else git("show", f"{ref}:{CAPS}")
    if not caps:
        print(f"ACT   human sample not checked: {CAPS} unreadable on {ref}"); return 1
    pushed = open(a.pushed, encoding="utf-8").read() if a.pushed else None if a.caps_log else on_github(os.path.relpath(os.path.abspath(a.file), ROOT), ref)
    lines, new = check(now, text, proven_since(log), rows(caps), a.journeys, not a.no_write, pushed)
    if new and not a.no_write:
        open(a.file, "w", encoding="utf-8").write(new)
    print("\n".join(lines))
    return sum(l.startswith("ACT") for l in lines)


if __name__ == "__main__":
    sys.exit(main())
