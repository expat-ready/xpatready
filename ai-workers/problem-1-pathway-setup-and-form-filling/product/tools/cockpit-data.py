#!/usr/bin/env python3
# Cockpit data (P-591, founder ask A54): one JSON for the Founder's Progress Board (product/cockpit/index.html).
# A thin aggregator: it reads the records and calls the tools that already exist, and adds only what none of them gives.
#   Works ............ tools/progress.sh's own parse (run on main's qa/CAPABILITIES.md, fetched through the API)
#   Pipeline ......... tools/flow-measure.py --json (7 days; its answer is cached, default 6 h, because it reads every run's jobs)
#   App-code merges .. tools/app-code-prs.sh (P-500; its verdict per merged PR is cached, merged PRs never change)
#   Stations ......... tools/factory-board.sh's rules; questions: lead-watch.sh's "Question for the tech lead" text
#   Records .......... STATE.md, MVP-CHECKLIST.md, BACKLOG.md, DECISIONS.md, qa/BUGS*.md, tools/flaky-ledger.tsv (this copy)
#   Hand-kept ........ cockpit/plan.json, risks.json, architecture.json, learnings.json; Lead input (--lead-input)
# Added here because no tool gives them (each marked "added" in data.json): PR opened to merged, main line red share and
# red-to-green time (nightly on main), daily series for the 14-day trends, PRs healed after a red run.
# Read-only: GitHub API GETs (and one GraphQL read) through curl with `gh auth token`; never runs the app, suites or anything paid.
# Usage: python3 product/tools/cockpit-data.py --out "$TMPDIR/cockpit/data.json" [--lead-input lead-input.json]
#        [--flow-max-age-h 6] [--appcode-max 900] [--offline]
import argparse, json, math, os, random, re, shutil, statistics, subprocess, sys, tempfile, time
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

T0 = time.time()
HERE = os.path.dirname(os.path.abspath(__file__))
P = os.path.dirname(HERE)
ROOT = subprocess.run(["git", "-C", P, "rev-parse", "--show-toplevel"], capture_output=True, text=True).stdout.strip() or P
REL = os.path.relpath(P, ROOT)             # product folder inside the repository
IST = ZoneInfo("Asia/Kolkata")
NOW = datetime.now(timezone.utc)
ERRORS = []



def library_base(repo):
    """Web address of the product folder on the branch this copy is on, for the board's Library links (P-593).
    Built at run time from the git remote, so no account name is written into a committed file."""
    if not repo:
        return None
    try:
        br = subprocess.run(["git", "rev-parse", "--abbrev-ref", "HEAD"], capture_output=True, text=True, cwd=os.path.dirname(os.path.abspath(__file__))).stdout.strip() or "main"
    except Exception:
        br = "main"
    return f"https://github.com/{repo}/blob/{br}/ai-workers/problem-1-pathway-setup-and-form-filling/product/"

def library_freshness():
    """Library masters current or behind (founder, 15 Nov; tools/library-freshness.py reads git history only)."""
    try:
        r = subprocess.run([sys.executable, os.path.join(os.path.dirname(os.path.abspath(__file__)), "library-freshness.py"), "--json"],
                           capture_output=True, text=True, timeout=60)
        return json.loads(r.stdout)
    except Exception as e:
        ERRORS.append(f"library freshness not read: {e}")
        return None

def V(v, src, **kw):
    d = {"v": v, "src": src}
    d.update(kw)
    return d


def ist(dt):
    return dt.astimezone(IST).strftime("%d %b %H:%M IST") if dt else None


def ts(s):
    if not s:
        return None
    return datetime.strptime(s[:19], "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc)


def hours(a, b):
    return round((b - a).total_seconds() / 3600, 1)


def med(xs):
    xs = [x for x in xs if x is not None]
    return round(statistics.median(xs), 1) if xs else None


def slurp(p):
    with open(p, encoding="utf-8") as f:
        return f.read()


def read(rel):
    p = os.path.join(P, rel)
    return slurp(p) if os.path.exists(p) else None


def sh(cmd, **kw):
    return subprocess.run(cmd, capture_output=True, text=True, **kw)


def clean(s, n=None):
    s = re.sub(r"\*\*|`", "", s or "")
    s = re.sub(r"[\U0001F300-\U0001FAFF☀-➿]️?", "", s).strip()
    return (s[: n - 1] + "…") if n and len(s) > n else s


def cells(line):
    return [x.strip() for x in line.rstrip("\n").split("|")]


# ---------------------------------------------------------------- GitHub (read-only)
class GH:
    def __init__(self, offline):
        self.offline = offline
        self.calls = 0
        self.token = "" if offline else sh(["gh", "auth", "token"]).stdout.strip()
        u = sh(["git", "-C", ROOT, "remote", "get-url", "origin"]).stdout.strip()
        m = re.search(r"github\.com[:/]([^/]+/[^/]+?)(\.git)?$", u)
        self.repo = m.group(1) if m else None
        self.api = f"https://api.github.com/repos/{self.repo}"
        if not self.token and not offline:
            ERRORS.append("gh auth token gave nothing: GitHub sections empty")
            self.offline = True

    def get(self, url, raw=False):
        if self.offline:
            raise RuntimeError("offline")
        url = url if url.startswith("http") else self.api + url
        acc = "application/vnd.github.raw" if raw else "application/vnd.github+json"
        cmd = ["curl", "-sS", "--fail-with-body", "-H", f"Accept: {acc}", "-H", f"Authorization: token {self.token}", url]
        err = ""
        for wait in (0, 2, 5):
            time.sleep(wait)
            self.calls += 1
            r = subprocess.run(cmd, capture_output=True, text=True)
            if r.returncode == 0:
                if raw:
                    return r.stdout
                try:
                    return json.loads(r.stdout)
                except json.JSONDecodeError:
                    err = "bad JSON"
                    continue
            err = (r.stdout[:200] + " " + r.stderr[:200]).strip()
            if "rate limit" in err.lower():
                break
        raise RuntimeError(f"GET {url.replace(self.api, '')} failed: {err}")

    def graphql(self, query, variables):
        if self.offline:
            raise RuntimeError("offline")
        self.calls += 1
        body = json.dumps({"query": query, "variables": variables})
        r = subprocess.run(["curl", "-sS", "--fail-with-body", "-X", "POST", "-H", f"Authorization: token {self.token}",
                            "-d", "@-", "https://api.github.com/graphql"], input=body, capture_output=True, text=True)
        if r.returncode:
            raise RuntimeError(f"GraphQL failed: {r.stdout[:200]} {r.stderr[:200]}")
        d = json.loads(r.stdout)
        if d.get("errors"):
            raise RuntimeError(f"GraphQL: {str(d['errors'])[:200]}")
        return d["data"]


def safe(name, fn, default=None):
    try:
        return fn()
    except Exception as e:  # one failed read empties one block, never the page
        ERRORS.append(f"{name}: {str(e)[:240]}")
        return default


# ---------------------------------------------------------------- records in this copy
DECIDED = re.compile(r"^(done|decided|answered|ruled)\b|\bdecided\b", re.I)
# board v61 (founder 15 Nov: "Needs you must show only what is needed from him"): an ask row counts only when a clause of
# its status (the row's last cell) says it waits on the founder's word or act; an ask he made that the Lead or a lane is
# working is not his to do. FORMULAS.md › Needs you.
NEEDS_HIM = re.compile(r"\b(needs? (you|him|his|the founder)|waits? on (you|him|the founder)|waiting on (you|him|the founder)|"
                       r"(your|his|the founder's) (word|decision|call|answer|choice|yes|go)|founder (to )?(decides?|chooses?|confirms?|"
                       r"answers?|runs?|approves?|picks?))\b", re.I)
MONTHS = {m: i + 1 for i, m in enumerate(("jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"))}
DUE = re.compile(r"\b(?:by|before|until|due|on)\s+(?:(\d{4}-\d{2}-\d{2})|(\d{1,2})\s+([A-Za-z]{3})[a-z]*)", re.I)


def due_date(text, today=None):
    """The date an item names as its deadline ("by 17 Nov", "before 2026-11-19"), ISO; None when it names none.
    A day-month with no year takes the year that puts it nearest after today's month (Dec items stay this year in Nov)."""
    m = DUE.search(text or "")
    if not m:
        return None
    if m.group(1):
        return m.group(1)
    mon = MONTHS.get(m.group(3).lower()[:3])
    if not mon:
        return None
    today = today or datetime.now(IST).date()
    y = today.year + (1 if mon < today.month - 6 else 0) - (1 if mon > today.month + 6 else 0)
    try:
        return date(y, mon, int(m.group(2))).isoformat()
    except ValueError:
        return None


def his_clauses(text):
    """Clauses (split on ";") of a status that ask for the founder's word or act and are not marked decided or done."""
    return [c.strip() for c in re.split(r";", text or "") if NEEDS_HIM.search(c) and not DECIDED.search(c.strip())]


def state_needs(text=None, today=None):
    """Founder asks from STATE.md that need the founder now. Known fix (spec §6 10): an ask whose status says it is decided
    (or done, answered, ruled) is not listed. Board v61: only an ask whose status (the last cell) has a clause asking for his
    word or act is listed; each carries that clause as its one line and the date it names (by)."""
    t = text if text is not None else (read("STATE.md") or "")
    asks, sec = [], None
    for line in t.splitlines():
        if line.startswith("## "):
            sec = line[3:]
            continue
        if sec and sec.startswith("Founder asks") and line.startswith("| ") and not line.startswith("| #") and not line.startswith("|---"):
            c = cells(line)
            if len(c) < 5:
                continue
            status = clean(c[-2])
            if DECIDED.search(status) and not his_clauses(status) or clean(c[2]).lower().startswith("done"):
                continue
            hits = his_clauses(status)
            if not hits:
                continue
            one = clean(hits[0], 160)
            asks.append({"id": clean(c[1], 60), "ask": clean(c[2], 150), "status": clean(status, 170), "line": one,
                         "by": due_date(hits[0], today) or due_date(c[2], today),
                         "src": "STATE.md › Founder asks", "names": item_ids(" ".join(c[1:-1]))})
    m = re.search(r"^## For the founder[^\n]*\n+(.+)$", t, re.M)
    forf = clean(m.group(1), 220) if m else None
    w = re.search(r"\*\*Waiting on the founder[^*]*\*\*:?(.+)$", t, re.M)
    wait = clean(w.group(1), 220) if w else None
    return asks, forf, wait


def checklist(text=None):
    """Legacy view of the checklist (groups, rows, readiness); rows come from parse_checklist, the one parser."""
    t = text if text is not None else (read("MVP-CHECKLIST.md") or "")
    ck = parse_checklist(t)
    rows = [{"map": r["map"], "cap": clean(r["cap"], 90), "module": clean(r["module"]), "backlog": clean(r["cell"], 120),
             "status": r["status"], "detail": clean(r["status_cell"], 120), "group": r["group"]} for r in ck["rows"]]
    readiness = []
    for line in t.splitlines():
        if re.match(r"^\| C\d+ \|", line):
            c = cells(line)
            readiness.append({"id": c[1], "item": clean(c[2], 140), "status": clean(c[3], 90), "decision": clean(c[4], 60)})
    return ck["groups"], rows, readiness


ORDER = ["qa Works", "Merged", "In PR", "Shaped", "Not shaped"]


def decisions_last(n=5):
    out = []
    for line in (read("DECISIONS.md") or "").splitlines():
        m = re.match(r"^\| (P-\d+) \| ([^|]+) \|(.*)", line)
        if m:
            b = re.search(r"\*\*(.+?)\*\*", m.group(3))
            out.append({"id": m.group(1), "date": m.group(2).strip(), "title": clean(b.group(1) if b else m.group(3), 100),
                        "src": f"DECISIONS.md {m.group(1)}"})
            if len(out) == n:
                break
    return out


def backlog(merged_ids, inpr_ids, text=None):
    t = text if text is not None else (read("BACKLOG.md") or "")
    owners, sec, rows, xrows = [], None, [], 0
    prev, hdr = None, None
    for line in t.splitlines():
        if SEP_LINE.match(line) and prev is not None:
            hdr = cells(prev)
        prev = line
        if line.startswith("## "):
            sec = line[3:]
            continue
        if sec and sec.startswith("Owners") and line.startswith("| ") and not line.startswith("| Owner") and not line.startswith("|---"):
            c = cells(line)
            owners.append({"owner": clean(c[1], 40), "journey": clean(c[2], 40), "rows": clean(c[3], 120)})
        if re.match(r"^\| X-\d+ \|", line):
            xrows += 1
        m = re.match(r"^\| ((?:PF|FO|BK|CS|AUD|SEC|AS)-[0-9A-Za-z]+) \|", line)
        if m and any(r["id"] == m.group(1) for r in rows):
            continue   # a duplicate row: the first occurrence wins (spec §6.3 edge case)
        if m and "moved to" not in line.split("|")[1]:
            c = cells(line)
            rid, area = m.group(1), c[2]
            lane = re.split(r"[ (/+]", area.strip())[0].lower() or "other"
            waits, non = row_deps(dep_text(line, hdr))       # R3, R3b, R3c
            waits = [x for x in waits if x != rid]
            if rid in merged_ids:
                st = "merged"
            elif rid in inpr_ids:
                st = "in PR"
            elif not non and all(x in merged_ids for x in waits):
                st = "ready"
            else:
                st = "blocked"
            rows.append({"id": rid, "lane": lane, "status": st, "waits_on": [x for x in waits if x not in merged_ids][:6],
                         "non_id": non[:3]})
    by = {}
    for r in rows:
        by.setdefault(r["lane"], {"ready": 0, "blocked": 0, "in PR": 0, "merged": 0})[r["status"]] += 1
    return owners, rows, by, xrows


def flaky():
    t = read("tools/flaky-ledger.tsv")
    if t is None:
        return None
    lines = [l.split("\t") for l in t.splitlines() if l.strip() and not l.startswith("#")]
    rules = [l for l in lines if l[0] in ("window", "needs", "owner")]
    other = [l for l in lines if l[0] not in ("window", "needs", "owner")]
    return {"rule_lines": len(rules), "release_or_hand_lines": len(other),
            "note": "Quarantine itself is worked out by tools/flaky.mjs from check runs; not recomputed here."}


def jload(rel):
    t = read(rel)
    try:
        return json.loads(t) if t else None
    except json.JSONDecodeError as e:
        ERRORS.append(f"{rel}: {e}")
        return None


# ---------------------------------------------------------------- progress.sh's parse, reused
def progress_parse_code():
    t = slurp(os.path.join(HERE, "progress.sh"))
    m = re.search(r"<<'EOF'\n(.*?)\nEOF", t, re.S)
    return m.group(1)


def run_progress(cap_text, built_names):
    d = tempfile.mkdtemp(prefix="cockpit-cap-")
    try:
        with open(os.path.join(d, "CAPABILITIES.md"), "w", encoding="utf-8") as f:
            f.write(cap_text)
        if built_names is not None:
            os.mkdir(os.path.join(d, "built"))
            for n in built_names:
                open(os.path.join(d, "built", n), "w").close()
        r = sh(["python3", "-I", "-", os.path.join(d, "CAPABILITIES.md")], input=progress_parse_code())
        out = []
        for line in r.stdout.splitlines():
            m = re.match(r"^(.*?): (\d+) of (\d+) work \((\d+)%\) · (.*)$", line)
            if m:
                rest = dict((k.strip(), int(v)) for v, k in re.findall(r"(\d+) ([a-z ,]+)", m.group(5)))
                out.append({"milestone": m.group(1), "works": int(m.group(2)), "total": int(m.group(3)), "other": rest})
        return out
    finally:
        shutil.rmtree(d, ignore_errors=True)


def cap_rows(cap_text, built_names):
    # The same row rule as progress.sh (| C… rows; cells 1 id, 4 milestone, 5 status; qa/built/<ID>.md marks "Built, awaiting qa").
    # progress.sh prints totals only; a --json flag there would make this copy unnecessary.
    built = {n[:-3] for n in (built_names or []) if n.endswith(".md")}
    out = []
    for line in cap_text.splitlines():
        if re.match(r"^\| C\d", line):
            c = cells(line)
            if c[4] not in WORKS_MS:   # progress.sh's three milestones plus M4 (known fix 93/98)
                continue
            st = c[5].replace("*", "")
            if c[1] in built and st != "Works":
                st = "Built, awaiting qa"
            out.append({"id": c[1], "name": clean(c[3], 90), "m": c[4], "status": st})
    return out


# ================================================================ A61 / A62 / A63 (P-596; cockpit/spec-a61-a62-2026-11-14.md)
# Everything below computes the spec's §1-§5 and §7 numbers from the frozen snapshot only (§6 1a); formulas, sources and
# thresholds are written once in cockpit/FORMULAS.md. Pure functions take the snapshot and "now" so the unit tests
# (tools/test_cockpit_data.py) run them on the hand-made fixture snapshot.
R1_START = datetime(2026, 11, 13).date()      # P-586 baseline day; "days since 13 Nov" (§1)
BASELINE_ROWS = 101                            # P-586: Release 1 Build rows (plan.json baseline_rows overrides)
MC_RUNS, MC_SEED, MC_CAP = 10000, 596, 365     # §1 forecast: 10,000 runs, fixed seed (P-596), 1-year cap per run
UNSHAPED_FACTOR = 3                            # P-586 (4): 3 changes per unshaped capability, settled 19 Nov
LIMITS_H = {"review": 2.0, "merge": 1.0, "qa": 24.0}          # §2 constraint limits (N3)
FRESH_LIMIT_H = {"GitHub data": 1.0, "Lead input": 2.0, "flow-measure": 6.0}   # §6.8
PARKED_H = 7 * 24                             # §11 R8: no push for 7 days = parked
LANE_WINDOW_MIN = 90                           # P-326: a lane works when it pushed in the last 90 min
BURN_LIMIT = 3.0                               # P-440: burn at most 3% of the weekly plan per hour
BUG_AGE_H = 48                                 # §5 item 6
LEAD_B_BRANCH = "lead-b-front-office"          # Lead B's branch holding design/lead-b-briefs/ (Lead input lead_b_branch overrides)
IDRE = r"[A-Z][A-Za-z0-9]*-[0-9A-Za-z]+(?:-[0-9A-Za-z]+)*"   # BACKLOG row ids: PF-4b, BK-17, B5-filings, DB-SPLIT, PF-L
NOT_ROW = re.compile(r"^(?:P|QA)-\d+$")      # decision and bug ids are not BACKLOG rows
NARROW = r"(?:PF|FO|BK|CS|AUD|SEC|AS)-[0-9A-Za-z]+"
_END = r"(?![0-9A-Za-z\-]|\.[0-9A-Za-z])"     # "PF-4" never matches inside "PF-4b" or "PF-4.1"
ID_TOKEN = re.compile(r"(?<![0-9A-Za-z\-])(" + IDRE + r")" + _END)
ID_RANGE = re.compile(r"(?<![0-9A-Za-z\-])(PF|FO|BK|CS|AUD|SEC|AS)-(\d+) to (?:(?:PF|FO|BK|CS|AUD|SEC|AS)-)?(\d+)" + _END)
TITLE_ID = re.compile(r"^(?:[a-z][a-z-]*: )?(" + IDRE + r")" + _END)
CAP_ID = re.compile(r"\b([CR]\d+\.\d+)\b")
RECORDS_TITLE = re.compile(r"^(lead|qa):")
WORKS_MS = ("M2", "T", "M3", "M4")             # milestones counted in Works (known fix 93/97 -> 93/98: M4 was left out)


def ist_day(iso):
    return datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone(IST).date() if iso else None


def parse_iso(iso):
    return datetime.fromisoformat(iso.replace("Z", "+00:00")) if iso else None


def git_blob_sha(text):
    import hashlib
    b = text.encode("utf-8")
    return hashlib.sha1(b"blob %d\0" % len(b) + b).hexdigest()


def cell_ids(cell):
    """BACKLOG ids cited in a checklist cell, in order, distinct; "BK-22 to BK-24" expands to three ids."""
    txt = re.sub(r"\*\*|`", "", cell or "")
    txt = ID_RANGE.sub(lambda m: ", ".join(f"{m.group(1)}-{i}" for i in range(int(m.group(2)), int(m.group(3)) + 1)), txt)
    out = []
    for x in ID_TOKEN.findall(txt):
        if x not in out and not NOT_ROW.match(x):
            out.append(x)
    return out


def title_id(title):
    """N2: the row id a PR title starts with, after an optional lower-case lane prefix ("runtime: PF-3 — …")."""
    if not title or RECORDS_TITLE.match(title):
        return None
    m = TITLE_ID.match(title)
    return m.group(1) if m and not NOT_ROW.match(m.group(1)) else None


def loose_title_id(title):
    """Trust note only: the first row id anywhere in a non-records title ("screens: C7.6 — BK-18 …")."""
    if not title or RECORDS_TITLE.match(title) or title.startswith("merge queue:"):
        return None
    m = next((x for x in ID_TOKEN.findall(title) if not NOT_ROW.match(x)), None)
    return m


_TOK = {}


def title_has(title, rid):
    """R1: the id appears in the title as a whole token: not preceded by a letter, digit or "-", not followed by a letter or digit."""
    rx = _TOK.get(rid)
    if rx is None:
        rx = _TOK[rid] = re.compile(r"(?<![A-Za-z0-9-])" + re.escape(rid) + r"(?![A-Za-z0-9])")
    return bool(title) and rx.search(title) is not None


def is_records(p):
    """R1: a records PR has "(records only)" in its title or carries the `records` label; it never counts."""
    return "(records only)" in (p.get("title") or "") or any(l.get("name") == "records" for l in p.get("labels") or [])


WAITS_ON = re.compile(r"[*_]*\bwaits[*_]*\s+[*_]*on\b[*_]*\s*:?[*_]*\s*:?", re.I)
AFTER_W = re.compile(r"\bafter\b", re.I)
CLAUSE_END = re.compile(r"[.;|·]|\bdecisions\s*:|\bdone when\b|\bsource\s*:", re.I)
FILLER = {"merged", "and", "or", "both", "the", "its", "first", "pr", "prs", "row", "rows",
          "nothing", "none", "nobody", "no"}      # §11 R3b + R3c
SEP_LINE = re.compile(r"^\|\s*:?-{3,}")


def dep_text(line, hdr):
    """§11 R3c: the row's text for dependency reading, without the table's Done-when column (found by its header)."""
    c = cells(line)
    if hdr:
        drop = {i for i, h in enumerate(hdr) if h.lower().startswith("done when")}
        c = [x for i, x in enumerate(c) if i not in drop]
    return " | ".join(c)


def row_deps(line):
    """§11 R3, R3b, R3c, R3d: dependencies of a BACKLOG row (its cells except Done when, see dep_text). A clause ends at the first ".", ";", "|", "·", a labelled field
    ("decisions:", "Done when", "Source:") or the line end. Waits-on clause (any case, * or _ emphasis, optional colon):
    every row id is a dependency; the leftover text, without ids, #<number>, punctuation and the filler words, is a
    non-id dependency only when a word of 3+ letters remains. "After" clause (whole word, a row id within its next 3
    tokens): only its row ids count. Returns (ids, non_ids)."""
    ids, non = [], []

    def clause(m):
        e = CLAUSE_END.search(line, m.end())
        return line[m.end(): e.start() if e else len(line)]
    for m in WAITS_ON.finditer(line):
        t = clause(m)
        got = cell_ids(t)
        ids += [x for x in got if x not in ids]
        rest = re.sub(r"`[^`]*`", " ", t)                                  # R3c: backticked text never blocks
        while re.search(r"\([^()]*\)", rest):
            rest = re.sub(r"\([^()]*\)", " ", rest)                       # R3c: nor does bracketed text
        rest = ID_TOKEN.sub(" ", re.sub(r"[*_`]", "", rest))
        rest = re.sub(r"\bmap\b(?=(?:\s+rows?)?\s+\d)", " ", rest, flags=re.I)     # R3d: "map" followed by numbers is filler
        rest = re.sub(r"#\d+", " ", rest)
        words = [w for w in re.findall(r"[A-Za-z0-9']+", rest) if w.lower() not in FILLER]
        if any(len(re.sub(r"[^A-Za-z]", "", w)) >= 3 for w in words):
            non.append(" ".join(words))
    for m in AFTER_W.finditer(line):
        t = re.sub(r"[*_`]", "", clause(m))
        if any(cell_ids(tok) for tok in t.split()[:3]):
            ids += [x for x in cell_ids(t) if x not in ids]
    return ids, non


def parse_checklist(text):
    """MVP-CHECKLIST.md section A: the Build rows, by the header of each table (a qa id column is found by name)."""
    groups, rows, dupes, seen = [], [], [], {}
    g, inA, hdr, has_qa = None, False, None, False
    for line in (text or "").splitlines():
        if line.startswith("## "):
            inA = line.startswith("## A.")
            g = None
            continue
        if not inA:
            continue
        if line.startswith("### "):
            m = re.match(r"^### ([A-L])\. (.*)", line)
            g = m.group(1) if m else None
            if m:
                groups.append({"id": g, "name": m.group(2).strip()})
            continue
        if line.startswith("| Map |"):
            hdr = [x.lower() for x in cells(line)]
            continue
        if g and hdr and re.match(r"^\| \d+ \|", line):
            c = cells(line)
            col = lambda name: next((i for i, h in enumerate(hdr) if h.startswith(name)), None)
            iq = next((i for i, h in enumerate(hdr) if h.startswith("qa")), None)
            has_qa = has_qa or iq is not None
            cell = c[col("backlog")] if col("backlog") is not None else ""
            stc = c[col("status")] if col("status") is not None else ""
            st = re.split(r" \(|;", stc.replace("\\*", "").replace("*", ""))[0].strip()
            unshaped_ids = []
            for seg in cell.split(";"):
                if "named only" in seg:
                    unshaped_ids += [x for x in cell_ids(seg) if x not in unshaped_ids]
            r = {"map": int(c[1]), "cap": re.sub(r"\*\*|`", "", c[col("capability") or 2]).strip(),
                 "module": c[col("module") or 3], "cell": cell, "status": st, "status_cell": stc, "group": g,
                 "ids": cell_ids(cell), "unshaped_ids": unshaped_ids, "gap": "none yet" in cell.lower(),
                 "qa_ids": CAP_ID.findall(c[iq]) if iq is not None and iq < len(c) else None,
                 "cap_ids": CAP_ID.findall(cell), "milestones": re.findall(r"\b(M\d|T) \d+/\d+", cell)}
            if r["map"] in seen:
                dupes.append({"map": r["map"], "statuses": [seen[r["map"]]["status"], st]})
                continue
            seen[r["map"]] = r
            rows.append(r)
    return {"groups": groups, "rows": rows, "dupes": dupes, "has_qa_col": has_qa}


def parse_backlog(text):
    """BACKLOG.md: every row id (first cell), duplicates, BK ids, and each row's line (for 'waits on' and briefs/)."""
    ids, dupes, lines, deps = [], [], {}, {}
    prev, hdr = None, None
    for line in (text or "").splitlines():
        if SEP_LINE.match(line) and prev is not None:
            hdr = cells(prev)
        prev = line
        m = re.match(r"^\| (" + IDRE + r")" + _END, line)
        if not m:
            continue
        rid = m.group(1)
        if re.match(r"^\| " + re.escape(rid) + r" \|", line):
            if rid in lines:
                dupes.append(rid)
                continue
            lines[rid] = line
            deps[rid] = dep_text(line, hdr)
        if rid not in ids:
            ids.append(rid)
    return {"ids": ids, "dupes": dupes, "lines": lines, "deps": deps, "bk": [x for x in ids if x.startswith("BK-")]}


def parse_caps(text):
    """qa/CAPABILITIES.md rows: id, milestone, status (progress.sh's row rule, all four milestones)."""
    out = {}
    for line in (text or "").splitlines():
        if re.match(r"^\| C\d", line):
            c = cells(line)
            if len(c) > 5:
                out[c[1]] = {"m": c[4], "status": c[5].replace("*", "").strip()}
    return out


def works_count(caps):
    rows = [v for v in caps.values() if v["m"] in WORKS_MS]
    return sum(1 for v in rows if v["status"].startswith("Works")), len(rows)


# ---------------------------------------------------------------- snapshot (§6 1a): the one interface both scripts read
SNAP_FILES = ["MVP-CHECKLIST.md", "BACKLOG.md", "STATE.md", "cockpit/plan.json", "cockpit/history.jsonl", "qa/BUGS.md",
              "cockpit/health-exceptions.json", "cockpit/usage-log.tsv"]


def git_out(*args):
    r = sh(["git", "-C", ROOT] + list(args))
    return r.stdout if r.returncode == 0 else None


def records_lag(branch_ref, main_ref):
    """Commits on a records branch that main lacks, and the oldest one's time (git, read-only)."""
    if not branch_ref or not main_ref:
        return None, None
    n = git_out("rev-list", "--count", f"{main_ref}..{branch_ref}")
    old = git_out("log", "--reverse", "--format=%cI", f"{main_ref}..{branch_ref}")
    return (int(n.strip()) if n else None), ((old or "").splitlines() or [None])[0]


def take_snapshot(snap, gh, cache, lead_input, appcode_max):
    """Download one snapshot of every raw input into <out>/snapshot/ (spec §6 1a). Read-only everywhere."""
    if os.path.isdir(snap):
        shutil.rmtree(snap)
    for d in ("github", "files", "files_main/qa", "git/capabilities_main"):
        os.makedirs(os.path.join(snap, d), exist_ok=True)

    def wj(rel, obj):
        with open(os.path.join(snap, rel), "w", encoding="utf-8") as f:
            json.dump(obj, f, ensure_ascii=False, indent=1)

    def wt(rel, text):
        p = os.path.join(snap, rel)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "w", encoding="utf-8") as f:
            f.write(text)
    taken = NOW.astimezone(IST).isoformat(timespec="seconds")
    branch = (git_out("rev-parse", "--abbrev-ref", "HEAD") or "").strip()
    rsha = (git_out("rev-parse", "HEAD") or "").strip()
    main_c = gh.get("/commits/main")
    msha = main_c["sha"]
    meta = {"taken_at": taken, "repo": gh.repo, "main_sha": msha, "records_branch": branch, "records_sha": rsha}
    # records files at records_sha (files/<repo path>)
    for rel in SNAP_FILES:
        t = git_out("show", f"{rsha}:{REL}/{rel}")
        if t is not None:
            wt(f"files/{REL}/{rel}", t)
    # P-602 (4): MVP-CHECKLIST.md history on the records sha: every commit in the 48 h before taken_at, plus the newest one
    # before that (the checklist as it stood at the window's start); git/checklist_records.jsonl + git/checklist_records/<sha>.md
    ck_rel, cut48 = f"{REL}/MVP-CHECKLIST.md", (NOW - timedelta(hours=48)).strftime("%Y-%m-%dT%H:%M:%SZ")
    ck_log = (git_out("log", "--format=%H %cI", f"--since={cut48}", rsha, "--", ck_rel) or "").splitlines()
    ck_log += (git_out("log", "-1", "--format=%H %cI", f"--until={cut48}", rsha, "--", ck_rel) or "").splitlines()
    ck_lines = []
    for ln in ck_log:
        if ln.strip():
            sha_, when = ln.split()[:2]
            t_ = git_out("show", f"{sha_}:{ck_rel}")
            if t_ is not None:
                wt(f"git/checklist_records/{sha_}.md", t_)
                ck_lines.append(json.dumps({"sha": sha_, "date": when}))
    wt("git/checklist_records.jsonl", "\n".join(sorted(ck_lines, key=lambda x: json.loads(x)["date"])) + ("\n" if ck_lines else ""))
    # extra (not in the shared layout; read only by cockpit-data.py): records lag for the strip and Health item 3
    main_local = msha if sh(["git", "-C", ROOT, "cat-file", "-e", msha + "^{commit}"]).returncode == 0 else None
    main_ref = main_local or (git_out("rev-parse", "origin/main") or "").strip() or None
    st = git_out("show", f"{rsha}:{REL}/STATE.md") or ""
    m = re.search(r"this branch: `([^`]+)`", st)
    state_branch = m.group(1) if m else None
    sref = rsha if state_branch == branch else ((git_out("rev-parse", "--verify", "-q", state_branch) or "").strip() or None) if state_branch else None
    n1, o1 = records_lag(rsha, main_ref)
    n2, o2 = records_lag(sref, main_ref)
    meta["extra"] = {"main_ref_used": main_ref, "main_ref_is_head": bool(main_local), "records_ahead": n1, "records_oldest_unmerged_at": o1,
                     "state_branch": state_branch, "state_branch_sha": sref, "state_branch_ahead": n2, "state_branch_oldest_unmerged_at": o2}
    wj("meta.json", meta)
    # every PR (state all)
    raw, page = [], 1
    while page <= 40:
        d = gh.get(f"/pulls?state=all&sort=created&direction=desc&per_page=100&page={page}")
        raw += d
        if len(d) < 100:
            break
        page += 1
    ac_path = os.path.join(cache, "appcode.json")
    ac = json.load(open(ac_path)) if os.path.exists(ac_path) else {}
    since = NOW - timedelta(days=21)
    need = [x["number"] for x in raw if not x["head"]["ref"].startswith("mergify/") and str(x["number"]) not in ac and (
        x["state"] == "open" or (x.get("merged_at") and parse_iso(x["merged_at"]) >= since) or ID_TOKEN.search(x["title"] or ""))]
    need = need[:appcode_max]
    if need:
        def run_chunk(ns):
            r = subprocess.run(["bash", os.path.join(HERE, "app-code-prs.sh")], input="\n".join(map(str, ns)) + "\n",
                               capture_output=True, text=True, timeout=900)
            got, unknown = set(), set()
            for line in r.stdout.splitlines():
                if line.startswith("?"):
                    unknown.add(int(re.findall(r"\d+", line)[0]))
                elif re.match(r"^\d+", line):
                    got.add(int(re.findall(r"\d+", line)[0]))
            return {n: (n in got) for n in ns if n not in unknown}
        with ThreadPoolExecutor(8) as ex:
            for res in ex.map(run_chunk, [need[i::8] for i in range(8) if need[i::8]]):
                ac.update({str(k): v for k, v in res.items()})
        gh.calls += len(need)
        json.dump(ac, open(ac_path, "w"))
    pulls = [{"number": x["number"], "title": x["title"], "state": x["state"], "draft": bool(x.get("draft")),
              "created_at": x["created_at"], "merged_at": x.get("merged_at"), "closed_at": x.get("closed_at"),
              "labels": [{"name": l["name"]} for l in x.get("labels", [])],
              "head": {"ref": x["head"]["ref"], "sha": x["head"]["sha"]}, "base": {"ref": x["base"]["ref"]},
              "files_app": ac.get(str(x["number"]))} for x in raw]
    wj("github/pulls.json", pulls)
    # check runs on main's head
    cr = gh.get(f"/commits/{msha}/check-runs?per_page=100")
    wj("github/main_checks.json", [{"name": c["name"], "status": c["status"], "conclusion": c["conclusion"]} for c in cr.get("check_runs", [])])
    # guards: label guard workflow on main, and the push guard (ci.yml job "guard") on the newest finished queue run
    gr = []
    lg = gh.get("/actions/workflows/label-guard.yml/runs?branch=main&status=completed&per_page=1").get("workflow_runs", [])
    gr.append({"name": "label guard (label-guard.yml on main)", "conclusion": lg[0]["conclusion"] if lg else None, "created_at": lg[0]["created_at"] if lg else None})
    # the push guard is a step: job "guard" on a draft push, step "push guard (part 1 only …)" of shard 1 on a full or queue run
    ci = gh.get("/actions/workflows/ci.yml/runs?status=completed&per_page=30").get("workflow_runs", [])
    step, at = None, None
    for q in [x for x in ci if (x.get("head_branch") or "").startswith("mergify/")][:5]:
        for j in gh.get(f"/actions/runs/{q['id']}/jobs?per_page=100").get("jobs", []):
            for st in j.get("steps") or []:
                if st["name"].startswith("push guard") and st.get("conclusion") in ("success", "failure"):
                    step, at = st, st.get("started_at") or q["created_at"]
                    break
            if step:
                break
        if step:
            break
    gr.append({"name": "push guard (ci.yml step push guard, newest finished merge-queue run that ran it)", "conclusion": step["conclusion"] if step else None,
               "created_at": at})
    wj("github/guard_runs.json", gr)
    # extra: the newest finished nightly run on main (Health item 1 also reads it: main's head has no ci.yml run of its own)
    nl = gh.get("/actions/workflows/nightly.yml/runs?branch=main&status=completed&per_page=2").get("workflow_runs", [])
    wj("github/main_nightly.json", dict({"conclusion": nl[0]["conclusion"], "created_at": nl[0]["created_at"]},
                                        previous={"conclusion": nl[1]["conclusion"], "created_at": nl[1]["created_at"]} if len(nl) > 1 else None) if nl else {})
    # branches with a push in the last 24 h (GitHub keeps no push time per branch: the head commit's committed date stands in)
    o, r_ = (gh.repo or "/").split("/")
    # every branch is read (GitHub's ref ordering by commit date proved unreliable for branches: 14 Nov, today's lane branches missing)
    qb = """query($o:String!,$r:String!,$c:String){repository(owner:$o,name:$r){refs(refPrefix:"refs/heads/",first:100,after:$c){
      pageInfo{hasNextPage endCursor} nodes{name target{... on Commit{oid committedDate}}}}}}"""
    refs, cur = [], None
    for _ in range(40):
        got = gh.graphql(qb, {"o": o, "r": r_, "c": cur})["repository"]["refs"]
        refs += got["nodes"]
        if not got["pageInfo"]["hasNextPage"]:
            break
        cur = got["pageInfo"]["endCursor"]
    day_ago = NOW - timedelta(hours=24)
    wj("github/branches_recent.json", [{"name": x["name"], "sha": x["target"]["oid"], "pushed_at": x["target"]["committedDate"]}
                                        for x in refs if x.get("target") and parse_iso(x["target"]["committedDate"]) >= day_ago])
    # extra: open PRs' head commit time, CI rollup and the time `review: approved` was put on (§2 waits)
    qo = """query($o:String!,$r:String!){repository(owner:$o,name:$r){pullRequests(states:OPEN,first:100){nodes{number
      commits(last:1){nodes{commit{committedDate statusCheckRollup{state}}}}
      timelineItems(itemTypes:[LABELED_EVENT],last:30){nodes{... on LabeledEvent{createdAt label{name}}}}}}}}"""
    od = []
    for x in gh.graphql(qo, {"o": o, "r": r_})["repository"]["pullRequests"]["nodes"]:
        cm = ((x["commits"]["nodes"] or [{}])[0]).get("commit") or {}
        lab = [e["createdAt"] for e in x["timelineItems"]["nodes"] if e and (e.get("label") or {}).get("name") == "review: approved"]
        od.append({"number": x["number"], "head_committed_at": cm.get("committedDate"),
                   "ci": ((cm.get("statusCheckRollup") or {}).get("state") or "NONE").lower(), "approved_labelled_at": lab[-1] if lab else None})
    wj("github/open_prs_detail.json", od)
    # qa/CAPABILITIES.md on main, and every main commit touching it in the last 30 days
    wt("files_main/qa/CAPABILITIES.md", gh.get(f"/contents/{REL}/qa/CAPABILITIES.md?ref={msha}", raw=True))
    cms, page = [], 1
    since30 = (NOW - timedelta(days=30)).strftime("%Y-%m-%dT%H:%M:%SZ")
    while page <= 10:
        got = gh.get(f"/commits?sha={msha}&path={REL}/qa/CAPABILITIES.md&since={since30}&per_page=100&page={page}")
        cms += got
        if len(got) < 100:
            break
        page += 1
    lines = []
    for c in sorted(cms, key=lambda c: c["commit"]["committer"]["date"]):
        sha = c["sha"]
        f = os.path.join(cache, f"cap-{sha}.md")
        if os.path.exists(f):
            txt = open(f, encoding="utf-8").read()
        else:
            txt = gh.get(f"/contents/{REL}/qa/CAPABILITIES.md?ref={sha}", raw=True)
            open(f, "w", encoding="utf-8").write(txt)
        wt(f"git/capabilities_main/{sha}.md", txt)
        lines.append(json.dumps({"sha": sha, "date": c["commit"]["committer"]["date"]}))
    wt("git/capabilities_main.jsonl", "\n".join(lines) + ("\n" if lines else ""))
    # first main commit adding each open Critical/Major bug (git log -S on the table cell, so QA-44 never matches QA-449)
    bugs = parse_bugs(git_out("show", f"{rsha}:{REL}/qa/BUGS.md") or "")
    first = {}
    for b in bugs:
        if b["sev"] in ("Critical", "Major") and b["open"] and main_ref:
            out = git_out("log", "--reverse", "--format=%cI", f"-S| {b['id']} |", main_ref, "--", f"{REL}/qa/BUGS.md", f"{REL}/qa/BUGS-CLOSED.md")
            if out and out.strip():
                first[b["id"]] = out.splitlines()[0]
    wj("git/bug_first_seen.json", first)
    # briefs: Lead B's branch, design/briefs/ at records_sha, and briefs/<ROW> lines in BACKLOG rows
    br = {}
    lbb = ((json.load(open(lead_input)) if lead_input and os.path.exists(lead_input) else {}) or {}).get("lead_b_branch") or LEAD_B_BRANCH
    for x in safe("Lead B briefs", lambda: gh.get(f"/contents/{REL}/design/lead-b-briefs?ref={lbb}"), []) or []:
        rid = brief_id(x["name"])
        if rid:
            br.setdefault(rid, f"design/lead-b-briefs/{x['name']} on {lbb}")
    for name in (git_out("ls-tree", "--name-only", rsha, f"{REL}/design/briefs/") or "").split():
        rid = brief_id(os.path.basename(name))
        if rid:
            br.setdefault(rid, f"design/briefs/{os.path.basename(name)} @{rsha[:9]}")
    for rid, line in parse_backlog(git_out("show", f"{rsha}:{REL}/BACKLOG.md") or "")["lines"].items():
        if re.search(r"briefs/" + re.escape(rid) + _END, line):
            br.setdefault(rid, f"BACKLOG.md row {rid} names briefs/{rid}")
    wj("briefs.json", br)
    if lead_input and os.path.exists(lead_input):
        shutil.copy(lead_input, os.path.join(snap, "lead-input.json"))
    return meta


