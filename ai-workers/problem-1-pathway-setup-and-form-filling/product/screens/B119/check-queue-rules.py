#!/usr/bin/env python3
"""Which Mergify queue a pull request joins, read from .mergify.yml itself (B119, P-376 (1), 6 Nov).

Records never block code, by one route (Lead 21's ruling on #1147, 6 Nov): CI labels a records-only PR "records"
(tools/records-only.sh, from #1139: the one definition of a record), the queue "records", listed after
"product" so it has the lowest priority, takes the label, and product skips it (D1, P-416, 8 Nov: the m2 and m3 queues
became the one "product" queue). This script evaluates the
queue_conditions the way Mergify does (the first queue, in file order, whose conditions all hold; on a list such as
label, "attr=x" holds when any item equals x and "-attr=x" when none does) on fixed PRs, and checks the rules every
queue keeps (base main, the review label, green ci, refusing drafts, records last). P-664 (founder 17 Nov, "Yes,
verdicts first (Recommended)"): a queue "verdicts", listed first, takes only qa verdict records (label "records", title
starting "qa:", qa/CAPABILITIES.md changed); every other record still goes to "records", last. P-827 (founder 25 Nov,
"Yes, pipeline first", one-time): the queue "pipeline" is listed second, ahead of "product", without
allow_checks_interruption, until P-822, P-823 and the Lead-tool fixes are on main (undo: move pipeline back after
product when P-827 ends, here and in .mergify.yml). Fast route (lab lane, 27 Nov; P-847): "pipeline" is the tooling
queue, and pipeline work plus records (product/ .md, images, .txt, .html) still joins it, never product. Each fixed PR lists its files;
its label comes from records-only.sh is-records and must agree with the case's expected label (so the definition and
the cases cannot drift apart), and the label name the queues use must be the one records-only.sh prints. A missing
records-only.sh fails the check. Then it breaks the configuration on purpose and expects each
break to be caught, so the check is shown to fail, not only to pass. Runs no suite, US$0. It does not replace Mergify's
own validation (the "Configuration changed" check on the PR).
  python3 -I product/screens/B119/check-queue-rules.py [path/to/.mergify.yml]
It lives in B119's row folder because product/tools/ is the tech lead's; the PR proposes running it in CI.
"""
import copy, os, re, subprocess, sys

try:
    import yaml
except ImportError:
    print("PyYAML is missing; nothing was checked"); sys.exit(2)

P = "ai-workers/problem-1-pathway-setup-and-form-filling"
R = f"{P}/product"
COND = re.compile(r"^(-)?([a-z][a-z-]*)\s*(?:(~=|=)\s*(.*))?$")
LISTS = {"files", "label", "check-success", "check-failure"}
LABEL = "records"   # read from records-only.sh label in main()
# A438 cut 1: the records and verdicts queues (no review label) read the head's files themselves: records-only.sh's
# RECORD_FILE and its tools exclusion, written for Mergify.
RECORD_ONLY = r"-files ~= ^(?!" + P + r"/product/([^/]+/)*[^/]+\.(md|png|jpe?g|gif|webp|svg|txt|html)$)"
NO_TOOLS = r"-files ~= ^" + P + r"/product/[Tt][Oo][Oo][Ll][Ss]/"
ROOT = subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True).stdout.strip() or "."
IS_RECORDS = os.path.join(ROOT, R, "tools", "records-only.sh")


