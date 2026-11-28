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
prw = load("proof_read_watch", "proof-read-watch.py")
os.environ.setdefault("GITHUB_REPOSITORY", "o/r")   # flow-measure reads no git remote at import
fm = load("flow_measure", "flow-measure.py")


def node(n, comments=(), labeled=(), files=None):
    p = {"comments": {"totalCount": len(comments), "nodes": list(comments)},
         "timelineItems": {"totalCount": len(labeled), "nodes": [{"createdAt": t, "label": {"name": l}} for t, l in labeled] + [{}]}}
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
        self.assertIsNone(g.pr_bundle("o/r", [7], comments=False, files=True, run=lambda q: {"repository": {"p7": big}})[7]["files"])
        ren = node(7, files=["x"]); ren["files"]["nodes"][0]["changeType"] = "RENAMED"
        self.assertIsNone(g.pr_bundle("o/r", [7], comments=False, files=True, run=lambda q: {"repository": {"p7": ren}})[7]["files"])

    def test_labeled_complete_only_when_all_were_read(self):
        many = node(7, [], [("2026-11-28T09:00:00Z", "review: approved")]); many["timelineItems"]["totalCount"] = 101
        self.assertFalse(g.pr_bundle("o/r", [7], labels=True, run=lambda q: {"repository": {"p7": many}})[7]["labeled_complete"])
        few = node(7, []); few["timelineItems"]["totalCount"] = 3
        self.assertTrue(g.pr_bundle("o/r", [7], labels=True, run=lambda q: {"repository": {"p7": few}})[7]["labeled_complete"])
        nocount = node(7, []); del nocount["timelineItems"]["totalCount"]
        self.assertFalse(g.pr_bundle("o/r", [7], labels=True, run=lambda q: {"repository": {"p7": nocount}})[7]["labeled_complete"])

    def test_comments_complete_only_when_all_were_read(self):
        many = node(7, [C1]); many["comments"]["totalCount"] = 101
        self.assertFalse(g.pr_bundle("o/r", [7], run=lambda q: {"repository": {"p7": many}})[7]["comments_complete"])
        self.assertTrue(g.pr_bundle("o/r", [7], run=lambda q: {"repository": {"p7": node(7, [C1])}})[7]["comments_complete"])

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
                      R(1, "", "<html>\n<body>403\n</body>"),
                      R(0, "not json"), R(1, "")):
                g.subprocess.run = lambda *a, r=r, **k: r
                with self.assertRaises(g.GraphQLError) as e:
                    g.gh_query("query { x }")
                self.assertTrue(str(e.exception))                                          # always a reason
                self.assertNotIn("\n", str(e.exception))                                    # on one line
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



class ProofReadPrefetch(unittest.TestCase):
    """proof-read-watch: candidates' comments and files from GraphQL; a PR with more comments than were read, or a renamed
    file, keeps its REST read; a GraphQL failure leaves every read on REST."""
    def bundle_g(self, answer):
        class G:
            PR_BATCH = 20
            @staticmethod
            def pr_bundle(repo, numbers, comments, files):
                return g.pr_bundle(repo, numbers, files=True, run=lambda q: {"repository": answer})
        return G

    def source(self, gql):
        src, calls = prw.Source(None, gql=gql), []
        src.page = lambda name, path, n: calls.append(name) or []
        return src, calls

    def test_cached_reads_and_per_pr_rest(self):
        many = node(8, [C1]); many["comments"]["totalCount"] = 150                       # comments not all read
        ren = node(9, [C1], files=["new.sh"]); ren["files"]["nodes"][0]["changeType"] = "RENAMED"
        src, calls = self.source(self.bundle_g({"p7": node(7, [C1], files=["a.sh"]), "p8": dict(many, files={"totalCount": 0, "nodes": []}), "p9": ren}))
        src.prefetch([7, 8, 9])
        self.assertEqual(src.get("comments_7", "x")[0]["body"], "Reviewer: Approve abcdef1")
        self.assertEqual(src.get("files_7", "x"), [{"filename": "a.sh"}])
        src.get("comments_8", "x"); src.get("files_9", "x"); src.get("files_8", "x"); src.get("comments_9", "x")
        self.assertEqual(calls, ["comments_8", "files_9"])                                 # only those two by REST
        self.assertEqual(src.github, "graphql: 3 PRs in 1 queries; REST for 1 comment and 1 file reads")

    def test_graphql_failure_leaves_rest(self):
        class G:
            PR_BATCH = 20
            @staticmethod
            def pr_bundle(*a, **k):
                raise g.GraphQLError("HTTP 403")
        src, calls = self.source(G)
        src.prefetch([7])
        src.get("comments_7", "x"); src.get("files_7", "x")
        self.assertEqual(calls, ["comments_7", "files_7"])
        self.assertEqual(src.github, "REST: GraphQL not used (HTTP 403)")

    def test_fixture_runs_never_query(self):
        src = prw.Source("/nonexistent")
        src.prefetch([7])
        self.assertIsNone(src.github)


