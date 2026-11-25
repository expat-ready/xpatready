#!/usr/bin/env python3
"""P-823: is a migration's added SQL additive? Used by queue-gate.sh destructive() (read first unless this says yes).

An allowlist, not a word list (review of #3661, Blocker 1-2): the added lines of a new migration.sql (GitHub's patch, on
stdin) are additive only when every statement, read by a small SQL scanner, is one of
  CREATE TABLE · CREATE [UNIQUE] INDEX · CREATE SEQUENCE · CREATE TYPE ... AS ENUM · CREATE TRIGGER (a new one) ·
  ALTER TABLE ... ADD ... (and nothing that drops, renames, alters a column, disables, enables, changes owner or schema) ·
  ALTER TYPE ... ADD VALUE · COMMENT ON · INSERT INTO (never ON CONFLICT ... DO UPDATE).
Everything else is read first: DROP, RENAME, TRUNCATE, DELETE, UPDATE, GRANT, REVOKE, ALTER COLUMN, DISABLE TRIGGER or
ROW LEVEL SECURITY, CREATE OR REPLACE, DO blocks and functions. The scanner skips -- comments and reads 'strings' (with
'' and E'\\' escapes) and "names" whole; it refuses (read first) a block comment, a dollar-quoted body ($$ or $tag$), an
unclosed string or name, and a patch line it cannot place (fails closed).
Prints "yes" or "no: <the first statement or reason, 80 characters>"; exit 0. Test: check-queue-gate.sh (P-823 rows).
"""
import re, sys

ALLOW = [re.compile(p, re.I) for p in (
    r"^CREATE TABLE\b", r"^CREATE (UNIQUE )?INDEX\b", r"^CREATE SEQUENCE\b", r"^CREATE TYPE \S+ AS ENUM\b",
    r"^CREATE TRIGGER\b", r"^ALTER TABLE (IF EXISTS )?(ONLY )?\S+ ADD\b", r"^ALTER TYPE \S+ ADD VALUE\b",
    r"^COMMENT ON\b", r"^INSERT INTO\b")]
NOT_IN_ALTER = re.compile(r"\b(DROP|RENAME|DISABLE|ENABLE|OWNER|ALTER|INHERIT|DETACH|ATTACH|NO FORCE|SET (SCHEMA|TABLESPACE|LOGGED|UNLOGGED|WITHOUT|ACCESS))\b", re.I)
NEVER = re.compile(r"\b(DROP|RENAME|TRUNCATE|DELETE\s+FROM|UPDATE\s+\S+\s+SET|GRANT|REVOKE|DO\s+UPDATE)\b", re.I)


def statements(sql):
    """→ (statements with strings and names blanked, None) or (None, reason)."""
    out, cur, i, n = [], [], 0, len(sql)
    while i < n:
        c, two = sql[i], sql[i:i + 2]
        if two == "--":
            j = sql.find("\n", i); i = n if j < 0 else j; continue
        if two == "/*":
            return None, "a block comment"
        if c == "$" and re.match(r"\$[A-Za-z_]*\$", sql[i:]):
            return None, "a dollar-quoted body"
        if c == "'" or (c in "eE" and sql[i + 1:i + 2] == "'" and (i == 0 or not (sql[i - 1].isalnum() or sql[i - 1] == "_"))):
            esc = c in "eE"; i += 2 if esc else 1
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
            cur.append("''"); continue
        if c == '"':
            j = sql.find('"', i + 1)
            while j >= 0 and sql[j + 1:j + 2] == '"':
                j = sql.find('"', j + 2)
            if j < 0:
                return None, "an unclosed quoted name"
            cur.append('"x"'); i = j + 1; continue
        if c == ";":
            out.append("".join(cur)); cur = []; i += 1; continue
        cur.append(c); i += 1
    out.append("".join(cur))
    return [re.sub(r"\s+", " ", s).strip() for s in out if s.strip()], None


def judge(patch):
    added = []
    for l in patch.split("\n"):
        if l.startswith("+"):
            added.append(l[1:])
        elif l.startswith(("@@", " ", "\\")) or l == "":
            continue
        else:
            return "no: a removed line in a new migration"   # a new file's patch has only added lines
    sts, why = statements("\n".join(added))
    if sts is None:
        return f"no: {why}"
    for s in sts:
        if NEVER.search(s) or not any(a.search(s) for a in ALLOW) or (s.upper().startswith("ALTER TABLE") and NOT_IN_ALTER.search(s[len("ALTER TABLE"):])):
            return "no: " + s[:80]
    return "yes"


if __name__ == "__main__":
    print(judge(sys.stdin.read()))
