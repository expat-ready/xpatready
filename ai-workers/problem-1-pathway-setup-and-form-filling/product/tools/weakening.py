#!/usr/bin/env python3
"""Does a pipeline change weaken protection? (A438 cut 2, founder 27 Nov 14:3x IST: "Yes, all three"; P-423, P-823.)

Before A438 every pipeline path (.github/, .mergify.yml, the guards under product/tools/, hooks, agent settings) waited for
the Lead's read first; 17 lab PRs waited 18 min to 84 h. Now a pipeline path keeps the read first only when its diff can
weaken protection; a new test, a stricter check or an added tool merges on the reviewer's Approve alone. Decided from
the patch GitHub gives with the file list (the PR's code is never checked out or run), per file:
  * any file: removed or renamed (a guard, test or workflow that no longer runs), or no patch given (too large, binary):
    weakening (fails closed);
  * a gate (the files that decide labels, queues, routes and this read: GATES below, .mergify.yml): any changed line
    that is not a comment. A script cannot tell a stricter gate from a looser one, so the Lead reads every gate change;
  * an allow-list (quarantine, known failures, typecheck-known, route-has-screen-allow): an added entry;
  * a workflow (.github/**): an added pull_request_target, secrets., write permission, if: false,
    continue-on-error: true on an existing step (on a step the patch adds it is a report-only start, P-717 (b)), "|| true", --no-verify or a third-party action (not actions/); a new trigger (an added trigger key in a
    changed workflow; a privileged one in a new workflow); a removed line that no added line keeps (numbers aside);
  * agent settings (.claude/*.json, .claude/*.yml): an added allow rule, tool pattern, mode or hook switch; a removed line;
  * agent definitions (.claude/agents/*.md, skills' front matter): a changed model, effort, tools or permission line;
  * a test (check-*, test_*, test-*, guards.d/, check-guards.sh's mutation rows): a removed assertion that no added
    line keeps (an "ok ...", assert, PASS/FAIL, case(...) or mutation row);
  * a guard (.githooks/, .claude/hooks/, or a tool named guard, gate, check, hook, push, merge, label, queue, records,
    review, suites, route, ...: GUARD below): a removed code line (not a comment) that no added line keeps;
  * other pipeline code (reports, counters, the Lead's watch): never by itself; the reviewer reads it.
A removed line is "kept" when one added line of the same file holds all of its words and operators (so a line that only
gains a flag or a pipe is kept; a removed step, condition, comparison, threshold or exit is not). Instructions in prose (skills' and agents'
bodies, AGENTS.md, CLAUDE.md, .md files) are never weakening by themselves: the reviewer reads them.
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

GATES = {
    ".mergify.yml",
    "lead-read-paths.txt", "weakening.py", "lead-read-gate.sh", "lead-read-guard.sh",
    "queue-gate.sh", "label-guard.sh", "label-sweep.sh", "records-only.sh", "records-label.sh", "review-rounds.py",
    "change-route.sh", "change-kind.sh", "tooling-checks.sh", "approvals.yml", "gate-b.mjs", "works-set.mjs",
    "lead-read.yml", "queue-gate.yml", "label-guard.yml", "records-label.yml", "review-rounds.yml",
}
ALLOWLISTS = {"pr-suites-quarantine.txt", "known-failures.tsv", "typecheck-known.txt", "route-has-screen-allow.txt"}
WF_ADDED = [
    (re.compile(r"pull_request_target"), "adds pull_request_target"),
    (re.compile(r"secrets\."), "uses a secret"),
    (re.compile(r"(:\s*write\b|write-all)"), "widens permissions (write)"),
    (re.compile(r"\bif:\s*(false\b|\$\{\{\s*false)"), "switches a job or step off (if: false)"),
    (re.compile(r"\|\|\s*true\b"), "ignores a failure (|| true)"),
    (re.compile(r"--no-verify"), "skips the git hooks (--no-verify)"),
    (re.compile(r"\buses:\s*(?!\./|actions/)[\w.-]+/"), "adds or changes a third-party action"),
]
TRIGGERS = ("pull_request_target|workflow_run|issue_comment|repository_dispatch|schedule|push|pull_request_review|"
            "pull_request_review_comment|merge_group|workflow_call|check_run|check_suite|issues|discussion_comment|release")
TRIGGER_KEY = re.compile(r"^\s*-?\s*(%s)\s*:" % TRIGGERS)
TRIGGER_ON = re.compile(r"^\s*on:\s*\S")
PRIVILEGED = re.compile(r"^\s*-?\s*(pull_request_target|workflow_run|issue_comment|repository_dispatch|workflow_call)\b")
SETTINGS_ADDED = re.compile(r'"(allow|ask|defaultMode|additionalDirectories|disableAllHooks|enableAllProjectMcpServers|'
                            r'enabledMcpjsonServers|bypassPermissions|dangerously\w*)"|\b(Bash|Edit|Write|Read|WebFetch|'
                            r'WebSearch|NotebookEdit|mcp__[\w-]*)\(|^\s*-?\s*(allow|permissions?)\s*:', re.I)
# A guard by its name (hooks, gates, checks, the push and merge guards); other pipeline code (reports, the Lead's
# watch, counters) changes freely: the reviewer reads it.
GUARD = re.compile(r"(guard|gate|check|hook|preflight|ready|wip|lock|verify|rules|push|merge|label|queue|records|review|"
                   r"suites|route|flaky|known|conformance|^pre-|^post-|^commit-msg$)", re.I)
AGENT_FM = re.compile(r"^(model|effort|tools|allowed-tools|disallowedTools|permissionMode)\s*:", re.I)
ASSERT = re.compile(r"(^|\s)ok\s+[\"']|\bassert|\bt\s+(yes|no)\b|\bPASS\b|\bFAIL\b|\bcase\(|^[^|\s][^|]*\|[^|]+\|.+\|[\w./-]+\.(sh|py)'?$")
WORDS = re.compile(r"[A-Za-z0-9_]+|[=<>!|&]+")   # words and operators: "= 4" to "-le 4" is not kept
COMMENT = re.compile(r"^\s*(#|//|/\*|\*|<!--|$)")


def kind(path):
    base = path.rsplit("/", 1)[-1]
    if path == ".mergify.yml" or base in GATES:
        return "gate"
    if base in ALLOWLISTS:
        return "allowlist"
    if path.startswith(".github/"):
        return "workflow"
    if path.startswith(".claude/") and re.search(r"\.(json|ya?ml)$", base):
        return "settings"
    if path.startswith(".claude/agents/") or (path.startswith(".claude/skills/") and base == "SKILL.md"):
        return "agent"
    if base.endswith(".md") or path in ("AGENTS.md", "CLAUDE.md"):
        return "prose"
    if re.match(r"(check-|check_|test_|test-)", base) or "/guards.d/" in path:
        return "test"
    if path.startswith((".githooks/", ".claude/hooks/")) or GUARD.search(base):
        return "guard"
    return "code"


def lines(patch, sign):
    return [l[1:] for l in (patch or "").split("\n") if l.startswith(sign) and not l.startswith(sign * 3 + " ")]


def words(s, numbers=True):
    w = set(WORDS.findall(s))
    return w if numbers else {x for x in w if not x.isdigit()}


def kept(removed, added, numbers=True):
    """A removed line is kept when one added line of the file holds all of its words."""
    need = words(removed, numbers)
    return not need or any(need <= words(a, numbers) for a in added)


def front_matter(patch):
    """Changed lines of a .md's front matter: the hunk starting at line 1, up to the closing ---."""
    out, inside = [], False
    for l in (patch or "").split("\n"):
        m = re.match(r"^@@ -(\d+)(?:,\d+)? \+(\d+)", l)
        if m:
            inside = m.group(1) in ("0", "1") or m.group(2) == "1"
            seen = 0
            continue
        if not inside:
            continue
        if l[1:].strip() == "---":
            seen += 1
            if seen == 2:
                inside = False
            continue
        if l[:1] in "+-":
            out.append(l[1:])
    return out


