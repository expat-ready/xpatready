#!/usr/bin/env python3
"""Tests for tools/conformance-check.py (CK-1). Standard library unittest plus PyYAML (the tool's own need).
A small manifest written here, a fixture repository built from it that passes every item, then one break per item that
must fail it (mutation style: drop a deny line, switch hooks off, change max_parallel_checks, drop the verdicts queue,
add a merge rule round the queues, ...). Also: a git ref is read like a folder, the exit code counts failures (101 when
nothing was checked), checked_at is IST, and the real manifest (when present) has every section the tool reads.
No network, US$0.  Run: python3 -I product/tools/test_conformance_check.py   (check-conformance-check.sh runs it)"""
import importlib.util, json, os, shutil, subprocess, sys, tempfile, unittest

try:
    import yaml
except ImportError:
    print("PyYAML is missing; nothing was checked"); sys.exit(2)

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("conformance_check", os.path.join(HERE, "conformance-check.py"))
cc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cc)
S, M = ".claude/settings.json", ".mergify.yml"

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
        "pull_request_rules": [{"name": "label records", "conditions": ["base = main"],
                                "actions": {"label": {"add": ["records"]}}}],
        "merge_protections_settings": {"auto_merge_conditions": True}}
    return {S: json.dumps(settings), M: yaml.safe_dump(mergify, sort_keys=False)}


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
            d = yaml.safe_load(files[path]); fn(d); files[path] = yaml.safe_dump(d, sort_keys=False)
    return ch


HOOK_MERGE = "settings.hook PreToolUse merge-guard.sh Bash(gh pr merge*)"


class Conformance(unittest.TestCase):
    def setUp(self):
        self.dirs = []

    def tearDown(self):
        for d in self.dirs:
            shutil.rmtree(d, ignore_errors=True)

    def check(self, change=None, manifest=None):
        files = good_files()
        if change:
            change(files)
        d = make(files); self.dirs.append(d)
        return cc.run(cc.Source(root=d), manifest or MANIFEST)

    def test_fixture_passes_everything(self):
        r = self.check()
        self.assertEqual([i for i in r["items"] if i["status"] != "pass"], [])
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
        for k in ("version", "date", "owner", "change_log", "settings", "mergify"):
            self.assertIn(k, m)
        self.assertEqual(m["change_log"][-1]["version"], m["version"])  # every version has its change_log row
        self.assertEqual(len(set(m["settings"]["deny_required"])), len(m["settings"]["deny_required"]))
        self.assertGreater(cc.run(cc.Source(root=root), m)["checked"], 10)  # runs on the real files


if __name__ == "__main__":
    r = unittest.main(exit=False, verbosity=1).result
    n = r.testsRun; f = len(r.failures) + len(r.errors)
    print(f"{n - f} passed, {f} failed")
    sys.exit(1 if f else 0)
