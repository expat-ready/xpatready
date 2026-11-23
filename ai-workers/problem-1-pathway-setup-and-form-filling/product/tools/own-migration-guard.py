#!/usr/bin/env python3
"""Own-migration guard (Lead 5's ruling on #2915 and #3035, 23 Nov; BACKLOG rule "a row's migration test measures right
after its own migration (apply up to and including it, check, then apply the rest), and never assumes its migration
is the newest of all").

Why: with one Mergify migration slot per area (SPD-2, #3035), two areas' migrations are tested side by side, not on
top of each other. A suite that snapshots the database catalogue before its own migration and compares it with a read
taken AFTER the later migrations sees the other area's objects as its own and fails on main. This happened in merge
batches at least three times since 16 Nov (adcf9c105, 2cd4d9cd1, 7109eb3ae; #2915).

What it refuses, in a test that names its own migration (const NEW = "<stamp>_<name>") and applies the later ones
(a filter "x > NEW" or "x >= NEW" that is not only reading migration text):
  a catalogue reader (a function whose body queries pg_proc, pg_policy/pg_policies, pg_trigger, pg_class,
  pg_attribute, pg_constraint, pg_index/pg_indexes, pg_views, pg_type, pg_enum, pg_namespace, pg_roles, pg_depend or
  information_schema) that is called both before that line and after it, on a database the later migrations went
  to (psql(X, …) on the loop's line; when the loop names none, every call counts). The before-call is a snapshot; the
  after-call then holds every later migration's objects too, so the comparison is not about this migration alone.
  Fix: take the second read before the later migrations are applied (as adcf9c105 did), or, when the read after is
  a rule every table must keep whatever migration added it (a whole-catalogue invariant, which should fail on main if
  another area breaks it), mark that call with a comment "own-migration: whole catalogue (<reason>)" on its line or
  the line above; a read limited to this area's own tables (another area's migration cannot change them, and one of
  this area waits in the same Mergify slot) is marked "own-migration: ok (<reason>)".

Static reading of the test's text only: no database, no network, US$0. Exit 0 clean, 1 refused (each names the file,
the lines and the fix), 2 could not run.
  python3 -I own-migration-guard.py [<test file or folder>...]     default: prototype/studio/tests
Test: product/tools/check-own-migration-guard.sh."""
import os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT = os.path.normpath(os.path.join(HERE, "..", "..", "prototype", "studio", "tests"))
CAT = re.compile(r"\b(pg_proc|pg_polic(?:y|ies)|pg_trigger|pg_class|pg_attribute|pg_constraint|pg_index(?:es)?|pg_views|"
                 r"pg_type|pg_enum|pg_namespace|pg_roles|pg_depend|information_schema)\b")
NEWC = re.compile(r'\bconst\s+([A-Z][A-Z0-9_]*)\s*=\s*["\'](\d{14}_[A-Za-z0-9_-]+)["\']')
DEF = re.compile(r"(?:\bfunction\s+([A-Za-z_]\w*)\s*\(|\b(?:const|let)\s+([A-Za-z_]\w*)\s*=\s*(?:async\s*)?(?:\([^()]*\)|[A-Za-z_]\w*)\s*(?::[^=]+)?=>)")
MARK = re.compile(r"own-migration:\s*(whole catalogue|ok)\b", re.I)


def body(text, start):
    """The function's body from its definition at start: braces matched, or an arrow body to the end of its statement."""
    i = text.find("{", start); semi = text.find(";\n", start)
    if i < 0 or (0 <= semi < i):
        return text[start:semi if semi >= 0 else len(text)]
    depth = 0
    for j in range(i, len(text)):
        c = text[j]
        if c == "{": depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0: return text[start:j + 1]
    return text[start:]