def holds(cond, pr):
    """One Mergify condition on one PR. Fails loudly on any form this script does not model."""
    if isinstance(cond, dict):
        (op, subs), = cond.items()
        if op == "and": return all(holds(c, pr) for c in subs)
        if op == "or": return any(holds(c, pr) for c in subs)
        if op == "not": return not holds(subs, pr)
        raise ValueError(f"unmodelled condition {cond!r}")
    m = COND.match(cond.strip())
    if not m: raise ValueError(f"unmodelled condition {cond!r}")
    neg, attr, op, val = m.groups()
    if attr not in pr: raise ValueError(f"unmodelled attribute {attr!r} in {cond!r}")
    v = pr[attr]
    if op is None:
        r = bool(v)
    else:
        val = val.strip()
        if len(val) >= 2 and val[0] == val[-1] and val[0] in "\"'": val = val[1:-1]
        items = v if attr in LISTS else [v]
        r = any((re.search(val, i) is not None) if op == "~=" else (i == val) for i in items)
    return not r if neg else r


def queue_of(cfg, pr):
    for q in cfg["queue_rules"]:
        if all(holds(c, pr) for c in q.get("queue_conditions", [])):
            return q["name"]
    return None


_SEEN = {}


def is_records(files):
    """The one definition (#1139, tools/records-only.sh); each file list asked once (the breaks re-ask the same ones)."""
    key = tuple(files)
    if key not in _SEEN: _SEEN[key] = _is_records(files)
    return _SEEN[key]


def _is_records(files):
    r = subprocess.run(["bash", IS_RECORDS, "is-records", "--files"], input="\n".join(files) + "\n",
                       capture_output=True, text=True, cwd=ROOT)
    if r.returncode != 0 or r.stdout.strip() not in ("yes", "no"):
        raise ValueError(f"records-only.sh is-records failed: {r.stdout.strip()} {r.stderr.strip()}")
    return r.stdout.strip() == "yes"


# E6 (P-772): pr-rules runs on every PR, so a case has it green unless it says otherwise.
def case(what, files, record, want, title="evidence: something", labels=("review: approved",), checks=("ci", "pr-rules"),
         draft=False, base="main", head="claude/keen-maxwell-x1", failed=()):
    return {"what": what, "record": record, "want": want,
            "pr": {"files": list(files), "title": title, "label": list(labels), "check-success": list(checks), "check-failure": list(failed),
                   "draft": draft, "base": base, "head": head}}


