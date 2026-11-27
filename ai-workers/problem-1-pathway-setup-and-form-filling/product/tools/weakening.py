#!/usr/bin/env python3
"""Can a pipeline change weaken protection? (A438 cut 2, founder 27 Nov 14:3x IST: "Yes, all three"; P-423, P-823.)

Before A438 every pipeline path (.github/, .mergify.yml, the guards under product/tools/, hooks, agent settings) waited for
the Lead's read first; 17 lab PRs waited 18 min to 84 h. Now a pipeline path keeps the read first only when its diff CAN
weaken protection. A script cannot tell a stricter edit from a looser one (the breaker on #3942: one added "exit 0" switches
a guard off; a tool's name does not say whether CI runs it), so the rule is shape, and it fails closed:
  needs no read (the reviewer's Approve alone):
  * a new file in the pipeline's own case (a new tool or test), except a new file under .github/ or .mergify/ or a new
    .claude/ setting (each acts on every PR by itself: a new workflow's job named "ci" is a fake green ci), and a new
    agent or skill that sets tools, hooks, model, effort or permissions;
  * prose (.md) outside the front matter of agents and skills;
  * an allow-list (quarantine, known failures, typecheck-known, route-has-screen-allow) that only loses entries;
  * check-guards.sh gaining test names on TESTS= lines and quote-safe mutation rows;
  needs the Lead's read first: every other change to an existing pipeline file, blank lines and comments included
  (round 2 on #3942: one added line, even "//" or a blank line with a mode change, can switch a guard, test, hook or
  workflow off, and a deny-list of bad lines always had a gap), and a file removed, renamed, mode-only, with no patch,
  or added in a case that can collide on the Mac's disk.
This is a tripwire, not a proof: the reviewer still reads every line, and money, permissions code, the schema and
migrations keep their own rules (lead-read-paths.txt's other sections, P-823).

  python3 -I weakening.py --files FILES.json [PATH ...]   PATHs (or stdin, one a line): "PATH<TAB>why" for each that
                                                         weakens; FILES.json is GitHub's pulls/<n>/files answer
  python3 -I weakening.py --git BASE..HEAD [PATH ...]    the same from git (local use, the 17-PR table)
  python3 -I weakening.py --self-test
Exit 0 judged (nothing printed = no weakening) · 2 unreadable (callers then treat every path as weakening).
Callers: queue-gate.sh leadread(), lead-read-gate.sh paths(). Test: check-weakening.sh.
"""
import json
import os
import re
import subprocess
import sys

ALLOWLISTS = {"pr-suites-quarantine.txt", "known-failures.tsv", "typecheck-known.txt", "route-has-screen-allow.txt"}
WORKFLOW_RISK = [
    (re.compile(r"pull_request_target"), "pull_request_target"),
    (re.compile(r"\bsecrets\b"), "a secret"),
    (re.compile(r"write"), "a write permission"),
    (re.compile(r"continue-on-error"), "continue-on-error"),
    (re.compile(r"(^|\s)uses:\s*(?!\./|actions/)\S"), "a third-party action"),
    (re.compile(r"paths-ignore|branches-ignore"), "an ignore filter"),
    (re.compile(r"--no-verify"), "--no-verify"),
    (re.compile(r"^\s*-?\s*(pull_request_target|workflow_run|issue_comment|repository_dispatch|workflow_call)\s*:"), "a privileged trigger"),
]
FRONT_MATTER_LINES = 15   # agents' and skills' front matter sits in their first lines (7 and 4 today); up to line 60 a
FM_KEY = re.compile(r"^[A-Za-z][\w-]*\s*:")   # changed line in key form ("hooks:", "model:") counts too


def kind(path):
    base = path.rsplit("/", 1)[-1]
    if base in ALLOWLISTS:
        return "allowlist"
    if path.startswith(".github/workflows/") and re.search(r"\.ya?ml$", base):
        return "workflow"
    if path.startswith(".claude/agents/") or (path.startswith(".claude/skills/") and base == "SKILL.md"):
        return "agent"
    if base.endswith(".md") and path != ".mergify.yml":
        return "prose"
    if re.match(r"(check-|check_|test_|test-)", base) or "/guards.d/" in path or base == "guard-test-lib.sh":
        return "test"
    return "code"   # .mergify.yml, .claude/*.json|yml, hooks, guards, gates, CI helpers: any change is read


CASED = {"AGENTS.md", "CLAUDE.md", "SKILL.md", "README.md", "MODULE.md", "B119"}
CASED_LOWER = {c.lower(): c for c in CASED}


