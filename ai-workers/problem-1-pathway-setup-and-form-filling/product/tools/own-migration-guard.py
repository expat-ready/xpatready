#!/usr/bin/env python3
"""Own-migration guard (Lead 5's ruling on #2915 and #3035, 23 Nov; BACKLOG rule "a row's migration test measures right
after its own migration (apply up to and including it, check, then apply the rest), and never assumes its migration
is the newest of all").

Why: with one Mergify migration slot per area (SPD-2, #3035), two areas' migrations are tested side by side, not on
top of each other. A suite that snapshots the database catalogue before its own migration and compares it with a read
taken AFTER the later migrations sees the other area's objects as its own and fails on main. Merge batches broke this
way at least twice since 16 Nov (adcf9c105, 2cd4d9cd1; #2915).

What it refuses, in a test that names a migration (NAME = "<14-digit stamp>_<name>", after const or a comma) and
applies the later ones: a loop over all.filter((x) => x > NAME) or >= NAME (typed parameter or a bounded range
"&& x < OTHER" included), over all.slice(all.indexOf(NAME) + 1), or over a name such a filter was assigned to
(const after = all.filter(…) ... for (const d of after)); a filter that only reads migration text is not a loop:
  a catalogue reader (a function whose body queries pg_proc, pg_policy/pg_policies, pg_trigger, pg_class,
  pg_attribute, pg_constraint, pg_index/pg_indexes, pg_views, pg_type, pg_enum, pg_namespace, pg_roles, pg_depend or
  information_schema, or calls such a reader; declared with function, const, let or after a comma) called both before
  such a loop and after it, on a database the loop's migrations went to: psql(X, …), psql(urlOf(X), …) or
  "of [X, Y]" on the loop's line (or the next, when the body sits there), plus any database later given every
  migration ("for (const d of all) psql(X, …)"). Only a call whose argument is another database constant (an
  upper-case name the loops never fed) is left out: a loop variable, an expression or no argument counts (fails
  closed); so does every call when a loop names no database (file(d), apply(d)). Every later loop of every name counts.
  A multi-step suite (FO-7ts's three parts) applies another of its own migrations after the loop: a line, not a
  comment, applying a later-stamped migration of the suite, to a database the loop named and fed, whose own later
  loop feeds that database too (a loop that names no database never has its step ended); a read naming a pre-loop
  snapshot is still refused after it.
  There a plain snapshot before it ("const x = fn(db)," or ";", never a chain going on) is the next step's baseline,
  reads after it are judged by that step's loop, and a line naming both that baseline and a pre-loop snapshot is
  refused. Anything else (a rerun of its own migration, another database, a migration with no loop) ends no step.
  Fix: take the second read before the later migrations are applied (as adcf9c105 did), or, when the read after is
  a rule every table must keep whatever migration added it (a whole-catalogue invariant, which should fail on main if
  another area breaks it), mark that call "// own-migration: whole catalogue (<reason>)" on its line or on a comment
  line right above; a read limited to this area's own tables (another area's migration cannot change them, and one of
  this area waits in the same Mergify slot) is marked "// own-migration: ok (<reason>)". A marker needs its reason.

Not covered (state it in the review of a new suite): a snapshot taken by an inline sql(…pg_proc…) with no reader
function, a reader imported from another file or called as a method (cat.fns(T)), migrations applied by
`prisma migrate deploy`, a loop header split over two lines, a step baseline compared with the pre-loop snapshot
over two lines or through an alias (const b0 = before), and files other than prototype/studio/tests/*.ts.

Static reading of the test's text only: no database, no network, US$0. Exit 0 clean, 1 refused (each names the file,
the lines and the fix), 2 could not run.
  python3 -I own-migration-guard.py [<test file or folder>...]     default: prototype/studio/tests
Test: product/tools/check-own-migration-guard.sh."""
import os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT = os.path.normpath(os.path.join(HERE, "..", "..", "prototype", "studio", "tests"))
CAT = re.compile(r"\b(pg_proc|pg_polic(?:y|ies)|pg_trigger|pg_class|pg_attribute|pg_constraint|pg_index(?:es)?|pg_views|"
                 r"pg_type|pg_enum|pg_namespace|pg_roles|pg_depend|information_schema)\b")
