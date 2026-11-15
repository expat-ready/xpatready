#!/usr/bin/env python3
"""Unit tests for tools/trace-requirements.py (TR-1, P-595). Standard library unittest only.
Fixture: tools/fixtures/trace/ (synthetic module AG-90, invented text). Records (BACKLOG, checklist, decisions,
capabilities, seed) are written per test into a temporary folder.
Run: python3 -m unittest product/tools/test_trace_requirements.py   (or: python3 product/tools/test_trace_requirements.py)"""
import contextlib, hashlib, importlib.util, io, os, shutil, tempfile, unittest

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("trace_requirements", os.path.join(HERE, "trace-requirements.py"))
tr = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tr)
FIX = os.path.join(HERE, "fixtures", "trace")
OLD, NEW = os.path.join(FIX, "snap-old"), os.path.join(FIX, "snap-new")

CHECKLIST = """# Checklist (fixture)

## A. Scope to build

### A. Foundations
| Map | Capability | Module | BACKLOG rows | Status |
|---|---|---|---|---|
| 1 | Widgets | Platform | FO-90 | Shaped |
| 2 | Gadgets | Platform | FO-91 | Not shaped (only named) |
| 3 | Levers | Platform | **none yet** | Not shaped (**gap**) |
| 4 | Sprockets | Platform | FO-93 | Shaped |

### Flags
Some flag text.

---

## B. Done for one row
"""
DECISIONS = """| # | Date | Decision |
|---|---|---|
| P-900 | 1 Jan | A widget decision. |
| P-901 | 1 Jan | **Sample ruling.** We deviate from AG-90-2 for this fixture. |
| P-902 | 1 Jan | ~~**An old ruling.**~~ Superseded by P-900. |
"""
CAPS = """| # | Step | Capability | M | Status |
|---|---|---|---|---|
| C9.1 | 9 Test | Widgets work (row FO-90) | R1 | Works |
| C9.2 | 9 Test | Something else (row FO-99) | R1 | Works |
"""


def snap(path):
    return tr.Snapshot(path)


def h(path, rid):
    return snap(path).reqs[rid]["hash"]


def backlog(rows):
    head = ("# Backlog (fixture)\n\n## Rows\n\n| # | Area | Item | Done when (beyond the standard) | Source · waits on · decisions |\n"
            "|---|---|---|---|---|\n")
    return head + "\n".join(rows) + "\n"


class Records:
    """A temporary folder with BACKLOG.md, MVP-CHECKLIST.md, DECISIONS.md, CAPABILITIES.md and a seed file."""
    def __init__(self, rows, seed="row\tref\thash\n", checklist=CHECKLIST, snapshot=NEW):
        self.d = tempfile.mkdtemp(prefix="trace-test-")
        self.files = {"backlog": backlog(rows), "checklist": checklist, "decisions": DECISIONS, "capabilities": CAPS,
                      "seed": seed}
        for k, v in self.files.items():
            with open(self.p(k), "w", encoding="utf-8") as fh:
                fh.write(v)
        self.snapshot = snapshot

    def p(self, k):
        return os.path.join(self.d, k + ".md")

    def args(self, *extra):
        return ["--backlog", self.p("backlog"), "--checklist", self.p("checklist"), "--decisions", self.p("decisions"),
                "--capabilities", self.p("capabilities"), "--seed", self.p("seed"), "--snapshot", self.snapshot, *extra]

    def run(self, *extra):
        out = io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(io.StringIO()):
            rc = tr.main(self.args(*extra))
        return rc, out.getvalue()

    def read(self, k):
        with open(self.p(k), encoding="utf-8") as fh:
            return fh.read()

    def close(self):
        shutil.rmtree(self.d, ignore_errors=True)


class HashTests(unittest.TestCase):
    def test_hash_is_pinned_sha256_of_collapsed_text(self):
        self.assertEqual(tr.content_hash("a  b\n\t c "), hashlib.sha256(b"a b c").hexdigest()[:8])

    def test_hash_ignores_whitespace_but_not_words(self):
        self.assertEqual(tr.content_hash("The widget SHALL be blue."), tr.content_hash("The  widget\nSHALL be blue.  "))
        self.assertNotEqual(tr.content_hash("The widget SHALL be blue."), tr.content_hash("The widget SHALL be red."))

    def test_hash_leaves_out_the_own_id_so_a_renumbered_text_keeps_it(self):
        self.assertEqual(h(OLD, "AG-90-3"), h(NEW, "AG-90-60"))

    def test_whitespace_only_edit_keeps_the_hash(self):
        self.assertEqual(h(OLD, "AG-90-1"), h(NEW, "AG-90-1"))


