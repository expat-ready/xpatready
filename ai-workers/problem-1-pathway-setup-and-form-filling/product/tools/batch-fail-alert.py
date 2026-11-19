#!/usr/bin/env python3
# Batch-failure alert (P-729 (2), founder 19 Nov: three failed merge-queue batches stalled merges about an hour each,
# noticed only at the tech lead's 30-minute check). When ci fails on a Mergify batch PR (branch mergify/merge-queue/*),
# one comment goes on each member PR of the batch (the batch title "checking #2196 + #2197 ...", else Mergify's
# "pull_requests:" metadata, as flaky.mjs targets()): the failing jobs, each failing suite's FAIL lines (run-suites.sh's
# "<suite> failed (exit N): its FAIL lines" group in the job log) and the most likely PR: the one member whose changed
# files reach the failing suite (select-suites.mjs --direct, the same graph that picks a PR's suites), or "unclear".
# One comment per failed run (a hidden marker with the run id; a re-run of the workflow posts nothing new); no label is
# touched. Run by .github/workflows/batch-fail-alert.yml from main's copy (no PR code runs; GET plus one comment POST).
#   python3 -I product/tools/batch-fail-alert.py --run <ci run id> [--dry-run]
# Auth: GITHUB_TOKEN (passed to curl on stdin, never on its command line). Test: test_batch_fail_alert.py (fixtures).
import argparse, importlib.util, json, os, re, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("mqc", os.path.join(HERE, "merge-queue-causes.py"))
mqc = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(mqc)   # members(), suites(), repo(): one reading of a batch

API = os.environ.get("GITHUB_API_URL", "https://api.github.com")
MARK = "<!-- batch-fail-alert run={run} -->"
TS = re.compile(r"^\d{4}-\d\d-\d\dT[\d:.]+Z ?")
GROUP = re.compile(r"^(?:##\[group\]|::group::)(check_[A-Za-z0-9_.-]+\.(?:ts|cjs|mjs|js)) failed \(exit (\d+)\)")
MAX_LINES = 12

def curl(method, path, body=None):
    tok = os.environ.get("GITHUB_TOKEN", "")
    args = ["curl", "-sSL", "--fail", "--retry", "2", "--max-time", "60", "-X", method, "-H", "@-", "-H", "Accept: application/vnd.github+json"]
    data = None
    if body is not None:
        f = tempfile.NamedTemporaryFile("w", delete=False, suffix=".json"); json.dump(body, f); f.close(); data = f.name
        args += ["--data-binary", f"@{data}"]
    try:
        r = subprocess.run(args + [f"{API}/{path}"], input=f"Authorization: Bearer {tok}\n" if tok else "\n", capture_output=True, text=True)
    finally:
        if data: os.unlink(data)
    if r.returncode != 0: raise RuntimeError(f"{method} {path}: curl exit {r.returncode}: {r.stderr.strip()[:200]}")
    return r.stdout

class Api:
    def __init__(self, repo): self.r = repo
    def get(self, path): return json.loads(curl("GET", f"repos/{self.r}/{path}") or "null")
    def text(self, path): return curl("GET", f"repos/{self.r}/{path}")
    def post(self, path, body): curl("POST", f"repos/{self.r}/{path}", body)

def batch_members(pr):
    """The batch title names its members; Mergify's metadata block is the fallback (flaky.mjs targets())."""
    ms = mqc.members((pr.get("title") or "").split(": ", 1)[-1])
    if not ms:
        m = re.search(r"^pull_requests:\s*\n((?:[ \t]+.*\n?)*)", pr.get("body") or "", re.M)
        ms = [int(x) for x in re.findall(r"^\s*-\s*number:\s*(\d+)\s*$", m.group(1), re.M)] if m else []
    return list(dict.fromkeys(n for n in ms if n != pr.get("number")))[:10]

def clean(line):
    line = TS.sub("", line.rstrip("\r\n"))
    return line.replace("```", "'''")   # a log line never closes the comment's code block

