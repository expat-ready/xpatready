#!/usr/bin/env python3
"""P-823: is a migration's added SQL additive? Used by queue-gate.sh destructive() (read first unless this says yes).

An allowlist, not a word list (reviews of #3661): the added lines of a new migration.sql (GitHub's patch, on stdin) are
additive only when every statement, read by a small SQL scanner, is one of
  CREATE TABLE <name> (...)          not AS, OF, PARTITION OF or INHERITS
  CREATE [UNIQUE] INDEX ... ON <t>   (any table: a short write lock on an existing one, review m5 noted)
  CREATE SEQUENCE · CREATE TYPE <name> AS ENUM (...) · ALTER TYPE <name> ADD VALUE '...' · COMMENT ON ...
  ALTER TABLE <t> ADD ...            and none of DROP, RENAME, ALTER, DISABLE, ENABLE, FORCE, OWNER, REPLICA, CLUSTER,
                                     SET, RESET, INHERIT, OF, ATTACH, DETACH, VALIDATE, GENERATED
  (CREATE TRIGGER: never; its function may be any existing one, review 3 B3)
  INSERT INTO <t> [(cols)] VALUES    only into a table this migration creates, never SELECT or ON CONFLICT
and no statement calls a function: a name followed by "(" counts only when it is a type size or a constraint word
(VARCHAR(n), DECIMAL(p,s), TIMESTAMP(3), KEY, UNIQUE, CHECK, VALUES, ENUM, a column list); DEFAULT now() is read first.
The scanner skips -- comments and reads 'strings' ('' and E'\\' escapes) and "names" whole, keeping names (for the
tables-created check); it refuses (read first) a block comment, ANY $ outside a string or name (dollar quotes with
any tag, $-names: review 2 B1-B2), U& strings, an unclosed string or name, and a patch line it cannot place.
Prints "yes" or "no: <the first statement or reason, 80 characters>"; exit 0. Test: check-queue-gate.sh (P-823 rows).
"""
import re, sys

I = re.I
NAME = r'("[^"]*"|[A-Za-z_][\w]*)(\.("[^"]*"|[A-Za-z_][\w]*))?'
ALTER_BAD = re.compile(r"\b(DROP|RENAME|ALTER|DISABLE|ENABLE|FORCE|OWNER|REPLICA|CLUSTER|SET|RESET|INHERIT|OF|ATTACH|DETACH|VALIDATE|GENERATED|NO)\b", I)
TABLE_BAD = re.compile(r"\b(AS|OF|INHERITS|PARTITION|LIKE)\b", I)
NEVER = re.compile(r"\b(DROP|RENAME|TRUNCATE|DELETE\s+FROM|UPDATE\s+\S+\s+SET|GRANT|REVOKE|DO\s+UPDATE|SELECT)\b", I)
CALL_OK = {"varchar", "char", "character", "varying", "decimal", "numeric", "timestamp", "timestamptz", "time", "timetz",
           "interval", "bit", "varbit", "float", "key", "unique", "check", "values", "enum", "exists", "index", "on",
           "references", "include", "using", "btree", "hash", "gin", "gist", "where", "in"}   # CHECK ("state" IN (...))


def statements(sql):
    """→ (statements with strings blanked and names kept, None) or (None, reason)."""
    out, cur, i, n = [], [], 0, len(sql)
    while i < n:
        c, two = sql[i], sql[i:i + 2]
        if two == "--":
            j = sql.find("\n", i); i = n if j < 0 else j; continue
        if two == "/*":
            return None, "a block comment"
        if c == "$":
            return None, "a $ outside a string (a dollar-quoted body or a $-name)"
        if two.upper() == "U&":
            return None, "a U& string or name"
        prev = sql[i - 1] if i else " "
        if c == "'" or (c in "eE" and sql[i + 1:i + 2] == "'" and not (prev.isalnum() or prev in "_$\"")):
            esc = c in "eE"; i += 2 if esc else 1; start = i
            while True:
                if i >= n:
                    return None, "an unclosed string"
                if esc and sql[i] == "\\":
                    i += 2; continue
                if sql[i] == "'":
                    if sql[i + 1:i + 2] == "'":
                        i += 2; continue
                    i += 1; break
                i += 1
            cur.append("''" if i - start <= 1 else "'x'"); continue   # an empty string stays visible (review 4 m1)
        if c == '"':
            j = sql.find('"', i + 1)
            while j >= 0 and sql[j + 1:j + 2] == '"':
                j = sql.find('"', j + 2)
            if j < 0:
                return None, "an unclosed quoted name"
            cur.append('"h' + sql[i + 1:j].encode().hex() + '"'); i = j + 1; continue   # kept exactly, hex: no later step can merge or read into a name (review 3 M4, review 4 M1)
        if c == ";":
            out.append("".join(cur)); cur = []; i += 1; continue
        cur.append(c); i += 1
    out.append("".join(cur))
    return [re.sub(r"\s+", " ", s).strip() for s in out if s.strip()], None