def odd_case(path):
    """A path whose case can collide on the Mac's case-insensitive disk (review M3, R2-M2): capitals where the pipeline
    has none (.GitHooks/pre-push, product/Tools/push-guard.sh), or a known capitalised name in another case
    (.claude/skills/lead/skill.md beside SKILL.md, screens/b119/)."""
    if not path.isascii():
        return True   # the Mac folds some non-ASCII letters into ASCII ones (U+017F to s): breaker round 2 R2-M1
    for p in path.split("/"):
        if p in CASED:
            continue
        if p.lower() in CASED_LOWER or p != p.lower():
            return True
    return False


def hunks(patch):
    """-> [(old_no, new_no, sign, text)] for every line of the patch (sign ' ', '+', '-')."""
    out, o, n = [], 0, 0
    for l in (patch or "").split("\n"):
        m = re.match(r"^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@", l)
        if m:
            o, n = int(m.group(1)), int(m.group(2))
            out.append((o, n, "@", l))
            continue
        if l.startswith("\\"):
            continue
        s = l[:1] if l[:1] in "+- " else " "
        out.append((o, n, s, l[1:]))
        if s in " -":
            o += 1
        if s in " +":
            n += 1
    return out


GUARDS_ROW = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 ._()/+:-]*\|[^|'\n]+\|[^'\n]*\|[\w./-]+\.(sh|py)'?$")   # a mutation row: data in MUT='...'
GUARDS_TESTS = re.compile(r'^TESTS="\$TESTS( [\w.-]+)+"(\s+#[^\n]*)?$')                        # TESTS="$TESTS check-x.sh"   # why
GUARDS_OPEN = re.compile(r"^MUT=\"\$MUT\"'$")


def guards_rows_only(rows):
    """check-guards.sh may gain test names and mutation rows without the read (round 2 on #3942: a test's other lines can
    switch it off, so every other change is read). Shape: added lines are TESTS="$TESTS name ..." lines, comments, a
    MUT="$MUT"' opener, or rows of data. Inside single quotes nothing runs, so the quote must stay balanced: per hunk only
    the last added row may end the string with ', and only when the one removed line is the old last row, the same
    but for that quote (it moves down)."""
    hunk = []
    for r in rows + [(0, 0, "@", "")]:
        if r[2] != "@":
            hunk.append(r)
            continue
        add = [t for _, _, s, t in hunk if s == "+"]
        rem = [t for _, _, s, t in hunk if s == "-"]
        # inside MUT='...' or not: from the line before the first change (a row without its closing quote, or the
        # opener, means inside), then each added opener opens and a row ending in ' closes. A comment holding a quote
        # is allowed only outside the string (inside, its quote would end the string).
        first = next((i for i, (_, _, s, _t) in enumerate(hunk) if s in "+-"), 0)
        prev = next((t for _, _, s, t in reversed(hunk[:first]) if s == " "), "")
        inside = bool(GUARDS_OPEN.match(prev) or (GUARDS_ROW.match(prev) and not prev.endswith("'"))
                      or (hunk and hunk[first][2] == "-" and GUARDS_ROW.match(hunk[first][3])))   # the old last row was inside
        for _, _, s, t in hunk:
            if s != "+":
                continue
            if GUARDS_OPEN.match(t):
                inside = True
            elif GUARDS_ROW.match(t):
                if not inside:
                    return "check-guards.sh gains a mutation row outside MUT='...' (it would run as code): %s" % t.strip()[:80]
                inside = not t.endswith("'")
            elif not inside and not t.strip():
                pass   # a blank line outside the string
            elif GUARDS_TESTS.match(t) or re.match(r"^#[^'\n]*$", t) or (not inside and re.match(r"^#[^\n]*$", t)):
                if inside and not t.startswith("#"):
                    return "check-guards.sh gains a TESTS line inside MUT='...': %s" % t.strip()[:80]
            else:
                return "check-guards.sh gains a line that is not a test name, a mutation row or a comment: %s" % t.strip()[:80]
        for t in rem:
            if not (t.endswith("'") and t[:-1] in add):
                return "check-guards.sh removes or changes a line (a test name or mutation row): %s" % (t.strip() or "a blank line")[:80]
        closing = [t for t in add if t.endswith("'") and GUARDS_ROW.match(t)]
        if rem and not (len(rem) == 1 and len(closing) >= 1 and GUARDS_ROW.match(rem[0]) and rem[0].endswith("'")
                        and rem[0][:-1] in add):
            return "check-guards.sh: a row loses or moves its closing quote in a way that could end the string early"
        hunk = []
    return ""


