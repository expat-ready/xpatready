#!/usr/bin/env python3
"""Migration slots (SPD-2, P-802, founder 22 Nov): database changes stop being one shared line.

Before SPD-2 every Prisma migration took the one product-wide Mergify scope `migrations` (capacity 1), so two
migrations in unrelated parts waited on each other. Now each migration names its AREA, the Prisma schema file it
changes (prisma/schema/<area>.prisma), in its folder name, and the queue gives one slot per area:

    <14-digit stamp>_<area>__<name>          e.g. 20261122040100_client-money__fo7ts_part3
    <14-digit stamp>_shared__<name>           a migration that writes tables of more than one area

  * Mergify: one scope `mig-<area>` (capacity 1) per non-barrier schema file holds that file and the migration folders
    named for it, plus the `shared` ones; barrier areas (base, links, extension, audit) add their migration folders to
    barrier_files. Two migrations of different areas queue together; two of one area wait in order; `shared` waits for
    every area. `mergify` prints that block; `mergify --check <.mergify.yml>` fails when the file differs from it.
  * `check <base>..<head>` (ci.yml job "fast", every PR and merge batch): each migration folder the range adds must
      - carry a stamp after main's newest (else Prisma applies it out of order on main): refused with the exact
        `git mv` re-stamp command;
      - name its area, and the area must cover what it changes: the schema files the range changes and the tables and
        types its migration.sql creates, alters, drops, inserts into, updates or deletes from (REFERENCES and reads do
        not count). One area -> that area; several -> `shared` (or a barrier area among them);
      - and a migration folder already on main must not change (Prisma checksums applied migrations).
    Exit 0 clean, 1 refused (each refusal names its fix), 2 could not run.
  * `areas`: reads changed paths on stdin, prints the areas they hold one per line; `*` for a migration folder that
    names no area. `clash <files-a> <files-b>` (queue-gate.sh's queue-fresh): exit 0 when the two changes' migrations
    must wait in order (an area in common, or a shared, barrier or unnamed one on either side), 1 when they may not.

Reads git and files only; no database, no network, no model call (US$0). Test: product/tools/test-spd-2.sh."""
import datetime, os, re, subprocess, sys

ROOT = os.environ.get("ROOT") or subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True).stdout.strip()
STUDIO = "ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio/"
SCHEMA = STUDIO + "prisma/schema/"
MIGS = STUDIO + "prisma/migrations/"
BARRIER = ("base", "links", "extension", "audit")   # .mergify.yml barrier_files: a seam every module builds on
NAME = re.compile(r"^(\d{14})_([a-z0-9]+(?:-[a-z0-9]+)*)__([A-Za-z0-9_]+)$")
STAMP = re.compile(r"^(\d{14})_")
WRITES = re.compile(r'(?:CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?"?[\w]*"?\s+ON|'
                    r'CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?|ALTER\s+TABLE(?:\s+ONLY)?(?:\s+IF\s+EXISTS)?|DROP\s+TABLE(?:\s+IF\s+EXISTS)?|'
                    r'INSERT\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE(?:\s+TABLE)?|CREATE\s+TYPE|ALTER\s+TYPE|DROP\s+TYPE(?:\s+IF\s+EXISTS)?|'
                    r'CREATE\s+(?:OR\s+REPLACE\s+)?TRIGGER\s+"?\w+"?\s+(?:BEFORE|AFTER|INSTEAD\s+OF)\s+[\w\s,]+?\s+ON|COMMENT\s+ON\s+(?:TABLE|COLUMN))'
                    r'\s+(?:"?public"?\.)?"?([A-Za-z_][\w]*)"?', re.I)
READS = re.compile(r'(?:FROM|JOIN|REFERENCES|ON)\s+(?:"?public"?\.)?"?([A-Za-z_][\w]*)"?', re.I)


def code(sql):
    """migration.sql without its comments (a comment's words are not changes)."""
    return re.sub(r"--[^\n]*", "", re.sub(r"/\*.*?\*/", "", sql, flags=re.S))


def git(*a, ok=False):
    r = subprocess.run(["git", "-C", ROOT, *a], capture_output=True, text=True)
    if r.returncode and not ok:
        raise RuntimeError(f"git {' '.join(a)}: {r.stderr.strip()}")
    return r.stdout if r.returncode == 0 else ""


def schema_names(rev=None):
    """area -> True for every schema file at rev (None: the work tree)."""
    if rev is None:
        d = os.path.join(ROOT, SCHEMA)
        return sorted(f[:-7] for f in os.listdir(d) if f.endswith(".prisma"))
    return sorted(os.path.basename(p)[:-7] for p in git("ls-tree", "--name-only", rev, SCHEMA).split() if p.endswith(".prisma"))