A = f"{P}/prototype/studio"
F = ("ci", "queue-fresh", "pr-rules")  # B194: app code also needs the status queue-fresh (queue-gate.sh); E6 (P-772): and pr-rules
CASES = [  # what, files, a record by #1139's definition?, the queue it must join
    case("the daily records PR: STATE, DECISIONS, BACKLOG, RULES", [f"{R}/STATE.md", f"{R}/DECISIONS.md", f"{R}/BACKLOG.md", f"{R}/RULES.md"], True, "records", "lead: records 6 Nov"),
    case("qa notes with screenshots, a run's text and a built note", [f"{R}/qa/BUGS.md", f"{R}/qa/walks/x/shot.png", f"{R}/qa/runs/out.txt", f"{R}/qa/built/C1.3.md"], True, "records", "qa: after-merge"),
    case("a screen's notes and its HTML board", [f"{R}/screens/12/build-notes.md", f"{R}/screens/12/board.html"], True, "records"),
    case("the history folder", [f"{R}/history/lead20-handover.md", f"{R}/history/old/STATE-2026-11-05.txt"], True, "records"),
    case("the way of working (a record under product/)", [f"{R}/WAY-OF-WORKING.md"], True, "records"),
    # P-664: qa verdict records first; only those.
    case("a qa verdict (qa: title, CAPABILITIES.md): verdicts", [f"{R}/qa/CAPABILITIES.md", f"{R}/qa/BUGS.md"], True, "verdicts", "qa: capability R1 — R1.9 Works", head="claude/tender-einstein-wpko9j"),
    case("a qa verdict on a claude/qa- branch: verdicts", [f"{R}/qa/CAPABILITIES.md"], True, "verdicts", "qa: capability R1 re-score", head="claude/qa-r1-rescore-1115"),
    case("qa records without CAPABILITIES.md: records", [f"{R}/qa/BUGS.md", f"{R}/qa/runs/out.txt"], True, "records", "qa: after-merge lane log", head="claude/confident-allen-dt0td1"),
    case("non-qa records touching CAPABILITIES.md: records", [f"{R}/qa/CAPABILITIES.md", f"{R}/STATE.md"], True, "records", "lead: records 17 Nov", head="lead/2026-11-17-records"),
    case("a qa: title on code touching CAPABILITIES.md: product", [f"{R}/qa/CAPABILITIES.md", f"{A}/web/src/App.tsx"], False, "product", "qa: fix and verdict", checks=F),
    case("a qa verdict draft: no queue", [f"{R}/qa/CAPABILITIES.md"], True, None, "qa: capability x", draft=True),
    # (A438 cut 1: "a qa verdict without the review label" now joins verdicts; the case is above, with the A438 cases.)
    case("an M3 title on records only still goes to records", [f"{R}/qa/CAPABILITIES.md"], True, "records", "M3 qa: C7.3 scored"),
    case("records plus one app file: product", [f"{R}/STATE.md", f"{A}/api/src/core.ts"], False, "product", checks=F),
    case("records plus one app file, M3 title: product (no title routing)", [f"{R}/qa/built/C7.3.md", f"{A}/web/src/App.tsx"], False, "product", "forms: C7.3 — x", checks=F),
    case("an M3 title on code: product", [f"{A}/web/src/App.tsx"], False, "product", "M3 runtime: C7.5 — x", checks=F),
    case("app code alone: product", [f"{A}/api/src/demo.ts"], False, "product", "runtime: C4.11 — x", checks=F),
    case("app code with pr-rules not green: no queue (E6, P-772)", [f"{A}/api/src/demo.ts"], False, None, "runtime: C4.11 — x",
         checks=("ci", "queue-fresh")),
    case("a qa script (.cjs) is not a record", [f"{R}/qa/walks/x/walk.cjs"], False, "product"),
    case("a tool under product/tools/, even a .md: pipeline (P-717 (a))", [f"{R}/tools/README.md"], False, "pipeline"),
    case("this row's checker (.py under screens/)", [f"{R}/screens/B119/check-queue-rules.py"], False, "product"),
    case("a JSON file under screens/", [f"{R}/screens/12/fixture.json"], False, "product"),
    case("the merge queue file itself: pipeline (P-717 (a))", [".mergify.yml"], False, "pipeline"),
    case("a workflow: pipeline (P-717 (a))", [".github/workflows/ci.yml"], False, "pipeline"),
    case("a skill: pipeline (P-717 (a))", [".claude/skills/next/SKILL.md"], False, "pipeline"),
    case("agent rules and a git hook: pipeline", ["AGENTS.md", "CLAUDE.md", ".githooks/pre-push"], False, "pipeline"),
    case("a workflow plus app code: product (one non-pipeline file is enough)", [".github/workflows/ci.yml", f"{A}/api/src/core.ts"], False, "product", checks=F),
    # Fast route (lab lane, 27 Nov; P-847): pipeline work may carry records; the queue "pipeline" is the tooling queue.
    case("a tool plus a record: pipeline (fast route, P-847), never product or records", [f"{R}/tools/x.sh", f"{R}/STATE.md"], False, "pipeline"),
    case("a skill plus a design note and a screenshot: pipeline (P-847)", [".claude/skills/next/SKILL.md", f"{R}/design/lab-register-2026-11-27.md", f"{R}/design/x.png"], False, "pipeline"),
    case("a tool, a record and app code: product (app code never in pipeline)", [f"{R}/tools/x.sh", f"{R}/STATE.md", f"{A}/api/src/core.ts"], False, "product", checks=F),
    case("a workflow plus a JSON file under screens/: product (not a record)", [".github/workflows/guards.yml", f"{R}/screens/12/fixture.json"], False, "product"),
    case("records only, label missing (records-label.yml not run yet): pipeline, never product (P-847)", [f"{R}/STATE.md"], None, "pipeline"),
    case("records only, labelled: still records, not pipeline (P-847)", [f"{R}/STATE.md", f"{R}/design/x.md"], True, "records"),
    case("a look-alike pipeline path: tools/ outside product/", [f"{A}/tools/gate-b.mjs"], False, "product", checks=F),
    case("a PR with no files: pipeline (every file of none is pipeline work; still needs the label and ci)", [], False, "pipeline"),
    case("pipeline work without the review label: no queue", [".github/workflows/ci.yml"], False, None, labels=()),
    case("a look-alike name: STATE.md.bak", [f"{R}/STATE.md.bak"], False, "product"),
    case("a look-alike place: STATE.md outside product/", [f"{A}/STATE.md"], False, "product", checks=F),
    # A438 cut 1 (founder 27 Nov): a records-only PR queues with no reviewer and no review label; a mixed PR does not.
    case("A438: records without the review label: records (no reviewer, no label)", [f"{R}/STATE.md"], True, "records", labels=()),
    case("A438: a qa verdict without the review label: verdicts", [f"{R}/qa/CAPABILITIES.md"], True, "verdicts", "qa: after-merge", labels=()),
    case("A438: records plus a tool, no review label: no queue (not records only)", [f"{R}/STATE.md", f"{R}/tools/x.sh"], False, None, labels=()),
    case("A438: records plus app code, no review label: no queue", [f"{R}/STATE.md", f"{A}/api/src/core.ts"], False, None, labels=(), checks=F),
    case("A438: a hand-added records label on code with no review label: no queue (Mergify reads the files)", [f"{A}/api/src/core.ts"], None, None,
         labels=("records",)),
    case("A438: a hand-added records label on a tool: no queue", [f"{R}/tools/x.md"], None, None, labels=("records",)),
    case("A438: a hand-added records label on product/Tools/ (the Mac's disk): no queue", [f"{R}/Tools/x.md"], None, None, labels=("records",)),
    case("A438: a hand-added records label on a JSON under product/: no queue", [f"{R}/screens/12/fixture.json"], None, None, labels=("records",)),
    case("A438: records labelled, a code file pushed later (the label not yet taken off): no queue", [f"{R}/STATE.md", f"{A}/web/src/App.tsx"], None, None,
         labels=("records",)),
    case("records with ci not green: no queue", [f"{R}/STATE.md"], True, None, checks=()),
    case("records against another base: no queue", [f"{R}/STATE.md"], True, None, base="lead/x"),
    case("a draft records PR: no queue (a draft runs no check, #875)", [f"{R}/STATE.md"], True, None, draft=True),
    case("app code without queue-fresh (B194): no queue", [f"{A}/api/src/demo.ts"], False, None),
    case("code without the review label: no queue", [f"{A}/api/src/core.ts"], False, None, labels=()),
    # B170a (#1545): a change to the XFA engine also needs the xfa-engine workflow's check green (Lead 18, 11 Nov).
    case("an XFA engine change with xfa-engine green: product", ["packages/xfa-engine/src/x.ts"], False, "product",
         checks=("ci", "xfa-engine", "pr-rules")),
    case("an XFA engine change without the xfa-engine check: no queue", ["packages/xfa-engine/src/x.ts"], False, None),
    case("the xfa-engine workflow itself without its check: no queue", [".github/workflows/xfa-engine.yml"], False, None),
    # The label alone routes: a hand-added "records" on code joins records (lowest priority; its batch still runs ci,
    # and change-kind.sh calls it code, so every suite runs), never a product batch.
    case("a hand-added records label on code: no queue (A438: records reads the files; product skips the label)", [f"{A}/api/src/core.ts"], None, None,
         labels=("review: approved", "records")),
    case("ENF-782a: app code whose completes-ready failed (a part of its Completes: item missing) waits", [f"{A}/api/src/x.ts"], False, None, checks=F, failed=("completes-ready",)),
]


