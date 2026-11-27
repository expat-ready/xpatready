#!/usr/bin/env python3
"""Can a pipeline change weaken protection? (A438 cut 2, founder 27 Nov 14:3x IST: "Yes, all three"; P-423, P-823.)

Before A438 every pipeline path (.github/, .mergify.yml, the guards under product/tools/, hooks, agent settings) waited for
the Lead's read first; 17 lab PRs waited 18 min to 84 h. Now a pipeline path keeps the read first only when its diff CAN
weaken protection. A script cannot tell a stricter edit from a looser one (the breaker on #3942: one added "exit 0" switches
a guard off; a tool's name does not say whether CI runs it), so the rule is shape, and it fails closed:
  needs no read (the reviewer's Approve alone):
  * a new file (a new tool, test or workflow), unless a new workflow holds a privileged trigger or a WORKFLOW_RISK line;
  * an existing test (check-*, check_*, test_*, test-*, guards.d/, check-guards.sh's rows) that only gains lines: every
    removed line comes back unchanged (moved; a row's closing quote aside), and no added line skips, exits or swallows a
    failure (OFF below);
  * an existing workflow that only gains whole new steps or jobs (each added run of lines starts a step or job), with no
    WORKFLOW_RISK line and no removed line that does not come back unchanged;
  * an allow-list (quarantine, known failures, typecheck-known, route-has-screen-allow) that only loses entries;
  * comments in tests and workflows, and prose (.md) outside the front matter of agents and skills (a comment in
    other pipeline code counts: in lead-read-paths.txt a "# --- " marker is a rule);
  needs the Lead's read first: everything else on a pipeline path, which includes
  * any change to existing pipeline code (a guard, a gate, a CI helper, a hook, prototype/studio/tools/) other than a test
    gaining lines; any change to .mergify.yml or .claude/ settings (*.json, *.yml);
  * an agent's or a skill's front matter touched (its first lines, by the hunk's line numbers);
  * a file removed, renamed, mode-only or with no patch (too large, binary): fails closed.
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
# A test line that stops the test or hides a failure (as checks-changed.py's OFF, A351 C2)
OFF = re.compile(r"\.(skip|only|todo|fixme|skipIf)\b|\b(xit|xdescribe|fit|skipTest|skipIf|skipUnless)\(|\bskip:\s*true|"
                 r"\bif\s*\(\s*(false|0)\s*\)|^\s*if (False|0)\s*:|process\.exit\(\s*0?\s*\)|^\s*(exit(\s+0)?|return)\s*(;|$|[#/])|"
                 r"\bfalse\s*&&|\|\|\s*(true|:|echo|exit\s+0)\b|:\s*<<|sys\.exit\(\s*0?\s*\)|os\._exit|^\s*[`'\"]{3}\s*$|"
                 r"\bfunction\s+ok\b|^\s*ok\s*\(\)", re.M)
ROW = re.compile(r"^[^|\s][^|]*\|[^|]+\|.+\|[\w./-]+\.(sh|py)'?$")   # a check-guards.sh mutation row: its sed text is data
STEP_START = re.compile(r"^\s*-\s+(name|uses|run|id|if|with|env|shell|working-directory|timeout-minutes)\s*:")
JOB_START = re.compile(r"^  [A-Za-z0-9_-]+:\s*(#.*)?$")
COMMENT = re.compile(r"^\s*(#|//|/\*|\*(\s|/|$)|<!--|$)")   # "*)" (a shell case arm) is code, not a comment (review B2)
FRONT_MATTER_LINES = 15   # agents' and skills' front matter sits in their first lines (7 and 4 today); up to line 60 a
FM_KEY = re.compile(r"^[A-Za-z][\w-]*\s*:")   # changed line in key form ("hooks:", "model:") counts too
TRIGGER = re.compile(r"^\s*-?\s*(on|pull_request|pull_request_target|push|schedule|workflow_dispatch|workflow_run|workflow_call|"
                     r"issue_comment|issues|repository_dispatch|merge_group|check_run|check_suite|release|pull_request_review|"
                     r"pull_request_review_comment|discussion|discussion_comment|label|create|delete|status|types|branches|paths|tags)\s*:")


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


CASED = {"AGENTS.md", "CLAUDE.md", "SKILL.md", "README.md", "MODULE.md"}


def odd_case(path):
    """A path with capitals where the pipeline has none (review M3: on the Mac's case-insensitive disk an added
    .GitHooks/pre-push or product/Tools/push-guard.sh is the hook or the guard)."""
    parts = path.replace("/screens/B119/", "/screens/b119/").split("/")
    if parts[-1] in CASED:
        parts = parts[:-1]
    return any(p != p.lower() for p in parts)


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


def norm(l):
    return " ".join(l.strip().rstrip("'").split())


def judge(f):
    """One file of GitHub's answer -> the reason its change can weaken protection, or ""."""
    path, status, patch = f.get("filename", ""), f.get("status", "modified"), f.get("patch")
    k = kind(path)
    if status == "removed":
        return "a pipeline file removed"
    if status == "renamed" or f.get("previous_filename"):
        return "renamed from %s (a workflow, hook or test may no longer find it)" % f.get("previous_filename", "?")
    if status == "added" and odd_case(path):
        return "a new path whose case differs from the repository's (on the Mac's disk it replaces %s)" % path.lower()
    if not patch:
        return "" if (k == "prose" and status == "added") else "no patch given (too large, binary or a mode change): read first (fails closed)"
    rows = hunks(patch)
    add = [t for _, _, s, t in rows if s == "+" and not COMMENT.match(t)]
    rem = [t for _, _, s, t in rows if s == "-" and not COMMENT.match(t)]
    if k == "prose":
        return ""
    if k == "agent":
        # Front matter: from line 1 to the second "---". In a hunk that starts at line 1 the closing marker is the second
        # "---" seen; in one that starts later, the first (or a blank line: the body has begun). A changed line before it (and within the first 15 lines, or in
        # key form up to line 60) touches the front matter. A new agent or skill: only its tool, hook, model or
        # permission keys count (it widens access only through them).
        if status == "added":
            for o, n, s, t in rows:
                if s == "+" and n <= 60 and re.match(r"^\s*(allowed-tools|tools|hooks|model|effort|permissionMode|disallowed\w*)\s*:", t, re.I):
                    return "a new agent or skill sets %s" % t.strip()[:80]
            return ""
        seen, need, closed = 0, 2, False
        for o, n, s, t in rows:
            if s == "@":
                seen, need, closed = 0, (2 if min(o, n) <= 1 else 1), False
                continue
            no = n if s == "+" else o
            if not closed and s in "+-" and t.strip() and (no <= FRONT_MATTER_LINES or (no <= 60 and FM_KEY.match(t))):
                return "touches an agent's or skill's front matter (model, effort, tools, hooks): %s" % t.strip()[:80]
            if t.strip() == "---" and s != "+":
                seen += 1
                closed = closed or seen >= need
            elif not t.strip() and s != "+" and seen >= need - 1:
                closed = True   # a blank line: front matter (YAML keys) holds none, so the body has begun
        return ""
    if status == "added":
        if k == "workflow":
            for t in add:
                for rx, why in WORKFLOW_RISK:
                    if rx.search(t):
                        return "a new workflow with %s: %s" % (why, t.strip()[:80])
        return ""   # a new tool, test or file: the reviewer reads it
    if k == "allowlist":
        return "adds an allow-list entry: %s" % add[0].strip()[:80] if add else ""
    back = {norm(t) for t in add}
    if k == "test":
        for t in rem:
            if norm(t) not in back:
                return "removes or changes a test line (an assertion, a mutation row, its set-up): %s" % t.strip()[:80]
        for t in add:
            if OFF.search(t) and not ROW.match(t.strip()):
                return "adds a line that can stop the test or hide a failure: %s" % t.strip()[:80]
        return ""
    if k == "workflow":
        for t in rem:
            if norm(t) not in back:
                return "removes or changes a workflow line: %s" % t.strip()[:80]
        for t in add:
            for rx, why in WORKFLOW_RISK:
                if rx.search(t):
                    return "adds %s: %s" % (why, t.strip()[:80])
        for t in add:
            if TRIGGER.match(t):
                return "adds or changes a trigger: %s" % t.strip()[:80]
        new_block = False   # every added run of lines must start a new step or job
        for _, _, s, t in rows:
            if s != "+":
                new_block = False
                continue
            if COMMENT.match(t):
                continue
            if not new_block and not (STEP_START.match(t) or JOB_START.match(t)):
                return "changes an existing step, job or trigger (only whole new steps or jobs need no read): %s" % t.strip()[:80]
            new_block = True
        return ""
    # code: .mergify.yml, lead-read-paths.txt, settings, hooks, guards, gates, CI helpers. Comment lines count too: a
    # marker line ("# --- pipeline") is a rule there (review B2).
    add = [t for _, _, s, t in rows if s == "+" and t.strip()]
    rem = [t for _, _, s, t in rows if s == "-" and t.strip()]
    if add or rem:
        return "changes existing pipeline code or settings (a script cannot tell stricter from looser): %s" % (rem or add)[0].strip()[:80]
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
        (False, "a test gains a case", f(T + "check-x.sh", "@@ -1 +1,2 @@\n ok \"a\" 1\n+ok \"b\" 1")),
        (True, "a test loses a case", f(T + "check-x.sh", "@@ -1,2 +1 @@\n ok \"a\" 1\n-ok \"b\" 1")),
        (True, "a test assertion loosened (= 4 to -le 4)", f(T + "check-x.sh", "@@ -1 +1 @@\n-ok \"four\" \"$([ \"$n\" = 4 ] && echo 1)\"\n+ok \"four\" \"$([ \"$n\" -le 4 ] && echo 1)\"")),
        (True, "a mutation row removed", f(T + "check-guards.sh", "@@ -1 +0,0 @@\n-15 ci|product/tools/queue-gate.sh|s/a/b/|check-queue-gate.sh")),
        (False, "a mutation row added", f(T + "check-guards.sh", "@@ -1 +1,2 @@\n x\n+15 ci|product/tools/queue-gate.sh|s/a/b/|check-queue-gate.sh")),
        (True, "a guard line gains a pipe (existing code: read)", f(T + "merge-guard.sh", "@@ -1 +1 @@\n-LANE=$(lane.sh whoami)\n+LANE=$(lane.sh whoami | sed s/x/y/)")),
        (True, "a guard's check removed", f(T + "merge-guard.sh", "@@ -1,2 +1 @@\n x\n-[ -z \"$ok\" ] && exit 1")),
        (True, "a guard's threshold lowered", f(T + "wip-guard.py", "@@ -1 +1 @@\n-if n > 3: refuse()\n+if n > 9: refuse()")),
        (True, "comments only in existing code (a comment can be a rule marker, review B2)", f(T + "merge-guard.sh", "@@ -1 +1 @@\n-# old words\n+# new words")),
        (True, "a gate: any code change", f(T + "queue-gate.sh", "@@ -1 +1,2 @@\n x\n+autocover && return 0")),
        (True, "a gate: comments only (markers)", f(T + "queue-gate.sh", "@@ -1 +1 @@\n-# a\n+# b")),
        (True, ".mergify.yml condition", f(".mergify.yml", "@@ -1 +1 @@\n-      - check-success = ci\n+      - check-success = cj")),
        (True, "an allow-list entry added", f(T + "pr-suites-quarantine.txt", "@@ -1 +1,2 @@\n x\n+check_a.ts|runtime|2026-12-02|p822")),
        (False, "an allow-list entry removed", f(T + "pr-suites-quarantine.txt", "@@ -1,2 +1 @@\n x\n-check_a.ts|runtime|2026-12-02|p822")),
        (False, "a workflow gains a step", f(".github/workflows/ci.yml", "@@ -1 +1,3 @@\n x\n+      - name: lint\n+        run: bash lint.sh")),
        (True, "a workflow loses a step", f(".github/workflows/ci.yml", "@@ -1,3 +1 @@\n x\n-      - name: lint\n-        run: bash lint.sh")),
        (True, "a workflow's parts 4 to 6 (an existing step changed)", f(".github/workflows/guards.yml", "@@ -1 +1 @@\n-        part: [1, 2, 3, 4]\n+        part: [1, 2, 3, 4, 5, 6]")),
        (True, "a step gated on pull_request_target", f(".github/workflows/x.yml", "@@ -1 +1,2 @@\n x\n+        if: github.event_name == 'pull_request_target'")),
        (True, "pull_request_target added", f(".github/workflows/x.yml", "@@ -1 +1,2 @@\n on:\n+  pull_request_target:")),
        (True, "permissions widened", f(".github/workflows/x.yml", "@@ -1 +1 @@\n-permissions: { contents: read }\n+permissions: { contents: write }")),
        (True, "a secret", f(".github/workflows/x.yml", "@@ -1 +1,2 @@\n x\n+        env: { T: \"${{ secrets.PAT }}\" }")),
        (True, "a new trigger on a changed workflow", f(".github/workflows/x.yml", "@@ -1 +1,2 @@\n on:\n+  schedule:")),
        (False, "a new read-only pull_request workflow", f(".github/workflows/new.yml", "@@ -0,0 +1,6 @@\n+on:\n+  pull_request:\n+permissions: { contents: read }\n+jobs:\n+  t:\n+    steps: [{uses: actions/checkout@v4}]", "added")),
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
        (False, "a skill's body line 11 after a blank line (#3926's hunk from line 8)", f(".claude/skills/lead/SKILL.md", "@@ -8,4 +8,4 @@\n Home: x\n \n ## Guard\n-1. old\n+1. new")),
        (True, "a skill's front matter line 3 in a hunk from line 1", f(".claude/skills/lead/SKILL.md", "@@ -1,4 +1,4 @@\n ---\n name: lead\n-description: a\n+description: b\n ---")),
        (False, "a new skill without tool or model keys", f(".claude/skills/v/SKILL.md", "@@ -0,0 +1,4 @@\n+---\n+name: v\n+description: x\n+---", "added")),
        (True, "a new agent with tools", f(".claude/agents/x.md", "@@ -0,0 +1,4 @@\n+---\n+name: x\n+tools: Bash\n+---", "added")),
        (False, "a test sets up with unset (not a skip)", f(T + "check-x.sh", "@@ -1 +1,2 @@\n set -u\n+unset S N G")),
        (False, "a new mutation row whose sed text says exit", f(T + "check-guards.sh", "@@ -1 +1,2 @@\n x\n+A368 take|product/tools/takeover.sh|s/^  exit 1/  true/|check-takeover.sh'")),
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
        (False, "a workflow gains a whole new job", f(".github/workflows/ci.yml", "@@ -1 +1,4 @@\n x\n+  lint:\n+    runs-on: ubuntu-latest\n+    steps: [{run: bash lint.sh}]")),
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