def owners(rev=None):
    """table or type name (as Postgres sees it) -> area, from every model's @@map or name and every enum's @@map or name."""
    out = {}
    for area in schema_names(rev):
        path = SCHEMA + area + ".prisma"
        text = open(os.path.join(ROOT, path), encoding="utf-8").read() if rev is None else git("show", f"{rev}:{path}", ok=True)
        for kind, name, body in re.findall(r"^(model|enum|view)\s+(\w+)\s*\{(.*?)^\}", text, re.S | re.M):
            m = re.search(r'@@map\(\s*(?:name:\s*)?"([^"]+)"', body)
            out[m.group(1) if m else name] = area
    return out


def mig_dirs(rev):
    return sorted({p[len(MIGS):].split("/")[0] for p in git("ls-tree", "-r", "--name-only", rev, MIGS).split() if p[len(MIGS):].count("/")})


def stamp_after(s, minutes):
    t = datetime.datetime.strptime(s, "%Y%m%d%H%M%S") + datetime.timedelta(minutes=minutes)
    return t.strftime("%Y%m%d%H%M%S")


def written(sql, own):
    return {own[t] for t in WRITES.findall(code(sql)) if t in own}


def read_only(sql, own):
    """The areas whose tables a migration only reads (a function over a table): they suggest an area, never refuse one."""
    return {own[t] for t in READS.findall(code(sql)) if t in own}


def check(rng):
    base, head = rng.split("..", 1)
    # main's newest is read at <base> (main, or the test merge's main in ci); the change is <base>...<head> (from their
    # merge base), so a PR branched before main moved is judged against today's main.
    changed = [l.split("\t", 1) for l in git("-c", "core.quotePath=false", "diff", "--no-renames", "--name-status", f"{base}...{head}").splitlines() if l]
    on_main = set(mig_dirs(base))
    newest = max((STAMP.match(d).group(1) for d in on_main if STAMP.match(d)), default="00000000000000")
    own = owners(head)
    valid = set(schema_names(head)) | {"shared"}
    touched = sorted({os.path.basename(p)[:-7] for _, p in changed if p.startswith(SCHEMA) and p.endswith(".prisma")})
    new, edited, bad = [], {}, []
    for st, p in changed:
        if p.startswith(MIGS) and p[len(MIGS):].count("/"):
            d = p[len(MIGS):].split("/")[0]
            if d in on_main: edited.setdefault(d, f"{st} {os.path.basename(p)}")
            elif d not in new: new.append(d)
    sqls = {d: git("show", f"{head}:{MIGS}{d}/migration.sql", ok=True) for d in new}
    for d, what in sorted(edited.items()):
        # The one accepted edit of an applied migration: a new migration in the same change re-records its checksum in
        # _prisma_migrations (the repair this repository uses, e.g. #2968), so an existing database is not refused.
        if not any("_prisma_migrations" in code(q) and f"'{d}'" in q for q in sqls.values()):
            bad.append(f"{d}: already on main and changed here ({what}); Prisma checksums an applied migration: put the "
                       f"change in a new migration folder (git checkout {base} -- {MIGS}{d}), or re-record its checksum "
                       f"in _prisma_migrations from a new migration of this change")
    later = 0
    for d in sorted(new):
        m, s, sql = NAME.match(d), STAMP.match(d), sqls[d]
        derived = written(sql, own)
        # A schema file the change edits belongs to its one migration, or to each migration whose SQL names its tables.
        derived |= set(touched) if len(new) == 1 else {a for a in touched if any(own.get(t) == a for t in re.findall(r'"?(\w+)"?', code(sql)))}
        repaired = {e for e in edited if f"'{e}'" in sql}
        hint = derived or read_only(sql, own) or {a for e in repaired for a in written(git("show", f"{head}:{MIGS}{e}/migration.sql", ok=True), own)}
        want = (sorted(hint)[0] if len(hint) == 1 else next((x for x in BARRIER if x in hint), "shared") if hint
                else (m.group(2) if m and m.group(2) in valid else "<area>"))
        area = m.group(2) if m else None
        rest = m.group(3) if m else (d[len(s.group(0)):] if s else d)
        why = []
        if not s or s.group(1) <= newest:
            why.append(f"its stamp {s.group(1) if s else '(none)'} is not after main's newest migration {newest}")
        if not m:
            why.append("its name carries no area (<stamp>_<area>__<name>: the schema file it changes)")
        elif area not in valid:
            why.append(f"its area '{area}' is neither a schema file (prisma/schema/{area}.prisma) nor 'shared'")
        elif derived and area != "shared" and not (area in BARRIER and area in derived) and not derived <= {area}:
            why.append(f"it changes {', '.join(sorted(derived))}, not only '{area}'")
        if not why:
            continue
        st = s.group(1) if s and s.group(1) > newest else stamp_after(newest, 1 + later)
        later += st != (s.group(1) if s else None)
        note = "" if want != "<area>" else " (no table of a known schema file in its migration.sql: <area> is the schema file whose tables it serves)"
        bad.append(f"{d}: {'; '.join(why)}. Fix: git mv {MIGS}{d} {MIGS}{st}_{want}__{rest}{note}")
    for x in bad:
        print(f"REFUSED  {x}")
    print(f"{'PASS' if not bad else 'FAIL'}  migration slots: {len(new)} new migration(s) against main's newest {newest}"
          + (f" ({', '.join(sorted(new))})" if new else ""))
    return 1 if bad else 0