def brief_id(filename):
    """A brief file's row id: the file name is the id, then a dot or a dash and more (FO-1a.md, FO-2-sales.md).
    The spec's glob <ROW>*.md would also let FO-13.md count for FO-1; the id must end where the name's id ends."""
    m = re.match(r"^(" + NARROW + r")(?=\.|-[a-z])", filename)
    return m.group(1) if m else None


def parse_bugs(text):
    out = []
    for line in (text or "").splitlines():
        if line.startswith("| QA-"):
            c = cells(line)
            if len(c) < 8:
                continue
            sev = re.search(r"(Critical|Major|Minor|Trivial)", c[2])
            # the capability ids the bug names: before any "(" note and before the "·" requirement part
            out.append({"id": c[1], "sev": sev.group(1) if sev else "?", "caps": CAP_ID.findall(c[3].split("·")[0].split("(")[0]),
                        "open": clean(c[-2]).lower().startswith("open")})
    return out


class Snap:
    """The frozen snapshot folder, read only through here."""
    def __init__(self, root):
        self.root = root
        self.meta = self.j("meta.json") or {}

    def path(self, rel):
        return os.path.join(self.root, rel)

    def text(self, rel):
        p = self.path(rel)
        return slurp(p) if os.path.exists(p) else None

    def j(self, rel, default=None):
        t = self.text(rel)
        return json.loads(t) if t else default

    def file(self, prel):
        """A record file at records_sha: files/<repo path>; found by its path suffix."""
        t = self.text(f"files/{REL}/{prel}")
        if t is not None:
            return t
        for dp, _, fs in os.walk(self.path("files")):
            for f in fs:
                full = os.path.join(dp, f)
                if full.replace(os.sep, "/").endswith("/" + prel):
                    return slurp(full)
        return None

    def checklist_history(self):
        """[(time, text)] of MVP-CHECKLIST.md commits on the records sha (P-602 (4)); None when the snapshot has none."""
        t = self.text("git/checklist_records.jsonl")
        if t is None:
            return None
        out = []
        for line in t.splitlines():
            if line.strip():
                d = json.loads(line)
                txt = self.text(f"git/checklist_records/{d['sha']}.md")
                if txt is not None:
                    out.append((parse_iso(d["date"]), txt))
        return sorted(out, key=lambda x: x[0])

    def cap_history(self):
        out = []
        for line in (self.text("git/capabilities_main.jsonl") or "").splitlines():
            if line.strip():
                d = json.loads(line)
                d["text"] = self.text(f"git/capabilities_main/{d['sha']}.md") or ""
                out.append(d)
        return sorted(out, key=lambda d: d["date"])


def num(value, src, cls, L, reason=None, lk=None, **kw):
    """One number with its lineage (§0.3): source, commit sha, as-of time, provenance class; null needs a reason.
    lk: the lineage key when it differs from the class (the usage log is reported, but committed at the records sha)."""
    sha, as_of = L.get(lk or cls, (None, None))
    d = {"value": value, "src": src, "sha": sha, "as_of": as_of, "class": "parsed" if cls == "mixed" else cls}
    if value is None:
        d["reason"] = reason or "not measured"
    d.update(kw)
    return d


USAGE_HDR = ["time_ist", "weekly_pct", "account", "by"]
USAGE_WINDOW_H = 24
USAGE_MIN_SPAN_H = 20          # per-delivery figures need readings covering at least 20 h of the 24


def parse_usage_log(text):
    """cockpit/usage-log.tsv (P-602 (4)): one line per Lead check, tab-separated time_ist (ISO with its offset),
    weekly_pct (whole number 0-100), account, by. Blank lines, '#' lines and the header are skipped. A malformed line
    is left out and listed with its line number and why (never guessed). Returns (readings, bad)."""
    out, bad = [], []
    for n, line in enumerate((text or "").splitlines(), 1):
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        f = [x.strip() for x in line.split("\t")]
        if f == USAGE_HDR:
            continue
        why, at = None, None
        if len(f) != 4:
            why = f"{len(f)} fields, needs 4 separated by tabs"
        elif not re.fullmatch(r"\d{1,3}", f[1]) or int(f[1]) > 100:
            why = f"weekly_pct '{f[1][:12]}' is not a whole number from 0 to 100"
        elif not f[2] or not f[3]:
            why = "account or by is empty"
        else:
            try:
                at = datetime.fromisoformat(f[0])
            except ValueError:
                why = f"time '{f[0][:30]}' is not ISO"
            if at is not None and at.tzinfo is None:
                why = f"time '{f[0][:30]}' has no UTC offset"
        if why:
            bad.append({"line": n, "why": why})
            continue
        out.append({"time": f[0], "at": at, "pct": int(f[1]), "account": f[2], "by": f[3]})
    return out, bad


def usage_window(readings, start, end):
    """Weekly-plan % used in (start, end]: the readings inside the window in time order (file order on a tie); each pair of
    consecutive readings of the same account adds its increase. A change of account, or a fall (a plan reset), starts a
    new part and adds nothing (never negative use); then the sum is "at least" (use across the break is not seen). The
    step from the last reading before the window is not counted. first/last = the first and last reading of a counted
    step (the span the sum covers)."""
    inw = sorted([r for r in readings if start < r["at"] <= end], key=lambda r: r["at"])
    used, pairs, breaks, first, last = 0, 0, [], None, None
    for a, b in zip(inw, inw[1:]):
        if a["account"] != b["account"]:
            breaks.append(f"account {a['account']} to {b['account']} at {b['time']}")
        elif b["pct"] < a["pct"]:
            breaks.append(f"{b['account']} fell {a['pct']}% to {b['pct']}% at {b['time']} (plan reset)")
        else:
            used += b["pct"] - a["pct"]
            pairs += 1
            first = first or a
            last = b
    return {"readings": inw, "used": used, "pairs": pairs, "breaks": breaks, "first": first, "last": last}


