#!/usr/bin/env python3
"""Unit tests for tools/human-sample.py (ENF-782b part 2, P-782 (1)): each state lead-watch can see (due, open, answered
yes, answered no, overdue) and the weekly triggers, on hand-made history, rows and journeys. No network, no git.
Run: python3 -I product/tools/test_human_sample.py"""
import importlib.util, os, subprocess, sys, tempfile, unittest
from datetime import datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("hs", os.path.join(HERE, "human-sample.py"))
hs = importlib.util.module_from_spec(spec); spec.loader.exec_module(hs)

IST = timezone(timedelta(hours=5, minutes=30))


def write(f, text):
    with open(f, "w", encoding="utf-8") as h:
        h.write(text)


def read(f):
    with open(f, encoding="utf-8") as h:
        return h.read()
I = lambda s: datetime.strptime(s, "%Y-%m-%d %H:%M").replace(tzinfo=IST)
ROW = lambda r, st: f"+| {r} | {r[3:]} Thing {r[3:]} | Platform | {st} | x 1 Nov | — | Done when for {r} | note |"
LOG = "\n".join([
    "@@C a 2026-11-10T00:00:00+00:00", ROW("R1.1", "Works"), ROW("R1.2", "Partial"), ROW("R1.3", "Partial"), ROW("R1.4", "Partial"), ROW("R1.5", "Partial"),
    "@@C b 2026-11-18T00:00:00+00:00", ROW("R1.2", "Works"), ROW("R1.3", "Works"),
    "@@C c 2026-11-20T00:00:00+00:00", ROW("R1.4", "Works"),
    "@@C d 2026-11-22T00:00:00+00:00", ROW("R1.5", "Works"),
])
CAPS = "\n".join(l[1:] for l in LOG.splitlines() if l.startswith("+") and "R1.1 " not in l[:9]) + "\n" + ROW("R1.1", "Works")[1:]


def caps(**status):
    out = []
    for line in CAPS.splitlines():
        r = line.split(" | ")[0][2:]
        st = status.get(r.replace(".", "_"))
        out.append(line.replace("| Works |", f"| {st} |").replace("| Partial |", f"| {st} |") if st else line)
    return "\n".join(out)


class Base(unittest.TestCase):
    def setUp(self):
        self.j = tempfile.mkdtemp()
        with open(os.path.join(self.j, "j_4.ts"), "w") as f:
            f.write("await page.goto(`${BASE}/api/x`);\nawait owner.goto(`${BASE}/front-office/leads?view=all`);\n")
        self.proven = hs.proven_since(LOG)

    def run_check(self, now, text="", status=None):
        return hs.check(I(now), text, self.proven, hs.rows(caps(**(status or {}))), self.j, True)


class Parse(Base):
    def test_proven_is_the_start_of_the_current_works_streak(self):
        self.assertEqual(sorted(self.proven), ["R1.1", "R1.2", "R1.3", "R1.4", "R1.5"])
        self.assertEqual(self.proven["R1.4"], datetime(2026, 11, 20, tzinfo=timezone.utc))

    def test_demo_path_is_the_first_page_never_an_api_call(self):
        self.assertEqual(hs.demo_path("R1.4", self.j), ("http://localhost:4400/front-office/leads?view=all", True))
        self.assertEqual(hs.demo_path("R1.9", self.j), ("http://localhost:4400/", False))


class Due(Base):
    def test_first_check_writes_two_rows_proven_this_week(self):
        lines, new = self.run_check("2026-11-23 10:05")
        # Proven in the 7 days to 23 Nov 10:05 IST: R1.2, R1.3 (18 Nov), R1.4 (20 Nov), R1.5 (22 Nov); R1.1 (10 Nov) is older.
        asked = hs.read_asks(new)[-1]["rows"]
        self.assertEqual(len(asked), 2); self.assertTrue(set(asked) <= {"R1.2", "R1.3", "R1.4", "R1.5"})
        self.assertEqual(len(lines), 1); self.assertTrue(lines[0].startswith("ACT   founder: human sample due ("))
        self.assertIn("## Ask 2026-11-23 10:05 IST", new); self.assertIn("aligned", new.lower()); self.assertIn("yes / no |", new)
        self.assertIn("Done when for", new)

    def test_the_pick_is_the_same_on_every_check_of_the_day(self):
        self.assertEqual(self.run_check("2026-11-23 10:05")[1].split("## Ask")[1][20:], self.run_check("2026-11-23 10:15")[1].split("## Ask")[1][20:])

    def test_fewer_than_two_new_fills_with_recent_rows_not_asked(self):
        p = hs.pick(self.proven, {"R1.2", "R1.3", "R1.4"}, I("2026-11-23 10:05"), "s")
        self.assertEqual(p, (["R1.1", "R1.5"], 1))