NEWC = re.compile(r'(?:\bconst\s+|,\s*)([A-Z][A-Z0-9_]*)\s*=\s*["\'](\d{14}_[A-Za-z0-9_-]+)["\']')
DEF = re.compile(r"(?:\bfunction\s+([A-Za-z_]\w*)\s*\(|(?:\b(?:const|let)\s+|,\s*)([A-Za-z_]\w*)\s*=\s*(?:async\s*)?"
                 r"(?:\([^()]*\)|[A-Za-z_]\w*)\s*(?::[^=]+)?=>)")
MARK = re.compile(r"own-migration:\s*(?:whole catalogue|ok)\s*\(\s*[^)\s][^)]*\)", re.I)   # a reason in brackets is required
PSQLDB = re.compile(r"\bpsql\(\s*(?:urlOf\(\s*)?([A-Za-z_]\w*)")


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


def readers(text):
    """Functions that read the catalogue, directly or through another reader (one pass to a fixpoint)."""
    defs = {}
    for m in DEF.finditer(text):
        defs.setdefault(m.group(1) or m.group(2), body(text, m.start()))
    out = {f for f, b in defs.items() if CAT.search(b)}
    while True:
        more = {f for f, b in defs.items() if f not in out and any(re.search(r"(?<![\w.])" + re.escape(r) + r"\(", b) for r in out)}
        if not more: return out
        out |= more


def loop_lines(lines, name):
    """(line, databases) of each loop applying the migrations after NAME; databases empty when none can be read."""
    flt = re.compile(r"(?:filter\(\s*\(?\s*(\w+)\s*(?::\s*\w+)?\s*\)?\s*=>\s*(?:\1\s*>=?\s*" + re.escape(name)
                     + r"|" + re.escape(name) + r"\s*<=?\s*\1)\b[^)]*\)"
                     r"|\.slice\(\s*\w+\.indexOf\(\s*" + re.escape(name) + r"\s*\)\s*\+\s*1\s*\))")
    found = set()
    for i, l in enumerate(lines):
        if not flt.search(l) or "readFileSync" in l or "matchAll" in l: continue
        if re.search(r"\bfor\s*\(", l) or ".forEach(" in l:
            found.add(i)
        f = flt.search(l)
        m = None
        for m2 in re.finditer(r"\b(?:const|let)\s+(\w+)\s*=|,\s*(\w+)\s*=", l[:f.start()]): m = m2
        if m and "(" not in l[m.end():f.start()].replace("all", "", 1).replace(".", "") .strip("( "):   # the list is named here and applied where it is iterated
            m = type("M", (), {"group": lambda self, k, g=(m.group(1) or m.group(2)): g})()
            v = re.escape(m.group(1))
            found |= {j for j, k in enumerate(lines) if j > i and re.search(r"\bof\s+(?:\[\s*\.\.\.\s*)?" + v + r"\b\s*\]?\s*\)|\b" + v + r"\.forEach\(", k)}
    out = []
    for i in sorted(found):
        near = lines[i]
        if not re.search(r"\bpsql\(|of\s*\[", near) and re.search(r"[){]\s*$", near) and i + 1 < len(lines):
            near += "\n" + lines[i + 1]   # the body on the next line only when the loop line ends at ) or { (round 3)
        dbs = set(PSQLDB.findall(near))
        for grp in re.findall(r"of\s*\[([^\]]*)\]", near): dbs |= set(re.findall(r"[A-Za-z_]\w*", grp))
        out.append((i, dbs))
    return out


def marked(lines, i):
    if MARK.search(lines[i]): return True
    return i > 0 and lines[i - 1].strip().startswith("//") and bool(MARK.search(lines[i - 1]))