def failed_suites(log):
    """{suite: (exit, [FAIL/STOP lines])} from run-suites.sh's groups; suites in the table or the retries line with no
    group (a FAIL row only) get no lines. Order kept as in the log."""
    out, cur = {}, None
    for raw in log.splitlines():
        line = clean(raw)
        g = GROUP.match(line)
        if g: cur = g.group(1); out.setdefault(cur, (g.group(2), [])); continue
        if cur and (line.startswith("--- last 40 lines") or line.startswith("##[endgroup]") or line.startswith("::endgroup::")):
            cur = None; continue
        if cur and re.match(r"^(FAIL|STOP)", line) and len(out[cur][1]) < MAX_LINES and line not in out[cur][1]:
            out[cur][1].append(line)
    for s in mqc.suites("\n".join(clean(x) for x in log.splitlines()))[0]:
        out.setdefault(s, ("?", []))
    return out

def error_lines(log):
    """A job with no suite group (types, packs, guard): its own FAIL and ##[error] lines."""
    keep = []
    for raw in log.splitlines():
        line = clean(raw)
        if re.match(r"^(FAIL|STOP)\b", line) or line.startswith("##[error]"):
            line = line.replace("##[error]", "error: ")
            if line not in keep: keep.append(line)
    return keep[:MAX_LINES]

def covers(files, root=None):
    """{suite: reason} the files reach: select-suites.mjs --direct (never ALL) from main's checkout."""
    if not files: return {}
    r = subprocess.run(["node", os.path.join(HERE, "select-suites.mjs"), "--direct"], input="\n".join(files) + "\n",
                       capture_output=True, text=True, cwd=root or HERE, timeout=300)
    if r.returncode != 0: raise RuntimeError(f"select-suites.mjs: exit {r.returncode}: {r.stderr.strip()[:200]}")
    return dict(l.split("\t", 1) for l in r.stdout.splitlines() if "\t" in l and not l.startswith("ALL\t"))

WEAK = re.compile(r"^(smoke|reads every file in \S+)$|^every browser suite")

def named_in(lines, files):
    """A changed file the FAIL lines name by its folder and name ("runtime/case-decision.tsx"): the strongest link."""
    text = "\n".join(lines)
    return [f for f in files if "/" in f and "/".join(f.split("/")[-2:]) in text]

def tier(suite, files, reach, lines=()):
    """0: the suite's FAIL lines name a changed file; 1: the member changed the suite, or the suite imports or names a
    changed file; 2: the suite uses a changed file by another path; 3: only by a blanket rule (smoke set, every browser
    suite, reads a whole folder); None: not reached."""
    if named_in(lines, files): return 0
    if any(os.path.basename(f) == suite for f in files): return 1
    why = reach.get(suite)
    if why is None: return None
    if WEAK.search(why): return 3
    if "(direct)" in why or "imported by the suite" in why or re.search(r"(^|; )names ", why): return 1
    return 2

HOW = {0: "its FAIL lines name a file it changed", 1: "it changed the suite or a file the suite imports or names",
       2: "it changed a file the suite uses", 3: "only through a blanket rule (smoke set, every browser suite, a whole folder)"}

def likely(suite, lines, files_of, reach_of):
    """(PR or None, why) for one failing suite. The strongest tier any member reaches decides: one member there → that
    one; several, or only a blanket rule → unclear."""
    ts = {n: tier(suite, fs, reach_of.get(n, {}), lines) for n, fs in files_of.items()}
    ts = {n: t for n, t in ts.items() if t is not None}
    if not ts: return None, "no member's changed files reach it"
    best = min(ts.values()); who = sorted(n for n, t in ts.items() if t == best)
    if best == 0 and len(who) == 1: return who[0], f"{HOW[0]}: `{named_in(lines, files_of[who[0]])[0].split('/')[-1]}`"
    if len(who) == 1 and best < 3: return who[0], HOW[best]
    if len(who) == 1: return None, f"#{who[0]} reaches it {HOW[3]}, too weak to name"
    return None, f"{' and '.join('#%d' % n for n in who)} each: {HOW[best]}"

