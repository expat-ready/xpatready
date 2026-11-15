#!/usr/bin/env python3
"""Finish before starting (B193 part 2 (e); P-622 (1), P-623 (1)): no new build row starts in a module group while that
group has 2 capabilities built and waiting for qa, or one waiting over 24 h, unless the row is a qa bug fix.

PreToolUse hook on create_session / start_session (the Lead starts a builder): the row IDs in the new session's prompt
and title (PF-21v, FO-3, CS-C1b …) map to module groups by cockpit-data.py's COMP_PREFIX (longest prefix wins; the test
keeps the two tables equal). "Waiting for qa" = a file in qa/built/ (P-221) on origin/main (else HEAD), its age = the
commit that added it. A prompt naming an open qa bug (a `| QA-n |` row in qa/BUGS.md) is a bug fix and passes.
Fails open when the copy cannot be read (the lane preflight still runs). Also by hand:
  python3 wip-guard.py --status [repo root]    one line per module group; exit 1 when any group is full
Env (tests): NOW (epoch seconds). Test: check-wip-guard.sh."""
import json, os, re, subprocess, sys, time

P = "ai-workers/problem-1-pathway-setup-and-form-filling/product"
COMP_PREFIX = [("FO-7", "client_money"), ("FO-", "front_office"), ("AS-2c", "front_office"), ("AS-", "case_side"), ("PF-", "platform"), ("DB-", "platform"),
               ("CS-", "case_side"), ("BK-", "case_side"), ("M3-", "case_side"), ("B5-", "case_side"), ("UX-", "case_side"),
               ("G-", "case_side"), ("L-", "case_side"), ("AUD-", "audit"), ("Q-", "qa"), ("CI-", "pipeline"), ("TR-", "pipeline"),
               ("Flaky-", "pipeline")]
MODULES = {"platform", "front_office", "client_money", "case_side", "audit"}   # tooling groups (qa, pipeline) are not limited
MAX_WAITING, MAX_HOURS = 2, 24
ROW = re.compile(r"(?<![A-Za-z0-9-])((?:[A-Z][A-Za-z0-9]{0,4}-)[0-9A-Z][0-9A-Za-z.]*)")


def group(row_id):
    """Module group of a row or capability ID; capabilities (C2.4), qa rows and bake rows default to the case side."""
    for pre, comp in sorted(COMP_PREFIX, key=lambda x: -len(x[0])):
        if row_id.startswith(pre):
            return comp
    return None


def git(root, *a):
    return subprocess.run(["git", "-C", root, *a], capture_output=True, text=True, timeout=20).stdout


def waiting(root):
    """{group: [(id, hours waiting)]} from qa/built/ on origin/main (else HEAD)."""
    ref = "origin/main" if git(root, "rev-parse", "--verify", "-q", "origin/main").strip() else "HEAD"
    now = int(os.environ.get("NOW") or time.time())
    out = {}
    for path in git(root, "ls-tree", "--name-only", ref, f"{P}/qa/built/").split():
        name = os.path.basename(path)
        if not name.endswith(".md") or name == "README.md":
            continue
        cid = name[:-3]
        added = git(root, "log", ref, "--diff-filter=A", "--format=%ct", "-1", "--", path).strip()
        hours = (now - int(added)) / 3600 if added else 0
        out.setdefault(group(cid) or "case_side", []).append((cid, hours))
    return out


def full(items):
    return len(items) >= MAX_WAITING or any(h > MAX_HOURS for _, h in items)


def describe(g, items):
    return f"{g}: " + ", ".join(f"{c} {h:.0f} h" for c, h in sorted(items, key=lambda x: -x[1]))


def open_bugs(root):
    try:
        return set(re.findall(r"^\| (QA-\d+) \|", open(os.path.join(root, P, "qa/BUGS.md"), encoding="utf-8").read(), re.M))
    except OSError:
        return set()


def main():
    if sys.argv[1:2] == ["--status"]:
        root = sys.argv[2] if len(sys.argv) > 2 else git(".", "rev-parse", "--show-toplevel").strip()
        w = waiting(root)
        for g in sorted(MODULES):
            items = w.get(g, [])
            print(("FULL  " if full(items) else "ok    ") + (describe(g, items) if items else f"{g}: nothing waiting for qa"))
        return 1 if any(full(w.get(g, [])) for g in MODULES) else 0
    try:
        hook = json.load(sys.stdin)
    except ValueError:
        return 0
    ti = hook.get("tool_input") or {}
    text = " ".join(str(ti.get(k) or "") for k in ("prompt", "title", "message"))
    root = git(hook.get("cwd") or ".", "rev-parse", "--show-toplevel").strip()
    if not root:
        return 0
    rows = {r.rstrip(".") for r in ROW.findall(text)}
    groups = {group(r) for r in rows} & MODULES
    if not groups:
        return 0
    bugs = set(re.findall(r"\bQA-\d+\b", text)) & open_bugs(root)
    if bugs:
        return 0   # a qa bug fix may start in a full group
    w = waiting(root)
    blocked = [describe(g, w[g]) for g in sorted(groups) if full(w.get(g, []))]
    if not blocked:
        return 0
    print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "deny",
        "permissionDecisionReason": "Finish before starting (P-622 (1), P-623 (1)): no new build row in a module group with "
        f"{MAX_WAITING} capabilities waiting for qa or one waiting over {MAX_HOURS} h. Full: " + "; ".join(blocked) +
        ". Get qa's verdicts on those first, or start a fix for an open qa bug (name its QA-n in the prompt)."}}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