ITEM_ID = re.compile(r"(?<![A-Za-z0-9])([AF])(\d+)(?:\s*[-–]\s*\1?(\d+))?(?![A-Za-z0-9])")
CLOSED_WORD = re.compile(r"\b(ruled|decided|done|closed|answered)\b", re.I)


def item_ids(text):
    """Founder-ask (A-n) and founder-item (F-n) ids named in a text, ranges expanded ("A37-A43", "F14-F19"), in order."""
    out = []
    for m in ITEM_ID.finditer(text or ""):
        lo, hi = int(m.group(2)), int(m.group(3) or m.group(2))
        for k in range(lo, hi + 1) if hi >= lo and hi - lo < 100 else [lo]:
            x = f"{m.group(1)}{k}"
            if x not in out:
                out.append(x)
    return out


def open_f_ids(line):
    """F ids the "For the founder" line marks open: in each ";"-clause that says "open" and none of ruled, decided, done,
    closed, answered, every F id (ranges expanded). "F2, F8 open (demo looks); F14-F19 ruled" gives F2, F8."""
    out = []
    for clause in (line or "").split(";"):
        if re.search(r"\bopen\b", clause, re.I) and not CLOSED_WORD.search(clause):
            out += [x for x in item_ids(clause) if x.startswith("F") and x not in out]
    return out


def needs_split(asks, forf, waitline, questions, prs_ok, st_src, prs_src, lin=None, today=None):
    """P-602 (1): Needs you counts only the founder's own items: open founder asks (one per table row), plus each F id the
    "For the founder" line marks open, plus each A or F id the "Waiting on the founder" line names that is not already
    counted (not named in an open ask row, not an open F id). A line naming no new id (a pointer such as "today's items
    are in hand-over item 0") counts 0 and still shows behind the click. A PR's unanswered "Question for the tech lead"
    is the tech lead's to answer: it goes to lead_queue, never into Needs you.
    lin: {"parsed": (sha, as_of), "measured": (sha, as_of)} lineage for the two counts."""
    lin = lin or {}
    fopen = open_f_ids(forf)
    counted = set(fopen)
    for a in asks:
        counted.update(a.get("names") or [])
    wnew = [x for x in item_ids(waitline) if x not in counted]
    n = len(asks) + len(fopen) + len(wnew)

    def clause_of(line, rid):
        """The ";"-clause of a line that names the id: his one line for that item."""
        for c in re.split(r";", line or ""):
            if rid in item_ids(c):
                return clean(c.strip(), 160)
        return clean(line, 160)
    # board v61: one line per item: what he must decide or do, and by when when the record names a date (FORMULAS.md › Needs you)
    items = [{"id": a["id"], "line": a.get("line") or a["ask"], "by": a.get("by"), "kind": "ask", "src": a["src"]} for a in asks]
    items += [{"id": x, "line": clause_of(forf, x), "by": due_date(clause_of(forf, x), today), "kind": "for_founder",
               "src": f"{st_src} › For the founder"} for x in fopen]
    items += [{"id": x, "line": clause_of(waitline, x), "by": due_date(clause_of(waitline, x), today), "kind": "waiting",
               "src": f"{st_src} › Start here › Waiting on the founder"} for x in wnew]

    def lineage(cls):
        sha, as_of = lin.get(cls, (None, None))
        return {"class": cls, "sha": sha or "none", "as_of": as_of or "unknown"}
    needs = {"asks": asks, "items": items,
             "for_founder": V(forf, f"{st_src} › For the founder", open_ids=fopen, counted=bool(fopen)),
             "waiting_line": V(waitline, f"{st_src} › Start here › Waiting on the founder", new_ids=wnew, counted=bool(wnew)),
             "count": dict(V(n, f"open founder asks ({len(asks)} rows) + F ids the For the founder line marks open ({len(fopen)}) + ids the "
                                f"Waiting on the founder line names that are not already counted ({len(wnew)}); {st_src}"), **lineage("parsed"))}
    lq = V(len(questions) if prs_ok else None,
           "open PRs with an unanswered Question for the tech lead (factory-board.sh rule; GitHub, read live at this refresh)"
           if prs_ok else "not measured: the open pull requests could not be read at this refresh")
    lq.update(lineage("measured"))
    if not prs_ok:
        lq["reason"] = lq["src"]
    return needs, {"items": questions, "src": prs_src, "count": lq}


def nearest_rank(xs, p):
    xs = sorted(xs)
    return xs[max(0, math.ceil(p * len(xs)) - 1)] if xs else None


def monte_carlo(counts, remaining, today, runs=MC_RUNS, seed=MC_SEED, cap=MC_CAP):
    """§1 forecast: each run draws one day's throughput at a time from the 14 daily counts until the remaining
    changes are done (day 1 = tomorrow); 50% and 85% dates by nearest rank. A run still short at 365 days is "beyond 1 year"."""
    if remaining <= 0:
        return {"p50": today.isoformat(), "p85": today.isoformat(), "reason": None}
    if not counts or sum(counts) == 0:
        return {"p50": None, "p85": None, "reason": "not measured: no merges in the window"}
    rng = random.Random(seed)
    res = []
    for _ in range(runs):
        left, d = remaining, 0
        while left > 0 and d < cap:
            d += 1
            left -= rng.choice(counts)
        res.append(d if left <= 0 else cap + 1)
    res.sort()
    out = {"reason": None}
    for k, p in (("p50", 0.5), ("p85", 0.85)):
        d = res[math.ceil(p * runs) - 1]
        out[k] = "beyond 1 year" if d > cap else (today + timedelta(days=d)).isoformat()
    return out


def constraint(L, Q, room, waits, qa_unknown, qa_count):
    """§2 Theory of Constraints line. waits: {stage: (oldest wait h or None, items)}; limits in LIMITS_H."""
    over = {k: w for k, (w, n) in waits.items() if w is not None and w > LIMITS_H[k]}
    if qa_unknown and qa_count > 0:
        return {"stage": "unknown", "wait_h": None, "line": "Constraint unknown: qa wait not measured.", "add": None}
    if Q >= 1 and not over:
        add = min(Q, room) if room is not None else None
        return {"stage": "building", "wait_h": None, "add": add,
                "line": f"{L} lanes working · {Q} rows ready with nobody on them → could add "
                        + (f"{add} lanes." if add is not None else f"up to {Q} lanes (room not measured).")}
    cand = {k: w for k, (w, n) in waits.items() if w is not None}
    if not cand:
        return {"stage": "none", "wait_h": None, "add": None,
                "line": "More lanes won't help now: no row is ready with a brief (Q = 0) and no queue is waiting."}
    k = max(cand, key=lambda s: (cand[s] / LIMITS_H[s], cand[s]))
    return {"stage": k, "wait_h": round(cand[k], 1), "add": None,
            "line": f"More lanes won't help now: the constraint is {k} (wait {round(cand[k], 1)} h)."}


# ---- Team by component (board v57, founder 15 Nov 10:2x IST): the founder → components → owning Lead → lanes
# Owner "lead-b": the PF/FO/AUD rows sit in BACKLOG's "Full MVP: platform (PF) and front office (FO), shaped by Lead B"
# section; "tech": the current tech Lead (STATE current_lead:), who holds the release.
COMPONENTS = [
    {"id": "platform", "name": "Platform", "owner": "lead-b",
     "job": "Platform rows (PF): sign-in, firms, billing, messages, automation, portal login, complaints, running the service"},
    {"id": "front_office", "name": "Front office", "owner": "lead-b",
     "job": "Front-office rows (FO, AS): leads, booking, retainers, signing, compliance checks, the client copy"},
    {"id": "client_money", "name": "Client money", "owner": "lead-b",
     "job": "Client-money rows (FO-7*): invoices, card payments, the trust ledger"},
    {"id": "case_side", "name": "Case side", "owner": "tech",
     "job": "Case-side rows (CS, BK and the proof's rows): cases, documents, forms, the configurator"},
    {"id": "audit", "name": "Audit", "owner": "lead-b",
     "job": "Audit rows (AUD): one audit trail nobody can edit, across the modules"},
    {"id": "pipeline", "name": "Pipeline and checks", "owner": "tech",
     "job": "CI, the merge queue, the guards and the board's own checks (CI, TR rows)"},
    {"id": "qa", "name": "qa", "owner": "tech",
     "job": "Independent tests of merged work; the Works verdicts in qa/CAPABILITIES.md"},
    {"id": "strategy_desk", "name": "Strategy desk", "owner": "tech",
     "job": "The founder's read-only strategy session; the tech Lead opens and reopens it"},
]
COMP_BY_ID = {c["id"]: c for c in COMPONENTS}
# row id prefix → component; the longest prefix wins (FO-7 before FO)
COMP_PREFIX = [("FO-7", "client_money"), ("FO-", "front_office"), ("AS-", "front_office"), ("PF-", "platform"), ("DB-", "platform"),
               ("CS-", "case_side"), ("BK-", "case_side"), ("M3-", "case_side"), ("B5-", "case_side"), ("UX-", "case_side"),
               ("G-", "case_side"), ("L-", "case_side"), ("AUD-", "audit"), ("Q-", "qa"), ("CI-", "pipeline"), ("TR-", "pipeline"),
               ("Flaky-", "pipeline")]
MODULE_COMP = {"platform": "platform", "front office": "front_office", "client money": "client_money", "case side": "case_side", "audit": "audit"}
LANE_BEHIND_MIN = LANE_WINDOW_MIN                 # a lane falls behind with no push (or idle) for 90 min, or when blocked
ESCALATION_STEPS = "lane → its Lead → the tech Lead → the founder only for money, a lower bar or a day or more"


def comp_name(text):
    """A component given in Lead input, by id or by name (any case); None when unknown."""
    t = (text or "").strip().lower().replace("-", " ").replace("_", " ")
    return next((c["id"] for c in COMPONENTS if t in (c["id"].replace("_", " "), c["name"].lower())), None)


def component_of(row, role=None, given=None, rows=None):
    """(component id, how): Lead input `component` → role (qa, desk) → row id prefix → the Module of a Build row citing
    the id → the words "pipeline"/"qa" in the row text → None ("not mapped")."""
    if given and comp_name(given):
        return comp_name(given), "Lead input component"
    if role == "qa":
        return "qa", "role qa"
    if role in ("desk", "strategy desk"):
        return "strategy_desk", "role desk"
    ids = cell_ids(row or "")
    for rid in ids:
        for pre, cid in COMP_PREFIX:
            if rid.startswith(pre):
                return cid, f"row prefix {pre.rstrip('-')}"
    for rid in ids:
        for r in rows or []:
            if rid in r["ids"]:
                mod = re.sub(r"\s*\(.*?\)", "", r["module"].split("+")[0]).strip().lower()
                if mod in MODULE_COMP:
                    return MODULE_COMP[mod], f"Module of map row {r['map']}"
    low = (row or "").lower()
    if re.search(r"\bpipeline\b|\bci\b", low):
        return "pipeline", "row text"
    if re.search(r"\bqa\b|\bretests?\b", low):
        return "qa", "row text"
    return None, "not mapped"


def org_components(org, sessions, rows, open_prs, taken, cur_lead, rsha):
    """The Team tab's org view: one block per component with its owner, responsibility, escalation path and lanes,
    each lane wired to the Build rows (MVP-CHECKLIST map rows) whose parts name its row id."""
    t0 = parse_iso(taken) if taken else None
    lead_b = next((l for l in org["leads"][1:]), None)
    tech = org["leads"][0]
    by_name = {s.get("name"): s for s in sessions}
    title_of = {p["number"]: p["title"] for p in open_prs}
    out = {c["id"]: {"id": c["id"], "name": c["name"], "job": c["job"], "owner_kind": c["owner"], "lanes": []} for c in COMPONENTS}
    unmapped = []
    for ln in org["lanes"]:
        s = by_name.get(ln["name"]) or {}
        row = ln.get("row")
        if not row and ln.get("pr") in title_of:          # a lane GitHub alone shows: its row from the PR title
            row = title_id(title_of[ln["pr"]]) or loose_title_id(title_of[ln["pr"]])
            ln["row"] = row
        cid, how = component_of(row, ln.get("role"), s.get("component"), rows)
        ln["component"], ln["component_how"] = cid, how
        ln["kind"] = s.get("kind")
        ln["idle_min"] = s.get("idle_min")
        ln["last_push_at"] = ((t0 - timedelta(hours=ln["push_h"])).isoformat(timespec="minutes") if t0 and ln.get("push_h") is not None else None)
        ids = cell_ids(row or "")
        ln["maps"] = [{"map": r["map"], "cap": r["cap"]} for r in rows if set(ids) & set(r["ids"])]
        why = None
        if (ln.get("state") or "").lower() == "blocked":
            why = "blocked (Lead input)"
        elif ln.get("push_h") is not None and ln["push_h"] * 60 > LANE_BEHIND_MIN:
            why = f"no push for {ln['push_h']} h (GitHub)"
        elif ln.get("push_h") is None and ln.get("idle_min") is not None and ln["idle_min"] > LANE_BEHIND_MIN:
            why = f"idle {ln['idle_min']} min (Lead input)"
        ln["behind"] = why
        given_owner = s.get("owner")
        comp = COMP_BY_ID.get(cid)
        ln["owner"] = given_owner or (None if not comp else (lead_b or {}).get("name") if comp["owner"] == "lead-b" else tech["name"])
        ln["owner_how"] = "Lead input owner" if given_owner else "component's owner" if comp else "not mapped"
        (out[cid]["lanes"] if cid else unmapped).append(ln)
    comps = []
    for c in COMPONENTS:
        b = out[c["id"]]
        if c["owner"] == "lead-b":
            own = {"name": lead_b["name"], "role": "Lead B: platform and front office", "src": lead_b["src"]} if lead_b else \
                  {"name": None, "role": "Lead B", "src": "Lead input sessions (no session with role lead-b)", "reason": "not reported: no Lead B session in the Lead input"}
            esc_ = ["the lane", own["name"] or "Lead B", tech["name"] + " (tech Lead)", "the founder (only for money, a lower bar or a day or more)"]
            acts = f"{own['name'] or 'Lead B'} unblocks or restarts the lane; if not cleared in about an hour, {tech['name']} (the tech Lead) steps in"
        else:
            own = {"name": tech["name"], "role": "tech Lead and release holder", "src": tech["src"]}
            esc_ = ["the lane", tech["name"] + " (tech Lead)", "the founder (only for money, a lower bar or a day or more)"]
            acts = f"{tech['name']} (the tech Lead) unblocks or restarts the lane"
        if c["id"] == "strategy_desk":
            acts = f"{tech['name']} reopens the desk from its track file; the desk advises the founder and changes nothing"
        maps = sorted({m["map"] for ln in b["lanes"] for m in ln["maps"]})
        b.update({"owner": own, "escalation": esc_, "if_behind": acts, "maps": maps,
                  "behind": sum(1 for ln in b["lanes"] if ln["behind"])})
        if c["id"] == "strategy_desk":
            b["desk"] = org.get("desk") or []
        comps.append(b)
    return {"items": comps, "unmapped": unmapped, "escalation_rule": ESCALATION_STEPS,
            "standbys": org.get("standbys") or [], "tech_lead": tech["name"], "lead_b": (lead_b or {}).get("name"),
            "src": "Lead input sessions (component, owner, row, pr; reported) + branches and open PRs (measured); component by row prefix "
                   "when not given (FORMULAS.md › Team by component)", "class": "reported + measured", "as_of": taken, "sha": rsha}


