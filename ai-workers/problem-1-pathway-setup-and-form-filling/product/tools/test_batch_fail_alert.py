#!/usr/bin/env python3
"""Tests for tools/batch-fail-alert.py (P-729 (2)): a fixture failed batch (title, jobs, job logs, member files) gives the
expected comment and likely-PR call, posts once per member and never twice for one run. No network; one case runs the
real select-suites.mjs on this checkout (node, a few seconds).
Run: python3 -I product/tools/test_batch_fail_alert.py"""
import importlib.util, os, subprocess, unittest

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("bfa", os.path.join(HERE, "batch-fail-alert.py"))
bfa = importlib.util.module_from_spec(spec); spec.loader.exec_module(bfa)
S = "ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio"

# A shard log as GitHub serves it: a timestamp on every line, run-suites.sh's group as ##[group].
SHARD_LOG = """2026-11-19T10:01:00.0000000Z | check_fo7a_money_schema.ts | FAIL | 33 s | exit 1 |
2026-11-19T10:01:00.1000000Z | check_engine.ts | PASS | 4 s | ok |
2026-11-19T10:01:01.0000000Z ##[group]check_fo7a_money_schema.ts failed (exit 1): its FAIL lines and the last 40 lines of var/suites/check_fo7a_money_schema.log
2026-11-19T10:01:01.1000000Z FAIL  trust balance never negative: got -5 ```
2026-11-19T10:01:01.2000000Z FAIL  receipt keeps its amount
2026-11-19T10:01:01.3000000Z --- last 40 lines
2026-11-19T10:01:01.4000000Z FAIL  a line from the tail is not repeated
2026-11-19T10:01:01.5000000Z ##[endgroup]
2026-11-19T10:01:02.0000000Z retries: 1 · failed twice: check_fo7a_money_schema.ts (one retry per failed suite)
"""
TYPES_LOG = "2026-11-19T10:00:00.0Z ##[error]web/src/x.tsx(3,1): error TS2304\n2026-11-19T10:00:00.1Z ok\n"

class FakeApi:
    def __init__(self, data): self.r, self.d, self.posts = "expat-ready/xpatready", data, []
    def get(self, path):
        keys = [k for k in self.d if path.startswith(k)]   # the longest key: runs/77/jobs before runs/77
        return self.d[max(keys, key=len)] if keys else []
    def text(self, path): return self.d[path]
    def post(self, path, body):
        self.posts.append((path, body["body"]))
        n = path.split("/")[1]; self.d.setdefault(f"issues/{n}/comments", []).append({"body": body["body"]})

def fixture(members_files, title="checking #2196 + #2197 together on main (abc1234)", types=False):
    d = {"actions/runs/77": {"id": 77, "conclusion": "failure", "head_branch": "mergify/merge-queue/abc", "created_at": "2026-11-19T09:00:00Z",
                             "html_url": "https://github.com/x/runs/77", "pull_requests": [{"number": 2200}]},
         "pulls/2200": {"number": 2200, "user": {"login": "mergify[bot]"}, "title": f"merge queue: {title}", "body": ""},
         "actions/runs/77/jobs": {"jobs": [{"id": 1, "name": "shard (3)", "conclusion": "failure"},
                                           {"id": 2, "name": "types", "conclusion": "failure" if types else "success"},
                                           {"id": 3, "name": "ci", "conclusion": "failure"}]},
         "actions/jobs/1/logs": SHARD_LOG, "actions/jobs/2/logs": TYPES_LOG}
    for n, fs in members_files.items(): d[f"pulls/{n}/files?per_page=100&page=1"] = [{"filename": f} for f in fs]
    return d

def stub(reach):   # files → {suite: reason}, as select-suites.mjs --direct prints
    return lambda files, root=None: {s: w for f in files for s, w in reach.get(f, {}).items()}

