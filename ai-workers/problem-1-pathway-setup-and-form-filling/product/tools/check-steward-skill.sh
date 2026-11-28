#!/usr/bin/env bash
# PR Steward house rules check (lab register LR-149; gap research row 10, design/claude-docs-gap-research-2026-11-27.md):
#   W0  .claude/skills/steward/SKILL.md exists with a front matter block naming `name: steward`.
#   W1  both switches are set: `user-invocable: false` and `disable-model-invocation: true` (Steward reads the file; no
#       person or lane runs it as a command and no model loads it on its own).
#   W2  the rules name every path a fix must never touch: .github/, .mergify.yml, .githooks/, .claude/, the prisma
#       folder (migrations and schema), the pipeline tools and the records (STATE, RULES, DECISIONS, BACKLOG).
#   W3  the rules carry the pipeline's own commands and limits: cloud-setup.sh, run-suites.sh --changed, one retry,
#       "Question for the tech lead", never approve/merge/label, no `Reviewer:` line, never skip or quarantine a test.
#   W4  the file stays a protected path: lead-read-paths.txt keeps `^\.claude/` (a change to it waits for the Lead).
# First proves on fixtures that each rule fails when broken, then checks this checkout. Runs in ci (the tools step).
#   bash product/tools/check-steward-skill.sh [repo-root]
# US$0, no network.
set -u
TOOLS="$(cd "$(dirname "$0")" && pwd)"; ROOTD="${1:-$(cd "$TOOLS/../../../.." && pwd)}"
python3 -I - "$ROOTD" <<'PY'
import os, re, shutil, sys, tempfile
SKILL = ".claude/skills/steward/SKILL.md"
LRP = "ai-workers/problem-1-pathway-setup-and-form-filling/product/tools/lead-read-paths.txt"
NEVER = [".github/", ".mergify.yml", ".githooks/", ".claude/", "prisma/migrations/", "prisma/schema/", "P/tools/",
         "STATE.md", "RULES.md", "DECISIONS.md", "BACKLOG.md"]
MUST = ["cloud-setup.sh", "run-suites.sh --changed", "one fresh retry", "Question for the tech lead",
        "never approve, merge or label", "`Reviewer:`", "Never skip, disable, quarantine or weaken a test"]

def check(root):
    f = os.path.join(root, SKILL)
    if not os.path.isfile(f): return [f"W0 {SKILL} is missing"]
    text = open(f, encoding="utf-8").read()
    m = re.match(r"^---\n(.*?)\n---\n", text, re.S)
    if not m or not re.search(r"^name:\s*steward\s*$", m.group(1), re.M):
        return [f"W0 {SKILL}: no front matter naming `name: steward`"]
    fm, body, errs = m.group(1), text[m.end():], []
    for k, v in (("user-invocable", "false"), ("disable-model-invocation", "true")):
        if not re.search(rf"^{k}:\s*{v}\s*$", fm, re.M): errs.append(f"W1 front matter lacks `{k}: {v}`")
    never = body.split("## Never touch", 1)[1].split("\n## ", 1)[0] if "## Never touch" in body else ""
    for p in NEVER:
        if p not in never: errs.append(f"W2 the 'Never touch' section does not name {p}")
    for s in MUST:
        if s not in body: errs.append(f"W3 the rules do not say: {s}")
    lrp = os.path.join(root, LRP)
    lines = open(lrp, encoding="utf-8").read().splitlines() if os.path.isfile(lrp) else []
    if r"^\.claude/" not in [l.split("#", 1)[0].strip() for l in lines]:
        errs.append(r"W4 lead-read-paths.txt no longer holds ^\.claude/: the house rules could change unread")
    return errs

root = sys.argv[1]
real = open(os.path.join(root, SKILL), encoding="utf-8").read() if os.path.isfile(os.path.join(root, SKILL)) else ""
lrp_real = open(os.path.join(root, LRP), encoding="utf-8").read() if os.path.isfile(os.path.join(root, LRP)) else ""
def run(skill, lrp=None):
    d = tempfile.mkdtemp()
    try:
        if skill is not None:
            os.makedirs(os.path.dirname(os.path.join(d, SKILL))); open(os.path.join(d, SKILL), "w").write(skill)
        os.makedirs(os.path.dirname(os.path.join(d, LRP))); open(os.path.join(d, LRP), "w").write(lrp_real if lrp is None else lrp)
        return sorted({e[:2] for e in check(d)})
    finally:
        shutil.rmtree(d, ignore_errors=True)
fixtures = [
    ("the real file", real, None, None),
    ("file missing", None, None, "W0"),
    ("a switch off", real.replace("disable-model-invocation: true", "disable-model-invocation: false"), None, "W1"),
    ("migrations dropped from Never touch", real.replace("prisma/migrations/", "prisma/m/"), None, "W2"),
    (".github/ only outside Never touch", real.replace("* `.github/` (workflows", "* (workflows"), None, "W2"),
    ("no test before push", real.replace("run-suites.sh --changed", "run-suites.sh"), None, "W3"),
    ("protected path removed", real, lrp_real.replace("^\\.claude/\n", ""), "W4"),
]
failed = 0
for name, skill, lrp, want in fixtures:
    got = run(skill, lrp)
    ok = (not got) if want is None else (want in got)
    print(("ok    " if ok else "FAIL  ") + f"fixture: {name} -> {got or 'clean'}"); failed += not ok
if failed:
    print(f"FAIL  {failed} self-test fixture(s): the check cannot be trusted"); sys.exit(1)
errs = check(root)
for e in errs: print("FAIL  " + e)
if errs: sys.exit(1)
print(f"PASS  {SKILL}: both switches set, {len(NEVER)} never-touch paths, {len(MUST)} pipeline rules, protected path kept")
PY
