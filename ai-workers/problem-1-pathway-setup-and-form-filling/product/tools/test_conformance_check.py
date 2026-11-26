#!/usr/bin/env python3
"""Tests for tools/conformance-check.py (CK-1). Standard library unittest plus PyYAML (the tool's own need).
A small manifest written here, a fixture repository built from it that passes every item, then one break per item that
must fail it (mutation style: drop a deny line, switch hooks off, change max_parallel_checks, drop the verdicts queue,
add a merge rule round the queues, ...). Also: a git ref is read like a folder, the exit code counts failures (101 when
nothing was checked), checked_at is IST, and the real manifest (when present) has every section the tool reads.
No network, US$0.  Run: python3 -I product/tools/test_conformance_check.py   (check-conformance-check.sh runs it)"""
import copy, importlib.util, json, os, shutil, subprocess, sys, tempfile, unittest

try:
    import yaml
except ImportError:
    print("PyYAML is missing; nothing was checked"); sys.exit(2)

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("conformance_check", os.path.join(HERE, "conformance-check.py"))
cc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cc)
S, M, C, LIB = ".claude/settings.json", ".mergify.yml", ".github/workflows/ci.yml", "lib/library.json"

MANIFEST = {
    "version": "9.9.9", "date": "2026-11-17", "owner": "the tech lead", "change_log": [],
    "settings": {"path": S, "deny_required": ["Bash(git push --force*)", "Bash(gh run cancel *)", "Bash(*/rulesets*)"],
                 "hooks_required": [
                     {"event": "Stop", "matcher": None, "command": "bash tools/stop-check.sh"},
                     {"event": "PreToolUse", "matcher": "Bash", "if": "Bash(gh pr merge*)",
                      "command": "bash tools/merge-guard.sh"}]},
    "mergify": {"path": M, "max_parallel_checks": 3, "queue_order": ["verdicts", "product", "records"],
                "queues": {
                    "verdicts": {"batch_size": 6, "merge_method": "merge",
                                 "queue_conditions_required": ["base = main", "check-success = ci", "label = records",
                                                               "title ~= ^qa:"],
                                 "merge_conditions_required": ["check-success = ci"]},
                    "product": {"batch_size": 6, "merge_method": "merge",
                                "queue_conditions_required": ["base = main", "check-success = ci", "-label=records",
                                                              {"or": ["check-success = queue-fresh",
                                                                      "-files ~= /prototype/"]}],
                                "merge_conditions_required": ["check-success = ci"]},
                    "records": {"batch_size": 6, "merge_method": "merge",
                                "queue_conditions_required": ["check-success = ci", "label = records"],
                                "merge_conditions_required": ["check-success = ci"]}},
                "auto_merge_conditions": True},
    "ci": {"path": C, "workflow_name": "ci", "jobs_required": ["guard", "shard", "ci"], "gate_job": "ci",
           "gate_needs_required": ["shard"], "gate_if": "${{ !cancelled() }}", "trigger_types_exact": {"pull_request": ["opened", "synchronize",
                                                                                     "ready_for_review"]},
           "triggers_forbidden": ["pull_request_target"], "write_scopes_allowed": {"retry-comment": ["pull-requests"]}},
    "ruleset": {"branch": "main", "required": False, "required_checks": ["ci"], "required_from": "2999-01-01",
                "rules_required": ["deletion", "non_fast_forward", "required_status_checks"]},
    "library": {"path": LIB, "version_field": "version"},
}
ALL_RULES = [{"type": "deletion"}, {"type": "non_fast_forward"},
             {"type": "required_status_checks", "parameters": {"required_status_checks": [{"context": "ci"}]}}]


def dump(d):
    """YAML as GitHub's files are written: a bare on: key (PyYAML reads it back as True, as in the real ci.yml)."""
    return yaml.safe_dump(d, sort_keys=False).replace("\n'on':", "\non:").replace("\ntrue:", "\non:")


