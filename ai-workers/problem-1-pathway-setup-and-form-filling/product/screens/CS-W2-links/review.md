# Review: CS-W2 part `links` (PR #3823, head 8ddd1cdc7bde48962cd6297a0b69e2ca00358034)

Reviewer (Opus, fresh context, did not build it), 26 Nov 2026. Scope: BACKLOG row CS-W2 (R1.3), brief `design/briefs/CS-W2.md` part 2,
contract v0.1 §8 steps 2 and 2a, conditions 1 and 3; CS-W1's `case_firm_fill`; CS-W3 part 1's `20261121100000_csw3_case_door`.
This part changes only the schema and adds no screen. D1–D20 and the BIC table do not apply because nothing visible changes. The journey score is below.
I ran isolated copies through `run-suites.sh --only` (ports +14000, never :4400) and one scratch database on 127.0.0.1:54329, which I dropped afterwards. I edited no code.

**Verdict: Ship.** No Blocker or Major is open. The Minors are listed for the PR body and for CS-W1 part 2 or part `keys`.

## What I ran (all on 8ddd1cdc)
| Check | Result |
|---|---|
| `check_csw2_links.ts` (own copy) | 22/22, exit 0, 43 s |
| `check_csw1_firm_id.ts` · `check_csw3_firm_scope.ts` · `check_prisma_schema.ts` (`migrate diff` empty) | 47/47 · 48/48 · 8/8 |
| `check_c616_privacy.ts` · `check_demo_link.ts` · `check_pf12b_doors.ts` · `check_pf8b_f4_migrations.ts` | 48/48 · 5/5 · 33/33 · 9/9 |
| `check_d1_reset_to_six.ts` (demo reset path, fresh copy) | 25/25 |
| `migration-slots.py check <merge-base>..HEAD` | PASS. 1 new migration, after main's newest (20261125150000). Main has no newer migration |
| Breaker probes P1–P9 on a scratch database with every migration applied (firm A, firm B and a key with no platform firm; `xr_app` where it matters) | see below |

## Judgement on the asked points
* **Backfill:** parents go first (link from case, then session and message from link), before the triggers and keys exist. A second run returns 0.
  A case whose key has no platform firm stays empty and never takes another firm's id. The pre-key `DO $chk$` stops on a cross-firm supersede and names the link.
* **Fill:** `case_firm_fill` is set on all three tables with the right parent. It fills an empty value, refuses a named other firm, refuses the session's firm B under a firm A link,
  and refuses the session's firm under a link with no firm (P6). An empty string is read as none (P6c).
* **Keys:** `person_link_session` and `demo_message` have `(link_id, firm_id) → person_link (id, firm_id)` with `ON DELETE CASCADE ON UPDATE RESTRICT`.
  Each refuses a cross-firm insert with the fill set aside, and a cross-firm update of `link_id`. A delete cascades, and SetNull on `supersededBy` still works.
* **`case_links_firm_keep` pre-empts #3811's round-1 M1.** I could not empty or change a set firm as `xr_app`. I tried
  `SET firm_id = null, link_id = <B link>`, `SET firm_id = DEFAULT` with no firm set (P4), and `INSERT … ON CONFLICT DO UPDATE SET firm_id = null` (P5).
  Each is refused. Nothing legitimate is blocked: the follow, the backfill, deletes, and the app's own updates (`person-link.ts:223, 240, 241, 337, 392, 394, 446, 453`, none of which write `firm_id`, `case_id` or `link_id`).
* **Match trigger (`supersededBy`):** it fires after the fill because triggers run in name order. It refuses a cross-firm supersede on insert and on update.
* **Follow:** when a case later gets its firm, its links fill, and through the link's own follow its sessions and messages fill too. `RESTRICT` does not fire because the children are still null (MATCH SIMPLE).
  This works as `xr_app` through `case_firm_backfill()` (P9).
* **CS-W3 part 1's lookups:** these are not affected. `case_firm_of_link` and `case_firm_of_link_session` read only `person_link (id, token_hash, case_id)` and
  `person_link_session (token_hash, link_id)` (the column grants), joined to `runtime_case.firm_id`. This PR changes none of those columns, grants or policies.
  `check_csw3_firm_scope` gives 48/48, and the W2 journey goes through the link door: open, send code, verify.
* **INVOKER, search_path, names:** there are four new functions, all named `case_links_*` and all INVOKER, with `search_path` pinned to `pg_catalog, public, pg_temp`. PUBLIC is revoked on the backfill. `person_link_try` is untouched.
* **Deviations:** (1) The column is nullable until CS-W1 part 2. That differs from the row and the brief ("NOT NULL after the backfill in the same migration"), but it is the same deviation Lead 2 accepted on #3811 for the same reason. It needs the Lead's read here too.
  (2) `person_link → runtime_case` is deferred to part `keys` because `runtime_case (id, firm_id)` comes with #3811 on `cases.prisma`. The PR body says so. See m1.
  (3) The two-line `check_csw1_firm_id.ts` narrowing is word for word the same as #3811's. This PR does not need it, since it adds nothing to CS-W1's three tables, but it is harmless and stated.