def compute_board(snap, now, history, reconcile_out=None, reconcile_note=None):
    """Every §1-§5 and §7 number from the snapshot. history: committed history.jsonl lines (dicts)."""
    meta = snap.meta
    today = now.astimezone(IST).date()
    taken = meta.get("taken_at")
    msha, rsha = (meta.get("main_sha") or "")[:9], (meta.get("records_sha") or "")[:9]
    li = snap.j("lead-input.json")
    li_sha = git_blob_sha(snap.text("lead-input.json"))[:9] if li else None
    L = {"measured": (msha or None, taken), "parsed": (rsha or None, taken), "mixed": (f"records {rsha} + main {msha}", taken),
         "reported": (f"lead-input {li_sha}" if li else "no Lead input", (li or {}).get("as_of") or taken)}
    rb = meta.get("records_branch")
    ck_src = f"MVP-CHECKLIST.md @{rsha} ({rb})"
    bl_src = f"BACKLOG.md @{rsha} ({rb})"
    gh_src = f"GitHub snapshot {taken}"
    notes, invariants = [], []

    ck_text, bl_text, plan_text = snap.file("MVP-CHECKLIST.md"), snap.file("BACKLOG.md"), snap.file("cockpit/plan.json")
    ck = parse_checklist(ck_text)
    bl = parse_backlog(bl_text)
    plan = json.loads(plan_text) if plan_text else {"dates": []}
    caps_main = parse_caps(snap.text("files_main/qa/CAPABILITIES.md"))
    pulls = [p for p in (snap.j("github/pulls.json") or []) if not p["head"]["ref"].startswith("mergify/")]
    cutoff = now.astimezone(timezone.utc)
    merged = [p for p in pulls if p.get("merged_at") and parse_iso(p["merged_at"]) <= cutoff]
    open_prs = [p for p in pulls if p["state"] == "open"]
    detail = {d["number"]: d for d in (snap.j("github/open_prs_detail.json") or [])}
    branches = snap.j("github/branches_recent.json") or []
    briefs = snap.j("briefs.json") or {}
    rows = ck["rows"]
    nrows = len(rows)
    baseline = plan.get("baseline_rows") or BASELINE_ROWS

    # ---- N2: Release 1 changes and their merge dates
    # R4: a cited id that BACKLOG lacks is an unshaped part in a row not Shaped; in a Shaped row it is an invariant failure
    shaped_missing = []
    for r in rows:
        for x in r["ids"]:
            if x not in bl["ids"]:
                if r["status"] == "Shaped":
                    shaped_missing.append(f"{x} (row {r['map']})")
                elif x not in r["unshaped_ids"]:
                    r["unshaped_ids"].append(x)
    r1 = []                                            # R5: only ids the checklist cites (Bake rows count only when cited)
    for r in rows:
        r1 += [x for x in r["ids"] if x not in r1]
    change_at, unclassified = {}, set()
    for p in sorted(merged, key=lambda p: p["merged_at"]):
        if is_records(p):
            continue
        for rid in r1:
            if rid not in change_at and title_has(p["title"], rid):
                if p.get("files_app") is True:
                    change_at[rid] = p["merged_at"]
                elif p.get("files_app") is None:
                    unclassified.add(rid)
    unclassified -= set(change_at)
    if unclassified:
        notes.append("App-code check missing for the PRs of " + ", ".join(sorted(unclassified)) + " (not counted)")
    change_day = {k: ist_day(v) for k, v in change_at.items()}
    per_day = {}
    for d in change_day.values():
        per_day[d] = per_day.get(d, 0) + 1
    # §11 R8: the window never reaches before 13 Nov: IST days from 13 Nov (inclusive) to today, at most the last 14
    days_since = (today - R1_START).days + 1
    w = max(0, min(14, days_since))
    win = [today - timedelta(days=w - 1 - i) for i in range(w)]
    in_win = sum(per_day.get(d, 0) for d in win)
    first_day = (R1_START + timedelta(days=4)).strftime("%-d %b")
    if days_since < 5:
        Y = num(None, f"Release 1 changes merged per IST day ({gh_src}; checklist {ck_src})", "mixed",
                L, f"not measured yet: needs 5 days of Release 1 history, from {first_day} ({max(0, days_since)} so far)", window_days=w, merged_in_window=in_win)
    else:
        Y = num(round(in_win / w, 2), f"{in_win} Release 1 changes merged in the last {w} IST days ÷ {w} ({gh_src}; {ck_src})", "mixed", L,
                window_days=w, merged_in_window=in_win)

    # ---- §1 C1: remaining scope in changes
    shaped = [r for r in rows if r["status"] != "Not shaped"]
    unshaped = [r for r in rows if r["status"] == "Not shaped"]
    shaped_ids = []
    for r in shaped:
        shaped_ids += [x for x in r["ids"] if x not in shaped_ids]
    rem_shaped = sum(1 for x in shaped_ids if x not in change_at)
    rem_unshaped = sum(max(0, UNSHAPED_FACTOR - sum(1 for x in r["ids"] if x in change_at)) for r in unshaped)
    remaining = rem_shaped + rem_unshaped
    R = num(remaining, f"unmerged ids of shaped Build rows ({rem_shaped}) + {UNSHAPED_FACTOR} × each Build row not shaped, "
            f"less its merged parts ({rem_unshaped}); {ck_src}, {bl_src}, {gh_src}", "mixed", L,
            label=f"estimate: {len(unshaped)} unspecified capabilities × {UNSHAPED_FACTOR} (P-586 (4), to be settled 19 Nov)",
            shaped_unmerged=rem_shaped, unshaped_rows=len(unshaped), unshaped_estimate=rem_unshaped)

    # ---- §1 B1: built and proven per Build row
    for r in rows:
        r["built"] = None
        if r["status"] == "Not shaped" or r["gap"] or r["unshaped_ids"]:
            continue
        if not r["ids"]:
            # B1 dates a row by its BACKLOG parts; a row with none has no built date. Rows the checklist marks Merged or
            # qa Works with no part (proven in the proof of concept) are shown apart as "built before 13 Nov".
            r["pre_baseline"] = r["status"] in ("Merged", "qa Works")
            continue
        if all(x in change_at for x in r["ids"]):
            r["built"] = max(change_day[x] for x in r["ids"]).isoformat()
    built_rows = [r for r in rows if r["built"]]
    pre = [r["map"] for r in rows if r.get("pre_baseline")]
    B = num(len(built_rows), f"shaped Build rows whose BACKLOG parts all merged through app PRs (built date = the latest part's merge date); "
            f"{ck_src}, {gh_src}", "mixed", L,
            built_before=num(len(pre), "Build rows with no BACKLOG part that the checklist marks Merged or qa Works (built in the proof of concept, "
                             "before 13 Nov; no date)", "parsed", L, maps=pre))
    hist_caps = snap.cap_history()
    proven_reason = None
    if not ck["has_qa_col"]:
        proven_reason = "not measured: the checklist has no qa id column yet (qa's R1 capabilities, #1748)"
    for r in rows:
        r["proven"], r["proven_at"] = None, None
        if proven_reason or not r.get("qa_ids"):
            continue
        for h in hist_caps:
            cm = parse_caps(h["text"])
            if all(cm.get(q, {}).get("status", "").startswith("Works") for q in r["qa_ids"]):
                r["proven"], r["proven_at"] = ist_day(h["date"]).isoformat(), h["date"]
                break
    P_ = num(None if proven_reason else sum(1 for r in rows if r["proven"]),
             f"first main commit of qa/CAPABILITIES.md (last 30 days) in which every qa id of the row reads Works; {ck_src}", "mixed", L, proven_reason)
    dated = built_rows
    ratio = None
    if len(dated) >= 5:
        parts = len({x for r in dated for x in r["ids"]})
        ratio = num(round(parts / len(dated), 2), f"distinct parts of the {len(dated)} built rows with dated parts ÷ those rows", "mixed", L)
    disagree = [{"map": r["map"], "checklist": r["status"], "computed": "built" if r["built"] else "not built"}
                for r in rows if bool(r["built"]) != (r["status"] in ("Merged", "qa Works")) and not r.get("pre_baseline")]

    # ---- §1 committed date, X, light
    h1 = next((d for d in plan.get("dates", []) if d.get("id") == "H1"), None)
    m1 = next((d for d in plan.get("dates", []) if d.get("id") == "M1"), None)
    committed = (h1.get("date_to") or h1.get("date")) if h1 and h1.get("kind") == "committed" else None
    tol = h1.get("tolerance_days") if h1 else None
    set_on = (m1 or {}).get("date")
    if committed:
        days_left = (datetime.fromisoformat(committed).date() - today).days
        X = num(round(remaining / days_left, 2) if days_left > 0 else None, f"remaining scope in changes ÷ calendar days to the committed date {committed}",
                "mixed", L, "not measured: the committed date is today or past")
    else:
        X = num(None, "cockpit/plan.json H1 (kind committed)", "parsed", L, f"not measured: no committed date yet (set {set_on or 'not dated'})")

    # ---- P-602 (4): delivery per use, over the rolling 24 h ending at taken_at
    d_end = cutoff
    d_start = d_end - timedelta(hours=USAGE_WINDOW_H)
    tiso = lambda t: t.astimezone(IST).isoformat(timespec="seconds")
    hm = lambda t: t.astimezone(IST).strftime("%d %b %H:%M")
    ul_text = snap.file("cockpit/usage-log.tsv")
    readings, ul_bad = parse_usage_log(ul_text)
    if ul_bad:
        notes.append("usage-log.tsv: lines left out: " + "; ".join(f"line {b['line']} ({b['why']})" for b in ul_bad[:5]))
    uw = usage_window(readings, d_start, d_end)
    if ul_text is None:
        u_reason = "not measured: no weekly-plan log has been saved yet (tools/usage-log.sh)"
    elif len(uw["readings"]) < 2:
        u_reason = f"not measured: {len(uw['readings'])} weekly-plan reading(s) in the last 24 h, needs 2 (tools/usage-log.sh at each check)"
    elif uw["pairs"] == 0:
        u_reason = "not measured: no two readings in a row from the same account without a plan reset in the last 24 h"
    else:
        u_reason = None
    pct_used = None if u_reason else uw["used"]
    at_least = bool(uw["breaks"]) and pct_used is not None
    # the span the plan % covers: first to last reading of a counted step; deliveries are counted over the same span
    if pct_used is not None:
        s_from, s_to, basis = uw["first"]["at"], uw["last"]["at"], "readings"
    else:
        s_from, s_to, basis = d_start, d_end, "24 h"
    span_h = round((s_to - s_from).total_seconds() / 3600, 1)
    span = {"from": tiso(s_from), "to": tiso(s_to), "hours": span_h, "basis": basis}
    L["usage"] = (f"cockpit/usage-log.tsv @{rsha}", tiso(uw["last"]["at"]) if pct_used is not None else taken)
    ul_src = f"cockpit/usage-log.tsv @{rsha} ({rb}): the weekly plan % the Lead typed at each check (tools/usage-log.sh)"
    in_span = lambda iso: iso is not None and s_from < parse_iso(iso) <= s_to
    span_txt = f"{hm(s_from)} to {hm(s_to)} IST"
    ch_span = sorted(rid for rid, at in change_at.items() if in_span(at))
    D_ch = num(len(ch_span), f"Release 1 changes whose first app-code merge falls between {span_txt} (the same changes as the pace line); "
               f"{gh_src}; {ck_src}", "mixed", L, ids=ch_span)

    # qa Works, one rule for done and needed (the qa queue's): the row's checklist Status reads "qa Works" or the row is proven
    hist_ck = snap.checklist_history()

    def works_at(t):
        """Maps at qa Works at time t, or None when the snapshot's checklist history does not reach back to t."""
        if t >= cutoff:
            st = {r["map"]: r["status"] for r in rows}
        else:
            past = [x for x in (hist_ck or []) if x[0] <= t]
            if not past:
                return None
            st = {r["map"]: r["status"] for r in parse_checklist(past[-1][1])["rows"]}
        maps = {m for m, v in st.items() if v == "qa Works"}
        if not proven_reason:
            maps |= {r["map"] for r in rows if r.get("proven_at") and parse_iso(r["proven_at"]) <= t}
        return maps

    def reached(a, b):
        wa, wb = works_at(a), works_at(b)
        return None if wa is None or wb is None else sorted(wb - wa)
    hist_reason = "not measured: the checklist's earlier versions do not reach back that far in this snapshot"
    wr = reached(s_from, s_to)
    D_wk = num(None if wr is None else len(wr), f"Build rows that reached qa Works (checklist Status reads qa Works, or proven) between {span_txt}; "
               f"{ck_src} and its earlier versions", "mixed", L, hist_reason, maps=wr or [])
    wd = reached(d_start, d_end)
    D_done = num(None if wd is None else len(wd), f"Build rows that reached qa Works (Status reads qa Works, or proven) in the 24 h to taken_at; {ck_src} "
                 "and its earlier versions", "mixed", L, hist_reason, maps=wd or [])
    D_use = num(pct_used, f"{'at least ' if at_least else ''}the sum of rises between readings in a row from the same account, {span_txt}"
                f"{' (a plan reset or an account change in between: use across it is not seen)' if at_least else ''}; {ul_src}",
                "reported", L, u_reason, lk="usage", at_least=at_least,
                readings=[{k: x[k] for k in ("time", "pct", "account", "by")} for x in uw["readings"]], breaks=uw["breaks"], bad_lines=ul_bad)

    def per(n, what, none_words):
        src = f"weekly plan % used ÷ {what}, between {span_txt}"
        if pct_used is None:
            return num(None, src, "reported", L, u_reason, lk="usage")
        if span_h < USAGE_MIN_SPAN_H:
            return num(None, src, "reported", L, f"not measured: the readings cover only {span_h:g} h of 24", lk="usage")
        if n is None:
            return num(None, src, "reported", L, hist_reason, lk="usage")
        if n == 0:
            return num(None, src, "reported", L, f"{none_words} ({pct_used}% of a weekly plan used)", lk="usage")
        return num(round(pct_used / n, 1), f"{pct_used}% of a weekly plan ÷ {n} {what}, between {span_txt}", "reported", L, lk="usage",
                   at_least=at_least)
    rows_left = None if works_at(cutoff) is None else nrows - len(works_at(cutoff))
    rn_src = (f"Build rows not yet at qa Works (checklist Status reads qa Works, or proven) ÷ calendar days to the committed date {committed}; "
              f"{ck_src}")
    if committed:
        RN = num(round(rows_left / days_left, 2) if days_left > 0 else None, rn_src, "mixed", L, "not measured: the committed date is today or past",
                 rows_left=rows_left, days_left=days_left)
    else:
        RN = num(None, "cockpit/plan.json H1 (kind committed)", "parsed", L, f"not measured: no committed date yet (set {set_on or 'not dated'})",
                 rows_left=rows_left)
    delivery = {"from": tiso(d_start), "to": tiso(d_end), "span": span,
                "plan_pct_used": D_use, "changes_merged": D_ch, "works_rows": D_wk,
                "pct_per_change": per(len(ch_span), "Release 1 changes merged", "no Release 1 changes merged"),
                "pct_per_works_row": per(D_wk["value"], "Release 1 rows that reached qa Works", "no rows reached qa Works"),
                "rows_done_per_day": D_done, "rows_needed_per_day": RN}

    # ---- §1 forecast (Monte Carlo on 14 daily counts)
    days14 = win                                       # R8: the same days as the pace window
    counts = [per_day.get(d, 0) for d in days14]
    sample = f"Release 1 changes merged per day, {w} days from 13 Nov"
    if days_since >= 5:
        mc = monte_carlo(counts, remaining, today)
    else:   # R2: the reference class is withdrawn
        mc = {"p50": None, "p85": None, "reason": f"not measured yet: fewer than 5 days of Release 1 history (from {first_day})", "short": True}
    fsrc = f"Monte Carlo, {MC_RUNS:,} runs, seed {MC_SEED}, cap {MC_CAP} days; {sample}; remaining {remaining}"
    F50 = num(mc["p50"], fsrc, "mixed", L, mc["reason"])
    F85 = num(mc["p85"], fsrc, "mixed", L, mc["reason"])
    if mc["reason"] and not mc.get("short"):
        light = {"state": "red", "why": mc["reason"].replace("not measured: ", "") + " (no merges at all)"}
    elif not committed:
        light = {"state": "grey", "why": f"no committed date (set {set_on or 'not dated'})"}
    elif tol is None:
        light = {"state": "grey", "why": "no tolerance yet (the founder's, asked once after 19 Nov)"}
    elif mc.get("short"):
        light = {"state": "amber", "why": mc["reason"]}
    elif mc["p85"] == "beyond 1 year":
        light = {"state": "red", "why": "85% date beyond 1 year"}
    else:
        lim = datetime.fromisoformat(committed).date() + timedelta(days=tol)
        d85 = datetime.fromisoformat(mc["p85"]).date()
        light = ({"state": "green", "why": f"85% date {mc['p85']} on or before {lim}"} if d85 <= lim else
                 {"state": "amber", "why": f"85% date {mc['p85']} within 7 days past {lim}"} if d85 <= lim + timedelta(days=7) else
                 {"state": "red", "why": f"85% date {mc['p85']} beyond {lim} + 7 days"})

    # ---- board v61 (founder A78, P-609): early Release 1 estimate band, low confidence, until the measured forecast (5 days)
    full = [d for d in win if d < today]                # IST days already over; today is still running
    base = full or win
    bcts = [per_day.get(d, 0) for d in base]
    eb_src = (f"today + Release 1 changes left ({remaining}) ÷ the best full IST day's merges (low date) and ÷ the mean of the full "
              f"IST days (high date), days {', '.join(d.strftime('%-d %b') for d in base)} ({', '.join(map(str, bcts))} merged); {gh_src}; {ck_src}")
    eb_kw = {"confidence": "low", "committed": committed, "days": [d.isoformat() for d in base], "counts": bcts, "n": len(base),
             "remaining": remaining, "window": (f"full IST days {base[0].strftime('%-d %b')} to {base[-1].strftime('%-d %b')} ({len(base)} days)"
                                                if base else "no IST day since 13 Nov yet")}

    def ahead(rate):
        k = math.ceil(remaining / rate)
        return "beyond 1 year" if k > MC_CAP else (today + timedelta(days=k)).isoformat()
    if days_since >= 5:
        EB = num(None, eb_src, "mixed", L, f"replaced by the measured forecast (Monte Carlo, from {first_day})", **eb_kw)
    elif not bcts or max(bcts) == 0:
        EB = num(None, eb_src, "mixed", L, "not measured: no Release 1 change merged on a full IST day yet", **eb_kw)
    elif remaining <= 0:
        EB = num({"low": today.isoformat(), "high": today.isoformat()}, eb_src, "mixed", L, **eb_kw)
    else:
        EB = num({"low": ahead(max(bcts)), "high": ahead(sum(bcts) / len(bcts))}, eb_src, "mixed", L, **eb_kw)

    # ---- board v61: three daily leading numbers (founder A78)
    last_full = full[-1] if full else None
    lf_txt = last_full.strftime("%-d %b") if last_full else None
    series = [{"day": d.isoformat(), "count": per_day.get(d, 0)} for d in win]
    LD_parts = num(per_day.get(last_full, 0) if last_full else None,
                   f"Release 1 changes (BACKLOG parts) whose first app-code merge fell on the IST day {lf_txt or 'not over yet'}; {gh_src}; {ck_src}",
                   "mixed", L, "not measured: no full IST day since 13 Nov yet", day=last_full.isoformat() if last_full else None,
                   today_so_far=per_day.get(today, 0), series=series)
    built_on = lambda d: sum(1 for r in built_rows if r["built"] == d.isoformat())
    LD_caps = num(len(built_rows), f"Build rows whose BACKLOG parts all merged (cumulative, from 13 Nov to the snapshot); {ck_src}; {gh_src}",
                  "mixed", L, day=last_full.isoformat() if last_full else None, new_on_day=built_on(last_full) if last_full else None,
                  today_so_far=built_on(today), rows_total=nrows, series=[{"day": d.isoformat(), "count": built_on(d)} for d in win])
    # first verdict per qa capability: the first main version of qa/CAPABILITIES.md where it reads Works, Partial or Broken, after
    # an earlier version where it did not (or was absent); a capability already with a verdict in the oldest version is left out
    verdict = lambda st: st.startswith(("Works", "Partial", "Broken"))
    first_v, seen = {}, {}
    for i, hh in enumerate(hist_caps):
        for cid, cv in parse_caps(hh["text"]).items():
            if cid in first_v or cid in seen and seen[cid] == "known":
                continue
            if verdict(cv["status"]):
                if i == 0:
                    seen[cid] = "known"            # its first verdict is older than the history read
                else:
                    first_v[cid] = (ist_day(hh["date"]), cv["status"].startswith("Works"))
            else:
                seen[cid] = "open"
    fv = {k: x for k, x in first_v.items() if x[0] >= R1_START}
    fv_n, fv_w = len(fv), sum(1 for x in fv.values() if x[1])
    fv_src = (f"qa capabilities whose first verdict on main fell from 13 Nov to the snapshot: Works at the first verdict ÷ all first verdicts "
              f"({len(hist_caps)} versions of qa/CAPABILITIES.md on main, last 30 days)")
    fl = [x for x in fv.values() if last_full and x[0] == last_full]
    LD_fv = num(round(100 * fv_w / fv_n) if fv_n else None, fv_src, "measured", L,
                "not measured: no qa capability got its first verdict on main since 13 Nov in the history read", works=fv_w, n=fv_n,
                ids=sorted(fv), day=last_full.isoformat() if last_full else None,
                day_works=sum(1 for x in fl if x[1]), day_n=len(fl))
    leading = {"parts_merged": LD_parts, "caps_all_parts": LD_caps, "first_verdict_works_pct": LD_fv}

    # ---- history (N1): one line per IST day; today's line replaces earlier lines of today
    hist = [h for h in history if h.get("day") != today.isoformat()]
    file_shas = {rel: git_blob_sha(t) for rel in SNAP_FILES if rel != "cockpit/history.jsonl" for t in [snap.file(rel)] if t is not None}
    merged_r1 = len(change_at)
    today_line = {"day": today.isoformat(), "taken_at": taken, "rows": nrows, "shaped_maps": [r["map"] for r in shaped],
                  "unshaped": len(unshaped), "scope_changes": merged_r1 + remaining, "file_shas": file_shas,
                  "audit": {"built": len(built_rows), "proven": P_["value"], "checklist_sha": file_shas.get("MVP-CHECKLIST.md")}}
    prev = hist[-1] if hist else None

    # ---- §1 burn-up (capabilities: scope steps from history, built and proven recomputed)
    bdays = [R1_START + timedelta(days=i) for i in range((today - R1_START).days + 1)]
    by_day = {h["day"]: h for h in hist}
    burn = {"days": [d.isoformat() for d in bdays],
            "scope": [(nrows if d == today else (by_day.get(d.isoformat()) or {}).get("rows")) for d in bdays],
            "built": [sum(1 for r in rows if r["built"] and r["built"] <= d.isoformat()) for d in bdays],
            "proven": [None if proven_reason else sum(1 for r in rows if r["proven"] and r["proven"] <= d.isoformat()) for d in bdays],
            "h1": {"from": (h1 or {}).get("date"), "to": (h1 or {}).get("date_to"), "kind": (h1 or {}).get("kind")},
            "src": f"scope: cockpit/history.jsonl (one line per IST day) and today's {ck_src}; built and proven recomputed today"}
    ends = [x for x in [burn["h1"]["to"] or burn["h1"]["from"], mc["p85"] if mc["p85"] and mc["p85"][0].isdigit() else None] if x]
    burn["x_end"] = max(ends) if ends else today.isoformat()

    # ---- §2 capacity
    def is_session_branch(n):
        return not (n == "main" or n.startswith(("mergify/", "gh-readonly-queue/", "dependabot/")))

    def is_lane_branch(n):   # org chart lanes: the Leads' own branches are the Leads' nodes
        return is_session_branch(n) and not n.startswith(("lead/", "lead-"))
    lanes = [b for b in branches if is_session_branch(b["name"]) and not b["name"].startswith(("lead/", "lead-b-"))      # §11 R8
             and cutoff - timedelta(minutes=LANE_WINDOW_MIN) <= parse_iso(b["pushed_at"]) <= cutoff]   # frozen snapshot (P-596): a push after taken_at belongs to the next refresh, as in cockpit-reconcile.py
    Lw = num(len(lanes), f"branches with a push in the last {LANE_WINDOW_MIN} min, not main, the merge queue or the Leads' records branches "
             f"(lead/*, lead-b-*); {gh_src} branches_recent.json (push time = head commit time)", "measured", L, names=[b["name"] for b in lanes],
             n=sum(1 for b in branches if is_session_branch(b["name"]) and not b["name"].startswith(("lead/", "lead-b-"))))
    # R1b: ready rows treat any non-records merged PR (app code or not) as merged
    merged_any = set(change_at)
    for p in sorted(merged, key=lambda p: p["merged_at"]):
        if not is_records(p):
            merged_any.update(x for x in ID_TOKEN.findall(p["title"] or "") if x in bl["lines"] and title_has(p["title"], x))
    inpr = {}
    for p in open_prs:
        if is_records(p):
            continue
        for x in ID_TOKEN.findall(p["title"] or ""):
            if title_has(p["title"], x) and p["number"] not in inpr.get(x, []):
                inpr.setdefault(x, []).append(p["number"])
    q_rows, not_ready = [], []
    for rid in sorted(briefs, key=lambda x: (list(bl["lines"]).index(x) if x in bl["lines"] else 10 ** 6, x)):
        line = bl["deps"].get(rid)
        if line is None or rid in merged_any or rid in inpr:
            continue
        deps, non = row_deps(line)
        deps = [x for x in deps if x != rid]
        wait = [x for x in deps if x not in merged_any]
        if non or wait:
            not_ready.append({"id": rid, "waits_on": wait, "non_id": non})
        else:
            q_rows.append(rid)
    Q = num(len(q_rows), "R3: BACKLOG rows with a brief (exact id), not merged, no open PR, every dependency id merged and no non-id dependency; "
            f"briefs.json, {bl_src}, {gh_src}", "mixed", L, rows=q_rows, not_ready=not_ready, n=len(briefs))
    room_v = (li or {}).get("max_lanes")
    room = num(max(0, int(room_v) - len(lanes)) if room_v is not None else None, "Lead input max_lanes − lanes working", "reported", L,
               "not measured: Lead input has no max_lanes")
    eng = [p for p in open_prs if not RECORDS_TITLE.match(p["title"]) and not is_records(p)]
    app_open = [p for p in open_prs if p.get("files_app") is True and not is_records(p)]
    lab = lambda p: [x["name"] for x in p.get("labels", [])]
    hrs = lambda iso: (cutoff - parse_iso(iso)).total_seconds() / 3600 if iso else None
    # §11 R8: a PR with no push for 7 days is parked: listed apart, never in a stage's wait
    parked = [p for p in eng if (hrs((detail.get(p["number"]) or {}).get("head_committed_at")) or 0) > PARKED_H]
    staged = [p for p in eng if p not in parked]
    review_q = [p for p in staged if not p["draft"] and "review: approved" not in lab(p) and (detail.get(p["number"]) or {}).get("ci") == "success"]
    merge_q = [p for p in staged if "review: approved" in lab(p)]
    rw = [hrs((detail.get(p["number"]) or {}).get("head_committed_at")) for p in review_q]
    mw = [hrs((detail.get(p["number"]) or {}).get("approved_labelled_at")) for p in merge_q]
    built_wait = [r for r in built_rows if r["status"] != "qa Works" and not r.get("proven")]
    qa_unknown = bool(proven_reason)
    qa_w = None if qa_unknown else max([hrs(r["built"] + "T00:00:00+05:30") for r in built_wait], default=None)
    waits = {"review": (max([x for x in rw if x is not None], default=None), len(review_q)),
             "merge": (max([x for x in mw if x is not None], default=None), len(merge_q)),
             "qa": (qa_w, len(built_wait))}
    cons = constraint(len(lanes), len(q_rows), room["value"], waits, qa_unknown, len(built_wait))
    stages = {k: {"count": num(n, {"review": "open non-draft PRs, CI green, no `review: approved` (Ready for label)",
                                   "merge": "open PRs labelled `review: approved`",
                                   "qa": "built Build rows not yet proven"}[k] + f"; {gh_src}", "measured" if k != "qa" else "mixed", L),
                  "wait_h": num(round(wv, 1) if wv is not None else None,
                                {"review": "oldest: hours since the head commit", "merge": "oldest: hours since the label went on",
                                 "qa": "oldest: hours since the row was built"}[k], "measured" if k != "qa" else "mixed", L,
                                "not measured: qa wait needs the checklist's qa id column" if k == "qa" and qa_unknown else "nothing waiting"),
                  "limit_h": LIMITS_H[k]} for k, (wv, n) in waits.items()}
    # work item age (R2-1)
    app_merged14 = [p for p in merged if p.get("files_app") is True and not is_records(p)
                    and parse_iso(p["merged_at"]) >= cutoff - timedelta(days=14)]
    cyc = [(parse_iso(p["merged_at"]) - parse_iso(p["created_at"])).total_seconds() / 86400 for p in app_merged14]
    p85 = nearest_rank(cyc, 0.85) if len(cyc) >= 5 else None
    items = []
    for p in app_open:
        age = (cutoff - parse_iso(p["created_at"])).total_seconds() / 86400
        push = hrs((detail.get(p["number"]) or {}).get("head_committed_at"))
        items.append({"pr": p["number"], "title": clean(p["title"], 80), "age_d": round(age, 2), "push_h": round(push, 1) if push is not None else None,
                      "older": p85 is not None and age > p85,
                      "amber": (p85 is not None and age > 2 * p85) or (push is not None and push > 24)})
    older = [x for x in items if x["older"]]
    amber_items = [x for x in items if x["amber"]]
    age_reason = None if p85 is not None else f"not measured: {len(cyc)} cycle times in 14 days (needs 5)"
    idle = [{"pr": p["number"], "branch": p["head"]["ref"], "push_h": round(hrs((detail.get(p["number"]) or {})["head_committed_at"]), 1)}
            for p in eng if (detail.get(p["number"]) or {}).get("head_committed_at")
            and hrs(detail[p["number"]]["head_committed_at"]) * 60 > LANE_WINDOW_MIN]
    cap_light = "green" if not amber_items and (cons["stage"] != "building" or len(q_rows) == 0) else "amber"
    capacity = {
        "lanes_working": Lw, "ready_rows": Q, "room": room, "stages": stages, "constraint": cons,
        "age": {"p85_days": num(round(p85, 2) if p85 is not None else None, "85th percentile (nearest rank) of cycle times: app PRs merged in the last 14 days, "
                                "opened to merged, days", "measured", L, age_reason, n=len(cyc)),
                "older": num(len(older) if p85 is not None else None, "open app PRs older than the 85th percentile", "measured", L, age_reason, n=len(items)),
                "items": items, "amber_items": [x["pr"] for x in amber_items]},
        "cycle_median_days": num(round(statistics.median(cyc), 2) if len(cyc) >= 5 else None,
                                 "median days, PR opened to merged (stand-in for a row's first commit: the snapshot has no commit list), app PRs, 14 days",
                                 "measured", L, age_reason, n=len(cyc)),
        "wip": num(len(items), "open app PRs (non-records)", "measured", L),
        "idle": idle,
        "parked": [{"pr": p["number"], "title": clean(p["title"], 70), "push_d": round(hrs(detail[p["number"]]["head_committed_at"]) / 24, 1)} for p in parked],
        "baton_held": num(None, "BACKLOG touches: field", "parsed", L, "not measured: BACKLOG rows carry no touches: field yet"),
        "light": {"state": cap_light, "why": ("an item is older than 2 × the 85th percentile or has no push in 24 h" if amber_items else
                                              "rows are ready and nobody is on them" if cap_light == "amber" else "no item past the rule")},
    }

    # ---- §3 Top 3
    li_age = hrs(li["as_of"]) if li and li.get("as_of") else None
    top = (li or {}).get("top3") or {}
    cards = {}
    for k in ("today", "week", "month"):
        c = top.get(k)
        if not c or li_age is None or li_age > 2:
            cards[k] = {"state": "missing", "text": "Lead has not updated this",
                        "why": "no Lead input" if not li else f"Lead input {round(li_age, 1)} h old (limit 2 h)" if li_age is not None and li_age > 2 else "no top3." + k}
        else:
            cards[k] = dict({x: c.get(x) for x in ("what", "why", "rec", "owner", "needs_you")}, state="ok")
    top3 = {"cards": cards, "class": "reported", "src": "Lead input top3", "sha": L["reported"][0], "as_of": L["reported"][1],
            "example": bool(li and li.get("example")), "age_h": round(li_age, 1) if li_age is not None else None}

    # ---- §4 org chart: Lead input sessions, cross-checked with branches and open PRs pushed in 24 h
    st_text = snap.file("STATE.md") or ""
    cm_ = re.search(r"^current_lead:.*?\b(Lead \d+)", st_text, re.M)
    cur_lead = cm_.group(1) if cm_ else None
    sessions = (li or {}).get("sessions") or []
    pr_by_n = {p["number"]: p for p in open_prs}
    measured = {}
    for b in branches:
        if is_lane_branch(b["name"]):
            prn = next((p["number"] for p in open_prs if p["head"]["ref"] == b["name"]), None)
            if prn is None and any(p["head"]["ref"] == b["name"] for p in pulls):
                continue   # a branch whose PR is merged or closed is not a lane at work
            measured[b["name"]] = {"branch": b["name"], "pr": prn, "push_h": round(hrs(b["pushed_at"]), 1)}
    def lead_key(name):
        """Review M5: a lead is matched by its "Lead N" or "Lead B" prefix ("Lead 46 (tech lead)" reports to "Lead 46")."""
        m_ = re.match(r"\s*(Lead (?:\d+|B))\b", name or "")
        return m_.group(1) if m_ else (name or None)
    used, lanes_out = set(), []
    for s in sessions:
        if s.get("role") not in ("builder", "qa"):
            continue
        if (s.get("state") or "").lower() == "done":
            continue
        br_ = s.get("branch") or (pr_by_n.get(s.get("pr")) or {}).get("head", {}).get("ref")
        if not br_:   # no PR or branch given: an open PR whose title names one of the lane's row ids (R1 token match)
            rids = cell_ids(s.get("row") or "")
            cand = [p for p in open_prs if p["head"]["ref"] in measured and p["head"]["ref"] not in used
                    and any(title_has(p["title"], x) for x in rids)]
            br_ = cand[0]["head"]["ref"] if len(cand) == 1 else None
        hit = measured.get(br_) if br_ and br_ not in used else None
        if hit:
            used.add(br_)
        lanes_out.append({"name": s.get("name"), "role": s.get("role"), "row": s.get("row"), "pr": s.get("pr") or (hit or {}).get("pr"),
                          "reports_to": s.get("reports_to"), "reports_key": lead_key(s.get("reports_to")), "state": s.get("state"),
                          "push_h": (hit or {}).get("push_h"), "seen": "both" if hit else "reported only"})
    for k, m in measured.items():
        if k not in used:
            lanes_out.append({"name": k, "role": "unknown", "row": None, "pr": m["pr"], "reports_to": None, "reports_key": None, "state": None,
                              "push_h": m["push_h"], "seen": "measured only"})
    leads = [{"name": cur_lead or "current Lead (STATE current_lead: unreadable)", "key": lead_key(cur_lead),
              "role": "release holder: release, Bake, case side; the pipeline", "src": f"STATE.md current_lead @{rsha}"}]
    for s in sessions:
        if s.get("role") in ("lead-b",) or (s.get("role") == "lead" and "lead b" in (s.get("name") or "").lower()):
            if lead_key(s.get("name")) not in {l["key"] for l in leads}:
                leads.append({"name": s.get("name"), "key": lead_key(s.get("name")), "role": "platform + front office", "src": "Lead input sessions (reported)"})
    org = {"founder": {"name": "Founder", "role": "product direction"}, "leads": leads, "lanes": lanes_out,
           "standbys": [s.get("name") for s in sessions if s.get("role") == "standby"],
           "desk": [s.get("name") for s in sessions if s.get("role") in ("desk", "strategy desk")],
           "reviewers": "fresh Opus reviewer per PR (not standing sessions)",
           "how": "Lead shapes rows → lane builds one row → reviewer approves → Mergify merges → qa proves → board",
           "mismatches": [x for x in lanes_out if x["seen"] != "both"], "class": "reported + measured",
           "src": "Lead input sessions (reported, with reports_to) cross-checked with branches_recent.json and open PRs (measured, 24 h)",
           "sha": L["mixed"][0], "as_of": taken}
    org["components"] = org_components(org, sessions, rows, open_prs, taken, cur_lead, rsha)

    # ---- §7 working today
    wt_rows = {}
    for r in rows:
        prs = sorted({n for x in r["ids"] for n in inpr.get(x, [])})
        if prs:
            wt_rows[r["map"]] = {"kind": "pr", "prs": prs, "class": "measured"}
            continue
        rep = [s.get("name") for s in sessions if (s.get("state") or "").lower() in ("running", "pushing", "working")
               and set(cell_ids(s.get("row") or "")) & set(r["ids"])]
        if rep:
            wt_rows[r["map"]] = {"kind": "reported", "sessions": rep, "class": "reported"}
    gids = [g["id"] for g in ck["groups"] if any(r["group"] == g["id"] and r["map"] in wt_rows for r in rows)]
    working = {"groups": gids, "rows": {str(k): v for k, v in wt_rows.items()},
               "line": "Working today on: " + (", ".join(f"{g['id']}. {g['name']}" for g in ck["groups"] if g["id"] in gids) or "nothing"),
               "src": f"open PRs whose title starts with a row's BACKLOG id ({gh_src}); else a running Lead-reported lane naming it", "sha": L["mixed"][0], "as_of": taken}

    # ---- invariants (M6)
    def inv(name, ok, detail):
        invariants.append({"name": name, "ok": bool(ok), "detail": detail})
    inv("Build rows equal the baseline", nrows == baseline,
        f"{nrows} rows (baseline {baseline})" + ("" if nrows == baseline else ": scope changed, the scope line says so"))
    inv("Build rows unique", not ck["dupes"], "duplicates: " + ", ".join(f"{d['map']} ({' / '.join(d['statuses'])})" for d in ck["dupes"]) if ck["dupes"] else "no duplicate map numbers")
    inv("Every id a Shaped row cites exists in BACKLOG (R4)", not shaped_missing,
        "missing in BACKLOG.md: " + ", ".join(sorted(shaped_missing)) if shaped_missing else "all ids of Shaped rows found")
    bad = []
    for r in rows:
        if r["status"] != "qa Works":
            continue
        named = r["cap_ids"] + [c for c, v in caps_main.items() for m_ in r["milestones"] if v["m"] == m_]
        if not named or not all(caps_main.get(c, {}).get("status", "").startswith("Works") for c in named):
            bad.append(r["map"])
    inv("Every qa Works row names a qa capability that reads Works on main", not bad, "rows: " + ", ".join(map(str, bad)) if bad else "all hold")
    w_a, t_a = works_count(caps_main)
    # second parser: progress.sh's own code (M2, T, M3) plus M4 rows counted apart
    prog = run_progress(snap.text("files_main/qa/CAPABILITIES.md") or "", None)
    m4 = [v for v in caps_main.values() if v["m"] == "M4"]
    w_b = sum(x["works"] for x in prog) + sum(1 for v in m4 if v["status"].startswith("Works"))
    t_b = sum(x["total"] for x in prog) + len(m4)
    inv("Works count equals qa/CAPABILITIES.md on main (progress.sh + M4)", (w_a, t_a) == (w_b, t_b), f"{w_a}/{t_a} here, {w_b}/{t_b} by progress.sh + M4")
    mono = all(burn["built"][i] <= burn["built"][i + 1] for i in range(len(bdays) - 1))
    fall = None
    if prev and (prev.get("audit") or {}).get("built") is not None and len(built_rows) < prev["audit"]["built"]:
        changed = prev.get("rows") != nrows or (prev.get("audit") or {}).get("checklist_sha") != file_shas.get("MVP-CHECKLIST.md")
        fall = {"from": prev["audit"]["built"], "to": len(built_rows), "day": prev["day"], "explained": changed}
    inv("Cumulative built falls only with a scope or mapping change", mono and (fall is None or fall["explained"]),
        ("built fell from %d (%s) to %d: %s" % (fall["from"], fall["day"], fall["to"], "mapping or scope change line shown" if fall["explained"] else "no scope or mapping change")) if fall else
        "no fall")
    if fall and fall["explained"]:
        notes.append(f"Mapping or scope change: built {fall['from']} on {fall['day']} → {fall['to']} today (the checklist changed)")
    if bl["dupes"]:
        notes.append("Duplicate BACKLOG rows (first kept): " + ", ".join(bl["dupes"]))
    if disagree:
        notes.append("Checklist status and computed built differ on rows " + ", ".join(str(d["map"]) for d in disagree[:20]))

    # ---- reconciliation (§6.5-6.6)
    keys = {"works_on_main": w_a, "works_total": t_a, "changes_per_day_window": Y["value"], "remaining_scope_changes": remaining,
            "built_rows": len(built_rows), "proven_rows": P_["value"], "open_app_prs": len(items), "lanes_working": len(lanes),
            "ready_rows": len(q_rows), "forecast_p50_date": mc["p50"], "forecast_p85_date": mc["p85"],
            "mc_daily_counts": counts, "mc_remaining_scope": remaining,
            "plan_pct_used_24h": pct_used, "span_hours": span_h if pct_used is not None else None,
            "changes_merged_span": len(ch_span), "works_rows_span": D_wk["value"],
            "pct_per_change": delivery["pct_per_change"]["value"], "pct_per_works_row": delivery["pct_per_works_row"]["value"],
            "rows_done_24h": D_done["value"], "rows_needed_per_day": RN["value"]}
    trust = reconcile_compare(keys, reconcile_out, reconcile_note)
    trust["invariants"] = invariants
    trust["notes"] = notes
    trust["status_disagreements"] = disagree

    # ---- freshness (§6.8)
    fresh = [{"source": "GitHub data", "age_h": 0.0, "limit_h": FRESH_LIMIT_H["GitHub data"], "note": "snapshot age at publish; the page adds the time since"},
             {"source": "Lead input", "age_h": round(li_age, 1) if li_age is not None else None, "limit_h": FRESH_LIMIT_H["Lead input"]}]

    return {"keys": keys, "trust": trust, "fresh": fresh, "history_line": today_line, "history_prev": prev,
            "pace": {"changes_needed_per_day": X, "changes_per_day": Y, "built": B, "proven": P_,
                     "rows_total": num(nrows, ck_src + ": Build rows", "parsed", L), "remaining": R, "ratio": ratio,
                     "committed_date": committed, "committed_set_on": set_on, "tolerance_days": tol, "light": light,
                     "early_band": EB, "leading": leading,
                     "merged_changes": num(merged_r1, f"Release 1 changes merged so far ({gh_src})", "mixed", L), "delivery_24h": delivery,
                     "scope_note": None if nrows == baseline else f"Scope changed: {nrows} Build rows (baseline {baseline})"},
            "forecast": {"p50": F50, "p85": F85, "sample": sample, "counts": counts, "days": [d.isoformat() for d in days14],
                         "runs": MC_RUNS, "seed": MC_SEED, "cap_days": MC_CAP},
            "burnup": burn, "capacity": capacity, "top3": top3, "org": org, "working_today": working,
            "rows": [{"map": r["map"], "built": r["built"], "proven": r["proven"], "ids": r["ids"]} for r in rows]}