def good_files():
    settings = {"permissions": {"deny": MANIFEST["settings"]["deny_required"] + ["Bash(extra *)"]},
                "hooks": {"Stop": [{"hooks": [{"type": "command", "command": "bash tools/stop-check.sh"}]}],
                          "PreToolUse": [{"matcher": "Bash", "hooks": [
                              {"type": "command", "if": "Bash(gh pr merge*)", "command": "bash tools/merge-guard.sh"}]}]}}
    mergify = {"merge_queue": {"max_parallel_checks": 3}, "queue_rules": [
        {"name": "verdicts", "batch_size": 6, "merge_method": "merge",
         "queue_conditions": ["base = main", "check-success = ci", "label = records", "title ~= ^qa:", "-draft"],
         "merge_conditions": ["check-success = ci"]},
        {"name": "product", "batch_size": 6, "merge_method": "merge",
         "queue_conditions": ["base = main", "check-success = ci", "-label = records",
                              {"or": ["check-success = queue-fresh", "-files ~= /prototype/"]}],
         "merge_conditions": ["check-success = ci"]},
        {"name": "records", "batch_size": 6, "merge_method": "merge",
         "queue_conditions": ["check-success = ci", "label = records"], "merge_conditions": ["check-success = ci"]}],
        "pull_request_rules": [{"name": "label records", "conditions": ["base = main"],
                                "actions": {"label": {"add": ["records"]}}}],
        "merge_protections_settings": {"auto_merge_conditions": True}}
    ci = {"name": "ci", "on": {"pull_request": {"types": ["opened", "synchronize", "ready_for_review"]}},
          "jobs": {"guard": {"permissions": {"contents": "read"}},
                   "shard": {"permissions": {"contents": "read", "pull-requests": "read"}},
                   "ci": {"permissions": {"contents": "read"}, "needs": ["shard"], "if": "${{ !cancelled() }}"},
                   "retry-comment": {"permissions": {"contents": "read", "pull-requests": "write"}}}}
    library = {"docs": [
        {"name": "Change log", "path": "docs/change-log.md", "status": "living", "version": "1.2"},
        {"name": "Setup", "path": "docs/setup.json", "status": "living", "version": "2.0.0"},
        {"name": "Folder", "path": "docs/folder", "status": "history"},
        {"name": "Glob", "path": "docs/*contract*", "status": "living"},
        {"name": "Map", "path": "artifact:https://claude.ai/artifact/x", "status": "living"}]}
    return {S: json.dumps(settings), M: yaml.safe_dump(mergify, sort_keys=False), C: dump(ci), LIB: json.dumps(library),
            "docs/change-log.md": "# Engineering change log\n\n**Version:** 1.2 · 17 Nov 2026\n\nrows\n",
            "docs/setup.json": json.dumps({"version": "2.0.0"}), "docs/folder/a.md": "a\n", "docs/one-contract.md": "c\n"}


def make(files):
    d = tempfile.mkdtemp(prefix="conformance-fix-")
    for rel, text in files.items():
        p = os.path.join(d, rel)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "w", encoding="utf-8") as f:
            f.write(text)
    return d


def status(res, iid):
    hit = [i for i in res["items"] if i["id"] == iid]
    assert hit, f"no item {iid}: {[i['id'] for i in res['items']]}"
    return hit[0]["status"]


def jload(p):
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def edit(path, fn):
    def ch(files):
        if path == S:
            d = json.loads(files[S]); fn(d); files[S] = json.dumps(d)
        else:
            d = yaml.safe_load(files[path]); fn(d); files[path] = dump(d)
    return ch


HOOK_MERGE = "settings.hook PreToolUse merge-guard.sh Bash(gh pr merge*)"


