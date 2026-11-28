#!/usr/bin/env python3
"""Many PRs' comments, label events and files in a few GraphQL queries (LR-098, founder P-860: one lead-watch run used
~2,650 of the 5,000 REST requests an hour and the Lead's token hit 0 at 14:03 IST on 28 Nov). Measured in a cloud copy
the same day: sle-watch spent ~242 REST requests a run (79 per-PR comment reads, 12 event reads), proof-read-watch ~97
(38 comment reads), flow-measure --lead ~211 (49 files, 49 events, 15 comments). GraphQL has its own hourly budget
(points, not requests), and one query here reads PR_BATCH PRs.

  pr_bundle(repo, numbers, comments=True, labels=False, files=False) ->
      {number: {"comments": [REST-shaped issue comment, oldest first], "comments_complete": bool,
                "labeled": [{"created_at", "label"}], "files": [path, ...] or None}}
Comments come back in the REST shape the tools already read (created_at, body, author_association, user {login, type};
a bot's login gets REST's "[bot]" suffix). REST's ?per_page=100 gave a PR's oldest 100 comments; this gives its newest
COMMENTS (the newer ones are the ones the checks judge); comments_complete says whether that is all of them. files is
None for a PR with over FILES files or a renamed or copied file (no previous path in GraphQL): read it by REST. Any
failure raises GraphQLError: each caller then reads the
same data through REST as before and says which path it took. GraphQL is refused (HTTP 403) from cloud sessions, so
there the REST path runs; on the Mac the query runs through gh.sh (its TLS fallback cannot send a query: the REST path
then runs). Test: test_gh_graphql.py (recorded responses, no network).
"""
import json
import os
import subprocess

TOOLS = os.path.dirname(os.path.abspath(__file__))
PR_BATCH, COMMENTS, LABELS, FILES = 20, 100, 50, 100


class GraphQLError(RuntimeError):
    pass


def gh_query(query):
    """Runs one query through gh.sh; -> the "data" object. Errors (HTTP, GraphQL errors, bad JSON) raise GraphQLError."""
    r = subprocess.run(["bash", os.path.join(TOOLS, "gh.sh"), "api", "graphql", "-f", "query=" + query],
                       capture_output=True, text=True)
    try:
        out = json.loads(r.stdout or "null")
    except ValueError:
        out = None
    if r.returncode != 0 or not isinstance(out, dict) or out.get("errors") or not out.get("data"):
        why = (out or {}).get("errors") if isinstance(out, dict) else None
        raise GraphQLError(str(why or r.stderr.strip() or r.stdout.strip() or "gh exit %d" % r.returncode)[:200])
    return out["data"]


def query_for(owner, name, numbers, comments, labels, files):
    parts = []
    for n in numbers:
        f = []
        if comments:
            f.append("comments(last: %d) { totalCount nodes { databaseId createdAt body authorAssociation "
                     "author { login __typename } } }" % COMMENTS)
        if labels:
            f.append("timelineItems(itemTypes: [LABELED_EVENT], last: %d) { nodes { ... on LabeledEvent { createdAt "
                     "label { name } } } }" % LABELS)
        if files:
            f.append("files(first: %d) { totalCount nodes { path changeType } }" % FILES)
        parts.append("p%d: pullRequest(number: %d) { %s }" % (int(n), int(n), " ".join(f)))
    return 'query { repository(owner: %s, name: %s) { %s } }' % (json.dumps(owner), json.dumps(name), " ".join(parts))


def rest_comment(c):
    a = c.get("author") or {}
    bot = a.get("__typename") == "Bot"
    login = a.get("login") or "ghost"
    return {"id": c.get("databaseId"), "created_at": c.get("createdAt"), "body": c.get("body") or "",
            "author_association": c.get("authorAssociation"),
            "user": {"login": login + "[bot]" if bot and not login.endswith("[bot]") else login,
                     "type": "Bot" if bot else "User"}}


def pr_bundle(repo, numbers, comments=True, labels=False, files=False, run=None):
    run = run or gh_query
    owner, _, name = repo.partition("/")
    if not owner or not name:
        raise GraphQLError("repository %r is not owner/name" % repo)
    out, numbers = {}, [int(n) for n in numbers]
    for i in range(0, len(numbers), PR_BATCH):
        batch = numbers[i:i + PR_BATCH]
        data = run(query_for(owner, name, batch, comments, labels, files))
        repo_d = (data or {}).get("repository")
        if not isinstance(repo_d, dict):
            raise GraphQLError("no repository in the answer")
        for n in batch:
            p = repo_d.get("p%d" % n)
            if not isinstance(p, dict):
                raise GraphQLError("PR #%d missing from the answer" % n)
            e = {}
            if comments:
                e["comments"] = [rest_comment(c) for c in p["comments"]["nodes"]]
                e["comments_complete"] = p["comments"]["totalCount"] <= COMMENTS   # every comment, or only the newest
            if labels:
                e["labeled"] = [{"created_at": x["createdAt"], "label": (x.get("label") or {}).get("name")}
                                for x in p["timelineItems"]["nodes"] if x]
            if files:   # None: over FILES, or a rename or copy (GraphQL gives no previous path): read that PR by REST
                fs = p["files"]
                e["files"] = None if fs["totalCount"] > FILES or any(
                    x.get("changeType") in ("RENAMED", "COPIED") for x in fs["nodes"]) else [x["path"] for x in fs["nodes"]]
            out[n] = e
    return out
