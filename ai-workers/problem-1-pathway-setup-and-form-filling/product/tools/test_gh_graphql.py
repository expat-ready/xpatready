#!/usr/bin/env python3
"""Tests for gh_graphql.py and sle-watch's use of it (LR-098): the query's shape, REST-shaped comments, bots' logins,
batches of PR_BATCH, every failure raising GraphQLError, and sle-watch reading comments and label times from one query
(no per-PR REST reads) or, when GraphQL fails, through REST as before. Recorded answers, no network, US$0.
  python3 -I product/tools/test_gh_graphql.py
The query itself was checked against GitHub's published schema (@octokit/graphql-schema 15.26.1) with graphql-core on
28 Nov: all four field sets valid; a misspelt field is refused."""
import importlib.util, os, sys, unittest

HERE = os.path.dirname(os.path.abspath(__file__))


def load(name, file):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, file))
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    return m


g = load("gh_graphql", "gh_graphql.py")
sle = load("sle_watch", "sle-watch.py")


def node(n, comments=(), labeled=(), files=None):
    p = {"comments": {"totalCount": len(comments), "nodes": list(comments)},
         "timelineItems": {"nodes": [{"createdAt": t, "label": {"name": l}} for t, l in labeled] + [{}]}}
    if files is not None:
        p["files"] = {"totalCount": len(files), "nodes": [{"path": f} for f in files]}
    return p


C1 = {"databaseId": 11, "createdAt": "2026-11-28T08:00:00Z", "body": "Reviewer: Approve abcdef1", "authorAssociation": "MEMBER",
      "author": {"login": "builder", "__typename": "User"}}
C2 = {"databaseId": 12, "createdAt": "2026-11-28T08:05:00Z", "body": "To label again ...", "authorAssociation": "NONE",
      "author": {"login": "github-actions", "__typename": "Bot"}}


class Bundle(unittest.TestCase):
    def test_query_names_each_pr_and_asks_only_what_is_needed(self):
        q = g.query_for("o", "r", [7, 8], True, False, False)
        self.assertIn('repository(owner: "o", name: "r")', q)
        self.assertIn("p7: pullRequest(number: 7)", q); self.assertIn("p8: pullRequest(number: 8)", q)
        self.assertIn("comments(last: 100)", q); self.assertNotIn("timelineItems", q); self.assertNotIn("files(", q)
        self.assertIn("LABELED_EVENT", g.query_for("o", "r", [7], False, True, False))

    def test_comments_come_back_in_the_rest_shape(self):
        got = g.pr_bundle("o/r", [7], labels=True, run=lambda q: {"repository": {"p7": node(7, [C1, C2], [("2026-11-28T09:00:00Z", "review: approved")])}})
        c = got[7]["comments"]
        self.assertEqual(c[0], {"id": 11, "created_at": "2026-11-28T08:00:00Z", "body": "Reviewer: Approve abcdef1",
                                "author_association": "MEMBER", "user": {"login": "builder", "type": "User"}})
        self.assertEqual(c[1]["user"], {"login": "github-actions[bot]", "type": "Bot"})          # REST's bot login
        self.assertEqual(got[7]["labeled"], [{"created_at": "2026-11-28T09:00:00Z", "label": "review: approved"}])

    def test_prs_are_read_in_batches(self):
        seen = []

        def run(q):
            seen.append(q)
            return {"repository": {"p%d" % n: node(n) for n in range(1, 46) if "p%d:" % n in q}}
        got = g.pr_bundle("o/r", list(range(1, 46)), run=run)
        self.assertEqual(len(seen), 3)                                                    # 20 + 20 + 5
        self.assertEqual(sorted(got), list(range(1, 46)))

    def test_files_and_their_limit(self):
        got = g.pr_bundle("o/r", [7], comments=False, files=True, run=lambda q: {"repository": {"p7": node(7, files=["a", "b"])}})
        self.assertEqual(got[7]["files"], ["a", "b"])
        big = node(7, files=["x"]); big["files"]["totalCount"] = 101
        with self.assertRaises(g.GraphQLError):
            g.pr_bundle("o/r", [7], comments=False, files=True, run=lambda q: {"repository": {"p7": big}})

    def test_failures_raise(self):
        for answer in ({}, {"repository": None}, {"repository": {}}):
            with self.assertRaises(g.GraphQLError):
                g.pr_bundle("o/r", [7], run=lambda q, a=answer: a)
        with self.assertRaises(g.GraphQLError):
            g.pr_bundle("noslash", [7], run=lambda q: {})

    def test_gh_errors_raise(self):
        real = g.subprocess.run

        class R:
            def __init__(self, rc, out, err=""): self.returncode, self.stdout, self.stderr = rc, out, err
        try:
            for r in (R(1, "", "HTTP 403: GitHub GraphQL is not available"), R(0, '{"errors": [{"message": "x"}]}'),
                      R(0, "not json"), R(1, "")):
                g.subprocess.run = lambda *a, r=r, **k: r
                with self.assertRaises(g.GraphQLError) as e:
                    g.gh_query("query { x }")
                self.assertTrue(str(e.exception))                                          # always a reason
            g.subprocess.run = lambda *a, **k: R(0, '{"data": {"repository": {}}}')
            self.assertEqual(g.gh_query("q"), {"repository": {}})
        finally:
            g.subprocess.run = real


