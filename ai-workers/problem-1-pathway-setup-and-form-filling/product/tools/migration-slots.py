#!/usr/bin/env python3
"""Migration slots (SPD-2, P-802, founder 22 Nov): database changes stop being one shared line.

Before SPD-2 every Prisma migration took the one product-wide Mergify scope `migrations` (capacity 1), so two
migrations in unrelated parts waited on each other. Now each migration names its AREA, the Prisma schema file whose
tables it changes (prisma/schema/<area>.prisma), in its folder name, and the queue gives one slot per area:

    <14-digit stamp>_<area>__<name>          e.g. 20261122040100_client-money__fo7ts_part3
    <14-digit stamp>_shared__<name>           a migration that touches tables of more than one area

  * Mergify: one scope `mig-<area>` (capacity 1) per non-barrier schema file holds that file and the migration folders
    named for it, plus the `shared` ones; barrier areas (base, links, extension, audit) add their migration folders to
    barrier_files. Two migrations of different areas queue together; two of one area wait in order; `shared` waits for
    every area. `mergify` prints that block, `mergify --check <.mergify.yml>` fails when the file differs from it, and
    `mergify --write <.mergify.yml>` rewrites it in place (a new schema file needs its scope; .mergify.yml is Lead-read).
  * `check [--batch] <base>..<head>` (ci.yml job "fast", every PR and merge batch): each migration folder the range adds
      - carries a valid stamp, not more than two days ahead, after main's newest migration (a merge batch, --batch:
        after main's newest of its own area, of a shared or barrier one, or of one named before SPD-2, since a batch of
        another area may merge first); else refused with the exact `git mv` re-stamp command;
      - names its area, and the area covers every table or type of a known schema file its migration.sql writes:
        created, altered, dropped (each of a list), truncated, inserted into, updated, deleted from, copied into,
        indexed (an index name is read as the table it starts with), given a trigger, constraint trigger, rule or
        policy, granted, revoked or commented; comments are removed, while strings, quoted names and dollar-quoted
        function and DO bodies are read as code (a trigger function that writes another area's table counts). One area
        -> that area; several -> `shared`, or a barrier area among them (a barrier waits for everything). Reads (a
        policy's USING, a function's SELECT, a foreign key) do not count, so a wall policy reading platform_firm stays
        in its own area. A schema file the change edits (a Prisma back-relation) does not count either: that file
        already puts the PR in that area's scope; it only suggests an area when the SQL writes no known table;
      - has its area's scope in .mergify.yml (a new schema file: refused with the `mergify --write` command);
      - and a migration folder already on main does not change, unless a new migration of the change re-records its
        checksum: UPDATE _prisma_migrations SET checksum ... WHERE migration_name = '<that folder>'.
    Exit 0 clean, 1 refused (each refusal names its fix), 2 could not run.
  * `areas`: reads changed paths on stdin, prints the areas they hold one per line; `*` for a migration folder that
    names no area. `clash <files-a> <files-b>` (queue-gate.sh's queue-fresh): exit 0 when the two changes' migrations
    must wait in order (an area in common, or a shared, barrier or unnamed one on either side), 1 when they may not,
    2 on any error (queue-gate reads anything but 1 as a clash: fails closed).

Reads git and files only; no database, no network, no model call (US$0). Test: product/tools/test-spd-2.sh."""
import datetime, os, re, subprocess, sys

ROOT = os.environ.get("ROOT") or subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True).stdout.strip()
STUDIO = "ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio/"
SCHEMA = STUDIO + "prisma/schema/"
MIGS = STUDIO + "prisma/migrations/"
TOOL = "ai-workers/problem-1-pathway-setup-and-form-filling/product/tools/migration-slots.py"
BARRIER = ("base", "links", "extension", "audit")   # .mergify.yml barrier_files: a seam every module builds on
NAME = re.compile(r"^(\d{14})_([a-z0-9]+(?:-[a-z0-9]+)*)__([A-Za-z0-9_]+)$")
STAMP = re.compile(r"^(\d{14})_")
AHEAD = datetime.timedelta(days=2)   # a stamp further ahead than this is a typo that would hold every later migration