class ParseTests(unittest.TestCase):
    def setUp(self):
        self.s = snap(OLD)

    def test_list_item_beats_table_row_and_takes_its_indented_lines(self):
        r = self.s.reqs["AG-90-1"]
        self.assertEqual(r["kind"], "bullet")
        self.assertIn("second, indented line", r["text"])
        self.assertNotIn("AG-90-2", r["text"])

    def test_change_log_lines_are_not_definitions(self):
        self.assertGreater(self.s.reqs["AG-90-1"]["line"], 3)

    def test_heading_block_runs_to_the_next_heading_of_its_level_and_is_shared(self):
        a, b = self.s.reqs["AG-90-10"], self.s.reqs["AG-90-11"]
        self.assertEqual((a["kind"], a["line"], a["hash"]), (b["kind"], b["line"], b["hash"]))
        self.assertIn("Nested detail", a["text"])
        self.assertNotIn("Twelve", a["text"])

    def test_range_heading_gives_every_id(self):
        for rid in ("AG-90-40", "AG-90-41", "AG-90-42"):
            self.assertEqual(self.s.reqs[rid]["kind"], "heading")

    def test_table_only_definition_and_withdrawn_flag(self):
        self.assertEqual(self.s.reqs["AG-90-20"]["kind"], "table")
        self.assertTrue(self.s.reqs["AG-90-4"]["withdrawn"])
        self.assertFalse(self.s.reqs["AG-90-1"]["withdrawn"])

    def test_only_the_versioned_module_file_is_a_home(self):
        n = snap(NEW)
        self.assertNotIn("AG-90-99", n.reqs)
        self.assertNotIn("decoy", n.reqs["AG-90-1"]["text"])


class RefreshTests(unittest.TestCase):
    def setUp(self):
        self.d = tr.compare(snap(OLD), snap(NEW))

    def test_renumbered_with_the_same_text(self):
        self.assertIn(("AG-90-3", "AG-90-60", "same text"), self.d["renumbered"])

    def test_renumbered_with_a_small_text_change(self):
        hit = [t for t in self.d["renumbered"] if t[0] == "AG-90-50"]
        self.assertEqual(len(hit), 1)
        self.assertEqual(hit[0][1], "AG-90-61")
        self.assertIn("alike", hit[0][2])

    def test_changed_added_removed(self):
        self.assertEqual(self.d["changed"], ["AG-90-2"])
        self.assertEqual(self.d["added"], ["AG-90-70"])
        self.assertEqual(self.d["removed"], ["AG-90-12"])

    def test_refresh_lists_the_rows_each_change_hits(self):
        rec = Records([f"| FO-90 | runtime | Widget | a test | Source: AG-90-2#{h(OLD, 'AG-90-2')}, AG-90-12#{h(OLD, 'AG-90-12')} |"],
                      snapshot=OLD)
        try:
            rc, out = rec.run("--refresh", OLD, NEW)
            self.assertEqual(rc, 0)
            self.assertIn("added 1 · removed 1 · renumbered 2 · changed 1", out)
            self.assertIn("AG-90-12 -> rows FO-90", out)
            self.assertRegex(out, r"AG-90-2 #\w+ -> #\w+ -> rows FO-90")
        finally:
            rec.close()


