#!/usr/bin/env python3
"""LR-045 (bundle A5): refuse destructive or non-additive database migrations, and a migration stamped earlier than main's.

A migration this branch adds (prisma/migrations/<stamp>_<name>/migration.sql, new since the base) is read statement by
statement, comments left out. Reported:
  * destructive: DROP TABLE / COLUMN / TYPE / SCHEMA / VIEW, TRUNCATE, DELETE FROM (data gone);
  * non-additive: RENAME of a table, column or enum value, ALTER COLUMN ... TYPE, SET NOT NULL, ADD COLUMN ... NOT NULL with no DEFAULT
    (old code or old rows break);
  * a stamp not later than the newest migration on the base (applied out of order, or skipped where main has run);
  * a change to, or removal of, a migration the base already has (history rewritten under a database that ran it).
A statement may carry a reviewed waiver on the line above it or its own line: `-- destructive-ok: <reason>` (a reason of
at least three words). Report-only in safety.yml at first (LR-045: warning before it refuses).
  python3 studio/tools/safety/migration-check.py [--base origin/main]   exit 1 when anything is reported
  python3 studio/tools/safety/migration-check.py --files a.sql b.sql    the statement rules only, on given files
  python3 studio/tools/safety/migration-check.py --self-test            planted good and bad migrations
"""
import os, re, subprocess, sys, tempfile

MIG = "ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio/prisma/migrations"
RULES = [
    ("destructive", re.compile(r"\bDROP\s+(TABLE|COLUMN|TYPE|SCHEMA|VIEW|MATERIALIZED\s+VIEW)\b", re.I)),
    ("destructive", re.compile(r"\bALTER\s+TABLE\b[^;]*\bDROP\s+(?!CONSTRAINT|DEFAULT|NOT\s+NULL|INDEX)\"?\w", re.I)),   # ALTER TABLE t DROP "col" (COLUMN is optional in Postgres)
    ("destructive", re.compile(r"\bTRUNCATE\b", re.I)),
    ("destructive", re.compile(r"\bDELETE\s+FROM\b", re.I)),
    ("non-additive", re.compile(r"\bALTER\s+(TABLE|TYPE)\b[^;]*\bRENAME\b(?!\s+CONSTRAINT)", re.I)),   # an index or constraint rename is harmless
    ("non-additive", re.compile(r"\bALTER\s+COLUMN\s+\"?\w+\"?\s+(SET\s+DATA\s+)?TYPE\b", re.I)),
    ("non-additive", re.compile(r"\bSET\s+NOT\s+NULL\b", re.I)),
]
ADD_NOT_NULL = re.compile(r"\bADD\s+(COLUMN\s+)?(?:IF\s+NOT\s+EXISTS\s+)?\"?\w+\"?[^,;]*?\bNOT\s+NULL\b(?![^,;]*\bDEFAULT\b)", re.I)
WAIVER = re.compile(r"--\s*destructive-ok:\s*(\S+\s+\S+\s+\S+.*)$", re.I)
STAMP = re.compile(r"^(\d{14})_")


def statements(sql):
    """(first line number, text without comments, waived) for each statement."""
    out, buf, start, waived, pending = [], [], None, False, False
    for n, line in enumerate(sql.splitlines(), 1):
        w = bool(WAIVER.search(line))
        code = line.split("--", 1)[0]
        if not code.strip():
            pending = pending or w
            continue
        if start is None:
            start, waived = n, pending or w
            pending = False
        else:
            waived = waived or w
        while ";" in code:
            head, code = code.split(";", 1)
            buf.append(head)
            out.append((start, " ".join(buf), waived))
            buf, start, waived = [], (n if code.strip() else None), False
        if code.strip():
            buf.append(code)
    if buf and "".join(buf).strip():
        out.append((start, " ".join(buf), waived))
    return out