def code(sql):
    """migration.sql without its comments. Strings ('...' with ''), quoted names ("...") and dollar-quoted bodies
    ($tag$...$tag$, read as code themselves) are kept, so a '--' inside a string hides nothing."""
    out, i, n = [], 0, len(sql)
    while i < n:
        c = sql[i]
        if sql.startswith("--", i):
            j = sql.find("\n", i); i = n if j < 0 else j; continue
        if sql.startswith("/*", i):
            j = sql.find("*/", i + 2); i = n if j < 0 else j + 2; out.append(" "); continue
        if c in "'\"":
            j = i + 1
            while j < n:
                if sql[j] == c and sql.startswith(c * 2, j): j += 2; continue
                if sql[j] == c: break
                j += 1
            out.append(sql[i:j + 1]); i = j + 1; continue
        m = re.match(r"\$([A-Za-z_]\w*)?\$", sql[i:i + 64])
        if m:
            tag = m.group(0); j = sql.find(tag, i + len(tag))
            body_end = n if j < 0 else j
            out.append(" " + code(sql[i + len(tag):body_end]) + " "); i = n if j < 0 else j + len(tag); continue
        out.append(c); i += 1
    return "".join(out)


def git(*a, ok=False):
    r = subprocess.run(["git", "-C", ROOT, *a], capture_output=True, text=True)
    if r.returncode and not ok:
        raise RuntimeError(f"git {' '.join(a)}: {r.stderr.strip()}")
    return r.stdout if r.returncode == 0 else ""


def schema_names(rev=None):
    """Every schema file's area at rev (None: the work tree)."""
    if rev is None:
        d = os.path.join(ROOT, SCHEMA)
        return sorted(f[:-7] for f in os.listdir(d) if f.endswith(".prisma"))
    return sorted(os.path.basename(p)[:-7] for p in git("ls-tree", "--name-only", rev, SCHEMA).split() if p.endswith(".prisma"))


def owners(rev=None):
    """table or type name (lower case, as Postgres folds it) -> area, from every model's and enum's @@map or name."""
    out = {}
    for area in schema_names(rev):
        path = SCHEMA + area + ".prisma"
        text = open(os.path.join(ROOT, path), encoding="utf-8").read() if rev is None else git("show", f"{rev}:{path}", ok=True)
        for kind, name, body in re.findall(r"^(model|enum|view)\s+(\w+)\s*\{(.*?)^\}", text, re.S | re.M):
            m = re.search(r'@@map\(\s*(?:name:\s*)?"([^"]+)"', body)
            out[(m.group(1) if m else name).lower()] = area
    return out


ID = r'(?:(?:"public"|public)\s*\.\s*)?("[^"]+"|[A-Za-z_]\w*)'
IDN = r'(?:(?:"public"|public)\s*\.\s*)?(?:"[^"]+"|[A-Za-z_]\w*)'   # the same, without a group
LIST = IDN + r'(?:\s*,\s*' + IDN + r')*'
WRITE_FORMS = [   # statement forms whose target table is written (its rows, columns, indexes, triggers, policies or grants)
    r'\bCREATE\s+(?:UNLOGGED\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?' + ID,
    r'\bALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?' + ID,
    r'\bINSERT\s+INTO\s+' + ID,
    r'\bUPDATE\s+(?:ONLY\s+)?' + ID + r'\s+(?:AS\s+\w+\s+)?SET\b',
    r'\bDELETE\s+FROM\s+(?:ONLY\s+)?' + ID,
    r'\bMERGE\s+INTO\s+' + ID,
    r'\bCOPY\s+' + ID,
    r'\b(?:CREATE|ALTER|DROP)\s+TYPE\s+(?:IF\s+(?:NOT\s+)?EXISTS\s+)?' + ID,
    r'\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?(?:(?!ON\b)\S+\s+)?ON\s+(?:ONLY\s+)?' + ID,
    r'\b(?:CREATE\s+(?:OR\s+REPLACE\s+)?(?:CONSTRAINT\s+)?|DROP\s+)TRIGGER\s+(?:IF\s+EXISTS\s+)?\S+\s+(?:(?!\bON\b)[\s\S])*?\bON\s+(?:ONLY\s+)?' + ID,
    r'\b(?:CREATE|ALTER|DROP)\s+POLICY\s+(?:IF\s+EXISTS\s+)?\S+\s+ON\s+' + ID,
    r'\b(?:CREATE\s+(?:OR\s+REPLACE\s+)?|DROP\s+)RULE\s+(?:IF\s+EXISTS\s+)?\S+\s+(?:(?!\bON\b)[\s\S])*?\bON\s+' + ID,
    r'\b(?:GRANT|REVOKE)\s+[\w\s,()"]+?\s+ON\s+(?:TABLE\s+)?' + ID,
    r'\bCOMMENT\s+ON\s+(?:TABLE|COLUMN|TYPE)\s+' + ID,
    r'\bALTER\s+SEQUENCE\s+(?:IF\s+EXISTS\s+)?' + ID,
]
MULTI_FORMS = [r'\bDROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(' + LIST + ')', r'\bTRUNCATE\s+(?:TABLE\s+)?(?:ONLY\s+)?(' + LIST + ')']
INDEX_FORMS = [r'\b(?:DROP|ALTER)\s+INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+EXISTS\s+)?' + ID]   # an index belongs to its table


