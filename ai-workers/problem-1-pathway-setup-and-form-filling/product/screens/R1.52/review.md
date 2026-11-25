# R1.52 part 1 (PF-19m mailbox tables): independent review

PR #3653 · reviewed head **ca2e17127b1830b458544077e39ec7c31705ab43** · reviewer agent (fresh context; did not build it) · 25 Nov 2026.
Scope: BACKLOG row PF-19m (Done when), P-600 (parallel schema rows), PF-12 walls, the PF-18n/PF-19a pattern, shape `screens/R1.52/shape.md`
and Lead 5's approval (PR comments 11:17 and 11:22 IST). Requirements: AG-10-3, -4, -9, -12, -62, -69, AG-16-18, SA-11-37.
This is not a screen. D8–D15, D17, D20 and the BIC-01–20 scorecard are N/A (no page, no route). No server was started, so no port was
used (never :4400). The journey test is in `journey-test-reviewer-2026-11-25.md`, score **8.1/10, pass**.

## Verdict
**Ship after fixes (Changes) for ca2e171.** It has one Blocker, B1. The builder pushed **4e2c002** during this review, and that commit
fixes B1. I read its 3-line diff against ca2e171 (folder rename, one test constant, one schema comment), ran the PF-19m test on it
(35/35) and ran the SPD-2 guard on it (PASS). No Blocker or Major is open at 4e2c002. My Approve covers **4e2c002 only**; the label must
not go on ca2e171.

## What I ran (my own scratch copies: `git archive` of the head plus scratch databases `xr_studio_pf19m_*_<pid>` and `xr_studio_rv_pf19m`)
* `check_pf19m_mailbox_schema.ts` at ca2e171: **35 passed, 0 failed**. At 4e2c002: 35/35.
* Full `prisma migrate diff` (DB → schema) after every migration on a demo-data copy: **"No difference detected"**, so there is no drift.
* `check_pf12_walls.ts` at ca2e171: the database guards pass, including "every firm table's policy names the session's firm" and "trigger
  functions run as xr_wall_reader". Five lines fail only in my partial extract (missing `prototype/p2/ledger.ts`, P2022 on a shared Prisma
  client). Those five start the API and are not database rules; the builder reports 110/110 in the full tree.