class SourceTests(unittest.TestCase):
    def test_source_items(self):
        refs = tr.merge_official_dates(tr.parse_source(
            "AG-90-1#0123abcd, P-900; official: canada.ca/example p.2, 2026-11-01; deviates AG-90-2 by P-901; AG-90-3; ???"))
        kinds = [r["kind"] for r in refs]
        self.assertEqual(kinds, ["team", "decision", "official", "deviates", "team", "unknown"])
        self.assertEqual(refs[0]["hash"], "0123abcd")
        self.assertTrue(refs[2]["dated"])
        self.assertIsNone(refs[4]["hash"])

    def test_backlog_rows_shaped_amendments_and_backticked_mentions(self):
        rows = tr.parse_backlog(backlog([
            "| FO-90 | runtime | Widget with `A | B` in code | a test | Source: P-900 · waits on nothing |",
            "| FO-90 (rev 2 amendment) | runtime | amend | as FO-90 | Source: P-902 |",
            "| FO-91 | runtime | Named only |  | waits on nothing |",
            "| FO-92 | runtime | Copied | as FO-90 | |",
            "| TR-9 | tooling | builds the `Source:` field | a test | P-595 |"]))
        self.assertTrue(rows["FO-90"]["shaped"])
        self.assertFalse(rows["FO-91"]["shaped"])
        self.assertFalse(rows["FO-92"]["shaped"])
        self.assertNotIn("FO-90 (rev 2 amendment)", rows)
        src = tr.row_sources(rows, {})
        self.assertEqual([r["id"] for r in src["FO-90"]], ["P-900", "P-902"])
        self.assertNotIn("TR-9", src)


