#!/usr/bin/env python3
"""Tests for tools/conformance-check.py (CK-1). Standard library unittest plus PyYAML (the tool's own need).
A small manifest written here, a fixture repository built from it that passes every item, then one break per item that
must fail it (mutation style: drop a deny line, change max_parallel_checks, rename a required job, bump a master's
version without the registry, ...). Also: a git ref is read like a folder, the exit code counts failures, checked_at is
IST, and the real manifest (when present) has every section the tool reads. No network, US$0.
Run: python3 -I product/tools/test_conformance_check.py   (check-conformance-check.sh runs it in check-guards.sh)"""
import copy, importlib.util, json, os, shutil, subprocess, sys, tempfile, unittest

try:
    import yaml
except ImportError:
    print("PyYAML is missing; nothing was checked"); sys.exit(2)

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("conformance_check", os.path.join(HERE, "conformance-check.py"))
cc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cc)
LIB = "lib/library.json"

MANIFEST = {
    "version": "9.9.9", "date": "2026-11-17", "owner": "the tech lead", "change_log": [],
    "settings": {"path": ".claude/settings.json",
                 "deny_required": ["Bash(git push --force*)", "Bash(gh run cancel *)", "Bash(*/rulesets*)"],
                 "hooks_required": [
                     {"event": "Stop", "matcher": None, "command": "bash tools/stop-check.sh"},
                     {"event": "PreToolUse", "matcher": "Bash", "if": "Bash(gh pr merge*)",
                      "command": "bash tools/merge-guard.sh"}]},
    "mergify": {"path": ".mergify.yml", "max_parallel_checks": 3, "queue_order": ["verdicts", "product", "records"],
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
    "ci": {"path": ".github/workflows/ci.yml", "workflow_name": "ci", "jobs_required": ["guard", "shard", "ci"],
           "gate_job": "ci", "gate_needs_required": ["shard"],
           "triggers_required": {"pull_request": ["opened", "synchronize", "ready_for_review"]},
           "triggers_forbidden": ["pull_request_target"], "write_scopes_allowed": {"retry-comment": ["pull-requests"]}},
    "ruleset": {"branch": "main", "required": False, "rules_required": ["deletion", "non_fast_forward",
                                                                       "required_status_checks"],
                "required_checks": ["ci"]},
    "library": {"path": LIB, "version_field": "version", "version_header": "Version"},
}


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
        "merge_protections_settings": {"auto_merge_conditions": True}}
    ci = {"name": "ci", "on": {"pull_request": {"types": ["opened", "synchronize", "reopened", "ready_for_review"]}},
          "jobs": {"guard": {"permissions": {"contents": "read"}},
                   "shard": {"permissions": {"contents": "read", "pull-requests": "read"}},
                   "ci": {"permissions": {"contents": "read"}, "needs": ["shard"]},
                   "retry-comment": {"permissions": {"contents": "read", "pull-requests": "write"}}}}
    library = {"docs": [
        {"name": "Change log", "path": "docs/change-log.md", "status": "living", "version": "1.2"},
        {"name": "Setup", "path": "docs/setup.json", "status": "living", "version": "2.0.0"},
        {"name": "Folder", "path": "docs/folder", "status": "history"},
        {"name": "Glob", "path": "docs/*contract*", "status": "living"},
        {"name": "Map", "path": "artifact:https://claude.ai/artifact/x", "status": "living"}]}
    return {
        ".claude/settings.json": json.dumps(settings),
        ".mergify.yml": yaml.safe_dump(mergify, sort_keys=False),
        ".github/workflows/ci.yml": dump(ci),
        LIB: json.dumps(library),
        "docs/change-log.md": "# Engineering change log\n\n**Version:** 1.2 · 17 Nov 2026\n\nrows\n",
        "docs/setup.json": json.dumps({"version": "2.0.0"}),
        "docs/folder/a.md": "a\n",
        "docs/one-contract.md": "c\n",
    }


def dump(d):
    """YAML as GitHub's files are written: a bare on: key (PyYAML reads it back as True, as in the real ci.yml)."""
    return yaml.safe_dump(d, sort_keys=False).replace("\n'on':", "\non:").replace("\ntrue:", "\non:")


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