ASKED = "## Ask 2026-11-23 10:05 IST\n\n| Row | On the demo (:4400) | What to look for | Aligned? |\n|---|---|---|---|\n| R1.4 x | u | l | yes / no |\n| R1.5 y | u | l | yes / no |\n"


class Open(Base):
    def test_unanswered_ask_is_due_each_check_and_writes_nothing(self):
        lines, new = self.run_check("2026-11-25 09:00", ASKED + "answer: R1.4 yes (2026-11-24 12:00 IST)\n")
        self.assertIsNone(new)
        self.assertEqual(lines, ["ACT   founder: human sample due (R1.5 unanswered, asked 2026-11-23 10:05 IST; product/qa/human-sample.md; card and push)"])

    def test_overdue_after_seven_days_adds_a_red_needs_you_line(self):
        lines, _ = self.run_check("2026-11-30 10:05", ASKED)
        self.assertEqual(len(lines), 2)
        self.assertIn("founder: human sample due", lines[0])
        self.assertTrue(lines[1].startswith("ACT   \033[31mNeeds you\033[0m: human sample unanswered 7 days"))
        self.assertEqual(len(self.run_check("2026-11-30 10:04", ASKED)[0]), 1)   # one minute short of 7 days


class Answered(Base):
    YES = ASKED + "answer: R1.4 yes (2026-11-23 12:00 IST)\nanswer: R1.5 yes (2026-11-23 12:01 IST) — all good\n"
    NO = ASKED + "answer: R1.4 yes (2026-11-23 12:00 IST)\nanswer: R1.5 no (2026-11-23 12:01 IST) — the filter is missing\n"

    def test_answered_yes_is_quiet_until_next_monday(self):
        lines, new = self.run_check("2026-11-26 09:00", self.YES)
        self.assertIsNone(new)
        self.assertEqual(lines, ["human sample answered for the 2026-11-23 ask: all aligned; next due 2026-11-30 10:00 IST"])

    def test_answered_no_asks_to_reopen_while_main_says_works(self):
        lines, new = self.run_check("2026-11-24 09:00", self.NO)
        self.assertIsNone(new)
        self.assertEqual(lines[0], "ACT   reopen R1.5 as Partial and log a qa bug (founder said not aligned on the 2026-11-23 human sample: the filter is missing; P-782 (1))")
        self.assertIn("not aligned: R1.5", lines[1])
        self.assertEqual(self.run_check("2026-11-24 09:00", self.NO, status={"R1_5": "Partial"})[0][0][:3], "hum")   # reopened: the ACT stops

    def test_a_no_stops_once_the_row_is_re_proven_after_the_answer(self):
        log = LOG + "\n@@C e 2026-11-24T00:00:00+00:00\n" + ROW("R1.5", "Partial") + "\n@@C f 2026-11-25T00:00:00+00:00\n" + ROW("R1.5", "Works")
        self.proven = hs.proven_since(log)   # reopened 24 Nov, Works again 25 Nov, after the 23 Nov "no"
        lines, _ = self.run_check("2026-11-26 09:00", self.NO)
        self.assertFalse([l for l in lines if "reopen" in l])

    def test_answer_lines_parse_lowercase_rows_and_bullets(self):
        a = hs.read_asks(ASKED + "answer: r1.4 YES (2026-11-23 12:00 IST)\n- answer: R1.5 no (2026-11-23 12:01 IST) — x\n")[-1]["answers"]
        self.assertEqual(sorted((r, v[0]) for r, v in a.items()), [("R1.4", "yes"), ("R1.5", "no")])

    def test_rows_proven_since_the_last_ask_count_as_new(self):
        # Ask on 30 Nov; the last ask was 19 Nov. R1.4 (Proven 20 Nov) is new since then; R1.5 was asked; R1.2/R1.3 (18 Nov) are older.
        self.assertEqual(hs.pick(self.proven, {"R1.5"}, I("2026-11-30 10:00"), "s", since=I("2026-11-19 10:05"))[1], 1)
        self.assertIn("R1.4", hs.pick(self.proven, {"R1.5"}, I("2026-11-30 10:00"), "s", since=I("2026-11-19 10:05"))[0])
        self.assertEqual(hs.pick(self.proven, {"R1.5"}, I("2026-11-30 10:00"), "s")[1], 0)   # a rolling 7 days would miss R1.4

    def test_nothing_left_to_sample_is_a_quiet_line(self):
        every = "".join(ASKED.replace("2026-11-23 10:05", f"2026-11-{d} 10:05").replace("R1.4", r1).replace("R1.5", r2) + f"answer: {r1} yes (2026-11-{d} 12:00 IST)\nanswer: {r2} yes (2026-11-{d} 12:00 IST)\n"
                        for d, r1, r2 in (("10", "R1.1", "R1.2"), ("16", "R1.3", "R1.4"), ("17", "R1.5", "R1.5")))
        lines, new = self.run_check("2026-11-30 10:00", every)
        self.assertIsNone(new); self.assertTrue(lines[0].startswith("warn  human sample due, but no Proven row is left"))

    def test_next_monday_ten_ist_is_due_again(self):
        self.assertEqual(len(self.run_check("2026-11-30 09:59", self.YES)[0]), 1)
        lines, new = self.run_check("2026-11-30 10:00", self.YES)
        self.assertTrue(lines[0].startswith("ACT   founder: human sample due ("))
        self.assertNotIn("R1.4 ", new.split("## Ask 2026-11-30")[1])   # a row asked before is not asked again

    def test_seven_days_after_the_last_answer_is_due_mid_week(self):
        ask = ASKED.replace("2026-11-23 10:05", "2026-11-19 10:05")   # a Thursday ask, answered that day
        text = ask + "answer: R1.4 yes (2026-11-19 12:00 IST)\nanswer: R1.5 yes (2026-11-19 12:00 IST)\n"
        self.assertTrue(self.run_check("2026-11-26 12:00", text)[0][0].startswith("ACT   founder: human sample due ("))