class CommandTests(unittest.TestCase):
    def rows(self, fo91_source=""):
        n = NEW
        return [f"| FO-90 | runtime | Widget | blue test | Source: AG-90-1#{h(n, 'AG-90-1')}, AG-90-2#{h(OLD, 'AG-90-2')}, P-900 |",
                f"| FO-91 | runtime | Gadget | a test | {fo91_source} |",
                f"| FO-93 | runtime | Sprocket | a test | Source: AG-90-10#{h(n, 'AG-90-10')}, P-902; deviates AG-90-70 by P-901 |"]

    def test_brief_prints_only_the_rows_text_and_flags_a_changed_hash(self):
        rec = Records(self.rows())
        try:
            rc, out = rec.run("--brief", "FO-90")
            self.assertEqual(rc, 1)                       # AG-90-2 changed since mapped
            self.assertIn(tr.BRIEF_LINE, out)
            self.assertIn("The widget  SHALL be blue.", out)
            self.assertIn("CHANGED since mapped", out)
            self.assertIn("A widget decision.", out)
            self.assertNotIn("gadget", out.lower())
            self.assertNotIn("Shared heading block", out)
            rc, out = rec.run("--brief", "FO-93")
            self.assertIn("Nested detail", out)
            self.assertIn("deviated from by P-901", out)
        finally:
            rec.close()

    def test_brief_reads_the_seed_file(self):
        rec = Records([], seed=f"row\tref\thash\nFO-91\tAG-90-60\t{h(NEW, 'AG-90-60')}\n")
        try:
            rc, out = rec.run("--brief", "FO-91")
            self.assertEqual(rc, 0)
            self.assertIn("hum quietly", out)
        finally:
            rec.close()

    def test_gaps(self):
        rec = Records(self.rows())
        try:
            rc, out = rec.run("--gaps")
            self.assertEqual(rc, 0)
            self.assertIn("checklist rows not shaped (unmapped): 2", out)
            self.assertIn("map 2: Gadgets", out)
            self.assertIn("map 3: Levers", out)
            sec1 = out.split("## 1.")[1].split("## 2.")[0]
            self.assertIn("FO-91", sec1)
            self.assertNotIn("FO-90", sec1)
            self.assertIn("FO-90 follows AG-90-2, but P-901 deviates from it", out)
            self.assertIn("FO-93 deviates from AG-90-70 by P-901", out)
            self.assertIn("FO-93 cites P-902, which is struck through", out)
            self.assertIn("FO-90: AG-90-2 hash", out)
            self.assertRegex(out, r"AG-90: \d+ of \d+ not covered: .*AG-90-60")
            self.assertNotRegex(out, r"not covered: .*AG-90-11\b")   # shares FO-93's cited block
            self.assertNotRegex(out, r"not covered: .*AG-90-4\b")    # withdrawn
        finally:
            rec.close()

    def test_render_twice_gives_no_diff_and_stays_out_of_the_hand_tables(self):
        rec = Records(self.rows())
        try:
            self.assertEqual(rec.run("--render")[0], 0)
            once = rec.read("checklist")
            self.assertEqual(rec.run("--render")[0], 0)
            self.assertEqual(rec.read("checklist"), once)
            self.assertEqual(rec.run("--render", "--check")[0], 0)
            self.assertEqual(once.count(tr.BEGIN), 1)
            self.assertLess(once.index(tr.END), once.index("### Flags"))
            self.assertIn("| 1 | Widgets | AG-90-1, AG-90-2 (changed), P-900 | Shaped | FO-90 | C9.1 |", once)
            self.assertIn("| 3 | Levers | no row | Not shaped | none | none yet |", once)
            self.assertEqual(len(tr.parse_checklist(once)), 4)      # the generated rows are never read as hand rows
            with open(rec.p("backlog"), "a", encoding="utf-8") as fh:
                fh.write("| UX-9 | screens | Not Release 1 | a test | Source: P-900 |\n")
            self.assertEqual(rec.run("--render", "--check")[0], 0)   # outside Release 1: block unchanged
            rows = self.rows()
            rows[0] = rows[0].replace(", P-900 |", " |")
            with open(rec.p("backlog"), "w", encoding="utf-8") as fh:
                fh.write(backlog(rows))
            self.assertEqual(rec.run("--render", "--check")[0], 1)
        finally:
            rec.close()

    def test_render_keeps_the_cockpit_parsers_counts(self):
        def load(name, f):
            s = importlib.util.spec_from_file_location(name, os.path.join(HERE, f))
            m = importlib.util.module_from_spec(s)
            s.loader.exec_module(m)
            return m
        try:
            cd, cr = load("cockpit_data_t", "cockpit-data.py"), load("cockpit_reconcile_t", "cockpit-reconcile.py")
        except ImportError as e:                         # pragma: no cover
            self.skipTest(f"cockpit tools need {e}")
        rec = Records(self.rows())
        try:
            before = (len(cd.parse_checklist(CHECKLIST)["rows"]), len(cr.parse_checklist(CHECKLIST)[0]))
            rec.run("--render")
            after_text = rec.read("checklist")
            after = (len(cd.parse_checklist(after_text)["rows"]), len(cr.parse_checklist(after_text)[0]))
            self.assertEqual(before, after)
            self.assertEqual(cd.parse_checklist(after_text)["dupes"], [])
        finally:
            rec.close()

    def test_ci_fails_a_new_shaped_row_without_source_and_passes_with_one(self):
        rec = Records(self.rows())
        try:
            base = os.path.join(rec.d, "base.md")
            with open(base, "w", encoding="utf-8") as fh:
                fh.write(backlog(self.rows()))
            with open(rec.p("backlog"), "a", encoding="utf-8") as fh:
                fh.write("| FO-95 | runtime | New shaped row | a test | waits on nothing |\n"
                         "| FO-96 | runtime | New unshaped row |  | waits on nothing |\n")
            rc, out = rec.run("--ci", base)
            self.assertEqual(rc, 1)
            self.assertIn("FO-95", out)
            self.assertNotIn("row FO-96", out)
            with open(rec.p("backlog"), "w", encoding="utf-8") as fh:
                fh.write(backlog(self.rows() + ["| FO-95 | runtime | New shaped row | a test | Source: P-900 · waits on nothing |"]))
            rc, out = rec.run("--ci", base)
            self.assertEqual(rc, 0)
            self.assertIn("every new shaped Release 1 row has a Source", out)
        finally:
            rec.close()

    def test_ci_ignores_rows_outside_release_1_and_existing_rows(self):
        rec = Records(self.rows())             # FO-91 is shaped with no Source, but it was there at the base
        try:
            base = os.path.join(rec.d, "base.md")
            with open(base, "w", encoding="utf-8") as fh:
                fh.write(backlog(self.rows()))
            with open(rec.p("backlog"), "a", encoding="utf-8") as fh:
                fh.write("| UX-9 | screens | Not a Release 1 module | a test | |\n")
            self.assertEqual(rec.run("--ci", base)[0], 0)
        finally:
            rec.close()

    def test_hash_command(self):
        rec = Records([])
        try:
            rc, out = rec.run("--hash", "AG-90-1", "AG-90-999")
            self.assertEqual(rc, 1)
            self.assertIn(f"AG-90-1#{h(NEW, 'AG-90-1')}", out)
            self.assertIn("AG-90-999\tNOT FOUND", out)
        finally:
            rec.close()


if __name__ == "__main__":
    unittest.main()
