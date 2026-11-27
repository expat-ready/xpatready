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


def private_state(private_only=False):
    """STATE.md where the Lead's records are (private split PS-1b: records-dir.sh; --private: the private copy only)."""
    d = subprocess.run(["bash", os.path.join(HERE, "records-dir.sh")] + (["--private"] if private_only else []),
                       capture_output=True, text=True).stdout.strip()
    p = os.path.join(d, "STATE.md") if d else ""
    return slurp(p) if p and os.path.exists(p) else None


def read(rel):
    if rel == "STATE.md":
        return private_state()   # the private copy first, else this copy's (records-dir.sh)
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
def main_checks(check_runs, full_run_ids):
    """Main's own check runs: those of a PR's full run (CI-PRE; run ids as strings) are left out."""
    def run_of(c):
        m = re.search(r"/actions/runs/(\d+)", c.get("details_url") or "")
        return m.group(1) if m else None
    return [c for c in check_runs if run_of(c) not in full_run_ids]


class GH:
    def __init__(self, offline):
        self.offline = offline
        self.calls = 0
        self.tally = {}                                     # calls by endpoint shape, for the run note
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
        # -L: a moved repository's reads follow GitHub's redirect (the org move, 18 Nov)
        cmd = ["curl", "-sSL", "--fail-with-body", "-H", f"Accept: {acc}", "-H", f"Authorization: token {self.token}", url]
        err = ""
        for wait in (0, 2, 5):
            time.sleep(wait)
            self.count(url)
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

    def count(self, url):
        self.calls += 1
        k = re.sub(r"[?].*$", "", url.replace(self.api, "").replace("https://api.github.com", ""))
        k = re.sub(r"/[0-9a-f]{40}|/\d+", "/N", k)
        self.tally[k] = self.tally.get(k, 0) + 1

    def get_pages(self, url, max_pages=40):
        """GET every page of a list that pages by the Link header's rel="next" (cursor APIs such as /activity)."""
        url = url if url.startswith("http") else self.api + url
        out = []
        for _ in range(max_pages):
            if self.offline:
                raise RuntimeError("offline")
            self.count(url)
            r = subprocess.run(["curl", "-sSL", "--fail-with-body", "-D", "-", "-H", "Accept: application/vnd.github+json",
                                "-H", f"Authorization: token {self.token}", url], capture_output=True, text=True)
            if r.returncode:
                raise RuntimeError(f"GET {url.replace(self.api, '')} failed: {(r.stdout[-200:] + ' ' + r.stderr[:200]).strip()}")
            head, _, body = r.stdout.partition("\n\n")          # text mode: curl's \r\n arrive as \n
            while head.startswith("HTTP/") and body.startswith("HTTP/"):          # a 100-continue, proxy preamble or followed redirect (-L)
                head, _, body = body.partition("\n\n")
            out += json.loads(body)
            m = re.search(r'<([^>]+)>;\s*rel="next"', head)
            if not m:
                return out
            url = re.sub(r"^https://api\.github\.com/repositories/\d+", self.api, m.group(1))   # same repo, by its name
        raise RuntimeError(f"more than {max_pages} pages")

    def graphql(self, query, variables):
        if self.offline:
            raise RuntimeError("offline")
        self.count("graphql")
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


NOT_HIM = re.compile(r"\b(nothing|no|not|never|none|nobody|no longer)\s+(\w+\s+){0,2}(waits?|waiting|needs?|needed)\b", re.I)


def his_clauses(text):
    """Clauses (split on ";") of a status that ask for the founder's word or act and are not marked decided or done, nor
    negated ("nothing waits on him", "no longer needs his word")."""
    return [c.strip() for c in re.split(r";", text or "") if NEEDS_HIM.search(c) and not NOT_HIM.search(c) and not DECIDED.search(c.strip())]


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
# Flow box (Lead 69, 16 Nov 21:3x IST, P-644): targets a day and the light bands (FORMULAS.md › Flow)
FLOW_TARGET, FLOW_FLOOR = 10, 7                # rows built and rows proven in 24 h (P-644)
FLOW_PROVE_H = 12                              # built → Works under 12 h (P-644)
FLOW_MERGE_MIN = (30, 60)                      # approved → merged median: green to 30 min, amber to 60
FLOW_FAIL_PCT = (10, 20)                       # failed merge batches: green under 10%, amber under 20%
FLOW_CI_WAIT_MIN = (10, 30)                    # median job wait for a test machine: green to 10 min, amber to 30
FLOW_LANES_SHARE = (0.8, 0.5)                  # lanes running ÷ slots: green from 80%, amber from 50%
FLOW_DISK_GB = 7                               # the Mac's disk floor for the Flow box (P-644)
STUCK_MAX_PRS = 40                             # open approved PRs whose label time is read (one call each)
STUCK_MERGE_MIN = (30, 60)                     # Stuck now: last merge to main, green to 30 min, red over 60 (P-646)
STUCK_QUEUE = (15, 30)                         # Stuck now: Actions runs waiting for a machine, red over 30 (P-646)
STUCK_SESSIONS_FRESH_MIN = 60                  # Stuck now: an empty session list older than this reads amber, not green
STUCK_SESSIONS_LABEL = "Sessions stuck (awaiting input, failed, blocked, or idle with work left and no push for 90 min)"  # Lead 73, P-339b; the Lead filters
STUCK_APPROVED_MIN = 60                        # Stuck now: approved and not merged for over 60 min
CI_SAMPLE_RUNS = 20                            # CI runs (newest, last 3 h) whose jobs are read for the wait
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


# P-639 (16 Nov, qa #1950): a merged "PF-5 part 1" is not PF-5 while BACKLOG still names a later part of it.
# Same pattern in cockpit-reconcile.py (test_part_patterns_agree_on_real_backlog_wording keeps them in step).
PART_MENTION = re.compile(r"(?<![A-Za-z0-9-])([A-Z]{1,4}-[A-Za-z0-9]+)\s*\(?\s*[Pp]arts?\s+(\d+[a-z]?(?:\s*(?:,|and|&|to|–|-)\s*\d+[a-z]?)*)")


def part_list(text):
    """"2", "2 and 3", "2, 3", "1–2", "1 to 3" → the part numbers; a range of plain numbers is expanded."""
    toks, out = re.findall(r"\d+[a-z]?|to|–|-", text or ""), []
    i = 0
    while i < len(toks):
        if toks[i] in ("to", "–", "-"):
            i += 1
            continue
        if i + 2 < len(toks) and toks[i + 1] in ("to", "–", "-") and toks[i].isdigit() and toks[i + 2].isdigit():
            out += [str(k) for k in range(int(toks[i]), int(toks[i + 2]) + 1)]
            i += 3
            continue
        out.append(toks[i])
        i += 1
    return out


def backlog_parts(text):
    """{id: {part numbers}} that BACKLOG names anywhere ("PF-5 part 2", "PF-5 parts 2 and 3", "FO-7ts parts 1–2", "FO-7mv (part 1)")."""
    out = {}
    for m in PART_MENTION.finditer(text or ""):
        out.setdefault(m.group(1), set()).update(part_list(m.group(2)))
    return out


def title_part(title, rid):
    """The parts a pull request title names for an id ("PF-5 part 1" gives ["1"], "PF-5 parts 1 and 2" gives ["1", "2"]);
    None for the whole id."""
    m = re.search(r"(?<![A-Za-z0-9-])" + re.escape(rid) + r"\s*\(?\s*[Pp]arts?\s+(\d+[a-z]?(?:\s*(?:,|and|&|to|–|-)\s*\d+[a-z]?)*)", title or "")
    return part_list(m.group(1)) if m else None


def merged_when(prs, named):
    """An id is merged when no part of it is open. An id shipped whole (no merged title names a part of it) is merged by
    its first whole-id PR: a part BACKLOG mentions for it (often conditional, "else they open FO-2 part 2", or another
    row's alias) does not hold it. An id shipped in parts (some merged title names a part) needs every part BACKLOG or
    the checklist names and every part a title names merged; a whole-id PR does not stand in for them. It dates from
    the last PR it needed.
    prs: [(merged_at, number, parts or None)] by time. Returns ((merged_at, number) or None, open parts)."""
    done, whole = {}, None
    for t, n, pts in prs:
        if pts is None:
            whole = whole or (t, n)
        else:
            for x in pts:
                done.setdefault(x, (t, n))
    named = set(named)
    if whole and not done:                               # shipped whole
        return whole, []
    need = named | set(done)
    open_ = sorted(need - set(done))
    if open_ or not need:
        return None, open_
    return max(done[x] for x in need), []


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


LABEL_FIELD = re.compile(r"\bdecisions\s*:|\bdone when\b|\bsource\s*:", re.I)
WAITS_FIELD = re.compile(r"waits[\s*_]*on[\s*_]*:", re.I)


def drop_fields(line):
    """§11 R3b (board v63, as cockpit-reconcile.py): inside each segment (cut at "|" and "·"), text from a labelled field
    ("decisions:", "Done when", "Source:") up to the next labelled "Waits on:" field (colon required) or the segment end
    is never a dependency ("Done when: ... P-561 waits on stream 4's A45 comparison." blocks nothing)."""
    out = []
    for seg in re.split(r"([|·])", line):
        keep = ""
        while True:
            lab = LABEL_FIELD.search(seg)
            if not lab:
                keep += seg
                break
            keep += seg[:lab.start()]
            nxt = WAITS_FIELD.search(seg, lab.end())
            if not nxt:
                break
            seg = seg[nxt.start():]
        out.append(keep)
    return "".join(out)


def dep_ids(text, bl_ids=None):
    """Row ids in a dependency clause: the cell rule, except that an id with two or more dashes (a requirement id such
    as AG-17-62) counts only when BACKLOG has it (§11 R3: the dashed id shape is one dash: PF-4, B5-filings, DB-SPLIT)."""
    return [x for x in cell_ids(text) if x.count("-") == 1 or (bl_ids is not None and x in bl_ids)]


def row_deps(line, bl_ids=None):
    """§11 R3, R3b, R3c, R3d: dependencies of a BACKLOG row (its cells except Done when, see dep_text; labelled fields
    dropped, see drop_fields). A clause ends at the first ".", ";", "|", "·", a labelled field ("decisions:",
    "Done when", "Source:") or the line end. Waits-on clause (any case, * or _ emphasis, optional colon): every row id
    is a dependency; the leftover text, without ids, backticked and bracketed text (a bracket the clause end left open
    runs to the clause end), #<number>, punctuation and the filler words, is a non-id dependency only when a word of
    3+ letters remains. "After" clause (whole word, a row id within its next 3 tokens): only its row ids count.
    bl_ids: the BACKLOG ids (for ids with two or more dashes). Returns (ids, non_ids)."""
    ids, non = [], []
    line = drop_fields(line)

    def clause(m):
        e = CLAUSE_END.search(line, m.end())
        return line[m.end(): e.start() if e else len(line)]
    for m in WAITS_ON.finditer(line):
        t = clause(m)
        got = dep_ids(t, bl_ids)
        ids += [x for x in got if x not in ids]
        rest = re.sub(r"`[^`]*`?", " ", t)                                 # R3c: backticked text never blocks
        while re.search(r"\([^()]*\)", rest):
            rest = re.sub(r"\([^()]*\)", " ", rest)                       # R3c: nor does bracketed text
        rest = re.sub(r"\(.*", " ", rest).replace(")", " ")               # R3c: a bracket the clause end left open
        rest = ID_TOKEN.sub(lambda k: " " if k.group(1) in got or k.group(1).count("-") == 1 else k.group(1).replace("-", " "),
                            re.sub(r"[*_`]", "", rest))
        rest = re.sub(r"\bmap\b(?=(?:\s+rows?)?\s+\d)", " ", rest, flags=re.I)     # R3d: "map" followed by numbers is filler
        rest = re.sub(r"#\d+", " ", rest)
        words = [w for w in re.findall(r"[A-Za-z0-9']+", rest) if w.lower() not in FILLER]
        if any(len(re.sub(r"[^A-Za-z]", "", w)) >= 3 for w in words):
            non.append(" ".join(words))
    for m in AFTER_W.finditer(line):
        t = re.sub(r"[*_`]", "", clause(m))
        if any(dep_ids(tok, bl_ids) for tok in t.split()[:3]):
            ids += [x for x in dep_ids(t, bl_ids) if x not in ids]
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
        # One rule with cockpit-reconcile.py (16 Nov, board 7 "ready_rows 7 vs 8"): the first cell with "**" and "`" removed
        # is the row id, so "| **FO-7mv** |" is row FO-7mv (FORMULAS.md › BACKLOG rows).
        first = cells(line)[1].replace("**", "").replace("`", "").strip() if line.startswith("|") and line.count("|") > 2 else ""
        m = re.match(r"^(" + IDRE + r")" + _END, first)
        if not m:
            continue
        rid = m.group(1)
        if first == rid:
            if rid in lines:
                dupes.append(rid)
                continue
            lines[rid] = line
            deps[rid] = dep_text(line, hdr)
        if rid not in ids:
            ids.append(rid)
    return {"ids": ids, "dupes": dupes, "lines": lines, "deps": deps, "bk": [x for x in ids if x.startswith("BK-")]}


TARGET_WORKS_PER_DAY = 10                      # founder A68 ("10 capabilities in 10 h") and A69 ("10 a day"), 15 Nov
SOURCE_RE = re.compile(r"Source:([^|·]*)")        # a BACKLOG row's " · Source: …" field, to the next "·" or the cell's end (P-595)
SOURCE_TOK = re.compile(r"[A-Za-z0-9][A-Za-z0-9.\-]*")     # a token: letters, digits, "." and "-" ("/" and spaces split tokens)
SOURCE_ID = re.compile(r"[A-Z][A-Za-z0-9]*(?:-[A-Z0-9][A-Za-z0-9]*)+")   # an id token: AG-4-16, SA11-D8, AG-2-8a, P-574 (not P-decision)
LABEL_GUARD_HEAD = "**Label guard:**"            # tools/label-guard.sh and label-guard.yml start every removal comment so
RULES_STEP = re.compile(r"check-docs", re.I)       # ci.yml steps whose name names tools/check-docs.sh (the notes run's "notes check 1 of 2 …")
BUNDLE_STEP = re.compile(r"^(rules files|graph, official PDFs)", re.I)   # job fast's tool-checks step: "rules files, …" until ENF-746c (20 Nov), then "graph, official PDFs, …" (check-docs.sh moved to its own PR-only step, counted by RULES_STEP)


def cap_size(r):
    """A70 (founder via Lead 51, 15 Nov): size = distinct backlog row ids in the capability's BACKLOG rows cell:
    1 = S, 2-3 = M, 4 or more = L; no row, or Status "Not shaped" = "not shaped". Measured from the cell, never judged."""
    n = len(set(r["ids"]))
    if r["status"].startswith("Not shaped") or n == 0:
        return "not shaped"
    return "S" if n == 1 else "M" if n <= 3 else "L"


def source_ids(text):
    """The requirement ids in a BACKLOG row's Source: fields (text: the row without its Done-when column, bl["deps"]).
    A field runs from "Source:" to the next "·" or the cell's end; bracketed text (a URL, "(3)") is removed, innermost first,
    until none is left; then each token whose trailing "." and "-" are cut and that has the id shape counts. In order, once each."""
    out = []
    for m in SOURCE_RE.finditer(text or ""):
        txt, prev = m.group(1), None
        while txt != prev:
            prev, txt = txt, re.sub(r"\([^()]*\)", " ", txt)
        for tok in SOURCE_TOK.findall(txt):
            tok = tok.rstrip(".-")
            if SOURCE_ID.fullmatch(tok) and tok not in out:
                out.append(tok)
    return out


def req_section(rid):
    """The section an id belongs to: the id without its last dash part (AG-4-16 → AG-4, SA11-D8 → SA11, P-574 → P)."""
    return rid.rsplit("-", 1)[0]


def parse_caps(text):
    """qa/CAPABILITIES.md rows: id, milestone, status (progress.sh's row rule, all four milestones).
    16 Nov: also the Release 1 rows (R1.2 …), whose table has no M column: status from that table's Status column, m "" (so
    they never enter the M2/T/M3/M4 Works count). Same rule in cockpit-reconcile.py parse_capabilities. Until then a checklist
    row proven by R1.2 failed the invariant "every qa Works row names a qa capability that reads Works on main"."""
    out, si = {}, None
    lines = (text or "").splitlines()
    for i, line in enumerate(lines):
        if line.startswith("|") and i + 1 < len(lines) and SEP_LINE.match(lines[i + 1]):
            low = [x.replace("*", "").strip().lower() for x in cells(line)]
            si = low.index("status") if "status" in low else None
            continue
        if re.match(r"^\| C\d", line):
            c = cells(line)
            if len(c) > 5:
                out[c[1]] = {"m": c[4], "status": c[5].replace("*", "").strip()}
        elif re.match(r"^\|\s*\**R\d+\.\d+\**\s*\|", line) and si is not None:
            # a bold id ("| **R1.8** |") and a short row (no Status cell: status "") read as cockpit-reconcile.py reads them
            c = cells(line)
            rid = c[1].replace("*", "").strip()
            if rid not in out:
                out[rid] = {"m": "", "status": c[si].replace("*", "").strip() if si < len(c) else ""}
    return out


def works_count(caps):
    rows = [v for v in caps.values() if v["m"] in WORKS_MS]
    return sum(1 for v in rows if v["status"].startswith("Works")), len(rows)


# ---------------------------------------------------------------- board v63 (P-613, P-615): behaviour numbers, Customer box
DAY_MON = re.compile(r"\b(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\b")
ASK_ID = re.compile(r"\b([AS])(\d+)(?:-[AS]?(\d+))?\b")
TARGET_WORD = re.compile(r"\btarget\b", re.I)
TARGET_VALUE = re.compile(DAY_MON.pattern + r"|(?i:\b\d+ (?:capabilit|build rows|rows))")
TARGET_KEPT = re.compile(r"\b(kept|stands|unchanged)\b", re.I)


def day_of(text, today):
    """The first "15 Nov" in a text as a date (the year that keeps it on or before today); None when the text has none."""
    for m in DAY_MON.finditer(text or ""):
        mo, dy = MONTHS[m.group(2).lower()], int(m.group(1))
        y = today.year if (mo, dy) <= (today.month, today.day) else today.year - 1
        try:
            return date(y, mo, dy)
        except ValueError:                  # "31 Nov", "40 Decisions": not a date, read on
            continue
    return None


def ask_ids(cell):
    """Ask ids a STATE row names: "A49-A67" expands to 19 ids, "S10" stays one."""
    out = []
    for p, a, b in ASK_ID.findall(cell or ""):
        for i in range(int(a), int(b or a) + 1):
            if f"{p}{i}" not in out:
                out.append(f"{p}{i}")
    return out


def founder_asks_dated(state_text, today):
    """STATE.md › Founder asks: each row's ask ids and the day its Ask cell names (none: undated). Returns ({day: [ids]}, [ids])."""
    by, undated, sec = {}, [], None
    for line in (state_text or "").splitlines():
        if line.startswith("## "):
            sec = line[3:]
            continue
        if not (sec or "").startswith("Founder asks") or not line.startswith("| ") or line.startswith(("| #", "|---")):
            continue
        c = cells(line)
        if len(c) < 4:
            continue
        ids, d = ask_ids(c[1]), day_of(c[2], today)
        if d is None:
            undated += ids
        else:
            by.setdefault(d, []).extend(i for i in ids if i not in by.get(d, []))
    return by, undated


def target_changes(dec_text, today):
    """DECISIONS.md rows that change a date or count target: a bold part of the row has a clause (cut at ";", "," and "(")
    naming "target" with a date or a count, and the bold part does not say kept, stands or unchanged. Returns [{id, day, text}] with the row's own date."""
    out = []
    for line in (dec_text or "").splitlines():
        m = re.match(r"^\| (P-\d+) \| ([^|]+) \|(.*)$", line)
        if not m:
            continue
        d = day_of(m.group(2), today)
        for seg in re.findall(r"\*\*(.+?)\*\*", m.group(3)):
            cl = [c for c in re.split(r"[;,(]", seg) if TARGET_WORD.search(c)]      # the date or count is in the target's own clause
            if any(TARGET_VALUE.search(c) for c in cl) and not TARGET_KEPT.search(seg):
                out.append({"id": m.group(1), "day": d.isoformat() if d else None, "text": clean(seg, 140)})
                break
    return out


def launch_conditions(ck_text):
    """MVP-CHECKLIST.md section C: every | C<n> | item | status | decision | row; done when the status starts with Done;
    a counsel item names counsel or the immigration expert in its item or status."""
    rows, inC = [], False
    for line in (ck_text or "").splitlines():
        if line.startswith("## "):
            inC = line.startswith("## C.")
            continue
        if inC and re.match(r"^\| C\d+ \|", line):
            c = cells(line)
            st = clean(c[3]) if len(c) > 3 else ""
            rows.append({"id": c[1], "item": clean(c[2], 120), "status": st, "done": st.lower().startswith("done"),
                         "counsel": bool(re.search(r"\b(counsel|immigration expert)\b", c[2] + " " + st, re.I))})
    return rows


def day_series(per_day, today, n=7):
    """[{day, count}] for the n IST days ending today (oldest first)."""
    return [{"day": (today - timedelta(days=i)).isoformat(), "count": per_day.get(today - timedelta(days=i), 0)} for i in range(n - 1, -1, -1)]


# ---------------------------------------------------------------- snapshot (§6 1a): the one interface both scripts read
SNAP_FILES = ["MVP-CHECKLIST.md", "BACKLOG.md", "STATE.md", "cockpit/plan.json", "cockpit/history.jsonl", "qa/BUGS.md",
              "cockpit/health-exceptions.json", "cockpit/usage-log.tsv", "cockpit/whats-new.json", "DECISIONS.md"]


def git_out(*args):
    r = sh(["git", "-C", ROOT] + list(args))
    return r.stdout if r.returncode == 0 else None


def _raw_changes(rng):
    """(commit, commit time, path, new blob) for every file change in a git range, newest commit first."""
    out, cur = [], None
    for ln in (git_out("log", "--raw", "--no-abbrev", "--no-renames", "--format=@%H %cI", rng) or "").splitlines():
        if ln.startswith("@"):
            cur = ln[1:].split()
        elif ln.startswith(":") and cur and "\t" in ln:
            meta, path = ln.split("\t", 1)
            out.append((cur[0], cur[1], path, meta.split()[3]))
    return out


def records_lag(branch_ref, main_ref):
    """Record files on a records branch holding a version main has never had, and the time of the oldest such change
    (git, read-only). Fixed 16 Nov: records reach main as one rebuilt commit on a fresh branch (P-505, "records since #…,
    rebuilt on main"), never by merging the Lead's branch, so counting commits (`rev-list main..branch`, 1,133 on 16 Nov)
    only grows. Per file instead: a file counts when the branch's version differs from main's and never appeared in main's
    history since the two last shared a commit; its age is the oldest branch change after the last version main also had.
    Returns (files, oldest time, [{path, since, sha}] oldest first)."""
    if not branch_ref or not main_ref:
        return None, None, None
    base = (git_out("merge-base", main_ref, branch_ref) or "").strip()
    if not base:
        return None, None, None
    on_main = {(p, b) for _, _, p, b in _raw_changes(f"{base}..{main_ref}")}
    mine = _raw_changes(f"{main_ref}..{branch_ref}")
    zero = "0" * 40
    out = []
    for p in sorted({x[2] for x in mine}):
        hb = (git_out("rev-parse", "-q", "--verify", f"{branch_ref}:{p}") or "").strip() or zero
        mb = (git_out("rev-parse", "-q", "--verify", f"{main_ref}:{p}") or "").strip() or zero
        if hb == mb or (p, hb) in on_main:
            continue
        oldest = None
        for c, when, _, b in (x for x in mine if x[2] == p):
            if (p, b) in on_main:
                break
            oldest = (c, when)
        if oldest:
            out.append({"path": p, "since": oldest[1], "sha": oldest[0][:9]})
    out.sort(key=lambda x: parse_iso(x["since"]))
    return len(out), (out[0]["since"] if out else None), out


