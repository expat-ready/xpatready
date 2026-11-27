#!/usr/bin/env python3
"""LR-045 (bundle A5): refuse destructive or non-additive database migrations, and a migration stamped earlier than main's.

A migration this branch adds (prisma/migrations/<stamp>_<name>/migration.sql, new since the base) is read statement by
statement: comments, strings and $$ bodies are blanked, so a trigger body or a quoted '--' or ';' is not read as a statement.
A statement is judged by its first word, an ALTER TABLE clause by clause. Reported:
  * destructive: DROP TABLE / VIEW / SCHEMA / TYPE / DOMAIN / SEQUENCE / EXTENSION / OWNED, TRUNCATE, DELETE FROM, and
    ALTER TABLE ... DROP [COLUMN] (data gone). Not: DROP INDEX / CONSTRAINT / DEFAULT / NOT NULL, a BEFORE TRUNCATE trigger,
    REVOKE ... TRUNCATE (this repo's own protection);
  * non-additive: RENAME of a table, column or enum value, ALTER [COLUMN] ... TYPE, SET NOT NULL, SET SCHEMA, DISABLE ROW
    LEVEL SECURITY, ADD COLUMN ... NOT NULL with no DEFAULT (old code or old rows break). Not: ADD CONSTRAINT ... CHECK;
  * a stamp not later than the newest migration on the base (applied out of order, or skipped where main has run);
  * a change to, or removal of, a migration the base already has (history rewritten under a database that ran it).
A statement may carry a reviewed waiver: `-- destructive-ok: <reason of 3+ words>` on a line before it, or after its `;` on
the same line. It covers that whole statement (split an ALTER TABLE to waive one clause); one inside a statement waives
nothing. Known limits: dynamic SQL (EXECUTE in a body) and DROP FUNCTION / TRIGGER / POLICY are not read. Report-only in safety.yml at first (LR-045: warning before it refuses).
  python3 studio/tools/safety/migration-check.py [--base origin/main]   exit 1 when anything is reported
  python3 studio/tools/safety/migration-check.py --files a.sql b.sql    the statement rules only, on given files
  python3 studio/tools/safety/migration-check.py --self-test            planted good and bad migrations
"""
import os, re, subprocess, sys, tempfile

MIG = "ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio/prisma/migrations"
IDENT = r'(?:"(?:[^"]|"")*"|[A-Za-z_][\w$]*)'
QNAME = rf"{IDENT}(?:\s*\.\s*{IDENT})?"
# Whole statements, read from their first word (so a TRUNCATE trigger or a REVOKE ... TRUNCATE is not a TRUNCATE).
STATEMENT_RULES = [
    ("destructive", re.compile(r"^DROP\s+(TABLE|VIEW|MATERIALIZED\s+VIEW|SCHEMA|TYPE|DOMAIN|SEQUENCE|EXTENSION|OWNED)\b", re.I)),
    ("destructive", re.compile(r"^TRUNCATE\b", re.I)),
    ("destructive", re.compile(r"^DELETE\s+FROM\b", re.I)),
    ("non-additive", re.compile(r"^ALTER\s+TYPE\b.*\bRENAME\b", re.I | re.S)),
]
# The clauses of an ALTER TABLE, split at its top-level commas.
CLAUSE_RULES = [
    ("destructive", re.compile(r"^DROP\s+(?:COLUMN\s+)?(?:IF\s+EXISTS\s+)?(?!(?:CONSTRAINT|DEFAULT|NOT|INDEX|IDENTITY|EXPRESSION)\b)" + IDENT, re.I)),
    ("non-additive", re.compile(r"^RENAME\b(?!\s+CONSTRAINT\b)", re.I)),
    ("non-additive", re.compile(rf"^ALTER\s+(?:COLUMN\s+)?{IDENT}\s+(?:SET\s+DATA\s+)?TYPE\b", re.I)),
    ("non-additive", re.compile(r"\bSET\s+NOT\s+NULL\b", re.I)),
    ("non-additive", re.compile(r"^SET\s+SCHEMA\b", re.I)),
    ("non-additive", re.compile(r"^DISABLE\s+ROW\s+LEVEL\s+SECURITY\b", re.I)),
]
ADD_COLUMN = re.compile(rf"^ADD\s+(?:COLUMN\s+)?(?:IF\s+NOT\s+EXISTS\s+)?(?!(?:CONSTRAINT|PRIMARY|UNIQUE|FOREIGN|CHECK|EXCLUDE)\b){IDENT}\s", re.I)
ALTER_TABLE = re.compile(rf"^ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?{QNAME}\s*\*?\s*", re.I)
WAIVER = re.compile(r"destructive-ok:\s*(\S+\s+\S+\s+\S+)", re.I)
STAMP = re.compile(r"^(\d{14})_")
HOW = "make it additive (expand, backfill, contract in a later PR), or waive it on the line above: -- destructive-ok: <reason>"