class OnGitHub(Base):
    """ENF-782b (P-557): an ask or answer counts only once GitHub has it (24 Nov: due 23 Nov 10:00 IST, on no branch)."""
    def check(self, now, text, pushed):
        return hs.check(I(now), text, self.proven, hs.rows(caps()), self.j, True, pushed)

    def test_an_ask_only_in_this_copy_is_a_red_not_on_github_act_every_check(self):
        lines, new = self.check("2026-11-24 09:00", ASKED, "")
        self.assertIsNone(new)
        self.assertTrue(lines[0].startswith("ACT   \033[31mNot on GitHub\033[0m: the 2026-11-23 10:05 IST ask (R1.4, R1.5) only in this copy"), lines)
        self.assertTrue(lines[1].startswith("ACT   founder: human sample due (R1.4, R1.5 unanswered"), lines)

    def test_an_ask_github_has_says_nothing_more(self):
        lines, _ = self.check("2026-11-24 09:00", ASKED, ASKED)
        self.assertFalse(any("Not on GitHub" in l for l in lines), lines)

    def test_an_answer_only_in_this_copy_is_named(self):
        lines, _ = self.check("2026-11-24 09:00", ASKED + "answer: R1.4 yes (2026-11-23 12:00 IST)\n", ASKED)
        self.assertIn("the answer for R1.4 (2026-11-23 10:05 IST ask) only in this copy", lines[0])

    def test_a_copy_behind_github_reads_github_and_never_asks_twice(self):
        lines, new = self.check("2026-11-24 09:00", "", ASKED)   # alone, an empty file is due and would write a new ask
        self.assertIsNone(new)
        self.assertTrue(lines[0].startswith("warn  this copy's product/qa/human-sample.md lacks the 2026-11-23 10:05 IST ask GitHub has"), lines)
        self.assertTrue(lines[1].startswith("ACT   founder: human sample due (R1.4, R1.5 unanswered"), lines)
        self.assertIsNotNone(hs.check(I("2026-11-24 09:00"), "", self.proven, hs.rows(caps()), self.j, True)[1])   # unchanged when GitHub is unknown

    def test_on_github_reads_the_upstream_or_origin_main_whichever_has_the_newest_ask(self):
        d = tempfile.mkdtemp(); g = lambda *a: subprocess.run(["git", "-C", d, "-c", "user.name=t", "-c", "user.email=t@t", *a], capture_output=True, text=True, check=True)
        g("init", "-q", "-b", "work"); g("remote", "add", "origin", d); write(os.path.join(d, "x.txt"), "x"); g("add", "."); g("commit", "-qm", "a")
        g("update-ref", "refs/remotes/origin/main", "HEAD")
        os.makedirs(os.path.join(d, "q")); write(os.path.join(d, "q", "hs.md"), ASKED); g("add", "."); g("commit", "-qm", "b")
        root = hs.ROOT; hs.ROOT = d
        try:
            self.assertEqual(hs.on_github("q/hs.md", "origin/main"), "")   # no upstream, main lacks it: not on GitHub
            g("update-ref", "refs/remotes/origin/work", "HEAD"); g("config", "branch.work.remote", "origin"); g("config", "branch.work.merge", "refs/heads/work")
            self.assertEqual(hs.on_github("q/hs.md", "origin/main"), ASKED)   # the pushed upstream has it
        finally:
            hs.ROOT = root