* `migration-slots.py check origin/main..<head>`: ca2e171 REFUSED (B1); 4e2c002 PASS. `graph.mjs --check`: exit 0.
* **Mutation runs (is each rule's test honest?):** with the one-main index removed, DW1 fails. With the credential check removed, DW3 fails.
  With the msg_email policy removed, DW4 fails. With the email trigger removed, DW5 fails. With the one-live-address index removed, DW1
  fails. With `AND NOT "is_main"` removed, **35/35 still pass** (m8).
* **Break-it probes as `xr_app` with the firm set** (`scratchpad/probe/probe.sh`). With no firm set, reads return 0 rows and writes get
  42501. TRUNCATE gets 42501. The purge cascade to msg_unmatched works under the walls. Firm B updates nothing of firm A's. Disconnecting
  the main mailbox while it is still main gets 23514. The scenarios in m1–m7 are the ones that were accepted.

## What held
* **P-600:** (a) the tables are its own and the schema file is the one the row names; the one line in platform.prisma is in the
  PF-19a back-relation slot, following the PF-18n precedent. (b) Additive only; the test proves it alters no other table and drops nothing.
  (c) Both functions and both triggers are `msg_`; the shared first gate is reused. (d) Stamp 20261125060000 is later than main's newest,
  20261124170000. (e) The Lead's read is pending.
* **Done when, each with a pass and a fail case:** a second main address gets 23505; the same provider id in one mailbox gets 23505;
  there is no token-like column and a raw token gets 23514; firm B reads none of firm A's mailboxes or email; the migration runs on empty
  and demo-data copies with demo rows unchanged.
* Firm and cross-firm safety: composite keys `(firm_id, mailbox_id)`, `(firm_id, owner_staff_id)` and `(firm_id, email_id)` stop
  cross-firm references (23503). firm_id is first in every index. The forced policy and first gate are on all four tables. The definers
  run as xr_wall_reader with search_path pinned, as in PF-18n.
* The credential check matches `ports/secret-box.ts:28 SealedSecret` and the real `sb1.v<n>.<iv>.<tag>.<ct>` format of aes-gcm.ts:8.
  `last_error_code` holds a code, never the provider's words (SA-11-37). Subjects and bodies never appear in a check or an error message.

## Findings
**Blocker**
* **B1 (Must). The migration folder has no area (SPD-2, on main since 63f5cc913).** `prisma/migrations/20261125060000_pf19m_mailboxes/`.
  Failing scenario: `python3 product/tools/migration-slots.py check origin/main..ca2e171` prints `REFUSED … its name carries no area`
  and exits 1. This is the ci "fast" job's check, so ca2e171 cannot merge. Fix: `git mv` to `20261125060000_platform-messages__pf19m_mailboxes`.
  **Done in 4e2c002** (guard PASS, test 35/35). Also, `pr-rules` was red at ca2e171 ("MISSING: no Done when" in the PR body); it is green at 4e2c002.

**Major:** none.

**Minor** (Should, each one a gap a later part will hit)
* **m1. Disconnect-and-purge race (AG-10-4).** migration.sql:176-190: `msg_email_write` fires only BEFORE UPDATE OR DELETE, and
  `msg_mailbox_write` (161-173) still lets `sync_cursor` and `last_checked_at` change on a DISCONNECTED row. Scenario: the 5-minute sync job is mid-run, a
  disconnect purges, then the job inserts `late1` into the DISCONNECTED mailbox. The insert is accepted, so unfiled personal data is
  stored again after the promised purge. Fix: a BEFORE INSERT on msg_email that refuses a DISCONNECTED mailbox, and freeze the cursor
  once DISCONNECTED. If not done here, PF-19mc's purge test must cover the race.
* **m2. "A filed email is kept" holds only within one statement.** Un-filing all five columns and then deleting removes a filed email
  (probe P8). That path is probably intended (un-file per SA-11-39; the PF-21d eraser), but the header (line 8) and the PR body say "kept"
  without it. Fix: say so in the header, so PF-19mi/PF-21d rely on it knowingly.
* **m3. Unmatched can disagree with its email.** An OPEN `msg_unmatched` row on a filed email is accepted (P9), and nothing ties LINKED
  to the email being filed. Fix: a check in `msg_email_write`, or a pass/fail test in PF-19mi.
* **m4. Personal-mailbox privacy is app-only (AG-10-69; AG16-89 (1): from a personal mailbox, unknown senders "are never stored").**
  The walls are firm-wide: every staff session of the firm can read every unfiled personal-mailbox email and Unmatched row. Fix: none
  needed in part 1, but the schema header should name the rule and its owner (PF-19mi), and PF-19mi needs a failing case (a colleague
  reads another person's unfiled mail and gets nothing).
* **m5. Address and actor checks are weaker than the same file family's.** Lines 139 and 158 use `^[^@\s]+@[^@\s]+$` (accepts `a@b`,
  a trailing dot, non-ASCII), whereas PF-19a uses `msg_address_ok('EMAIL', …)`, the form the consent gate looks up. `to_addresses` and
  `cc_addresses` are not lower-cased (P11: `{Info@A.Example}` accepted) while `from_address` is. `connected_by`, `resolved_by` and
  `created_by` have no `msg_actor_ok` check. Scenario: a send-as-mailbox consent lookup (part 5), or the matcher on a learned link,
  misses on a case or format difference. Fix: reuse `msg_address_ok` on the mailbox address and the address link, lower-case the to/cc
  arrays, and use `msg_actor_ok` on the actor columns.
* **m6. `fake1.` values pass the credential check (line 143).** A fake-sealed value is the plaintext token in base64url
  (`ports/secret-box.ts:109`); P10 was accepted. This matches the port, but "no raw token in this table" is only a shape guarantee.
  Note it in the header.
* **m7. The main address cannot be swapped in one statement.** `UPDATE … SET is_main = (id = B)` gets 23505 on the non-deferrable
  partial index (P6), and two concurrent "first connect" requests race in the same way. PF-19mc must unset and then set inside one transaction, and
  map 23505 to a plain message. No change is needed here; name it in the hand-over.
* **m8. Test gaps.** The DISCONNECTED-is-never-main rule (line 144) has no failing case: the mutation leaves 35/35. The DW4 write
  refusal asserts only `!== ""` (test:120-121), so any error passes; assert 42501. The purge cascade (test:138) runs only as the
  superuser; I checked it as xr_app (P3) and it holds.
* **m9. Records (P-557).** `shape.md` still says "for the tech lead's approval" and still has part 2 building the OAuth helper and the
  Q4 recommendation "any staff". Lead 5's (a)–(c), the founder's Q4 ruling (Owner and Admin only) and "Q1–Q3 later" exist only in PR
  comments. Fix: an "Approved" block in shape.md.
* **m10. `REVOKE TRUNCATE … FROM xr_data` (line 191) does nothing.** xr_data never had TRUNCATE (PF-12 lines 172-175). The owner can
  still TRUNCATE msg_email, which defeats "filed is kept". PF-19a's kept tables use `*_no_truncate` triggers (pf19a lines 375-398).
  Fix: add `msg_mailbox_no_truncate` and `msg_email_no_truncate`, or remove the line.

## Dimensions (1–5; the rest N/A, as above)
D1 requirement fit 4: every Done-when line holds; AG-10-3 registry validation and AG-10-69 visibility are left to later parts (m4).
D2 data integrity 4: duplicates, cross-firm references and half filings are refused; m1, m3 and m5 are open.
D3 reuse 4: reuses PF-12's gate, policy and roles and SecretBoxPort's format; it does not reuse `msg_address_ok` or `msg_actor_ok` (m5).
D5 stability 4: the migration is idempotent on copies and DISCONNECTED is final with reconnect as a new row; m7 is open.
D6 governance 4: requirement ids, a rollback block and a header per rule are present; m9 is open.
D16 testability 4: each Done-when line has a pass and a fail case, and the mutations fail as they should, except m8.
D18 provenance 5: every rule cites its source. D19 N/A: this is part 1 of 8.

## Could not check
The Lead's read of the migration diff (P-600 (e)). The full CI run (draft PR: `ci` was skipped). RDS non-superuser behaviour.
PF-12 lines that start the API (my partial extract). An intended user's walk (D17 and D20 stay with the founder).

Reviewer: Changes ca2e17127b1830b458544077e39ec7c31705ab43
Reviewer: Approve 4e2c0028fabb0915b619b6d0f9f500afe2e96c67 (B1 fixed; only Minor findings open)