RECON_TOLERANCE_DAYS = {"forecast_p50_date": 1, "forecast_p85_date": 1}


def reconcile_compare(mine, theirs, note):
    """§6.5-6.6: exact agreement on every measured or parsed number; the two forecast dates within ±1 day."""
    if theirs is None:
        return {"state": "not checked", "banner": "Numbers not checked", "reason": note or "the reconciliation did not run", "diffs": [], "compared": 0}
    tn = dict(theirs.get("numbers") or {})
    mi = theirs.get("mc_inputs") or {}
    flat = {k: (v.get("value") if isinstance(v, dict) else v) for k, v in tn.items()}
    if "daily_counts" in mi:
        flat["mc_daily_counts"] = mi["daily_counts"]
    if "remaining_scope" in mi:
        flat["mc_remaining_scope"] = mi["remaining_scope"]
    diffs, n = [], 0
    for k, v in mine.items():
        if k not in flat:
            continue
        n += 1
        o = flat[k]
        if k in RECON_TOLERANCE_DAYS and isinstance(v, str) and isinstance(o, str) and v[:1].isdigit() and o[:1].isdigit():
            if abs((datetime.fromisoformat(v) - datetime.fromisoformat(o)).days) > RECON_TOLERANCE_DAYS[k]:
                diffs.append({"name": k, "board": v, "reconcile": o})
        elif v != o:
            diffs.append({"name": k, "board": v, "reconcile": o})
    if n == 0:
        return {"state": "not checked", "banner": "Numbers not checked", "reason": "the reconciliation gave no number this board knows", "diffs": [], "compared": 0}
    if diffs:
        return {"state": "disagree", "banner": "Numbers disagree: " + ", ".join(d["name"] for d in diffs), "reason": None, "diffs": diffs, "compared": n}
    return {"state": "agree", "banner": None, "reason": None, "diffs": [], "compared": n}


def run_reconcile(snap_dir, script=None):
    """Run tools/cockpit-reconcile.py on the snapshot (a separate process). Returns (output or None, note)."""
    script = script or os.path.join(HERE, "cockpit-reconcile.py")
    if not os.path.exists(script):
        return None, "not checked: tools/cockpit-reconcile.py is absent"
    try:
        r = subprocess.run([sys.executable, "-I", script, snap_dir], capture_output=True, text=True, timeout=600)
    except Exception as e:
        return None, f"not checked: the reconciliation failed to start ({str(e)[:120]})"
    if r.returncode != 0:
        return None, f"not checked: the reconciliation exited {r.returncode} ({(r.stderr or '').strip()[-160:]})"
    try:
        return json.loads(r.stdout), None
    except json.JSONDecodeError:
        return None, "not checked: the reconciliation printed no JSON"


def health(snap, now, comp, li):
    """§5: one light, items 1-7 (item 2, data age, is computed by the page)."""
    meta, ex = snap.meta, snap.meta.get("extra") or {}
    cutoff = now.astimezone(timezone.utc)
    items = []

    def item(i, name, state, detail, action=None, owner=None, cls="measured"):
        items.append({"id": i, "name": name, "state": state, "detail": detail, "action": action if state == "red" else None,
                      "owner": owner if state == "red" else None, "class": cls})
    mc = snap.j("github/main_checks.json")
    ni = snap.j("github/main_nightly.json") or {}
    if mc is None:
        item(1, "main CI", "amber", "not measured: no check runs read for main's head")
    else:
        badc = [c["name"] for c in mc if c.get("conclusion") in ("failure", "timed_out", "action_required", "startup_failure")]
        running = [c["name"] for c in mc if c.get("status") != "completed"]
        if badc or ni.get("conclusion") in ("failure", "timed_out"):
            item(1, "main CI", "red", "failed on main's head: " + ", ".join(badc + (["nightly"] if ni.get("conclusion") in ("failure", "timed_out") else [])),
                 "fix main before anything else merges", "current Lead")
        elif not mc and not ni:
            item(1, "main CI", "amber", "not measured: main's head has no check runs and no nightly run was read")
        elif running:
            item(1, "main CI", "amber", "running on main's head: " + ", ".join(running[:5]))
        else:
            ok_n = sum(1 for c in mc if c.get("conclusion") in ("success", "neutral"))
            sk_n = sum(1 for c in mc if c.get("conclusion") == "skipped")
            unfinished = [x for x in (ni, ni.get("previous") or {}) if x and x.get("conclusion") not in ("success", "failure", "timed_out")]
            night = ("newest nightly " + (ni.get("conclusion") or "not read") +
                     (" (not counted)" if ni.get("conclusion") not in ("success", None) else ""))
            if len(unfinished) == 2:
                item(1, "main CI", "amber", f"{ok_n} passed, {sk_n} skipped on main's head; the last two nightly runs did not finish "
                     f"({ni.get('conclusion')}, {(ni.get('previous') or {}).get('conclusion')})")
            else:
                item(1, "main CI", "green", f"{ok_n} passed, {sk_n} skipped on main's head (main's head passed the merge queue); {night}")
    items.append({"id": 2, "name": "Board data age", "state": "page", "detail": "computed by the page from generated_at: amber at 45 min, red at 2 h",
                  "action": "refresh the board at the next check", "owner": "current Lead", "class": "measured"})
    old = ex.get("state_branch_oldest_unmerged_at")
    n_ahead = ex.get("state_branch_ahead")
    if not ex.get("state_branch") or n_ahead is None:
        item(3, "Records on main", "amber", "not measured: STATE's this branch: line or the git refs could not be read")
    elif n_ahead == 0 or not old:
        item(3, "Records on main", "green", f"{ex['state_branch']} has nothing main lacks")
    else:
        age = (cutoff - parse_iso(old)).total_seconds() / 3600
        item(3, "Records on main", "red" if age > 24 else "green",
             f"{n_ahead} commits on {ex['state_branch']} not on main; oldest {round(age, 1)} h" +
             ("" if ex.get("main_ref_is_head") else " (compared with the local origin/main, older than main's head)"),
             "open the records PR to main", "current Lead")
    gr = snap.j("github/guard_runs.json")
    if not gr:
        item(4, "Guards", "amber", "not measured: no guard runs read")
    else:
        bad_g = [g["name"] for g in gr if g.get("conclusion") not in ("success", None)]
        none_g = [g["name"] for g in gr if g.get("conclusion") is None]
        item(4, "Guards", "red" if bad_g else "amber" if none_g else "green",
             ("failed: " + ", ".join(bad_g)) if bad_g else ("not measured: " + ", ".join(none_g)) if none_g else "label guard and push guard last runs green",
             "restore the guard and re-run it", "current Lead")
    burn = (li or {}).get("burn_pct_per_h")
    li_age = (cutoff - parse_iso(li["as_of"])).total_seconds() / 3600 if li and li.get("as_of") else None
    if burn is None:
        item(5, "Burn", "amber", "not measured: Lead input has no burn_pct_per_h", cls="reported")
    elif li_age is not None and li_age > 2:
        item(5, "Burn", "amber", f"Lead-reported {burn}%/h is {round(li_age, 1)} h old (limit 2 h)", cls="reported")
    else:
        item(5, "Burn", "red" if burn > BURN_LIMIT else "green", f"Lead-reported {burn}% of the weekly plan per hour (limit {BURN_LIMIT})",
             "slow the lanes or stop paid work until burn is under 3%/h", "current Lead", cls="reported")
    caps = parse_caps(snap.text("files_main/qa/CAPABILITIES.md"))
    first = snap.j("git/bug_first_seen.json") or {}
    bugs = [b for b in parse_bugs(snap.file("qa/BUGS.md") or "") if b["open"] and b["sev"] in ("Critical", "Major")
            and any(caps.get(c, {}).get("status", "").startswith("Works") for c in b["caps"])]
    # R6: Majors a decision rules as not holding their capability (Lead-kept cockpit/health-exceptions.json) are shown, not counted
    exc_text = snap.file("cockpit/health-exceptions.json")
    try:
        exc = {(e.get("bug") or e.get("id")): e for e in (json.loads(exc_text) if exc_text else [])}
    except (json.JSONDecodeError, AttributeError):
        exc = {}
        ERRORS.append("cockpit/health-exceptions.json is not a JSON list (no exception applied)")
    excluded = [f"{b['id']} excluded by {exc[b['id']].get('decision') or 'no decision named'}" for b in bugs if b["id"] in exc]
    bugs = [b for b in bugs if b["id"] not in exc]
    old_b, unk = [], []
    for b in bugs:
        if b["id"] not in first:
            unk.append(b["id"])
        elif (cutoff - parse_iso(first[b["id"]])).total_seconds() / 3600 > BUG_AGE_H:
            old_b.append(b["id"])
    item(6, "Major bugs on Works capabilities", "red" if old_b else "amber" if unk else "green",
         ("older than 48 h: " + ", ".join(old_b)) if old_b else ("age not measured: " + ", ".join(unk)) if unk else
         f"{len(bugs)} open Critical/Major on Works capabilities, none older than 48 h", "fix or re-rate the bug; a Major keeps its capability Partial", "qa lane via the current Lead", cls="parsed")
    if excluded:
        items[-1]["detail"] += "; " + "; ".join(excluded)
        items[-1]["excluded"] = excluded
    tr, cap, org = comp["trust"], comp["capacity"], comp["org"]
    reasons, st7 = [], "green"
    bad_inv = [i["name"] for i in tr["invariants"] if not i["ok"]]
    if tr["state"] == "disagree" or bad_inv:
        st7 = "red"
        reasons += ([tr["banner"]] if tr["state"] == "disagree" else []) + ["invariant broken: " + x for x in bad_inv]
    if tr["state"] == "not checked":
        st7 = "amber" if st7 != "red" else st7
        reasons.append("Numbers not checked: " + re.sub(r"^not checked: ", "", tr.get("reason") or ""))
    if cap["age"]["amber_items"]:
        st7 = "amber" if st7 != "red" else st7
        reasons.append("work items past the age rule: " + ", ".join("#%d" % x for x in cap["age"]["amber_items"]))
    if org["mismatches"]:
        st7 = "amber" if st7 != "red" else st7
        reasons.append("org chart: " + ", ".join(f"{x['name']} ({x['seen']})" for x in org["mismatches"]))
    for f in comp["fresh"]:
        if f["age_h"] is None or f["age_h"] > f["limit_h"]:
            st7 = "amber" if st7 != "red" else st7
            reasons.append(f"{f['source']} " + ("missing" if f["age_h"] is None else f"{f['age_h']} h old (limit {f['limit_h']} h)"))
    item(7, "Data trust, work item age, org chart, freshness", st7, "; ".join(reasons) or "reconciliation agrees, invariants hold, nothing past its limit",
         "read the trust detail; fix the script, the record or the input it names", "current Lead", cls="measured")
    # board v57: each check's sample, for its tooltip (null = not measured, with the reason)
    nmap = {1: (len(mc) if mc is not None else None, "check runs on main's head (plus the newest nightly)"),
            2: (None, "computed by the page"),
            3: (n_ahead, "commits on STATE's this branch: that main lacks"),
            4: (len(gr) if gr else None, "guard runs read (label guard, push guard)"),
            5: (1 if burn is not None else None, "Lead-reported reading"),
            6: (len(bugs), "open Critical or Major bugs on Works capabilities (exceptions left out)"),
            7: (len(tr["invariants"]) + (tr.get("compared") or 0), "invariants and reconciled numbers checked")}
    for it in items:
        it["n"], it["n_of"] = nmap[it["id"]]
    states = [i["state"] for i in items if i["state"] != "page"]
    light = "red" if "red" in states else "amber" if "amber" in states else "green"
    return {"light": light, "items": items, "note": "The page combines this light with item 2 (data age)."}


COMPASS = "RULES.md › The compass (P-312)"