def areas(paths):
    """The areas changed paths hold: a migration folder's named area ("*" when it names none) and a schema file's name.
    Matched by the path's tail (…/prisma/migrations/<folder>/…, …/prisma/schema/<area>.prisma), wherever the app sits."""
    out = set()
    for p in paths:
        m = re.search(r"(?:^|/)prisma/migrations/([^/]+)/", p)
        if m:
            n = NAME.match(m.group(1)); out.add(n.group(2) if n else "*"); continue
        m = re.search(r"(?:^|/)prisma/schema/([^/]+)\.prisma$", p)
        if m: out.add(m.group(1))
    return sorted(out)


def clash(a, b):
    """Two changes' migrations must wait in order: an area in common, or either holds a shared, barrier or unnamed one."""
    wide = {"*", "shared", *BARRIER}
    mig = lambda ps: set(areas([p for p in ps if "prisma/migrations/" in p and not p.endswith("migration_lock.toml")]))
    x, y = mig(a), mig(b)
    return bool(x and y and (x & y or x & wide or y & wide))


def mergify_block():
    """The scopes and capacities SPD-2 adds to .mergify.yml, as (scopes {name: [globs]}, barrier globs)."""
    scopes, barrier = {}, []
    for a in schema_names(None):
        if a in BARRIER:
            barrier.append(f"{MIGS}*_{a}__*/**")
            continue
        scopes[f"mig-{a}"] = [f"{SCHEMA}{a}.prisma", f"{MIGS}*_{a}__*/**", f"{MIGS}*_shared__*/**"]
    return scopes, barrier


def mergify(check_file=None):
    scopes, barrier = mergify_block()
    if check_file is None:
        print("# scopes.source.files (one per area):")
        for k, v in scopes.items():
            print(f"      {k}:\n        include:")
            for g in v:
                print(f'          - "{g}"')
        print("# barrier_files.include adds:")
        for g in barrier:
            print(f'      - "{g}"')
        print("# capacities adds:")
        for k in scopes:
            print(f"    {k}: 1")
        return 0
    import yaml
    cfg = yaml.safe_load(open(check_file, encoding="utf-8"))
    sc = cfg.get("scopes") or {}
    files = (sc.get("source") or {}).get("files") or {}
    caps = sc.get("capacities") or {}
    bar = set((sc.get("barrier_files") or {}).get("include") or [])
    bad = []
    for k, v in scopes.items():
        if ((files.get(k) or {}).get("include") or []) != v:
            bad.append(f"scope {k}: not {v}")
        if caps.get(k) != 1:
            bad.append(f"capacities: {k} is not 1")
    for k in files:
        if k.startswith("mig-") and k not in scopes:
            bad.append(f"scope {k}: no schema file prisma/schema/{k[4:]}.prisma (or it is a barrier)")
    for g in barrier:
        if g not in bar:
            bad.append(f"barrier_files: lacks {g}")
    for k, v in files.items():
        if any(g.startswith(MIGS) and g != f"{MIGS}migration_lock.toml" for g in (v or {}).get("include") or []) and not k.startswith("mig-"):
            bad.append(f"scope {k}: holds migration folders outside a per-area scope (the one shared line SPD-2 removed)")
    for b in bad:
        print(f"FAIL  {b}")
    print(f"{'PASS' if not bad else 'FAIL'}  mergify migration slots: {len(scopes)} area scopes, {len(barrier)} barrier areas")
    return 1 if bad else 0


if __name__ == "__main__":
    a = sys.argv[1:]
    try:
        if a[:1] == ["check"] and len(a) == 2 and ".." in a[1]:
            sys.exit(check(a[1]))
        if a[:1] == ["areas"]:
            print("\n".join(areas([l.strip() for l in sys.stdin if l.strip()])))
            sys.exit(0)
        if a[:1] == ["clash"] and len(a) == 3:   # exit 0: they clash (wait in order); 1: they may queue together
            rd = lambda f: [l.strip() for l in open(f, encoding="utf-8") if l.strip()]
            sys.exit(0 if clash(rd(a[1]), rd(a[2])) else 1)
        if a[:1] == ["mergify"]:
            sys.exit(mergify(a[2] if a[1:2] == ["--check"] and len(a) == 3 else None))
    except (RuntimeError, OSError) as e:
        print(f"migration-slots: {e}", file=sys.stderr)
        sys.exit(2)
    print(__doc__.split("\n\n")[0], file=sys.stderr)
    print("usage: migration-slots.py check <base>..<head> | areas < paths | clash <files-a> <files-b> | mergify [--check <.mergify.yml>]", file=sys.stderr)
    sys.exit(2)