def check_sql(name, sql):
    found = []
    for line, text, waived in statements(sql):
        if waived:
            continue
        hits = [kind for kind, rx in RULES if rx.search(text)]
        if re.search(r"\bALTER\s+TABLE\b", text, re.I) and ADD_NOT_NULL.search(text):
            hits.append("non-additive")
        if hits:
            found.append(f"{hits[0]} statement: {name}:{line}: {' '.join(text.split())[:140]}")
    return found


def git(*a, cwd=None):
    return subprocess.run(["git", *a], cwd=cwd, capture_output=True, text=True, check=True).stdout


def check_branch(base, cwd=None, mig=MIG):
    out = []
    cwd = cwd or git("rev-parse", "--show-toplevel").strip()   # the diff's path is read from the top, wherever it runs
    names = git("ls-tree", "--name-only", f"{base}:{mig}", cwd=cwd).split()
    stamps = [m.group(1) for d in names if (m := STAMP.match(d))]
    newest = max(stamps) if stamps else ""
    for row in git("diff", "--name-status", "--no-renames", f"{base}...HEAD", "--", mig, cwd=cwd).splitlines():
        status, path = row.split("\t", 1)
        rel = path[len(mig) + 1:]
        folder = rel.split("/", 1)[0]
        if status != "A":
            if folder in names:
                out.append(f"history rewritten: {path} ({'removed' if status == 'D' else 'changed'}; a database may have run it)")
            continue
        if not path.endswith("/migration.sql"):
            continue
        m = STAMP.match(folder)
        if not m:
            out.append(f"no stamp: {folder} (expected <14 digits>_<name>)")
        elif m.group(1) <= newest:
            out.append(f"stamp not later than the base: {folder} <= {newest} (re-stamp it after main's newest)")
        with open(os.path.join(cwd or ".", path), encoding="utf-8") as f:
            out += check_sql(path, f.read())
    return out