def build_explain(d):
    """Board v57 (founder 15 Nov 10:2x IST): one tooltip entry per number on the page: what it counts, its time window and
    sample (n), how to read it (direction, the compass band where one exists), source and class. Window and n are read
    from the data block itself; a missing n is null with n_reason, shown "not measured" (P-596). FORMULAS.md › Tooltips."""
    E = {}
    taken = (d.get("lineage") or {}).get("taken_at")
    t_ist = ist(parse_iso(taken)) if taken else "the snapshot time"
    now_w = f"now: the snapshot taken {t_ist}"
    up, down = "Higher is better.", "Lower is better."

    def val(x):
        return None if not isinstance(x, dict) else x.get("value", x.get("v"))

    def put(key, label, what, window, n, n_of, read, x=None, band=None, n_reason=None, src=None, cls=None):
        x = x if isinstance(x, dict) else {}
        n = n if isinstance(n, int) and not isinstance(n, bool) else None
        e = {"label": label, "what": what, "window": window, "n": n, "n_of": n_of, "read": read,
             "src": src or x.get("src") or "the data script (cockpit-data.py)", "class": cls or x.get("class") or "parsed",
             "sha": x.get("sha"), "as_of": x.get("as_of") or taken}
        if band:
            e["band"] = band
        if n is None:
            e["n_reason"] = n_reason or x.get("reason") or "not measured: the data holds no sample size for this number"
        E[key] = e

    sm, P, F, C = d["summary"], d["pace"], d["forecast"], d["capacity"]
    rows_n = val(P["rows_total"])
    # ---- the key-number strip
    ny = d["needs_you"]
    put("strip.needs_you", "Needs you", "Only what is needed from you: founder asks whose status asks for your word or act (an ask the Lead or a lane is working "
        "is not yours to do), F ids the For the founder line marks open, and ids the Waiting on the founder line names that are not "
        "counted already. Each says in one line what to decide or do, and by when if the record names a date. PR questions for the "
        "tech lead are on the Factory tab.", now_w + " (STATE.md at the records commit)",
        val(sm["needs_you"]), "items counted (" + str(len(ny.get("asks") or [])) + " asks, " + str(len((ny.get("for_founder") or {}).get("open_ids") or [])) +
        " F ids, " + str(len((ny.get("waiting_line") or {}).get("new_ids") or [])) + " Waiting ids)", "0 is the goal; each item waits on your word.", sm["needs_you"])
    put("strip.release1", "Release 1 built", "Release 1 capabilities (Build rows of MVP-CHECKLIST.md §A) whose every BACKLOG part has merged through an "
        "app-code PR; proven = qa's Works verdict for the row.", "all time, from 13 Nov to " + t_ist, rows_n, "Build rows in the checklist",
        up + f" Release 1 is done when all {rows_n} rows are built and proven.", P["built"])
    w = val(sm["works"]) or [None, None]
    put("strip.poc", "Proof of concept", "Proof-of-concept capabilities that read Works in qa/CAPABILITIES.md on main (milestones M2, T, M3, M4).",
        now_w + " (main's qa/CAPABILITIES.md)", w[1], "proof capabilities", up + " A separate number from Release 1, never mixed (P-592).", sm["works"])
    nd = val(sm["next_date"])
    dated = [x for x in d["plan"]["dates"] if x.get("date")]
    put("strip.next_date", "Next date", "The next dated row of the hand-kept plan (cockpit/plan.json); committed dates are the founder's, forecasts are estimates.",
        "dates from today on", len(dated), "dated plan rows", "Days left counts calendar days; a forecast is not a promise.", sm["next_date"])
    put("strip.health", "Health", "One light from seven checks: main CI, board data age, records on main, guards, burn, Major bugs on Works capabilities, "
        "data trust.", now_w + "; data age by your clock", 7, "checks", "Green: all pass. Amber: one is not measured or near its limit. Red: one fails "
        "(its action and owner show on tap).", src="health.items (seven checks) + the page's data age", cls="measured")
    R = d["resources"]
    put("strip.plan_use", "Plan use", "Share of the weekly Claude plan used, as the Lead typed it; burn = percent used per hour; paid US$ today.",
        "the current weekly plan (resets " + str(val(R["weekly_resets"]) or "not reported") + "); reading as of " + str(R["weekly_pct"].get("as_of") or "not reported"),
        1 if val(R["weekly_pct"]) is not None else None, "Lead-reported reading", "Lower burn is better; paid stays US$0 with live AI off.", R["weekly_pct"],
        band="burn 3% or less an hour (" + COMPASS + ", P-440)", n_reason="not measured: the Lead input has no weekly_pct")
    # ---- Plan and pace
    Y = P["changes_per_day"]
    last = datetime.fromisoformat(F["days"][-1]).strftime("%-d %b") if F.get("days") else "today"
    win = f"IST days from 13 Nov to {last}, at most the last 14 ({Y.get('window_days')} days)"
    put("pace.changes_per_day", "Changes doing a day", "Release 1 changes (BACKLOG ids the checklist cites) merged through app-code PRs, per IST day.",
        win, Y.get("merged_in_window"), "Release 1 changes merged in the window", up + " Compare with changes needed a day; needs 5 days of history.", Y)
    X = P["changes_needed_per_day"]
    put("pace.changes_needed_per_day", "Changes needed a day", "Changes left ÷ calendar days to the committed Release 1 date.",
        "today to the committed date (plan.json H1)", val(P["remaining"]), "changes left", "Lower is easier; pace must reach it.", X)
    put("pace.built", "Built", "Build rows that are shaped, have at least one part, no unshaped part, and every part merged (app-code PRs).",
        "all time to " + t_ist, rows_n, "Build rows read", up, P["built"])
    put("pace.rows_total", "Build rows", "Release 1 capabilities in MVP-CHECKLIST.md §A (the scope baseline, P-586).", now_w, rows_n, "Build rows read",
        "Should equal the baseline; a change is a scope change.", P["rows_total"])
    put("pace.proven", "Proven", "Build rows whose qa ids all read Works on main (first such commit).", "main commits of qa/CAPABILITIES.md, last 30 days",
        rows_n if val(P["proven"]) is not None else None, "Build rows read", up, P["proven"])
    bb = P["built"].get("built_before")
    if bb:
        put("pace.built_before", "Built before 13 Nov", "Build rows with no BACKLOG part that the checklist marks Merged or qa Works (built in the proof of "
            "concept; no date).", "before 13 Nov", rows_n, "Build rows read", "Shown apart, never counted in built.", bb)
    Rm = P["remaining"]
    put("pace.remaining", "Changes left", "Unmerged parts of shaped Build rows, plus 3 changes for each row not yet shaped (P-586 (4)).", now_w, rows_n,
        "Build rows read", down + " An estimate while rows are unshaped.", Rm)
    if P.get("ratio"):
        put("pace.ratio", "Changes per built capability", "Distinct parts of built rows ÷ built rows with dated parts.", "all time",
            val(P["built"]), "built rows", "Used to check the 3-per-row estimate.", P["ratio"])
    # board v61: the early estimate band and the three daily leading numbers (FORMULAS.md §1c)
    EB = P.get("early_band") or {}
    put("pace.early_band", "Early Release 1 estimate (low confidence)",
        "A date band for all Release 1 changes at the pace measured so far: low date at the best full IST day's merges, high date at "
        "the mean of the full IST days. Shown only until the measured forecast (5 days of history, 17 Nov).",
        EB.get("window") or "full IST days from 13 Nov", EB.get("n"), "full IST days measured",
        "Low confidence: 2 to 4 days of pace say little. Compare the band with the committed date (" + str(EB.get("committed") or "none") +
        "); a high date past it means the pace must rise.", EB)
    LD = P.get("leading") or {}
    lp, lc, lv = LD.get("parts_merged") or {}, LD.get("caps_all_parts") or {}, LD.get("first_verdict_works_pct") or {}
    put("pace.leading_parts", "Parts merged a day", "Release 1 changes (BACKLOG parts) whose first app-code merge fell on the last full IST day.",
        "IST day " + str(lp.get("day") or "none yet") + " (00:00 to 24:00); today so far: " + str(lp.get("today_so_far")), val(lp),
        "parts merged that day", up + " A leading number: parts merge before capabilities are built.", lp)
    put("pace.leading_caps", "Capabilities with all parts merged", "Build rows whose BACKLOG parts have all merged (built), cumulative.",
        "from 13 Nov to " + t_ist + "; new on " + str(lc.get("day") or "no full day yet") + ": " + str(lc.get("new_on_day")),
        lc.get("rows_total"), "Build rows checked", up + " Proven comes later, at qa's Works verdict.", lc)
    put("pace.leading_fv", "Works at the first qa verdict", "Share of qa capabilities whose first verdict on main was Works (not Partial or Broken).",
        "first verdicts from 13 Nov to " + t_ist + " (qa/CAPABILITIES.md history on main, last 30 days)", lv.get("n"),
        "capabilities with a first verdict", up + " A low share means rework before Works (P-606).", lv)
    lt = P.get("light") or {}
    put("pace.light", "Pace light", "Grey: no committed date or tolerance; amber: no forecast yet; green: the 85% date is within the committed date plus the "
        "tolerance; red: later.", now_w, None, "a rule, not a count", "Green is on track. Now: " + str(lt.get("why")),
        src="FORMULAS.md §1 Pace light", n_reason="not a count: a rule on the dates", cls="parsed")
    for k, lbl in (("p50", "50% date"), ("p85", "85% date")):
        put("forecast." + k, lbl, f"Monte Carlo forecast ({F['runs']} runs, seed {F['seed']}): the day by which {lbl[:3]} of runs finish the changes left, drawing a "
            "day's throughput from the window's daily counts.", win, len(F.get("counts") or []) or None, "days of Release 1 history sampled",
            "Earlier is better; the 85% date is the one to plan on.", F[k])
    X24 = P["delivery_24h"]
    sp = X24.get("span") or {}
    sw = f"{sp.get('from')} to {sp.get('to')} ({sp.get('hours')} h of the 24 h to {t_ist})"
    U = X24["plan_pct_used"]
    put("pace.plan_pct_used", "Weekly plan used, 24 h", "Sum of rises between readings in a row from the same account in cockpit/usage-log.tsv; a reset or "
        "account change adds nothing (then 'at least').", sw, len(U.get("readings") or []) or None, "readings in the window", down, U,
        n_reason=U.get("reason") or "not measured: no readings in the window")
    put("pace.changes_merged_span", "Release 1 changes merged", "Release 1 changes whose first app-code merge falls in the span.", sw,
        val(X24["changes_merged"]), "changes merged in the span", up, X24["changes_merged"])
    put("pace.works_rows_span", "Rows that reached qa Works", "Build rows at qa Works at the span's end and not at its start.", sw, rows_n,
        "Build rows read", up, X24["works_rows"])
    put("pace.pct_per_change", "Plan % per change", "Weekly plan % used ÷ Release 1 changes merged, over the same hours.", sw,
        val(X24["changes_merged"]) or None, "changes merged in the span", down + " Needs readings covering 20 h or more.", X24["pct_per_change"])
    put("pace.pct_per_works_row", "Plan % per row", "Weekly plan % used ÷ rows that reached qa Works, over the same hours.", sw,
        val(X24["works_rows"]) or None, "rows that reached qa Works", down, X24["pct_per_works_row"])
    put("pace.rows_done_per_day", "Rows done a day", "Build rows at qa Works now and not 24 h ago.", f"the 24 h to {t_ist}", rows_n, "Build rows read",
        up, X24["rows_done_per_day"], band="10 or more capabilities confirmed a day (" + COMPASS + ")")
    put("pace.rows_needed_per_day", "Rows needed a day", "Build rows not at qa Works ÷ calendar days to the committed date.", "today to the committed date",
        X24["rows_needed_per_day"].get("rows_left"), "rows not yet at qa Works", "Lower is easier; rows done a day must reach it.", X24["rows_needed_per_day"])
    # ---- Capacity
    ct = C["constraint"]
    put("capacity.constraint", "Constraint", "The stage holding work back: the stage whose oldest wait is furthest over its limit (review 2 h, merge 1 h, "
        "qa 24 h), or Building when rows are ready and no wait is over its limit.", now_w, None, "a rule over the stages below",
        "More lanes help only when the constraint is Building. Now: " + str(ct.get("line")), src="FORMULAS.md §2 Constraint line",
        n_reason="not a count: a rule over the waiting stages", cls="parsed")
    A = C["age"]
    cyc_w = "app PRs merged in the 14 days to " + t_ist
    put("capacity.cycle_median_days", "A change usually takes", "Median days from PR opened to merged.", cyc_w, C["cycle_median_days"].get("n"),
        "app PRs merged (cycle times)", down + " Needs 5 merges.", C["cycle_median_days"])
    put("capacity.p85_days", "Usual limit", "85th percentile (nearest rank) of the same cycle times.", cyc_w, A["p85_days"].get("n"),
        "app PRs merged (cycle times)", "An open change older than this is 'older than usual'.", A["p85_days"])
    put("capacity.older", "Open changes older than usual", "Open app PRs (drafts included) older than the usual limit.", now_w, A["older"].get("n"),
        "open app PRs", down + " Far older (2 × the limit) or no push for a day turns Capacity amber.", A["older"])
    put("capacity.lanes_working", "Lanes working", "Branches with a push (head commit) in the last 90 min, not main, the queue or the Leads' records branches.",
        "the 90 min to " + t_ist, C["lanes_working"].get("n"), "lane branches with a push in 24 h", "Compare with free lane slots and rows ready.", C["lanes_working"])
    put("capacity.ready_rows", "Rows ready with a brief", "BACKLOG rows with a brief, not merged, no open PR, every dependency merged.", now_w,
        C["ready_rows"].get("n"), "rows with a brief", "Rows ready with nobody on them mean a lane could start.", C["ready_rows"])
    put("capacity.room", "Free lane slots", "The Lead's lane limit (max_lanes) minus lanes working.", now_w + "; max_lanes as the Lead reported it",
        1 if val(C["room"]) is not None else None, "Lead-reported limit", "Above 0 with rows ready: add a lane.", C["room"],
        n_reason="not measured: the Lead input has no max_lanes")
    put("capacity.wip", "Open app changes", "Open PRs that change app code (not records).", now_w, val(C["wip"]), "open app PRs",
        "Fewer at once finish sooner.", C["wip"], band="no more than builders (" + COMPASS + ": capabilities in progress)")
    put("capacity.baton_held", "Rows held by another row's files", "Rows that cannot start because another row holds the same files.", now_w, None,
        "rows", down, C["baton_held"])
    for k, lbl, rule in (("review", "Waiting for review", "open, non-draft PRs with CI green and no `review: approved`"),
                         ("merge", "Waiting to merge", "open PRs labelled `review: approved`"),
                         ("qa", "Waiting for qa", "built Build rows not yet proven")):
        stg = C["stages"][k]
        put(f"capacity.{k}.count", lbl, rule.capitalize() + ".", now_w, val(stg["count"]), "items in the stage", down, stg["count"])
        put(f"capacity.{k}.wait_h", lbl + ": longest", "The oldest item's wait: " + stg["wait_h"].get("src", "") + ".", now_w, val(stg["count"]),
            "items waiting", down, stg["wait_h"], band=f"limit {stg['limit_h']:g} h (FORMULAS.md §2)")
    put("capacity.parked", "Parked", "Open non-records PRs with no push for 7 days; kept out of the waiting stages (R8).", now_w, len(C.get("parked") or []),
        "PRs parked", "Should be closed or picked up.", src="open_prs_detail.json head commit times", cls="measured")
    idle = C.get("idle") or []
    put("capacity.idle", "No push in 90 min", "Open non-records PRs whose head commit is over 90 min old (parked PRs listed apart), with hours since.",
        now_w, val(C["wip"]), "open app PRs", "A lane with no push for 90 min is behind; its Lead acts.",
        src="open_prs_detail.json head commit times", cls="measured")
    bp = d["building"].get("prs") or []
    put("building.station", "PRs by station", "Open PRs at each factory-board station (tools/factory-board.sh's rules).", now_w + " (up to 60 open PRs, newest updated first)",
        len(bp) or None, "open PRs read", "A pile at one station shows where work waits.", src=d["building"].get("src"), cls="measured",
        n_reason="not measured: the open pull requests were not read at this refresh")
    put("building.push", "Last push", "Hours since the PR's last push.", now_w, len(bp) or None, "open PRs read",
        "Over 90 min on a working lane: the lane is behind; over 7 days: stale.", src=d["building"].get("src"), cls="measured",
        n_reason="not measured: the open pull requests were not read at this refresh")
    # ---- Health (the panel under the strip)
    windows = {1: now_w + " (main's head)", 2: "now, by your clock", 3: now_w, 4: "the newest guard runs on main", 5: "the Lead's latest reading",
               6: "bugs open now; age from the first main commit naming them", 7: now_w}
    reads = {1: "Red when a check on main's head or the newest nightly failed.", 2: "Amber at 45 min, red at 2 h.",
             3: "Red when the oldest records commit not on main is over 24 h old.", 4: "Red when a guard's newest run failed.",
             5: "Red above the limit.", 6: "Red when such a bug is over 48 h old.", 7: "Red when numbers disagree or an invariant breaks."}
    bands = {5: "3% or less an hour (" + COMPASS + ", P-440)", 6: "about 0 (" + COMPASS + ": Major or Critical after merge)", 2: "under 45 min"}
    for it in d["health"]["items"]:
        put(f"health.{it['id']}", it["name"], it["name"] + ": " + (it.get("detail") or ""), windows[it["id"]], it.get("n"), it.get("n_of") or "",
            reads[it["id"]], band=bands.get(it["id"]), src="FORMULAS.md §5 item " + str(it["id"]), cls=it.get("class") or "measured",
            n_reason="computed by the page from generated_at" if it["id"] == 2 else None)
    # ---- Factory
    lq = d["lead_queue"]
    put("factory.lead_queue", "Questions waiting on the tech lead", "Open PRs whose newest 'Question for the tech lead' has no later answer.",
        "open PRs read at the refresh", val(lq["count"]), "PRs with an open question", down, lq["count"])
    for st in d["value_stream"]["stages"]:
        put(f"vsm.{st['id']}.count", st["name"], "Items in this factory stage now: " + st["count"]["src"] + ".", now_w, val(st["count"]), "items in the stage",
            "Counts move left to right; a pile-up shows where work waits.", st["count"])
        put(f"vsm.{st['id']}.wait_h", st["name"] + ": median wait", st["wait_h"]["src"] + ".", now_w if st["id"] not in ("ci",) else "the last 2 days",
            st["wait_h"].get("n"), "items timed", down + " The stage with the longest median is marked.", st["wait_h"])
    team = d["team"]
    for k, lbl, what in (("cloud_running", "Cloud lanes pushing", "Lead-reported cloud sessions whose PR had a push, or idle under 90 min, while running."),
                         ("cloud_idle", "Cloud lanes quiet or blocked", "Lead-reported cloud sessions not pushing."),
                         ("mac", "Mac sessions", "Lead-reported sessions on the Mac: Leads, standbys, local lanes.")):
        put(f"team.{k}", lbl, what, "the Lead input as of " + str(team["counts"].get("as_of")), len(team.get("sessions") or []) or None,
            "sessions in the Lead input", "Quiet lanes for long are a nudge for their Lead.", team["counts"],
            n_reason="not measured: no Lead input sessions")
    Q = d["quality"]
    sc = val(Q["sev_counts"]) or {}
    nopen = sum(sc.values()) if sc else None
    for k, read, band in (("Critical", down, None), ("Major", down + " A Major keeps a capability Partial.", "about 0 Major or Critical found after merge (" + COMPASS + "); this count is every open one"),
                          ("Minor", down, None)):
        put(f"quality.{k.lower()}", "Open " + k, f"Open {k} rows in qa/BUGS.md.", now_w + " (BUGS.md at the records commit)", nopen, "open bugs",
            read, Q["sev_counts"], band=band)
    put("quality.closed", "Closed after retest", "Rows in qa/BUGS-CLOSED.md; the small line counts those closed in the last 7 days.",
        "all rows kept; the last 7 days for the small line", val(Q["closed_total"]), "closed rows", up, Q["closed_total"])
    dem = d["improving"]["series"].get("works") or []
    put("quality.demotions", "Works demotions", "Days when Works on main fell from one day's end to the next.", "the 14 IST days to " + t_ist,
        sum(1 for x in dem if x is not None) or None, "days with a Works reading", down, Q["demotions"],
        band="at most 1 a day (" + COMPASS + ")", n_reason="not measured: Works history not read (offline or failed)")
    fl = val(Q["flaky"]) or {}
    put("quality.flaky", "Flaky ledger", "Lines of tools/flaky-ledger.tsv: release or hand lines (big) and rule lines.", now_w,
        (fl.get("rule_lines") or 0) + (fl.get("release_or_hand_lines") or 0) if fl else None, "ledger lines", down, Q["flaky"])
    put("quality.review_rounds", "Review rounds", "Reviewer rounds per PR.", "not read", None, "PRs", down, Q["review_rounds"])
    pl = d["pipeline"]
    w7 = "the 7 days to " + t_ist
    put("pipeline.deploy_freq", pl["deploy_freq"]["label"], "PRs merged to main ÷ 7; the small line counts app-code PRs only (P-500).", w7,
        pl["deploy_freq"].get("n"), "PRs merged", up, pl["deploy_freq"])
    put("pipeline.lead_time_h", pl["lead_time_h"]["label"], "Median hours from PR opened to merged.", w7, pl["lead_time_h"].get("n"), "PRs merged", down,
        pl["lead_time_h"])
    put("pipeline.change_fail", pl["change_fail"]["label"], "Share of finished nightly runs on main that failed (a proxy for change failure).", w7,
        pl["change_fail"].get("n"), "finished nightly runs", down + " The small line's batch failures have their band under Merge-queue batches.",
        pl["change_fail"])
    put("pipeline.restore_h", pl["restore_h"]["label"], "Median hours from a failed nightly on main to the next green one.", "the last 60 nightly runs",
        pl["restore_h"].get("n"), "red-to-green recoveries", down, pl["restore_h"])
    qw = pl["queue_wait_min"]
    put("pipeline.queue_wait_min", "Approved to merged", "Median minutes from `review: approved` to merged (tools/flow-measure.py).", "flow-measure's runs read",
        qw.get("n"), "PRs approved and merged", down, qw)
    bt = val(pl["batches"]) or [None]
    put("pipeline.batches", "Merge-queue batches", "Merge-queue runs, failed and cancelled (tools/flow-measure.py).", "flow-measure's runs read",
        bt[0], "merge-queue runs", "Fewer failed is better.", pl["batches"], band="15% or less thrown away (" + COMPASS + ")")
    put("pipeline.ci_min_per_day", "CI minutes a day", "ci.yml run wall time per IST day (approx), averaged.", "the last 7 full IST days",
        pl["ci_min_per_day"].get("n"), "days with runs read", down, pl["ci_min_per_day"])
    put("pipeline.thrown_share", "CI time thrown away", "Share of CI time on runs later cancelled or superseded (tools/flow-measure.py).",
        "flow-measure's runs read", pl["thrown_share"].get("n"), "runs read", down, pl["thrown_share"], band="under 20% (P-371)")
    put("pipeline.merges_per_day", "Merges per day", "PRs merged per IST day; green = app-code merges (P-500).", "the 14 IST days to " + t_ist,
        len((val(d["merges_per_day"]) or {}).get("days") or []) or None, "days", up, d["merges_per_day"])
    H = d["healing"]
    nses = len(d["team"].get("sessions") or []) or None
    put("healing.restarts", "Lanes restarted", "Sum of restarts the Lead reported per session.", "the Lead input as of " + str(H["restarts"].get("as_of")),
        nses, "sessions reported", down, H["restarts"], n_reason="not measured: no Lead input sessions")
    put("healing.nudges", "Lanes nudged", "Sum of nudges the Lead reported per session.", "the Lead input as of " + str(H["nudges"].get("as_of")),
        nses, "sessions reported", down, H["nudges"], n_reason="not measured: no Lead input sessions")
    put("healing.healed_prs", "PRs healed after red CI", "PR branches whose ci.yml run went red, then green; small line: median hours red to green.", w7,
        H["healed_prs"].get("n"), "PR branches with finished runs", up + " Healing on their own is the goal.", H["healed_prs"],
        n_reason="not measured: CI runs not read (offline or failed)" if not H["healed_prs"].get("n") else None)
    put("healing.blocked", "Blocked lanes", "Lead-reported sessions in state blocked, or whose PR waits on a question.", now_w, nses, "sessions reported",
        down, H["blocked"], n_reason="not measured: no Lead input sessions")
    put("healing.ci_red", "PRs red now", "Open PRs at station CI red.", now_w, len(d["building"].get("prs") or []) or None, "open PRs read", down,
        H["ci_red_prs"], n_reason="not measured: the open pull requests were not read at this refresh")
    put("healing.questions", "Open questions", "Open PRs with an unanswered Question for the tech lead.", now_w, len(d["building"].get("prs") or []) or None,
        "open PRs read", down, H["questions"], n_reason="not measured: the open pull requests were not read at this refresh")
    for k, tr in d["improving"]["trends"].items():
        better = {"app_merges": up, "works": up, "lead_h": down, "batch_fail": down}.get(k, "")
        put(f"improving.{k}", tr["label"], tr["label"] + ": the latest day's value; the small line compares the 7-day averages.",
            "the 14 IST days to " + t_ist + f" (this week {tr.get('n_this')} days with data, the week before {tr.get('n_before')})",
            (tr.get("n_this") or 0) + (tr.get("n_before") or 0) or None, "days with data", better + " The arrow is green when it moves the good way.",
            src=tr.get("src"), cls="measured", n_reason="not measured: no days with data")
    for k, lbl, what, band in (("disk_free_gb", "Disk free", "Free space on the repository's volume (df).", "floor 10 GB"),
                               ("weekly_pct", "Weekly plan used", "Share of the weekly plan used, Lead-reported.", None),
                               ("burn_pct_per_h", "Burn", "Percent of the weekly plan used per hour, Lead-reported.", "3% or less an hour (" + COMPASS + ", P-440)"),
                               ("paid_usd_today", "Paid today", "Paid US$ today, Lead-reported.", "US$0 with live AI off"),
                               ("api_left", "GitHub API left", "GitHub API calls left this hour after the run.", None)):
        x = R[k]
        put(f"resources.{k}", lbl, what, now_w if k in ("disk_free_gb", "api_left") else "the Lead input as of " + str(x.get("as_of")),
            1 if val(x) is not None else None, "reading", "", x, band=band)
    # ---- Team (org by component)
    oc = (d.get("org") or {}).get("components") or {}
    put("team.lane.push", "Last push", "The lane branch's head commit time (GitHub keeps no push time; the commit time stands in).",
        "branches with a head commit under 24 h old at " + t_ist, None, "", "Over 90 min without a push: the lane is behind; its Lead acts.",
        src="branches_recent.json", cls="measured", n_reason="one lane's own time, not a sample")
    put("team.lane.idle", "Idle", "Minutes since the session last acted, as the Lead reported it.", "the Lead input", None, "",
        "Over 90 min: the lane is behind; its Lead acts.", src="Lead input sessions[].idle_min", cls="reported", n_reason="one lane's own time, not a sample")
    for c in oc.get("items") or []:
        put(f"team.{c['id']}.lanes", c["name"] + ": lanes", "Lanes working in this component (Lead input sessions and GitHub branches), and how many fall "
            "behind (blocked, or no push or idle for 90 min).", now_w + "; Lead input as of " + str(d["top3"].get("as_of")), len(c["lanes"]), "lanes",
            "0 behind is the goal; behind lanes go to " + str((c.get("owner") or {}).get("name") or "the owner") + ".", src=oc.get("src"), cls="reported")
    return E