def statements(sql):
    """(first line, statement with strings, $$ bodies and comments blanked, waived) for each statement. A waiver is a line
    comment `-- destructive-ok: <3+ words>` before the statement (only blank lines or comments between), or after its `;` on
    the same line; one inside a statement waives nothing. Strings, quoted names and $$ bodies are read whole, so a `;`,
    `--` or waiver inside them is text (dynamic SQL in a body is not read: a known limit)."""
    out, buf, i, n, line = [], [], 0, len(sql), 1
    start, pending, last_end = None, False, 0
    def flush():
        nonlocal buf, start, pending
        text = " ".join("".join(buf).split())
        if text:
            out.append([start, text, pending, line])
        buf, start, pending = [], None, False
    while i < n:
        c = sql[i]
        if c == "\n":
            line += 1; buf.append(" "); i += 1; continue
        if sql.startswith("--", i):
            j = sql.find("\n", i); j = n if j < 0 else j
            if WAIVER.search(sql[i:j]):
                if not "".join(buf).strip():
                    if out and out[-1][3] == line and last_end == line: out[-1][2] = True
                    else: pending = True
            i = j; continue
        if sql.startswith("/*", i):
            j = sql.find("*/", i + 2); j = n if j < 0 else j + 2
            line += sql.count("\n", i, j); buf.append(" "); i = j; continue
        if not "".join(buf).strip() and not c.isspace() and start is None:
            start = line
        if c in "'\"":
            j = i + 1
            while j < n and not (sql[j] == c and not sql.startswith(c * 2, j)):
                j += 2 if sql.startswith(c * 2, j) else 1
            line += sql.count("\n", i, j)
            buf.append(sql[i:j + 1] if c == '"' else "''"); i = j + 1; continue
        m = re.match(r"\$([A-Za-z_]\w*)?\$", sql[i:i + 64])
        if m:
            tag = m.group(0); j = sql.find(tag, i + len(tag)); j = n if j < 0 else j + len(tag)
            line += sql.count("\n", i, j); buf.append("$$ $$"); i = j; continue
        if c == ";":
            flush(); last_end = line; i += 1; continue
        buf.append(c); i += 1
    flush()
    return [(s, t, w) for s, t, w, _ in out]


def clauses(rest):
    out, depth, cur = [], 0, ""
    for ch in rest:
        depth += ch == "("; depth -= ch == ")"
        if ch == "," and depth == 0: out.append(cur.strip()); cur = ""
        else: cur += ch
    return out + [cur.strip()]


def check_sql(name, sql):
    found = []
    for line, text, waived in statements(sql):
        if waived:
            continue
        hit = next((k for k, rx in STATEMENT_RULES if rx.search(text)), None)
        m = ALTER_TABLE.match(text)
        if not hit and m:
            for cl in clauses(text[m.end():]):
                hit = next((k for k, rx in CLAUSE_RULES if rx.search(cl)), None)
                if not hit and ADD_COLUMN.search(cl) and re.search(r"\bNOT\s+NULL\b", cl, re.I) and not re.search(r"\b(DEFAULT|GENERATED)\b", cl, re.I):
                    hit = "non-additive"
                if hit:
                    break
        if hit:
            found.append(f"{hit} statement: {name}:{line}: {text[:140]} ({HOW})")
    return found


def git(*a, cwd=None):
    return subprocess.run(["git", "-c", "core.quotepath=off", *a], cwd=cwd, capture_output=True, text=True, check=True).stdout