def comment(run, batch, members, jobs, calls):
    head = f"**Merge-queue batch failed (P-729):** batch #{batch['number']} ([ci run]({run['html_url']})) holds {', '.join('#%d' % m for m in members)}."
    out = [MARK.format(run=run["id"]), head, ""]
    picks = {p for p, _ in calls.values()}
    if not calls:
        out.append("**Most likely:** unclear (no suite failed, a non-suite job did: no file-to-suite link to follow).")
    elif len(picks) == 1 and None not in picks:
        out.append(f"**Most likely:** #{picks.pop()} ({'; '.join(f'`{s}`: {w}' for s, (_, w) in calls.items())}).")
    else:
        out.append("**Most likely, by failing suite:**")
        out += [f"- `{s}`: " + (f"#{p} ({w})" if p else f"unclear ({w})") for s, (p, w) in calls.items()]
    out.append("")
    for j in jobs:
        out.append(f"- **{j['name']}** failed" + (": " + ", ".join(f"`{s}` (exit {e})" for s, (e, _) in j["suites"].items()) if j["suites"] else ""))
        for s, (_, lines) in j["suites"].items():
            if lines: out += ["", f"  `{s}`:", "  ```", *("  " + l for l in lines), "  ```"]
        if not j["suites"] and j["errors"]:
            out += ["", "  ```", *("  " + l for l in j["errors"]), "  ```"]
    out += ["", "Mergify splits the batch to find the PR that broke it; no label was changed. A code cause: fix with a fail test and push; none in the log: `/rerun failed` on the batch is the tech lead's call.",
            "", "---", "_Posted by batch-fail-alert.yml (tools/batch-fail-alert.py, P-729)_"]
    return "\n".join(out)[:60000]

def run_alert(api, run_id, root=None, cover=covers, dry=False):
    run = api.get(f"actions/runs/{run_id}")
    if run.get("conclusion") != "failure" or not (run.get("head_branch") or "").startswith("mergify/merge-queue/"):
        return [], f"run {run_id}: not a failed merge-queue batch ({run.get('head_branch')}, {run.get('conclusion')}): nothing to post"
    owner = api.r.split("/")[0]
    prs = run.get("pull_requests") or api.get(f"pulls?head={owner}:{run['head_branch']}&state=all&per_page=5") or []
    if not prs: return [], f"run {run_id}: no batch PR for {run['head_branch']}"
    batch = api.get(f"pulls/{prs[0]['number']}")
    members = batch_members(batch)
    if not members: return [], f"batch #{batch['number']}: no member PR in its title or metadata"
    jobs = []
    for j in api.get(f"actions/runs/{run_id}/jobs?per_page=100&filter=latest").get("jobs", []):
        if j.get("conclusion") not in ("failure", "timed_out") or j["name"] in ("ci", "retry-comment"): continue
        log = api.text(f"actions/jobs/{j['id']}/logs")
        jobs.append({"name": j["name"], "suites": failed_suites(log), "errors": error_lines(log)})
    if not jobs: jobs = [{"name": "ci (summary only)", "suites": {}, "errors": []}]
    suites = {}
    for j in jobs:
        for su, (_, lines) in j["suites"].items(): suites.setdefault(su, []).extend(lines)
    files_of = {n: [f["filename"] for p in (1, 2, 3) for f in (api.get(f"pulls/{n}/files?per_page=100&page={p}") or [])] for n in members}
    reach_of = {n: cover(fs, root) for n, fs in files_of.items()} if suites else {}
    body = comment(run, batch, members, jobs, {su: likely(su, ls, files_of, reach_of) for su, ls in suites.items()})
    posted, mark = [], MARK.format(run=run["id"])
    for n in members:
        old = api.get(f"issues/{n}/comments?per_page=100&since={run.get('created_at', '')}") or []
        if any(mark in (c.get("body") or "") for c in old): continue   # no repeats: this run was already reported here
        if not dry: api.post(f"issues/{n}/comments", {"body": body})
        posted.append(n)
    return posted, body

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--run", required=True, type=int); ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    root = subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True, cwd=HERE).stdout.strip() or None
    posted, msg = run_alert(Api(mqc.repo()), a.run, root, dry=a.dry_run)
    print(msg); print(("would post on " if a.dry_run else "posted on ") + (", ".join(f"#{n}" for n in posted) or "none"), file=sys.stderr)

if __name__ == "__main__":
    main()
