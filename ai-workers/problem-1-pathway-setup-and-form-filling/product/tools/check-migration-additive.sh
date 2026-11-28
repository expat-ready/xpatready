#!/usr/bin/env bash
# P-823: migration-additive.py, the allowlist that decides whether a new migration is read after the label (additive)
# or read first. Every SQL case the review rounds of #3661 proved on PostgreSQL, fed as GitHub gives a patch, the way
# queue-gate.sh's destructive() feeds it. Moved here from check-queue-gate.sh so each planted breach of the scanner
# runs in seconds (guards part 1 passed its 45-minute limit with them there); check-queue-gate.sh keeps the rows
# that prove the gate refuses on the scanner's "no". US$0, no network.
#   bash product/tools/check-migration-additive.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
M="$TOOLS/migration-additive.py"
[ -f "$M" ] || { ok "migration-additive.py exists (P-823)" 0 "no $M"; finish; }
scan() { printf '%s' "$1" | python3 -I "$M" 2>&1; }
no() { case "$1" in no:*) echo 1;; esac; }
ADD=$'@@ -0,0 +1,5 @@\n+-- Adds case notes; we never drop or delete one (comment lines are not read)\n+CREATE TABLE "case_note" ("id" TEXT NOT NULL, "case_id" TEXT NOT NULL);\n+CREATE INDEX "case_note_case_idx" ON "case_note"("case_id");\n+ALTER TABLE "case" ADD COLUMN "notes" TEXT;'
v=$(scan "$ADD"); ok "P-823: the additive migration of check-queue-gate.sh (a new table, its index, ADD COLUMN TEXT; a comment saying drop): additive" "$([ "$v" = yes ] && echo 1)" "$v"
# Review of #3661, Blocker 1-2: an allowlist, read by a SQL scanner, so nothing hides in comments, strings or bodies
for c in 'a DROP inside a block comment:+/*'$'\n''+-- */ DROP TABLE "case";' "a DROP after a string that holds --:+INSERT INTO \"n\" VALUES ('-- ');"$'\n''+DROP TABLE "case";' \
         'a DO $$ body:+DO $$ BEGIN EXECUTE '"'"'DR'"'"' || '"'"'OP TABLE x'"'"'; END $$;' 'DELETE /**/ FROM:+DELETE /**/ FROM "case";' \
         'DELETE, a comment, FROM:+DELETE -- x'$'\n''+FROM "case";' 'DISABLE TRIGGER:+ALTER TABLE "case" DISABLE TRIGGER ALL;' \
         'CREATE OR REPLACE FUNCTION:+CREATE OR REPLACE FUNCTION no_delete() RETURNS trigger LANGUAGE sql AS '"'"'select 1'"'"';' \
         'GRANT:+GRANT ALL ON "case" TO PUBLIC;' 'DISABLE ROW LEVEL SECURITY:+ALTER TABLE "case" DISABLE ROW LEVEL SECURITY;' \
         'UPDATE ... SET:+UPDATE "case" SET "notes" = NULL;' 'ALTER COLUMN TYPE:+ALTER TABLE "case" ALTER COLUMN "n" TYPE int;' \
         'ADD then DROP in one ALTER:+ALTER TABLE "case" ADD COLUMN "a" TEXT, DROP COLUMN "b";' "an unclosed string:+INSERT INTO \"n\" VALUES ('x);"; do
  v=$(scan "@@ -0,0 +1,3 @@"$'\n'"+CREATE TABLE \"x\" (\"id\" TEXT);"$'\n'"${c#*:}")
  ok "P-823 plant (#3661 review): ${c%%:*}: not additive (read first)" "$(no "$v")" "$v"
