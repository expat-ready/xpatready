# PF-12b part 2 review: the seven own-firm doors leave the bypass for narrow definer lookups

Reviewed commit `ed4f8c57d08a98e3a739bf3f879db9c2be0e8a5a` (branch `claude/modest-mccarthy-jnk4qb`), read as `git diff origin/main...ed4f8c57`.
I checked it against Lead B's brief `lead-b-briefs/PF-12b.md` ("What to build, part 2", Done when DW5 to DW7, touch list), PF-12's
`platform_web_address_taken`, CS-DL1's `platform_firm_calendar`, PF-15's definer grants, P-600 and rows rev 16.7.
The reviewer is a fresh session that did not build this row. Postgres was on :54329. :4400 was never used: the door suite starts its
own API on a free local port.
This is a backend change with no screen. The screen-only parts of the skill are marked N/A (no UI, no concept, no BIC scope).

## What I ran (all at ed4f8c57, clean tree)
- `tests/check_pf12b_doors.ts`: **29 passed, 0 failed**. It runs the real API as `xr_app` on a scratch database and asks all seven doors.
- `tests/check_pf12_walls.ts` **100/0**, `tests/check_pf12b_bypass_audit.ts` **56/0**, `tests/check_pf25_web_address.ts` **68/0**.
- `tsc -p api/tsconfig.json`: no errors in `api/src` or in the touched tests. The errors that remain are already there in other suites.
- My own SQL check on a scratch copy with every migration, as `xr_app`:
  - a firm's old address held for a redirect resolves to its firm through `platform_web_address_firm`;
  - with `app.firm_id` set to that firm, `xr_app` can read the history row, the current address and the firm's status, which is
    what `resolveAs` reads. With no firm it reads 0 rows.
  - as `xr_staff_bypass`, the lookups answer (the suite and tool direct mode).
  - Why I ran this: the redirect branch under the walls is not in the door suite. PF-25's suite runs it on the owner client.

## Focus questions, answered
- **Wrong keys answer as before.** Every not-found branch still ends in the same helper, so the same status and body:
  - `notFound()` (booking page and link);
  - `unavailable()` (web form);
  - `unauthorized(... "UNKNOWN_STAFF")` (sign-in, guard);
  - the 410 `INVITATION_NOT_VALID` with `state: "NOT_VALID"` (accept). The early throw at `session/service.ts:109` builds the
    same body the in-transaction branch built before.
  - `{ state: "NOT_VALID", words }` (invitation state) and `{ kind: "unknown" }` (host).
  - The suite asserts the codes, and for the form and the self-service link it asserts identical bodies.
- **Accept now runs its whole transaction as the invitation's firm** (`session/service.ts:110`). Every write carries `inv.firm_id`:
  - staff, grants, the money-keys line, the invitation update, both audit lines and `moduleEvent`;
  - the firm lock (`for no key update`) is visible as the firm, as `inFirm` already relies on;
  - `platform_role_permission` is unwalled (PF-12 migration header), so the inviter re-check reads the same keys as before;
  - the suite's OWNER accept goes through the money-keys path, and the 409 cross-firm path rolls back (no staff made).
- **authenticate** (`identity/service.ts:119-147`):
  - the definer gives the firm, then the staff row, the revocation read and the Cognito `recordSignIn` transaction all run as that
    firm. They were already `firmScope`d, so the rows are the same.
  - the role-key read is on the unwalled catalogue.
  - deactivated and suspended staff still get `STAFF_NOT_ACTIVE`: the definer ignores status.
  - the audit context's firm comes from PF-23's request scope (`audit/context.ts:30`), which this diff does not change.
- **Host routing** (`web-address/service.ts:177-199`):
  - the definer's `coalesce(own address, newest live history row)` picks the same firm that the old unscoped reads picked;
  - `resolveAs` then re-reads as that firm, so own-first, status and expiry behave as before;
  - the same UTC session and `${now}::timestamptz` cast as the existing `platform_web_address_taken` call (`service.ts:81`).
- **Firm A's request meeting firm B's key:**
  - each public door still calls `enterFirm(B)` after its own `withFirm(B)` read, and `enterFirm` refuses a different firm with the
    one 404 (`firm-scope.ts:89`, unchanged). The suite checks this for the web form on A's address.
  - the booking page and link follow the same code path.
  - the guard's `setRequestFirm` and accept behave as on the bypass (accept never called `enterFirm`).