PRS = [{"number": 7, "title": "t", "draft": False, "labels": [{"name": "review: approved"}, {"name": "queued"}],
        "head": {"sha": "abcdef1234", "ref": "b7"}, "updated_at": "2026-11-28T08:00:00Z", "body": ""},
       {"number": 9, "title": "u", "draft": False, "labels": [], "head": {"sha": "99", "ref": "mergify/merge-queue/x"},
        "updated_at": "2026-11-28T08:00:00Z", "body": ""}]


class SleFetch(unittest.TestCase):
    def setUp(self):
        self.real, self.calls = sle.api, []

        def api(path):
            self.calls.append(path)
            if path.startswith("repos/o/r/pulls"):
                return PRS
            if "/comments" in path:
                return [{"created_at": "2026-11-28T08:00:00Z", "body": "Reviewer: Approve abcdef1", "author_association": "MEMBER"}]
            if "/events" in path:
                return [{"event": "labeled", "created_at": "2026-11-28T09:00:00Z", "label": {"name": "review: approved"}}]
            raise AssertionError(path)
        sle.api = api

    def tearDown(self):
        sle.api = self.real

    def test_graphql_path_makes_no_per_pr_reads(self):
        class G:
            PR_BATCH = 20
            @staticmethod
            def pr_bundle(repo, numbers, comments, labels):
                assert numbers == [7]                                                     # the queue's batch PR left out
                return g.pr_bundle(repo, numbers, labels=True, run=lambda q: {"repository": {"p7": node(7, [C1], [("2026-11-28T09:00:00Z", "review: approved")])}})
        snap = sle.fetch("o/r", gql=G)
        self.assertEqual(self.calls, ["repos/o/r/pulls?state=open&per_page=100"])
        p = snap["prs"][0]
        self.assertEqual(p["approved_at"], "2026-11-28T09:00:00Z")
        self.assertEqual(p["approves"], [{"at": "2026-11-28T08:00:00Z", "sha": "abcdef1"}])
        self.assertTrue(snap["github"].startswith("graphql: 1 PRs"))

    def test_rest_path_when_graphql_fails(self):
        class G:
            PR_BATCH = 20
            @staticmethod
            def pr_bundle(*a, **k):
                raise g.GraphQLError("HTTP 403")
        snap = sle.fetch("o/r", gql=G)
        self.assertIn("repos/o/r/issues/7/comments?per_page=100", self.calls)
        self.assertIn("repos/o/r/issues/7/events?per_page=100", self.calls)
        self.assertEqual(snap["prs"][0]["approved_at"], "2026-11-28T09:00:00Z")
        self.assertEqual(snap["github"], "REST: GraphQL not used (HTTP 403)")


if __name__ == "__main__":
    unittest.main(verbosity=1)