class Conformance(unittest.TestCase):
    def setUp(self):
        self.dirs = []

    def tearDown(self):
        for d in self.dirs:
            shutil.rmtree(d, ignore_errors=True)

    def check(self, change=None, manifest=None, rules=ALL_RULES):
        files = good_files()
        if change:
            change(files)
        d = make(files); self.dirs.append(d)
        return cc.run(cc.Source(root=d), manifest or MANIFEST, rules)

    def test_fixture_passes_everything(self):
        r = self.check()
        self.assertEqual([i for i in r["items"] if i["status"] != "pass" and i["id"] != "library.Map"], [])
        self.assertEqual(status(r, "library.Map"), "unchecked")
        self.assertIn("\non:", good_files()[C])  # the real files' form
        self.assertEqual(r["enforced"], "yes")
        self.assertTrue(r["checked_at"].endswith("+05:30"), r["checked_at"])
        self.assertIn("IST", r["checked_at_ist"])

    # -- settings ----------------------------------------------------------------------------------------------------
    def test_one_deny_line_removed_fails(self):
        r = self.check(edit(S, lambda d: d["permissions"]["deny"].remove("Bash(gh run cancel *)")))
        self.assertEqual(status(r, "settings.deny"), "fail")
        self.assertEqual([i for i in r["items"] if i["id"] == "settings.deny"][0]["detail"]["missing"],
                         ["Bash(gh run cancel *)"])
        self.assertEqual(r["enforced"], "no")

    def test_settings_missing_fails_every_settings_item(self):
        r = self.check(lambda f: f.pop(S))
        self.assertEqual({i["status"] for i in r["items"] if i["area"] == "settings"}, {"fail"})

    def test_hooks_switched_off_fails(self):
        r = self.check(edit(S, lambda d: d.update({"disableAllHooks": True})))
        self.assertEqual(status(r, "settings.hooks_on"), "fail")
        r = self.check(edit(S, lambda d: d.update({"disableAllHooks": False})))
        self.assertEqual(status(r, "settings.hooks_on"), "pass")

    def test_hook_removed_or_changed_fails(self):
        r = self.check(edit(S, lambda d: d["hooks"].pop("Stop")))
        self.assertEqual(status(r, "settings.hook Stop stop-check.sh"), "fail")
        r = self.check(edit(S, lambda d: d["hooks"]["PreToolUse"][0]["hooks"][0].update({"if": "Bash(gh pr view*)"})))
        self.assertEqual(status(r, HOOK_MERGE), "fail")
        r = self.check(edit(S, lambda d: d["hooks"]["PreToolUse"][0].update({"matcher": "Edit"})))
        self.assertEqual(status(r, HOOK_MERGE), "fail")
        r = self.check(edit(S, lambda d: d["hooks"]["PreToolUse"][0]["hooks"][0].update({"type": "prompt"})))
        self.assertEqual(status(r, HOOK_MERGE), "fail")

    def test_an_added_if_stops_a_hook_and_fails(self):
        r = self.check(edit(S, lambda d: d["hooks"]["Stop"][0]["hooks"][0].update({"if": "Bash(never*)"})))
        self.assertEqual(status(r, "settings.hook Stop stop-check.sh"), "fail")

    # -- mergify -----------------------------------------------------------------------------------------------------
    def test_max_parallel_checks_changed_fails(self):
        r = self.check(edit(M, lambda d: d["merge_queue"].update({"max_parallel_checks": 5})))
        self.assertEqual(status(r, "mergify.max_parallel_checks"), "fail")

    def test_queue_order_changed_fails(self):
        r = self.check(edit(M, lambda d: d["queue_rules"].reverse()))
        self.assertEqual(status(r, "mergify.queue_order"), "fail")
        self.assertEqual(status(r, "mergify.queue.verdicts"), "pass")  # the queue itself is still as approved

    def test_verdicts_queue_removed_fails(self):
        r = self.check(edit(M, lambda d: d["queue_rules"].pop(0)))
        self.assertEqual(status(r, "mergify.queue.verdicts"), "fail")
        self.assertEqual(status(r, "mergify.queue_order"), "fail")

    def test_queue_condition_or_batch_changed_fails(self):
        r = self.check(edit(M, lambda d: d["queue_rules"][2]["queue_conditions"].remove("check-success = ci")))
        self.assertEqual(status(r, "mergify.queue.records"), "fail")
        r = self.check(edit(M, lambda d: d["queue_rules"][1]["queue_conditions"].pop(3)))
        self.assertEqual(status(r, "mergify.queue.product"), "fail")  # the queue-fresh "or" block
        r = self.check(edit(M, lambda d: d["queue_rules"][1]["queue_conditions"][3]["or"].pop(0)))
        self.assertEqual(status(r, "mergify.queue.product"), "fail")  # one member of the "or" gone
        r = self.check(edit(M, lambda d: d["queue_rules"][1].update({"batch_size": 1})))
        self.assertEqual(status(r, "mergify.queue.product"), "fail")
        r = self.check(edit(M, lambda d: d["queue_rules"][0].update({"merge_conditions": []})))
        self.assertEqual(status(r, "mergify.queue.verdicts"), "fail")

    def test_spacing_and_or_order_are_not_changes(self):
        r = self.check(edit(M, lambda d: d["queue_rules"][0]["queue_conditions"].__setitem__(0, "base=main")))
        self.assertEqual(status(r, "mergify.queue.verdicts"), "pass")
        r = self.check(edit(M, lambda d: d["queue_rules"][1]["queue_conditions"][3]["or"].reverse()))
        self.assertEqual(status(r, "mergify.queue.product"), "pass")

    def test_parallel_mode_barriers_and_capacities_are_pinned(self):   # P-715, manifest 1.4.0
        m = copy.deepcopy(MANIFEST); g = m["mergify"]
        g.update({"mode": "parallel", "capacities_required": {"migrations": 1, "money": 1},
                  "barrier_files_required": ["**/package-lock.json", "api/core.ts"]})
        g["queues"]["product"]["batch_max_failure_resolution_attempts"] = 2
        def par(d):
            d["merge_queue"]["mode"] = "parallel"
            d["scopes"] = {"capacities": {"migrations": 1, "money": 1, "pipeline": 1},
                           "barrier_files": {"include": ["**/package-lock.json", "api/core.ts", ".nvmrc"]}}
            [q for q in d["queue_rules"] if q["name"] == "product"][0]["batch_max_failure_resolution_attempts"] = 2
        r = self.check(edit(M, par), m)
        for i in ("mergify.mode", "mergify.capacities", "mergify.barrier_files", "mergify.queue.product"):
            self.assertEqual(status(r, i), "pass", i)   # extra scopes and barriers are allowed
        for fn, iid in ((lambda d: d["merge_queue"].update({"mode": "serial"}), "mergify.mode"),
                        (lambda d: d["merge_queue"].pop("mode"), "mergify.mode"),
                        (lambda d: d["scopes"]["capacities"].pop("migrations"), "mergify.capacities"),
                        (lambda d: d["scopes"]["capacities"].update({"money": 3}), "mergify.capacities"),
                        (lambda d: d["scopes"]["barrier_files"]["include"].remove("api/core.ts"), "mergify.barrier_files"),
                        (lambda d: d.pop("scopes"), "mergify.barrier_files"),
                        (lambda d: [q for q in d["queue_rules"] if q["name"] == "product"][0].pop(
                            "batch_max_failure_resolution_attempts"), "mergify.queue.product")):
            r = self.check(lambda f, fn=fn: (edit(M, par)(f), edit(M, fn)(f)), m)
            self.assertEqual(status(r, iid), "fail", iid)
        self.assertNotIn("mergify.mode", [x["id"] for x in self.check()["items"]])   # a manifest without them: unchecked

    def test_a_family_of_scopes_is_pinned(self):   # SPD-2 fault 2 (Lead 4 on #3035): "mig-*": 1, every per-area slot at 1
        m = copy.deepcopy(MANIFEST); g = m["mergify"]
        g.update({"mode": "parallel", "capacities_required": {"mig-*": 1, "money": 1}})
        def par(d):
            d["merge_queue"]["mode"] = "parallel"
            d["scopes"] = {"source": {"files": {"money": {"include": ["m/**"]}, "mig-cases": {"include": ["c/**"]},
                                                  "mig-platform": {"include": ["p/**"]}}},
                           "capacities": {"money": 1, "mig-cases": 1, "mig-platform": 1}}
        r = self.check(edit(M, par), m)
        self.assertEqual(status(r, "mergify.capacities"), "pass")
        for why, fn in (("a slot at 2", lambda d: d["scopes"]["capacities"].update({"mig-cases": 2})),
                        ("a slot with no capacity", lambda d: d["scopes"]["capacities"].pop("mig-platform")),
                        ("no per-area slot at all", lambda d: [d["scopes"][k].pop(x) for k in ("capacities",) for x in ("mig-cases", "mig-platform")]
                                                              + [d["scopes"]["source"]["files"].pop(x) for x in ("mig-cases", "mig-platform")]),
                        ("the old one slot instead", lambda d: (d["scopes"]["capacities"].pop("mig-cases"), d["scopes"]["capacities"].pop("mig-platform"),
                                                               d["scopes"]["source"]["files"].pop("mig-cases"), d["scopes"]["source"]["files"].pop("mig-platform"),
                                                               d["scopes"]["capacities"].update({"migrations": 1})))):
            r = self.check(lambda f, fn=fn: (edit(M, par)(f), edit(M, fn)(f)), m)
            self.assertEqual(status(r, "mergify.capacities"), "fail", why)

    def test_auto_merge_off_fails(self):
        r = self.check(edit(M, lambda d: d.pop("merge_protections_settings")))
        self.assertEqual(status(r, "mergify.auto_merge_conditions"), "fail")

    def test_a_merge_rule_round_the_queues_fails(self):
        side = {"name": "fast lane", "conditions": ["base = main"], "actions": {"merge": {"method": "merge"}}}
        r = self.check(edit(M, lambda d: d["pull_request_rules"].append(side)))
        self.assertEqual(status(r, "mergify.no_side_door"), "fail")
        side = {"name": "queue all", "conditions": [], "actions": {"queue": {"name": "product"}}}
        r = self.check(edit(M, lambda d: d["pull_request_rules"].append(side)))
        self.assertEqual(status(r, "mergify.no_side_door"), "fail")
        r = self.check(edit(M, lambda d: d.update({"extends": "other-repo"})))
        self.assertEqual(status(r, "mergify.no_side_door"), "fail")

    # -- ci ----------------------------------------------------------------------------------------------------------
    def test_required_job_renamed_fails(self):
        r = self.check(edit(C, lambda d: d["jobs"].update({"shards": d["jobs"].pop("shard")})))
        self.assertEqual(status(r, "ci.jobs"), "fail")
        self.assertEqual(status(r, "ci.gate"), "fail")  # ci needs shard, which no longer exists
        r = self.check(edit(C, lambda d: d["jobs"]["ci"].update({"needs": []})))
        self.assertEqual((status(r, "ci.gate"), status(r, "ci.jobs")), ("fail", "pass"))
        r = self.check(edit(C, lambda d: d.update({"name": "checks"})))
        self.assertEqual(status(r, "ci.jobs"), "fail")

    def test_the_gate_check_cannot_move_or_be_weakened(self):
        for fn in (lambda d: d["jobs"]["ci"].update({"name": "gate"}),               # check "ci" gone from the gate
                   lambda d: d["jobs"]["guard"].update({"name": "ci"}),              # another job answers as "ci"
                   lambda d: d["jobs"]["ci"].update({"if": "false"}),                # a skipped gate counts as passed
                   lambda d: d["jobs"]["shard"].update({"continue-on-error": True}),
                   lambda d: d["jobs"]["ci"].update({"continue-on-error": True})):
            self.assertEqual(status(self.check(edit(C, fn)), "ci.gate"), "fail")
        self.assertEqual(status(self.check(edit(C, lambda d: d["jobs"]["ci"].update({"name": "ci"}))), "ci.gate"),
                         "pass")

    def test_triggers_changed_fails(self):
        for fn in (lambda d: d[True]["pull_request"]["types"].remove("ready_for_review"),
                   lambda d: d[True]["pull_request"]["types"].append("labeled"),   # a label would start a second run
                   lambda d: d[True]["pull_request"].pop("types"),                 # GitHub's default set
                   lambda d: d[True].update({"pull_request_target": {}}),
                   lambda d: d[True].update({"push": None}),                                   # a second ci run
                   lambda d: d[True]["pull_request"].update({"branches-ignore": ["main"]}),
                   lambda d: d[True].update({"workflow_dispatch": None})):                     # not approved here
            self.assertEqual(status(self.check(edit(C, fn)), "ci.triggers"), "fail")

    def test_an_approved_extra_trigger_needs_its_inputs_exactly(self):   # OS-83: ci.yml's full run (P-731)
        m = json.loads(json.dumps(MANIFEST)); m["ci"]["triggers_allowed"] = {"workflow_dispatch": {"inputs_exact": ["head", "pr"]}}
        ok = lambda d: d[True].update({"workflow_dispatch": {"inputs": {"pr": {}, "head": {}}}})
        self.assertEqual(status(self.check(edit(C, ok), m), "ci.triggers"), "pass")
        for fn in (lambda d: d[True].update({"workflow_dispatch": None}),                          # no inputs
                   lambda d: d[True].update({"workflow_dispatch": {"inputs": {"pr": {}}}}),
                   lambda d: d[True].update({"workflow_dispatch": {"inputs": {"pr": {}, "head": {}, "ref": {}}}}),
                   lambda d: (ok(d), d[True].update({"push": None}))):                             # still no other
            self.assertEqual(status(self.check(edit(C, fn), m), "ci.triggers"), "fail")

    def test_write_permission_fails(self):
        for fn in (lambda d: d["jobs"]["guard"]["permissions"].update({"contents": "write"}),
                   lambda d: d["jobs"]["shard"].pop("permissions"),       # no workflow-level block: repository default
                   lambda d: d.update({"permissions": "write-all"}),
                   lambda d: d["jobs"]["retry-comment"]["permissions"].update({"contents": "write"})):
            self.assertEqual(status(self.check(edit(C, fn)), "ci.permissions"), "fail")

    # -- heartbeat workflow ------------------------------------------------------------------------------------------
    def test_heartbeat_workflow(self):
        hb = json.loads(json.dumps(MANIFEST)); hb["heartbeat"] = {"workflow": "hb.yml", "every_min": 30, "timeout_min": 5}
        W = ".github/workflows/hb.yml"
        good = {"name": "hb", "on": {"schedule": [{"cron": "11,41 * * * *"}]}, "permissions": {"contents": "read"},
                "concurrency": {"group": "hb", "cancel-in-progress": False},
                "jobs": {"beat": {"runs-on": "ubuntu-latest", "timeout-minutes": 5}}}
        def with_wf(fn=None):
            def ch(files):
                d = json.loads(json.dumps(good))
                if fn:
                    fn(d)
                files[W] = dump(d)
            return ch
        self.assertEqual(status(self.check(with_wf(), hb), "heartbeat.workflow"), "pass")
        self.assertEqual([i["id"] for i in self.check()["items"] if i["area"] == "heartbeat"], [])  # not decided yet
        for fn in (lambda d: d["on"].update({"schedule": [{"cron": "11 * * * *"}]}),       # hourly
                   lambda d: d.update({"permissions": {"contents": "write"}}),
                   lambda d: d.update({"concurrency": {"group": "hb", "cancel-in-progress": True}}),
                   lambda d: d["jobs"]["beat"].update({"timeout-minutes": 30}),
                   lambda d: d["jobs"]["beat"].update({"timeout-minutes": True}),
                   lambda d: d["on"].update({"schedule": [{"cron": "*/0 * * * *"}]}),       # not a crash
                   lambda d: d["jobs"]["beat"].update({"env": {"OUT": "${{ runner.temp }}/x"}}),   # an invalid file
                   lambda d: d["jobs"].update({"second": {"timeout-minutes": 1}})):
            self.assertEqual(status(self.check(with_wf(fn), hb), "heartbeat.workflow"), "fail")
        self.assertEqual(status(self.check(lambda f: None, hb), "heartbeat.workflow"), "fail")  # file missing
        good["on"]["schedule"] = [{"cron": "*/30 * * * *"}]
        self.assertEqual(status(self.check(with_wf(), hb), "heartbeat.workflow"), "pass")
        # OS-83: events start it too, when the manifest names them
        hb["heartbeat"]["events_required"] = ["push", "workflow_run", "issue_comment"]
        self.assertEqual(status(self.check(with_wf(), hb), "heartbeat.workflow"), "fail")   # schedule only
        good["on"].update({"push": {"branches": ["main"]}, "workflow_run": {"workflows": ["ci"]}, "issue_comment": {"types": ["created"]}})
        self.assertEqual(status(self.check(with_wf(), hb), "heartbeat.workflow"), "pass")
        self.assertEqual(status(self.check(with_wf(lambda d: d["on"].pop("issue_comment")), hb), "heartbeat.workflow"), "fail")

    # -- ruleset -----------------------------------------------------------------------------------------------------
    def test_ruleset_states(self):
        self.assertEqual(status(self.check(rules=None), "ruleset.main"), "unchecked")
        self.assertEqual(status(self.check(rules=[]), "ruleset.main"), "pending")
        self.assertEqual(self.check(rules=[])["enforced"], "yes")  # pending is not a failure before the move
        req = json.loads(json.dumps(MANIFEST)); req["ruleset"]["required"] = True
        self.assertEqual(status(self.check(rules=[], manifest=req), "ruleset.main"), "fail")
        self.assertEqual(status(self.check(rules=ALL_RULES[1:]), "ruleset.main"), "fail")  # deletion allowed
        other = ALL_RULES[:2] + [{"type": "required_status_checks",
                                  "parameters": {"required_status_checks": [{"context": "guard"}]}}]
        self.assertEqual(status(self.check(rules=other), "ruleset.main"), "fail")  # ci not required
        self.assertEqual(status(self.check(rules="could not read"), "ruleset.main"), "fail")
        self.assertEqual(status(self.check(rules={"message": "Not Found"}), "ruleset.main"), "fail")
        late = json.loads(json.dumps(MANIFEST)); late["ruleset"]["required_from"] = "2026-11-01"
        self.assertEqual(status(self.check(rules=[], manifest=late), "ruleset.main"), "fail")  # pending has an end

    def test_read_rules_reads_one_get_and_fails_closed(self):
        import io, urllib.error
        seen = []
        class Resp(io.StringIO):
            def __enter__(self): return self
            def __exit__(self, *a): return False
        def ok(req, timeout):
            seen.append((req.get_method(), req.full_url)); return Resp(json.dumps(ALL_RULES))
        def bad(req, timeout):
            raise urllib.error.HTTPError(req.full_url, 404, "Not Found", {}, io.BytesIO(b""))
        env = {"GITHUB_REPOSITORY": "o/r", "GITHUB_TOKEN": "t", "GITHUB_API_URL": "https://api.example"}
        old = {k: os.environ.get(k) for k in env}
        os.environ.update(env)
        try:
            self.assertEqual(cc.read_rules(MANIFEST, ok), ALL_RULES)
            self.assertEqual(seen, [("GET", "https://api.example/repos/o/r/rules/branches/main?per_page=100")])
            self.assertIsInstance(cc.read_rules(MANIFEST, bad), str)
            os.environ.pop("GITHUB_TOKEN")
            self.assertIsInstance(cc.read_rules(MANIFEST, ok), str)
        finally:
            for k, v in old.items():
                os.environ.pop(k, None) if v is None else os.environ.__setitem__(k, v)

    # -- library -----------------------------------------------------------------------------------------------------
    def test_master_version_bumped_without_registry_fails(self):
        for rel, text, iid in (("docs/change-log.md", "# Log\n\nVersion: 1.3\n", "library.Change log"),
                               ("docs/setup.json", json.dumps({"version": "2.1.0"}), "library.Setup"),
                               ("docs/change-log.md", "# Log\n\nno header\n", "library.Change log")):
            self.assertEqual(status(self.check(lambda f: f.update({rel: text})), iid), "fail")

    def test_version_header_forms_and_unregistered_wording(self):
        for line in ("Version: 1.2", "**Version:** v1.2", "| Version | 1.2 |", "> Version: 1.2.", "_Version_: 1.2",
                     "version: 1.2", "VERSION: 1.2"):
            self.assertEqual(cc.header_version(f"# T\n\n{line}\n"), "1.2", line)
        found = [i for i in self.check()["items"] if i["id"] == "library.Folder"][0]["found"]
        self.assertIn("no version registered", found)

    def test_master_missing_or_outside_or_bad_version_fails(self):
        r = self.check(lambda f: [f.pop("docs/folder/a.md"), f.pop("docs/one-contract.md")])
        self.assertEqual((status(r, "library.Folder"), status(r, "library.Glob")), ("fail", "fail"))
        for path in ("", "/etc/hosts", "../outside.md", "docs/../../x"):
            lib = lambda f, p=path: f.update({LIB: json.dumps({"docs": [{"name": "Bad", "path": p, "status": "living"}]})})
            self.assertEqual(status(self.check(lib), "library.Bad"), "fail", path)
        num = lambda f: f.update({LIB: json.dumps({"docs": [{"name": "Num", "path": "docs/setup.json", "version": 2.0}]})})
        self.assertEqual(status(self.check(num), "library.Num"), "fail")   # a JSON number: 1.10 would read as 1.1

    # -- the command -------------------------------------------------------------------------------------------------
    def test_exit_code_counts_failures_and_reads_a_git_ref(self):
        files = good_files()
        d = json.loads(files[S]); d["permissions"]["deny"] = []; files[S] = json.dumps(d)
        m = yaml.safe_load(files[M]); m["merge_queue"]["max_parallel_checks"] = 1; files[M] = yaml.safe_dump(m)
        files[cc.MANIFEST] = json.dumps(MANIFEST)
        repo = make(files); self.dirs.append(repo)
        g = lambda *a: subprocess.run(["git", "-C", repo, *a], capture_output=True, text=True, check=True)
        g("init", "-q"); g("config", "user.email", "t@t"); g("config", "user.name", "t")
        g("config", "commit.gpgsign", "false"); g("add", "-A"); g("commit", "-qm", "fixture")
        os.remove(os.path.join(repo, M))  # the working tree no longer has it: the ref must be read
        res = cc.run(cc.Source(ref="HEAD", repo=repo), MANIFEST)
        self.assertEqual(res["counts"]["fail"], 2, [i for i in res["items"] if i["status"] == "fail"])
        self.assertEqual(status(res, "library.Glob"), "pass")  # globs read from the ref
        tool = [sys.executable, "-I", os.path.join(HERE, "conformance-check.py")]
        out = os.path.join(repo, "out.json")
        p = subprocess.run(tool + ["--root", repo, "--json", out, "--quiet"], capture_output=True, text=True)
        self.assertEqual(p.returncode, 2, p.stdout + p.stderr)  # the folder lost .mergify.yml: one item, mergify.file
        self.assertTrue(p.stdout.strip().splitlines()[-1].startswith("enforced: no"), p.stdout)
        self.assertTrue(all(l.startswith(("FAIL", "enforced:")) for l in p.stdout.strip().splitlines()))
        self.assertEqual(jload(out)["enforced"], "no")
        self.assertIn("FAIL mergify.file", p.stdout)
        p = subprocess.run(tool + ["--root", os.path.join(repo, "nowhere")], capture_output=True, text=True)
        self.assertEqual(p.returncode, 101, p.stderr)  # no manifest: nothing was checked, never "0 failures"
        self.assertIn("nothing was checked", p.stderr)

    def test_real_manifest_has_every_section(self):
        root = subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True,
                              cwd=HERE).stdout.strip()
        path = os.path.join(root, cc.MANIFEST)
        if not root or not os.path.exists(path):
            self.skipTest("no manifest in this copy (check-guards' throwaway copy holds tools/ only)")
        m = jload(path)
        for k in ("version", "date", "owner", "change_log", "settings", "mergify", "ci", "ruleset", "library"):
            self.assertIn(k, m)
        self.assertEqual(m["change_log"][-1]["version"], m["version"])  # every version has its change_log row
        self.assertEqual(len(set(m["settings"]["deny_required"])), len(m["settings"]["deny_required"]))
        res = cc.run(cc.Source(root=root), m)
        self.assertGreater(res["checked"], 10)  # runs on the real files
        # OS-83: a healthy main passes its own triggers and heartbeat shape (the heartbeat was red 23 runs on ci.triggers)
        for i in ("ci.triggers", "heartbeat.workflow"):
            self.assertEqual(status(res, i), "pass", [x for x in res["items"] if x["id"] == i])


if __name__ == "__main__":
    r = unittest.main(exit=False, verbosity=1).result
    n = r.testsRun; f = len(r.failures) + len(r.errors)
    print(f"{n - f} passed, {f} failed")
    sys.exit(1 if f else 0)