def key(name):
    return name.lower() if not name.startswith('"') else name


def calls(s):
    """A name directly followed by "(" that is not a type size or a constraint word: a function call."""
    for m in re.finditer(r'"[^"]*"\s*\(', s):   # a quoted name before "(" (review 3 B2: "setval"(...)): only a table's or column list's
        if not re.search(r'(\bREFERENCES|\bON|\bINTO|\bTABLE( IF NOT EXISTS)?|\bKEY|\bINDEX)\s*$', s[:m.start()], I):
            return m.group(0)
    for m in re.finditer(r'([A-Za-z_]\w*)\s*\(', s):
        if m.group(1).lower() not in CALL_OK:
            return m.group(1)
    return None


REF = r"(REFERENCES|ON|INTO|TABLE( IF NOT EXISTS)?|EXISTS|INDEX|COLUMN|TYPE|SEQUENCE|CONSTRAINT|KEY|ADD COLUMN|ADD)"
BUILTIN = {"text", "integer", "int", "int4", "int8", "bigint", "smallint", "boolean", "bool", "jsonb", "json", "timestamp",
           "timestamptz", "date", "uuid", "numeric", "decimal", "double", "real", "varchar", "char", "bytea", "interval", "time"}


def dots(s):
    """Review 4 B1: "User".audit (attribute notation) runs audit(row) with no "(": any . outside a table reference, and a
    cast to anything but a built-in type, is refused."""
    t = re.sub(r"\b" + REF + r" " + NAME, " REF ", s, flags=I)   # a table or column reference may be schema-qualified
    t = re.sub(r"\d\.\d", "0", t)
    if "." in t:
        return "a . outside a table reference"
    for m in re.finditer(r"::\s*(\"?)([A-Za-z_]\w*)", t):
        if m.group(1) or m.group(2).lower() not in BUILTIN:
            return "a cast to a non-built-in type"
    return None


def judge(patch):
    added = []
    for l in patch.replace("\r", "").split("\n"):
        if l.startswith("+"):
            added.append(l[1:])
        elif l.startswith(("@@", " ", "\\")) or l == "":
            continue
        else:
            return "no: a removed line in a new migration"   # a new file's patch has only added lines
    sts, why = statements("\n".join(added))
    if sts is None:
        return f"no: {why}"
    created = set()
    for s in sts:
        m = re.match(r"^CREATE TABLE " + NAME + r" \(", s, I)   # never IF NOT EXISTS: it may be an existing table (review 3 B1)
        if m:
            created.add(key(m.group(1) + (m.group(2) or "")))
    for s in sts:
        u, ok = s.upper(), False
        if NEVER.search(s) or calls(s) or dots(s):
            return "no: " + s[:80]
        if re.match(r"^CREATE TABLE (IF NOT EXISTS )?" + NAME + r" \(", s, I):
            ok = not TABLE_BAD.search(s[s.index("("):])
        elif re.match(r"^CREATE (UNIQUE )?INDEX\b", s, I) or (re.match(r"^CREATE SEQUENCE\b", s, I) and not re.search(r"\bOWNED BY\b", s, I)) \
                or re.match(r"^CREATE TYPE " + NAME + r" AS ENUM \(", s, I) or re.match(r"^ALTER TYPE " + NAME + r" ADD VALUE (IF NOT EXISTS )?'x' ?$", s + " ", I) \
                or (re.match(r"^COMMENT ON\b", s, I) and not re.search(r"\bIS (NULL|'')$", s, I)):
            ok = True
        elif re.match(r"^ALTER TABLE (IF EXISTS )?(ONLY )?" + NAME + r" ADD\b", s, I):
            t = re.match(r"^ALTER TABLE (IF EXISTS )?(ONLY )?" + NAME, s, I)
            new = key(t.group(3) + (t.group(4) or "")) in created   # a table this migration creates has no rows to cascade
            rest = re.sub(r"^ALTER TABLE (IF EXISTS )?(ONLY )?" + NAME + " ", "", s, flags=I)
            ok = (new or not re.search(r"\bON (DELETE|UPDATE) (CASCADE|SET)\b", rest, I)) and not re.search(r"\bNOT VALID\b", rest, I) and \
                not ALTER_BAD.search(re.sub(r"\bON (UPDATE|DELETE) (SET (NULL|DEFAULT)|NO ACTION)\b", "", rest, flags=I))   # an FK onto existing rows never cascades a delete (review 3 M5)
        else:   # CREATE TRIGGER is never additive: its function may be any existing one (review 3 B3)
            m = re.match(r"^INSERT INTO " + NAME + r"( \([^()]*\))? VALUES ", s, I)
            if m:
                ok = key(m.group(1) + (m.group(2) or "")) in created and "ON CONFLICT" not in u
        if not ok:
            return "no: " + s[:80]
    return "yes"


if __name__ == "__main__":
    print(judge(sys.stdin.read()))