def branches_from_activity(activity, alive, since):
    """REST fallback for branches_recent.json: the newest push (push, force push, or a branch's first push, branch_creation)
    per branch that still exists, pushed at or after since; the time is the push itself."""
    newest = {}
    for a in activity:
        if a.get("activity_type") in ("push", "force_push", "branch_creation") and (a.get("ref") or "").startswith("refs/heads/"):
            n = a["ref"][len("refs/heads/"):]
            if n in alive and (n not in newest or parse_iso(a["timestamp"]) > parse_iso(newest[n]["pushed_at"])):
                newest[n] = {"name": n, "sha": a["after"], "pushed_at": a["timestamp"]}
    return [x for x in newest.values() if parse_iso(x["pushed_at"]) >= since]


PR_SLIM = ("number", "title", "state", "draft", "created_at", "updated_at", "merged_at", "closed_at")


def pr_slim(x):
    return dict({k: x.get(k) for k in PR_SLIM}, labels=[{"name": l["name"]} for l in x.get("labels", [])],
                head={"ref": x["head"]["ref"], "sha": x["head"]["sha"]}, base={"ref": x["base"]["ref"]})


def pr_list(gh, cache):
    """Every PR, newest created first. Read in full when the cache is missing (or older than 7 days); otherwise the open PRs
    plus every closed PR updated since the cache's read time less a day (a closed PR changes only with its updated_at)."""
    path = os.path.join(cache, "prs.json")
    try:
        c = json.load(open(path)) if os.path.exists(path) else {}
        if not isinstance(c, dict):
            raise ValueError("not an object")
    except (OSError, ValueError) as e:                     # a cut or bad cache file: read in full, never stop the run
        ERRORS.append(f"PR list cache unreadable ({str(e)[:60]}); read in full")
        c = {}
    at = parse_iso(c["read_at"]) if c.get("read_at") else None
    full = parse_iso(c["full_at"]) if c.get("full_at") else None
    byn = {int(k): v for k, v in (c.get("prs") or {}).items()}
    if at is None or full is None or NOW - full > timedelta(days=7):   # a full read once a week at least
        full = NOW
        byn, page = {}, 1
        while page <= 40:
            d = gh.get(f"/pulls?state=all&sort=created&direction=desc&per_page=100&page={page}")
            byn.update({x["number"]: pr_slim(x) for x in d})
            if len(d) < 100:
                break
            page += 1
    else:
        fresh, page = {}, 1
        while page <= 10:                                  # open PRs: read again in full
            d = gh.get(f"/pulls?state=open&per_page=100&page={page}")
            fresh.update({x["number"]: pr_slim(x) for x in d})
            if len(d) < 100:
                break
            page += 1
        cut, page = at - timedelta(days=1), 1
        while page <= 40:                                  # closed PRs updated since the last read
            d = gh.get(f"/pulls?state=closed&sort=updated&direction=desc&per_page=100&page={page}")
            fresh.update({x["number"]: pr_slim(x) for x in d if parse_iso(x["updated_at"]) >= cut})
            if len(d) < 100 or parse_iso(d[-1]["updated_at"]) < cut:
                break
            page += 1
        for n, v in byn.items():                           # cached as open, in neither read (closed and updated before the cut
            if v.get("state") == "open" and n not in fresh:    # cannot happen; read it alone to be sure)
                try:
                    fresh[n] = pr_slim(gh.get(f"/pulls/{n}"))
                except Exception as e:                     # one PR's read never stops the run: keep the cached entry
                    ERRORS.append(f"PR #{n}: read failed ({str(e)[:60]}); cached entry kept")
        byn.update(fresh)
    tmp = path + ".tmp"                                    # written whole, then moved into place: a killed run leaves the old file
    with open(tmp, "w") as f:
        json.dump({"read_at": NOW.strftime("%Y-%m-%dT%H:%M:%SZ"), "full_at": full.strftime("%Y-%m-%dT%H:%M:%SZ"), "prs": {str(k): v for k, v in byn.items()}}, f)
    os.replace(tmp, path)
    return [byn[n] for n in sorted(byn, reverse=True)]


CONFORMANCE_TOOL = f"{REL}/tools/conformance-check.py"
HEARTBEAT_WF = "pipeline-heartbeat.yml"
ENFORCE_STALE_MIN = 45                         # CK-3: a heartbeat or check older than this is "unknown (stale)", never yes


def conformance_read(ref):
    """CK-1's own tool, as on main, run read-only on main (exit code = failures; 101 = nothing checked)."""
    if not ref:
        return {"error": "main's commit is not in this copy"}
    code = git_out("show", f"{ref}:{CONFORMANCE_TOOL}")
    if code is None:
        return {"error": "the set-up check is not on main yet"}
    with tempfile.TemporaryDirectory() as td:
        tool = os.path.join(td, "conformance-check.py")
        open(tool, "w").write(code)
        jf = os.path.join(td, "out.json")
        gd = (git_out("rev-parse", "--absolute-git-dir") or "").strip()      # the tool finds its repository from its own folder:
        env = dict(os.environ, GIT_DIR=gd, GIT_WORK_TREE=ROOT) if gd else None  # point it at this copy's
        r = sh([sys.executable, "-I", tool, "--ref", ref, "--json", jf, "--quiet"], cwd=ROOT, timeout=120, env=env)
        try:
            out = json.load(open(jf)) if os.path.exists(jf) else None
        except ValueError:
            out = None
    if not isinstance(out, dict):
        return {"error": f"the set-up check gave no result (exit {r.returncode}): {(r.stderr or r.stdout)[:160]}"}
    return dict(out, exit=r.returncode, ref=ref, source_kind="board run")


def heartbeat_read(gh):
    """CK-2: the heartbeat workflow's newest finished run on main and, when it is fresh, its artifact (heartbeat.json,
    conformance.json). One call when stale or missing; three calls and one download when fresh."""
    try:
        runs = gh.get(f"/actions/workflows/{HEARTBEAT_WF}/runs?branch=main&status=completed&per_page=1")
    except RuntimeError as e:
        return {"error": "the heartbeat workflow is not on main yet" if "404" in str(e) or "Not Found" in str(e) else str(e)[:160]}
    r = (runs.get("workflow_runs") or [None])[0]
    if not r:
        return {"error": "the heartbeat workflow has not finished a run yet"}
    out = {"run": {k: r.get(k) for k in ("id", "conclusion", "created_at", "updated_at", "html_url")}}
    try:
        at = _aware(parse_iso(r.get("updated_at") or r.get("created_at")))
    except (ValueError, TypeError, AttributeError):
        at = None
    if at and NOW - at <= timedelta(minutes=ENFORCE_STALE_MIN):
        try:
            arts = gh.get(f"/actions/runs/{r['id']}/artifacts?per_page=20").get("artifacts") or []
            # OS-83: a run started by a push or a full run on main uploads "pipeline-heartbeat-event" (the heartbeat's own
            # next run never reads it, so only a scheduled run marks an alarm seen); the board reads either.
            a = next((x for x in arts if x.get("name") in ("pipeline-heartbeat", "pipeline-heartbeat-event") and not x.get("expired")), None)
            if a:
                import io, zipfile
                gh.count(a["archive_download_url"])
                z = subprocess.run(["curl", "-sSL", "--fail", "-H", f"Authorization: token {gh.token}", a["archive_download_url"]],
                                   capture_output=True, timeout=60)
                if z.returncode:
                    raise RuntimeError(f"artifact download failed: {z.stderr[:120]!r}")
                zf = zipfile.ZipFile(io.BytesIO(z.stdout))
                for n in ("heartbeat.json", "conformance.json"):
                    if n in zf.namelist():
                        out[n.split(".")[0]] = json.loads(zf.read(n))
            else:
                out["artifact_error"] = "the run has no pipeline-heartbeat artifact"
        except Exception as e:                       # the run's result still counts; only the detail is missing
            out["artifact_error"] = str(e)[:160]
    return out


def enforcement_lines(d, conf, hb):
    """CK-3 lines; an odd field in an input gives two grey "not measured" lines with a run note, never a stopped build."""
    try:
        return _enforcement_lines(d, conf, hb)
    except Exception as e:                      # review #2141: one bad artifact field must not stop the board
        ERRORS.append(f"enforced: {type(e).__name__}: {str(e)[:200]}")
        why = f"the reading could not be used ({type(e).__name__}); see the run notes"
        return {"lines": [{"key": "setup", "light": "grey", "text": "Set-up enforced: not measured", "src": f"tools/conformance-check.py (CK-1): {why}", "items": [], "link": None},
                          {"key": "pipeline", "light": "grey", "text": "Pipeline running: not measured", "src": f"the {HEARTBEAT_WF} workflow (CK-2): {why}", "items": [], "link": None}],
                "light": "grey"}


def _aware(t):
    """A time with no zone is not a time here (it cannot be compared with the snapshot)."""
    return t if isinstance(t, datetime) and t.tzinfo else None


def _check_at(c):
    try:
        return _aware(parse_iso(c.get("checked_at"))) if isinstance(c, dict) and c.get("checked_at") else None
    except (ValueError, TypeError, AttributeError):
        return None


def _enforcement_lines(d, conf, hb):
    """CK-3 (checks brief): two lines near the top. Set-up enforced (CK-1), from the heartbeat's own check when that is fresh,
    else from the check this run made on main; pipeline running (CK-2), from the newest finished heartbeat run. Machines
    write the status; a heartbeat over 45 min old is "unknown (stale)", never yes (FORMULAS.md › Enforced)."""
    taken = parse_iso((d.get("lineage") or {}).get("taken_at")) if (d.get("lineage") or {}).get("taken_at") else NOW
    hb = hb if isinstance(hb, dict) else {}
    run = hb.get("run") if isinstance(hb.get("run"), dict) else {}
    try:
        r_at = _aware(parse_iso(run.get("updated_at") or run.get("created_at"))) if run else None
    except (ValueError, TypeError, AttributeError):
        r_at = None
    fresh = bool(r_at) and (taken - r_at) <= timedelta(minutes=ENFORCE_STALE_MIN)
    hm = lambda t: t.astimezone(IST).strftime("%H:%M IST") if t else "time not given"
    # set-up
    c, csrc = None, None
    hc = hb.get("conformance") if fresh else None
    hc_at = _check_at(hc)
    hc_fresh = bool(hc_at) and (taken - hc_at) <= timedelta(minutes=ENFORCE_STALE_MIN)
    board_ok = isinstance(conf, dict) and not conf.get("error")
    if isinstance(hc, dict) and hc.get("enforced") in ("yes", "no") and (hc_fresh or not board_ok):   # review #2141: a stale one gives way
        c, csrc = hc, f"the heartbeat run's own set-up check ({run.get('html_url') or 'run link not given'})"
    elif board_ok:
        c, csrc = conf, f"tools/conformance-check.py from main, run by this board build on {str(conf.get('ref') or 'main')[:9]}"
    counts = (c or {}).get("counts") if isinstance((c or {}).get("counts"), dict) else {}
    checked = (c or {}).get("checked")
    if c and isinstance(checked, int) and checked > 0 and c.get("enforced") in ("yes", "no"):
        cat = _check_at(c)
        cstale = not cat or (taken - cat) > timedelta(minutes=ENFORCE_STALE_MIN)
        word = "unknown (stale)" if cstale else c["enforced"]
        setup = {"key": "setup", "light": "amber" if cstale else ("green" if c["enforced"] == "yes" else "red"),
                 "text": f"Set-up enforced: {word} · last checked {hm(cat)} ({counts.get('pass', 0)} of {checked} items)",
                 "src": f"{csrc}; manifest {c.get('manifest_version') or 'version not given'}; pass of pass+fail, pending and unchecked items not counted "
                        f"({counts.get('pending', 0)} pending, {counts.get('unchecked', 0)} unchecked); stale over {ENFORCE_STALE_MIN} min",
                 "items": [f"{x.get('area')} {x.get('id')}: {x.get('status')} (expected {x.get('expected')}, found {x.get('found')})"
                           for x in (c.get("items") or []) if isinstance(x, dict) and x.get("status") == "fail"][:12],
                 "link": run.get("html_url") if csrc.startswith("the heartbeat") else None}
    else:
        why = (conf or {}).get("error") if isinstance(conf, dict) and conf.get("error") else "nothing checked yet"
        setup = {"key": "setup", "light": "grey", "text": "Set-up enforced: not measured", "src": f"tools/conformance-check.py (CK-1): {why}", "items": [], "link": None}
    # pipeline
    h = hb.get("heartbeat") if fresh and isinstance(hb.get("heartbeat"), dict) else {}
    if not run:
        pipe = {"key": "pipeline", "light": "grey", "text": "Pipeline running: not measured",
                "src": f"the {HEARTBEAT_WF} workflow (CK-2): {hb.get('error') or 'no run read'}", "items": [], "link": None}
    elif not fresh:
        pipe = {"key": "pipeline", "light": "amber", "text": f"Pipeline running: unknown (stale) · last heartbeat {hm(r_at)}",
                "src": f"the newest finished {HEARTBEAT_WF} run on main is over {ENFORCE_STALE_MIN} min old (it runs every 30 min); never shown as yes when stale",
                "items": [], "link": run.get("html_url")}
    else:
        # review #2141: a successful run does not mean running (an unchanged open alarm ends green); only heartbeat.json's
        # own word says yes. Without it, a failed run reads no and anything else reads unknown.
        word = h.get("running") if h.get("running") in ("yes", "no") else ("no" if run.get("conclusion") == "failure" else None)
        gs = h.get("green_streak_h")
        alarms = [f"{a.get('id')}: {a.get('why')}" for a in (h.get("alarms") or []) if isinstance(a, dict)] if isinstance(h.get("alarms"), list) else []
        pipe = {"key": "pipeline", "light": {"yes": "green", "no": "red"}.get(word, "amber"),
                "text": f"Pipeline running: {word or 'unknown'} · last heartbeat {hm(r_at)}" +
                        (f" · green streak {gs} h" if word == "yes" and isinstance(gs, (int, float)) and not isinstance(gs, bool) else ""),
                "src": f"the newest finished {HEARTBEAT_WF} run on main ({run.get('conclusion')})" +
                       ("; its heartbeat.json" if h.get("running") in ("yes", "no") else
                        f"; heartbeat.json not read ({hb.get('artifact_error') or 'no artifact'}), so " +
                        ("no from the failed run" if word == "no" else "unknown: a successful run alone does not prove the pipeline runs")),
                "items": alarms[:12], "link": run.get("html_url")}
    lines = [setup, pipe]
    return {"lines": lines, "light": flow_light(*[x["light"] if x["light"] != "grey" else None for x in lines])}


def take_snapshot(snap, gh, cache, lead_input, appcode_max):
    """Download one snapshot of every raw input into <out>/snapshot/ (spec §6 1a). Read-only everywhere."""
    if os.path.isdir(snap):
        shutil.rmtree(snap)
    for d in ("github", "files", "files_main/qa", "git/capabilities_main", "enforcement"):
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
    meta = {"taken_at": taken, "repo": gh.repo, "main_sha": msha, "records_branch": branch, "records_sha": rsha,
            "main_at": ((main_c.get("commit") or {}).get("committer") or {}).get("date")}   # Stuck now (A134): the last merge to main
    # records files at records_sha (files/<repo path>)
    for rel in SNAP_FILES:
        t = (private_state(True) if rel == "STATE.md" else None) or git_out("show", f"{rsha}:{REL}/{rel}")   # PS-1b: private copy first
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
    # board v63 (P-615): RULES.md commits on the records sha in the 8 days before taken_at (git/rules_log.jsonl: sha, date)
    rl = (git_out("log", "--format=%H %cI", f"--since={(NOW - timedelta(days=8)).strftime('%Y-%m-%dT%H:%M:%SZ')}", rsha, "--",
                  f"{REL}/RULES.md") or "").splitlines()
    wt("git/rules_log.jsonl", "".join(json.dumps({"sha": x.split()[0], "date": x.split()[1]}) + "\n" for x in rl if x.strip()))
    # extra (not in the shared layout; read only by cockpit-data.py): records lag for the strip and Health item 3
    main_local = msha if sh(["git", "-C", ROOT, "cat-file", "-e", msha + "^{commit}"]).returncode == 0 else None
    main_ref = main_local or (git_out("rev-parse", "origin/main") or "").strip() or None
    st = private_state(True) or git_out("show", f"{rsha}:{REL}/STATE.md") or ""
    m = re.search(r"this branch: `([^`]+)`", st)
    state_branch = m.group(1) if m else None
    sref = rsha if state_branch == branch else ((git_out("rev-parse", "--verify", "-q", state_branch) or "").strip() or None) if state_branch else None
    n1, o1, _ = records_lag(rsha, main_ref)
    n2, o2, f2 = records_lag(sref, main_ref) if sref != rsha else (n1, o1, records_lag(rsha, main_ref)[2])
    meta["extra"] = {"main_ref_used": main_ref, "main_ref_is_head": bool(main_local), "records_ahead": n1, "records_oldest_unmerged_at": o1,
                     "state_branch": state_branch, "state_branch_sha": sref, "state_branch_ahead": n2, "state_branch_oldest_unmerged_at": o2,
                     "state_branch_files": f2, "records_lag_rule": "files"}
    wj("meta.json", meta)
    # CK-3 (founder A151, A154; checks brief): the set-up check (CK-1) run on main here, and the newest pipeline heartbeat (CK-2)
    wj("enforcement/conformance.json", safe("set-up check", lambda: conformance_read(msha if main_local else main_ref), {"error": "not run"}))
    wj("enforcement/heartbeat.json", safe("pipeline heartbeat", lambda: heartbeat_read(gh), {"error": "not read"}))
    # every PR (state all). Lead 75, 17 Nov (fewer REST calls): the list is kept in the cache. A closed PR changes only with its
    # updated_at, so a run reads the open PRs and the closed PRs updated since the last full read (plus a day), not every page.
    raw = pr_list(gh, cache)
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
        gh.tally["app-code-prs.sh (one per PR)"] = gh.tally.get("app-code-prs.sh (one per PR)", 0) + len(need)
        json.dump(ac, open(ac_path, "w"))
    pulls = [{"number": x["number"], "title": x["title"], "state": x["state"], "draft": bool(x.get("draft")),
              "created_at": x["created_at"], "merged_at": x.get("merged_at"), "closed_at": x.get("closed_at"),
              "labels": [{"name": l["name"]} for l in x.get("labels", [])],
              "head": {"ref": x["head"]["ref"], "sha": x["head"]["sha"]}, "base": {"ref": x["base"]["ref"]},
              "files_app": ac.get(str(x["number"]))} for x in raw]
    wj("github/pulls.json", pulls)
    # check runs on main's head
    cr = gh.get(f"/commits/{msha}/check-runs?per_page=100")
    # CI-PRE (P-731): a PR's full run is a workflow_dispatch run of ci.yml on main's head, so its checks sit on main's
    # commit; they are that PR's verdict, not main's, and never make "main CI" red.
    try:
        full = {str(r["id"]) for r in gh.get(f"/actions/workflows/ci.yml/runs?event=workflow_dispatch&head_sha={msha}&per_page=100").get("workflow_runs", [])}
    except Exception:
        full = set()
    wj("github/main_checks.json", [{"name": c["name"], "status": c["status"], "conclusion": c["conclusion"]} for c in main_checks(cr.get("check_runs", []), full)])
    # guards: label guard workflow on main, and the push guard (ci.yml job "guard") on the newest finished queue run
    gr = []
    # a run cancelled or skipped because a newer event replaced it (the workflow's concurrency group) is not a result: take the
    # newest run that ran to an end (Lead 59, 15 Nov: 29 of the last 30 were "cancelled" and the board read the guard as failed)
    lg = [r for r in gh.get("/actions/workflows/label-guard.yml/runs?branch=main&status=completed&per_page=30").get("workflow_runs", [])
          if r.get("conclusion") not in ("cancelled", "skipped")][:1]
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
    # Flow box (Lead 69, 16 Nov, P-644): how long jobs wait for a test machine. Queued runs now, and each job's wait from
    # created to started (a job still queued counts its wait so far) for the newest CI_SAMPLE_RUNS runs of ci.yml (the test
    # shards; the many quick checks start at once and would hide the wait) created in the last 3 h. Skipped jobs, and jobs held for an approval or another job ("waiting", "pending"), are left out.
    try:
        # B206 part 1 (P-751): only runs created under 6 h ago are waiting for a machine; older ones are stale (runs-waiting.py)
        qd = gh.get("/actions/runs?status=queued&per_page=100")
        old6 = (NOW - timedelta(hours=6)).strftime("%Y-%m-%dT%H:%M:%SZ")
        qr = qd.get("workflow_runs") or []
        stale = [x.get("id") for x in qr if (x.get("created_at") or "9") <= old6]   # exactly 6 h is stale, as runs-waiting.py
        qn = qd.get("total_count", len(qr)) - len(stale)
        ipn = gh.get("/actions/runs?status=in_progress&per_page=1").get("total_count")
        since = (NOW - timedelta(hours=3)).strftime("%Y-%m-%dT%H:%M:%SZ")
        rg = gh.get(f"/actions/workflows/ci.yml/runs?created=%3E%3D{since}&per_page=100")   # the test runs, not the quick checks
        rr = rg.get("workflow_runs", [])
        waits = []
        for x in rr[:CI_SAMPLE_RUNS]:
            for j in gh.get(f"/actions/runs/{x['id']}/jobs?per_page=100").get("jobs", []):
                c, s = parse_iso(j.get("created_at")), parse_iso(j.get("started_at"))
                if not c or j.get("conclusion") == "skipped" or j.get("status") in ("waiting", "pending", "requested"):
                    continue                                 # skipped, or held for an approval or a dependency: not a machine wait
                if j.get("status") == "queued":           # its wait so far, to the moment it was read (not the run's start)
                    waits.append({"min": round(max(0, (datetime.now(timezone.utc) - c).total_seconds()) / 60, 1), "still_queued": True})
                elif s:
                    waits.append({"min": round(max(0, (s - c).total_seconds()) / 60, 1), "still_queued": False})
        wj("github/ci_queue.json", {"taken_at": NOW.strftime("%Y-%m-%dT%H:%M:%SZ"), "queued_runs": qn, "stale_queued_runs": stale, "in_progress_runs": ipn,
                                    "runs_in_3h": rg.get("total_count", len(rr)), "runs_sampled": min(len(rr), CI_SAMPLE_RUNS), "job_waits": waits})
    except Exception as e:                                   # offline or the API failed: the box says not measured
        wj("github/ci_queue.json", {"error": str(e)[:200]})
    # branches with a push in the last 24 h (GitHub keeps no push time per branch: the head commit's committed date stands in)
    o, r_ = (gh.repo or "/").split("/")
    # every branch is read (GitHub's ref ordering by commit date proved unreliable for branches: 14 Nov, today's lane branches missing)
    qb = """query($o:String!,$r:String!,$c:String){repository(owner:$o,name:$r){refs(refPrefix:"refs/heads/",first:100,after:$c){
      pageInfo{hasNextPage endCursor} nodes{name target{... on Commit{oid committedDate}}}}}}"""
    day_ago = NOW - timedelta(hours=24)
    try:
        refs, cur = [], None
        for _ in range(40):
            got = gh.graphql(qb, {"o": o, "r": r_, "c": cur})["repository"]["refs"]
            refs += got["nodes"]
            if not got["pageInfo"]["hasNextPage"]:
                break
            cur = got["pageInfo"]["endCursor"]
        recent = [{"name": x["name"], "sha": x["target"]["oid"], "pushed_at": x["target"]["committedDate"]}
                  for x in refs if x.get("target") and parse_iso(x["target"]["committedDate"]) >= day_ago]
    except RuntimeError as e:
        # REST fallback (cloud sessions refuse GraphQL): the repository's push activity of the last day, newest push per branch,
        # kept when the branch still exists (a branch's first push is "branch_creation"). Push time here is the real push time,
        # not the head commit's committed date.
        ERRORS.append(f"branches: GraphQL refused ({str(e)[:80]}); REST push activity used (push time = the push itself)")
        recent = branches_from_activity(gh.get_pages("/activity?time_period=day&per_page=100"),
                                        {b["name"] for b in gh.get_pages("/branches?per_page=100")}, day_ago)
    wj("github/branches_recent.json", recent)
    # extra: open PRs' head commit time, CI rollup and the time `review: approved` was put on (§2 waits)
    qo = """query($o:String!,$r:String!){repository(owner:$o,name:$r){pullRequests(states:OPEN,first:100){nodes{number
      commits(last:1){nodes{commit{committedDate statusCheckRollup{state}}}}
      timelineItems(itemTypes:[LABELED_EVENT],last:30){nodes{... on LabeledEvent{createdAt label{name}}}}}}}}"""
    od = []
    try:
        nodes = gh.graphql(qo, {"o": o, "r": r_})["repository"]["pullRequests"]["nodes"]
    except RuntimeError as e:
        nodes = None
        ERRORS.append(f"open PR detail: GraphQL refused ({str(e)[:80]}); REST used (CI state rebuilt from check runs and statuses)")
    if nodes is not None:
        for x in nodes:
            cm = ((x["commits"]["nodes"] or [{}])[0]).get("commit") or {}
            lab = [e["createdAt"] for e in x["timelineItems"]["nodes"] if e and (e.get("label") or {}).get("name") == "review: approved"]
            od.append({"number": x["number"], "head_committed_at": cm.get("committedDate"),
                       "ci": ((cm.get("statusCheckRollup") or {}).get("state") or "NONE").lower(), "approved_labelled_at": lab[-1] if lab else None})
    else:
        for x in [p for p in raw if p["state"] == "open"]:
            sha = x["head"]["sha"]
            c = gh.get(f"/commits/{sha}")
            runs = gh.get(f"/commits/{sha}/check-runs?per_page=100").get("check_runs", [])
            stt = gh.get(f"/commits/{sha}/status")
            bad = {"failure", "timed_out", "cancelled", "action_required", "startup_failure"}
            if any(r.get("conclusion") in bad for r in runs) or stt.get("state") in ("failure", "error") and stt.get("statuses"):
                ci = "failure"
            elif any(r.get("status") != "completed" for r in runs) or (stt.get("statuses") and stt.get("state") == "pending"):
                ci = "pending"
            elif runs or stt.get("statuses"):
                ci = "success"
            else:
                ci = "none"
            ev = gh.get_pages(f"/issues/{x['number']}/events?per_page=100", max_pages=5)
            lab = [e["created_at"] for e in ev if e.get("event") == "labeled" and (e.get("label") or {}).get("name") == "review: approved"]
            od.append({"number": x["number"], "head_committed_at": c["commit"]["committer"]["date"], "ci": ci,
                       "approved_labelled_at": lab[-1] if lab else None})
    wj("github/open_prs_detail.json", od)
    # Stuck now (founder 23:3x IST 16 Nov via Lead 70): open PRs labelled `review: approved`, with when the label went on
    # (the newest such "labeled" event), so the board can name those approved and not merged for over 60 min. Lead 75, 17 Nov:
    # taken from the open-PR GraphQL read above (its label events); the REST events are read only when GraphQL was refused.
    try:
        lab_at = {x["number"]: x["approved_labelled_at"] for x in od}      # GraphQL or REST: od holds every open PR it read
        appr = [p for p in pulls if p.get("state") == "open" and any((l.get("name") == "review: approved") for l in p.get("labels") or [])]
        ap = []
        for p in appr[:STUCK_MAX_PRS]:
            if p["number"] in lab_at:
                at = lab_at[p["number"]]
            else:                                          # not in od (GraphQL reads the first 100 open PRs): REST events
                ev = gh.get_pages(f"/issues/{p['number']}/events?per_page=100", max_pages=5)   # every page: the newest label event
                at = max([e["created_at"] for e in ev if e.get("event") == "labeled" and (e.get("label") or {}).get("name") == "review: approved"], default=None)
            ap.append({"number": p["number"], "title": p.get("title"), "labeled_at": at})
        wj("github/approved_open.json", ap)
        if len(appr) > STUCK_MAX_PRS:
            ERRORS.append(f"Stuck now: more than {STUCK_MAX_PRS} approved PRs open; the oldest beyond {STUCK_MAX_PRS} were not read")
    except Exception as e:
        wj("github/approved_open.json", {"error": str(e)[:200]})
    # board v53 (A69, A70): rules caught in the IST day so far (Health item 4). Read from IST midnight; a file is absent when
    # its read failed, so the number reads not measured.
    d0 = datetime.combine(NOW.astimezone(IST).date(), datetime.min.time(), IST).astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    def read_comments():
        out, pg = [], 1
        while pg <= 30:
            got = gh.get(f"/issues/comments?since={d0}&sort=created&direction=asc&per_page=100&page={pg}")
            out += [{"id": c["id"], "pr": int(c["issue_url"].rsplit("/", 1)[1]), "created_at": c["created_at"],
                     "bot": (c.get("user") or {}).get("type") == "Bot", "head": (c.get("body") or "")[:60]} for c in got]
            if len(got) < 100:
                return out
            pg += 1
        raise RuntimeError("more than 3,000 comments since IST midnight")
    cm_today = safe("PR comments today", read_comments)
    if cm_today is not None:
        wj("github/issue_comments_today.json", {"from": d0, "comments": cm_today})

    def read_failed_ci():
        runs, pg = [], 1
        while pg <= 10:
            got = gh.get(f"/actions/workflows/ci.yml/runs?created=%3E%3D{d0}&status=failure&per_page=100&page={pg}").get("workflow_runs", [])
            runs += got
            if len(got) < 100:
                break
            pg += 1
        out = []
        for x in runs:
            att = x.get("run_attempt") or 1
            f = os.path.join(cache, f"ci-failed-{x['id']}-{att}.json")
            if os.path.exists(f):
                steps = json.load(open(f))
            else:
                jobs = gh.get(f"/actions/runs/{x['id']}/attempts/{att}/jobs?per_page=100").get("jobs", [])
                steps = [{"job": j["name"], "step": s["name"]} for j in jobs for s in (j.get("steps") or []) if s.get("conclusion") == "failure"]
                json.dump(steps, open(f, "w"))
            out.append({"id": x["id"], "attempt": att, "created_at": x["created_at"], "head_branch": x.get("head_branch"),
                        "prs": [p["number"] for p in x.get("pull_requests") or []], "failed_steps": steps})
        return out
    ci_today = safe("failed CI runs today", read_failed_ci)
    if ci_today is not None:
        wj("github/ci_failed_runs_today.json", {"from": d0, "workflow": "ci.yml", "runs": ci_today})
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
    # qa/BUGS.md on main (16 Nov): the qa lane records bugs on main; the Lead's records copy can be days old (its BUGS.md was
    # last touched 10 Nov and still listed QA-383 and QA-162, closed on main), so Health item 6 reads main's, as Quality does
    bugs_main = safe("qa/BUGS.md on main", lambda: gh.get(f"/contents/{REL}/qa/BUGS.md?ref={msha}", raw=True))
    if bugs_main is not None:
        wt("files_main/qa/BUGS.md", bugs_main)
    # first main commit adding each open Critical/Major bug (git log -S on the table cell, so QA-44 never matches QA-449)
    bugs = parse_bugs(bugs_main if bugs_main is not None else (git_out("show", f"{rsha}:{REL}/qa/BUGS.md") or ""))
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