def labelled(c, have_script):
    """The PR as Mergify sees it: with "records" when the definition calls its files records."""
    pr = copy.deepcopy(c["pr"])
    if c["record"] is None: return pr, None
    got = is_records(pr["files"]) if have_script else c["record"]
    note = None if got == c["record"] else f"records-only.sh is-records says {got}, the case expects {c['record']}"
    if got and LABEL not in pr["label"]: pr["label"].append(LABEL)
    return pr, note


def problems(cfg, have_script):
    """Every way this configuration breaks B119; an empty list means it holds."""
    out = []
    qs = cfg.get("queue_rules", [])
    names = [q.get("name") for q in qs]
    # P-827 (one-time): pipeline ahead of product. Undo: move pipeline back after product when P-827 ends.
    if names != ["verdicts", "pipeline", "product", "records"]:
        out.append(f"queue order is {names}: want verdicts, pipeline, product, records (the first listed has the highest "
                   "priority; qa verdicts first (P-664), pipeline ahead of product while P-827 holds, records last)")
    for q in qs:
        conds = [c.replace(" ", "") for c in q.get("queue_conditions", []) if isinstance(c, str)]
        # A438 cut 1: records and verdicts need no review label; every other queue keeps it.
        reviewed = q.get("name") not in ("records", "verdicts")
        for need in ("base = main", "label = review: approved", "check-success = ci"):
            if need.startswith("label = review") and not reviewed:
                continue
            if need.replace(" ", "") not in conds:
                out.append(f"queue {q.get('name')}: queue_conditions lack {need!r} (no gate removed)")
        if not reviewed:   # A438 cut 1: with no reviewer, Mergify itself checks every file of the head is a record
            for need in (RECORD_ONLY, NO_TOOLS):
                if need.replace(" ", "") not in conds:
                    out.append(f"queue {q.get('name')}: queue_conditions lack {need!r} (A438: no review label, so every file must be a record)")
        if "check-success = ci" not in [c.strip() for c in q.get("merge_conditions", []) if isinstance(c, str)]:
            out.append(f"queue {q.get('name')}: merge_conditions lack 'check-success = ci' (the batch is tested)")
        # Each queue carries its own label guard, not only by being listed after the others (defence in depth).
        want = "label=records" if q.get("name") in ("records", "verdicts") else "-label=records"
        if want not in conds:
            out.append(f"queue {q.get('name')}: queue_conditions lack {want!r}")
        if q.get("name") == "verdicts":   # P-664: only qa verdict records go first
            for need in ("title~=^qa:", r"files~=qa/CAPABILITIES\.md$"):
                if need not in conds:
                    out.append(f"queue verdicts: queue_conditions lack {need!r} (only qa verdict records go first)")
            if q.get("allow_checks_interruption"):
                out.append("queue verdicts: allow_checks_interruption set (a verdict must not restart a running batch)")
        if q.get("name") == "pipeline" and q.get("allow_checks_interruption"):   # P-827: ahead of product, never restarting it
            out.append("queue pipeline: allow_checks_interruption set (a pipeline PR must not restart a running product batch)")
        if "-draft" not in conds:   # every queue refuses drafts (P-371 (1)); records alone before D1
            out.append(f"queue {q.get('name')}: queue_conditions lack '-draft'")
    # P-717 (a), whatever the order (P-827 lists pipeline first, so routing alone no longer shows it): product keeps its
    # own pipeline-path exclusion, the same pattern pipeline selects with, so no PR falls between the two queues.
    paths = {q.get("name"): [c.replace(" ", "") for c in q.get("queue_conditions", []) if isinstance(c, str)
                             and c.replace(" ", "").lstrip("-").startswith("files~=^(?!")] for q in qs}
    prod = [c[len("files~="):] for c in paths.get("product", []) if c.startswith("files~=")]
    pipe = [c[len("-files~="):] for c in paths.get("pipeline", []) if c.startswith("-files~=")]
    if not prod:
        out.append("queue product: queue_conditions lack the pipeline-path exclusion 'files ~= ^(?!(...))' (P-717 (a))")
    elif pipe and prod != pipe:
        out.append("queue product and pipeline: their pipeline-path patterns differ, so a PR can fall between them")
    for c in CASES:
        try:
            pr, note = labelled(c, have_script)
            got = queue_of(cfg, pr)
        except (ValueError, re.error) as e:
            out.append(f"{c['what']}: {e}"); continue
        if note: out.append(f"{c['what']}: {note}")
        elif got != c["want"]: out.append(f"{c['what']}: joins {got!r}, want {c['want']!r}")
    return out