def scan(path):
    text = open(path, encoding="utf-8").read()
    lines = text.split("\n")
    names = sorted({n for n, _ in NEWC.findall(text)})
    rd = readers(text)
    # databases later given every migration (for (const d of all) psql(X, …))
    every = {i: set(PSQLDB.findall(l)) for i, l in enumerate(lines) if re.search(r"\bof\s+(?:all|ALL)\s*\)", l)}
    stamps = dict(NEWC.findall(text))
    code = [re.sub(r"/\*.*?\*/", "", l).split("//")[0] for l in lines]   # comments name no applied migration (round 3)
    own = sorted((i, n) for i, l in enumerate(code) for n in names
                 if re.search(r"\bMIG\s*,\s*" + re.escape(n) + r"\s*,\s*[\"']migration\.sql", l))
    out, seen = [], set()
    for name in names:
        for loop, dbs in loop_lines(lines, name):
            fed = set(dbs) | {d for j, ds in every.items() if j >= loop for d in ds}
            for fn in sorted(rd):
                call = re.compile(r"(?<![\w.])" + re.escape(fn) + r"\(\s*([^,)]*)")
                at = [(i, m) for i, l in enumerate(lines) for m in call.finditer(l)
                      if not re.search(r"\b(?:function|const|let)\s+" + re.escape(fn) + r"\b|,\s*" + re.escape(fn) + r"\s*=", l)]
                lcol = lines[loop].find("for")
                def after_loop(i, m): return i > loop or (i == loop and m.start() > max(lcol, 0) and m.start() > lines[loop].find(")"))
                def counts(m):   # left out only for another database constant the loops never fed
                    a = m.group(1).strip()
                    if not dbs: return True
                    return not (re.fullmatch(r"[A-Z][A-Z0-9_]*", a) and a not in fed)
                def snapshot(i, m):   # "const x = fn(db)," or ";": a baseline, not a comparison (fo7ts's fnBefore2 = fns(T), …)
                    l = lines[i]
                    if not re.search(r"(?:\b(?:const|let)\s+\w+|,\s*\w+)\s*=\s*$", l[:m.start()]): return False
                    depth, j = 0, m.end() - len(m.group(1)) - 1
                    while j < len(l):
                        depth += {"(": 1, ")": -1}.get(l[j], 0)
                        if depth == 0: break
                        j += 1
                    return re.match(r"\s*[,;]", l[j + 1:]) is not None   # not end of line: a chain may go on (round 2 M2)
                # The next of the suite's own migrations applied after the loop starts its next step: a plain snapshot
                # taken before it is that step's baseline; reads after it are judged against that step's own loops.
                nxt = next((j for j, n2 in own if j > loop and stamps[n2] > stamps[name]
                            and dbs and set(PSQLDB.findall(lines[j])) & set(dbs)
                            and any(k > j and d2 & set(dbs) for k, d2 in loop_lines(lines, n2))), len(lines))   # round 2 M1, round 3
                before = [i for i, m in at if not after_loop(i, m)]
                after = [i for i, m in at if after_loop(i, m) and i < nxt and counts(m) and not marked(lines, i)
                         and not (nxt < len(lines) and snapshot(i, m))]
                # A step's baseline later compared with a snapshot from before the loop (round 2 m1): both names on one line.
                pre = {v for i, m in at if not after_loop(i, m) for v in re.findall(r"(?:\b(?:const|let)\s+|,\s*)(\w+)\s*=\s*$", lines[i][:m.start()])}
                base = {v for i, m in at if after_loop(i, m) and i < nxt and snapshot(i, m) for v in re.findall(r"(?:\b(?:const|let)\s+|,\s*)(\w+)\s*=\s*$", lines[i][:m.start()])}
                bare = lambda l: re.sub(r'"(?:[^"\\]|\\.)*"|\'(?:[^\'\\]|\\.)*\'|`[^`]*`', "", l.split("//")[0])   # names, not words in messages
                # Any read after the next own migration that names a pre-loop snapshot is still compared with it (round 3 MA1).
                if pre and nxt < len(lines):
                    after += [i for i, m in at if i >= nxt and counts(m) and not marked(lines, i)
                              and any(re.search(r"\b" + re.escape(a) + r"\b", bare(lines[i])) for a in pre)]
                    after = sorted(set(after))
                if pre and base:
                    first = min((i for i, l in enumerate(lines) if i > loop and not marked(lines, i)
                                 and any(re.search(r"\b" + re.escape(a) + r"\b", bare(l)) for a in pre)
                                 and any(re.search(r"\b" + re.escape(b) + r"\b", bare(l)) for b in base)), default=None)
                    if first is not None: after = sorted(set(after) | {first})
                if before and after and (path, after[0], fn) not in seen:
                    seen.add((path, after[0], fn))
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