def needs_lines(ny):
    """16 Nov (founder on a phone saw a count and nothing behind it): one line per Needs you item, id, what and by when."""
    return [f"{i['id']}: {i['line']}" + (f" — by {i['by']}" if i.get("by") else "") for i in (ny or {}).get("items") or []]


def built_lines(d):
    """Release 1 rows built (newest first) with their names, then one line for the rest."""
    names = {r["map"]: r["cap"] for r in (d.get("capability_table") or {}).get("rows") or []}
    rows = d.get("build_rows") or []
    b = sorted([r for r in rows if r.get("built")], key=lambda r: (r["built"], r["map"]), reverse=True)
    out = [f"{r['map']}. {names.get(r['map'], '')} — built {r['built']}" for r in b]
    if len(rows) > len(b):
        out.append(f"{len(rows) - len(b)} rows not built yet: the Capabilities tab lists each")
    return out


def poc_lines(d):
    """Proof-of-concept capabilities not yet at Works: the gap behind 'n of m'."""
    q = val_of((d.get("capabilities") or {}).get("qa")) or []
    return [f"not yet Works: {c['id']} ({c.get('m') or ''}) {c.get('status') or ''} — {c.get('name') or ''}"
            for c in q if str(c.get("id", "")).startswith("C") and c.get("status") != "Works"]


def works_today_lines(d, W):
    names = {r["map"]: r["cap"] for r in (d.get("capability_table") or {}).get("rows") or []}
    return [f"{m}. {names.get(m, '')}" for m in W.get("maps") or []]