ALL_RULES = [{"type": "deletion"}, {"type": "non_fast_forward"},
             {"type": "required_status_checks", "parameters": {"required_status_checks": [{"context": "ci"}]}}]


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

    @staticmethod
    def edit_yaml(path, fn):
        def ch(files):
            d = yaml.safe_load(files[path]); fn(d); files[path] = dump(d)
        return ch

    @staticmethod
    def edit_json(path, fn):
        def ch(files):
            d = json.loads(files[path]); fn(d); files[path] = json.dumps(d)
        return ch

    # -- the whole fixture passes ------------------------------------------------------------------------------------
    def test_fixture_passes_everything(self):
        self.assertIn("\non:", good_files()[".github/workflows/ci.yml"])  # the real files' form
        r = self.check()
        bad = [i for i in r["items"] if i["status"] == "fail"]
        self.assertEqual(bad, [])
        self.assertEqual(r["enforced"], "yes")
        self.assertEqual(status(r, "library.Map"), "unchecked")
        self.assertTrue(r["checked_at"].endswith("+05:30"), r["checked_at"])
        self.assertIn("IST", r["checked_at_ist"])

    # -- settings ----------------------------------------------------------------------------------------------------
    def test_one_deny_line_removed_fails(self):
        r = self.check(self.edit_json(".claude/settings.json",
                                      lambda d: d["permissions"]["deny"].remove("Bash(gh run cancel *)")))
        self.assertEqual(status(r, "settings.deny"), "fail")
        self.assertEqual([i for i in r["items"] if i["id"] == "settings.deny"][0]["detail"]["missing"],
                         ["Bash(gh run cancel *)"])
        self.assertEqual(r["enforced"], "no")

    def test_settings_missing_fails_every_settings_item(self):
        r = self.check(lambda f: f.pop(".claude/settings.json"))
        self.assertEqual({i["status"] for i in r["items"] if i["area"] == "settings"}, {"fail"})

    def test_hook_removed_or_changed_fails(self):
        r = self.check(self.edit_json(".claude/settings.json", lambda d: d["hooks"].pop("Stop")))
        self.assertEqual(status(r, "settings.hook Stop stop-check.sh"), "fail")
        r = self.check(self.edit_json(".claude/settings.json", lambda d: d["hooks"]["PreToolUse"][0]["hooks"][0]
                                      .update({"if": "Bash(gh pr view*)"})))
        self.assertEqual(status(r, "settings.hook PreToolUse merge-guard.sh Bash(gh pr merge*)"), "fail")
        r = self.check(self.edit_json(".claude/settings.json", lambda d: d["hooks"]["PreToolUse"][0]
                                      .update({"matcher": "Edit"})))
        self.assertEqual(status(r, "settings.hook PreToolUse merge-guard.sh Bash(gh pr merge*)"), "fail")

    # -- mergify -----------------------------------------------------------------------------------------------------
    def test_max_parallel_checks_changed_fails(self):
        r = self.check(self.edit_yaml(".mergify.yml", lambda d: d["merge_queue"].update({"max_parallel_checks": 5})))
        self.assertEqual(status(r, "mergify.max_parallel_checks"), "fail")

    def test_queue_order_changed_fails(self):
        r = self.check(self.edit_yaml(".mergify.yml", lambda d: d["queue_rules"].reverse()))
        self.assertEqual(status(r, "mergify.queue_order"), "fail")
        self.assertEqual(status(r, "mergify.queue.verdicts"), "pass")  # the queue itself is still as approved

    def test_verdicts_queue_removed_fails(self):
        r = self.check(self.edit_yaml(".mergify.yml", lambda d: d["queue_rules"].pop(0)))
        self.assertEqual(status(r, "mergify.queue.verdicts"), "fail")
        self.assertEqual(status(r, "mergify.queue_order"), "fail")

    def test_queue_condition_or_batch_changed_fails(self):
        r = self.check(self.edit_yaml(".mergify.yml", lambda d: d["queue_rules"][2]["queue_conditions"]
                                      .remove("check-success = ci")))
        self.assertEqual(status(r, "mergify.queue.records"), "fail")
        r = self.check(self.edit_yaml(".mergify.yml", lambda d: d["queue_rules"][1]["queue_conditions"].pop(3)))
        self.assertEqual(status(r, "mergify.queue.product"), "fail")  # the queue-fresh "or" block
        r = self.check(self.edit_yaml(".mergify.yml", lambda d: d["queue_rules"][1].update({"batch_size": 1})))
        self.assertEqual(status(r, "mergify.queue.product"), "fail")
        r = self.check(self.edit_yaml(".mergify.yml", lambda d: d["queue_rules"][0].update({"merge_conditions": []})))
        self.assertEqual(status(r, "mergify.queue.verdicts"), "fail")

    def test_condition_spacing_is_not_a_change(self):
        r = self.check(self.edit_yaml(".mergify.yml", lambda d: d["queue_rules"][0]["queue_conditions"]
                                      .__setitem__(0, "base=main")))
        self.assertEqual(status(r, "mergify.queue.verdicts"), "pass")

    def test_auto_merge_off_fails(self):
        r = self.check(self.edit_yaml(".mergify.yml", lambda d: d.pop("merge_protections_settings")))
        self.assertEqual(status(r, "mergify.auto_merge_conditions"), "fail")

    # -- ci ----------------------------------------------------------------------------------------------------------
    def test_required_job_renamed_fails(self):
        def ren(d):
            d["jobs"]["shards"] = d["jobs"].pop("shard")
        r = self.check(self.edit_yaml(".github/workflows/ci.yml", ren))
        self.assertEqual(status(r, "ci.jobs"), "fail")
        self.assertEqual(status(r, "ci.gate"), "fail")  # ci needs shard, which no longer exists
        r = self.check(self.edit_yaml(".github/workflows/ci.yml", lambda d: d["jobs"]["ci"].update({"needs": []})))
        self.assertEqual(status(r, "ci.gate"), "fail")
        self.assertEqual(status(r, "ci.jobs"), "pass")

    def test_triggers_changed_fails(self):
        def drop_type(d):
            d[True]["pull_request"]["types"].remove("ready_for_review")
        r = self.check(self.edit_yaml(".github/workflows/ci.yml", drop_type))
        self.assertEqual(status(r, "ci.triggers"), "fail")
        r = self.check(self.edit_yaml(".github/workflows/ci.yml", lambda d: d[True].update({"pull_request_target": {}})))
        self.assertEqual(status(r, "ci.triggers"), "fail")

    def test_write_permission_fails(self):
        r = self.check(self.edit_yaml(".github/workflows/ci.yml", lambda d: d["jobs"]["guard"]["permissions"]
                                      .update({"contents": "write"})))
        self.assertEqual(status(r, "ci.permissions"), "fail")
        r = self.check(self.edit_yaml(".github/workflows/ci.yml", lambda d: d["jobs"]["shard"].pop("permissions")))
        self.assertEqual(status(r, "ci.permissions"), "fail")  # no workflow-level block either: repository default
        r = self.check(self.edit_yaml(".github/workflows/ci.yml", lambda d: d.update({"permissions": "write-all"})))
        self.assertEqual(status(r, "ci.permissions"), "fail")
        r = self.check(self.edit_yaml(".github/workflows/ci.yml", lambda d: d["jobs"]["retry-comment"]["permissions"]
                                      .update({"contents": "write"})))
        self.assertEqual(status(r, "ci.permissions"), "fail")  # its allowance is pull-requests only

    # -- ruleset -----------------------------------------------------------------------------------------------------
    def test_ruleset_states(self):
        self.assertEqual(status(self.check(rules=None), "ruleset.main"), "unchecked")
        self.assertEqual(status(self.check(rules=[]), "ruleset.main"), "pending")
        self.assertEqual(self.check(rules=[])["enforced"], "yes")  # pending is not a failure before the move
        req = copy.deepcopy(MANIFEST); req["ruleset"]["required"] = True
        self.assertEqual(status(self.check(rules=[], manifest=req), "ruleset.main"), "fail")
        self.assertEqual(status(self.check(rules=ALL_RULES[1:]), "ruleset.main"), "fail")  # deletion allowed
        other = ALL_RULES[:2] + [{"type": "required_status_checks",
                                  "parameters": {"required_status_checks": [{"context": "guard"}]}}]
        self.assertEqual(status(self.check(rules=other), "ruleset.main"), "fail")  # ci not required
        self.assertEqual(status(self.check(rules="could not read"), "ruleset.main"), "fail")

    # -- library -----------------------------------------------------------------------------------------------------
    def test_master_version_bumped_without_registry_fails(self):
        r = self.check(lambda f: f.update({"docs/change-log.md": "# Log\n\nVersion: 1.3\n"}))
        self.assertEqual(status(r, "library.Change log"), "fail")
        r = self.check(lambda f: f.update({"docs/setup.json": json.dumps({"version": "2.1.0"})}))
        self.assertEqual(status(r, "library.Setup"), "fail")
        r = self.check(lambda f: f.update({"docs/change-log.md": "# Log\n\nno header\n"}))
        self.assertEqual(status(r, "library.Change log"), "fail")

    def test_version_header_forms(self):
        for line in ("Version: 1.2", "**Version:** v1.2", "| Version | 1.2 |", "> Version: 1.2.", "_Version_: 1.2"):
            self.assertEqual(cc.header_version(f"# T\n\n{line}\n"), "1.2", line)

    def test_master_missing_fails(self):
        r = self.check(lambda f: [f.pop("docs/folder/a.md"), f.pop("docs/one-contract.md")])
        self.assertEqual(status(r, "library.Folder"), "fail")
        self.assertEqual(status(r, "library.Glob"), "fail")

    # -- the command -------------------------------------------------------------------------------------------------
    def test_exit_code_counts_failures_and_reads_a_git_ref(self):
        files = good_files()
        d = json.loads(files[".claude/settings.json"]); d["permissions"]["deny"] = []
        files[".claude/settings.json"] = json.dumps(d)
        m = yaml.safe_load(files[".mergify.yml"]); m["merge_queue"]["max_parallel_checks"] = 1
        files[".mergify.yml"] = yaml.safe_dump(m)
        files[cc.MANIFEST] = json.dumps(MANIFEST)
        repo = make(files); self.dirs.append(repo)
        g = lambda *a: subprocess.run(["git", "-C", repo, *a], capture_output=True, text=True, check=True)
        g("init", "-q"); g("config", "user.email", "t@t"); g("config", "user.name", "t")
        g("config", "commit.gpgsign", "false"); g("add", "-A"); g("commit", "-qm", "fixture")
        shutil.rmtree(os.path.join(repo, "docs"))  # the working tree no longer has them: the ref must be read
        res = cc.run(cc.Source(ref="HEAD", repo=repo), MANIFEST, None)
        self.assertEqual(res["counts"]["fail"], 2, [i for i in res["items"] if i["status"] == "fail"])
        self.assertEqual(status(res, "library.Change log"), "pass")
        out = os.path.join(repo, "out.json")
        p = subprocess.run([sys.executable, "-I", os.path.join(HERE, "conformance-check.py"), "--root", repo,
                            "--json", out, "--quiet"], capture_output=True, text=True)
        self.assertEqual(p.returncode, 2 + 4, p.stdout + p.stderr)  # the folder lost docs/: four masters fail
        self.assertTrue(p.stdout.strip().splitlines()[-1].startswith("enforced: no"), p.stdout)
        self.assertTrue(all(l.startswith(("FAIL", "enforced:")) for l in p.stdout.strip().splitlines()))
        self.assertEqual(json.load(open(out))["enforced"], "no")

    def test_real_manifest_has_every_section(self):
        root = subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True,
                              cwd=HERE).stdout.strip()
        path = os.path.join(root, cc.MANIFEST)
        if not os.path.exists(path):
            self.skipTest("no manifest in this copy (check-guards' throwaway copy holds tools/ only)")
        m = json.load(open(path))
        for k in ("version", "date", "owner", "change_log", "settings", "mergify", "ci", "ruleset", "library"):
            self.assertIn(k, m)
        self.assertEqual(m["change_log"][-1]["version"], m["version"])  # every version has its change_log row
        self.assertEqual(len(set(m["settings"]["deny_required"])), len(m["settings"]["deny_required"]))
        res = cc.run(cc.Source(root=root), m, None)  # runs on the real files without a crash
        self.assertGreater(res["checked"], 20)


if __name__ == "__main__":
    r = unittest.main(exit=False, verbosity=1).result
    n = r.testsRun; f = len(r.failures) + len(r.errors)
    print(f"{n - f} passed, {f} failed")
    sys.exit(1 if f else 0)
