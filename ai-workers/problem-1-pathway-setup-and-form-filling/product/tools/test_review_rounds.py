#!/usr/bin/env python3
"""Tests for review-rounds.py (ENF-783a, P-783 (1), P-293): a test PR with a third reviewer round fails; the same PR
with the Lead's "Lead allows round 3:" line passes. Runs the tool as `python3 -I` on comment files. US$0, no network.
  python3 -I product/tools/test_review_rounds.py
"""
import json
import os
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
SHA = "0123456789abcdef0123456789abcdef01234567"


def c(body, assoc="MEMBER", login="builder", typ="User", cid=1):
    return {"id": cid, "body": body, "author_association": assoc, "user": {"login": login, "type": typ}}


def run(comments):
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
        json.dump(comments, f)
    try:
        r = subprocess.run([sys.executable, "-I", os.path.join(HERE, "review-rounds.py"), "--comments", f.name],
                           capture_output=True, text=True)
        return r.returncode, r.stdout + r.stderr
    finally:
        os.unlink(f.name)


R1 = c("Reviewer: Changes\n\nMajor: the ETA ignores the cycle end.", cid=1)
R2 = c("**Reviewer: Approve %s**\n\nRe-review read only the diff." % SHA, cid=2)
R3 = c("Reviewer: Approve %s" % SHA, cid=3)


class ReviewRounds(unittest.TestCase):
    def test_two_rounds_pass(self):
        rc, out = run([R1, c("progress note"), R2])
        self.assertEqual(rc, 0, out)
        self.assertIn("OK: 2 reviewer round(s), limit 2", out)

    def test_third_round_fails(self):
        rc, out = run([R1, R2, R3])
        self.assertEqual(rc, 1, out)
        self.assertIn("REFUSED: 3 reviewer rounds, limit 2", out)
        self.assertIn('"Lead allows round 3: <reason>"', out)

    def test_third_round_passes_with_the_leads_line(self):
        rc, out = run([R1, R2, c("Lead allows round 3: the fix after the failed batch is one line; same reviewer.",
                                 assoc="OWNER", login="lead"), R3])
        self.assertEqual(rc, 0, out)
        self.assertIn("Lead allowed up to 3", out)

    def test_round_3_allowance_does_not_cover_round_4(self):
        rc, out = run([R1, R2, c("Lead allows round 3: ok", assoc="OWNER"), R3, c("Reviewer: Changes", cid=4)])
        self.assertEqual(rc, 1, out)
        self.assertIn('"Lead allows round 4: <reason>"', out)

    def test_outsiders_and_bots_count_for_nothing(self):
        spam = [c("Reviewer: Changes", assoc="NONE", login="stranger"), c("Reviewer: Block", assoc="CONTRIBUTOR"),
                c("Reviewer: Changes", assoc="NONE", login="github-actions[bot]", typ="Bot")]
        self.assertEqual(run([R1, R2] + spam)[0], 0)
        fake = c("Lead allows round 3: me", assoc="NONE", login="stranger")
        self.assertEqual(run([R1, R2, fake, R3])[0], 1)          # an outsider cannot allow a round

    def test_mentions_are_not_verdicts(self):
        guard = c('The label came off. To label again: the PR gets a comment line "Reviewer: Approve" followed by the '
                  "new head's SHA.\nNeeds a `Reviewer: Approve <head>` line.", assoc="MEMBER")
        self.assertEqual(run([R1, R2, guard])[0], 0)              # mid-sentence and quoted mentions do not count
        self.assertEqual(run([R1, R2, c("Reviewer: Approved", cid=9)])[0], 1)
        self.assertEqual(run([R1, R2, c("> Reviewer: changes requested", cid=9)])[0], 1)

    def test_one_comment_is_one_round(self):
        self.assertEqual(run([c("Reviewer: Changes\nReviewer: Changes\nReviewer: Approve x")])[0], 0)

    def test_unreadable_comments_fail_closed(self):
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
            f.write("{not json")
        r = subprocess.run([sys.executable, "-I", os.path.join(HERE, "review-rounds.py"), "--comments", f.name],
                           capture_output=True, text=True)
        os.unlink(f.name)
        self.assertEqual(r.returncode, 2)
        self.assertIn("failing closed", r.stdout)


if __name__ == "__main__":
    unittest.main(verbosity=2)