def mutations(cfg):
    """Broken copies of the configuration, each of which the check must refuse."""
    def drop(qname, test):
        c = copy.deepcopy(cfg)
        for q in c["queue_rules"]:
            if q["name"] == qname:
                q["queue_conditions"] = [x for x in q["queue_conditions"] if not (isinstance(x, str) and test(x.replace(" ", "")))]
        return c
    def reorder(c):
        c = copy.deepcopy(c); c["queue_rules"] = c["queue_rules"][-1:] + c["queue_rules"][:-1]; return c
    def no_records(c):
        c = copy.deepcopy(c); c["queue_rules"] = [q for q in c["queue_rules"] if q["name"] != "records"]; return c
    def flip(c):   # records takes the unlabelled PRs and the product queues the labelled ones
        c = copy.deepcopy(c)
        for q in c["queue_rules"]:
            q["queue_conditions"] = [("-label=records" if x.replace(" ", "") == "label=records" else "label = records")
                                     if isinstance(x, str) and x.replace(" ", "") in ("label=records", "-label=records") else x
                                     for x in q["queue_conditions"]]
        return c
    def no_xfa(c):   # B170a: an engine change no longer needs the engine's own check
        c = copy.deepcopy(c)
        for q in c["queue_rules"]:
            q["queue_conditions"] = [x for x in q["queue_conditions"] if not (isinstance(x, dict) and "xfa-engine" in str(x))]
        return c
    def interrupt(c, name="verdicts"):
        c = copy.deepcopy(c)
        for q in c["queue_rules"]:
            if q["name"] == name: q["allow_checks_interruption"] = True
        return c
    def other_paths(c):   # product's pipeline exclusion drifts from pipeline's pattern
        c = copy.deepcopy(c)
        for q in c["queue_rules"]:
            if q["name"] == "product":
                q["queue_conditions"] = [x.replace("AGENTS", "AGENTZ") if isinstance(x, str) and x.replace(" ", "").startswith("files~=^(?!") else x
                                         for x in q["queue_conditions"]]
        return c
    def swap01(c):
        c = copy.deepcopy(c); c["queue_rules"][0], c["queue_rules"][1] = c["queue_rules"][1], c["queue_rules"][0]; return c
    def swap12(c):
        c = copy.deepcopy(c); c["queue_rules"][1], c["queue_rules"][2] = c["queue_rules"][2], c["queue_rules"][1]; return c
    def no_verdicts(c):
        c = copy.deepcopy(c); c["queue_rules"] = [q for q in c["queue_rules"] if q["name"] != "verdicts"]; return c
    return [
        ("product lets records in (-label=records removed)", drop("product", lambda x: x == "-label=records")),
        ("records lets unlabelled PRs in (label = records removed)", drop("records", lambda x: x == "label=records")),
        ("records skips green ci", drop("records", lambda x: x.startswith("check-success"))),
        ("records drops its records-only file guard (A438)", drop("records", lambda x: x.startswith("-files~=^(?!"))),
        ("records drops its tools file guard (A438)", drop("records", lambda x: "[Tt][Oo]" in x)),
        ("verdicts drops its records-only file guard (A438)", drop("verdicts", lambda x: x.startswith("-files~=^(?!"))),
        ("pipeline skips the review label (A438 keeps it)", drop("pipeline", lambda x: x.startswith("label=review"))),
        ("records accepts drafts", drop("records", lambda x: x == "-draft")),
        ("product accepts drafts", drop("product", lambda x: x == "-draft")),
        ("product drops base = main", drop("product", lambda x: x == "base=main")),
        ("product skips green ci", drop("product", lambda x: x.startswith("check-success"))),
        ("product skips the review label", drop("product", lambda x: x.startswith("label=review"))),
        ("records drops base = main", drop("records", lambda x: x == "base=main")),
        ("the label conditions are flipped", flip(cfg)),
        ("records listed first (higher priority than product)", reorder(cfg)),
        ("no records queue", no_records(cfg)),
        ("product drops the xfa-engine gate", no_xfa(cfg)),
        ("verdicts drops label = records (P-664)", drop("verdicts", lambda x: x == "label=records")),
        ("verdicts drops the qa: title condition (P-664)", drop("verdicts", lambda x: x.startswith("title"))),
        ("verdicts drops the CAPABILITIES.md condition (P-664)", drop("verdicts", lambda x: x.startswith("files"))),
        ("verdicts accepts drafts (P-664)", drop("verdicts", lambda x: x == "-draft")),
        ("verdicts interrupts running checks (P-664)", interrupt(cfg)),
        ("product takes pipeline-only PRs (P-717 (a))", drop("product", lambda x: x.startswith("files~="))),
        ("pipeline takes PRs with app code (P-717 (a))", drop("pipeline", lambda x: x.startswith("-files~=^(?!"))),
        ("pipeline skips green ci", drop("pipeline", lambda x: x.startswith("check-success"))),
        ("pipeline listed after product (P-827)", swap12(cfg)),
        ("product's pipeline-path pattern differs from pipeline's (P-717 (a))", other_paths(cfg)),
        ("pipeline interrupts running checks (P-827)", interrupt(cfg, "pipeline")),
        ("verdicts listed after pipeline (P-664)", swap01(cfg)),
        ("no verdicts queue (P-664)", no_verdicts(cfg)),
    ]