def judge(f):
    """One file of GitHub's answer -> the reason its change can weaken protection, or "".
    Round 2 on #3942 (reviewer R2-B1, R2-B2): a deny-list of bad added lines cannot be made safe (a "//" line runs in
    bash and continues a YAML run line; exit(0), trap, a case arm...), so any change to an existing pipeline file is read
    first. Without a read: a new file (correct case), prose outside an agent's or skill's front matter, an allow-list that
    only loses entries, check-guards.sh gaining test names and rows. Blank lines count as changes (R2-M1)."""
    path, status, patch = f.get("filename", ""), f.get("status", "modified"), f.get("patch")
    k = kind(path)
    if status == "removed":
        return "a pipeline file removed"
    if status == "renamed" or f.get("previous_filename"):
        return "renamed from %s (a workflow, hook or test may no longer find it)" % f.get("previous_filename", "?")
    if status == "added" and odd_case(path):
        return "a new path whose case differs from the repository's (on the Mac's disk it can replace %s)" % path
    if not patch:
        return "" if (k == "prose" and status == "added") else "no patch given (too large, binary or a mode change): read first (fails closed)"
    rows = hunks(patch)
    add = [t for _, _, s, t in rows if s == "+"]
    rem = [t for _, _, s, t in rows if s == "-"]
    if status == "added":
        # A new workflow (or any new file under .github/, .mergify/, or a .claude/ setting) acts on every PR by itself:
        # breaker round 2 C16/C17, a new workflow with a job named "ci" that passes is a fake green ci for every PR.
        if path.startswith((".github/", ".mergify/")) or path == ".mergify.yml" or (path.startswith(".claude/") and re.search(r"\.(json|ya?ml)$", path)):
            return "a new workflow, Mergify or agent-settings file (it acts on every PR by itself): read first"
        if k == "agent":
            for o, n, s, t in rows:
                if s == "+" and n <= 60 and re.match(r"^\s*(allowed-tools|tools|hooks|model|effort|permissionMode|disallowed[\w-]*)\s*:", t, re.I):
                    return "a new agent or skill sets %s" % t.strip()[:80]
        return ""   # a new tool, test, workflow step file or prose: the reviewer reads it
    if k == "prose":
        return ""
    if k == "agent":
        # Front matter: line 1 to the second "---" (in a hunk from line 1), else to the first "---" seen; only "---"
        # closes it (R2-M1: a blank line does not). A changed line, blank ones too, before it and within the first 15
        # lines (or in key form up to line 60) touches the front matter.
        seen, need, closed = 0, 2, False
        for o, n, s, t in rows:
            if s == "@":
                seen, need, closed = 0, (2 if min(o, n) <= 1 else 1), False
                continue
            no = n if s == "+" else o
            if not closed and s in "+-" and (no <= FRONT_MATTER_LINES or (no <= 60 and FM_KEY.match(t))):
                return "touches an agent's or skill's front matter (model, effort, tools, hooks): %s" % (t.strip() or "a blank line")[:80]
            if t.strip() == "---" and s != "+":
                seen += 1
                closed = closed or seen >= need
        return ""
    if k == "allowlist":
        return "changes an allow-list other than by removing entries: %s" % (add[0].strip() or "a blank line")[:80] if add else ""
    if path.endswith("/product/tools/check-guards.sh"):
        return guards_rows_only(rows)
    if add or rem:   # tests, workflows, settings, .mergify.yml, lead-read-paths.txt, hooks, guards, gates, CI helpers
        return "changes an existing pipeline file (a script cannot tell stricter from looser): %s" % ((rem or add)[0].strip() or "a blank line")[:80]
    return ""


def from_git(rng):
    base, head = rng.split("..", 1)
    names = subprocess.run(["git", "-c", "core.quotePath=false", "diff", "--name-status", "--no-renames", base + "..." + head],
                           capture_output=True, text=True, check=True).stdout.splitlines()
    out = []
    for n in names:
        st, path = n.split("\t", 1)
        p = subprocess.run(["git", "diff", "--no-renames", base + "..." + head, "--", path], capture_output=True, text=True).stdout
        body = p.split("\n@@", 1)
        patch = ("@@" + body[1]) if len(body) > 1 else ""
        out.append({"filename": path, "status": {"A": "added", "D": "removed"}.get(st[0], "modified"), "patch": patch,
                    "changes": patch.count("\n+") + patch.count("\n-")})
    return out


def run(files, paths):
    by = {}
    for f in files:
        by.setdefault(f.get("filename", ""), f)
        if f.get("previous_filename"):
            by.setdefault(f["previous_filename"], f)
    out = []
    for p in paths:
        f = by.get(p)
        why = judge(f) if f else "not in the PR's file list: read first (fails closed)"
        if why:
            out.append("%s\t%s" % (p, re.sub(r"[\t\n]", " ", why)))
    return out