def val_of(x):
    return x.get("value", x.get("v")) if isinstance(x, dict) else x


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
# Owner "lead-b": Lead B's PF and FO rows; "tech": the current tech Lead (STATE current_lead:), who holds the release. BACKLOG's
# "The release holder's rows" lines (AUD-*, AS-1*, AS-2d*, AS-2e, CS-…) are the tech Lead's whatever their section.
COMPONENTS = [
    {"id": "platform", "name": "Platform", "owner": "lead-b",
     "job": "Platform rows (PF): sign-in, firms, billing, messages, automation, portal login, complaints, running the service"},
    {"id": "front_office", "name": "Front office", "owner": "lead-b",
     "job": "Front-office rows (FO, AS): leads, booking, retainers, signing, compliance checks, the client copy"},
    {"id": "client_money", "name": "Client money", "owner": "lead-b",
     "job": "Client-money rows (FO-7*): invoices, card payments, the trust ledger"},
    {"id": "case_side", "name": "Case side", "owner": "tech",
     "job": "Case-side rows (CS, BK and the proof's rows): cases, documents, forms, the configurator"},
    {"id": "audit", "name": "Audit", "owner": "tech",
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
COMP_PREFIX = [("FO-7", "client_money"), ("FO-", "front_office"), ("AS-2c", "front_office"), ("AS-", "case_side"), ("PF-", "platform"), ("DB-", "platform"),
               ("CS-", "case_side"), ("BK-", "case_side"), ("M3-", "case_side"), ("B5-", "case_side"), ("UX-", "case_side"),
               ("G-", "case_side"), ("L-", "case_side"), ("AUD-", "audit"), ("Q-", "qa"), ("CI-", "pipeline"), ("TR-", "pipeline"),
               ("Flaky-", "pipeline")]
MODULE_COMP = {"platform": "platform", "front office": "front_office", "client money": "client_money", "case side": "case_side", "audit": "audit",
               "configurator": "case_side"}
AREA_MAPS = re.compile(r"\bmap rows? ((?:\d+(?:\s*(?:,|and)\s*)?)+)", re.I)     # "join and walk (map row 38, 40; P-606)"
LANE_BEHIND_MIN = LANE_WINDOW_MIN                 # a lane falls behind with no push (or idle) for 90 min, or when blocked
ESCALATION_STEPS = "lane → its Lead → the tech Lead → the founder only for money, a lower bar or a day or more"


def comp_name(text):
    """A component given in Lead input, by id or by name (any case); None when unknown."""
    t = (text or "").strip().lower().replace("-", " ").replace("_", " ")
    return next((c["id"] for c in COMPONENTS if t in (c["id"].replace("_", " "), c["name"].lower())), None)


def component_of(row, role=None, given=None, rows=None, bl_lines=None):
    """(component id, how): Lead input `component` → role (qa, desk) → the first row id with a known prefix → the Module of
    a Build row citing the id, or of the map row its BACKLOG Area cell names ("map row 24") → the words "pipeline"/"CI" or
    "qa"/"retest" in the row text → None ("not mapped")."""
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
    def mod_of(r):
        return MODULE_COMP.get(re.sub(r"\s*\(.*?\)", "", r["module"].split("+")[0]).strip().lower())
    for rid in ids:
        for r in rows or []:
            if rid in r["ids"] and mod_of(r):
                return mod_of(r), f"Module of map row {r['map']}"
    for rid in ids:
        line = (bl_lines or {}).get(rid)
        area = cells(line)[2] if line and len(cells(line)) > 2 else ""
        m = AREA_MAPS.search(area)
        for n in (re.findall(r"\d+", m.group(1)) if m else []):
            r = next((x for x in rows or [] if x["map"] == int(n)), None)
            if r and mod_of(r):
                return mod_of(r), f"Module of map row {n} (BACKLOG Area cell)"
    low = (row or "").lower()
    if re.search(r"\bpipeline\b|\bci\b", low):
        return "pipeline", "row text"
    if re.search(r"\bqa\b|\bretests?\b", low):
        return "qa", "row text"
    return None, "not mapped"


def release_holder_ids(bl_text):
    """Row ids BACKLOG names on its "The release holder's rows" lines: the tech Lead's, whatever their section."""
    out = set()
    for line in (bl_text or "").splitlines():
        if re.search(r"release holder's rows", line, re.I) and not line.startswith("| "):
            out.update(cell_ids(line))
    return out


def org_components(org, sessions, rows, open_prs, taken, cur_lead, rsha, bl_lines=None, rh_ids=None):
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
        cid, how = component_of(row, ln.get("role"), s.get("component"), rows, bl_lines)
        ln["component"], ln["component_how"] = cid, how
        ln["kind"] = s.get("kind")
        ln["idle_min"] = s.get("idle_min")
        pa = parse_iso(ln["pushed_at"]) if ln.get("pushed_at") else None
        ln["last_push_at"] = pa.astimezone(IST).isoformat(timespec="minutes") if pa else None
        ln["push_reason"] = None if pa else ("no lane branch pushed in 24 h matched this lane" if ln["seen"] == "reported only" else "no push time read")
        raw_min = (t0 - pa).total_seconds() / 60 if pa and t0 else None
        ids = cell_ids(row or "")
        ln["maps"] = [{"map": r["map"], "cap": r["cap"]} for r in rows if set(ids) & set(r["ids"])]
        why = None
        if (ln.get("state") or "").lower() == "blocked":
            why = "blocked (Lead input)"
        elif raw_min is not None and raw_min > LANE_BEHIND_MIN:
            why = f"no push for {ln['push_h']} h (GitHub)"
        elif raw_min is None and ln.get("idle_min") is not None and ln["idle_min"] > LANE_BEHIND_MIN:
            why = f"idle {ln['idle_min']} min (Lead input)"
        ln["behind"] = why
        given_owner = s.get("owner")
        comp = COMP_BY_ID.get(cid)
        rh = bool(set(ids) & (rh_ids or set()))
        ln["owner"] = given_owner or (tech["name"] if rh else None if not comp else (lead_b or {}).get("name") if comp["owner"] == "lead-b" else tech["name"])
        ln["owner_how"] = "Lead input owner" if given_owner else "BACKLOG: the release holder's row" if rh else "component's owner" if comp else "not mapped"
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
    legend = {}
    for pre, cid in COMP_PREFIX:
        legend.setdefault(COMP_BY_ID[cid]["name"], []).append(pre.rstrip("-"))
    return {"items": comps, "unmapped": unmapped, "escalation_rule": ESCALATION_STEPS,
            "behind_rule": f"blocked, or no push (or, with no push read, idle) for {LANE_BEHIND_MIN} min",
            "prefix_legend": "; ".join(f"{k}: {', '.join(v)}" for k, v in legend.items()),
            "standbys": org.get("standbys") or [], "tech_lead": tech["name"], "lead_b": (lead_b or {}).get("name"),
            "src": "Lead input sessions (component, owner, row, pr; reported) + branches and open PRs (measured); component by row prefix "
                   "when not given (FORMULAS.md › Team by component)", "class": "reported + measured", "as_of": taken, "sha": rsha}


WN_REL = "cockpit/whats-new.json"
WN_ADOPT = ("yes", "later", "no")
WN_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
WN_WEEK = re.compile(r"^\d{4}-W\d{2}$")


def whats_new(text, now, L):
    """G-5 (P-611): the weekly "what's new" check from cockpit/whats-new.json at the records sha. Checked = the file's week is
    this ISO week (IST) and checked_at falls in it. Unchecked: amber from Monday 12:00 IST, red from Tuesday 12:00 IST, grey
    before. A missing or unreadable file reads "not checked", never 0 (FORMULAS.md › What's new this week)."""
    t = now.astimezone(IST)
    y, w, _ = t.isocalendar()
    week = f"{y}-W{w:02d}"
    mon = t.date() - timedelta(days=t.weekday())
    amber_at = datetime(mon.year, mon.month, mon.day, 12, tzinfo=IST)
    red_at = amber_at + timedelta(days=1)
    src = f"{WN_REL} at the records commit (written each Monday by the Lead or a read-only watcher)"
    out = {"week": week, "file_week": None, "state": "missing", "checked": False, "checked_at": None, "checked_by": None,
           "installed_version": None, "newest_version": None, "items": [], "actions": [], "problems": [],
           "amber_at": amber_at.isoformat(timespec="seconds"), "red_at": red_at.isoformat(timespec="seconds"), "src": src}
    f = None
    if text is not None:
        try:
            f = json.loads(text)
        except ValueError as e:
            out["problems"].append(f"not JSON: {e}")
        if f is not None and not isinstance(f, dict):
            out["problems"].append("not a JSON object")
            f = None
    if f is not None:
        out["state"] = "unchecked"
        fw, ca = f.get("week"), f.get("checked_at")
        out.update(file_week=fw, checked_at=ca, checked_by=f.get("checked_by"),
                   installed_version=f.get("installed_version"), newest_version=f.get("newest_version"),
                   coverage=f.get("coverage") if isinstance(f.get("coverage"), str) else None)
        if not isinstance(fw, str) or not WN_WEEK.match(fw):
            out["problems"].append(f"week {fw!r} is not YYYY-Www")
        try:
            ct = parse_iso(ca) if isinstance(ca, str) else None
        except ValueError:
            ct = None
        ct = ct.astimezone(IST) if ct and ct.tzinfo else None
        if ct is None:
            out["problems"].append(f"checked_at {ca!r} is not an ISO time with an offset")
        if ct and isinstance(fw, str):
            cy, cw, _ = ct.isocalendar()
            if f"{cy}-W{cw:02d}" != fw:
                out["problems"].append(f"checked_at {ca} is not in week {fw}")
        if not (isinstance(f.get("checked_by"), str) and f["checked_by"].strip()):
            out["problems"].append("checked_by is empty")
        for i, it in enumerate(f.get("new_items") if isinstance(f.get("new_items"), list) else []):
            it = it if isinstance(it, dict) else {}
            bad = [k for k in ("title", "why") if not (isinstance(it.get(k), str) and it[k].strip())]
            bad += [] if isinstance(it.get("date"), str) and WN_DATE.match(it["date"]) else ["date"]
            bad += [] if isinstance(it.get("source"), str) and it["source"].startswith("https://") else ["source"]
            bad += [] if it.get("adopt") in WN_ADOPT else ["adopt"]
            if bad:
                out["problems"].append(f"new_items[{i}] left out: {', '.join(bad)} missing or wrong")
            else:
                out["items"].append({k: it[k] for k in ("title", "date", "source", "adopt", "why")})
        if not isinstance(f.get("new_items"), list):
            out["problems"].append("new_items is not a list")
        acts = f.get("actions") if isinstance(f.get("actions"), list) else []
        for i, a in enumerate(acts):
            if isinstance(a, dict) and all(isinstance(a.get(k), str) and a[k].strip() for k in ("what", "owner", "row")):
                out["actions"].append({k: a[k] for k in ("what", "owner", "row")})
            else:
                out["problems"].append(f"actions[{i}] left out: what, owner and row are each needed")
        if len(acts) > 3:
            out["problems"].append(f"{len(acts)} actions (the checklist allows three)")
        if fw == week and ct and ct <= t and not out["problems"]:
            out.update(state="checked", checked=True)
    elif text is not None:
        out["state"] = "invalid"
    n = sum(1 for x in out["items"] if x["adopt"] == "yes")
    why_not = {"missing": f"not checked: {WN_REL} is missing at the records commit",
               "invalid": f"not checked: {WN_REL} could not be read ({'; '.join(out['problems'])})",
               "unchecked": f"not checked this week ({week}): " + ("checked_at is after the snapshot time" if out["file_week"] == week
                                                                   and not out["problems"] else f"the file is for {out['file_week']}") +
                            (f"; {'; '.join(out['problems'])}" if out["problems"] else "")}
    out["adopt_yes"] = num(n if out["checked"] else None, src + ": new_items with adopt yes", "parsed", L, why_not.get(out["state"]))
    if out["checked"]:
        out["light"] = {"state": "green", "why": f"checked {ist(parse_iso(out['checked_at']))} by {out['checked_by']}"}
    else:
        st = "red" if t >= red_at else "amber" if t >= amber_at else "grey"
        out["light"] = {"state": st, "why": why_not[out["state"]] + {"red": "; past Tuesday 12:00 IST", "amber": "; past Monday 12:00 IST",
                                                                       "grey": "; due by Monday 12:00 IST"}[st]}
    return out


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
    # P-636 (16 Nov): Proven = qa's verdict in qa/CAPABILITIES.md on main only; R1.n is checklist map row n
    r1_qa = {int(k.split(".")[1]): v["status"] for k, v in caps_main.items() if re.fullmatch(r"R1\.\d+", k)}
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
    change_at, unclassified, change_pr, nonapp_pr = {}, set(), {}, {}
    app_prs, bl_named = {}, backlog_parts(bl_text)
    for k, v in backlog_parts(ck_text).items():          # Lead 66 (16 Nov): the parts a checklist row lists count too
        bl_named.setdefault(k, set()).update(v)
    for p in sorted(merged, key=lambda p: p["merged_at"]):
        if is_records(p):
            continue
        for rid in r1:
            if title_has(p["title"], rid):
                if p.get("files_app") is True:
                    app_prs.setdefault(rid, []).append((p["merged_at"], p["number"], title_part(p["title"], rid)))
                elif p.get("files_app") is False:
                    nonapp_pr.setdefault(rid, p["number"])
                elif p.get("files_app") is None:
                    unclassified.add(rid)
    open_parts = {}
    for rid, prs in app_prs.items():
        if rid in unclassified:              # a part's app-code check is missing: reported as such, not as an open part
            continue
        w, op = merged_when(prs, bl_named.get(rid, ()))
        if w:
            change_at[rid], change_pr[rid] = w
        else:
            open_parts[rid] = op
    if open_parts:
        notes.append("Not merged yet, a later part still open (P-639): " + ", ".join(f"{k} part {', '.join(v)}" for k, v in sorted(open_parts.items())))
    unclassified -= set(change_at) | set(open_parts)
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
    rem_shaped = sum(1 for x in shaped_ids if x not in change_at and x in bl["ids"])   # R4: an id BACKLOG lacks is an invariant failure, not scope
    rem_unshaped = sum(max(0, UNSHAPED_FACTOR - sum(1 for x in r["ids"] if x in change_at)) for r in unshaped)
    remaining = rem_shaped + rem_unshaped
    R = num(remaining, f"unmerged ids of shaped capabilities ({rem_shaped}) + {UNSHAPED_FACTOR} × each capability not shaped, "
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
            r["built_at"] = max(change_at[x] for x in r["ids"])
    built_rows = [r for r in rows if r["built"]]
    pre = [r["map"] for r in rows if r.get("pre_baseline")]
    B = num(len(built_rows), f"shaped capabilities whose BACKLOG parts all merged through app PRs (built date = the latest part's merge date); "
            f"{ck_src}, {gh_src}", "mixed", L,
            built_before=num(len(pre), "capabilities with no BACKLOG part that the checklist marks Merged or qa Works (built in the proof of concept, "
                             "before 13 Nov; no date)", "parsed", L, maps=pre))
    hist_caps = snap.cap_history()
    qa_tested_at, prev_line = {}, {}
    for h in hist_caps:                                   # oldest first
        for line in (h.get("text") or "").splitlines():
            m = re.match(r"^\|\s*\**R1\.(\d+)\**\s*\|", line)
            if m:
                n = int(m.group(1))
                if prev_line.get(n) != line:
                    qa_tested_at[n], prev_line[n] = h["date"], line
    # Flow box (P-644): when each R1 row's current run of Works began on main (versions that do not list the row are
    # skipped). A row that read Works in every version listing it (the table grew to 101 rows with rows proven in M2/M3)
    # was not proven on any of those days: no date.
    r1_works_since, r1_seen_other = {}, set()
    for h in hist_caps:
        for k, v in parse_caps(h.get("text") or "").items():
            if not re.fullmatch(r"R1\.\d+", k):
                continue
            n = int(k.split(".")[1])
            if QA_WORKS.match(v.get("status") or ""):
                if n in r1_seen_other and n not in r1_works_since:
                    r1_works_since[n] = h["date"]
            else:
                r1_seen_other.add(n)
                r1_works_since.pop(n, None)
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
    # board v63: each difference carries its cause; two kinds follow from a rule and are listed apart (status_explained),
    # not as "records differ": a part merged only by a PR with no app code (N2 counts app-code PRs), and a cell that
    # names an open item beside merged parts ("model choice open"). The rest is the hand-kept status behind or ahead.
    disagree, explained = [], []
    for r in rows:
        if bool(r["built"]) == (r["status"] in ("Merged", "qa Works")) or r.get("pre_baseline"):
            continue
        d_ = {"map": r["map"], "checklist": r["status"], "computed": "built" if r["built"] else "not built"}
        open_items = [clean(x) for x in r["cell"].split(";") if not cell_ids(x) and not CAP_ID.search(x) and re.search(r"\bopen\b", x, re.I)]
        unbuilt = [x for x in r["ids"] if x not in change_at]
        if r["built"] and open_items:
            explained.append(dict(d_, kind="open item", cause=f"all parts merged; the cell names an open item: {open_items[0]}"))
        elif not r["built"] and unbuilt and all(x in nonapp_pr for x in unbuilt):
            explained.append(dict(d_, kind="no app code", cause="merged only by a PR that changes no app code (" + ", ".join(
                f"{x} #{nonapp_pr[x]}" for x in unbuilt) + "); built counts app-code PRs (N2)"))
        elif r["built"]:
            disagree.append(dict(d_, kind="checklist behind", cause="every part merged by an app-code PR (" + ", ".join(
                f"{x} #{change_pr[x]}" for x in r["ids"]) + f", last on {r['built']}); the checklist status is not updated"))
        else:
            disagree.append(dict(d_, kind="checklist ahead", cause="not merged by an app-code PR: " + ", ".join(unbuilt)))

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
    D_ch = num(len(ch_span), f"Release 1 changes whose app-code merge (for an id in parts, its last needed part, P-639) falls between {span_txt} (the same changes as the pace line); "
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
    D_wk = num(None if wr is None else len(wr), f"capabilities that reached qa Works (checklist Status reads qa Works, or proven) between {span_txt}; "
               f"{ck_src} and its earlier versions", "mixed", L, hist_reason, maps=wr or [])
    wd = reached(d_start, d_end)
    D_done = num(None if wd is None else len(wd), f"capabilities that reached qa Works (Status reads qa Works, or proven) in the 24 h to taken_at; {ck_src} "
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
    rn_src = (f"capabilities not yet at qa Works (checklist Status reads qa Works, or proven) ÷ calendar days to the committed date {committed}; "
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
                "pct_per_works_row": per(D_wk["value"], "capabilities that reached qa Works", "no Works yet"),
                "rows_done_per_day": D_done, "rows_needed_per_day": RN}

    # ---- board v53 (A69, A70): size and requirements per capability; capabilities at qa Works in the IST day so far
    for r in rows:
        r["size"] = cap_size(r)
        req = []
        for x in r["ids"]:
            for s_ in source_ids(bl["deps"].get(x)):
                if s_ not in req:
                    req.append(s_)
        r["req"] = req
    size_keys = ("S", "M", "L", "not shaped")
    by_size_all = {k: sum(1 for r in rows if r["size"] == k) for k in size_keys}
    not_mapped = [r["map"] for r in rows if not r["req"]]
    day_start = datetime.combine(today, datetime.min.time(), IST)
    # the day is [00:00 IST, taken_at]: the status "before the day" is the newest checklist commit before 00:00 IST
    wt_maps = reached(day_start - timedelta(microseconds=1), cutoff)
    size_of = {r["map"]: r["size"] for r in rows}
    wt_by = None if wt_maps is None else {k: sum(1 for m in wt_maps if size_of.get(m) == k) for k in size_keys}
    cap_word = lambda n: "capability" if n == 1 else "capabilities"
    W_today = num(None if wt_maps is None else len(wt_maps),
                  f"capabilities (MVP-CHECKLIST §A) at qa Works now and not at 00:00 IST {today.isoformat()} (Status reads qa Works, or proven); "
                  f"{ck_src} and its earlier versions", "mixed", L, hist_reason, maps=wt_maps or [], by_size=wt_by,
                  target=TARGET_WORKS_PER_DAY, target_src="founder A68 and A69 (15 Nov): 10 capabilities a day",
                  window={"from": tiso(day_start), "to": tiso(cutoff)},
                  size_rule="distinct backlog row ids in the capability's BACKLOG rows cell: 1 = S, 2-3 = M, 4+ = L; none or Not shaped = not shaped (A70)")
    pw = dict(delivery["pct_per_works_row"])
    if pct_used is not None and span_h >= USAGE_MIN_SPAN_H and D_wk["value"] == 0:
        pw["reason"] = f"no Works yet: {pct_used}% used"
    delivery["pct_per_works_row"] = pw
    cap_table = {
        "rows": [{"map": r["map"], "cap": clean(r["cap"], 90), "group": r["group"], "status": r["status"], "size": r["size"],
                  "backlog_rows": len(set(r["ids"])), "req": r["req"],
                  "req_by_section": {s: [x for x in r["req"] if req_section(x) == s] for s in dict.fromkeys(req_section(x) for x in r["req"])}}
                 for r in rows],
        "by_size": num(by_size_all, f"capabilities by size ({W_today['size_rule']}); {ck_src}", "parsed", L),
        "not_mapped": num(len(not_mapped), f"capabilities none of whose backlog rows carries a Source: id; {ck_src}, {bl_src}", "parsed", L,
                          maps=not_mapped),
        "source_rule": "the ids in each backlog row's Source: field (P-595), bracketed text left out; the union over the capability's rows, "
                       "grouped by section (the id without its last dash part)"}

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
                   f"Release 1 changes (BACKLOG parts) whose app-code merge (for an id in parts, its last needed part, P-639) fell on the IST day {lf_txt or 'not over yet'}; {gh_src}; {ck_src}",
                   "mixed", L, "not measured: no full IST day since 13 Nov yet", day=last_full.isoformat() if last_full else None,
                   today_so_far=per_day.get(today, 0), series=series)
    built_on = lambda d: sum(1 for r in built_rows if r["built"] == d.isoformat())
    LD_caps = num(len(built_rows), f"Build rows whose BACKLOG parts all merged (cumulative, from 13 Nov to the snapshot); {ck_src}; {gh_src}",
                  "mixed", L, day=last_full.isoformat() if last_full else None, new_on_day=built_on(last_full) if last_full else None,
                  today_so_far=built_on(today), rows_total=nrows, series=[{"day": d.isoformat(), "count": built_on(d)} for d in win])
    # first verdict per qa capability: the first main version of qa/CAPABILITIES.md where it reads Works, Partial or Broken, after
    # an earlier version where it did not (or was absent); a capability already with a verdict in the oldest version is left out.
    # Two shares, never mixed (Lead 64, 16 Nov): the proof-of-concept C capabilities, and the Release 1 R capabilities beside it.
    verdict = lambda st: st.startswith(("Works", "Partial", "Broken"))

    def first_verdict_share(prefix, what, one):
        first_v, seen = {}, {}
        for i, hh in enumerate(hist_caps):
            for cid, cv in parse_caps(hh["text"]).items():
                if not cid.startswith(prefix):
                    continue
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
        fv_src = (f"{what} whose first verdict on main fell from 13 Nov to the snapshot: Works at the first verdict ÷ all first verdicts "
                  f"({len(hist_caps)} versions of qa/CAPABILITIES.md on main, last 30 days)")
        fl = [x for x in fv.values() if last_full and x[0] == last_full]
        return num(round(100 * fv_w / fv_n) if fv_n else None, fv_src, "measured", L,
                   f"not measured: no {one} got its first verdict on main since 13 Nov in the history read",
                   works=fv_w, n=fv_n, ids=sorted(fv), day=last_full.isoformat() if last_full else None,
                   day_works=sum(1 for x in fl if x[1]), day_n=len(fl))
    LD_fv = first_verdict_share("C", "qa capabilities", "qa capability")
    LD_fv_r1 = first_verdict_share("R", "qa Release 1 capabilities (R ids)", "qa Release 1 capability")
    leading = {"parts_merged": LD_parts, "caps_all_parts": LD_caps, "first_verdict_works_pct": LD_fv,
               "first_verdict_works_pct_r1": LD_fv_r1}

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
             f"(lead/*, lead-b-*); {gh_src} branches_recent.json (push time = head commit time, or the push itself under the REST fallback)", "measured", L, names=[b["name"] for b in lanes],
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
        deps, non = row_deps(line, bl["lines"])
        deps = [x for x in deps if x != rid]
        wait = [x for x in deps if x not in merged_any]
        if non or wait:
            not_ready.append({"id": rid, "waits_on": wait, "non_id": non})
        else:
            q_rows.append(rid)
    Q = num(len(q_rows), "R3: BACKLOG rows with a brief (exact id), not merged, no open PR, every dependency id merged and no non-id dependency; "
            f"briefs.json, {bl_src}, {gh_src}", "mixed", L, rows=q_rows, not_ready=not_ready, n=sum(1 for b in briefs if b in bl["lines"]))
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
    timed = {"review": sum(1 for x in rw if x is not None), "merge": sum(1 for x in mw if x is not None), "qa": None if qa_unknown else len(built_wait)}
    stages = {k: {"count": num(n, {"review": "open non-draft PRs, CI green, no `review: approved` (Ready for label)",
                                   "merge": "open PRs labelled `review: approved`",
                                   "qa": "built capabilities not yet proven"}[k] + f"; {gh_src}", "measured" if k != "qa" else "mixed", L),
                  "wait_h": num(round(wv, 1) if wv is not None else None,
                                {"review": "oldest: hours since the head commit", "merge": "oldest: hours since the label went on",
                                 "qa": "oldest: hours since the row was built"}[k], "measured" if k != "qa" else "mixed", L,
                                "not measured: qa wait needs the checklist's qa id column" if k == "qa" and qa_unknown else "nothing waiting", n=timed[k]),
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
            measured[b["name"]] = {"branch": b["name"], "pr": prn, "push_h": round(hrs(b["pushed_at"]), 1), "pushed_at": b["pushed_at"]}
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
                          "push_h": (hit or {}).get("push_h"), "pushed_at": (hit or {}).get("pushed_at"), "seen": "both" if hit else "reported only", "branch": br_})
    for k, m in measured.items():
        if k not in used:
            lanes_out.append({"name": k, "role": "unknown", "row": None, "pr": m["pr"], "reports_to": None, "reports_key": None, "state": None,
                              "push_h": m["push_h"], "pushed_at": m["pushed_at"], "seen": "measured only"})
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
    org["components"] = org_components(org, sessions, rows, open_prs, taken, cur_lead, rsha, bl["lines"], release_holder_ids(bl_text))

    # ---- board v53 (A69, A70): lanes working against started. Working = Lw (measured, 90 min); started = the Lead input's
    # builder and qa sessions not done (reported); idle = started lanes whose branch (as matched for the org chart) has no push in
    # 90 min. Lead input older than 2 h, or none: started and idle not measured.
    li_age_h = hrs(li["as_of"]) if li and li.get("as_of") else None
    work_names = {b["name"] for b in lanes}
    started = [x for x in lanes_out if x["seen"] != "measured only"]
    lanes_src = "Lead input sessions with role builder or qa, state not done"
    if not li:
        st_reason = "not measured: no Lead input"
    elif li_age_h is None or li_age_h > 2:
        st_reason = f"not measured: Lead input {'has no as_of' if li_age_h is None else f'{round(li_age_h, 1)} h old (limit 2 h)'}"
    else:
        st_reason = None
    idle_l = [x for x in started if x.get("branch") not in work_names]
    lanes_top = {
        "working": Lw,
        "started": num(None if st_reason else len(started), lanes_src, "reported", L, st_reason, names=[x["name"] for x in started]),
        "idle": num(None if st_reason else len(idle_l), f"started lanes ({lanes_src}) whose branch (its branch, its PR's head, or the one open PR "
                    f"naming its row) has no push in the last {LANE_WINDOW_MIN} min ({gh_src})", "reported", L, st_reason,
                    names=[x["name"] + ("" if x.get("branch") else " (no branch found)") for x in idle_l]),
    }

    # ---- board v53 (A70): rules caught in the IST day so far; shown only inside Health item 4 (rules stay internal)
    d_lo, d_hi = day_start, cutoff
    in_day = lambda iso: iso is not None and d_lo <= parse_iso(iso) <= d_hi
    cj = snap.j("github/issue_comments_today.json")
    lg = sorted({c["id"]: c for c in (cj or {}).get("comments", []) if (c.get("head") or "").startswith(LABEL_GUARD_HEAD)
                 and c.get("bot") is True and in_day(c["created_at"])}.values(), key=lambda c: c["created_at"])
    lg_n = num(None if cj is None else len(lg), f"PR comments by a bot account (the guard's token) starting \"{LABEL_GUARD_HEAD}\" (a review: approved label removed) "
               f"from 00:00 IST to taken_at; {gh_src} issue_comments_today.json", "measured", L,
               "not measured: the PR comments of today were not read", prs=[c["pr"] for c in lg])
    rj = snap.j("github/ci_failed_runs_today.json")
    def ci_count(rx, what):
        hits = [x for x in (rj or {}).get("runs", []) if in_day(x["created_at"]) and any(rx.search(st["step"]) for st in x["failed_steps"])]
        return num(None if rj is None else len(hits), f"ci.yml runs today whose latest attempt failed with a failed step {what}; "
                   f"{gh_src} ci_failed_runs_today.json", "measured", L, "not measured: today's failed CI runs were not read",
                   runs=[{"run": x["id"], "prs": x["prs"], "branch": x["head_branch"]} for x in hits])
    ci_n = ci_count(RULES_STEP, "whose name names check-docs.sh (the notes run's rules-files check)")
    ci_b = ci_count(BUNDLE_STEP, "named \"rules files, …\" (shard 1: check-docs.sh plus 16 other rule and tool checks; any of them failing counts)")

    def li_today(k, what):
        if not li or k not in li:
            return num(None, f"Lead input {k}", "reported", L, f"not reported: Lead input has no {k}")
        if st_reason:
            return num(None, f"Lead input {k}", "reported", L, st_reason.replace("not measured", "not updated"))
        if ist_day(li["as_of"]) != today:
            return num(None, f"Lead input {k}", "reported", L, f"not updated: Lead input is from {ist_day(li['as_of'])}, not today")
        return num(li[k], f"Lead input {k}: {what}", "reported", L)
    rules = {"label_guard_removals": lg_n, "ci_rule_failures": ci_n, "ci_bundle_failures": ci_b,
             "breaches_found": li_today("breaches_found", "rule breaches the Lead found today"),
             "push_guard_refusals": li_today("push_guard_refusals", "push-guard refusals the Lead knows of today (the guard's refusals reach no shared record)"),
             "records_check": "no CI check named records-check exists in .github/workflows; the CI count covers the check-docs.sh steps",
             "window": {"from": tiso(d_lo), "to": tiso(d_hi)}}

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
    inv("Capabilities equal the baseline", nrows == baseline,
        f"{nrows} rows (baseline {baseline})" + ("" if nrows == baseline else ": scope changed, the scope line says so"))
    inv("Capabilities unique", not ck["dupes"], "duplicates: " + ", ".join(f"{d['map']} ({' / '.join(d['statuses'])})" for d in ck["dupes"]) if ck["dupes"] else "no duplicate map numbers")
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
    wn = whats_new(snap.file(WN_REL), now, L)
    inv("whats-new.json well formed (week and checked_at agree; items dated, sourced, adopt yes/later/no; at most 3 actions)",
        wn["state"] == "missing" or not wn["problems"], "; ".join(wn["problems"]) or ("file missing: shown as not checked" if wn["state"] == "missing" else "holds"))
    inv("Cumulative built falls only with a scope or mapping change", mono and (fall is None or fall["explained"]),
        ("built fell from %d (%s) to %d: %s" % (fall["from"], fall["day"], fall["to"], "mapping or scope change line shown" if fall["explained"] else "no scope or mapping change")) if fall else
        "no fall")
    if fall and fall["explained"]:
        notes.append(f"Mapping or scope change: built {fall['from']} on {fall['day']} → {fall['to']} today (the checklist changed)")
    if bl["dupes"]:
        notes.append("Duplicate BACKLOG rows (first kept): " + ", ".join(bl["dupes"]))
    if disagree:
        notes.append("Checklist status and computed built differ on rows " + ", ".join(str(d["map"]) for d in disagree[:20]))
    if explained:
        notes.append("Checklist and computed differ by rule (not counted as records differ): " + "; ".join(f"{d['map']}: {d['kind']}" for d in explained))

    # ---- reconciliation (§6.5-6.6)
    keys = {"works_on_main": w_a, "works_total": t_a, "changes_per_day_window": Y["value"], "remaining_scope_changes": remaining,
            "built_rows": len(built_rows), "proven_rows": P_["value"], "open_app_prs": len(items), "lanes_working": len(lanes),
            "ready_rows": len(q_rows), "forecast_p50_date": mc["p50"], "forecast_p85_date": mc["p85"],
            "mc_daily_counts": counts, "mc_remaining_scope": remaining,
            "plan_pct_used_24h": pct_used, "span_hours": span_h if pct_used is not None else None,
            "changes_merged_span": len(ch_span), "works_rows_span": D_wk["value"],
            "r1_proven_qa": sum(1 for s in r1_qa.values() if re.match(r"Works(?![A-Za-z])", s or "")) if r1_qa else None,
            "pct_per_change": delivery["pct_per_change"]["value"], "pct_per_works_row": delivery["pct_per_works_row"]["value"],
            "rows_done_24h": D_done["value"], "rows_needed_per_day": RN["value"],
            "works_today": W_today["value"], "works_today_by_size": wt_by, "capabilities_not_mapped": len(not_mapped),
            "label_guard_removals_today": lg_n["value"], "ci_rule_failures_today": ci_n["value"], "ci_bundle_failures_today": ci_b["value"]}
    # ---- board v63 (P-613, P-615): parts merged of all Release 1 parts; the founder's behaviour numbers; the Customer box
    parts_m = [x for x in r1 if any(not is_records(p) and title_has(p["title"] or "", x) for p in merged)]
    PM = num(len(parts_m), f"Release 1 parts (distinct BACKLOG ids the checklist section A cites) matched by a merged non-records PR "
             f"title (R1b); {ck_src}; {gh_src}", "mixed", L, total=len(r1), ids=parts_m)
    st_text = snap.file("STATE.md")
    w7 = [today - timedelta(days=i) for i in range(6, -1, -1)]
    if st_text is None:
        FA = num(None, "STATE.md › Founder asks", "parsed", L, "not measured: STATE.md missing from the snapshot")
    else:
        fa_by, fa_und = founder_asks_dated(st_text, today)
        fa = {d: len(v) for d, v in fa_by.items()}
        FA = num(fa.get(today - timedelta(days=1), 0), f"STATE.md › Founder asks @{rsha}: ask ids per day the Ask cell names (a range "
                 f"A49-A67 counts 19); the last full IST day", "parsed", L, day=(today - timedelta(days=1)).isoformat(),
                 today_so_far=fa.get(today, 0), series=day_series(fa, today), undated=len(fa_und),
                 mean_7d=round(sum(fa.get(d, 0) for d in w7[:-1]) / 6, 1))
    rl_text = snap.text("git/rules_log.jsonl")
    if rl_text is None:
        RC = num(None, "git log of RULES.md", "parsed", L, "not measured: the snapshot has no RULES.md git log (git/rules_log.jsonl)")
    else:
        rc = {}
        for ln in rl_text.splitlines():
            if ln.strip():
                d_ = ist_day(json.loads(ln)["date"])
                rc[d_] = rc.get(d_, 0) + 1
        RC = num(rc.get(today - timedelta(days=1), 0), f"commits that change RULES.md on the records branch @{rsha} (git log), "
                 f"per IST day; the last full IST day", "parsed", L, day=(today - timedelta(days=1)).isoformat(),
                 today_so_far=rc.get(today, 0), series=day_series(rc, today), mean_7d=round(sum(rc.get(d, 0) for d in w7[:-1]) / 6, 1))
    dec_text = snap.file("DECISIONS.md")
    if dec_text is None:
        TC = num(None, "DECISIONS.md", "parsed", L, "not measured: DECISIONS.md missing from the snapshot")
    else:
        tcs = [x for x in target_changes(dec_text, today) if x["day"] and w7[0].isoformat() <= x["day"] <= today.isoformat()]
        TC = num(len(tcs), f"DECISIONS.md @{rsha}: rows dated in the 7 IST days ending today whose bold text names a target with a "
                 f"date or a count, not kept or standing", "parsed", L, ids=[x["id"] for x in tcs], items=tcs,
                 window={"from": w7[0].isoformat(), "to": today.isoformat()})
    lc_rows = launch_conditions(ck_text)
    ff = plan.get("first_firm") if isinstance(plan.get("first_firm"), dict) else None
    customer = {
        "first_firm": num({"name": ff.get("name"), "date": ff.get("date")} if ff and ff.get("name") and ff.get("date") else None,
                          "cockpit/plan.json first_firm {name (a role), date}", "parsed", L,
                          "not measured: no record names the first real firm and its date (cockpit/plan.json has no first_firm)"),
        "journey_walked": num(None, "no record of the first firm's journey", "parsed", L,
                              "not measured: no record lists the first firm's journey steps or which were walked"),
        "counsel_open": num(sum(1 for x in lc_rows if x["counsel"] and not x["done"]) if lc_rows else None,
                            f"{ck_src} section C: items naming counsel or the immigration expert, status not Done", "parsed", L,
                            "not measured: the checklist has no section C rows", ids=[x["id"] for x in lc_rows if x["counsel"] and not x["done"]]),
        "launch_done": num(sum(1 for x in lc_rows if x["done"]) if lc_rows else None,
                           f"{ck_src} section C: launch conditions whose status starts with Done", "parsed", L,
                           "not measured: the checklist has no section C rows", total=len(lc_rows),
                           ids=[x["id"] for x in lc_rows if x["done"]])}
    behaviour = {"founder_asks_day": FA, "rules_changes_day": RC, "target_changes_week": TC}
    keys.update({"parts_merged": PM["value"], "parts_total": len(r1), "founder_asks_day": FA["value"], "rules_changes_day": RC["value"],
                 "target_changes_week": TC["value"], "launch_done": customer["launch_done"]["value"],
                 "launch_total": len(lc_rows), "counsel_open": customer["counsel_open"]["value"]})
    # Flow box (P-644): the counts the independent check recomputes (FORMULAS.md › Flow)
    flow_rows = [{"map": r["map"], "built": r["built"], "built_at": r.get("built_at"), "qa_tested_at": qa_tested_at.get(r["map"])} for r in rows]
    flow = flow_counts(flow_rows, r1_qa, {k: change_at[k] for k in r1 if k in change_at}, len(r1), r1_works_since,
                       parse_iso(taken) if taken else now)
    keys.update({k: flow[k] for k in FLOW_KEYS})
    stuck = stuck_counts(meta, snap.j("github/approved_open.json"))
    keys.update({k: stuck[k] for k in STUCK_KEYS})

    trust = reconcile_compare(keys, reconcile_out, reconcile_note)
    trust["invariants"] = invariants
    trust["notes"] = notes
    trust["status_disagreements"] = disagree
    trust["status_explained"] = explained

    # ---- freshness (§6.8)
    fresh = [{"source": "GitHub data", "age_h": 0.0, "limit_h": FRESH_LIMIT_H["GitHub data"], "note": "snapshot age at publish; the page adds the time since"},
             {"source": "Lead input", "age_h": round(li_age, 1) if li_age is not None else None, "limit_h": FRESH_LIMIT_H["Lead input"]}]

    return {"keys": keys, "trust": trust, "fresh": fresh, "history_line": today_line, "history_prev": prev,
            "pace": {"changes_needed_per_day": X, "changes_per_day": Y, "built": B, "proven": P_,
                     "rows_total": num(nrows, ck_src + ": capabilities", "parsed", L), "remaining": R, "ratio": ratio,
                     "committed_date": committed, "committed_set_on": set_on, "tolerance_days": tol, "light": light,
                     "early_band": EB, "leading": leading, "parts_merged": PM,
                     "merged_changes": num(merged_r1, f"Release 1 changes merged so far ({gh_src})", "mixed", L), "delivery_24h": delivery,
                     "scope_note": None if nrows == baseline else f"Scope changed: {nrows} capabilities (baseline {baseline})"},
            "forecast": {"p50": F50, "p85": F85, "sample": sample, "counts": counts, "days": [d.isoformat() for d in days14],
                         "runs": MC_RUNS, "seed": MC_SEED, "cap_days": MC_CAP},
            "burnup": burn, "capacity": capacity, "top3": top3, "org": org, "working_today": working, "whats_new": wn,
            "top_numbers": {"works_today": W_today, "pct_per_works": delivery["pct_per_works_row"], "pct_per_change": delivery["pct_per_change"],
                            "lanes": lanes_top},
            "capability_table": cap_table, "rules_caught": rules, "behaviour": behaviour, "customer": customer,
            "rows": [{"map": r["map"], "built": r["built"], "built_at": r.get("built_at"), "proven": r["proven"], "ids": r["ids"],
                      "size": r["size"], "qa_tested_at": qa_tested_at.get(r["map"])} for r in rows],
            "r1_qa": r1_qa, "flow": flow, "stuck": stuck}


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
        # 16 Nov (founder: "a lot of red health stuff"): every item that is not green says what to do and who, amber too
        items.append({"id": i, "name": name, "state": state, "detail": detail, "action": action if state in ("red", "amber") else None,
                      "owner": owner if state in ("red", "amber") else None, "class": cls})
    mc = snap.j("github/main_checks.json")
    ni = snap.j("github/main_nightly.json") or {}
    if mc is None:
        item(1, "main CI", "amber", "not measured: no check runs read for main's head", "refresh the board; if it stays unread, check GitHub access", "current Lead")
    else:
        badc = [c["name"] for c in mc if c.get("conclusion") in ("failure", "timed_out", "action_required", "startup_failure")]
        running = [c["name"] for c in mc if c.get("status") != "completed"]
        if badc or ni.get("conclusion") in ("failure", "timed_out"):
            item(1, "main CI", "red", "failed on main's head: " + ", ".join(badc + (["nightly"] if ni.get("conclusion") in ("failure", "timed_out") else [])),
                 "fix main before anything else merges", "current Lead")
        elif not mc and not ni:
            item(1, "main CI", "amber", "not measured: main's head has no check runs and no nightly run was read", "refresh the board after the next merge or nightly run", "current Lead")
        elif running:
            item(1, "main CI", "amber", "running on main's head: " + ", ".join(running[:5]), "nothing yet: wait for the checks to finish, then refresh", "current Lead")
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
        item(3, "Records on main", "amber", "not measured: STATE's this branch: line or the git refs could not be read", "fix STATE.md's \"this branch:\" line or fetch the branch, then refresh", "current Lead")
    elif n_ahead == 0 or not old:
        item(3, "Records on main", "green", f"{ex['state_branch']} has nothing main lacks")
    else:
        age = (cutoff - parse_iso(old)).total_seconds() / 3600
        files = ex.get("state_branch_files") or []
        unit = "record files" if ex.get("records_lag_rule") == "files" else "commits"   # older snapshots counted commits
        first_f = (" (" + ", ".join(f"{os.path.relpath(f['path'], REL) if f['path'].startswith(REL + '/') else f['path']} since "
                                     f"{ist(parse_iso(f['since']))}" for f in files[:3]) + (", …" if len(files) > 3 else "") + ")") if files else ""
        item(3, "Records on main", "red" if age > 24 else "green",
             f"{n_ahead} {unit} on the Lead's branch {ex['state_branch']} hold changes main does not have; the oldest is "
             f"{round(age, 1)} h old{first_f}" +
             ("" if ex.get("main_ref_is_head") else " (compared with the local origin/main, older than main's head)"),
             "put these files in the next records PR to main, or drop the changes main has since replaced", "current Lead")
        items[-1]["files"] = files
    gr = snap.j("github/guard_runs.json")
    if not gr:
        item(4, "Guards", "amber", "not measured: no guard runs read", "check that the guard workflows still run on main", "current Lead")
    else:
        bad_g = [g["name"] for g in gr if g.get("conclusion") not in ("success", None)]
        none_g = [g["name"] for g in gr if g.get("conclusion") is None]
        item(4, "Guards", "red" if bad_g else "amber" if none_g else "green",
             ("failed: " + ", ".join(bad_g)) if bad_g else ("not measured: " + ", ".join(none_g)) if none_g else "label guard and push guard last runs green",
             "restore the guard and re-run it", "current Lead")
    # board v53 (A70): rules caught today live here, not in the top strip; a catch or a breach turns item 4 amber (never green)
    rc = comp.get("rules_caught")
    if rc:
        g4 = items[-1]
        parts, caught, nm4, by_rep = [], False, [], False
        for k, word in (("label_guard_removals", "label-guard removals"), ("ci_rule_failures", "check-docs CI failures"),
                        ("ci_bundle_failures", "rules-and-tools CI step failures (check-docs.sh + 16 other checks)"),
                        ("breaches_found", "breaches found (Lead-reported)"), ("push_guard_refusals", "push-guard refusals (Lead-reported)")):
            n = rc[k]
            if n["value"] is None:
                if n["class"] == "measured":
                    nm4.append(word.split(" (")[0] + ": " + n["reason"])
                continue
            if n["value"]:
                caught = True
                by_rep = by_rep or n["class"] == "reported"
                ref = n.get("prs") or [p for r_ in n.get("runs") or [] for p in r_["prs"]]
                parts.append(f"{word} {n['value']}" +
                             (" (" + ", ".join("#%d" % x for x in sorted(set(ref))[:8]) + ")" if ref else ""))
        unrep = [f"{k.replace('_', ' ')}: {rc[k]['reason']}" for k in ("breaches_found", "push_guard_refusals") if rc[k]["value"] is None]
        g4["detail"] += "; rules caught today: " + ("; ".join(parts) if parts else "none") + \
            (" (not measured: " + "; ".join(nm4) + ")" if nm4 else "") + (f" ({'; '.join(unrep)})" if unrep else "")
        g4["rules_caught"] = rc
        if (caught or nm4) and g4["state"] == "green":
            g4["state"] = "amber"
            g4["action"], g4["owner"] = ("nothing to fix in the guards: they caught these today; the lanes named fix their PRs, "
                                         "the Lead watches for the same rule caught twice"), "current Lead"
            if by_rep and not nm4 and not any(rc[k]["value"] for k in ("label_guard_removals", "ci_rule_failures", "ci_bundle_failures")):
                g4["class"] = "reported"      # lit by a Lead-reported count alone: the weaker class (§0.3)
    burn = (li or {}).get("burn_pct_per_h")
    li_age = (cutoff - parse_iso(li["as_of"])).total_seconds() / 3600 if li and li.get("as_of") else None
    if burn is None:
        item(5, "Burn", "amber", "not measured: Lead input has no burn_pct_per_h", "write burn_pct_per_h in the Lead input at the next check", "current Lead", cls="reported")
    elif li_age is not None and li_age > 2:
        item(5, "Burn", "amber", f"Lead-reported {burn}%/h is {round(li_age, 1)} h old (limit 2 h)", "update the Lead input and refresh the board", "current Lead", cls="reported")
    else:
        item(5, "Burn", "red" if burn > BURN_LIMIT else "green", f"Lead-reported {burn}% of the weekly plan per hour (limit {BURN_LIMIT})",
             "slow the lanes or stop paid work until burn is under 3%/h", "current Lead", cls="reported")
    caps = parse_caps(snap.text("files_main/qa/CAPABILITIES.md"))
    first = snap.j("git/bug_first_seen.json") or {}
    bugs_txt = snap.text("files_main/qa/BUGS.md")         # main's copy (16 Nov); older snapshots fall back to the records copy
    bugs = [b for b in parse_bugs(bugs_txt if bugs_txt is not None else (snap.file("qa/BUGS.md") or "")) if b["open"] and b["sev"] in ("Critical", "Major")
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
    item(6, "Major bugs on proof-of-concept capabilities qa passed", "red" if old_b else "amber" if unk else "green",
         ("open Major or Critical bugs on capabilities marked proven, older than 48 h: " + ", ".join(old_b)) if old_b else
         ("age not measured: " + ", ".join(unk)) if unk else
         f"{len(bugs)} open Critical/Major on Works capabilities, none older than 48 h",
         "fix each bug, or mark its capability Partial (a Major means not proven); the Lead gives them to a builder or the qa lane",
         "current Lead (builders and qa fix)", cls="parsed")
    items[-1]["bugs"] = [{"id": b["id"], "caps": b["caps"], "sev": b["sev"]} for b in bugs if b["id"] in old_b]
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
    nmap = {1: (len(mc) if mc is not None else None, "check runs on main's head"),
            2: (None, "computed by the page"),
            3: (n_ahead, "record files on STATE's this branch: whose version main never had"),
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
NOT_READ_MERGED = "not measured: the merged pull requests were not read (offline or failed)"
NOT_READ_NIGHTLY = "not measured: the nightly runs on main were not read (offline or failed)"


def nn(x):
    """A sample size for tooltip text: the number, or "not measured"."""
    return "not measured" if x is None else str(x)


QA_WORKS = re.compile(r"Works(?![A-Za-z])")
STAGES = ("planned", "in progress", "built", "proven")


DECISION_CODE = re.compile(r"\s*\((?:P|A|F|AIW-D|S)-?\d+[^)]*\)|\s*\b(?:P|AIW-D)-\d+\b")


def nocode(s):
    """His view reads plain words: decision codes such as "(P-589)" or "P-626" are dropped; ids like C5 or PF-8 stay."""
    return DECISION_CODE.sub("", s or "").strip() if s else s


def r1_stages(rows, r1_qa):
    """The Release 1 stages, one rule for the first screen and the Flow box. Proven = qa's verdict Works on main.
    P-639 (Lead 66, 16 Nov): qa's verdict on main decides. A row whose listed parts all merged is Built (awaiting qa)
    unless qa tested it after its last part merged and read Partial or Not built: then it is In progress (qa found it
    unfinished). A row merged after qa's last test stays Built (awaiting qa), so the founder sees what qa owes.
    rows: [{map, built, built_at, qa_tested_at}]. Returns (planned, proven, qa_unfinished, built, waiting)."""
    planned = [r["map"] for r in rows]
    proven = sorted(m for m in planned if QA_WORKS.match(r1_qa.get(m) or ""))
    row_of = {r["map"]: r for r in rows}

    def qa_after_merge(m):
        r = row_of.get(m) or {}
        ta, ba = r.get("qa_tested_at"), r.get("built_at")
        return bool(ta and ba and parse_iso(ta) >= parse_iso(ba))
    parts_done = [m for m in planned if (row_of.get(m) or {}).get("built")]
    qa_unfinished = sorted(m for m in parts_done if m not in proven and re.match(r"(Partial|Not built)", r1_qa.get(m) or "")
                           and qa_after_merge(m))
    built = sorted((set(parts_done) - set(qa_unfinished)) | set(proven))
    waiting = [m for m in built if m not in proven]
    return planned, proven, qa_unfinished, built, waiting


FLOW_KEYS = ("flow_rows_built_24h", "flow_rows_built_3d", "flow_parts_24h", "flow_parts_3d", "flow_parts_left",
             "flow_works_24h", "flow_works_3d", "flow_prove_lag_h", "flow_awaiting", "flow_awaiting_oldest_h",
             "flow_forecast", "flow_forecast_best", "flow_forecast_worst",
             "flow_rows_built_today", "flow_parts_today", "flow_works_today", "flow_works_week")


def flow_counts(rows, r1_qa, part_at, parts_total, works_since, now):
    """Flow box counts (Lead 69, 16 Nov, P-644; FORMULAS.md › Flow), all from the snapshot; cockpit-reconcile.py
    recomputes each one apart. Windows: the 24 h to the snapshot time, and the last 3 full IST days (oldest first).
    rows: [{map, built, built_at, qa_tested_at}] of the 101 Release 1 rows; part_at: {Release 1 id: when its last needed
    part merged}; works_since: {R1 map row: when its current run of Works began} (none for a row listed already Works)."""
    today = now.astimezone(IST).date()
    days = [today - timedelta(days=k) for k in (3, 2, 1)]
    cut = now - timedelta(hours=24)
    planned, proven, _, _, waiting = r1_stages(rows, r1_qa)
    row_of = {r["map"]: r for r in rows}
    b_at = {m: parse_iso(row_of[m]["built_at"]) for m in planned if row_of[m].get("built") and row_of[m].get("built_at")}
    w_at = {m: parse_iso(works_since[m]) for m in proven if works_since.get(m)}
    p_at = [parse_iso(v) for v in part_at.values() if v]

    def per_day(ts):
        return [sum(1 for t in ts if t.astimezone(IST).date() == d) for d in days]

    def in24(ts):
        return sum(1 for t in ts if cut < t <= now)
    lag = sorted((w_at[m] - b_at[m]).total_seconds() / 3600 for m in w_at
                 if m in b_at and w_at[m] >= b_at[m] and now - w_at[m] <= timedelta(days=7))
    lag_h = round(statistics.median(lag), 1) if lag else None
    oldest = max(((now - b_at[m]).total_seconds() / 3600 for m in waiting if m in b_at), default=None)
    left = parts_total - len(p_at)
    pd = per_day(p_at)
    wd = per_day(w_at.values())
    to_prove = len(planned) - len(proven)
    no_qa = not any(m in r1_qa for m in planned)            # qa's file missing or without R1 rows: Prove is not measured

    def build_eta(rate):                                  # the day every Release 1 id has merged, plus the built-to-proven lag
        if left <= 0:
            return today
        return today + timedelta(days=math.ceil(left / rate - 1e-9) + math.ceil((lag_h or 0) / 24)) if rate else None

    def prove_eta(rate):                                  # the day qa has proven every row left, at its own rate
        if to_prove <= 0:
            return today
        return today + timedelta(days=math.ceil(to_prove / rate - 1e-9)) if rate else None

    def eta(b_rate, p_rate):                              # all 101 proven: the later of the two (review 16 Nov, M1)
        b, p = build_eta(b_rate), prove_eta(p_rate)
        return None if no_qa or b is None or p is None else max(b, p).isoformat()
    nq = (lambda v: None if no_qa else v)
    return {"flow_rows_built_24h": in24(b_at.values()), "flow_rows_built_3d": per_day(b_at.values()),
            "flow_parts_24h": in24(p_at), "flow_parts_3d": pd, "flow_parts_left": left,
            "flow_works_24h": nq(in24(w_at.values())), "flow_works_3d": nq(wd),
            "flow_prove_lag_h": nq(lag_h), "flow_awaiting": nq(len(waiting)),
            "flow_awaiting_oldest_h": nq(round(oldest, 1) if oldest is not None else None),
            "flow_forecast": eta(sum(pd) / 3, sum(wd) / 3), "flow_forecast_best": eta(max(pd), max(wd)),
            "flow_forecast_worst": eta(min(pd), min(wd)),
            "build_done": (lambda x: x.isoformat() if x else None)(build_eta(sum(pd) / 3)),
            "parts_done": None if not sum(pd) and left > 0 else (today if left <= 0 else today + timedelta(days=math.ceil(left / (sum(pd) / 3) - 1e-9))).isoformat(),
            "rows_total": len(planned),
            "prove_done": None if no_qa else (lambda x: x.isoformat() if x else None)(prove_eta(sum(wd) / 3)),
            "to_prove": to_prove, "no_qa": no_qa,
            # Lead 70 (A133, 16 Nov): the lights read the IST calendar day; the week is Monday to Sunday IST
            "flow_rows_built_today": sum(1 for t in b_at.values() if t.astimezone(IST).date() == today),
            "flow_parts_today": sum(1 for t in p_at if t.astimezone(IST).date() == today),
            "flow_works_today": nq(sum(1 for t in w_at.values() if t.astimezone(IST).date() == today)),
            "flow_works_week": nq(sum(1 for t in w_at.values() if today - timedelta(days=today.weekday()) <= t.astimezone(IST).date() <= today)),
            "week_start": (today - timedelta(days=today.weekday())).isoformat(), "proven_n": len(proven),
            "built_today_maps": sorted(m for m, t in b_at.items() if t.astimezone(IST).date() == today),
            "works_today_maps": sorted(m for m, t in w_at.items() if t.astimezone(IST).date() == today),
            "days": [d.isoformat() for d in days], "today": today.isoformat(), "waiting": waiting,
            "today_counts": {"rows": sum(1 for t in b_at.values() if t.astimezone(IST).date() == today),
                             "parts": sum(1 for t in p_at if t.astimezone(IST).date() == today),
                             "works": sum(1 for t in w_at.values() if t.astimezone(IST).date() == today)}, "lag_n": len(lag), "parts_total": parts_total,
            "built_24h_maps": sorted(m for m, t in b_at.items() if cut < t <= now),
            "works_24h_maps": sorted(m for m, t in w_at.items() if cut < t <= now)}


def nwords(n, word):
    """"1 row", "4 rows" (a count is never null here)."""
    return f"{n} {word if n == 1 else word + 's'}"


def flow_light(*states):
    """The worst of the states; grey when nothing is measured; never green while a part is not measured (amber)."""
    s = [x for x in states if x]
    if not s:
        return "grey"
    w = "red" if "red" in s else "amber" if "amber" in s else "green"
    return "amber" if w == "green" and len(s) < len(states) else w


def flow_band(v, green, amber, low_good=True):
    """green/amber/red for a value against two limits; None when not measured."""
    if v is None:
        return None
    if low_good:
        return "green" if v <= green else "amber" if v <= amber else "red"
    return "green" if v >= green else "amber" if v >= amber else "red"


def flow_box(d, fc, li, li_src, ci):
    """The Flow box on the first screen (founder 21:2x IST 16 Nov via Lead 69: "which is going good: build, or proving,
    or merging, or resourcing"). Four lights against P-644's targets, each with its numbers and a 3-day trend, and the
    forecast line. Every number has its source; "not measured" says why (P-596)."""
    taken = (d.get("lineage") or {}).get("taken_at")
    pl, rs = d.get("pipeline") or {}, d.get("resources") or {}
    days = [date.fromisoformat(x).strftime("%d %b") for x in fc["days"]]
    tc = fc["today_counts"]
    trend = lambda xs, k: " · ".join(f"{a} {b}" for a, b in zip(days, xs)) + f" · today so far {tc[k]}"
    snap_src = f"the snapshot at {ist(parse_iso(taken)) if taken else 'not recorded'}"
    # 1 Build
    bt = fc["flow_rows_built_today"]
    build = {"name": "Build", "light": flow_band(bt, FLOW_TARGET, FLOW_FLOOR, low_good=False),
             "big": nwords(bt, "row") + " built today", "target": f"target {FLOW_TARGET} a day, floor {FLOW_FLOOR} (today = the IST day)",
             "lines": [f"Parts merged today: {fc['flow_parts_today']}; {fc['flow_parts_left']} of {fc['parts_total']} parts left (a part is one Release 1 id; an id split into sub-parts counts when its last one merges)",
                       "Last 24 h: " + nwords(fc["flow_rows_built_24h"], "row") + " built, " + nwords(fc["flow_parts_24h"], "part") + " merged",
                       "Rows built a day: " + trend(fc["flow_rows_built_3d"], "rows"),
                       "Parts merged a day: " + trend(fc["flow_parts_3d"], "parts")],
             "maps": fc["built_today_maps"],
             "src": "Release 1 rows whose every checklist part merged through an app PR (P-639, part-aware), and the Release 1 ids "
                    "whose last needed part merged; " + snap_src}
    # 2 Prove
    w24, lag, aw, old = fc["flow_works_today"], fc["flow_prove_lag_h"], fc["flow_awaiting"], fc["flow_awaiting_oldest_h"]
    pc = flow_band(w24, FLOW_TARGET, FLOW_FLOOR, low_good=False)     # None (grey) when qa's file has no R1 rows
    if pc == "green" and (lag is None or lag > FLOW_PROVE_H or (old is not None and old > FLOW_PROVE_H)):
        pc = "amber"                                                   # slower than 12 h, or built to proven not measured
    prove = {"name": "Prove", "light": pc or "grey", "big": (nwords(w24, "row") + " proven today" if w24 is not None else "not measured: qa's file has no Release 1 rows"), "target": f"target {FLOW_TARGET} a day, floor {FLOW_FLOOR}; built to proven {FLOW_PROVE_H} h or less",
             "lines": [("Built to proven: median " + (f"{lag} h" if lag is not None else "not measured") + f" (n={fc['lag_n']}, rows proven in the last 7 days)"),
                       f"Built, waiting for qa: {aw if aw is not None else 'not measured'}" + (f"; oldest {old} h" if old is not None else ""),
                       "Rows proven a day: " + (trend(fc["flow_works_3d"], "works") if fc["flow_works_3d"] is not None else "not measured"),
                       "Last 24 h: " + (nwords(fc["flow_works_24h"], "row") + " proven" if fc["flow_works_24h"] is not None else "not measured")],
             "maps": fc["works_today_maps"],
             "src": "qa/CAPABILITIES.md on main: when each R1 row's current run of Works began (a row listed already reading Works "
                    "has no date); waiting = Built (awaiting qa) as on the first screen; " + snap_src}
    # 3 Merge
    qw = pl.get("queue_wait_min") or {}
    bf = ((pl.get("change_fail") or {}).get("batch_fail") or {})
    mm, p90, fp = qw.get("v"), qw.get("p90"), bf.get("v")
    cq = ci if isinstance(ci, dict) and not ci.get("error") else None
    ws = sorted(w["min"] for w in (cq or {}).get("job_waits") or [])
    cw = round(statistics.median(ws), 1) if ws else None
    still = sum(1 for w in (cq or {}).get("job_waits") or [] if w.get("still_queued"))
    merge = {"name": "Merge", "light": flow_light(flow_band(mm, *FLOW_MERGE_MIN), flow_band(fp, *FLOW_FAIL_PCT), flow_band(cw, *FLOW_CI_WAIT_MIN)),
             "big": ("approved to merged " + (f"{mm} min" if mm is not None else "not measured") + (f", p90 {p90} min" if p90 is not None else "")),
             "target": f"median {FLOW_MERGE_MIN[0]} min or less; failed batches {FLOW_FAIL_PCT[0]}% or less; a test machine within {FLOW_CI_WAIT_MIN[0]} min",
             "lines": ["Failed merge batches: " + (f"{fp}%" if fp is not None else "not measured"),
                       ("Waiting for a test machine: " + (f"{cq.get('queued_runs')} runs waiting now (created under 6 h); median job wait {cw} min over the last 3 h "
                        f"({len(ws)} jobs of the newest {cq.get('runs_sampled')} of {cq.get('runs_in_3h')} test runs; {still} still waiting)"
                        if cq and cw is not None else "not measured: " + (
                            "this snapshot has no CI reading" if ci is None else ci.get("error") if isinstance(ci, dict) and ci.get("error")
                            else "no test run in the last 3 h" if not (cq or {}).get("runs_in_3h") else "no job waited for a machine (all skipped or held)")))],
             "src": (qw.get("src") or "flow-measure not read") + "; GitHub Actions runs and jobs at the snapshot"}
    # 4 Resources
    lr, ls = (li or {}).get("lanes_running"), (li or {}).get("lane_slots")
    share = round(lr / ls, 2) if isinstance(lr, (int, float)) and isinstance(ls, (int, float)) and ls else None
    burn, wk = (rs.get("burn_pct_per_h") or {}).get("v"), (rs.get("weekly_pct") or {}).get("v")
    disk = (rs.get("disk_free_gb") or {}).get("v")
    res = {"name": "Resources", "light": flow_light(flow_band(share, *FLOW_LANES_SHARE, low_good=False), flow_band(burn, BURN_LIMIT, BURN_LIMIT + 1),
                                                    None if disk is None else ("green" if disk >= FLOW_DISK_GB else "red")),
           "big": (f"{lr} of {ls} lanes running" if share is not None else "lanes not measured"),
           "target": f"lanes at least {int(FLOW_LANES_SHARE[0] * 100)}% of slots; burn {BURN_LIMIT:g}% an hour or less (P-440); disk {FLOW_DISK_GB} GB or more",
           "lines": ["Weekly plan: " + (f"{wk}% used" if wk is not None else "not reported") + (f", burn {burn}% an hour" if burn is not None else ", burn not reported"),
                     "Mac disk free: " + (f"{disk} GB" if disk is not None else "not measured")]
           + ([] if share is not None else ["Lanes: not measured: the Lead input has no lanes_running and lane_slots"]),
           "src": (li_src + ": lanes_running, lane_slots, weekly_pct, burn_pct_per_h" if li else "Lead input missing") + "; df on the repository's volume"}
    dm = lambda x: date.fromisoformat(x).strftime("%d %b") if x else None
    fct, b3, w3 = fc["flow_forecast"], fc["flow_parts_3d"], fc["flow_works_3d"]
    n_all, lagd = fc["rows_total"], (math.ceil(lag / 24) if lag else 0)
    if fc["no_qa"]:
        fl = f"All {n_all} proven: not measured (qa's file has no Release 1 rows)"
    else:
        def rate(x, what):                                # 2 decimals under 1 a day, so the rate matches its date
            v = round(x, 2) if x < 1 else round(x, 1)
            return f"{v:g} {what[:-1] if v == 1 else what} a day"
        built_txt = ("Building: every part has merged" if fc["flow_parts_left"] <= 0 else
                     "Building: the last part merges about " + (dm(fc["parts_done"]) or "no date") + f" ({rate(sum(b3) / 3, 'parts')})")
        fl = (f"All {n_all} rows proven about " + (dm(fct) or "no date yet") + ". " + built_txt
              + (f", and rows are proven about {lagd} day{'s' if lagd != 1 else ''} after they are built" if lagd else "") + ". "
              + (f"Proving: every row is proven" if fc["to_prove"] <= 0 else
                 f"Proving: the {fc['to_prove']} rows left, at qa's {rate(sum(w3) / 3, 'rows')}, about " + (dm(fc["prove_done"]) or "no date")) + ". "
              + "Best " + (dm(fc["flow_forecast_best"]) or "no date") + "; worst " + (dm(fc["flow_forecast_worst"]) or "no date (a day with nothing merged or proven)") + ".")
    return {"lights": [build, prove, merge, res], "forecast": fl, "src": "FORMULAS.md › Flow"}


def week_light(n, days_in):
    """The week's light: 10 a day (floor 7) for the days so far, today included, or for the full days before today (at
    least 1), whichever reads better, so the light is not red in the small hours after a day on target (review m1)."""
    if n is None:
        return "grey"
    order = ["red", "amber", "green"]
    a = flow_band(n, FLOW_TARGET * days_in, FLOW_FLOOR * days_in, low_good=False)
    b = flow_band(n, FLOW_TARGET * max(1, days_in - 1), FLOW_FLOOR * max(1, days_in - 1), low_good=False)
    return max(a, b, key=order.index)


STUCK_KEYS = ("stuck_main_gap_min", "stuck_approved_over_60")


def stuck_counts(meta, approved):
    """Stuck now (founder 23:3x IST 16 Nov via Lead 70; FORMULAS.md › Stuck now): minutes from the last merge to main
    (main's head commit time) to the snapshot, and the open PRs labelled `review: approved` whose label is over 60 min
    old at the snapshot. cockpit-reconcile.py recomputes both."""
    taken, main_at = parse_iso(meta.get("taken_at")), parse_iso(meta.get("main_at"))
    gap = max(0, int((taken - main_at).total_seconds() // 60)) if taken and main_at else None   # a merge after taken_at reads 0
    if not isinstance(approved, list):
        return {"stuck_main_gap_min": gap, "stuck_approved_over_60": None, "approved_old": [],
                "approved_reason": "not measured: " + ((approved or {}).get("error") if isinstance(approved, dict) else "this snapshot has no approved-PR reading")}
    old = []
    for p in approved:
        la = parse_iso(p.get("labeled_at"))
        if taken and la and (taken - la).total_seconds() > STUCK_APPROVED_MIN * 60:
            old.append({"number": p["number"], "title": p.get("title"), "min": int((taken - la).total_seconds() // 60)})
    old.sort(key=lambda x: -x["min"])
    return {"stuck_main_gap_min": gap, "stuck_approved_over_60": len(old), "approved_old": old, "approved_reason": None}


def stuck_now(d, sc, ci, li, li_src):
    """The Stuck now box: four lines with lights (Lead 70, 23:3x IST 16 Nov). (a) and (b) are lead-watch's jam numbers
    (P-646); (c) is the Lead's check of claude.ai/code (P-647), Lead-reported; (d) approved PRs waiting over 60 min."""
    taken = (d.get("lineage") or {}).get("taken_at")
    at = f"snapshot {ist(parse_iso(taken)) if taken else 'time not recorded'}"
    gap = sc["stuck_main_gap_min"]
    q = ci.get("queued_runs") if isinstance(ci, dict) and not ci.get("error") else None
    ss, ss_at = (li or {}).get("stuck_sessions"), (li or {}).get("stuck_sessions_at")
    lines = [
        {"key": "merge", "light": flow_band(gap, *STUCK_MERGE_MIN) or "grey",
         "text": (f"Last merge to main: {gap} min ago" if gap is not None else "Last merge to main: not measured"),
         "src": f"main's newest commit time (GitHub commits/main), as lead-watch's jam line (P-646); green to {STUCK_MERGE_MIN[0]} min, red over {STUCK_MERGE_MIN[1]}; " + at},
        {"key": "queue", "light": flow_band(q, *STUCK_QUEUE) or "grey",
         "text": (f"Actions runs waiting for a machine: {q}" if q is not None else "Actions runs waiting for a machine: not measured"),
         "src": f"GitHub Actions runs with status queued created under 6 h ago (older ones are stale, B206), as lead-watch's jam line (P-646); green to {STUCK_QUEUE[0]}, red over {STUCK_QUEUE[1]}; " + at}]
    if isinstance(ss, list):
        names = [f"{x.get('title') or 'untitled'} ({': '.join(str(v) for v in (x.get('state') or 'state not given', x.get('reason')) if v)})"
                 for x in ss if isinstance(x, dict)]
        try:
            sa = parse_iso(ss_at) if ss_at else None
            sa = sa if sa and sa.tzinfo else None                  # a time with no zone is not trusted
        except (ValueError, TypeError, AttributeError):     # not a string, or not a time
            sa = None
        tk = parse_iso(taken) if taken else None
        age = int((tk - sa).total_seconds() // 60) if sa and tk else None
        when = (ist(sa) + (f", {age} min before this data" if age is not None else "")) if sa else "a time not given"
        stale = age is None or age > STUCK_SESSIONS_FRESH_MIN
        lines.append({"key": "sessions", "light": "red" if names else ("amber" if stale else "green"),
                      "text": (f"{STUCK_SESSIONS_LABEL}: {len(names)}" + (": " + "; ".join(names) if names else "")),
                      "src": f"per the Lead's check of claude.ai/code at {when} (P-647), Lead-reported; amber when no session is listed but the "
                             f"check is over {STUCK_SESSIONS_FRESH_MIN} min old or undated; " + li_src, "items": names})
    else:
        lines.append({"key": "sessions", "light": "grey", "text": f"{STUCK_SESSIONS_LABEL}: not reported",
                      "src": "the Lead input has no stuck_sessions (the Lead's check of claude.ai/code, P-647)", "items": []})
    ao = sc["approved_old"]
    lines.append({"key": "approved", "light": "grey" if sc["stuck_approved_over_60"] is None else "red" if ao else "green",
                  "text": (f"Approved, not merged for over {STUCK_APPROVED_MIN} min: " + (str(len(ao)) + (": " + "; ".join(f"#{x['number']} ({x['min']} min)" for x in ao[:8]) + (f" and {len(ao) - 8} more" if len(ao) > 8 else "") if ao else ""))
                           if sc["stuck_approved_over_60"] is not None else f"Approved, not merged for over {STUCK_APPROVED_MIN} min: " + sc["approved_reason"])
                          + (f"; waiting for CI machines ({q} runs queued)" if ao and q is not None and q > STUCK_QUEUE[1] else ""),
                  "src": "open PRs labelled review: approved, minutes since the label went on (GitHub issue events); the reason 'waiting for CI machines' is added "
                         f"when the queue line is red (over {STUCK_QUEUE[1]} runs queued; Lead 74, 17 Nov); " + at,
                  "items": [f"#{x['number']} {x['title']} ({x['min']} min)" for x in ao]})
    return {"lines": lines, "light": flow_light(*[x["light"] if x["light"] != "grey" else None for x in lines])}


def proven_lines(d, fc):
    """Lead 70 (founder A133, 22:0x IST 16 Nov): "11 of 10 proven" mixed the total with the day's goal. Three plain lines,
    each with its light: today (IST day) against 10 (floor 7, P-644); this week (Monday to Sunday IST) against 70, the
    light against 10 (floor 7) for each day so far; overall against 101, with what the committed date needs a day and
    the date at the current pace (FORMULAS.md › Proven: today, this week, overall)."""
    rel = (d.get("first") or {}).get("release") or {}
    taken = (d.get("lineage") or {}).get("taken_at")
    at = f"qa/CAPABILITIES.md on main; snapshot {ist(parse_iso(taken)) if taken else 'time not recorded'}"
    today, wk = date.fromisoformat(fc["today"]), date.fromisoformat(fc["week_start"])
    days_in = (today - wk).days + 1
    wt, ww, pn, tot = fc["flow_works_today"], fc["flow_works_week"], fc["proven_n"], fc["rows_total"]
    tgt, need, fct = rel.get("target"), rel.get("need_per_day"), fc["flow_forecast"]
    dm = lambda x: date.fromisoformat(x).strftime("%d %b") if x else None
    if fc["no_qa"]:
        ol = None
    elif not tgt:
        ol = None
    elif not fct:
        ol = "red"
    else:
        late = (date.fromisoformat(fct) - date.fromisoformat(tgt)).days
        ol = "green" if late <= 0 else "amber" if late <= 7 else "red"
    nm = "not measured (qa's file has no Release 1 rows)"
    return [
        {"key": "today", "light": flow_band(wt, FLOW_TARGET, FLOW_FLOOR, low_good=False) or "grey",
         "text": f"Today (IST day): {wt} proven of {FLOW_TARGET} (floor {FLOW_FLOOR}, P-644)" if wt is not None else "Today (IST day): " + nm,
         "src": "R1 rows whose current run of Works began today, IST (FORMULAS.md › Flow, Prove); " + at, "maps": fc["works_today_maps"]},
        {"key": "week", "light": week_light(ww, days_in),
         "text": f"This week (Mon to Sun IST): {ww} proven of {FLOW_TARGET * 7}" if ww is not None else "This week (Mon to Sun IST): " + nm,
         "src": f"the same rows, from Monday {wk.strftime('%d %b')}; the light compares with {FLOW_TARGET} a day (floor {FLOW_FLOOR}) for the "
                f"{days_in} day{'s' if days_in != 1 else ''} so far, or for the full days before today (at least 1), whichever reads better; " + at},
        {"key": "overall", "light": ol or "grey",
         "text": (f"Overall: {pn} of {tot} proven; " + (f"{dm(tgt)} needs about {need} a day" if tgt and need is not None else
                  f"{dm(tgt)}: the date has passed" if tgt else "no committed date")
                  + "; at the current pace, " + (f"all proven about {dm(fct)}" if fct else "no date yet")) if not fc["no_qa"] else "Overall: " + nm,
         "src": "proven = qa's verdict Works; the date and what it needs a day from cockpit/plan.json (committed) as on Release 1; "
                "the pace is the last 3 full IST days' parts merged and rows proven (FORMULAS.md › Flow, Forecast); green when that date "
                "is on or before the committed date, amber up to 7 days after, red later or with no date; " + at}]


def first_screen(d, r1_qa, li, li_src):
    """P-636 (founder 11:0x IST 16 Nov): the first screen in three words. Planned = a Release 1 capability (checklist §A);
    Built = every part merged on main (BACKLOG parts all merged through app PRs), or qa passed it; Proven = qa's verdict
    Works in qa/CAPABILITIES.md on main, nothing else (the checklist's own status is not read). Six answers, each with
    its items, owner and next step (FORMULAS.md › First screen)."""
    gen = datetime.fromisoformat(d["freshness"]["generated_at"].replace("Z", "+00:00"))
    today = gen.astimezone(IST).date()
    names = {r["map"]: r["cap"] for r in (d.get("capability_table") or {}).get("rows") or []}
    rows = d.get("build_rows") or []
    planned, proven, qa_unfinished, built, waiting = r1_stages(rows, r1_qa)
    unlisted = [m for m in planned if m not in r1_qa]
    qa_not_built = qa_unfinished
    lbl = lambda m: f"R1.{m} {names.get(m, '')}".strip()
    qa_src = "qa/CAPABILITIES.md on main (R1 rows; R1.n = checklist map row n)"
    # Release 1 against the committed date
    P, F = d["pace"], d["forecast"]
    target = P.get("committed_date")
    tdate = date.fromisoformat(target) if target else None
    days_left = (tdate - today).days if tdate else None
    left = len(planned) - len(proven)
    need = round(left / days_left, 1) if days_left and days_left > 0 else None
    p50 = (F.get("p50") or {}).get("value")
    if not tdate:
        state, why = "not measured", "no committed date in cockpit/plan.json"
    elif p50:
        late = (date.fromisoformat(p50) - tdate).days
        state = "on track" if late <= 0 else "late"
        why = (f"measured forecast {p50} (half the runs finish by then) against {target}" +
               ("" if late <= 0 else f": late by {late} days"))
    else:
        start = date(2026, 11, 13)
        rate = round(len(proven) / max(1, (today - start).days + 1), 1)
        state = "on track" if need is not None and rate >= need else "off track"
        why = (f"{left} to prove in {days_left} days is {need} a day; {len(proven)} proven so far "
               f"(about {rate} a day since 13 Nov). The measured forecast date starts after 5 days of history (17 Nov).")
    # A115 (founder 16 Nov): one stage per capability, the same colour everywhere: Proven > Built > In progress > Planned.
    # In progress = an open pull request or a started lane names it (working_today), or qa reads it Partial.
    wt = ((d.get("working_today") or {}).get("rows") or {})
    stage = {}
    for m in planned:
        stage[m] = ("proven" if m in proven else "built" if m in built else
                    "in progress" if m in qa_unfinished or str(m) in wt or (r1_qa.get(m) or "").startswith("Partial") else "planned")
    groups = []
    gname = {g["id"]: g["name"] for g in (d.get("capabilities") or {}).get("groups") or []}
    grp_of = {r["map"]: r.get("group") for r in (d.get("capability_table") or {}).get("rows") or []}
    for gid in sorted(set(v for v in grp_of.values() if v)):
        ms = [m for m in planned if grp_of.get(m) == gid]
        groups.append({"id": gid, "name": gname.get(gid, gid), "counts": {s: sum(1 for m in ms if stage[m] == s) for s in STAGES},
                       "rows": [{"map": m, "cap": names.get(m, ""), "stage": stage[m], "qa": r1_qa.get(m)} for m in ms]})
    release = {"planned": len(planned), "built": len(built), "proven": len(proven), "waiting": len(waiting),
               "stage": {str(m): s for m, s in stage.items()}, "stage_counts": {s: sum(1 for v in stage.values() if v == s) for s in STAGES},
               "groups": groups,
               "proven_ids": proven, "built_ids": built, "waiting_ids": waiting, "unlisted_ids": unlisted,
               "qa_not_built_ids": qa_not_built, "target": target, "days_left": days_left, "need_per_day": need,
               "state": state, "why": why,
               "src": f"Planned: MVP-CHECKLIST.md §A; Built: BACKLOG parts all merged (app PRs) or qa passed; Proven: {qa_src}; target: plan.json (P-609)"}
    if not r1_qa:                                        # qa's file unreadable or without R1 rows: not measured, never 0
        release.update({"proven": None, "built": None, "waiting": None, "state": "not measured",
                        "why": "qa/CAPABILITIES.md on main has no Release 1 rows (or was not read)"})
    # Today's proving goal (Lead input today_goal, reported)
    g = (li or {}).get("today_goal") or {}
    g_text = None                                           # a goal not sent as {proven: number, by}: shown, not counted
    if not isinstance(g, dict):
        g_text, g = str(g), {}
    elif g.get("proven") is not None and (isinstance(g["proven"], bool) or not str(g["proven"]).strip().isdigit()):
        g_text, g = str(g.get("proven")), {}
    if g.get("proven"):
        short = int(g["proven"]) - len(proven)
        tstate = "done" if short <= 0 else ("at risk" if short <= len(waiting) else "off track")
        today_b = {"goal": int(g["proven"]), "by": g.get("by"), "goal_src": g.get("src") or li_src, "proven": len(proven),
                   "short": max(0, short), "waiting": len(waiting), "state": tstate,
                   "why": ("goal met" if short <= 0 else
                           f"needs {short} more qa passes by {g.get('by_text') or g.get('by')}; {len(waiting)} are Built and waiting for qa" +
                           ("" if short <= len(waiting) else ": fewer than needed, so not reachable today")),
                   "plan": g.get("plan"), "class": "reported"}
    else:
        today_b = {"goal": None, "state": "not set", "why": (f"the Lead's goal is not a number and a time (today_goal: {g_text})" if g_text else
                                                            "no proving goal in the Lead input (today_goal)"), "proven": len(proven),
                   "waiting": len(waiting), "class": "reported"}
    # Needs you: the founder's open items, plus launch steps he owns that are dated today or earlier (founder, 16 Nov: "Yes, show them")
    ny = []
    for i in (d.get("needs_you") or {}).get("items") or []:
        ny.append({"key": f"ask-{i['id']}", "id": i["id"], "what": i["line"], "why": "waits on your word (STATE.md)", "unblocks": "the Lead's next step on it",
                   "by": i.get("by"), "src": i.get("src")})
    later = []
    for r in (d.get("risks") or {}).get("items") or []:
        if r.get("owner") != "founder" or r.get("status") == "closed":
            continue
        td = r.get("trigger_date")
        trig = r.get("trigger") if r.get("trigger") and not re.match(r"\d{4}-\d\d-\d\d$", str(r["trigger"])) else None
        it = {"key": f"risk-{r['id']}", "id": r["id"], "what": r.get("mitigation") or r["risk"], "why": r["risk"],
              "unblocks": trig or "the launch gate", "by": td, "src": "cockpit/risks.json (owner founder)"}
        (ny if td and td <= today.isoformat() else later).append(it)
    for it in ny + later:                               # Lead 65 (A115): no decision codes in his view; the panels keep them
        for k in ("what", "why", "unblocks"):
            it[k] = nocode(it.get(k))
    needs = {"items": ny, "later": later, "count": len(ny)}
    # Stuck or at risk: each with owner, since and next step
    stuck = []
    lanes = ((d.get("top_numbers") or {}).get("lanes") or {}).get("idle") or {}
    if lanes.get("names"):
        stuck.append({"what": f"{len(lanes['names'])} lanes idle (no push in 90 min)", "items": lanes["names"], "owner": "current Lead",
                      "since": "over 90 min", "next": "wake or close each", "src": lanes.get("src")})
    lq = d.get("lead_queue") or {}
    if lq.get("items"):
        stuck.append({"what": f"{len(lq['items'])} pull requests wait for the Lead's answer",
                      "items": [f"#{q['n']} {q['title']} ({q['age_h']} h)" for q in lq["items"]], "owner": "current Lead",
                      "since": f"oldest {max(q['age_h'] for q in lq['items'])} h", "next": "answer each", "src": lq.get("src")})
    for h in (d.get("health") or {}).get("items") or []:
        if h["state"] == "red":
            bl = [f"{b['id']} ({b.get('sev', '')}) on {', '.join(b.get('caps') or [])}" for b in h.get("bugs") or [] if isinstance(b, dict)]
            stuck.append({"what": h["name"] + (f": {len(bl)}" if bl else f": {len(h.get('files') or [])} files" if h.get("files") else ""),
                          "items": bl or [f.get("path", "") for f in (h.get("files") or [])][:40], "owner": h.get("owner") or "current Lead",
                          "since": "over 48 h" if bl else "see Health", "next": h.get("action") or "", "src": "Health check " + str(h["id"])})
    if qa_not_built:
        stuck.append({"what": f"{len(qa_not_built)} capabilities qa found unfinished after all their listed parts merged",
                      "items": [f"{lbl(m)}: qa reads {r1_qa.get(m)}" for m in qa_not_built], "owner": "current Lead (a builder takes the missing part)",
                      "since": "qa's last test", "next": "name the missing part in BACKLOG and the checklist row, then build it", "src": qa_src})
    if unlisted:
        stuck.append({"what": f"{len(unlisted)} Release 1 capabilities missing from qa's file",
                      "items": [lbl(m) for m in unlisted], "owner": "qa (through the current Lead)", "since": "not listed yet",
                      "next": "qa adds each as Not built, Partial or Proven", "src": qa_src})
    # The choke: the stage holding most work now (records and backlog left out)
    st = {s["id"]: s for s in (d.get("value_stream") or {}).get("stages") or []}
    plain = {"building": "Being built", "review": "Being reviewed", "ci": "Automatic checks", "queue": "Waiting to merge"}
    cand = [(plain[k], (st[k]["count"] or {}).get("v")) for k in ("building", "review", "ci", "queue") if k in st]
    cand.append(("Built, waiting for qa", len(waiting)))
    cand = [c for c in cand if c[1] is not None]
    ch = max(cand, key=lambda c: c[1]) if cand else (None, None)
    t3 = ((d.get("top3") or {}).get("cards") or {}).get("today") or {}
    choke = {"stage": ch[0], "count": ch[1], "stages": [{"name": a, "count": b} for a, b in cand],
             "doing": (li or {}).get("choke_action") or t3.get("what") or "not reported by the Lead",
             "doing_class": "reported", "not_started": None,
             "src": "open pull requests by station (factory-board rules) and Built minus Proven"}
    choke["not_started"] = release["stage_counts"]["planned"] if r1_qa else None   # the same 'Planned' as the stage bar
    reds = [h for h in (d.get("health") or {}).get("items") or [] if h["state"] in ("red", "amber")]
    health = {"light": (d.get("health") or {}).get("light"), "items": [{"name": h["name"], "state": h["state"], "owner": h.get("owner")} for h in reds]}
    return {"words": "Planned = not started yet · In progress = someone is building it, or qa found part of it working · Built = all its code "
                     "merged, waiting for qa · Proven = qa tested it like a person and it passed. Only Proven counts as delivered.",
            "release": release, "today": today_b, "needs": needs, "stuck": stuck, "choke": choke, "health": health,
            "rule": "P-636"}


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

    def put(key, label, what, window, n, n_of, read, x=None, band=None, n_reason=None, src=None, cls=None, n_override=None,
            todo=None, behind=None):
        n = n_override if n_override is not None else n
        x = x if isinstance(x, dict) else {}
        n = n if isinstance(n, int) and not isinstance(n, bool) else None
        if n_override is None and x and ("value" in x or "v" in x) and val(x) is None:
            n = None                                     # a number not measured has no sample (review M3)
        e = {"label": label, "what": what, "window": window, "n": n, "n_of": n_of, "read": read,
             "src": src or x.get("src") or "the data script (cockpit-data.py)", "class": cls or x.get("class") or "parsed",
             "sha": x.get("sha"), "as_of": x.get("as_of") or taken}
        if band:
            e["band"] = band
        if todo:                                         # 16 Nov: what to do and who, shown in the panel a click opens
            e["todo"] = todo
        if behind:                                       # the rows, PRs, files or bugs behind the number (at most 40)
            e["behind"] = [str(z) for z in behind[:40]] + ([f"… and {len(behind) - 40} more"] if len(behind) > 40 else [])
        if n is None:
            e["n_reason"] = n_reason or x.get("reason") or "not measured: the data holds no sample size for this number"
        E[key] = e

    wn = d.get("whats_new") or {}
    if wn:
        put("whats_new.box", "What's new this week", "The weekly check of Claude Code and Claude.ai news (P-611): items marked adopt yes, later or "
            "no with why, and up to three actions. The big number counts adopt yes; the full list and the actions follow below.",
            f"ISO week {wn['week']} (IST); the file is for {wn.get('file_week') or 'no week'}", len(wn["items"]) if wn["state"] not in ("missing", "invalid") else None,
            "new items listed in the file", "Checked this week is green. Unchecked: amber from Monday 12:00 IST, red from Tuesday 12:00 IST. "
            "A missing file reads not checked, never 0.", wn["adopt_yes"], n_reason=wn["adopt_yes"].get("reason"))
    sm, P, F, C = d["summary"], d["pace"], d["forecast"], d["capacity"]
    rows_n = val(P["rows_total"])
    # ---- the key-number strip
    ny = d["needs_you"]
    put("strip.needs_you", "Needs you", "Only what is needed from you: founder asks whose status asks for your word or act (an ask the Lead or a lane is working "
        "is not yours to do), F ids the For the founder line marks open, and ids the Waiting on the founder line names that are not "
        "counted already. Each says in one line what to decide or do, and by when if the record names a date. PR questions for the "
        "tech lead are on the Factory tab.", now_w + " (STATE.md at the records commit)",
        val(sm["needs_you"]), "items counted (" + str(len(ny.get("asks") or [])) + " asks, " + str(len((ny.get("for_founder") or {}).get("open_ids") or [])) +
        " F ids, " + str(len((ny.get("waiting_line") or {}).get("new_ids") or [])) + " Waiting ids)", "Lower is better; each item waits on your word.", sm["needs_you"],
        band="0 open items", todo=("decide or do each item below (you, the founder); the Lead closes it in STATE.md once done"
                                   if val(sm["needs_you"]) else "nothing: no item waits on you"),
        behind=needs_lines(ny))
    put("strip.release1", "Release 1 built", "Release 1 capabilities (Build rows of MVP-CHECKLIST.md §A) whose every BACKLOG part has merged through an "
        "app-code PR; proven = qa's Works verdict for the row.", "all time, from 13 Nov to " + t_ist, rows_n, "Build rows in the checklist",
        up + f" Release 1 is done when all {rows_n} rows are built and proven.", P["built"],
        todo="nothing for you: the Lead and the builders finish the rows not built yet (Capabilities tab)",
        behind=built_lines(d))
    w = val(sm["works"]) or [None, None]
    put("strip.poc", "Proof of concept", "Proof-of-concept capabilities that read Works in qa/CAPABILITIES.md on main (milestones M2, T, M3, M4).",
        now_w + " (main's qa/CAPABILITIES.md)", w[1], "proof capabilities", up + " A separate number from Release 1, never mixed (P-592).", sm["works"],
        behind=poc_lines(d))
    nd = val(sm["next_date"])
    dated = [x for x in d["plan"]["dates"] if x.get("date")]
    put("strip.next_date", "Next date", "The next dated row of the hand-kept plan (cockpit/plan.json); committed dates are the founder's, forecasts are estimates.",
        "dates from today on", len(dated), "dated plan rows", "Days left counts calendar days; a forecast is not a promise.", sm["next_date"],
        behind=[f"{x['date']} · {x.get('kind') or ''} · {x.get('what') or ''}" for x in sorted(dated, key=lambda x: x["date"])])
    put("strip.health", "Health", "One light from seven checks: main CI, board data age, records on main, guards, burn, Major bugs on Works capabilities, "
        "data trust.", now_w + "; data age by your clock", None, "checks", "Green: all pass. Amber: one is not measured or near its limit. Red: one fails "
        "(its action and owner show on tap).", src="health.items (seven checks) + the page's data age", cls="measured", n_override=len(d["health"]["items"]),
        todo="each red or amber check says what to do and who (the Health card lists them)",
        behind=[f"{i['id']} {i['name']}: " + ("by your clock (board data age)" if i["state"] == "page" else i["state"]) +
                (f" — {i['action']} ({i.get('owner') or ''})" if i["state"] in ("red", "amber") and i.get("action") else "")
                for i in d["health"]["items"]])
    R = d["resources"]
    put("strip.plan_use", "Plan use", "Share of the weekly Claude plan used, as the Lead typed it; burn = percent used per hour; paid US$ today.",
        "the current weekly plan (resets " + str(val(R["weekly_resets"]) or "not reported") + "); reading as of " + str(R["weekly_pct"].get("as_of") or "not reported"),
        1 if val(R["weekly_pct"]) is not None else None, "Lead-reported reading", "The big number has no band: it grows through the week. "
        "Lower burn (the small line) is better; paid stays US$0 with live AI off.", R["weekly_pct"],
        band="for the burn on the small line: 3% or less an hour (" + COMPASS + ", P-440)", n_reason="not measured: the Lead input has no weekly_pct")
    # ---- the three top numbers (16 Nov, founder on a phone: every count lists what is behind it)
    tn = d.get("top_numbers") or {}
    W_ = tn.get("works_today") or {}
    if W_:
        put("top.works_today", "Works today", "Release 1 capabilities (MVP-CHECKLIST.md §A) that reached qa Works since 00:00 IST today.",
            "today from 00:00 IST to " + t_ist, val(W_), "capabilities at Works today", up + f" Target {W_.get('target')} a day ({W_.get('target_src') or ''}).",
            W_, n_reason=W_.get("reason"), behind=works_today_lines(d, W_),
            todo=None if val(W_) else "nothing for you: qa scores the built rows; the Lead keeps qa fed (current Lead)")
    LN = tn.get("lanes") or {}
    if LN.get("working"):
        wk_, st_, id_ = LN.get("working") or {}, LN.get("started") or {}, LN.get("idle") or {}
        put("top.lanes", "Lanes working", "Builder and qa branches with a push in the last 90 min (measured), of the lanes the Lead says are started "
            "(Lead-reported); idle = started with no push in 90 min.", "the last 90 min to " + t_ist, val(wk_), "branches with a push in 90 min",
            up + " Idle lanes are the Lead's to wake or close.", wk_, n_reason=wk_.get("reason"),
            todo=("the Lead wakes or closes the idle lanes (current Lead)" if (id_.get("names") or []) else None),
            behind=[f"working: {x}" for x in wk_.get("names") or []] + [f"idle: {x}" for x in id_.get("names") or []] +
                   [f"started (Lead): {x}" for x in st_.get("names") or []])
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
        "); a high date past it means the pace must rise.", EB, n_override=EB.get("n"))  # days measured is a real sample even when the band is retired
    LD = P.get("leading") or {}
    lp, lc, lv = LD.get("parts_merged") or {}, LD.get("caps_all_parts") or {}, LD.get("first_verdict_works_pct") or {}
    put("pace.leading_parts", "Parts merged a day", "Release 1 changes (BACKLOG parts) whose app-code merge (for an id in parts, its last needed part) fell on the last full IST day.",
        "IST day " + str(lp.get("day") or "none yet") + " (00:00 to 24:00); today so far: " + str(lp.get("today_so_far")), val(lp),
        "parts merged that day", up + " A leading number: parts merge before capabilities are built.", lp)
    put("pace.leading_caps", "Capabilities with all parts merged", "Build rows whose BACKLOG parts have all merged (built), cumulative.",
        "from 13 Nov to " + t_ist + "; new on " + str(lc.get("day") or "no full day yet") + ": " + str(lc.get("new_on_day")),
        lc.get("rows_total"), "Build rows checked", up + " Proven comes later, at qa's Works verdict.", lc)
    put("pace.leading_fv", "Works at the first qa verdict", "Share of qa capabilities whose first verdict on main was Works (not Partial or Broken).",
        "first verdicts from 13 Nov to " + t_ist + " (qa/CAPABILITIES.md history on main, last 30 days)", lv.get("n"),
        "capabilities with a first verdict", up + " A low share means rework before Works (P-606).", lv, n_override=lv.get("n"))  # 0 verdicts is a real sample; the share is what is not measured
    lr = LD.get("first_verdict_works_pct_r1") or {}
    put("pace.leading_fv_r1", "Release 1: Works at the first qa verdict", "Share of qa's Release 1 capabilities (R ids) whose first verdict on "
        "main was Works (not Partial or Broken). Kept apart from the proof-of-concept share beside it, never mixed (Lead 64, 16 Nov).",
        "first verdicts from 13 Nov to " + t_ist + " (qa/CAPABILITIES.md history on main, last 30 days)", lr.get("n"),
        "Release 1 capabilities with a first verdict", up + " A low share means rework before Works (P-606).", lr, n_override=lr.get("n"),
        behind=[f"{i} first verdict" for i in lr.get("ids") or []])
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
        C["ready_rows"].get("n"), "rows with a brief", "Rows ready with nobody on them mean a lane could start.", C["ready_rows"],
        todo="the Lead starts a lane on a ready row when there is room (current Lead)",
        behind=[f"{r} ready" for r in C["ready_rows"].get("rows") or []] +
               [f"{x['id']} not ready: waits on " + ", ".join(x["waits_on"] + x["non_id"]) for x in C["ready_rows"].get("not_ready") or []])
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
        put(f"capacity.{k}.wait_h", lbl + ": longest", "The oldest item's wait: " + stg["wait_h"].get("src", "") + ".", now_w, stg["wait_h"].get("n"),
            "items with a wait time", down, stg["wait_h"], band=f"limit {stg['limit_h']:g} h (FORMULAS.md §2)")
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
             3: "Red when the oldest record change not on main is over 24 h old.", 4: "Red when a guard's newest run failed.",
             5: "Red above the limit.", 6: "Red when such a bug is over 48 h old.", 7: "Red when numbers disagree or an invariant breaks."}
    bands = {5: "3% or less an hour (" + COMPASS + ", P-440)", 2: "under 45 min (the board's rule)",
             6: "about 0 Major or Critical found after merge (" + COMPASS + "); this check counts every open one on a Works capability"}
    for it in d["health"]["items"]:
        put(f"health.{it['id']}", it["name"], it["name"] + ": " + (it.get("detail") or ""), windows[it["id"]], it.get("n"), it.get("n_of") or "",
            reads[it["id"]], band=bands.get(it["id"]), src="FORMULAS.md §5 item " + str(it["id"]), cls=it.get("class") or "measured",
            n_reason="computed by the page from generated_at" if it["id"] == 2 else None,
            todo=(it["action"] + " (" + it["owner"] + ")") if it.get("action") else "nothing: this check is green",
            behind=[f"{f['path'].replace(REL + '/', '')} — changed {ist(parse_iso(f['since']))}, commit {f['sha']}" for f in it.get("files") or []] +
                   [f"{b_['id']} ({b_['sev']}) on " + ", ".join(b_["caps"]) for b_ in it.get("bugs") or []])
    # ---- Factory
    lq = d["lead_queue"]
    put("factory.lead_queue", "Questions waiting on the tech lead", "Open PRs whose newest 'Question for the tech lead' has no later answer.",
        "open PRs read at the refresh", val(lq["count"]), "PRs with an open question", down, lq["count"])
    for st in d["value_stream"]["stages"]:
        put(f"vsm.{st['id']}.count", st["name"], "Items in this factory stage now: " + st["count"]["src"] + ".", now_w, val(st["count"]), "items in the stage",
            "Counts move left to right; a pile-up shows where work waits.", st["count"])
        put(f"vsm.{st['id']}.wait_h", st["name"] + ": median wait", st["wait_h"]["src"] + ".",
            {"ci": "the last 2 days", "queue": "flow-measure's runs read"}.get(st["id"], now_w),
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
    put("quality.demotions", "Works demotions (proxy)", "Days when the Works total on main fell from one day's end to the next. A proxy: a "
        "demotion offset by a new Works the same day is not seen, and several on one day count once. The compass's 'at most 1 Works → Partial "
        "demotion a day' needs per-capability history, not read yet.", "the 14 IST days to " + t_ist,
        sum(1 for x in dem if x is not None) or None, "days with a Works reading", down, Q["demotions"],
        n_reason="not measured: Works history not read (offline or failed)")
    fl = val(Q["flaky"]) or {}
    put("quality.flaky", "Flaky ledger", "Lines of tools/flaky-ledger.tsv: release or hand lines (big) and rule lines.", now_w,
        (fl.get("rule_lines") or 0) + (fl.get("release_or_hand_lines") or 0) if fl else None, "ledger lines", down, Q["flaky"])
    rr = Q["review_rounds"] if isinstance(Q["review_rounds"], dict) else {}
    put("quality.review_rounds", "Review rounds", "Median \"Reviewer:\" verdict comments per code PR merged (tools/flow-measure.py); the small "
        "line is the share over 2 rounds.", "flow-measure's 7 days", rr.get("n"), "code PRs merged", down, Q["review_rounds"],
        band="at most 2 rounds a PR (P-277)", n_reason=rr.get("src"))
    pl = d["pipeline"]
    w7 = "the 7 days to " + t_ist
    put("pipeline.deploy_freq", pl["deploy_freq"]["label"], "PRs merged to main ÷ 7; the small line counts app-code PRs only (P-500).", w7,
        pl["deploy_freq"].get("n"), f"PRs merged (of them app code: {nn(pl['deploy_freq']['app_code'].get('n'))})", up, pl["deploy_freq"])
    put("pipeline.lead_time_h", pl["lead_time_h"]["label"], "Median hours from PR opened to merged.", w7, pl["lead_time_h"].get("n"), "PRs merged", down,
        pl["lead_time_h"])
    put("pipeline.change_fail", pl["change_fail"]["label"], "Share of finished nightly runs on main that failed (a proxy for change failure).", w7,
        pl["change_fail"].get("n"), f"finished nightly runs (reverts: out of {nn(pl['change_fail']['reverts'].get('n'))} PRs merged)",
        down + " The small line's batch failures have their band under Merge-queue batches.",
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
            "Behind lanes go to " + str((c.get("owner") or {}).get("name") or "the owner") + ". Class: the weaker of reported and measured.",
            src=oc.get("src"), cls="reported", band="0 lanes behind")
    # ---- board v63 (P-613, P-615): parts merged, behaviour numbers, Customer box
    pm = P.get("parts_merged") or {}
    put("pace.parts_merged", "Parts merged", "Release 1 parts (the distinct BACKLOG ids the checklist section A names) that a merged pull request "
        "names in its title; records-only PRs never count.", "from the first merge to " + t_ist, pm.get("total"), "Release 1 parts",
        up + " Parts merge before a capability is built: this moves every day even when 'built' does not.", pm, n_override=pm.get("total"))
    B_ = d.get("behaviour") or {}
    fa, rc, tc = B_.get("founder_asks_day") or {}, B_.get("rules_changes_day") or {}, B_.get("target_changes_week") or {}
    nm_ = lambda x, k: str(x.get(k)) if x.get(k) is not None else "not measured"
    put("behaviour.asks", "Your asks a day", "Ask ids in STATE.md's Founder asks table dated on the last full IST day (a row 'A49-A67' counts 19); "
        "today so far: " + nm_(fa, "today_so_far") + "; mean of the 6 days before today: " + nm_(fa, "mean_7d") + ".",
        ("IST day " + str(fa.get("day")) + " (00:00 to 24:00); " + str(fa.get("undated")) + " older asks carry no date and are left out") if val(fa) is not None else "not measured",
        val(fa), "asks that day", "Neither good nor bad by itself: many asks a day split the Leads' time between asks and building.", fa)
    put("behaviour.rules", "Rule changes a day", "Commits that change RULES.md (the rules in force) on the records branch, on the last full IST day; "
        "today so far: " + nm_(rc, "today_so_far") + "; mean of the 6 days before today: " + nm_(rc, "mean_7d") + ".",
        ("IST day " + str(rc.get("day")) + " (00:00 to 24:00), git log") if val(rc) is not None else "not measured", val(rc), "commits that day",
        down + " Each change is re-read by every Lead and lane before work.", rc)
    put("behaviour.targets", "Target changes a week", "DECISIONS.md rows dated in the last 7 IST days whose bold text has a clause naming a target with a date or a "
        "count, not kept or standing: " + (", ".join(tc.get("ids") or []) or "none") + ".",
        ("7 IST days " + str((tc.get("window") or {}).get("from")) + " to " + str((tc.get("window") or {}).get("to"))) if val(tc) is not None else "not measured", val(tc), "target changes",
        down + " A moved target resets the pace line the board measures against.", tc)
    cu = d.get("customer") or {}
    put("customer.firm", "First firm", "The first real firm (named by role) and its date, from cockpit/plan.json first_firm.", "the records at " + t_ist,
        None, "", "Set once the founder names the firm and the day its data goes in.", cu.get("first_firm"),
        n_reason=(cu.get("first_firm") or {}).get("reason") or "one record, not a sample")
    put("customer.journey", "Journey steps walked", "The first firm's journey steps walked end to end, of all its steps.", "the records at " + t_ist,
        None, "", up, cu.get("journey_walked"))
    co, ld = cu.get("counsel_open") or {}, cu.get("launch_done") or {}
    put("customer.counsel", "Counsel and expert items open", "Launch conditions in the checklist section C that name counsel or the immigration "
        "expert and are not Done: " + (", ".join(co.get("ids") or []) or "none") + ".", "the checklist at " + t_ist, ld.get("total"),
        "launch conditions read", down + " Each one needs a booked person; none is booked yet (P-541).", co, n_override=ld.get("total"))
    put("customer.launch", "Launch conditions done", "Rows of the checklist section C (production readiness) whose status starts with Done.",
        "the checklist at " + t_ist, ld.get("total"), "launch conditions", up + " All must be Done before the first real firm's data (P-589).",
        ld, n_override=ld.get("total"))
    # ---- P-636 first screen: each answer opens its items, source and time
    fs = d.get("first")
    if fs:
        R_, T_, N_ = fs["release"], fs["today"], fs["needs"]
        nm_ = {r["map"]: r["cap"] for r in (d.get("capability_table") or {}).get("rows") or []}
        lb = lambda m: f"R1.{m} {nm_.get(m, '')}".strip()
        put("first.release", "Release 1", "Where each of the 101 capabilities stands: Planned, In progress, Built (all its code merged) "
            "or Proven (qa tested it like a person and it passed).", now_w, R_["planned"], "Release 1 capabilities",
            "Only Proven counts as delivered (P-636). " + R_["why"], src=R_["src"], cls="parsed",
            todo=("nothing for you: the builders finish rows and qa proves the Built ones (current Lead)"),
            behind=[f"Proven: {lb(m)}" for m in R_["proven_ids"]] + [f"Built, waiting for qa: {lb(m)}" for m in R_["waiting_ids"]] +
                   [f"not in qa's file yet: {lb(m)}" for m in R_["unlisted_ids"]])
        sn_ = fs.get("stuck_now")
        if sn_:
            put("first.stucknow", "Stuck now", "Whether work is jammed right now: the last merge to main, test runs waiting for a machine, "
                "sessions waiting for an answer or failed, and approved pull requests not merged.", now_w,
                (d.get("reconcile_keys") or {}).get("stuck_approved_over_60"), "approved pull requests waiting over 60 min",
                " · ".join(x["text"] for x in sn_["lines"]), src="; ".join(f"{x['key']}: {x['src']}" for x in sn_["lines"]), cls="measured",
                behind=[f"{x['text']} ({x['light']})" for x in sn_["lines"]] + [i for x in sn_["lines"] for i in x.get("items") or []])
        en_ = fs.get("enforced")
        if en_:
            put("first.enforced", "Enforced", "Whether the engineering set-up the Lead approved is in force (the set-up check, CK-1) and whether the "
                "pipeline is running (the heartbeat that runs every 30 min outside every session, CK-2). Machines write both; "
                "a heartbeat over 45 min old shows as unknown, never yes.", now_w, None, "",
                " · ".join(x["text"] for x in en_["lines"]), src="; ".join(f"{x['key']}: {x['src']}" for x in en_["lines"]), cls="measured",
                behind=[f"{x['text']} ({x['light']})" for x in en_["lines"]] + [i for x in en_["lines"] for i in x.get("items") or []])
        fl_ = d.get("flow")
        if fl_:
            put("first.flow", "Flow", "Which part of the work is going well: building, proving, merging, or the people and machines behind them. "
                "Each light is green, amber or red against its target (P-644).", "today (IST day), with the last 24 h and the last 3 full IST days as trends",
                None, "", fl_["forecast"], src="; ".join(f"{L['name']}: {L['src']}" for L in fl_["lights"]), cls="measured",
                behind=[f"{L['name']} ({L['light']}): {L['big']}; {L['target']}; " + "; ".join(L["lines"]) for L in fl_["lights"]]
                + [f"{L['name']} today: {lb(m)}" for L in fl_["lights"] for m in L.get("maps") or []])
        pls = fs.get("proven_lines") or []
        put("first.today", "Proven: today, this week, overall", "How many capabilities qa proved today and this week against "
            "P-644's 10 a day, and overall against all of Release 1 with the date at the current pace.", "today (IST), this week "
            "(Monday to Sunday IST) and all to date", (d.get("reconcile_keys") or {}).get("flow_works_today"), "capabilities proven today",
            " · ".join(x["text"] for x in pls), src="; ".join(f"{x['key']}: {x['src']}" for x in pls), cls="measured",
            todo=T_.get("plan") or None, behind=[f"{x['text']} ({x['light']})" for x in pls] + [f"proven today: {lb(m)}" for m in (pls[0].get("maps") if pls else []) or []]
            + [f"Built, waiting for qa: {lb(m)}" for m in R_["waiting_ids"]])
        put("first.needs", "Needs you", "The steps only you can take that are due now. Set each one's status; the Lead's next check reads it.", now_w, N_["count"], "items", "Lower is better.", src="STATE.md › Founder asks; "
            "cockpit/risks.json (owner founder, dated today or earlier)", cls="parsed",
            behind=[f"{x['id']}: {x['what']}" + (f" — by {x['by']}" if x.get("by") else "") for x in N_["items"]] +
                   [f"later (no date or a later date): {x['id']}: {x['what']}" for x in N_["later"]])
        put("first.stuck", "Stuck or at risk", "Work that is not moving, each with who owns it and the next step.", now_w, len(fs["stuck"]), "items", "Lower is better.",
            src="the board's own measures, each named in its line", cls="measured",
            behind=[f"{s['what']} · owner {s['owner']} · next: {s['next']}" for s in fs["stuck"]])
        C_ = fs["choke"]
        put("first.choke", "The choke", "The step of the work where the most items are waiting right now.", now_w, C_["count"], "items in that stage", "Work flows when the "
            "biggest stage shrinks.", src=C_["src"], cls="measured", todo="being done (Lead-reported): " + str(C_["doing"]),
            behind=[f"{s['name']}: {s['count']}" for s in C_["stages"]] + ([f"Planned (not started): {C_['not_started']}"] if C_["not_started"] is not None else []))
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


# ---------------------------------------------------------------- lead watch (B201, A117, P-639)
# The 30-minute check reads what the founder's board shows: the Today card and the Stuck panel exactly as first_screen built
# them into the published data.json (same rules, same source: no second formula), and checks each against its primary
# source with data lead-watch.sh already holds (open PRs, qa/CAPABILITIES.md on main). The founder's view is not changed.
# Usage: python3 tools/cockpit-data.py --watch <data.json> --open-prs <gh pr list json> --caps-main <CAPABILITIES.md>
WATCH_MAX_LINES = 40                             # B201 cap: at most ~40 lines per check
WATCH_ITEMS = 5                                  # items named per Stuck line (the rest counted)
WATCH_STALE_H = 2.0                              # Lead input and board data older than 2 h count as not updated (README)
WATCH_LOOKUPS = 3                                # B201 cap: at most 3 GitHub reads per check (8 s timeout each is the worst case)
WATCH_ITEM_ACTS = 8                              # disagree lines per check before one "and N more"
AGE_H = re.compile(r"\((\d+(?:\.\d+)?) h\)\s*$")
PR_NUM = re.compile(r"^#(\d+)\b")


def watch_panels(d):
    """The board's Today card and Stuck panel, as published (data.json › first, built by first_screen). (None, None) when the
    board data has no first screen (a board older than P-636)."""
    f = (d or {}).get("first") or {}
    if "today" not in f and "stuck" not in f:
        return None, None
    return f.get("today") or {}, f.get("stuck") or []


def _hm(iso, text=None):
    if text:
        return text
    if not iso:
        return "not set"
    try:
        return datetime.fromisoformat(str(iso).replace("Z", "+00:00")).astimezone(IST).strftime("%-d %b, %H:%M IST")
    except (ValueError, TypeError):
        return str(iso)


def watch_today_line(t):
    """One line equal to the board's Today card: proven of goal, by when, short, Built waiting for qa."""
    if not t:
        return "today  board has no Today card"
    if t.get("goal") is None:
        return f"today  {t.get('proven')} Proven, no proving goal set (Lead input today_goal), {t.get('waiting')} Built waiting for qa"
    return (f"today  {t.get('proven')} of {t.get('goal')} Proven by {_hm(t.get('by'), t.get('by_text'))}, "
            f"{t.get('short', 0)} short, {t.get('waiting')} Built waiting for qa")


def _oldest_first(items):
    """Items carrying their own age "(N h)" go oldest first; items without one keep the board's order after them."""
    aged = [(float(m.group(1)), i) for i, x in enumerate(items) for m in [AGE_H.search(str(x))] if m]
    if not aged:
        return list(items)
    order = [i for _, i in sorted(aged, key=lambda a: (-a[0], a[1]))]
    return [items[i] for i in order] + [x for i, x in enumerate(items) if i not in set(order)]


def watch_stuck_lines(stuck):
    """One ACT line per Stuck panel entry: what, its items oldest first with age, the next step."""
    out = []
    for s in stuck or []:
        items = _oldest_first(s.get("items") or [])
        named = "; ".join(str(x) for x in items[:WATCH_ITEMS]) + (f"; +{len(items) - WATCH_ITEMS} more" if len(items) > WATCH_ITEMS else "")
        out.append(f"ACT   stuck: {s.get('what')} — {named or 'no items named'} ({s.get('since') or 'not dated'}) — next: {s.get('next') or 'not named'}")
    return out


def _r1_status(caps_text):
    """R1.n -> status from qa/CAPABILITIES.md (parse_caps, the board's own parse)."""
    return {int(k.split(".")[1]): v["status"] for k, v in parse_caps(caps_text).items() if re.fullmatch(r"R1\.\d+", k)}


def _map_of(label):
    m = re.match(r"R1\.(\d+)\b", str(label))
    return int(m.group(1)) if m else None


def watch_source_checks(d, open_prs, caps_text, pr_state=None, known_states=()):
    """P-639: never take the board's word blindly. Each Stuck entry and the Today numbers are checked against the primary
    source the board cites, with data the check already holds: open PRs (GitHub) and qa/CAPABILITIES.md on main.
    pr_state(n) -> "merged" / "closed" / "open" / None answers only for a PR the board names that is not in the open list.
    Returns (lines, checked, disagree, unchecked names)."""
    today, stuck = watch_panels(d)
    lines, checked, bad, unchecked, lookups = [], 0, 0, [], [0]
    is_open = {int(p["number"]) for p in open_prs or []} if open_prs is not None else None
    r1 = (_r1_status(caps_text) or None) if caps_text and caps_text.strip() else None
    works = lambda st: bool(QA_WORKS_W.match(st or ""))

    def disagree(item, x, y):
        nonlocal bad
        bad += 1
        lines.append(f"ACT   board vs source disagree: {item} — board says {x}, source says {y} — fix the script or the board row")

    def capped(rows):                                # rows: (item, board, source) mismatches of one check
        for item, x, y in rows[:WATCH_ITEM_ACTS]:
            disagree(item, x, y)
        if len(rows) > WATCH_ITEM_ACTS:
            disagree(f"{len(rows) - WATCH_ITEM_ACTS} more", "as above", "as above")

    rel = (d.get("first") or {}).get("release") or {}
    if today and r1 is not None:
        checked += 1
        pids = rel.get("proven_ids")
        if pids is None:                             # older board data: the count only, against every R1 row at Works
            n_works = sum(1 for st in r1.values() if works(st))
            ok_ = today.get("proven") == n_works
            src_y = f"{n_works} R1 rows read Works in qa/CAPABILITIES.md on main"
        else:
            notw = [m for m in pids if not works(r1.get(m))]
            ok_ = not notw and today.get("proven") == len(pids)
            src_y = (f"qa does not read Works for {', '.join(f'R1.{m}' for m in notw)}" if notw else
                     f"{len(pids)} proven ids for a Today of {today.get('proven')}")
        if ok_:
            lines.append(f"ok    board agrees: Today {today.get('proven')} Proven (each reads Works in qa/CAPABILITIES.md on main)")
        else:
            disagree("Today Proven", today.get("proven"), src_y)
        wids = rel.get("waiting_ids")
        if wids is not None:
            checked += 1
            rows = [(f"R1.{m} Built waiting for qa", "waiting for qa", f"qa reads {r1.get(m)}") for m in wids if works(r1.get(m))]
            if rows:
                capped(rows)
            else:
                lines.append(f"ok    board agrees: Today {today.get('waiting')} Built waiting for qa (none reads Works on main)")
    elif today:
        unchecked.append("Today (qa/CAPABILITIES.md on main not read)")
    for s in stuck or []:
        what = str(s.get("what") or "")
        nums = [int(m.group(1)) for x in s.get("items") or [] for m in [PR_NUM.match(str(x))] if m]
        maps = [m for m in (_map_of(x) for x in s.get("items") or []) if m is not None]
        if "wait for the Lead" in what and nums:
            if is_open is None:
                unchecked.append(what + " (open PRs not read)")
                continue
            checked += 1
            rows, lost = [], []
            for n in nums:
                if n in is_open:
                    continue
                st = pr_state(n) if pr_state and (lookups[0] < WATCH_LOOKUPS or n in known_states) else None
                if pr_state and n not in known_states:
                    lookups[0] += 1
                if not st:
                    lost.append(f"#{n}")
                elif st != "open":
                    rows.append((f"#{n} waits for the Lead's answer", "open and waiting", st))
            if lost:
                unchecked.append(f"{', '.join(lost)} not open and state not read")
            if rows:
                capped(rows)
            elif not lost:
                lines.append(f"ok    board agrees: {what} (all {len(nums)} open on GitHub)")
        elif "reads Not built" in what and maps:
            if r1 is None:
                unchecked.append(what + " (qa's file not read)")
                continue
            checked += 1
            rows = [(f"R1.{m} reads Not built", "Not built", f"qa reads {r1.get(m) or 'no row'}") for m in maps
                    if not (r1.get(m) or "").startswith("Not built")]
            capped(rows) if rows else lines.append(f"ok    board agrees: {what} (each reads Not built on main)")
        elif "missing from qa" in what and maps:
            if r1 is None:
                unchecked.append(what + " (qa's file not read)")
                continue
            checked += 1
            rows = [(f"R1.{m} missing from qa's file", "missing", f"qa has a row: {r1[m]}") for m in maps if m in r1]
            capped(rows) if rows else lines.append(f"ok    board agrees: {what} (none has a row on main)")
        else:
            unchecked.append(what.split(":")[0])
    return lines, checked, bad, unchecked


def watch_lines(d, open_prs=None, caps_text=None, pr_state=None, now=None, known_states=()):
    """Every line the check prints for the board (B201 + P-639), at most WATCH_MAX_LINES."""
    today, stuck = watch_panels(d)
    if today is None:
        return ["board  data.json has no first screen (board older than P-636): Today and Stuck not read"]
    out = []
    gen = (d.get("freshness") or {}).get("generated_at")
    try:
        age = (now or datetime.now(timezone.utc)) - datetime.fromisoformat(str(gen).replace("Z", "+00:00")) if gen else None
    except (ValueError, TypeError):                  # a non-ISO or timezone-less time: its age is not known (an ACT below)
        gen = None
    if gen:
        h = max(0.0, round(age.total_seconds() / 3600, 1))
        out.append(f"board  as of {_hm(gen)} ({h} h old): {len(stuck)} stuck")
        if h > WATCH_STALE_H:
            out.append(f"ACT   board data {h} h old (over {WATCH_STALE_H:g} h): refresh the board (cockpit/README.md) before trusting Today and Stuck")
    else:
        out.append("ACT   board data has no generated_at: its age is not known; refresh the board (cockpit/README.md)")
    out.append(watch_today_line(today))
    out += watch_stuck_lines(stuck)
    sl, checked, bad, unchecked = watch_source_checks(d, open_prs, caps_text, pr_state, known_states)
    out += sl
    out.append(f"board vs source: {checked} checked · {bad} disagree" + (f" · not checked here: {'; '.join(unchecked)}" if unchecked else ""))
    if len(out) > WATCH_MAX_LINES:
        cut = len(out) - WATCH_MAX_LINES + 1
        keep = out[:WATCH_MAX_LINES - 1]
        acts = sum(1 for x in out[WATCH_MAX_LINES - 1:] if x.startswith("ACT"))
        out = keep + [f"ACT   board: {cut} more lines cut ({acts} of them ACT): read data.json › first.stuck" if acts else
                      f"warn  board: {cut} more lines cut"]
    return out


def watch_main(argv):
    ap = argparse.ArgumentParser(prog="cockpit-data.py --watch")
    ap.add_argument("--watch", required=True, help="the board's data.json")
    ap.add_argument("--open-prs", help="gh pr list --json number,... output (the open PRs lead-watch.sh already read)")
    ap.add_argument("--caps-main", help="qa/CAPABILITIES.md as on origin/main")
    ap.add_argument("--now")
    ap.add_argument("--no-lookup", action="store_true", help="never ask GitHub about a PR that is not in the open list")
    ap.add_argument("--pr-states", help='JSON {"<n>": "merged"|"closed"|"open"} already known (tests; PRs merged in the window)')
    a = ap.parse_args(argv)
    try:
        d = json.loads(slurp(a.watch))
    except (OSError, ValueError) as e:
        print(f"ACT   board data not read ({a.watch}: {e.__class__.__name__}): refresh the board (cockpit/README.md); "
              "Today and Stuck are not seen by this check")
        return 0
    prs = None
    if a.open_prs:
        try:
            prs = json.loads(slurp(a.open_prs))
        except (OSError, ValueError):
            prs = None
    caps = slurp(a.caps_main) if a.caps_main and os.path.exists(a.caps_main) else None

    known = {}
    if a.pr_states:
        try:
            known = {int(k): v for k, v in json.loads(slurp(a.pr_states)).items()}
        except (OSError, ValueError):
            known = {}

    def pr_state(n):
        if n in known:
            return known[n]
        if a.no_lookup:
            return None
        try:
            r = subprocess.run(["bash", os.path.join(HERE, "gh.sh"), "api", f"repos/{{owner}}/{{repo}}/pulls/{n}", "-q",
                                '(if .merged then "merged" else .state end)'], capture_output=True, text=True, timeout=8, cwd=ROOT)
        except (OSError, subprocess.TimeoutExpired):
            return None
        return (r.stdout.strip() or None) if r.returncode == 0 else None
    now = datetime.fromisoformat(a.now.replace("Z", "+00:00")) if a.now else None
    for line in watch_lines(d, prs, caps, pr_state, now, known_states=set(known)):
        print(line)
    return 0


QA_WORKS_W = re.compile(r"Works(?![A-Za-z])")     # the board's QA_WORKS rule (first_screen, P-636)


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
        if gh.offline:                                   # offline: not read, so not measured (review M4), as before
            raise RuntimeError("offline")
        sp = snap.j("github/pulls.json")                 # Lead 75, 17 Nov: the snapshot's PR list has every merged PR; no REST
        if sp:
            return sorted([{"n": x["number"], "title": x["title"], "created": x["created_at"], "merged": x["merged_at"]} for x in sp
                           if ts(x.get("merged_at")) and ts(x["merged_at"]) >= since14 and not x["head"]["ref"].startswith("mergify/")],
                          key=lambda m: m["merged"], reverse=True)
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
    merged = safe("merged PRs", merged_list, None)
    merged_ok = merged is not None                  # board v57: nothing read → not measured, never 0 (P-596)
    merged = merged or []

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
        gh.tally["app-code-prs.sh (one per PR)"] = gh.tally.get("app-code-prs.sh (one per PR)", 0) + len(todo)
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
    nightly = safe("nightly runs", lambda: gh.get("/actions/workflows/nightly.yml/runs?branch=main&per_page=60")["workflow_runs"], None)
    nightly_ok = nightly is not None
    nightly = nightly or []

    # ---- flow-measure.py (cached)
    fm_path = os.path.join(cache, "flow-measure.json")
    fm = json.load(open(fm_path)) if os.path.exists(fm_path) else None
    fm_age = hours(ts(fm["_as_of"]), NOW) if fm else None
    if not gh.offline and (fm is None or fm_age > a.flow_max_age_h):
        if remaining >= 4200:   # ~3,500 for runs and PRs + ~700 for ENF-782b (verdict comments, queue comments, shard logs)
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
            ERRORS.append(f"flow-measure.py skipped: {remaining} API calls left this hour (needs ~4,200); last answer kept")
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
        w0 = (NOW - timedelta(days=15)).strftime('%Y-%m-%dT%H:%M:%SZ')
        # Lead 75, 17 Nov (fewer REST calls): the snapshot already lists main's versions of the file for 30 days; use it when it
        # holds one from before the window (the version in force when the window opens), else read GitHub as before
        sl = [json.loads(x) for x in (snap.text("git/capabilities_main.jsonl") or "").splitlines() if x.strip()]
        if sl and any(ts(x["date"]) < ts(w0) for x in sl):
            cm = sorted((ts(x["date"]), x["sha"]) for x in sl)
            cm = [c for c in cm if c[0] >= ts(w0)] + [max(c for c in cm if c[0] < ts(w0))]
            cm.sort()
            return works_from(cm)
        cm, page = [], 1
        while page <= 10:
            got = gh.get(f"/commits?sha=main&path={REL}/qa/CAPABILITIES.md&since={(NOW - timedelta(days=15)).strftime('%Y-%m-%dT%H:%M:%SZ')}&per_page=100&page={page}")
            cm += got
            if len(got) < 100:
                break
            page += 1
        cm += gh.get(f"/commits?sha=main&path={REL}/qa/CAPABILITIES.md&until={w0}&per_page=1")   # the version in force when the window opens
        return works_from(sorted(((ts(c["commit"]["committer"]["date"]), c["sha"]) for c in cm)))

    def works_from(cm):
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
            fc = os.path.join(cache, f"cap-{sha}.md")        # the snapshot's copy of that version, when it has one
            txt = (snap.text(f"git/capabilities_main/{sha}.md") or (open(fc, encoding="utf-8").read() if os.path.exists(fc) else None)
                   or gh.get(f"/contents/{REL}/qa/CAPABILITIES.md?ref={sha}", raw=True))
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
        "deploy_freq": V(round(len(m7) / 7, 1) if merged_ok else None, "GitHub: PRs merged to main in the last 7 days ÷ 7 (merge-queue branches left out)",
                         label="Changes reaching the main line, a day", n=len(m7) if merged_ok else None,
                         **({} if merged_ok else {"reason": NOT_READ_MERGED}),
                         app_code=V(round(len(ac7) / 7, 1) if merged_ok else None, "same, only PRs tools/app-code-prs.sh counts as app code (P-500)",
                                    n=len(ac7) if merged_ok else None, **({} if merged_ok else {"reason": NOT_READ_MERGED}))),
        "lead_time_h": V(med(lead7), "added: median hours from PR opened to merged, PRs merged in the last 7 days", label="PR opened to merged (proxy for lead time)",
                         n=len(lead7) if merged_ok else None, **({} if merged_ok else {"reason": NOT_READ_MERGED})),
        "change_fail": V(red_share, f"added: share of finished nightly runs on main that failed, last 7 days (n={len(nl7)})", label="Share turning the main line red (proxy)", n=len(nl7) if nightly_ok else None,
                         **({} if nightly_ok else {"reason": NOT_READ_NIGHTLY}),
                         reverts=V(len(reverts7) if merged_ok else None, "merged PRs titled Revert…, last 7 days", n=len(m7) if merged_ok else None,
                                   **({} if merged_ok else {"reason": NOT_READ_MERGED})),
                         batch_fail=V(round(100 * fmv["queue_failed"] / fmv["queue_runs"], 1) if fm and fmv.get("queue_runs") else None, fm_src + ": queue_failed ÷ queue_runs")),
        "restore_h": V(med(restores), "added: median hours from a failed nightly on main to the next green one, last 60 nightly runs", label="Time from red to green", n=len(restores) if nightly_ok else None,
                       **({} if nightly_ok else {"reason": NOT_READ_NIGHTLY}),
                       open_red=V(ist(red_since) if red_since else None, "nightly on main red since (none = green)")),
        "queue_wait_min": V((fmv.get("approved_to_merged_min") or {}).get("median"), fm_src + ": approved_to_merged_min.median",
                            p90=(fmv.get("approved_to_merged_min") or {}).get("p90"), n=(fmv.get("approved_to_merged_min") or {}).get("n")),
        "batches": V([fmv.get("queue_runs"), fmv.get("queue_failed"), fmv.get("queue_cancelled")], fm_src + ": queue_runs, queue_failed, queue_cancelled"),
        "ci_min_per_day": V(round(sum(x for x in series_ci7) / len(series_ci7)) if series_ci7 else None,
                            "added (approx): ci.yml run wall time, run_started_at to updated_at, summed per IST day, average of the last 7 full days",
                            n=len(series_ci7) if series_ci7 else None,
                            **({} if series_ci7 else {"reason": "not measured: no full day of CI runs was read (offline or failed)"}),
                            job_hours=V(ci_hours, fm_src + ": pr_check_hours + queue_hours (job time over the runs it read)")),
        "thrown_share": V(fmv.get("thrown_share"), fm_src + ": thrown_share (P-371 target under 20%)", n=fmv.get("runs_read")),
        "records_share": V(fmv.get("records_share"), fm_src + ": records_share (target under 20%)"),
        "runs_read": V(fmv.get("runs_read"), fm_src + ": runs_read (the runs API returns at most 1,000 per created filter)"),
    }

    # merges per day and the trend series
    series = {"days": [d.isoformat() for d in days], "merges": [], "app_merges": [], "app_partial": [], "works": [], "lead_h": [], "batch_fail": [], "ci_min": []}
    for d in days:
        md_ = [m for m in merged if ts(m["merged"]).astimezone(IST).date() == d]
        series["merges"].append(len(md_) if merged_ok else None)          # not read is not zero (board v57)
        series["app_merges"].append(sum(1 for m in md_ if ac.get(str(m["n"]))) if merged_ok else None)
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
    runs_ok = any(runs_by_day.get(d) is not None for d in days[-7:])
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
        "healed_prs": V(len(healed) if runs_ok else None, "added: PR branches whose ci.yml run went red, then green, last 7 days (Lead comments not checked)",
                        median_h=med(healed), n=len(by_branch) if runs_ok else None,
                        **({} if runs_ok else {"reason": "not measured: the CI runs of the last 7 days were not read (offline or failed)"})),
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
                    "review_rounds": (lambda rr: V(rr.get("median"), fm_src + ": review_rounds.median (\"Reviewer:\" verdict comments per code PR merged, ENF-782b)",
                                                   n=rr.get("n"), mean=rr.get("mean"), over_2_share=rr.get("over_2_share"))
                                      if fm and rr.get("n") else V(None, fm_src + ": no review_rounds in its answer" if fm else "not measured: tools/flow-measure.py not run yet"))(fmv.get("review_rounds") or {})},
        "pipeline": pipeline,
        "merges_per_day": V(None if not merged_ok else {"days": series["days"], "all": series["merges"], "app": series["app_merges"], "partial": series["app_partial"]},
                            "GitHub merged PRs per IST day; app = tools/app-code-prs.sh" + (f"; {unclassified} PRs not yet classified" if unclassified else ""),
                            **({} if merged_ok else {"reason": NOT_READ_MERGED})),
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
                    "ahead_of_main": num(ex.get("records_ahead"), "record files on the records copy whose version main never had (tools/cockpit-data.py records_lag, read-only, at snapshot)", "measured", L,
                                         "not measured: main's commit is not in this copy and origin/main could not be read"),
                    "main_ref_is_head": ex.get("main_ref_is_head"), "current_lead": (comp["org"]["leads"] or [{}])[0].get("name")},
        "pace": comp["pace"], "forecast": comp["forecast"], "burnup": comp["burnup"], "capacity": comp["capacity"],
        "top3": comp["top3"], "org": comp["org"], "working_today": comp["working_today"], "health": hl, "whats_new": comp["whats_new"],
        "top_numbers": comp["top_numbers"], "capability_table": comp["capability_table"], "behaviour": comp["behaviour"], "customer": comp["customer"],
        "trust": dict(comp["trust"], freshness=comp["fresh"] + [fm_fresh]),
        "reconcile_keys": comp["keys"], "build_rows": comp["rows"],
        "history": {"file": "cockpit/history.jsonl", "today": comp["history_line"], "previous_day": (comp["history_prev"] or {}).get("day"),
                    "written": not a.no_history_write},
    })
    data["summary"]["health"] = {"light": hl["light"]}
    data["freshness"]["page_age_rule"] = {"amber_min": 45, "red_min": 120, "note": "Health item 2: the page computes the data age (spec §0.5)"}
    lineage_fill(data, L)
    data["first"] = first_screen(data, comp["r1_qa"], li, li_src)
    data["flow"] = flow_box(data, comp["flow"], li, li_src, snap.j("github/ci_queue.json"))
    data["first"]["proven_lines"] = proven_lines(data, comp["flow"])
    data["first"]["stuck_now"] = stuck_now(data, comp["stuck"], snap.j("github/ci_queue.json"), li, li_src)
    data["first"]["enforced"] = enforcement_lines(data, snap.j("enforcement/conformance.json"), snap.j("enforcement/heartbeat.json"))
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
    if os.environ.get("COCKPIT_CALLS"):                  # where the calls went, largest first
        for k, n in sorted(gh.tally.items(), key=lambda kv: -kv[1]):
            print(f"  calls: {n:4d} {k}")
    for e in ERRORS:
        print("  note:", e)


if __name__ == "__main__":
    sys.exit(watch_main(sys.argv[1:])) if "--watch" in sys.argv[1:] else main()