def _name(x):
    return x[1:-1].lower() if x.startswith('"') else x.lower()


def written(sql, own):
    """The areas whose tables or types the SQL writes, outside comments (function and DO bodies are read as code):
    every form in WRITE_FORMS, each table of DROP TABLE a, b and TRUNCATE a, b, and the table an index name starts with."""
    c, out = code(sql), set()
    for rx in WRITE_FORMS:
        for m in re.finditer(rx, c, re.I):
            t = _name(m.group(m.lastindex))
            if t in own: out.add(own[t])
    for rx in MULTI_FORMS:
        for m in re.finditer(rx, c, re.I):
            for t in re.findall(ID, m.group(1)):
                if _name(t) in own: out.add(own[_name(t)])
    for rx in INDEX_FORMS:
        for m in re.finditer(rx, c, re.I):
            ix = _name(m.group(m.lastindex))
            best = max((t for t in own if ix.startswith(t + "_")), key=len, default=None)
            if best: out.add(own[best])
    return out


def mentioned(sql, own):
    """The areas whose tables the SQL names at all (outside comments, foreign-key targets aside): used only to suggest
    an area for a migration that writes no known table, never to refuse one."""
    c = re.sub(r'\bREFERENCES\s+' + ID, " ", code(sql), flags=re.I)
    names = {_name(w) for w in re.findall(r'"[^"]+"', c)} | {w.lower() for w in re.findall(r"\b[A-Za-z_]\w*\b", c)}
    return {own[w] for w in names if w in own}


def mig_dirs(rev):
    return sorted({p[len(MIGS):].split("/")[0] for p in git("ls-tree", "-r", "--name-only", rev, MIGS).split() if p[len(MIGS):].count("/")})


def stamp_ok(s):
    try:
        t = datetime.datetime.strptime(s, "%Y%m%d%H%M%S")
    except ValueError:
        return False
    return t <= datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None) + AHEAD


def stamp_after(s, minutes):
    """A suggested stamp: this minute (UTC, plus a minute per earlier suggestion) or main's newest plus some minutes,
    whichever is later, so two PRs refused at different times are not told the same stamp (review m4)."""
    now = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None).replace(second=0, microsecond=0) + datetime.timedelta(minutes=minutes - 1)
    try:
        t = datetime.datetime.strptime(s, "%Y%m%d%H%M%S") + datetime.timedelta(minutes=minutes)
    except ValueError:
        t = now
    return max(t, now).strftime("%Y%m%d%H%M%S")


def repairs(sql, d):
    """A real checksum repair of folder d, outside comments: UPDATE _prisma_migrations SET checksum ... migration_name = 'd'."""
    return re.search(r'UPDATE\s+"?_prisma_migrations"?\s+SET\s+checksum\b[^;]*?\bmigration_name\s*=\s*\'' + re.escape(d) + r"'",
                     code(sql), re.I | re.S) is not None