def lineage_fill(o, L):
    """Legacy blocks (v/src): add sha, as_of and class by their source words, and a reason to every null (§0.3, §6.2)."""
    if isinstance(o, dict):
        if "v" in o and "src" in o:
            s = o["src"] or ""
            cls = ("reported" if "Lead input" in s else "measured" if " on main" in s or "GitHub" in s or "git " in s
                   else "parsed" if re.search(r"\.md|\.json|\.tsv|STATE|BACKLOG|DECISIONS", s) else "measured")
            o.setdefault("class", cls)
            o.setdefault("sha", L[cls][0] or "none")
            o.setdefault("as_of", L[cls][1])
            if o["v"] is None:
                o.setdefault("reason", s or "not measured")
        for v in list(o.values()):
            lineage_fill(v, L)
    elif isinstance(o, list):
        for v in o:
            lineage_fill(v, L)


def validate(data, schema_path):
    import jsonschema
    schema = json.load(open(schema_path, encoding="utf-8"))
    v = jsonschema.Draft202012Validator(schema)
    return [f"{'/'.join(map(str, e.absolute_path)) or '(root)'}: {e.message[:200]}" for e in v.iter_errors(data)][:20]


def read_history(text):
    out = []
    for line in (text or "").splitlines():
        if line.strip():
            try:
                out.append(json.loads(line))
            except json.JSONDecodeError:
                ERRORS.append("history.jsonl: a line is not JSON (kept out)")
    return out


def write_history(path, hist, line):
    """One line per IST day (N1): today's line replaces earlier lines of today; the working copy's other days are kept."""
    cur = read_history(slurp(path)) if os.path.exists(path) else []
    days = {h["day"]: h for h in hist}
    days.update({h["day"]: h for h in cur})
    days[line["day"]] = line
    with open(path + ".tmp", "w", encoding="utf-8") as f:
        for d in sorted(days):
            f.write(json.dumps(days[d], ensure_ascii=False, sort_keys=True) + "\n")
    os.replace(path + ".tmp", path)