def check_branch(base, cwd=None, mig=MIG):
    out = []
    cwd = cwd or git("rev-parse", "--show-toplevel").strip()   # the diff's path is read from the top, wherever it runs
    names = [x for x in git("ls-tree", "-z", "--name-only", f"{base}:{mig}", cwd=cwd).split("\0") if x]
    stamps = [m.group(1) for d in names if (m := STAMP.match(d))]
    newest = max(stamps) if stamps else ""
    parts = git("diff", "--name-status", "--no-renames", "-z", f"{base}...HEAD", "--", mig, cwd=cwd).split("\0")
    for status, path in zip(parts[0::2], parts[1::2]):   # -z: a name with any character comes through as it is
        rel = path[len(mig) + 1:]
        folder = rel.split("/", 1)[0]
        if "/" not in rel:
            continue   # migration_lock.toml and other files beside the folders are not migrations
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
        "drop with schema, IF EXISTS, CASCADE": 'ALTER TABLE ONLY "public"."Case" DROP COLUMN IF EXISTS "x" CASCADE;',
        "drop after a nullable add, one statement": 'ALTER TABLE "Case" ADD COLUMN "y" TEXT, DROP COLUMN "old";',
        "change type without COLUMN": 'ALTER TABLE "Case" ALTER "n" TYPE INTEGER;',
        "add decimal not null, no default": 'ALTER TABLE "Invoice" ADD COLUMN "total" DECIMAL(10,2) NOT NULL;',
        "drop hidden behind a quoted --": 'UPDATE "T" SET "x" = \'--\'; DROP TABLE "Case";',
        "waiver smuggled in a string": 'INSERT INTO "N" VALUES (\'-- destructive-ok: smuggled in a string\'); DROP TABLE "Case";',
        "block comments inside": 'ALTER TABLE "Case" /* x */ DROP /* y */ COLUMN "note";',
        "a ; in a default": 'ALTER TABLE "A" ADD COLUMN "s" TEXT DEFAULT \'x;y\', ADD COLUMN "t" TEXT NOT NULL;',
        "waiver inside an open statement does not carry over": 'ALTER TABLE "Case"\n  ADD COLUMN "y" TEXT,\n  -- destructive-ok: never shipped beyond local copies\n  DROP COLUMN "old";\nDROP TABLE "Answer";',
        "waiver with a short reason": '-- destructive-ok: fine\nDROP TABLE "T";',
    }
    good = {
        "create table with NOT NULL": 'CREATE TABLE "T" ("id" TEXT NOT NULL, CONSTRAINT "T_pkey" PRIMARY KEY ("id"));',
        "add nullable column": 'ALTER TABLE "Case" ADD COLUMN "note" TEXT;',
        "add not null with default": 'ALTER TABLE "Case" ADD COLUMN "n" INTEGER NOT NULL DEFAULT 0;',
        "index and foreign key": 'CREATE INDEX "i" ON "T"("a");\nALTER TABLE "T" ADD CONSTRAINT "f" FOREIGN KEY ("a") REFERENCES "U"("id");',
        "drop constraint and index (prisma re-creates)": 'ALTER TABLE "T" DROP CONSTRAINT "f";\nDROP INDEX "i";',
        "truncate guard trigger and revoke": 'CREATE TRIGGER "t_no_truncate" BEFORE TRUNCATE ON "t" FOR EACH STATEMENT EXECUTE FUNCTION f();\nREVOKE DELETE, TRUNCATE ON "t" FROM xr_data;',
        "check constraint naming NOT NULL": 'ALTER TABLE "x" ADD CONSTRAINT "c" CHECK ("a" IS NOT NULL);',
        "delete inside a trigger body": 'CREATE FUNCTION f() RETURNS trigger AS $$ BEGIN IF TG_OP = \'DELETE\' THEN DELETE FROM idx WHERE id = OLD.id; END IF; RETURN NULL; END; $$ LANGUAGE plpgsql;',
        "decimal not null with default": 'ALTER TABLE "I" ADD COLUMN "t" DECIMAL(65,30) NOT NULL DEFAULT 0;',
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
