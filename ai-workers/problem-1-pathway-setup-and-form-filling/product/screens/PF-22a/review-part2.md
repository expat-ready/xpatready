# PF-22a part 2 review: CustomFieldPort, the custom-field routes, the front office's three kinds (round 1)

Independent reviewer (did not build it), 26 Nov 2026. Commit: **614a425d935902897d5c31e343d664384055f289** (branch `claude/runtime-pf22a-routes`). Diff: `origin/claude/nice-turing-ue036e..HEAD`, 9 files, +745, API only.
Read: BACKLOG PF-22a; #3639's body (plan, part 2) and comments (round-3 Minors carried to part 2); PF-22s `concept-draft.md` §3 and §6; `challenge.md` (M4, M5, M6, m8, m9, m10); the migration; STANDARDS §4–§7; `ports/audit.ts`; `platform/http/if-match.ts`.

**Verdict: Ship after fixes (Changes).** No Blocker. 3 Majors: valid values on two ordinary fields give a 500, and the stale-save contract is missing. All three are local fixes.

## What I ran
* `check_pf22a_custom_fields` at the head: 36/36. I also ran a copy of it with 12 probes added (scratch database, dropped afterwards). Results are below as R1–R12.
* Mutations on a scratch copy of `api/` and `ports/` (copy removed afterwards). With all four applied, the suite is still **36/36**: (a) `seesPerson` without its prospect branch (`subjectOf` / `primaryContactOf`); (b) the un-archive limit check removed; (c) `keyFromLabel(text, [])`, which ignores taken keys; (d) the record's advisory lock in `put` removed.
* JS vs database trim, every code point in the Basic Multilingual Plane (BMP): `trimText` and `pf_custom_trim` give the same blank set (no difference either way). The round-3 Minor (U+0085, U+200B) is met.
* Two PUTs sent in parallel on one version: one 200, one 409 `STALE_VERSION` (R5). The 51st field and un-archiving at 50 are both 422 `LIMIT_REACHED` (R12). Archive and re-add "Spare" gives `spare_2` (R8). The prospect's own Agent, who is not the lead's owner, reads the person: 200 (R9, m10 holds).
* Not re-run: the neighbouring suites (the builder's list, all exit 0).

## Findings
**M1 (Major, Must): a value of a field whose key looks like a secret is never saved: 500 and an audit alarm.** `service.ts:262,267-268` puts values in the audit line's before/after under the field key. `AuditValues` refuses any key matching `SECRET_FIELD` (`ports/audit.ts:41`), and that test matches substrings: credential, token, hash, salt, otp, cookie, session_id, pwd, … Failing scenario (R1): an Owner adds the CHECKBOX "Credential assessment" (key `credential_assessment`; the Educational Credential Assessment is an everyday immigration field). The Agent saves it as `true`: **500 "Internal server error"**, `audit_write_failed` raised, nothing saved. The add itself succeeds, so the field shows but can never be filled. "Salt Lake office", "Hashtag", "Cookie consent" and "Footprint" (it contains "otp") fail the same way.
Fix: name before/after by a neutral key that the port's secret check cannot match (for example `f_<field id short>`, with the key and label in detail). Or refuse such a label at add, in plain words. Either way, add a fail test.

**M2 (Major, Must): a LONG_TEXT value of 4,001–5,000 characters gives a 500.** `ports/custom-fields.ts:22,92` and the database allow 5,000 characters. The audit port's `ValueScalar` allows only 4,000 (`ports/audit.ts:38`). Failing scenario (R2): add LONG_TEXT "Background notes" and PUT 4,500 characters: **500**, an audit alarm, nothing saved.
Fix: make the audit copy fit (for example, the first 4,000 characters plus a marker, with a test). Or cap LONG_TEXT at 4,000 in both the shared rule and the copy. That second choice changes the database check, which needs the Lead.

**M3 (Major, Must): the stale-save contract is short of STANDARDS §4 [M] ("stale save → 409 with what changed") and of challenge M5.**
* (a) `service.ts:246`: the 409 `STALE_VERSION` body has no latest values and no changed keys (R4: `{type,title,status,detail,code}` only). The house shape is `current: {…, version}` (`front-office/people/edit.ts:80,119`). The builder's own recommended answer to M5 also said "with what changed".
* (b) `routes.ts:301`: the PUT is not `@Versioned()`. Challenge M5 names PF-31's door, and `if-match.ts:41` refuses If-Match on an unmarked route with a 422 ("This change does not take a version").
* (c) Field PATCH has no version (`service.ts:143-196`; challenge M5's fix line: "Field PATCH … use their own updatedAt"). `options` replaces the whole list (`:161-170`). Failing scenario: Admin 1 opens Tier [Gold, Silver]. Admin 2 adds Bronze. Admin 1 sends [Gold] to remove Silver. Bronze is silently lost.
Fix: return `current` (the `read()` answer) and the changed keys on 409; mark the PUT `@Versioned()`; give PATCH a version (`updatedAt`), with a 409 test.

**Minors (Should)**
* **m1: firm-wide counts go to every staff member** (challenge m8, no Lead ruling recorded). `service.ts:83-92` sends `valueCount` and `optionUse` on the `@AnyStaff` list (`routes.ts:292`). R6: a `view.own` Agent reads "Maple Law: 1" across the firm. Fix: send counts only to holders of `agent/custom-field:manage`.
* **m2: four rules have no failing test.** STANDARDS §7 [M]: the four mutations above all survive. Add tests for:
  * the person read through the prospect (m10);
  * un-archive at 50 (m9);
  * archive and re-add through the API giving `_2` (M4);
  * two parallel PUTs.
  The `extra_float_digits` test that #3639 round 3 assigned to part 2 is also missing.
* **m3: plain words.** `records()` (`service.ts:46`) gives "1 prospect have a value", which the test pins at `check_pf22a_custom_fields.ts:176`, and "persons" for `fo_person`. `:191` gives "1 values kept". `:176` says "Send confirm to archive it." Fix: "1 prospect has", "people", and a sentence without the API word.
* **m4: an audit line for no change.** With `position` on an archived field, `place` is skipped (`service.ts:186`), but `moved` is still true (`:187`). R7: 200, the position is unchanged, and one more `custom_field.changed` line is written. Fix: count it as moved only when `place` ran.
* **m5: an archive without the confirm can race with the first value.** The count (`:154`) is read under the kind lock, but `put` never takes that lock. A value committed between the count and the UPDATE archives a field in use without `confirm`. The values are kept, so the harm is low. Fix: take the record lock order the migration header describes, or re-count after the UPDATE.
* **m6: the version hash leaves out the value** (`service.ts:208`: id + `updatedAt` in milliseconds). Two saves of one row within the same millisecond (for example, an import) look unchanged. Fix: hash the value as well.

## The five deliberate choices
1. **Unregistered kind: 400 in a query or body, 404 in the values path.** Agreed. PF-28's rule is that a path segment is an address. The row's test ("an unregistered entity kind → 400") holds on list and add. Say the deviation in the PR body.
2. **Definitions readable by any staff member.** Agreed for the definitions, which the panel needs. Not for the counts (m1).
3. **Version = a hash of the record's value rows, read under the record's advisory lock.** It holds: R5, and a cleared row changes the hash. Weak spot: m6. Missing: the 409 body (M3).
4. **Values in the audit before/after, never in summary or detail.** Right (P-687, QA-594, and the test at `:159`). It is also the cause of M1 and M2: the port's limits were not mirrored.
5. **PATCH with nothing to change → 422.** Agreed, consistent with `strict`.

## D1–D20 (API only; screen dimensions N/A)
D1 3: every Done-when line of the row has a pass and a fail; M1 and M2 break valid input · D2 3: walls, locks and database triggers hold; field PATCH loses updates (M3c) · D3 4: one shared rule (`ports/custom-fields.ts`), the trim matches the database · D4 N/A · D5 3: two 500s; the 409 cannot show the conflict · D6 4: one audit line per change, fail-closed · D7 N/A · D8–D14 N/A (no screen) · D15 4: 4 queries per list, one per save · D16 3: four rules survive their removal · D17 simulated only, N/A · D18 4: before/after carry the values · D19 N/A (part 2 of 5) · D20 simulated only.
**BIC-01–20:** N/A (not a case-side screen, EXPERIENCE §6 scope). **Graph:** the builder's `graph.mjs --check` was G1 0, G2 0; every route here is named by the suite.

## Journey score (reviewer, API journeys): 5.5 of 8 applicable = 6.9/10, below the pass
Details: `journey-test-reviewer-part2-2026-11-26.md`. Task ½ (M1, M2) · next step ½ (M3a) · words ½ (m3) · feedback ½ (500s with no words) · correct data 1 · recovery ½ · speed 1 · trust 1 · accessibility and visual quality N/A (no screen).

## Could not check
* The full app with the global `IfMatchVersion` interceptor: M3(b) is read from `if-match.ts:41`. In the test app, If-Match gave 422 "version: This is required".
* Whether part 1's EMAIL and URL `[[:space:]]` (not pinned to `pg_c_utf8`) disagree with JS on a non-C cluster. On this cluster, an email with U+0085 inside saved (R3).
* No screen, so no walk, axe or widths. D17 and D20 stay with the founder. M6 "required" is still a founder question: the build follows the recommended "refuse on Save fields only".

Reviewer: Changes 614a425d935902897d5c31e343d664384055f289

## Round 2 (diff-only): `614a425d9..80ff11890a475870eb49be1aedb5ab78e91c8856`
**Verdict at 80ff11890: Ship after fixes (Changes).** Each round-1 item is fixed, but the fixes opened two new 500s (R2-M1, R2-M2). The head moved to **71ce172e3** while I was checking. That commit fixes both, and I re-checked it (end of this section).

**Round-1 items at 80ff11890**
* **M1: fixed.** Before/after are keyed `cf_<32 hex>`. Hex has none of the letters `SECRET_FIELD` needs (s, r, t, o, h, l, …), so no field id can trip it. Detail lists `fieldIds`. The suite's C7 test saves "Credential assessment" (200).
* **M2: not fixed for all text.** See R2-M1.
* **M3: fixed.**
  * The 409 carries `current`. With PF-31's `IfMatchVersion` added to my probe app as an app-wide interceptor, a PUT with only If-Match gives 200 plus an ETag, and a stale If-Match gives 409 `STALE_VERSION`.
  * A field PATCH takes `version` and answers a stale one with 409 and `current` (C7).
  * One weakness in `changed`: see r2-1.
* **m1 to m6: fixed.**
  * m1: counts are null without the key.
  * m2: three of the four round-1 mutations now fail the suite every time. The fourth (the record lock) is timing-dependent: see r2-3.
  * m3: the wording is fixed.
  * m4: no audit line for a place on an archived field.
  * m5: the fix brought in R2-M2.
  * m6: the hash includes the value.
* **Breaker items: sound.**
  * NUL, a lone surrogate and year 0000 are refused with 422.
  * `__proto__` in `values` is refused with 422.
  * A save holds at most 100 keys.
  * Values are now written as raw `::jsonb` (Prisma's Json write rounded 0.1+0.2). That keeps the wall: the suite and the walls hold.

**R2-M1 (Major, Must; fixed at 71ce172e3): long text with emoji is still a 500.**
* `audited` at 80ff11890 counts code points (`[...v].length > 4000`, cut at 3,990 code points), but `AuditValues` counts UTF-16 units (`z.string().max(4000)`).
* Probe: a LONG_TEXT of 2,100 emoji (2,100 code points, 4,200 units) is not cut and returns **500**. 5,000 emoji, cut to 3,990 code points (7,980 units), also returns 500.

**R2-M2 (Major, Must; fixed at 71ce172e3): reordering while Agents save causes deadlocks (500).**
* m5's `select … for share` on every field of the kind (`service.ts:269` at 80ff11890) takes field rows in scan order. `place()` updates rows in position order while holding the moved field FOR UPDATE.
* Probe: 25 rounds of 2 reorder PATCHes plus 6 PUTs on different prospects gave **20 × 500**. Postgres reported `40P01 deadlock detected` at `service.ts:269` and at the raw value write (`:298`).
* With one reorder per round: 0 in 25 rounds. The window is real but needs overlap.

**Minors (Should), open at both heads**
* **r2-1: `changed` names the caller's own edits, not what the other person changed.** It lists keys the caller sent whose current value differs from the value sent. Probe Q3b: the Owner changes `ratio`; the Agent, on the old version, sends only `case_notes`. The 409 says `changed: ["case_notes"]` and never names `ratio`. A screen that highlights `changed` would point at the wrong field.
  Fix: drop `changed` and let the screen diff its loaded values against `current` (the house shape is `current` only, `people/edit.ts:80`). Or rename it to what it is.
* **r2-2: the firm's Activity log will show `cf_41154cae…: 0.30000000000000004 → 7`.** `changesOf` (`firm-read/render.ts:12`) prints the key as it is, and P-687 shows these lines in full. An id where the field's name should be fails D10 ("no hashes, IDs").
  Fix: have AUD-4's render map `cf_<id>` to the field's label. That needs AUD-4's owner, so record it in the PR as a known gap with a row. Don't go back to the key.
* **r2-3: the two race tests depend on timing.**
  * With the record lock removed (on 71ce172e3), the parallel-PUT test passed one run in three (`[200,200]` was caught twice).
  * The new 12-round reorder test sends one PATCH with one PUT. My one-reorder pattern found no deadlock on 80ff11890 in 25 rounds, so this test would probably not have caught R2-M2.
  * Fix: force the interleaving. For example, hold the kind or record lock open in a second session (`psql`, `pg_advisory_xact_lock`), start the request, then release.

**71ce172e3 (checked after the head moved, `80ff11890..71ce172e3`)**
* `put` now takes `pg_advisory_xact_lock_shared` on the kind key that `add` and `change` hold exclusively. Every writer takes locks in one order (record, then kind) and touches field rows only under that lock, so there is no cycle. My R2-M2 probe: 200/200 responses were 200, no deadlock.
* `audited` cuts by UTF-16 units and never leaves half a surrogate pair. Probe: 2,100 and 5,000 emoji both give 200.
* The `__proto__` error now names its key.
* Suite at 71ce172e3: **50/50**.
* No new Blocker or Major in that delta. Only r2-1 to r2-3 stay open.

**Journey score, round 2:** 6.5/8 = 8.1 at 80ff11890 (task ½ and feedback ½ for the two 500s; trust ½ for r2-2). 7/8 = 8.75 at 71ce172e3. The pass needs 8; with r2-2 open, trust stays at ½.

Reviewer: Changes 80ff11890a475870eb49be1aedb5ab78e91c8856

## Round 3 (diff-only): `71ce172e3..cd73d1b7444fd2f1b7a367a56d785f656721ab5e`
**Ship (Approve).** r2-1 is fixed: the 409 `STALE_VERSION` now carries only `current` (the house shape), and the unused `byKeyOf` helper is removed. The test now checks `current.values` and that `current.version` differs from the version first read. The suite at cd73d1b74 is **50/50**. The rest of the diff is only my round-2 records. No Blocker or Major is open. r2-2 (the Activity log shows `cf_<id>`; needs AUD-4's owner) and r2-3 (race tests that depend on timing) stay open as Minors; the coordinator says the PR lists them as known.

Reviewer: Approve cd73d1b7444fd2f1b7a367a56d785f656721ab5e