def judge(f):
    """One file of GitHub's answer -> the reason it weakens protection, or ""."""
    path, status, patch = f.get("filename", ""), f.get("status", "modified"), f.get("patch")
    k = kind(path)
    if status == "removed":
        return "" if k == "prose" else "a %s removed" % ("gate" if k == "gate" else "pipeline file")
    if status == "renamed" and k != "prose":
        return "renamed from %s (a workflow, hook or test may no longer find it)" % f.get("previous_filename", "?")
    if not patch:
        if k == "prose" and status == "added":
            return ""
        return "" if (f.get("changes", 1) == 0 and status != "added") else "no patch given (too large or binary): read first (fails closed)"
    add, rem = lines(patch, "+"), lines(patch, "-")
    code_add = [l for l in add if not COMMENT.match(l)]
    code_rem = [l for l in rem if not COMMENT.match(l)]
    if k == "prose":
        return ""
    if k == "gate":
        return "a gate (labels, queues, routes or this read): every change is read" if code_add or code_rem else ""
    if k == "allowlist":
        return "adds an allow-list entry: %s" % code_add[0].strip()[:80] if code_add else ""
    if k == "agent":
        fm = [l for l in front_matter(patch) if AGENT_FM.match(l)]
        return "changes an agent's %s" % fm[0].split(":")[0].strip() if fm else ""
    if k == "settings":
        for l in code_add:
            if SETTINGS_ADDED.search(l):
                return "adds a permission or mode: %s" % l.strip()[:80]
        for l in code_rem:
            if l.strip() in ("", "{", "}", "},", "[", "]", "],") or kept(l, code_add):
                continue
            return "removes a setting (a hook, a deny rule): %s" % l.strip()[:80]
        return ""
    if k == "workflow":
        new_step = False   # continue-on-error on a step this patch adds is a report-only start (P-717 (b)), not a weakening
        for l in (patch or "").split("\n"):
            if l.startswith(" ") and re.match(r"^\s*-\s", l[1:]):
                new_step = False
            if not l.startswith("+") or l.startswith("+++ "):
                continue
            l = l[1:]
            if re.match(r"^\s*-\s*(name|uses|run|id):", l):
                new_step = True
            if re.search(r"continue-on-error:\s*true", l) and not new_step:
                return "lets an existing step fail (continue-on-error: true): %s" % l.strip()[:80]
        for l in code_add:
            for rx, why in WF_ADDED:
                if rx.search(l):
                    return "%s: %s" % (why, l.strip()[:80])
            if status == "added":
                if PRIVILEGED.search(l):
                    return "a new workflow with a privileged trigger: %s" % l.strip()[:80]
            elif TRIGGER_KEY.search(l) or TRIGGER_ON.search(l):
                return "adds a trigger: %s" % l.strip()[:80]
        for l in code_rem:
            if re.match(r"^\s*-?\s*name:", l) or l.strip() in ("run: |", "run: >", "with:", "env:", "steps:"):
                continue
            if not kept(l, code_add, numbers=False):
                return "removes a workflow line: %s" % l.strip()[:80]
        return ""
    if k == "test":
        for l in code_rem:
            if ASSERT.search(l) and not kept(l, code_add):
                return "removes or changes a test assertion or mutation row: %s" % l.strip()[:80]
        return ""
    if k == "guard":
        for l in code_rem:
            if l.strip() and not kept(l, code_add):
                return "removes or changes a guard's line: %s" % l.strip()[:80]
    return ""   # other pipeline code (reports, counters, the Lead's watch): the reviewer reads it


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
        (False, "a guard line gains a pipe", f(T + "merge-guard.sh", "@@ -1 +1 @@\n-LANE=$(lane.sh whoami)\n+LANE=$(lane.sh whoami | sed s/x/y/)")),
        (True, "a guard's check removed", f(T + "merge-guard.sh", "@@ -1,2 +1 @@\n x\n-[ -z \"$ok\" ] && exit 1")),
        (True, "a guard's threshold lowered", f(T + "wip-guard.py", "@@ -1 +1 @@\n-if n > 3: refuse()\n+if n > 9: refuse()")),
        (False, "comments only", f(T + "merge-guard.sh", "@@ -1 +1 @@\n-# old words\n+# new words")),
        (True, "a gate: any code change", f(T + "queue-gate.sh", "@@ -1 +1,2 @@\n x\n+autocover && return 0")),
        (False, "a gate: comments only", f(T + "queue-gate.sh", "@@ -1 +1 @@\n-# a\n+# b")),
        (True, ".mergify.yml condition", f(".mergify.yml", "@@ -1 +1 @@\n-      - check-success = ci\n+      - check-success = cj")),
        (True, "an allow-list entry added", f(T + "pr-suites-quarantine.txt", "@@ -1 +1,2 @@\n x\n+check_a.ts|runtime|2026-12-02|p822")),
        (False, "an allow-list entry removed", f(T + "pr-suites-quarantine.txt", "@@ -1,2 +1 @@\n x\n-check_a.ts|runtime|2026-12-02|p822")),
        (False, "a workflow gains a step", f(".github/workflows/ci.yml", "@@ -1 +1,3 @@\n x\n+      - name: lint\n+        run: bash lint.sh")),
        (True, "a workflow loses a step", f(".github/workflows/ci.yml", "@@ -1,3 +1 @@\n x\n-      - name: lint\n-        run: bash lint.sh")),
        (False, "a workflow's parts 4 to 6", f(".github/workflows/guards.yml", "@@ -1 +1 @@\n-        part: [1, 2, 3, 4]\n+        part: [1, 2, 3, 4, 5, 6]")),
        (True, "a step gated on pull_request_target", f(".github/workflows/x.yml", "@@ -1 +1,2 @@\n x\n+        if: github.event_name == 'pull_request_target'")),
        (True, "pull_request_target added", f(".github/workflows/x.yml", "@@ -1 +1,2 @@\n on:\n+  pull_request_target:")),
        (True, "permissions widened", f(".github/workflows/x.yml", "@@ -1 +1 @@\n-permissions: { contents: read }\n+permissions: { contents: write }")),
        (True, "a secret", f(".github/workflows/x.yml", "@@ -1 +1,2 @@\n x\n+        env: { T: \"${{ secrets.PAT }}\" }")),
        (True, "a new trigger on a changed workflow", f(".github/workflows/x.yml", "@@ -1 +1,2 @@\n on:\n+  schedule:")),
        (False, "a new read-only pull_request workflow", f(".github/workflows/new.yml", "@@ -0,0 +1,6 @@\n+on:\n+  pull_request:\n+permissions: { contents: read }\n+jobs:\n+  t:\n+    steps: [{uses: actions/checkout@v4}]", "added")),
        (True, "a new workflow on workflow_run", f(".github/workflows/new.yml", "@@ -0,0 +1,2 @@\n+on:\n+  workflow_run:", "added")),
        (True, "continue-on-error on an existing step", f(".github/workflows/ci.yml", "@@ -1,2 +1,3 @@\n       - name: lint\n+        continue-on-error: true\n         run: bash lint.sh")),
        (False, "a new report-only step (P-717 (b))", f(".github/workflows/ci.yml", "@@ -1 +1,4 @@\n x\n+      - name: new check, report-only\n+        continue-on-error: true\n+        run: bash new.sh")),
        (False, "a report tool loses a line", f(T + "founder-report.py", "@@ -1 +1 @@\n-print(report(a))\n+out = report(a)")),
        (True, "a git hook loses a line", f(".githooks/pre-push", "@@ -1,2 +1 @@\n x\n-bash push-guard.sh || exit 1")),
        (True, "the approvals policy", f(".claude/approvals.yml", "@@ -1 +1 @@\n-mode: observe\n+mode: enforce")),
        (True, "a third-party action", f(".github/workflows/ci.yml", "@@ -1 +1,2 @@\n x\n+      - uses: someone/tool@v1")),
        (True, "settings: an allow rule", f(".claude/settings.json", "@@ -1 +1,2 @@\n x\n+      \"Bash(git push:*)\",")),
        (True, "settings: a hook removed", f(".claude/settings.json", "@@ -1,2 +1 @@\n x\n-            \"command\": \"bash guard.sh\",")),
        (False, "settings: a hook added", f(".claude/settings.json", "@@ -1 +1,3 @@\n x\n+          {\n+            \"command\": \"bash guard.sh\",")),
        (True, "an agent's effort lowered", f(".claude/agents/screen-reviewer.md", "@@ -1,4 +1,4 @@\n ---\n name: r\n-effort: high\n+effort: medium")),
        (False, "an agent's body", f(".claude/agents/screen-reviewer.md", "@@ -20 +20 @@\n-old\n+new")),
        (False, "a skill's prose", f(".claude/skills/next/SKILL.md", "@@ -20 +20 @@\n-old\n+new")),
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