def scan(path):
    text = open(path, encoding="utf-8").read()
    lines = text.split("\n")
    out = []
    for name, _stamp in NEWC.findall(text):
        later = re.compile(r"filter\(\s*\(?\s*(\w+)\s*\)?\s*=>\s*\1\s*>=?\s*" + re.escape(name) + r"\s*\)")
        loop = next((i for i, l in enumerate(lines) if later.search(l) and "readFileSync" not in l and "matchAll" not in l), None)
        if loop is None: continue
        # The databases the later migrations go to: psql(X, …), psql(urlOf(X), …) or "for (const db of [X, Y])" on the
        # loop's line or the next. None read (file(), apply(d), migrate(d)): every call counts (fails closed).
        near = lines[loop]
        if not re.search(r"\bpsql\(|of\s*\[", near) and loop + 1 < len(lines): near += "\n" + lines[loop + 1]   # body on the next line
        dbs = set(re.findall(r"\bpsql\(\s*(?:urlOf\(\s*)?([A-Za-z_]\w*)", near))
        for grp in re.findall(r"of\s*\[([^\]]*)\]", near): dbs |= set(re.findall(r"[A-Za-z_]\w*", grp))
        # A database that takes every migration ("for (const d of all) psql(X, …)") after the snapshot holds the later
        # ones too (FO-7ts part 3's rollback copy).
        for i in range(loop, len(lines)):
            if re.search(r"\bof\s+(?:all|ALL)\s*\)", lines[i]):
                dbs |= set(re.findall(r"\bpsql\(\s*(?:urlOf\(\s*)?([A-Za-z_]\w*)", lines[i]))
        dbs.discard("db"); dbs.discard("d")
        readers = set()
        for m in DEF.finditer(text):
            fn = m.group(1) or m.group(2)
            if CAT.search(body(text, m.start())): readers.add(fn)
        for fn in sorted(readers):
            call = re.compile(r"(?<![\w.])" + re.escape(fn) + r"\(")   # a call, not the word in prose ("role (the")
            at = [i for i, l in enumerate(lines) if call.search(l) and not DEF.search(l.split(fn, 1)[0] + fn + "(")]
            at = [i for i in at if not re.search(r"\b(function|const|let)\s+" + re.escape(fn) + r"\b", lines[i])]
            before = [i for i in at if i < loop]
            def same_db(i):   # the call reads a database the later migrations went to (or one cannot tell: counts)
                if not dbs: return True
                arg = re.search(r"(?<![\w.])" + re.escape(fn) + r"\(\s*([^,)]*)", lines[i])
                a = (arg.group(1).strip() if arg else "")
                return a == "" or a in dbs or not re.fullmatch(r"[A-Za-z_]\w*", a) and not a[:1] in "\"'`"
            after = [i for i in at if i > loop and same_db(i) and not (MARK.search(lines[i]) or (i and MARK.search(lines[i - 1])))]
            if before and after:
                out.append(f"{os.path.relpath(path)}:{after[0] + 1}: {fn}() reads the catalogue at line {before[0] + 1} (before "
                           f"{name}'s later migrations, line {loop + 1}) and again after them; the comparison then holds other "
                           f"migrations' objects. Fix: read before line {loop + 1} (as adcf9c105), or mark a whole-catalogue rule "
                           f"with \"// own-migration: whole catalogue (<reason>)\"")
    return out


def main(argv):
    targets = argv or [DEFAULT]
    files = []
    for t in targets:
        if os.path.isdir(t):
            files += sorted(os.path.join(t, f) for f in os.listdir(t) if f.endswith(".ts"))
        elif os.path.isfile(t):
            files.append(t)
        else:
            print(f"own-migration guard: {t} not found"); return 2
    bad = [x for f in files for x in scan(f)]
    for x in bad: print(f"REFUSED  {x}")
    print(f"{'PASS' if not bad else 'FAIL'}  own-migration guard: {len(files)} test file(s), {len(bad)} refused")
    return 1 if bad else 0


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv[1:]))
    except (OSError, UnicodeDecodeError) as e:
        print(f"own-migration guard: could not run: {e}"); sys.exit(2)
