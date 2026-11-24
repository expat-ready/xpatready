#!/usr/bin/env python3
"""Red on the old code (A351 C1, founder 24 Nov; CR-03): for a PR that changes app code and adds or changes checks, run those
suites on the base commit's app code. At least one must fail there; when all pass, the report says "these checks would pass
without the change". Report only (red-on-old.yml): never a failure.
  plan    --base REV [--head REV]   the suites (studio/tests/check_*) the PR adds, or in which it adds or changes a line that
          is no comment; at most MAX (the newest files first, the rest named); nothing to run when no app code changed (a
          test-only or records PR). Prints GITHUB_OUTPUT lines: suites=<names> app=<folders> note=<words>.
  old     --base REV                puts the app folders of this working tree back to the base (files the PR added there go).
          Only in CI: refuses unless GITHUB_ACTIONS=true.
  report  --suites "<names>" --out FILE [--summary FILE]   reads run-suites.sh's table and the PR body on stdin.
A suite that cannot load on the old code (its import is not there yet) is red too, and said apart: it proves the suite needs
the change, not that each check does. A suite is judged whole: a new green check beside an old red one counts as red.
Exit 0; 2 when it cannot read (said, never "red"). Test: check-red-on-old.sh."""
import argparse, os, re, subprocess, sys
S = "ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio/"
APP = [S + d for d in ("api/src", "web/src", "engine", "prisma", "contracts", "samples", "packages")]   # app-code-prs.sh's list (P-500)
SUITE = re.compile(r"^" + re.escape(S) + r"tests/(check_[A-Za-z0-9_.-]+\.(?:ts|cjs))$"); MAX = 4
NOTE = re.compile(r"^\s*(//|\*|/\*)|^\s*$")
ROW = re.compile(r"^\| (check_[A-Za-z0-9_.-]+) \| ([^|]*?) \| [^|]*\| (.*?) \|\s*$", re.M)
LOAD = re.compile(r"Cannot find module|ERR_MODULE_NOT_FOUND|does not provide an export|is not a function|TS\d{4}|no usage line", re.I)


def git(*a):
    r = subprocess.run(["git", "-c", "core.quotePath=false", *a], capture_output=True, text=True, errors="replace")
    if r.returncode:
        raise RuntimeError((r.stderr.strip() or "git failed").splitlines()[0][:120])
    return r.stdout


def safe(s, n=160):
    return re.sub(r"[\x00-\x1f\x7f]+", " ", s).replace("::", ":​:").replace("##[", "#​#[").replace("`", "'")[:n]


def plan(o):
    raw = git("diff", "--raw", "-z", "--no-renames", "--no-abbrev", o.base, o.head).split("\0")
    files = [(raw[k].split()[4][0], raw[k + 1]) for k in range(0, len(raw) - 1, 2)]
    app = [p for p in APP if any(f.startswith(p + "/") for _, f in files)]
    new, changed = [], []
    for st, f in files:
        m = SUITE.match(f)
        if not m or st == "D":
            continue
        if st == "A":
            new.append(m.group(1))
        elif any(l.startswith("+") and not l.startswith("+++") and not NOTE.match(l[1:]) for l in git("diff", "--no-renames", "--no-ext-diff", "--text", "-U0", o.base, o.head, "--", ":(literal)" + f).split("\n")):
            changed.append(m.group(1))
    all_ = new + changed
    note = ("no check suite added or changed" if not all_ else "no app code changed (a test-only PR)" if not app else
            f"{len(all_)} suites, the first {MAX} run; not run: {' '.join(all_[MAX:])}" if len(all_) > MAX else f"{len(all_)} suites")
    print("suites=" + (" ".join(all_[:MAX]) if app else "") + "\napp=" + " ".join(app) + "\nnote=" + note)


def old(o):
    if os.environ.get("GITHUB_ACTIONS") != "true":
        raise RuntimeError("old puts app folders back to the base: only in CI")
    top = git("rev-parse", "--show-toplevel").strip(); os.chdir(top)
    for p in APP:
        if git("ls-files", "--", p).strip():
            git("rm", "-rq", "--", p)
        if git("ls-tree", o.base, p).strip():
            git("checkout", "-q", o.base, "--", p)
    d = git("diff", "--name-only", o.base, "--", *APP).strip()
    if d:
        raise RuntimeError(f"app folders differ from the base still: {d.splitlines()[0]}")
    print("app code is the base's; tests and tools are the PR's")


def why(body):
    body = re.sub(r"<!--.*?(?:-->|\Z)", "", body.replace("\r", ""), flags=re.S); fence = False
    for l in body.split("\n"):
        s = l.strip()
        if s.startswith(("```", "~~~")):
            fence = not fence; continue
        m = None if fence or s.startswith(">") else re.match(r"[-* _]*red on old code[* _]*:[* _]*(.*)$", s, re.I)
        if m and len(m.group(1)) >= 8 and not re.match(r"(<|none\b|n/a|tbd|-)", m.group(1), re.I):
            return m.group(1)
    return ""


def report(o):
    want = o.suites.split()
    if not want:
        raise RuntimeError("no suite named")
    rows = {m[0]: (m[1].strip(), m[2]) for m in ROW.findall(open(o.out, encoding="utf-8", errors="replace").read())}
    lines, red, load, green, none = [], [], [], [], []
    for s in want:
        r, w = rows.get(s, ("no row", ""))
        kind = none if r in ("no row", "quarantined", "skipped", "remembered") else green if r == "PASS" else load if LOAD.search(w) else red
        kind.append(s); lines.append(f"- {s}: {'not judged (' + safe(r) + ')' if kind is none else 'PASSES on the old code' if kind is green else 'red: cannot load there' if kind is load else 'red'}" + (f": {safe(w)}" if kind in (red, load) else ""))
    y = why(sys.stdin.read())
    head = f"{len(red)} red, {len(load)} cannot load, {len(green)} pass, {len(none)} not judged, of {len(want)} suites on the old code"
    if o.summary:
        with open(o.summary, "a", encoding="utf-8") as fh:
            fh.write(f"### Red on the old code? {head} (A351 C1, report only)\nReason in the body: {safe(y, 300).replace('<', '&lt;') or 'none'}\n\n" + "\n".join(l.replace("<", "&lt;") for l in lines) + "\n")
    print("\n".join(lines))
    if red or load:
        print(f"ok    red on old: {head}")
    elif green and y:
        print(f"ok    red on old: {head}; reason given: {safe(y)}")
    elif green:
        print(f"::warning title=Red on the old code (A351 C1)::{head}: these checks would pass without the change. Add one that fails without it, or say why in the body (a line starting Red on old code and a colon)")
    else:
        print(f"::warning title=Red on the old code (A351 C1)::{head}: nothing was judged")


def main():
    a = argparse.ArgumentParser(); s = a.add_subparsers(dest="cmd", required=True)
    for n, f in (("plan", plan), ("old", old)):
        x = s.add_parser(n); x.add_argument("--base", required=True); x.add_argument("--head", default="HEAD"); x.set_defaults(f=f)
    x = s.add_parser("report"); x.add_argument("--suites", required=True); x.add_argument("--out", required=True); x.add_argument("--summary"); x.set_defaults(f=report)
    o = a.parse_args(); o.f(o)


try:
    main()
except Exception as e:
    print(f"::warning title=Red on the old code (A351 C1)::not read ({type(e).__name__}: {safe(str(e), 120)})")
    sys.exit(2)