done
# The scanner's own refusals: without them a quote inside a block comment or a dollar string would swallow a real DROP
HIDE1=$(cat <<'SQL'
@@ -0,0 +1 @@
+CREATE TABLE "x" ("id" TEXT) /* ' */; DROP TABLE "case"; -- '
SQL
)
HIDE2=$(cat <<'SQL'
@@ -0,0 +1 @@
+COMMENT ON TABLE "x" IS $$ '$$; DROP TABLE "case"; -- '
SQL
)
for h in HIDE1 HIDE2; do v=$(scan "${!h}")
  ok "P-823 plant (#3661 review): a DROP after a quote inside a $([ $h = HIDE1 ] && echo block comment || echo dollar string): not additive (read first)" "$(no "$v")" "$v"; done
# Review 2 of #3661 (B1-B2, M3, M4): $ tags, $-names, function calls, existing tables, more ALTER actions
R2=$(cat <<'SQL'
dollar tag with a digit|COMMENT ON TABLE "x" IS $a1$'$a1$; DROP TABLE "User"; --';
an E after a $-name|CREATE TYPE q$E AS ENUM ('\'); INSERT INTO t (c) VALUES (q$E'\'); DROP TABLE "User"; --');
setval in an insert|INSERT INTO "AuditLog" ("n") VALUES (setval('x', 1));
an insert into an existing table|INSERT INTO "RolePermission" ("role", "perm") VALUES ('BUILDER', '*');
CREATE TABLE AS|CREATE TABLE "junk" AS SELECT 1;
a trigger on an existing table|CREATE TRIGGER "t" BEFORE INSERT ON "Payment" FOR EACH ROW EXECUTE FUNCTION existing_wipe();
GENERATED with a function|ALTER TABLE "Fee" ADD COLUMN "c" int GENERATED ALWAYS AS (existing_fn("id")) STORED;
FORCE ROW LEVEL SECURITY|ALTER TABLE "Fee" ADD COLUMN "c" int, FORCE ROW LEVEL SECURITY;
REPLICA IDENTITY and SET (|ALTER TABLE "Fee" ADD COLUMN "c" int, REPLICA IDENTITY NOTHING, SET (autovacuum_enabled = false);
DEFAULT with a function call|ALTER TABLE "Fee" ADD COLUMN "c" TEXT DEFAULT gen_random_uuid();
IF NOT EXISTS hides an existing table|CREATE TABLE IF NOT EXISTS "User" ("id" INTEGER); INSERT INTO "User" ("id", "role") VALUES (99, 'admin');
a quoted function call in DEFAULT|ALTER TABLE "User" ADD COLUMN "z" BIGINT DEFAULT "setval"('"User_id_seq"', 1);
a quoted function call in CHECK|ALTER TABLE "User" ADD CONSTRAINT "ck" CHECK ("setval"('"User_id_seq"', 5) > 0);
a schema-qualified quoted call|ALTER TABLE "User" ADD COLUMN "z" TEXT DEFAULT pg_catalog."version"();
a trigger on a new table calling an existing function|CREATE TABLE "Log" ("id" INTEGER); CREATE TRIGGER "t2" AFTER INSERT ON "Log" FOR EACH ROW EXECUTE FUNCTION audit(); INSERT INTO "Log" VALUES (1);
two names that differ only in a dash|CREATE TABLE "_Role-ToUser" ("A" INTEGER); INSERT INTO "_Role_ToUser" ("A") VALUES (1);
a cascading FK onto existing rows|ALTER TABLE "Child" ADD CONSTRAINT "c_fk" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;
a comment wiped|COMMENT ON TABLE "User" IS NULL;
attribute notation runs a function|ALTER TABLE "User" ADD CONSTRAINT "c" CHECK ("User".audit > 0);
attribute notation in an insert|CREATE TABLE "New" ("id" INT); INSERT INTO "New" VALUES (('(1,a,1)'::"User").audit);
two names that differ only in spaces|CREATE TABLE "Audit  Log" ("id" INT); INSERT INTO "Audit Log" VALUES (7);
a comment emptied|COMMENT ON TABLE "User" IS '';
ON UPDATE CASCADE onto existing rows|ALTER TABLE "Post" ADD CONSTRAINT "p_fk" FOREIGN KEY ("u") REFERENCES "User"("id") ON UPDATE CASCADE;
a NOT VALID check|ALTER TABLE "User" ADD CONSTRAINT "pos" CHECK ("n" > 0) NOT VALID;
a sequence owned by an existing column|CREATE SEQUENCE "s" OWNED BY "User"."id";
an insert before the CREATE TABLE of its name|INSERT INTO "User" ("id") VALUES (99); CREATE TABLE "User" ("id" INT);
a cascade before the CREATE TABLE of its name|ALTER TABLE "User" ADD CONSTRAINT "f" FOREIGN KEY ("p") REFERENCES "p"("id") ON DELETE CASCADE; CREATE TABLE "User" ("id" INT);
a comment overwritten|COMMENT ON TABLE "User" IS 'pwned';
Lead 12:50 narrowing: an enum|CREATE TYPE "Kind" AS ENUM ('a', 'b');
Lead 12:50 narrowing: ADD VALUE|ALTER TYPE "Kind" ADD VALUE 'c';
Lead 12:50 narrowing: ADD COLUMN with a default|ALTER TABLE "case" ADD COLUMN "n" TEXT DEFAULT 'x';
Lead 12:50 narrowing: ADD COLUMN of an enum type|ALTER TABLE "case" ADD COLUMN "k" "Kind";
Lead 12:50 narrowing: an index on an existing table|CREATE INDEX "i" ON "case"("x");
Lead 12:50 narrowing: an FK added by ALTER|CREATE TABLE "n" ("id" TEXT); ALTER TABLE "n" ADD CONSTRAINT "f" FOREIGN KEY ("id") REFERENCES "p"("id");
Lead 12:50 narrowing: an insert into a new table|CREATE TABLE "n" ("id" TEXT); INSERT INTO "n" ("id") VALUES ('a');
a function call in a new table's DEFAULT|CREATE TABLE "n" ("id" TEXT DEFAULT gen_random_uuid());
a quoted call in a new table's DEFAULT|CREATE TABLE "n" ("id" BIGINT DEFAULT "setval"('x', 1));
attribute notation in a new table's CHECK|CREATE TABLE "n" ("id" INT CHECK ("User".audit));
a user operator in VALUES|CREATE TABLE "t" ("a" INT); INSERT INTO "t" ("a") VALUES (1 ### 2);
a user operator in a CHECK|ALTER TABLE "User" ADD CONSTRAINT "c" CHECK ("n" ### 1 = 1);
a user operator in a DEFAULT|CREATE TABLE "t" ("a" INT DEFAULT 1 ### 2);
a user operator in an index|CREATE INDEX "i" ON "User" (("n" #~# 1));
SQL
)
while IFS='|' read -r what sql; do [ -n "$what" ] || continue
  v=$(scan "@@ -0,0 +1 @@"$'\n'"+$sql")
  ok "P-823 plant (#3661 review 2-3): $what: not additive (read first)" "$(no "$v")" "$v"
done <<< "$R2"
ALLF=$(cat <<'SQL'
@@ -0,0 +1,6 @@
+CREATE TABLE "n" ("id" TEXT NOT NULL, "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "amt" DECIMAL(65,30), "p" TEXT REFERENCES "p"("id") ON DELETE CASCADE, CONSTRAINT "n_pkey" PRIMARY KEY ("id"));
+CREATE UNIQUE INDEX "n_p_key" ON "n"("p");
+ALTER TABLE "case" ADD COLUMN "kind" TEXT;
+ALTER TABLE "case" ADD COLUMN "score" DOUBLE PRECISION NOT NULL;
+ALTER TABLE "case" ADD COLUMN "seen_at" TIMESTAMP(3);
+ALTER TABLE "case" ADD COLUMN "tags" TEXT[];
SQL
)
v=$(scan "$ALLF"); ok "P-823: the three allowed forms (the tech lead, 12:50 IST): a new table, an index on it, ADD COLUMN of a built-in type with no default: additive" "$([ "$v" = yes ] && echo 1)" "$v"
finish