class Cli(Base):
    def test_answer_appends_a_line_and_refuses_a_row_not_asked(self):
        d = tempfile.mkdtemp(); f = os.path.join(d, "hs.md"); write(f, ASKED)
        tool = [sys.executable, "-I", os.path.join(HERE, "human-sample.py")]
        r = subprocess.run(tool + ["answer", "R1.5", "no", "filter", "missing", "--file", f, "--now", "2026-11-23T08:00:00"], capture_output=True, text=True)   # no zone = UTC
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertTrue(read(f).endswith("answer: R1.5 no (2026-11-23 13:30 IST) — filter missing\n"))
        self.assertNotEqual(subprocess.run(tool + ["answer", "R1.9", "yes", "--file", f], capture_output=True, text=True).returncode, 0)

    def test_check_exit_code_counts_act_lines(self):
        d = tempfile.mkdtemp(); f, lg, cp = (os.path.join(d, x) for x in ("hs.md", "log", "caps"))
        write(f, ASKED); write(lg, LOG); write(cp, caps())
        r = subprocess.run([sys.executable, "-I", os.path.join(HERE, "human-sample.py"), "check", "--file", f, "--caps-log", lg, "--caps", cp,
                            "--journeys", self.j, "--now", "2026-11-30T04:35:00Z"], capture_output=True, text=True)
        self.assertEqual(r.returncode, 2, r.stdout + r.stderr)   # due + Needs you

    def test_check_reads_github_s_file_and_counts_not_on_github(self):
        d = tempfile.mkdtemp(); f, lg, cp, gh = (os.path.join(d, x) for x in ("hs.md", "log", "caps", "gh.md"))
        write(f, ASKED); write(lg, LOG); write(cp, caps()); write(gh, "")
        r = subprocess.run([sys.executable, "-I", os.path.join(HERE, "human-sample.py"), "check", "--file", f, "--caps-log", lg, "--caps", cp, "--pushed", gh,
                            "--journeys", self.j, "--now", "2026-11-24T04:35:00Z"], capture_output=True, text=True)
        self.assertEqual(r.returncode, 2, r.stdout + r.stderr)   # Not on GitHub + due
        self.assertIn("Not on GitHub", r.stdout)
        self.assertTrue("on_github(os.path.relpath(os.path.abspath(a.file), ROOT), ref)" in open(os.path.join(HERE, "human-sample.py")).read())   # lead-watch's run (no --caps-log) reads GitHub


if __name__ == "__main__":
    r = unittest.main(exit=False, verbosity=1).result
    print(f"{'PASS' if r.wasSuccessful() else 'FAIL'} test_human_sample.py: {r.testsRun} tests, {len(r.failures) + len(r.errors)} failed")
    sys.exit(0 if r.wasSuccessful() else 1)