def self_test():
    fails = 0

    def ok(name, cond, detail=None):
        nonlocal fails
        fails += 0 if cond else 1
        print(f"{'PASS' if cond else 'FAIL'}  {name}" + (f" — {detail}" if detail is not None else ""))

    bad = {
        "drop column": 'ALTER TABLE "Case" DROP COLUMN "note";',
        "drop column without COLUMN": 'ALTER TABLE "Case" DROP "note";',
        "drop table, lower case": "drop table case_old;",
        "truncate": 'TRUNCATE "Answer";',
        "delete": "DELETE FROM \"Answer\" WHERE true;",
        "rename table": 'ALTER TABLE "A" RENAME TO "B";',
        "rename an enum value": 'ALTER TYPE "S" RENAME VALUE \'a\' TO \'b\';',
        "rename column": 'ALTER TABLE "Case" RENAME COLUMN "a" TO "b";',
        "change type": 'ALTER TABLE "Case" ALTER COLUMN "n" SET DATA TYPE INTEGER;',
        "set not null": 'ALTER TABLE "Case" ALTER COLUMN "firmId" SET NOT NULL;',
        "add not null, no default": 'ALTER TABLE "Case" ADD COLUMN "firmId" TEXT NOT NULL;',
        "drop over two lines": 'ALTER TABLE "Case"\n  DROP COLUMN "x";',
        "waiver with a short reason": '-- destructive-ok: fine\nDROP TABLE "T";',
    }
    good = {
        "create table with NOT NULL": 'CREATE TABLE "T" ("id" TEXT NOT NULL, CONSTRAINT "T_pkey" PRIMARY KEY ("id"));',
        "add nullable column": 'ALTER TABLE "Case" ADD COLUMN "note" TEXT;',
        "add not null with default": 'ALTER TABLE "Case" ADD COLUMN "n" INTEGER NOT NULL DEFAULT 0;',
        "index and foreign key": 'CREATE INDEX "i" ON "T"("a");\nALTER TABLE "T" ADD CONSTRAINT "f" FOREIGN KEY ("a") REFERENCES "U"("id");',
        "drop constraint and index (prisma re-creates)": 'ALTER TABLE "T" DROP CONSTRAINT "f";\nDROP INDEX "i";',
        "rename an index or a constraint": 'ALTER INDEX "a" RENAME TO "b";\nALTER TABLE "T" RENAME CONSTRAINT "c" TO "d";',
        "drop default": 'ALTER TABLE "T" ALTER COLUMN "a" DROP DEFAULT;',
        "a DROP only in a comment": '-- DROP TABLE "T" was considered\nCREATE TABLE "U" ("id" TEXT);',
        "waived drop": '-- destructive-ok: table never shipped beyond local copies\nDROP TABLE "Scratch";',
        "waiver on the same line": 'DROP TABLE "Scratch"; -- destructive-ok: never shipped beyond local copies',
    }
    for k, sql in bad.items():
        ok(f"MC1 bad caught: {k}", len(check_sql(k, sql)) >= 1, check_sql(k, sql))
    for k, sql in good.items():
        ok(f"MC2 good passes: {k}", check_sql(k, sql) == [], check_sql(k, sql))
    ok("MC3 a waiver covers only its own statement", len(check_sql("w", '-- destructive-ok: never shipped beyond local copies\nDROP TABLE "A";\nDROP TABLE "B";')) == 1)

    # MC4-MC7 on a throwaway repository: a new destructive migration, an early stamp, a changed old one, a clean one.
    with tempfile.TemporaryDirectory() as d:
        mig = "m"
        def write(folder, sql):
            os.makedirs(os.path.join(d, mig, folder), exist_ok=True)
            with open(os.path.join(d, mig, folder, "migration.sql"), "w") as f:
                f.write(sql)
        g = lambda *a: git(*a, cwd=d)
        g("init", "-q", "-b", "main"); g("config", "user.email", "t@t"); g("config", "user.name", "t")
        write("20261101000000_a", 'CREATE TABLE "A" ("id" TEXT);')
        write("20261110000000_b", 'CREATE TABLE "B" ("id" TEXT);')
        g("add", "."); g("commit", "-qm", "base")
        g("checkout", "-qb", "clean")
        write("20261120000000_c", 'ALTER TABLE "A" ADD COLUMN "n" TEXT;')
        g("add", "."); g("commit", "-qm", "c")
        r = check_branch("main", d, mig)
        ok("MC4 a clean additive migration after main's newest passes", r == [], r)
        g("checkout", "-qb", "dirty", "main")
        write("20261105000000_early", 'ALTER TABLE "A" DROP COLUMN "id";')
        write("20261101000000_a", 'CREATE TABLE "A" ("id" TEXT, "x" TEXT);')
        g("add", "."); g("commit", "-qm", "d")
        r = check_branch("main", d, mig)
        ok("MC5 a new DROP COLUMN migration is caught", any(x.startswith("destructive") for x in r), r)
        ok("MC6 a stamp earlier than main's newest is caught", any(x.startswith("stamp not later") for x in r), r)
        ok("MC7 a change to a migration main has is caught", any(x.startswith("history rewritten") for x in r), r)
    ok("MC8 the real migrations on the base read without error", isinstance(check_branch("HEAD"), list))
    print(f"migration-check self-test: {fails} failed" if fails else "migration-check self-test: all passed")
    return 1 if fails else 0


def main(argv):
    if argv[:1] == ["--self-test"]:
        return self_test()
    if argv[:1] == ["--files"]:
        found = []
        for p in argv[1:]:
            with open(p, encoding="utf-8") as f:
                found += check_sql(p, f.read())
    else:
        base = argv[argv.index("--base") + 1] if "--base" in argv else "origin/main"
        top = git("rev-parse", "--show-toplevel").strip()
        found = check_branch(base, top)
    for x in found:
        print(f"::warning::{x}")
    print(f"migration-check: {len(found)} reported")
    return 1 if found else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