def check(rng, batch=False):
    import yaml
    base, head = rng.split("..", 1)
    # main's newest is read at <base> (main, or the test merge's main in ci); the change is <base>...<head> (from their
    # merge base), so a PR branched before main moved is judged against today's main.
    changed = [l.split("\t", 1) for l in git("-c", "core.quotePath=false", "diff", "--no-renames", "--name-status", f"{base}...{head}").splitlines() if l]
    on_main = set(mig_dirs(base))
    good = lambda x: STAMP.match(x) and stamp_ok(STAMP.match(x).group(1))
    newest = max((STAMP.match(d).group(1) for d in on_main if good(d)), default="00000000000000")
    own = owners(head)
    valid = set(schema_names(head)) | {"shared"}
    try:
        cfg = yaml.safe_load(git("show", f"{head}:.mergify.yml", ok=True) or "{}") or {}
        scopes = set((((cfg.get("scopes") or {}).get("source") or {}).get("files") or {}))
    except yaml.YAMLError:
        scopes = set()
    touched = sorted({os.path.basename(p)[:-7] for _, p in changed if p.startswith(SCHEMA) and p.endswith(".prisma")})
    new, edited, bad = [], {}, []
    for st, p in changed:
        if p.startswith(MIGS) and p[len(MIGS):].count("/"):
            d = p[len(MIGS):].split("/")[0]
            if d in on_main: edited.setdefault(d, f"{st} {os.path.basename(p)}")
            elif d not in new: new.append(d)
    sqls = {d: git("show", f"{head}:{MIGS}{d}/migration.sql", ok=True) for d in new}
    for d, what in sorted(edited.items()):
        if not any(repairs(q, d) for q in sqls.values()):
            bad.append(f"{d}: already on main and changed here ({what}); Prisma checksums an applied migration: put the "
                       f"change in a new migration folder (git checkout {base} -- {MIGS}{d}), or re-record its checksum "
                       f"from a new migration of this change (UPDATE _prisma_migrations SET checksum = '...' WHERE migration_name = '{d}')")
    later = 0
    for d in sorted(new):
        m, s, sql = NAME.match(d), STAMP.match(d), sqls[d]
        derived = written(sql, own)
        repaired = {e for e in edited if repairs(sql, e)}
        hint = (derived or {a for e in repaired for a in written(git("show", f"{head}:{MIGS}{e}/migration.sql", ok=True), own)}
                or set(touched) or mentioned(sql, own))
        bars = [x for x in BARRIER if x in hint]
        want = (sorted(hint)[0] if len(hint) == 1 else (next((x for x in bars if x in touched), bars[0]) if bars else "shared") if hint
                else (m.group(2) if m and m.group(2) in valid else "<area>"))
        area = m.group(2) if m else None
        rest = m.group(3) if m else (d[len(s.group(0)):] if s else d)
        floor = newest   # a PR (queue entry): after main's newest of any area
        if batch:        # a merge batch: after main's newest of its own area, a shared or barrier one, or one named before SPD-2
            def counts(x):
                n2 = NAME.match(x)
                return (not n2) or n2.group(2) in {"shared", *BARRIER} or area in {"shared", *BARRIER} or n2.group(2) == area
            floor = max((STAMP.match(x).group(1) for x in on_main if good(x) and counts(x)), default="00000000000000")
        why = []
        if not s or not stamp_ok(s.group(1)):
            why.append(f"its stamp {s.group(1) if s else '(none)'} is not a date and time at most two days ahead")
        elif s.group(1) <= floor:
            why.append(f"its stamp {s.group(1)} is not after main's newest migration {floor}"
                       + (" of its area, a shared or barrier one, or one named before SPD-2" if batch else ""))
        if not m:
            why.append("its name carries no area (<stamp>_<area>__<name>: the schema file whose tables it changes)")
        elif area not in valid:
            why.append(f"its area '{area}' is neither a schema file (prisma/schema/{area}.prisma) nor 'shared'")
        elif derived and area != "shared" and not (area in BARRIER and area in derived) and not derived <= {area}:
            why.append(f"it names tables of {', '.join(sorted(derived))}, not only '{area}'")
        if why:
            st = s.group(1) if s and stamp_ok(s.group(1)) and s.group(1) > floor else stamp_after(newest, 1 + later)
            later += 1
            note = "" if want != "<area>" else " (no table of a known schema file in its migration.sql: <area> is the schema file whose tables it serves)"
            bad.append(f"{d}: {'; '.join(why)}. Fix: git mv {MIGS}{d} {MIGS}{st}_{want}__{rest}{note}")
            continue
        if area not in ("shared", *BARRIER) and f"mig-{area}" not in scopes:
            bad.append(f"{d}: .mergify.yml has no slot mig-{area} for the schema file {area}.prisma (a new area). "
                       f"Fix: python3 {TOOL} mergify --write .mergify.yml (the PR then keeps the Lead's read, P-423)")
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
    """The per-area slots, as (scopes {name: [globs]}, barrier globs), from the schema files in the work tree."""
    scopes, barrier = {}, []
    for a in schema_names(None):
        if a in BARRIER:
            barrier.append(f"{MIGS}*_{a}__*/**")
            continue
        scopes[f"mig-{a}"] = [f"{SCHEMA}{a}.prisma", f"{MIGS}*_{a}__*/**", f"{MIGS}*_shared__*/**"]
    return scopes, barrier