class FlowMeasureFacts(unittest.TestCase):
    """flow-measure --lead: merged PRs' files and approval label times from the bundle; REST for a PR whose files or
    label events were not all read; {} (all REST) when GraphQL fails."""
    def setUp(self):
        self.real, self.calls = fm.pr_facts, []
        fm.pr_facts = lambda n: self.calls.append(n) or (["rest.sh"], [])

    def tearDown(self):
        fm.pr_facts = self.real

    def test_facts_from_the_bundle_and_per_pr_rest(self):
        b = {7: {"files": ["a.sh"], "labeled": [{"created_at": "2026-11-28T09:00:00Z", "label": "review: approved"},
                                                {"created_at": "2026-11-28T09:05:00Z", "label": "queued"}], "labeled_complete": True},
             8: {"files": None, "labeled": [], "labeled_complete": True},
             9: {"files": ["b"], "labeled": [], "labeled_complete": False}}
        self.assertEqual(fm.facts_from(b, 7), (["a.sh"], [fm.t("2026-11-28T09:00:00Z")]))
        fm.facts_from(b, 8); fm.facts_from(b, 9); fm.facts_from(b, 10)
        self.assertEqual(self.calls, [8, 9, 10])

    def test_comments_from_the_bundle_only_when_complete(self):
        real, calls = fm.paged, []
        fm.paged = lambda url, **k: calls.append(url) or ["rest"]
        try:
            b = {7: {"comments": ["c"], "comments_complete": True}, 8: {"comments": ["c"], "comments_complete": False}}
            self.assertEqual(fm.comments_from(b, 7), ["c"])
            self.assertEqual(fm.comments_from(b, 8), ["rest"]); self.assertEqual(fm.comments_from(b, 9), ["rest"])
            self.assertEqual(len(calls), 2)
            self.assertTrue(calls[0].endswith("/issues/8/comments"))
        finally:
            fm.paged = real

    def test_bundle_of_failure_is_all_rest(self):
        class G:
            PR_BATCH = 20
            @staticmethod
            def pr_bundle(*a, **k):
                raise g.GraphQLError("HTTP 403: GitHub GraphQL is not available")
        fm.GITHUB.clear()
        self.assertEqual(fm.bundle_of([7], gql=G), {})
        self.assertEqual(fm.GITHUB, ["REST: GraphQL not used (HTTP 403: GitHub GraphQL is not available)"])

    def test_bundle_of_says_its_path(self):
        fm.GITHUB.clear()
        self.assertEqual(fm.bundle_of([]), {})                                               # no PRs: no query, graphql path
        self.assertTrue(fm.GITHUB[-1].startswith("graphql: 0 PRs"))


class SleMainLine(unittest.TestCase):
    def test_the_github_line_is_printed_on_one_line(self):
        import io, contextlib
        real = sle.fetch
        sle.fetch = lambda repo: {"now": "2026-11-28T10:00:00Z", "prs": [], "github": "REST: GraphQL not used (HTTP 403)"}
        try:
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                sle.main(["--grouped", "--board-time", "2026-11-28T10:00:00Z"])
        finally:
            sle.fetch = real
        self.assertIn("sle   github REST: GraphQL not used (HTTP 403)\n", out.getvalue())

if __name__ == "__main__":
    unittest.main(verbosity=1)
