# AUD-1m part 1: build notes (resume here, P-557)

**Where it is (19 Nov, about 04:4x IST):**
* Branch `claude/admiring-mendel-weh2i4`, built on AUD-1b's head (#2124, branch `claude/runtime-aud1b`).
* The reviewer (Opus, high effort) approved round 2 on 602f892d, and round 3 on 6145111e: the C7.5 test line (c10f8ead) and the merge of #2124's head b3b0b2a0 (a60fe6a9; a merge, not a rebase, per AGENTS.md rule 1 and P-270).
* **Next step:**
  1. Wait for #2124 to merge (labelled `review: approved` by the tech lead).
  2. Merge `origin/main` in once (P-270).
  3. Get a diff-only re-review on the new head, covering c10f8ead and the merge.
  4. Open the PR non-draft, with `Reviewer: Approve <head>` (P-683).
  5. Do not label it: this is an audit path, so it needs the tech lead's P-423 read.
* Brief: `product/design/build-lead-c-briefs/AUD-1m.md` on `claude/build-lead-c-647b40` at a7014c0bb.

## What changed
* **`ports/audit.ts`:** adds `CaseActor`, `CaseEntry` and `isCaseEntry`.
  * `AuditPort.record(tx, AuditEntry | CaseEntry)`.
  * A case line names its workspace and never an area entity; a platform entry never names a workspace.
  * The fake keeps `caseEntries` separate from platform entries.
* **`platform/audit/audit-event.ts`:** adds `recordCase`.
  * Workspace from the entry; firm, correlation and support session from the request or job (null outside both, until CS-W1).
  * Applies AUD-1b's OUR_STAFF and exact-actor refusals.
  * An unknown actor word is refused in the insert trigger's own words.
  * One `audit_write_failed` alert, one try.
* **`platform/audit/context.ts`:** `actorTypeOfWord` maps `person:`, `user-P` and `user-Q` to CLIENT, and `user-A/B/C/O/R/T/S` to FIRM_STAFF.
* **`core.ts`:**
  * `Audit.log` keeps its signature and writes a `CaseEntry` through the port.
  * `caseIdOf` takes caseOf's 8 characters and sets the full id of the one case in the workspace that starts with them. With none, or two, it sets nothing.
  * The two bare words `system` (form finder) and `rules` (findings.ts, review-runs.ts) are stored as `system:studio` and `system:rules`. `actorWordOf` reads them back.
* **Readers** (outside the touch list, one line each): `form-uses.ts`, `library-items.ts` and `lifecycle.ts` ("The studio"), and `studio.ts` `peopleNames` (the feed's who). Each reads the mapped word as before.
* **`tests/check_case_feed.ts`:** the sweep reads an AuditPort write that names a workspace as a case line. Its entity must be a case or configuration entity, never an area or platform one.
* **`tests/check_aud1m_case_writes.ts`:** CW1-CW7, 17/17.
* **`tests/check_c75_findings_api.ts:132`:** checks `actor='system:rules'` instead of `'rules'`. See question 1.
* **Cards:** one line on `api/src/MODULE.core.md` and its test.
* **`.gitignore`:** also matches a `node_modules` link.

## Evidence on this branch (cloud copy)

| Check | Result |
|---|---|
| `check_aud1m_case_writes` | 17/17 |
| `check_case_feed` | 42/42 |
| `check_aud1a_insert_only` (with its copy, Part B) | 41/41 (reviewer) |
| `check_aud1b_adapter` | 33/33 |
| `check_pf4_identity` (copy) | 119/119 |
| `check_c75_findings_api` (copy) | 55/55 |
| Typecheck | no new errors (15 known) |
| Port contracts | 0 problems |
| `graph --check` | exit 0 |
| count-any | 416 (baseline 433) |

**The case-side suite set:** 186 suites that read the audit trail, the activity feed or the history lists, run in 3 parallel parts on 602f892d plus c10f8ead's test. All pass except:
* `check_c75_findings_api`: the one line in question 1, now 55/55.
* `check_runtime_r1c`, its page-time budget only: 1042 ms, then 1011 ms on a solo rerun, against a 1 s budget on a loaded 4-core copy. The same suite gave 141/141 in two of the three parts on the same code.
* These went red in parallel and passed on a solo rerun:
  * c116 channels (54/54);
  * d1 reset (25/25), where the parallel parts had written saved-run files;
  * csc1 count (40/40) and c47 pqr picks (63/63), whose copies did not start;
  * pf4 identity, which needs its own copy name.

## Questions for the tech lead (for the PR body)
1. **Suites unchanged versus mapped words.** The brief says bare actor words are "mapped, not silenced". It also says "every case suite passes unchanged".
   * `check_c75_findings_api.ts:132` reads the stored word `rules`, so one line had to follow the mapping.
   * Recommendation: keep the mapping and the one-line test change.
   * The alternative is to accept `system` and `rules` as legacy words. AUD-1a's trigger already maps both to SYSTEM.
2. **The final grep in part 2 can never pass as written.**
   * Part 1 leaves 30 direct `auditEvent.create` writes in 22 files, against the brief's 25 in 20.
   * Three of them are platform writes (`platform/identity/audit.ts` ×2, `platform/settings.ts` ×1) that part 2's 20 files do not cover.
   * Recommendation: part 2 moves those three to `AuditPort.record` as well (they are AuditEntry-shaped already), or the grep excludes them by name.

## Notes for later rows
* **CS-W1:** once a case route signs in through the platform guard, AUD-1b's exact-actor rule refuses case lines in a staff request under another word. That includes the rules' resolve-on-read `system:rules` lines.
* **The case lookup** in `Audit.log` runs before the port's alarm wrapper (reviewer round 2, minor). A failed read still throws, and a transaction rolls back, but it raises no `audit_write_failed` alert.
* **`fakeAudit`'s `failOn`** does not apply to case lines.
* **CS-W1 part 2:** `runtime_case.firm_id` exists since CS-W1 part 1. A case line's firm still comes from the request or job only, as the brief says. Once the case walls set the request's firm, it is filled from there; taking it from the case row would go beyond this brief.
* **Part 2 (reviewer round 3):** three direct writes store the bare word `system`: `lifecycle.ts:566`, `library-items.ts:174` and `platform/settings.ts`. `check_pf4_identity.ts:481` and `:544` read `actor = 'system'`. When part 2 moves these writes to the port, they need the same mapping, and those two test reads need the change c10f8ead made.
* **Case detail** stays the case side's own JSON. The ids-only floor applies to platform lines only, as before.