BAR_ANCHOR = "      # SPD-2: a migration of a barrier schema file is a barrier too (migration-slots.py)\n"


def write(path):
    """Rewrites .mergify.yml's generated lines in place (comments and every other line kept), then checks it."""
    scopes, barrier = mergify_block()
    lines = open(path, encoding="utf-8").read().split("\n")
    out, i = [], 0
    while i < len(lines):
        l = lines[i]
        if re.match(r"^      mig-[\w-]+:$", l):   # a generated scope and its include lines
            i += 1
            while i < len(lines) and re.match(r"^        (include:|  - )", lines[i]): i += 1
            continue
        if re.match(r'^      - "' + re.escape(MIGS) + r'\*_[a-z0-9-]+__\*/\*\*"$', l) or re.match(r"^    mig-[\w-]+: 1$", l):
            i += 1; continue
        out.append(l); i += 1
    text = "\n".join(out)
    blk = "".join(f"      {k}:\n        include:\n" + "".join(f'          - "{g}"\n' for g in v) for k, v in scopes.items())
    if "      pipeline:\n" not in text or BAR_ANCHOR not in text:
        raise RuntimeError(".mergify.yml: the scope 'pipeline' or the SPD-2 barrier comment is gone, so the slots cannot be placed")
    text = text.replace("      pipeline:\n", blk + "      pipeline:\n", 1)
    text = text.replace(BAR_ANCHOR, BAR_ANCHOR + "".join(f'      - "{g}"\n' for g in barrier), 1)
    m = re.search(r"^  capacities:\n(?:    .*\n)*", text, re.M)
    if not m: raise RuntimeError(".mergify.yml: no capacities block")
    text = text[:m.end()] + "".join(f"    {k}: 1\n" for k in scopes) + text[m.end():]
    open(path, "w", encoding="utf-8").write(text)
    return mergify(path)


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
    if bad:
        bad.append(f"fix: python3 {TOOL} mergify --write .mergify.yml")
    for b in bad:
        print(f"FAIL  {b}")
    print(f"{'PASS' if not bad else 'FAIL'}  mergify migration slots: {len(scopes)} area scopes, {len(barrier)} barrier areas")
    return 1 if bad else 0


if __name__ == "__main__":
    a = sys.argv[1:]
    try:
        if a[:1] == ["check"] and len(a) in (2, 3) and ".." in a[-1] and (len(a) == 2 or a[1] == "--batch"):
            sys.exit(check(a[-1], batch=len(a) == 3))
        if a[:1] == ["areas"]:
            print("\n".join(areas([l.strip() for l in sys.stdin if l.strip()])))
            sys.exit(0)
        if a[:1] == ["clash"] and len(a) == 3:   # exit 0: they clash (wait in order); 1: they may queue together
            rd = lambda f: [l.strip() for l in open(f, encoding="utf-8") if l.strip()]
            sys.exit(0 if clash(rd(a[1]), rd(a[2])) else 1)
        if a[:1] == ["mergify"] and a[1:2] == ["--write"] and len(a) == 3:
            sys.exit(write(a[2]))
        if a[:1] == ["mergify"]:
            sys.exit(mergify(a[2] if a[1:2] == ["--check"] and len(a) == 3 else None))
    except SystemExit:
        raise
    except Exception as e:   # any error is exit 2: queue-gate reads anything but 1 as a clash (review m1)
        print(f"migration-slots: {type(e).__name__}: {e}", file=sys.stderr)
        sys.exit(2)
    print(__doc__.split("\n\n")[0], file=sys.stderr)
    print("usage: migration-slots.py check [--batch] <base>..<head> | areas < paths | clash <files-a> <files-b> | mergify [--check|--write <.mergify.yml>]", file=sys.stderr)
    sys.exit(2)
