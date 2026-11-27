#!/usr/bin/env python3
"""Review-round limit (ENF-783a, P-783 (1); the rule: P-293, "at most two review rounds ... after that the tech lead
decides between another round and a fresh reviewer"; desk 08 cites it as P-277).

A reviewer round is one PR comment, by someone with write access (OWNER, MEMBER, COLLABORATOR; anyone can comment on
a public repository), with a line that starts "Reviewer: <verdict>" (Approve, Changes, Changes requested, Request
changes, Block, Reject; markdown * _ ` ignored). Bots never count. A438 cut 3 (founder 27 Nov 14:3x IST, "Yes, all
three"): only rounds that ask for changes count (Changes, Block, Reject, needs changes); an Approve, the first one or a
re-review of a later diff, is reported but never counted (a records PR needed 4 rounds for STATE line edits, 27 Nov).
Change-requesting rounds 1 and 2 pass. Round k > 2 passes only when a
write-access comment has a line starting "Lead allows round N:" with N >= k (so "Lead allows round 3:" allows a third
round; a fourth needs "Lead allows round 4:"). A PR with the `records` label is exempt (P-385: the Lead's records
approvals are not review rounds). Limit, stated for the Lead (#2749 review M3): only rounds posted as such a line
count; a round summarised in prose, or posted as "Verdict: ..." or "Block on <sha>", is not seen.

Usage:
  python3 -I review-rounds.py --comments FILE          # a JSON array of issue comments (tests)
  python3 -I review-rounds.py --pr N [--status]        # live: GitHub's API through curl (GH_TOKEN, GITHUB_TOKEN or
                                                       # `gh auth token`); --status also sets the commit status
                                                       # "review-rounds" on the PR's head (CI)
Exit: 0 within the limit · 1 refused · 2 GitHub unreadable (fails closed: the status is "error").
"""
import argparse
import json
import os
import re
import subprocess
import sys

REPO = os.environ.get("REPO", "expat-ready/xpatready")
TEAM = {"OWNER", "MEMBER", "COLLABORATOR"}
VERDICT = re.compile(r"^\s*(?:>\s*)?reviewer:\s*(approve[sd]?|changes(?: requested)?|requests? changes|block(?:ed|er)?|"
                     r"reject(?:ed)?|needs? changes)\b", re.I | re.M)
ALLOW = re.compile(r"^\s*(?:>\s*)?lead allows round\s+(\d+)\s*:", re.I | re.M)
CONTEXT = "review-rounds"


def judge(comments):
    """-> (ok, rounds, allowed, message)"""
    rounds, approves, allowed, ids = 0, 0, 2, []
    for c in comments:
        user = c.get("user") or {}
        if user.get("type") == "Bot" or user.get("login", "").endswith("[bot]"):
            continue
        if c.get("author_association") not in TEAM:
            continue
        body = re.sub(r"[*_`]", "", c.get("body") or "")
        verdicts = [v.lower() for v in VERDICT.findall(body)]
        if verdicts and all(v.startswith("approve") for v in verdicts):
            approves += 1   # A438 cut 3: an Approve round never counts toward the limit
        elif verdicts:
            rounds += 1
            ids.append(str(c.get("id", "?")))
        for n in ALLOW.findall(body):
            allowed = max(allowed, int(n))
    seen = " (%d Approve round(s) not counted, A438)" % approves if approves else ""
    if rounds <= allowed:
        extra = " (Lead allowed up to %d)" % allowed if allowed > 2 else ""
        return True, rounds, allowed, "%d change-requesting round(s), limit %d%s%s" % (rounds, allowed, extra, seen)
    return False, rounds, allowed, ("%d change-requesting rounds, limit %d: round %d needs a PR comment line "
                                    "\"Lead allows round %d: <reason>\" from the tech lead, or a fresh reviewer's "
                                    "decision by the Lead (P-293, P-783 (1))" % (rounds, allowed, allowed + 1, allowed + 1))


class API:
    def __init__(self):
        self.token = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
        if not self.token:
            self.token = subprocess.run(["gh", "auth", "token"], capture_output=True, text=True).stdout.strip()

    def call(self, path, method="GET", data=None):
        cmd = ["curl", "-sf", "--max-time", "30", "-X", method, "-H", "Authorization: Bearer " + self.token,
               "-H", "Accept: application/vnd.github+json", "https://api.github.com/repos/%s/%s" % (REPO, path)]
        if data is not None:
            cmd += ["-d", json.dumps(data)]
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode != 0:
            raise OSError("GitHub %s %s: curl exit %d" % (method, path, r.returncode))
        return json.loads(r.stdout or "null")

    def comments(self, pr):
        out, page = [], 1
        while True:
            batch = self.call("issues/%d/comments?per_page=100&page=%d" % (pr, page))
            out += batch
            if len(batch) < 100:
                return out
            page += 1


def main(argv=None):
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--comments")
    g.add_argument("--pr", type=int)
    ap.add_argument("--status", action="store_true", help="set the commit status on the PR's head (CI)")
    a = ap.parse_args(argv)
    api, head, records = None, None, False
    try:
        if a.comments:
            with open(a.comments, encoding="utf-8") as f:
                comments = json.load(f)
        else:
            api = API()
            pull = api.call("pulls/%d" % a.pr)
            records = "records" in [l["name"] for l in pull.get("labels", [])]
            if a.status:
                head = pull["head"]["sha"]
            comments = api.comments(a.pr)
    except (OSError, ValueError, KeyError, TypeError) as e:
        print("review-rounds: comments unreadable (%s): failing closed" % e)
        if api and head:
            try:
                api.call("statuses/" + head, "POST", {"state": "error", "context": CONTEXT,
                                                      "description": "comments unreadable: re-run this check"})
            except OSError:
                pass
        return 2
    ok, rounds, allowed, msg = judge(comments)
    if records:
        ok, msg = True, "records PR: exempt (P-385); " + msg
    print("review-rounds: %s: %s" % ("OK" if ok else "REFUSED", msg))
    if api and head:
        try:
            api.call("statuses/" + head, "POST", {"state": "success" if ok else "failure", "context": CONTEXT,
                                                  "description": msg[:140]})
        except OSError as e:
            print("review-rounds: status not set (%s)" % e)
            return 2
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