# ---------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--lead-input")
    ap.add_argument("--flow-max-age-h", type=float, default=6)
    ap.add_argument("--appcode-max", type=int, default=900)
    ap.add_argument("--offline", action="store_true")
    ap.add_argument("--snapshot-only", action="store_true", help="take the snapshot (spec §6 1a) into <out folder>/snapshot/ and stop")
    ap.add_argument("--from-snapshot", help="compute from this snapshot folder instead of taking one (fixtures, audits)")
    ap.add_argument("--now", help="ISO time to compute at (tests); default: the snapshot's taken_at when --from-snapshot, else the clock")
    ap.add_argument("--history-file", default=os.path.join(P, "cockpit", "history.jsonl"))
    ap.add_argument("--no-history-write", action="store_true")
    ap.add_argument("--reconcile", help="path of the reconciliation script (default tools/cockpit-reconcile.py)")
    a = ap.parse_args()
    global NOW
    out_dir = os.path.dirname(os.path.abspath(a.out))
    cache = os.path.join(out_dir, "cache")
    os.makedirs(cache, exist_ok=True)
    gh = GH(a.offline)
    # ---- §6 1a: the frozen snapshot first; every §1-§5 and §7 number is computed from it only
    if a.from_snapshot:
        snap_dir = os.path.abspath(a.from_snapshot)
    else:
        snap_dir = os.path.join(out_dir, "snapshot")
        if gh.offline:
            print("cockpit-data: offline and no --from-snapshot: cannot take a snapshot", file=sys.stderr)
            sys.exit(3)
        try:
            take_snapshot(snap_dir, gh, cache, a.lead_input, a.appcode_max)
        except Exception as e:
            print(f"cockpit-data: snapshot failed: {e}", file=sys.stderr)
            sys.exit(3)
        if a.snapshot_only:
            print(f"cockpit-data: snapshot written to {snap_dir} ({gh.calls} API calls, {round(time.time() - T0, 1)} s)")
            return
    snap = Snap(snap_dir)
    if not snap.meta:
        print(f"cockpit-data: {snap_dir} has no meta.json", file=sys.stderr)
        sys.exit(3)
    NOW = parse_iso(a.now).astimezone(timezone.utc) if a.now else (parse_iso(snap.meta["taken_at"]).astimezone(timezone.utc) if a.from_snapshot else NOW)
    if a.lead_input is None and snap.text("lead-input.json") is not None:
        a.lead_input = snap.path("lead-input.json")
    history = read_history(snap.file("cockpit/history.jsonl"))
    rec_out, rec_note = run_reconcile(snap_dir, a.reconcile)
    comp = compute_board(snap, NOW, history, rec_out, rec_note)
    li_snap = snap.j("lead-input.json")
    hl = health(snap, NOW, comp, li_snap)
    branch = sh(["git", "-C", ROOT, "rev-parse", "--abbrev-ref", "HEAD"]).stdout.strip()
    here_sha = sh(["git", "-C", ROOT, "rev-parse", "--short=9", "HEAD"]).stdout.strip()
    copy = f"this copy ({branch} {here_sha})"

    rate0 = safe("rate limit", lambda: gh.get("https://api.github.com/rate_limit")["resources"]["core"], {})
    remaining = rate0.get("remaining", 0)

    # ---- main's head and the qa files on main
    main_sha = (snap.meta.get("main_sha") or "")[:9] or None
    main_c = safe("main head", lambda: gh.get(f"/commits/{snap.meta['main_sha']}")) if not gh.offline else None
    main_at = ts(main_c["commit"]["committer"]["date"]) if main_c else None

    def main_file(rel):
        return gh.get(f"/contents/{REL}/{rel}?ref=main", raw=True)
    cap_text = snap.text("files_main/qa/CAPABILITIES.md")
    cap_src = f"qa/CAPABILITIES.md on main {main_sha} (snapshot) via tools/progress.sh's parse, plus M4 (progress.sh omits it)"
    if cap_text is None:
        cap_text, cap_src = read("qa/CAPABILITIES.md") or "", f"qa/CAPABILITIES.md in {copy} via tools/progress.sh's parse (main not read)"
    built_names = safe("qa/built on main", lambda: [x["name"] for x in gh.get(f"/contents/{REL}/qa/built?ref=main")], None)
    if built_names is None and os.path.isdir(os.path.join(P, "qa/built")):
        built_names = os.listdir(os.path.join(P, "qa/built"))
    prog = run_progress(cap_text, built_names)
    caps = cap_rows(cap_text, built_names)
    m4 = [c for c in caps if c["m"] == "M4"]
    if m4:   # known fix (spec §6 10): progress.sh counts M2, T and M3 only; M4 joins here so Works reads 93/98, not 93/97
        prog.append({"milestone": "M4", "works": sum(1 for c in m4 if c["status"] == "Works"), "total": len(m4),
                     "other": {}})
    works = sum(x["works"] for x in prog)
    works_total = sum(x["total"] for x in prog)
    if works_total and works_total != len(caps):
        ERRORS.append(f"capability grid has {len(caps)} rows but progress.sh + M4 counts {works_total}")
    bugs_text = safe("qa/BUGS.md on main", lambda: main_file("qa/BUGS.md"))
    bugs_src = f"qa/BUGS.md on main {main_sha}"
    if bugs_text is None:
        bugs_text, bugs_src = read("qa/BUGS.md") or "", f"qa/BUGS.md in {copy}"
    closed_text = safe("qa/BUGS-CLOSED.md on main", lambda: main_file("qa/BUGS-CLOSED.md")) or read("qa/BUGS-CLOSED.md") or ""

    # ---- open PRs (factory-board.sh's query shape and station rules)
    q = """query($o:String!,$r:String!){repository(owner:$o,name:$r){pullRequests(states:OPEN,first:60,orderBy:{field:UPDATED_AT,direction:DESC}){nodes{
      number title isDraft createdAt body headRefName headRefOid labels(first:20){nodes{name}}
      commits(last:1){nodes{commit{committedDate statusCheckRollup{state contexts(first:100){nodes{__typename ... on CheckRun{status conclusion} ... on StatusContext{state}}}}}}}
      comments(last:50){nodes{body createdAt}}}}}}"""
    o, r = (gh.repo or "/").split("/")
    prs_raw = safe("open PRs", lambda: gh.graphql(q, {"o": o, "r": r})["repository"]["pullRequests"]["nodes"], None) if not gh.offline else None
    prs_ok = prs_raw is not None     # review Minor 5: PR questions are read live; offline they are "not measured", never 0
    prs_raw = prs_raw or []
    prs, questions = [], []
    for p in prs_raw:
        labels = [x["name"] for x in p["labels"]["nodes"]]
        cm = (p["commits"]["nodes"] or [{}])[0].get("commit", {})
        roll = cm.get("statusCheckRollup") or {}
        ctx = (roll.get("contexts") or {}).get("nodes", [])
        red = sum(1 for c in ctx if c.get("conclusion") == "FAILURE" or c.get("state") in ("FAILURE", "ERROR"))
        running = sum(1 for c in ctx if c.get("status") in ("IN_PROGRESS", "QUEUED"))
        qs = [c for c in p["comments"]["nodes"] if "Question for the tech lead" in c["body"]]
        ans = [c for c in p["comments"]["nodes"] if re.search(r"^## Tech lead|^\*\*Tech lead|Tech lead.s (ruling|answer)|^\*\*Lead (B \([0-9]+\)|[0-9]+\b)", c["body"], re.M)]
        qopen = bool(qs) and (not ans or qs[-1]["createdAt"] > ans[-1]["createdAt"])
        design = bool(re.search(r"Design only|Design stage|Concept stage|concept for the tech lead", p.get("body") or ""))
        approved = "review: approved" in labels
        reviewer_ok = any(re.search(r"Reviewer: Approve " + p["headRefOid"][:7], c["body"]) for c in p["comments"]["nodes"])
        if approved:
            st = "Merge queue"
        elif qopen:
            st = "Question to Lead"
        elif design:
            st = "Concept"
        elif p["isDraft"]:
            st = "Building"
        elif running:
            st = "CI running"
        elif red:
            st = "CI red"
        else:
            st = "Ready for label"
        pushed = ts(cm.get("committedDate"))
        area = p["title"].split(":")[0].strip() if ":" in p["title"][:24] else "-"
        prs.append({"n": p["number"], "title": clean(p["title"], 80), "area": area, "draft": p["isDraft"], "labels": labels,
                    "sha": p["headRefOid"][:9], "push_age_h": hours(pushed, NOW) if pushed else None,
                    "open_h": hours(ts(p["createdAt"]), NOW), "ci": (roll.get("state") or "NONE").lower(), "red": red,
                    "running": running, "station": st, "reviewer_approve_on_head": reviewer_ok,
                    "records": bool(re.match(r"^(lead|qa):", p["title"]))})
        if qopen:
            questions.append({"n": p["number"], "title": clean(p["title"], 70), "age_h": hours(ts(qs[-1]["createdAt"]), NOW),
                              "src": f"PR #{p['number']} comment 'Question for the tech lead' with no later tech-lead answer (factory-board.sh rule)"})
    prs_src = "GitHub GraphQL: open PRs (up to 60, newest updated first); stations by tools/factory-board.sh's rules"

    # ---- merged PRs, last 14 days
    since14 = NOW - timedelta(days=14)

    def merged_list():
        out, page = [], 1
        while page < 30:
            d = gh.get(f"/pulls?state=closed&sort=updated&direction=desc&per_page=100&page={page}")
            for x in d:
                m = ts(x.get("merged_at"))
                if m and m >= since14 and not x["head"]["ref"].startswith("mergify/"):
                    out.append({"n": x["number"], "title": x["title"], "created": x["created_at"], "merged": x["merged_at"]})
            if len(d) < 100 or ts(d[-1]["updated_at"]) < since14:
                return out
            page += 1
        return out
    merged = safe("merged PRs", merged_list, [])

    # ---- app-code verdicts through tools/app-code-prs.sh (cached per PR)
    ac_path = os.path.join(cache, "appcode.json")
    ac = json.load(open(ac_path)) if os.path.exists(ac_path) else {}
    todo = [m["n"] for m in merged if str(m["n"]) not in ac]
    budget = max(0, min(a.appcode_max, remaining - 1200)) if not gh.offline else 0
    todo = todo[:budget]
    if todo:
        chunks = [todo[i::8] for i in range(8) if todo[i::8]]

        def run_chunk(ns):
            r = subprocess.run(["bash", os.path.join(HERE, "app-code-prs.sh")], input="\n".join(map(str, ns)) + "\n",
                               capture_output=True, text=True, timeout=900)
            got = {}
            unknown = set()
            for line in r.stdout.splitlines():
                if line.startswith("?"):
                    unknown.add(int(re.findall(r"\d+", line)[0]))
                elif re.match(r"^\d+", line):
                    got[int(re.findall(r"\d+", line)[0])] = True
            return {n: got.get(n, False) for n in ns if n not in unknown}
        with ThreadPoolExecutor(8) as ex:
            for res in ex.map(run_chunk, chunks):
                ac.update({str(k): v for k, v in res.items()})
        gh.calls += len(todo)
        json.dump(ac, open(ac_path, "w"))
    unclassified = sum(1 for m in merged if str(m["n"]) not in ac)

    # ---- CI runs per IST day (14 days; finished days cached)
    def runs_day(day):
        f = os.path.join(cache, f"runs-{day.isoformat()}.json")
        start = datetime(day.year, day.month, day.day, tzinfo=IST).astimezone(timezone.utc)
        end = start + timedelta(days=1)
        if os.path.exists(f) and end < NOW - timedelta(hours=2):
            return json.load(open(f))
        rng = f"{start.strftime('%Y-%m-%dT%H:%M:%SZ')}..{end.strftime('%Y-%m-%dT%H:%M:%SZ')}"
        out, page = [], 1
        while page <= 10:
            d = gh.get(f"/actions/workflows/ci.yml/runs?per_page=100&page={page}&created={rng}")
            for x in d.get("workflow_runs", []):
                out.append({k: x.get(k) for k in ("head_branch", "event", "status", "conclusion", "created_at", "run_started_at", "updated_at")}
                           | {"actor": (x.get("actor") or {}).get("login", "")})
            if len(d.get("workflow_runs", [])) < 100:
                break
            page += 1
        if end < NOW - timedelta(hours=2):
            json.dump(out, open(f, "w"))
        return out
    today = NOW.astimezone(IST).date()
    days = [today - timedelta(days=i) for i in range(13, -1, -1)]
    runs_by_day = {}
    if not gh.offline:
        with ThreadPoolExecutor(6) as ex:
            for d, rs in zip(days, ex.map(lambda d: safe(f"runs {d}", lambda: runs_day(d), None), days)):
                runs_by_day[d] = rs

    def is_queue(x):
        return (x["head_branch"] or "").startswith("mergify/")

    # ---- nightly on main (main line red share and red to green)
    nightly = safe("nightly runs", lambda: gh.get("/actions/workflows/nightly.yml/runs?branch=main&per_page=60")["workflow_runs"], [])

    # ---- flow-measure.py (cached)
    fm_path = os.path.join(cache, "flow-measure.json")
    fm = json.load(open(fm_path)) if os.path.exists(fm_path) else None
    fm_age = hours(ts(fm["_as_of"]), NOW) if fm else None
    if not gh.offline and (fm is None or fm_age > a.flow_max_age_h):
        if remaining >= 3500:
            since7 = (NOW - timedelta(days=7)).strftime("%Y-%m-%dT%H:%M:%SZ")
            env = dict(os.environ, FLOW_TOKEN=gh.token)
            r = subprocess.run(["python3", "-I", os.path.join(HERE, "flow-measure.py"), "--since", since7, "--json"],
                               capture_output=True, text=True, env=env, cwd=ROOT, timeout=1500)
            if r.returncode == 0:
                fm = json.loads(r.stdout)
                fm["_as_of"] = NOW.strftime("%Y-%m-%dT%H:%M:%SZ")
                json.dump(fm, open(fm_path, "w"))
                fm_age = 0.0
            else:
                ERRORS.append(f"flow-measure.py exit {r.returncode}: {r.stderr[-200:]}")
        else:
            ERRORS.append(f"flow-measure.py skipped: {remaining} API calls left this hour (needs ~3,500); last answer kept")
    fm_src = (f"tools/flow-measure.py --json, 7 days, run {ist(ts(fm['_as_of']))}" if fm else "tools/flow-measure.py not run yet")
    if fm and (fm.get("runs_read") or 0) >= 1000:
        fm_src += " (its run figures cover only the newest 1,000 runs: the runs API cap; PR figures cover all 7 days)"

    # ---- lead input
    li, li_src = None, "Lead input missing"
    if a.lead_input and os.path.exists(a.lead_input):
        li = json.load(open(a.lead_input))
        li_src = f"Lead input ({os.path.basename(a.lead_input)}, as of {li.get('as_of')})" + (" EXAMPLE" if li.get("example") else "")
    li_age = None
    if li and li.get("as_of"):
        try:
            li_age = hours(datetime.fromisoformat(li["as_of"]).astimezone(timezone.utc), NOW)
        except ValueError:
            pass
    sessions = (li or {}).get("sessions", [])

    # ================================================================ sections
    rsha9 = (snap.meta.get("records_sha") or "")[:9]
    copy = f"snapshot of {snap.meta.get('records_branch')} @{rsha9}"
    asks, forf, waitline = state_needs(snap.file("STATE.md") or "", NOW.astimezone(IST).date())
    st_src = f"STATE.md in {copy}"
    groups, rows, readiness = checklist(snap.file("MVP-CHECKLIST.md") or "")
    ck_src = f"MVP-CHECKLIST.md §A in {copy} (Status column)"
    counts = {s: sum(1 for x in rows if x["status"] == s) for s in ORDER}
    other = len(rows) - sum(counts.values())
    if other:
        counts["Other"] = other
    nrows = len(rows)
    plan = json.loads(snap.file("cockpit/plan.json") or '{"dates": []}')
    for d in plan["dates"]:
        if d.get("date"):
            dd = datetime.fromisoformat(d["date"]).date()
            d["days_left"] = (dd - today).days
    upcoming = sorted([d for d in plan["dates"] if d.get("date") and d["days_left"] >= 0], key=lambda d: d["date"])
    next_any = upcoming[0] if upcoming else None
    next_committed = next((d for d in upcoming if d["kind"] == "committed"), None)
    build_fc = next((d for d in plan["dates"] if d["id"] == "H1"), None)

    # needs you (the founder's own items only) and the tech lead's PR questions apart (P-602 (1))
    needs, lead_queue = needs_split(asks, forf, waitline, questions, prs_ok, st_src, prs_src,
                                    {"parsed": (rsha9, snap.meta.get("taken_at")), "measured": ((snap.meta.get("main_sha") or "")[:9], NOW.astimezone(IST).isoformat(timespec="seconds"))},
                                    NOW.astimezone(IST).date())

    # status line
    status_line = {
        "works": V([works, works_total], cap_src),
        "rows_done": V([counts["qa Works"], nrows], ck_src + ": rows at qa Works"),
        "rows_merged_or_better": V(counts["qa Works"] + counts["Merged"], ck_src),
        "next_committed": V(next_committed, "cockpit/plan.json (kind committed)"),
        "build_forecast": V(build_fc, "cockpit/plan.json H1"),
    }

    # value stream (the slowest measured stage is flagged)
    stale = [p for p in prs if not p["records"] and (p["push_age_h"] or 0) > 168]
    eng = [p for p in prs if not p["records"] and p not in stale]
    stn = lambda s: [p for p in eng if p["station"] == s]
    ci_walls = []
    for d in days[-2:]:
        for x in runs_by_day.get(d) or []:
            if x["status"] == "completed" and not is_queue(x) and x["run_started_at"]:
                ci_walls.append((ts(x["updated_at"]) - ts(x["run_started_at"])).total_seconds() / 3600)
    waits_q = (fm or {}).get("approved_to_merged_min", {}).get("median")
    built_wait = sum(x["other"].get("built, awaiting qa", 0) for x in prog)
    merged24 = [m for m in merged if ts(m["merged"]) >= NOW - timedelta(hours=24)]
    stages = [
        {"id": "shaped", "name": "Shaped rows", "count": V(counts["Shaped"], ck_src), "wait_h": V(None, "not measured: shaped dates are not recorded")},
        {"id": "building", "name": "Building (lanes)", "count": V(len(stn("Building")) + len(stn("Concept")), prs_src + ": Building + Concept"),
         "wait_h": V(med([p["open_h"] for p in stn("Building") + stn("Concept")]), "median hours since those PRs opened (still open)",
                     n=len([p for p in stn("Building") + stn("Concept") if p["open_h"] is not None]))},
        {"id": "review", "name": "Review (Opus)", "count": V(len(stn("Ready for label")) + len(stn("Question to Lead")), prs_src + ": Ready for label + Question to Lead"),
         "wait_h": V(med([p["push_age_h"] for p in stn("Ready for label") + stn("Question to Lead")]), "median hours since their last push",
                     n=len([p for p in stn("Ready for label") + stn("Question to Lead") if p["push_age_h"] is not None]))},
        {"id": "ci", "name": "CI", "count": V(len(stn("CI running")) + len(stn("CI red")), prs_src + ": CI running + CI red"),
         "wait_h": V(round(statistics.median(ci_walls), 2) if ci_walls else None, "added: median wall time of PR check runs (ci.yml, draft guard runs included), last 2 days",
                     n=len(ci_walls))},
        {"id": "queue", "name": "Merge queue", "count": V(len(stn("Merge queue")), prs_src + ": labelled review: approved"),
         "wait_h": V(round(waits_q / 60, 1) if waits_q is not None else None, fm_src + ": approved_to_merged_min.median",
                     n=(fm or {}).get("approved_to_merged_min", {}).get("n"))},
        {"id": "main", "name": "main (last 24 h)", "count": V(len(merged24), "GitHub: PRs merged in the last 24 h"), "wait_h": V(None, "not a waiting stage")},
        {"id": "works", "name": "qa Works", "count": V(built_wait, cap_src + ": Built, awaiting qa"), "wait_h": V(None, "not measured: merge-to-Works time needs qa verdict dates")},
        {"id": "done", "name": "Release 1 rows done", "count": V(counts["qa Works"], ck_src), "wait_h": V(None, "end of the line")},
    ]
    measured = [s for s in stages if s["wait_h"]["v"] is not None]
    bottleneck = max(measured, key=lambda s: s["wait_h"]["v"])["id"] if measured else None

    # team
    def chip(s):
        st = (s.get("state") or "").lower()
        pr = next((p for p in prs if p["n"] == s.get("pr")), None)
        if st == "blocked" or (pr and pr["station"] in ("Question to Lead",)):
            return "blocked"
        recent = (pr and pr["push_age_h"] is not None and pr["push_age_h"] < 1.5) or (s.get("idle_min") is not None and s["idle_min"] < 90 and st in ("running", "pushing", "working"))
        return "pushing" if recent else "quiet"
    team = []
    for s in sessions:
        team.append(dict(s, chip=chip(s)))
    team_counts = {
        "cloud_running": sum(1 for s in team if s.get("kind") == "cloud" and s["chip"] == "pushing"),
        "cloud_idle": sum(1 for s in team if s.get("kind") == "cloud" and s["chip"] != "pushing"),
        "mac": sum(1 for s in team if s.get("kind") == "mac"),
    }

    # architecture
    arch = jload("cockpit/architecture.json") or {"modules": []}
    amods = []
    for m in arch["modules"]:
        names = [x.lower() for x in m.get("match", [])]

        def hit(r):
            parts = [re.sub(r"\s*\(.*\)", "", x).strip().lower() for x in r["module"].split("+")]
            if m.get("rule") == "multi":
                return len(parts) > 1 or parts == ["all"]
            return any(x in names for x in parts)
        mine = [r for r in rows if hit(r)]
        c = {s: sum(1 for r in mine if r["status"] == s) for s in ORDER}
        amods.append({"id": m["id"], "name": m["name"], "kind": m.get("kind", "module"), "what": m.get("what"),
                      "total": len(mine), "counts": c,
                      "done_share": round(c["qa Works"] / len(mine), 3) if mine else None,
                      "merged_share": round((c["qa Works"] + c["Merged"]) / len(mine), 3) if mine else None,
                      "rows": [{"map": r["map"], "cap": r["cap"], "status": r["status"]} for r in mine],
                      "src": f"{ck_src}, Module column; mapping cockpit/architecture.json ({m.get('source', '')})"})

    # building
    merged_ids, inpr_ids = set(), set()
    idre = r"\b((?:PF|FO|BK|CS|AUD|SEC|AS)-[0-9A-Za-z]+)\b"
    for m in merged:
        merged_ids.update(re.findall(idre, m["title"]))
    for r in rows:
        if r["status"] in ("Merged", "qa Works"):
            merged_ids.update(re.findall(idre, r["backlog"]))
    for x in re.findall(r"\b((?:PF|FO|BK)-[0-9A-Za-z]+) merged", snap.file("MVP-CHECKLIST.md") or ""):
        merged_ids.add(x)
    for p in prs:
        inpr_ids.update(re.findall(idre, p["title"]))
    owners, brows, bylane, xrows = backlog(merged_ids, inpr_ids, text=snap.file("BACKLOG.md") or "")

    # quality
    bugs = []
    for line in bugs_text.splitlines():
        if line.startswith("| QA-"):
            c = cells(line)
            sev = re.search(r"(Critical|Major|Minor|Trivial)", c[2])
            b = re.search(r"\*\*(.+?)\*\*", c[5])
            bugs.append({"id": c[1], "sev": sev.group(1) if sev else "?", "cap": clean(c[3].split("·")[0], 40),
                         "what": clean(b.group(1) if b else c[5], 120), "status": clean(c[-2], 60)})
    open_bugs = [b for b in bugs if b["status"].lower().startswith("open")]
    sev_counts = {s: sum(1 for b in open_bugs if b["sev"] == s) for s in ("Critical", "Major", "Minor")}
    closed_rows = [cells(l) for l in closed_text.splitlines() if l.startswith("| QA-")]
    mon = {"Oct": 10, "Nov": 11, "Dec": 12, "Jan": 1, "Feb": 2}
    closed7 = 0
    for c in closed_rows:
        m = re.search(r"\b(\d{1,2}) (Oct|Nov|Dec|Jan|Feb)\b", c[5] if len(c) > 5 else "")
        if m:
            y = today.year if mon[m.group(2)] <= today.month else today.year - 1
            try:
                if (today - datetime(y, mon[m.group(2)], int(m.group(1))).date()).days < 7:
                    closed7 += 1
            except ValueError:
                pass

    # Works per day from main's CAPABILITIES.md history (progress.sh's parse on each day's last version)
    def works_history():
        cm, page = [], 1
        while page <= 10:
            got = gh.get(f"/commits?sha=main&path={REL}/qa/CAPABILITIES.md&since={(NOW - timedelta(days=15)).strftime('%Y-%m-%dT%H:%M:%SZ')}&per_page=100&page={page}")
            cm += got
            if len(got) < 100:
                break
            page += 1
        w0 = (NOW - timedelta(days=15)).strftime('%Y-%m-%dT%H:%M:%SZ')
        cm += gh.get(f"/commits?sha=main&path={REL}/qa/CAPABILITIES.md&until={w0}&per_page=1")   # the version in force when the window opens
        cm = sorted(((ts(c["commit"]["committer"]["date"]), c["sha"]) for c in cm))
        out = {}
        for d in days:
            end = datetime(d.year, d.month, d.day, tzinfo=IST).astimezone(timezone.utc) + timedelta(days=1)
            before = [s for t_, s in cm if t_ < end]
            if not before:
                out[d] = None
                continue
            sha = before[-1]
            f = os.path.join(cache, f"works-{sha[:12]}.json")
            if os.path.exists(f):
                out[d] = json.load(open(f))
                continue
            txt = gh.get(f"/contents/{REL}/qa/CAPABILITIES.md?ref={sha}", raw=True)
            w = sum(x["works"] for x in run_progress(txt, None))
            json.dump(w, open(f, "w"))
            out[d] = w
        return out
    wh = safe("Works history", works_history, {}) if not gh.offline else {}
    # earliest day before the first change in the window: carry back nothing (shown as a gap)
    demotions = []
    prev = None
    for d in days:
        w = wh.get(d)
        if w is not None and prev is not None and w < prev:
            demotions.append({"day": d.isoformat(), "from": prev, "to": w})
        prev = w if w is not None else prev

    # pipeline (DORA labels from the cto-review skill; bands per its rule)
    m7 = [m for m in merged if ts(m["merged"]) >= NOW - timedelta(days=7)]
    lead7 = [hours(ts(m["created"]), ts(m["merged"])) for m in m7]
    ac7 = [m for m in m7 if ac.get(str(m["n"]))]
    reverts7 = [m for m in m7 if m["title"].lower().startswith("revert")]
    nl = sorted([x for x in nightly if x["status"] == "completed" and x["conclusion"] in ("success", "failure")], key=lambda x: x["created_at"])
    nl7 = [x for x in nl if ts(x["created_at"]) >= NOW - timedelta(days=7)]
    red_share = round(100 * sum(x["conclusion"] == "failure" for x in nl7) / len(nl7), 1) if nl7 else None
    restores, red_since = [], None
    for x in nl:
        if x["conclusion"] == "failure" and red_since is None:
            red_since = ts(x["updated_at"])
        elif x["conclusion"] == "success" and red_since is not None:
            restores.append(hours(red_since, ts(x["updated_at"])))
            red_since = None
    fmv = fm or {}
    series_ci7 = []
    for d in days[-8:-1]:
        rs = runs_by_day.get(d)
        if rs is not None:
            series_ci7.append(sum((ts(x["updated_at"]) - ts(x["run_started_at"])).total_seconds() for x in rs
                                  if x["status"] == "completed" and x["run_started_at"]) / 60)
    ci_hours = (fmv.get("pr_check_hours") or 0) + (fmv.get("queue_hours") or 0) if fm else None
    pipeline = {
        "band_note": "DORA bands: band not checked (cto-review skill: bands only from the newest DORA report, cited with page and date)",
        "deploy_freq": V(round(len(m7) / 7, 1), "GitHub: PRs merged to main in the last 7 days ÷ 7 (merge-queue branches left out)",
                         label="Changes reaching the main line, a day", n=len(m7),
                         app_code=V(round(len(ac7) / 7, 1), "same, only PRs tools/app-code-prs.sh counts as app code (P-500)", n=len(ac7))),
        "lead_time_h": V(med(lead7), "added: median hours from PR opened to merged, PRs merged in the last 7 days", label="PR opened to merged (proxy for lead time)", n=len(lead7)),
        "change_fail": V(red_share, f"added: share of finished nightly runs on main that failed, last 7 days (n={len(nl7)})", label="Share turning the main line red (proxy)", n=len(nl7),
                         reverts=V(len(reverts7), "merged PRs titled Revert…, last 7 days", n=len(m7)),
                         batch_fail=V(round(100 * fmv["queue_failed"] / fmv["queue_runs"], 1) if fm and fmv.get("queue_runs") else None, fm_src + ": queue_failed ÷ queue_runs")),
        "restore_h": V(med(restores), "added: median hours from a failed nightly on main to the next green one, last 60 nightly runs", label="Time from red to green", n=len(restores),
                       open_red=V(ist(red_since) if red_since else None, "nightly on main red since (none = green)")),
        "queue_wait_min": V((fmv.get("approved_to_merged_min") or {}).get("median"), fm_src + ": approved_to_merged_min.median",
                            p90=(fmv.get("approved_to_merged_min") or {}).get("p90"), n=(fmv.get("approved_to_merged_min") or {}).get("n")),
        "batches": V([fmv.get("queue_runs"), fmv.get("queue_failed"), fmv.get("queue_cancelled")], fm_src + ": queue_runs, queue_failed, queue_cancelled"),
        "ci_min_per_day": V(round(sum(x for x in series_ci7) / len(series_ci7)) if series_ci7 else None,
                            "added (approx): ci.yml run wall time, run_started_at to updated_at, summed per IST day, average of the last 7 full days",
                            n=len(series_ci7),
                            job_hours=V(ci_hours, fm_src + ": pr_check_hours + queue_hours (job time over the runs it read)")),
        "thrown_share": V(fmv.get("thrown_share"), fm_src + ": thrown_share (P-371 target under 20%)", n=fmv.get("runs_read")),
        "records_share": V(fmv.get("records_share"), fm_src + ": records_share (target under 20%)"),
        "runs_read": V(fmv.get("runs_read"), fm_src + ": runs_read (the runs API returns at most 1,000 per created filter)"),
    }

    # merges per day and the trend series
    series = {"days": [d.isoformat() for d in days], "merges": [], "app_merges": [], "app_partial": [], "works": [], "lead_h": [], "batch_fail": [], "ci_min": []}
    for d in days:
        md_ = [m for m in merged if ts(m["merged"]).astimezone(IST).date() == d]
        series["merges"].append(len(md_))
        series["app_merges"].append(sum(1 for m in md_ if ac.get(str(m["n"]))))
        series["app_partial"].append(any(str(m["n"]) not in ac for m in md_))
        series["works"].append(wh.get(d))
        series["lead_h"].append(med([hours(ts(m["created"]), ts(m["merged"])) for m in md_]))
        rs = runs_by_day.get(d)
        if rs is None:
            series["batch_fail"].append(None)
            series["ci_min"].append(None)
        else:
            qr = [x for x in rs if is_queue(x) and x["status"] == "completed" and x["conclusion"] in ("success", "failure", "timed_out")]
            series["batch_fail"].append(round(100 * sum(x["conclusion"] != "success" for x in qr) / len(qr), 1) if qr else None)
            series["ci_min"].append(round(sum((ts(x["updated_at"]) - ts(x["run_started_at"])).total_seconds() for x in rs
                                              if x["status"] == "completed" and x["run_started_at"]) / 60))

    def trend(key, better):
        xs = series[key]
        a_ = [x for x in xs[-7:] if x is not None]
        b_ = [x for x in xs[:7] if x is not None]
        latest = next((x for x in reversed(xs) if x is not None), None)
        if not a_ or not b_:
            return {"latest": latest, "dir": None, "this_week": None, "week_before": None, "n_this": len(a_), "n_before": len(b_)}
        ma, mb = sum(a_) / len(a_), sum(b_) / len(b_)
        dirn = "flat" if abs(ma - mb) <= 0.05 * max(abs(mb), 1e-9) else ("up" if ma > mb else "down")
        good = None if dirn == "flat" else ((dirn == "up") == (better == "up"))
        return {"latest": latest, "dir": dirn, "better": good, "this_week": round(ma, 1), "week_before": round(mb, 1), "n_this": len(a_), "n_before": len(b_)}
    improving = {
        "app_merges": dict(trend("app_merges", "up"), label="App-code merges a day", src="GitHub merged PRs filtered by tools/app-code-prs.sh (P-500), per IST day"),
        "works": dict(trend("works", "up"), label="qa Works", src="tools/progress.sh's parse on main's qa/CAPABILITIES.md as of each day's end (IST)"),
        "lead_h": dict(trend("lead_h", "down"), label="Median hours, PR opened to merged", src="added: GitHub merged PRs, per IST day"),
        "batch_fail": dict(trend("batch_fail", "down"), label="Merge-queue batch failure %", src="added: ci.yml runs on merge-queue branches, per IST day"),
    }

    # healing: PR branches whose check run went red and later green (no Lead-comment check; best effort)
    by_branch = {}
    for d in days[-7:]:
        for x in runs_by_day.get(d) or []:
            if not is_queue(x) and x["status"] == "completed" and x["conclusion"] in ("success", "failure"):
                by_branch.setdefault(x["head_branch"], []).append(x)
    healed = []
    for b, xs in by_branch.items():
        xs.sort(key=lambda x: x["created_at"])
        red_at = None
        for x in xs:
            if x["conclusion"] == "failure" and red_at is None:
                red_at = ts(x["updated_at"])
            elif x["conclusion"] == "success" and red_at is not None:
                healed.append(hours(red_at, ts(x["updated_at"])))
                red_at = None
    healing = {
        "restarts": V(sum(int(s.get("restarts") or 0) for s in sessions) if li else None, li_src + ": sessions[].restarts"),
        "nudges": V(sum(int(s.get("nudges") or 0) for s in sessions) if li else None, li_src + ": sessions[].nudges"),
        "healed_prs": V(len(healed), "added: PR branches whose ci.yml run went red, then green, last 7 days (Lead comments not checked)",
                        median_h=med(healed), n=len(by_branch)),
        "blocked": V([{"name": s.get("name"), "row": s.get("row"), "pr": s.get("pr")} for s in team if s["chip"] == "blocked"], li_src + " + open PR stations"),
        "ci_red_prs": V([{"n": p["n"], "push_age_h": p["push_age_h"]} for p in prs if not p["records"] and p["station"] == "CI red"], prs_src + ": station CI red"),
        "questions": V([{"n": q_["n"], "age_h": q_["age_h"]} for q_ in questions] if prs_ok else None,
                       "open PRs with an unanswered Question for the tech lead" if prs_ok else
                       "not measured: the open pull requests could not be read at this refresh"),
    }

    # risks
    rk = jload("cockpit/risks.json") or {"risks": []}
    listed = {x["id"] for x in rk["risks"]}
    unlisted = [x for x in readiness if x["status"].startswith("Not started") and x["id"] not in listed]

    # resources
    df = sh(["df", "-g", ROOT]).stdout.splitlines()
    free_gb = int(df[1].split()[3]) if len(df) > 1 else None

    def lv(k):
        return V(li.get(k) if li else None, li_src + f": {k}" if li else "Lead input missing")
    resources = {"disk_free_gb": V(free_gb, "df -g on the repository's volume (tools/disk.sh's first line; disk.sh itself not run: it fetches)",
                                   floor_gb=10),
                 "weekly_pct": lv("weekly_pct"), "weekly_resets": lv("weekly_resets"), "burn_pct_per_h": lv("burn_pct_per_h"),
                 "paid_usd_today": lv("paid_usd_today"),
                 "api_left": V(None, "GitHub API calls left this hour after the run")}

    learn = jload("cockpit/learnings.json") or {"learnings": []}

    data = {
        "schema": 2,
        "freshness": {
            "generated_at": NOW.strftime("%Y-%m-%dT%H:%M:%SZ"), "generated_ist": ist(NOW),
            "main_sha": V(main_sha, "GitHub API commits/main"), "main_at_ist": ist(main_at),
            "records_copy": V(copy, "records branch and sha of the snapshot (meta.json)", sha=(snap.meta.get("records_sha") or "")[:9],
                              **{"class": "parsed", "as_of": snap.meta.get("taken_at")}),
            "library_base": library_base(gh.repo),
            "library_freshness": library_freshness(),
            "lead_input_age_h": V(li_age, li_src), "lead_input_example": bool(li and li.get("example")),
            "flow_measure_age_h": V(fm_age, fm_src),
        },
        "summary": {
            "needs_you": needs["count"],
            "burnup_pct": V(round(100 * counts["qa Works"] / nrows, 1) if nrows else None, ck_src + ": qa Works rows ÷ all rows"),
            "works": status_line["works"], "next_date": V(next_any, "cockpit/plan.json: the next dated row"),
        },
        "needs_you": needs,
        "lead_queue": lead_queue,
        "status_line": status_line,
        "value_stream": {"stages": stages, "bottleneck": bottleneck,
                         "stale": V([p["n"] for p in stale], prs_src + ": open engineering PRs with no push in 7 days"),
                         "note": f"Counts of open engineering PRs by factory-board station; records PRs (lead:, qa:) and {len(stale)} stale PRs (no push in 7 days) left out."},
        "team": {"sessions": team, "counts": V(team_counts, li_src), "demo": V(None, "not read: the demo's state is not in any record")},
        "plan": {"dates": plan["dates"], "src": "cockpit/plan.json (hand-kept; each row names its decision)", "as_of": plan.get("as_of")},
        "architecture": {"modules": amods, "src": "cockpit/architecture.json"},
        "capabilities": {"groups": groups, "rows": rows, "counts": V(counts, ck_src), "total": nrows,
                         "qa": V(caps, cap_src), "qa_by_milestone": V(prog, cap_src)},
        "building": {"prs": prs, "src": prs_src, "owners": V(owners, "BACKLOG.md › Owners (as of 1 Nov; the tech lead keeps it current)")},
        "quality": {"open_major": [b for b in open_bugs if b["sev"] in ("Critical", "Major")], "sev_counts": V(sev_counts, bugs_src + ": open rows by severity"),
                    "src": bugs_src, "closed_total": V(len(closed_rows), "qa/BUGS-CLOSED.md rows (older rows are in history/)"),
                    "closed_7d": V(closed7, "qa/BUGS-CLOSED.md: Closed on date within 7 days (best effort)"),
                    "demotions": V(demotions, "Works fell from one day's end to the next (main's qa/CAPABILITIES.md, 14 days)"),
                    "flaky": V(flaky(), f"tools/flaky-ledger.tsv in {copy}"),
                    "review_rounds": V(None, "not measured: needs every PR's review comments (costly)")},
        "pipeline": pipeline,
        "merges_per_day": V({"days": series["days"], "all": series["merges"], "app": series["app_merges"], "partial": series["app_partial"]},
                            "GitHub merged PRs per IST day; app = tools/app-code-prs.sh" + (f"; {unclassified} PRs not yet classified" if unclassified else "")),
        "resources": resources,
        "risks": {"items": rk["risks"], "src": "cockpit/risks.json (hand-kept)", "unlisted": V(unlisted, "MVP-CHECKLIST.md §C items Not started that risks.json lacks")},
        "healing": healing,
        "improving": {"series": series, "trends": improving},
        "learnings": {"decisions": decisions_last(5), "kept": learn.get("learnings", []), "src": "DECISIONS.md (newest five) + cockpit/learnings.json"},
        "backlog": {"by_lane": V(bylane, "BACKLOG.md PF/FO/BK rows: merged or in PR by PR titles; ready when every 'waits on' row is merged (best effort)"),
                    "x_rows": V(xrows, "BACKLOG.md X- rows (after the first build, P-582)"), "rows": brows},
    }
    rate1 = safe("rate limit", lambda: gh.get("https://api.github.com/rate_limit")["resources"]["core"], {}) if not gh.offline else {}
    resources["api_left"]["v"] = rate1.get("remaining")
    # ---- A61-A63 blocks (spec §1-§5, §7), all from the snapshot; lineage of every number; trust (§6)
    meta, ex = snap.meta, snap.meta.get("extra") or {}
    fm_fresh = {"source": "flow-measure", "age_h": fm_age, "limit_h": FRESH_LIMIT_H["flow-measure"]}
    if fm_age is None or fm_age > FRESH_LIMIT_H["flow-measure"]:
        it7 = next(i for i in hl["items"] if i["id"] == 7)
        it7["state"] = "amber" if it7["state"] == "green" else it7["state"]
        it7["detail"] += ("; " if it7["detail"] else "") + ("flow-measure not run yet" if fm_age is None else f"flow-measure {fm_age} h old (limit 6 h)")
        hl["light"] = "red" if any(i["state"] == "red" for i in hl["items"]) else "amber" if hl["light"] == "green" else hl["light"]
    L = {"measured": ((meta.get("main_sha") or "")[:9], meta.get("taken_at")), "parsed": ((meta.get("records_sha") or "")[:9], meta.get("taken_at")),
         "reported": ("lead-input " + git_blob_sha(snap.text("lead-input.json"))[:9] if snap.text("lead-input.json") else "no Lead input",
                      (li_snap or {}).get("as_of") or meta.get("taken_at"))}
    data.update({
        "lineage": {"records_branch": meta.get("records_branch"), "records_sha": meta.get("records_sha"), "main_sha": meta.get("main_sha"),
                    "taken_at": meta.get("taken_at"), "snapshot": snap_dir, "repo_path": REL,
                    "ahead_of_main": num(ex.get("records_ahead"), "git rev-list --count main..records (read-only, at snapshot)", "measured", L,
                                         "not measured: main's commit is not in this copy and origin/main could not be read"),
                    "main_ref_is_head": ex.get("main_ref_is_head"), "current_lead": (comp["org"]["leads"] or [{}])[0].get("name")},
        "pace": comp["pace"], "forecast": comp["forecast"], "burnup": comp["burnup"], "capacity": comp["capacity"],
        "top3": comp["top3"], "org": comp["org"], "working_today": comp["working_today"], "health": hl,
        "trust": dict(comp["trust"], freshness=comp["fresh"] + [fm_fresh]),
        "reconcile_keys": comp["keys"], "build_rows": comp["rows"],
        "history": {"file": "cockpit/history.jsonl", "today": comp["history_line"], "previous_day": (comp["history_prev"] or {}).get("day"),
                    "written": not a.no_history_write},
    })
    data["summary"]["health"] = {"light": hl["light"]}
    data["freshness"]["page_age_rule"] = {"amber_min": 45, "red_min": 120, "note": "Health item 2: the page computes the data age (spec §0.5)"}
    lineage_fill(data, L)
    data["explain"] = build_explain(data)
    data["run"] = {"seconds": round(time.time() - T0, 1), "api_calls": gh.calls, "errors": ERRORS}
    os.makedirs(out_dir, exist_ok=True)
    errs = validate(data, os.path.join(P, "cockpit", "data.schema.json"))
    if errs:
        bad = a.out + ".invalid.json"
        json.dump(data, open(bad, "w", encoding="utf-8"), ensure_ascii=False, indent=1, default=str)
        print(f"cockpit-data: schema violation, data.json NOT written (see {bad}):", file=sys.stderr)
        for e in errs:
            print("  ", e, file=sys.stderr)
        sys.exit(2)
    tmp = a.out + ".tmp"
    json.dump(data, open(tmp, "w", encoding="utf-8"), ensure_ascii=False, indent=1, default=str)
    os.replace(tmp, a.out)
    if not a.no_history_write:
        write_history(a.history_file, read_history(snap.file("cockpit/history.jsonl")), comp["history_line"])
    print(f"cockpit-data: wrote {a.out} in {data['run']['seconds']} s, {gh.calls} API calls, {len(ERRORS)} notes; "
          f"health {hl['light']}; trust {comp['trust']['state']}")
    for e in ERRORS:
        print("  note:", e)


if __name__ == "__main__":
    main()