class Alert(unittest.TestCase):
    REACH = {"api/src/money.ts": {"check_fo7a_money_schema.ts": "imports money.ts (direct)", "check_engine.ts": "smoke"},
             "web/src/page.tsx": {"check_fo7a_money_schema.ts": "every browser suite: web/src/page.tsx", "check_engine.ts": "smoke"}}

    def test_comment_text_and_likely_pr(self):
        api = FakeApi(fixture({2196: ["web/src/page.tsx"], 2197: ["api/src/money.ts"]}))
        posted, body = bfa.run_alert(api, 77, cover=stub(self.REACH))
        self.assertEqual(posted, [2196, 2197])
        self.assertEqual([p for p, _ in api.posts], ["issues/2196/comments", "issues/2197/comments"])
        want = "\n".join([
            "<!-- batch-fail-alert run=77 -->",
            "**Merge-queue batch failed (P-729):** batch #2200 ([ci run](https://github.com/x/runs/77)) holds #2196, #2197.",
            "",
            "**Most likely:** #2197 (`check_fo7a_money_schema.ts`: it changed the suite or a file the suite imports or names).",
            "",
            "- **`shard (3)`** failed: `check_fo7a_money_schema.ts` (exit 1)",
            "",
            "  `check_fo7a_money_schema.ts`:",
            "  ```",
            "  FAIL  trust balance never negative: got -5 '''",
            "  FAIL  receipt keeps its amount",
            "  ```",
        ])
        self.assertTrue(body.startswith(want), body)
        self.assertNotIn("from the tail", body)        # only the group's FAIL lines, not the tail's
        self.assertNotIn("`ci`**", body)               # the summary job is not a failing suite

    def test_no_repeats_for_one_run(self):
        api = FakeApi(fixture({2196: ["a"], 2197: ["b"]}))
        bfa.run_alert(api, 77, cover=stub({}))
        posted, _ = bfa.run_alert(api, 77, cover=stub({}))
        self.assertEqual(posted, []); self.assertEqual(len(api.posts), 2)

    def test_unclear_when_both_reach_alike_or_none(self):
        both = {"x.ts": {"check_fo7a_money_schema.ts": "uses x.ts"}, "y.ts": {"check_fo7a_money_schema.ts": "uses y.ts"}}
        _, body = bfa.run_alert(FakeApi(fixture({2196: ["x.ts"], 2197: ["y.ts"]})), 77, cover=stub(both))
        self.assertIn("**Most likely, by failing suite:**\n- `check_fo7a_money_schema.ts`: unclear (#2196 and #2197 each: it changed a file the suite uses)", body)
        _, body = bfa.run_alert(FakeApi(fixture({2196: ["x.ts"], 2197: ["y.ts"]})), 77, cover=stub({}))
        self.assertIn("- `check_fo7a_money_schema.ts`: unclear (no member's changed files reach it)", body)
        blanket = {"x.ts": {"check_fo7a_money_schema.ts": "smoke"}}
        _, body = bfa.run_alert(FakeApi(fixture({2196: ["x.ts"], 2197: ["y.ts"]})), 77, cover=stub(blanket))
        self.assertIn("unclear (#2196 reaches it only through a blanket rule", body)   # a blanket rule alone never names a PR

    def test_joined_blanket_reasons_never_name_a_pr(self):
        # select-suites.mjs joins reasons with "; " and adds "(+N more)" (review of #2234, Minor 1)
        for why in ("reads every file in api/src; smoke", "smoke; every browser suite: x (+2 more)", "runtime R1 suites run together (one copy, in order)"):
            r = {"x.ts": {"check_fo7a_money_schema.ts": why}}
            _, body = bfa.run_alert(FakeApi(fixture({2196: ["x.ts"], 2197: ["y.ts"]})), 77, cover=stub(r))
            self.assertIn("unclear (#2196 reaches it only through a blanket rule", body, why)
        self.assertEqual(bfa.tier("s.ts", ["x.ts"], {"s.ts": "smoke; imports x.ts (direct)"}), 1)

    def test_only_mergify_batches(self):
        d = fixture({2196: ["a"]}); d["pulls/2200"]["user"] = {"login": "someone"}; api = FakeApi(d)
        posted, msg = bfa.run_alert(api, 77, cover=stub({}))
        self.assertEqual((posted, api.posts), ([], [])); self.assertIn("not opened by mergify[bot]", msg)

    def test_long_fail_line_is_cut(self):
        self.assertLessEqual(len(bfa.clean("FAIL  " + "x" * 5000)), 502)

    def test_changed_suite_file_wins(self):
        r = {"z.ts": {"check_fo7a_money_schema.ts": "uses z.ts"}}
        _, body = bfa.run_alert(FakeApi(fixture({2196: [f"{S}/tests/check_fo7a_money_schema.ts"], 2197: ["z.ts"]})), 77, cover=stub(r))
        self.assertIn("**Most likely:** #2196 (`check_fo7a_money_schema.ts`: it changed the suite", body)

    def test_fail_line_naming_a_changed_file_wins(self):
        # 19 Nov batch #2221: the graph reached check_bk2_fold_outs.ts from two members alike; its FAIL line named
        # runtime/case-decision.tsx, which only #2169 changed.
        d = fixture({2196: ["web/src/a.tsx"], 2197: [f"{S}/web/src/pages/runtime/case-decision.tsx"]})
        d["actions/jobs/1/logs"] = d["actions/jobs/1/logs"].replace("got -5", "runtime/case-decision.tsx:179: <button")
        both = {"web/src/a.tsx": {"check_fo7a_money_schema.ts": "imports a.tsx (direct)"}}
        _, body = bfa.run_alert(FakeApi(d), 77, cover=stub(both))
        self.assertIn("**Most likely:** #2197 (`check_fo7a_money_schema.ts`: its FAIL lines name a file it changed: `case-decision.tsx`).", body)

    def test_two_suites_two_calls(self):
        d = fixture({2196: ["x.ts"], 2197: ["y.ts"]})
        d["actions/jobs/1/logs"] += "2026-11-19T10:02:00.0Z ##[group]check_pf19b_mail.ts failed (exit 1): its FAIL lines\n2026-11-19T10:02:00.1Z FAIL  stopped: TypeError\n"
        r = {"x.ts": {"check_fo7a_money_schema.ts": "uses x.ts"}, "y.ts": {"check_pf19b_mail.ts": "imports y.ts (direct)"}}
        _, body = bfa.run_alert(FakeApi(d), 77, cover=stub(r))
        self.assertIn("- `check_fo7a_money_schema.ts`: #2196 (it changed a file the suite uses)\n- `check_pf19b_mail.ts`: #2197 (", body)
        self.assertIn("`check_pf19b_mail.ts`:\n  ```\n  FAIL  stopped: TypeError", body)

    def test_non_suite_job_and_metadata_members(self):
        d = fixture({2301: ["a"]}, title="", types=True)
        d["pulls/2200"]["body"] = "```yaml\npull_requests:\n  - number: 2301\n```"
        _, body = bfa.run_alert(FakeApi(d), 77, cover=stub({}))
        self.assertIn("holds #2301.", body)
        self.assertIn("- **`types`** failed", body); self.assertIn("error: web/src/x.tsx(3,1): error TS2304", body)

    def test_not_a_batch_or_not_failed(self):
        for change in ({"conclusion": "success"}, {"head_branch": "claude/x"}):
            d = fixture({2196: ["a"]}); d["actions/runs/77"].update(change); api = FakeApi(d)
            posted, msg = bfa.run_alert(api, 77, cover=stub({}))
            self.assertEqual((posted, api.posts), ([], [])); self.assertIn("nothing to post", msg)

    ROOT = subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True, cwd=HERE).stdout.strip()

    # check-guards.sh --mutate runs this in a copy of the tools with no studio suites: there this case says so and skips,
    # so each guard-26 mutation must turn a fixture case red by itself.
    @unittest.skipUnless(os.path.exists(os.path.join(ROOT, S, "tests", "check_engine.ts")), "no studio suites in this copy")
    def test_real_select_suites(self):
        root = self.ROOT
        reach = bfa.covers([f"{S}/tests/check_engine.ts", f"{S}/api/src/employer-cases.ts"], root)
        self.assertIn("check_engine.ts", reach)
        self.assertGreater(len(reach), 5)

if __name__ == "__main__":
    unittest.main(verbosity=1)