def self_test():
    def f(path, patch, status="modified"):
        return {"filename": path, "status": status, "patch": patch, "changes": 1}
    T = "ai-workers/problem-1-pathway-setup-and-form-filling/product/tools/"
    cases = [
        (False, "a new tool", f(T + "new-tool.sh", "@@ -0,0 +1,2 @@\n+set -u\n+echo hi", "added")),
        (False, "a new test", f(T + "check-new.sh", "@@ -0,0 +1 @@\n+ok \"x\" 1", "added")),
        (True, "a test gains a case (an existing test changed: read, round 2)", f(T + "check-x.sh", "@@ -1 +1,2 @@\n ok \"a\" 1\n+ok \"b\" 1")),
        (True, "a test loses a case", f(T + "check-x.sh", "@@ -1,2 +1 @@\n ok \"a\" 1\n-ok \"b\" 1")),
        (True, "a test assertion loosened (= 4 to -le 4)", f(T + "check-x.sh", "@@ -1 +1 @@\n-ok \"four\" \"$([ \"$n\" = 4 ] && echo 1)\"\n+ok \"four\" \"$([ \"$n\" -le 4 ] && echo 1)\"")),
        (True, "a mutation row removed", f(T + "check-guards.sh", "@@ -1 +0,0 @@\n-15 ci|product/tools/queue-gate.sh|s/a/b/|check-queue-gate.sh")),
        (False, "a mutation row added", f(T + "check-guards.sh", "@@ -1 +1,2 @@\n 14 x|product/tools/queue-gate.sh|s/a/b/|check-queue-gate.sh\n+15 ci|product/tools/queue-gate.sh|s/a/b/|check-queue-gate.sh")),
        (True, "a guard line gains a pipe (existing code: read)", f(T + "merge-guard.sh", "@@ -1 +1 @@\n-LANE=$(lane.sh whoami)\n+LANE=$(lane.sh whoami | sed s/x/y/)")),
        (True, "a guard's check removed", f(T + "merge-guard.sh", "@@ -1,2 +1 @@\n x\n-[ -z \"$ok\" ] && exit 1")),
        (True, "a guard's threshold lowered", f(T + "wip-guard.py", "@@ -1 +1 @@\n-if n > 3: refuse()\n+if n > 9: refuse()")),
        (True, "comments only in existing code (a comment can be a rule marker, review B2)", f(T + "merge-guard.sh", "@@ -1 +1 @@\n-# old words\n+# new words")),
        (True, "a gate: any code change", f(T + "queue-gate.sh", "@@ -1 +1,2 @@\n x\n+autocover && return 0")),
        (True, "a gate: comments only (markers)", f(T + "queue-gate.sh", "@@ -1 +1 @@\n-# a\n+# b")),
        (True, ".mergify.yml condition", f(".mergify.yml", "@@ -1 +1 @@\n-      - check-success = ci\n+      - check-success = cj")),
        (True, "an allow-list entry added", f(T + "pr-suites-quarantine.txt", "@@ -1 +1,2 @@\n x\n+check_a.ts|runtime|2026-12-02|p822")),
        (False, "an allow-list entry removed", f(T + "pr-suites-quarantine.txt", "@@ -1,2 +1 @@\n x\n-check_a.ts|runtime|2026-12-02|p822")),
        (True, "a workflow gains a step (an existing workflow changed: read, round 2)", f(".github/workflows/ci.yml", "@@ -1 +1,3 @@\n x\n+      - name: lint\n+        run: bash lint.sh")),
        (True, "a workflow loses a step", f(".github/workflows/ci.yml", "@@ -1,3 +1 @@\n x\n-      - name: lint\n-        run: bash lint.sh")),
        (True, "a workflow's parts 4 to 6 (an existing step changed)", f(".github/workflows/guards.yml", "@@ -1 +1 @@\n-        part: [1, 2, 3, 4]\n+        part: [1, 2, 3, 4, 5, 6]")),
        (True, "a step gated on pull_request_target", f(".github/workflows/x.yml", "@@ -1 +1,2 @@\n x\n+        if: github.event_name == 'pull_request_target'")),
        (True, "pull_request_target added", f(".github/workflows/x.yml", "@@ -1 +1,2 @@\n on:\n+  pull_request_target:")),
        (True, "permissions widened", f(".github/workflows/x.yml", "@@ -1 +1 @@\n-permissions: { contents: read }\n+permissions: { contents: write }")),
        (True, "a secret", f(".github/workflows/x.yml", "@@ -1 +1,2 @@\n x\n+        env: { T: \"${{ secrets.PAT }}\" }")),
        (True, "a new trigger on a changed workflow", f(".github/workflows/x.yml", "@@ -1 +1,2 @@\n on:\n+  schedule:")),
        (True, "a new workflow, even read-only (breaker R2 C16: a job named ci)", f(".github/workflows/new.yml", "@@ -0,0 +1,6 @@\n+on:\n+  pull_request:\n+permissions: { contents: read }\n+jobs:\n+  t:\n+    steps: [{uses: actions/checkout@v4}]", "added")),
        (True, "a new workflow on workflow_run", f(".github/workflows/new.yml", "@@ -0,0 +1,2 @@\n+on:\n+  workflow_run:", "added")),
        (True, "continue-on-error on an existing step", f(".github/workflows/ci.yml", "@@ -1,2 +1,3 @@\n       - name: lint\n+        continue-on-error: true\n         run: bash lint.sh")),
        (True, "a new step with continue-on-error (a re-added step could hide behind it)", f(".github/workflows/ci.yml", "@@ -1 +1,4 @@\n x\n+      - name: new check, report-only\n+        continue-on-error: true\n+        run: bash new.sh")),
        (True, "a report tool loses a line (by name no tool is safe)", f(T + "founder-report.py", "@@ -1 +1 @@\n-print(report(a))\n+out = report(a)")),
        (True, "a git hook loses a line", f(".githooks/pre-push", "@@ -1,2 +1 @@\n x\n-bash push-guard.sh || exit 1")),
        (True, "the approvals policy", f(".claude/approvals.yml", "@@ -1 +1 @@\n-mode: observe\n+mode: enforce")),
        (True, "a third-party action", f(".github/workflows/ci.yml", "@@ -1 +1,2 @@\n x\n+      - uses: someone/tool@v1")),
        (True, "settings: an allow rule", f(".claude/settings.json", "@@ -1 +1,2 @@\n x\n+      \"Bash(git push:*)\",")),
        (True, "settings: a hook removed", f(".claude/settings.json", "@@ -1,2 +1 @@\n x\n-            \"command\": \"bash guard.sh\",")),
        (True, "settings: any change, a hook added too", f(".claude/settings.json", "@@ -1 +1,3 @@\n x\n+          {\n+            \"command\": \"bash guard.sh\",")),
        (True, "an agent's effort lowered", f(".claude/agents/screen-reviewer.md", "@@ -1,4 +1,4 @@\n ---\n name: r\n-effort: high\n+effort: medium")),
        (False, "an agent's body", f(".claude/agents/screen-reviewer.md", "@@ -30 +30 @@\n-old words\n+new words")),
        (False, "a skill's body in a hunk after its front matter closed (line 8)", f(".claude/skills/lead/SKILL.md", "@@ -3,6 +3,6 @@\n description: x\n ---\n \n-1. old step\n+1. new step\n more")),
        (True, "a skill's line 11 with no closing --- seen (only --- closes, R2-M1)", f(".claude/skills/lead/SKILL.md", "@@ -8,4 +8,4 @@\n Home: x\n \n ## Guard\n-1. old\n+1. new")),
        (True, "a skill's front matter line 3 in a hunk from line 1", f(".claude/skills/lead/SKILL.md", "@@ -1,4 +1,4 @@\n ---\n name: lead\n-description: a\n+description: b\n ---")),
        (False, "a new skill without tool or model keys", f(".claude/skills/v/SKILL.md", "@@ -0,0 +1,4 @@\n+---\n+name: v\n+description: x\n+---", "added")),
        (True, "a new agent with tools", f(".claude/agents/x.md", "@@ -0,0 +1,4 @@\n+---\n+name: x\n+tools: Bash\n+---", "added")),
        (True, "a test sets up with unset (an existing test changed: read)", f(T + "check-x.sh", "@@ -1 +1,2 @@\n set -u\n+unset S N G")),
        (False, "a new mutation row whose sed text says exit", f(T + "check-guards.sh", "@@ -1 +1,2 @@\n-A1 a|product/tools/a.sh|s/x/y/|check-a.sh'\n+A1 a|product/tools/a.sh|s/x/y/|check-a.sh\n+A368 take|product/tools/takeover.sh|s/^  exit 1/  true/|check-takeover.sh'")),
        (True, "a test line gains || exit 0", f(T + "check-x.sh", "@@ -1 +1,2 @@\n x\n+run_case || exit 0")),
        (False, "a skill's prose", f(".claude/skills/next/SKILL.md", "@@ -30 +30 @@\n-old words\n+new words")),
        # The breaker on #3942 (B1-B3, M1-M3): each was let through by the first version
        (True, "B1: an added exit 0 in a guard", f(T + "push-guard.sh", "@@ -18,2 +18,3 @@\n set -uo pipefail\n+exit 0\n ROOT=x")),
        (True, "B1: an added exit 0 in a git hook", f(".githooks/pre-push", "@@ -1 +1,2 @@\n x\n+exit 0")),
        (True, "B1: exit 0 first in an existing run block", f(".github/workflows/ci.yml", "@@ -357,2 +357,3 @@\n         run: |\n+          exit 0\n           bash check-docs.sh")),
        (True, "B1: a step gains if: ${{ 1 == 2 }}", f(".github/workflows/ci.yml", "@@ -1,2 +1,3 @@\n       - name: lint\n+        if: ${{ 1 == 2 }}\n         run: bash lint.sh")),
        (True, "B1: process.exit(0) added to a test", f("ai-workers/x/prototype/studio/tools/check-port-contracts.mjs", "@@ -1 +1,2 @@\n x\n+process.exit(0)")),
        (True, "B2: a CI helper (pr-base.sh) returns an empty range", f(T + "pr-base.sh", "@@ -5 +5,2 @@\n x\n+  echo \"$head..$head\"; return 0")),
        (True, "B2: ci-memory.mjs fakes a verdict", f(T + "ci-memory.mjs", "@@ -5,2 +5,2 @@\n x\n-  if (!match) return '';\n+  return 'green 1';")),
        (True, "B3: an agent's model and effort in a real hunk (@@ -2,8)", f(".claude/agents/screen-reviewer.md", "@@ -2,8 +2,8 @@\n name: screen-reviewer\n description: x\n-model: opus\n-effort: high\n+model: haiku\n+effort: low\n tools: Read\n ---")),
        (True, "M1: a guard line kept in words but switched off", f(T + "merge-guard.sh", "@@ -1 +1 @@\n-[ -z \"$ok\" ] && exit 1\n+false && [ -z \"$ok\" ] && exit 1")),
        (True, "M1: an assertion gains || echo 1", f(T + "check-x.sh", "@@ -1 +1 @@\n-ok \"a\" \"$(f && echo 1)\"\n+ok \"a\" \"$(f && echo 1 || echo 1)\"")),
        (True, "M1: a test gains an early exit", f(T + "check-x.sh", "@@ -1 +1,2 @@\n set -u\n+exit 0")),
        (True, "M2: continue-on-error: ${{ true }} on an existing step", f(".github/workflows/ci.yml", "@@ -1,2 +1,3 @@\n       - name: lint\n+        continue-on-error: ${{ true }}\n         run: bash lint.sh")),
        (True, "M2: contents: 'write'", f(".github/workflows/x.yml", "@@ -1,2 +1,3 @@\n permissions:\n+  contents: 'write'\n jobs:")),
        (True, "M2: a docker action", f(".github/workflows/ci.yml", "@@ -1 +1,3 @@\n x\n+      - name: t\n+        uses: docker://alpine:3")),
        (True, "M2: secrets['X']", f(".github/workflows/ci.yml", "@@ -1 +1,3 @@\n x\n+      - name: t\n+        env: { T: \"${{ secrets['X'] }}\" }")),
        (True, "M2: an added paths-ignore", f(".github/workflows/ci.yml", "@@ -1,2 +1,3 @@\n   pull_request:\n+    paths-ignore: ['**.md']\n jobs:")),
        (True, "M2: parts [1, 2, 3, 4] to [1]", f(".github/workflows/guards.yml", "@@ -1 +1 @@\n-        part: [1, 2, 3, 4]\n+        part: [1]")),
        (True, "M3: \"Bash\" inside an existing allow array", f(".claude/settings.json", "@@ -3,2 +3,3 @@\n     \"allow\": [\n+      \"Bash\",\n       \"Read\"")),
        (True, "M3: defaultMode bypassPermissions", f(".claude/settings.json", "@@ -1 +1,2 @@\n {\n+  \"defaultMode\": \"bypassPermissions\",")),
        (True, "M3: an agent's hooks block removed (line 6)", f(".claude/agents/screen-breaker.md", "@@ -4,4 +4,2 @@\n tools: Read\n-hooks:\n-  Stop: x\n ---")),
        (True, "minor: AGENTS.md removed", {"filename": "AGENTS.md", "status": "removed", "patch": "", "changes": 9}),
        (True, "minor: a hook made non-executable (mode only)", {"filename": ".githooks/pre-push", "status": "changed", "changes": 0}),
        (False, "a test gains a case (moved rows and a closing quote aside)", f(T + "check-guards.sh", "@@ -1 +1,2 @@\n-29 e7ran|product/tools/stop-check.sh|/E7/d|check-stop-check.sh'\n+29 e7ran|product/tools/stop-check.sh|/E7/d|check-stop-check.sh\n+LR1 x|product/tools/x.sh|s/a/b/|check-x.sh'")),
        (True, "a workflow gains a whole new job (R2-B2: it can take over steps)", f(".github/workflows/ci.yml", "@@ -1 +1,4 @@\n x\n+  lint:\n+    runs-on: ubuntu-latest\n+    steps: [{run: bash lint.sh}]")),
        # The reviewer on #3942 (B2, M2, M3) and multi-hunk patches (M4)
        (True, "R-B2: the # --- pipeline marker moved in lead-read-paths.txt", f(T + "lead-read-paths.txt", "@@ -20,3 +20,3 @@\n x\n-# --- pipeline: read first only when\n+/api/src/core\\.ts$\n y\n@@ -28,2 +28,2 @@\n z\n-/api/src/core\\.ts$\n+# --- pipeline: read first only when")),
        (True, "R-B2: a shell case arm changed", f(T + "lead-read-gate.sh", "@@ -131 +131 @@\n-    *) echo x; s=failure;;\n+    *) echo x; s=success;;")),
        (True, "R-M2: toJSON(secrets) in a new step", f(".github/workflows/ci.yml", "@@ -1 +1,3 @@\n x\n+      - name: t\n+        run: echo '${{ toJSON(secrets) }}'")),
        (True, "R-M2: continue-on-error in a later hunk after a new step", f(".github/workflows/ci.yml", "@@ -1 +1,3 @@\n x\n+      - name: new\n+        run: bash new.sh\n@@ -40,2 +42,3 @@\n       - name: lint\n+        continue-on-error: true\n         run: bash lint.sh")),
        (True, "R-M2: an existing step gains if in a second hunk", f(".github/workflows/ci.yml", "@@ -1 +1,3 @@\n x\n+      - name: new\n+        run: bash new.sh\n@@ -40,2 +42,3 @@\n       - name: lint\n+        if: ${{ !true }}\n         run: bash lint.sh")),
        (True, "R-M3: an added .GitHooks/pre-push", f(".GitHooks/pre-push", "@@ -0,0 +1 @@\n+exit 0", "added")),
        (True, "R-M3: an added product/Tools/push-guard.sh", f("ai-workers/problem-1-pathway-setup-and-form-filling/product/Tools/push-guard.sh", "@@ -0,0 +1 @@\n+exit 0", "added")),
        (False, "a new test under screens/B119/ (its real case)", f("ai-workers/problem-1-pathway-setup-and-form-filling/product/screens/B119/check-y.py", "@@ -0,0 +1 @@\n+x = 1", "added")),
        (True, "R-B1: TESTS line loses a test (check-guards.sh)", f(T + "check-guards.sh", "@@ -41 +41 @@\n-TESTS=\"$TESTS check-weakening.sh check-records-queue.sh\"\n+TESTS=\"$TESTS check-weakening.sh\"")),
        (True, "R-B1: a guard check wrapped in if false", f(T + "migration-additive.py", "@@ -9,2 +9,3 @@\n def scan(s):\n+    if False:\n     if re.search('DROP', s): return 'no'")),
        (True, "R-B4: push-guard.sh renamed to push-guard.md", {"filename": T + "push-guard.md", "previous_filename": T + "push-guard.sh", "status": "renamed", "patch": "", "changes": 0}),
        # Round 2 on #3942 (reviewer R2-B1, R2-B2, R2-M1, R2-M2)
        (True, "R2-B1: a // line in a test (bash runs it)", f(T + "check-records-queue.sh", "@@ -1 +1,2 @@\n set -u\n+//usr/bin/false || exit 0")),
        (True, "R2-B1: a row-shaped exit 0 in a test other than check-guards.sh", f(T + "check-x.sh", "@@ -1 +1,2 @@\n set -u\n+exit 0 #|a|b|c.sh")),
        (True, "R2-B1: Python exit(0) in a test", f(T + "test_review_rounds.py", "@@ -1 +1,2 @@\n import os\n+exit(0)")),
        (False, "check-guards.sh gains a TESTS line, a comment with a quote, an opener and rows (#3715's shape)", f(T + "check-guards.sh", "@@ -40,2 +40,7 @@\n x\n+TESTS=\"$TESTS check-v.sh\"   # OS-72: plan\n+# OS-72: the skill's plan; each row switches one rule off.\n+MUT=\"$MUT\"'\n+OS72 cap|prototype/studio/tools/v.sh|s/a/b/|check-v.sh\n+OS72 data|prototype/studio/tools/v.sh|/x/s/exit 2/true/|check-v.sh'\n y")),
        (True, "check-guards.sh: a comment with a quote inside MUT='...'", f(T + "check-guards.sh", "@@ -1,2 +1,3 @@\n MUT=\"$MUT\"'\n+# don't\n A1 a|product/tools/a.sh|s/x/y/|check-a.sh'")),
        (True, "check-guards.sh: a row outside MUT='...' (it runs as code)", f(T + "check-guards.sh", "@@ -1 +1,2 @@\n TESTS=\"$TESTS x.sh\"\n+fail=0;:|product/tools/a.sh|s/x/y/|check-a.sh")),
        (True, "R2-B1: check-guards.sh gains a non-row line", f(T + "check-guards.sh", "@@ -1 +1,2 @@\n x\n+bad=0")),
        (True, "R2-B1: check-guards.sh closes the quote early, code after", f(T + "check-guards.sh", "@@ -1,2 +1,4 @@\n-A1 a|product/tools/a.sh|s/x/y/|check-a.sh'\n+A1 a|product/tools/a.sh|s/x/y/|check-a.sh\n+A2 b|product/tools/b.sh|s/x/y/|check-b.sh'\n+A3 fail=0;:|product/tools/c.sh|s/x/y/|check-c.sh\n x")),
        (True, "R2-B1: check-guards.sh row with a quote inside", f(T + "check-guards.sh", "@@ -1 +1,2 @@\n x\n+A9 x'; exit 0; '|product/tools/a.sh|s/x/y/|check-a.sh")),
        (False, "check-guards.sh gains a TESTS name", f(T + "check-guards.sh", "@@ -40 +40,2 @@\n x\n+TESTS=\"$TESTS check-new.sh\"   # A1: why")),
        (True, "R2-B2: a // continuation line in a workflow", f(".github/workflows/ci.yml", "@@ -300 +300,2 @@\n         run: bash check-mergify-scopes.sh\n+          // || true")),
        (True, "R2-M1: a hook gains one blank line (mode change hidden)", f(".githooks/pre-push", "@@ -1 +1,2 @@\n x\n+")),
        (True, "R2-M1: a blank line added inside an agent's front matter", f(".claude/agents/screen-reviewer.md", "@@ -2,3 +2,4 @@\n name: r\n+\n model: opus\n ---")),
        (True, "R2-M2: an added lower-case skill.md beside SKILL.md", f(".claude/skills/lead/skill.md", "@@ -0,0 +1 @@\n+allowed-tools: Bash", "added")),
        (True, "R2-M2: an added screens/b119/ file", f("ai-workers/problem-1-pathway-setup-and-form-filling/product/screens/b119/check-queue-rules.py", "@@ -0,0 +1 @@\n+x = 1", "added")),
        (True, "R2 C17: a new workflow with a job named ci", f(".github/workflows/fast-ci.yml", "@@ -0,0 +1,4 @@\n+on: pull_request\n+jobs:\n+  ci:\n+    runs-on: ubuntu-latest", "added")),
        (True, "a new .mergify/config.yml", f(".mergify/config.yml", "@@ -0,0 +1 @@\n+queue_rules: []", "added")),
        (True, "a new .claude/settings.local.json", f(".claude/settings.local.json", "@@ -0,0 +1 @@\n+{\"permissions\": {\"allow\": [\"Bash\"]}}", "added")),
        (True, "R2-M1: a long s (U+017F) in a new guard's name (the Mac folds it to push-guard.sh)", f(T + "pu\u017fh-guard.sh", "@@ -0,0 +1 @@\n+exit 0", "added")),
        (True, "R2-M1: claude.md beside CLAUDE.md", f("claude.md", "@@ -0,0 +1 @@\n+x", "added")),
        (True, "a removed tool", f(T + "push-guard.sh", "", "removed")),
        (True, "no patch given", {"filename": T + "big.sh", "status": "modified", "changes": 900}),
        (True, "a rename", {"filename": T + "x2.sh", "previous_filename": T + "x.sh", "status": "renamed", "patch": "", "changes": 0}),
    ]
    bad = 0
    for want, what, fx in cases:
        got = bool(judge(fx))
        print("%s  %s → %s" % ("PASS" if got == want else "FAIL", what, "weakening" if got else "not weakening"))
        bad += got != want
    miss = run([], ["x"])
    ok = miss and "fails closed" in miss[0]
    print("%s  a path missing from the file list is weakening (fails closed)" % ("PASS" if ok else "FAIL"))
    bad += not ok
    print("all passed" if not bad else "%d failed" % bad)
    return 1 if bad else 0


def main(argv):
    if argv[:1] == ["--self-test"]:
        return self_test()
    try:
        if argv[:1] == ["--files"]:
            with open(argv[1], encoding="utf-8") as fh:
                files = json.load(fh)
        elif argv[:1] == ["--git"]:
            files = from_git(argv[1])
        else:
            print(__doc__.split("\n\n")[-2])
            return 2
        if not isinstance(files, list):
            raise ValueError("not a list")
    except (OSError, ValueError, IndexError, subprocess.CalledProcessError) as e:
        print("weakening.py: the file list cannot be read (%s)" % e, file=sys.stderr)
        return 2
    paths = argv[2:] or ([] if sys.stdin.isatty() else [l.rstrip("\n") for l in sys.stdin if l.strip()])
    if not paths and argv[0] == "--git":
        paths = [f.get("filename", "") for f in files]   # --git with no paths: every changed file
    for line in run(files, paths):
        print(line)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