def main():
    global LABEL
    path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, ".mergify.yml")
    with open(path) as f:
        cfg = yaml.safe_load(f)
    have = True
    if not os.path.exists(IS_RECORDS):
        print(f"FAIL  {R}/tools/records-only.sh is missing: there is no definition of a record"); sys.exit(1)
    LABEL = subprocess.run(["bash", IS_RECORDS, "label"], capture_output=True, text=True, cwd=ROOT).stdout.strip()
    if LABEL != "records":
        print(f"FAIL  records-only.sh label prints {LABEL!r}; the queues select 'records'"); sys.exit(1)
    passed = failed = 0
    found = problems(cfg, have)
    for c in CASES:
        bad = [x for x in found if x.startswith(c["what"] + ":")]
        if bad: failed += 1; print(f"FAIL  {bad[0]}")
        else: passed += 1; print(f"PASS  {c['what']} → {c['want'] or 'no queue'}")
    rest = [x for x in found if not any(x.startswith(c["what"] + ":") for c in CASES)]
    for x in rest: failed += 1; print(f"FAIL  {x}")
    if not rest:
        passed += 1; print("PASS  order verdicts, pipeline, product, records (P-827); verdicts only qa verdict records; every queue keeps base main and green ci; product and pipeline the review label, records and verdicts every file a record (A438); the label guards; every queue refuses drafts")
    for what, broken in mutations(cfg):   # caught = the break adds a problem the real configuration does not have
        if set(problems(broken, have)) - set(found): passed += 1; print(f"PASS  caught: {what}")
        else: failed += 1; print(f"FAIL  not caught: {what}")
    print(f"{passed} passed, {failed} failed")
    sys.exit(0 if failed == 0 else 1)


if __name__ == "__main__":
    main()