- **The `xr_staff_bypass` grant is sound.**
  - That role is BYPASSRLS and already reads every row, so EXECUTE adds no reach.
  - `xr_app` can already `SET ROLE` to it (PF-12 migration).
  - It has a precedent: PF-15's `platform_entitlement_limit` (`20261118213000_pf15_plan_limits/migration.sql:81`).
  - Without it, a suite or tool calling a door service in direct mode would fail at the lookup.
- **`platform_staff_email_taken` (beyond the brief's seven) is acceptable.** Without it, accept would have to stay on the bypass.
  - It returns a yes/no only, as PF-12's `platform_web_address_taken` does.
  - It is called only with the valid invitation's own email, never with a caller's input.
  - It adds no reach for an `xr_app` compromise, which could already `SET ROLE xr_staff_bypass`.
  - It should be named in the PR body as a deliberate addition.
- **Pattern:** owner `xr_wall_reader`, SECURITY DEFINER, `search_path = pg_catalog, public, pg_temp`, PUBLIC revoked, no dynamic SQL,
  single-value returns. Same as PF-12 and CS-DL1. DW6 checks this from the catalogue, including no overloads and `xr_app` unable to
  alter or drop.
- **Test substitutions keep their meaning:**
  - walls: the inbox (`direct`) and sign-up stand in for the doors in the direct, job-scope, m8, m3, route and line-count checks.
    Each still exercises the same branch of `asBypass` (`firm-scope.ts:161`).
  - the bypass audit suite: M1 and "not named" are now stronger, because they assert the nesting message ("may not run inside")
    instead of any `BypassRefused`.
  - the doors' DW7 moved to the new suite with a before/after count over real HTTP.
  - lost: the walls suite had a case for a use with neither `outside` nor `direct`. No such use is left, so it cannot be kept.

## Issues
1. **Major (Must): the DW6 stamp check asserts "the newest of all".** At `tests/check_pf12b_doors.ts:59`:
   `all.at(-1) === NEW`. Rows rev 16.7 (P-607 memo) says "never the newest of all".
   - The first migration that merges after this one makes the suite fail for good, on the nightly run and on any PR that selects
     it. Under P-600 (1), several schema rows run in parallel, so that will happen soon.
   - Fix: use PF-25's form (`tests/check_pf25_web_address.ts:89-90`):
     `all.includes(NEW) && (all.filter((d) => d < NEW).at(-1) ?? "") < NEW` plus the unique-stamp check.
2. **Minor (Should): a front-office lookup has the wrong area prefix.** The brief (rows rev 15.2, P-600 (1c)) asks for `fo_sales_…`
   or `fo_booking_…`. `fo_web_form_firm` (`migration.sql:30`) is neither. Rename it to `fo_sales_web_form_firm` in the migration,
   rollback, `sales/public.ts:156`, both MODULE cards and the test's list.
3. **Minor (Should): the docs say "EXECUTE for xr_app only", but the migration also grants `xr_staff_bypass`.**
   - Where: `api/src/platform/MODULE.md:13` and the test header (`check_pf12b_doors.ts:3-4`). The migration header and DW6 are
     correct.
   - Fix: say "xr_app, and the bypass role for suites and tools".
4. **Minor (Should): the self-service lookup undoes liveToken's equal timing.** Before, `liveToken` deliberately took the same time
   for an unknown id and a wrong secret (`booking/tokens.ts:35-37`). Now an unknown id stops after one round trip, while a known
   id goes on to a firm switch and a second query (`booking/service.ts:835-837`).
   - This reveals only whether a random token id exists, never the firm, so the risk is low.
   - The brief says "a function that takes a token compares its sha256". `fo_booking_token_firm(id, verifier_hash)` would match it
     and keep the timing even.
5. **Minor (Should): DW5 has no case for the history redirect as `xr_app`** (an old address answering 301). I checked it by SQL
   (above). One `onHost` call on an old address in the door suite would close the gap.

What did not change, and is not a finding:
- one extra query per firm-address request: fine at P-562's scale;
- the overlong comment line at `firm-scope.ts:101-102`;
- the `audit_write_failed` noise in the walls suite: it predates this diff and has no FAIL.

## Scores (D1–D20; backend row)
D1 7: the seven doors are off, as the brief says. The prefix and the brief's "compares its sha256" are not fully met (2, 4) ·
D2 9: accept's locks, rollback and the cross-firm check are kept ·
D5 9: same not-found answers, no new failure mode ·
D15 8: about one round trip added per door, not measured ·
D16 7: real-API pass and fail per door, and catalogue checks. The stamp check will turn red (1) and the redirect case is missing (5) ·
D18 9: comments and MODULE cards updated, apart from (3) ·
D3, D4, D6, D7 N/A ·
D8 to D14 N/A: no UI in the diff ·
D17 and D20 simulated only (no intended user) ·
D19 N/A.
BIC-01 to BIC-20: N/A (no case-side screen). Graph (P-86): no page or element added, and the new suite is named in both MODULE cards.

## Journey score (reviewer, the one score for this check)
**9.5 / 10, pass.** The details are in `journey-test-reviewer-2026-11-21.md`.

## Could not check
- The PR body's Done-when list (I did not open GitHub).
- A real Cognito sign-in (the local stand-in only).
- Timing measured on the wire: point 4 comes from reading the code.
- CI on `main` merged into the branch (the branch is one migration behind `main`, and the stamp is still later).

**Verdict: Block** (Changes needed) for commit `ed4f8c57d08a98e3a739bf3f879db9c2be0e8a5a`. Fix before Approve:
- (1) the DW6 "newest of all" assertion.

Recommended in the same push:
- (2) the `fo_sales_` prefix;
- (3) the stale grant wording;
- (5) a redirect case.

(4) can be done in this push or recorded for later.

---

## Re-review, 21 Nov: head `d1ce265c1f2e084d09e61b24092ec620f7d48950`
Diff only (P-277): `git diff ed4f8c57d08a98e3a739bf3f879db9c2be0e8a5a d1ce265c1f2e084d09e61b24092ec620f7d48950`.
I ran from the shared tree, which was clean at d1ce265c. Postgres was on :54329, and :4400 was never used.

### Runs at d1ce265c
- `check_pf12b_doors` **30/0**. This adds the old-address 301 case.
- `check_fo3_booking` **133/0**. The self-service link goes through the new two-argument lookup.

### The five findings
1. **Fixed (was Major).** DW6 (`check_pf12b_doors.ts:53`) now uses PF-25's form: the folder includes NEW, every stamp before it
   is earlier, and the stamp is unique. A later migration on `main` no longer turns it red.
2. **Fixed.** The function is now `fo_sales_web_form_firm` in the migration, the grant loop, the rollback, `sales/public.ts:156`,
   the front-office card and the test's list. No call to the old name is left. A grep finds `fo_web_form_firm` only in FO-1a's
   index and constraint names, which are unrelated.
3. **Fixed.** The platform card and the test header now name the `xr_staff_bypass` grant.
4. **Fixed.** `fo_booking_token_firm(token_id uuid, token_hash text)` returns the firm only when the id and the secret's hash
   (`hashVerifier`, the same function the stored column uses) both match.
   - An unknown id and a wrong secret are now the same null, after one query each (`booking/service.ts:836-837`).
   - It never returns the stored hash.
   - `liveToken` still checks voided and expired as the firm.
   - This now matches the brief's "a function that takes a token compares its sha256".
5. **Fixed.** DW5 (`check_pf12b_doors.ts:174`) asks for the firm's old address over HTTP as `xr_app` and gets a 301 to the current
   address. The history row and the address change are seeded in one transaction, as PF-25's triggers require.

### Breaker's m2 (`at` trusted in `platform_web_address_firm`)
Left as a note, and I agree.
- It can only be reached by direct SQL as `xr_app`. That role can already `SET ROLE xr_staff_bypass`.
- What leaks is at most the firm id behind an address that has expired.
- PF-12's `platform_web_address_taken` takes `at` from its caller in the same way.
- Over HTTP, `at` is always the server clock.

### New, Minor (nice to have, not blocking)
- `front-office/MODULE.md:24` still lists `fo_booking_token_firm(token id)`. It now takes the token id and the secret's hash.
- No test checks the new rule in finding 4 directly. If the lookup ignored the hash, the doors would still answer 404 through
  `liveToken`, and the suite would still pass. One DW6 line would catch it: `fo_booking_token_firm(<real id>, repeat('0', 64))`
  as `xr_app` should be null.

Scores change only for D1 (now 9: the prefix and token rules are met) and D16 (now 8).

**Verdict: Approve d1ce265c1f2e084d09e61b24092ec620f7d48950**