* **Tests fail when the rule is removed:** the fill, keep, match, both keys, follow and backfill each have a fail case that asserts the specific error or constraint name.

## Blockers
None.

## Majors
None.

## Minors (list in the PR; most close with CS-W1 part 2 or part `keys`)
* **m1. A firm A link can be moved onto a firm B case.** Probe P2, as `xr_app`: `update person_link set case_id = <firm B case> where id = <firm A link>`
  gives UPDATE 1, and the link keeps firm A. This is the deferred `person_link → runtime_case` key. No app path updates `case_id` (grep above).
  The brief's part 9 list names `PersonLink → AnswerSubject` but not `PersonLink → Case`. **Fix:** the Lead adds it to part `keys`' list (or this part adds it once #3811 has merged). The PR body already names it.
* **m2. Rows with no firm are not guarded by the keys** (MATCH SIMPLE). Probe P1: a session of a case whose key has no platform firm can be moved under firm B's link (UPDATE 1, firm stays null).
  This is the same as #3811's r2-m1. NOT NULL in CS-W1 part 2 closes it.
* **m3. A cross-firm supersede made while one side is still empty.** P7: a link of a case with no firm is superseded by a firm A link, and then that key's platform firm arrives.
  `case_firm_backfill()` → follow → `case_links_firm_match` raises, and the **whole backfill fails for every case** (the same class as #3811's m4).
  P8 is the reverse: a firm A link is superseded by an empty link, which then fills to another firm, and nothing stops it. The app cannot reach either case,
  because a supersede is the same subject's resend (`person-link.ts:223`). **Fix (CS-W1 part 2 or here):** have the match trigger refuse a supersede while either side is empty, or close it with NOT NULL.
* **m4. An explicit `firm_id = NULL` skips the session-firm check.** With `app.firm_id` = firm B, an insert under a firm A link that names `firm_id NULL` gets firm A (probe).
  This is CS-W1's `case_firm_fill`, inherited (#3811's m7). The walls (CS-W4) will refuse it.
* **m5. The fill can race.** The fill reads the parent's firm without a lock. A session inserted while its link's firm is being filled can stay null, and nothing re-runs `case_links_firm_backfill()`:
  the API's `fillCaseFirmIds` (`api/src/firms.ts:38`) calls only CS-W1's `case_firm_backfill`. This is inherited (#3811's m1) and closes with NOT NULL.
* **m6. DW2.1's brief case "a forced row whose parent is missing stops the migration with words"** is replaced by the cross-firm-supersede stop. That is reasonable,
  since a missing parent cannot exist under the existing keys and a null firm is allowed in this part, but say it in the PR body.

## Journey score (reviewer; journey-test as reviewer role): **8.5/10, pass, no criterion at 0**
Journey (no browser, because nothing visible changes): staff send a link to Sample Spouse A and resend it (the first is superseded), the person opens it,
asks for a code and verifies it (a session). Underneath, I checked every link, session and demo message against the case's firm (the W2 case; 0 mismatched).
Break pass: probes P1–P9 above.
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | W2: send 2xx, resend 2xx, open/code/verify 200 |
| Next step obvious | 1 | unchanged; no visible change (`check_demo_link`, `check_c616_privacy` pass) |
| Plain words | 1 | refusals name the rule ("a link can only be superseded by a link of its own firm", "keeps its firm") |
| Feedback and state | 1 | unchanged API answers |
| Correct data | 1 | 0 rows differ from their case's firm; second backfill 0 |
| Error recovery | ½ | m3: one crafted row can make CS-W1's backfill fail for every case |
| Accessibility and sizes | 1 | no UI change |
| Speed | 1 | `(firm_id, …)` indexes beside each; follow uses `case_id`/`link_id` indexes; suites within their usual times |
| Visual quality | 1 | no UI change |
| Trust | ½ | the wall is incomplete until part `keys` (m1) and NOT NULL (m2) |

## What I could not check
* The `types` CI job (tsc on api with a 12 GB heap) did not run locally. On this head most CI jobs show "skipped" (fast, pr-suites, types). The label waits for them to be green.
* The full suite set selected by `--changed`. I ran the nine above.
* The C10.1 checkpoint load. It goes through the product's own API steps, so the triggers apply, but I did not run it.

Verdict: Approve 8ddd1cdc7bde48962cd6297a0b69e2ca00358034
