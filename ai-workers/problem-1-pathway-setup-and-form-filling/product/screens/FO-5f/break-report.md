# FO-5f (retainer hardening) — break report, round 1

Commit `7338fdfa2` (branch `claude/quirky-knuth-rog8nh`, PR #1791). **Scope: items 2 and 3 only** (row FO-5f, rows rev 16.8: "Breaker: yes on items 2 and 3 only"). Target: `api/src/front-office/retainers/service.ts` (cited `svc:`), part 1's triggers (`prisma/migrations/20261114210000_fo5_retainer_tables/migration.sql`, cited `mig:`).
Isolated copy `brk_fo5f` on :4438 (`PLATFORM_IDENTITY=local PLATFORM_SAMPLE_SEED=on`), database `xr_studio_brk_fo5f`, stopped afterwards. FO-1a's front-office seed was run by tsx. Persons, ENGAGED leads, prospects and first stage moves were written by SQL, as in the builder's walk. Actors: R (Owner + Case Manager, licence), T (Case Manager; a Sample licence row was added so T can be a representative), O (Case Officer), S (firm `sample-solo`). Scripts (not committed): `scratchpad/brk/attack.mts`, `attack2.mts`. Logs: `run2.log`, `run3.log`.

**Result: 0 Blocker, 1 Major, 4 Minor; 17 held.**

## Major

**M-1 Major — Signed offline with an earlier version leaves the newer version's representative, signer and template on the record. The signed copy names other people.**
Where: `svc:562` bumps the retainer with only `{ status: "DRAFT", currentVersion: filed }`. `representativeStaffId`, `signerPersonId`, `templateId`, `templateVersion` and `templateFileKey` keep version n's values. The version row stores only merge values (names, emails), not k's ids, so the code cannot restore them as written. `mig:304` says these columns "change only together with current_version + 1". The copy is exactly that moment, and they are not set to k's.
Reproduction (HTTP, `attack.mts` section "representative changed in v2", and `attack2.mts`):
1. R prepares v1 with R as the representative, then sends it.
2. R edits from the SENT page with `representativeStaffId: T` (v2), then sends v2.
3. R files Signed offline with `expectedVersion 2, signedVersion 1`.
Observed:
- 200 SIGNED_OFFLINE, filed as v3.
- The filed values say `representative.name` = "Representative (Sample)" (R, as on the paper).
- The retainer row and `GET retainers/:id` say `representativeStaffId` = T.
- With `platform.everyone_sees_all` off, T is on no signed paper yet still reads the signed retainer (200, through the BR-3 representative rule at `svc:186`). T could not read it before step 2.
- The same code path keeps v2's `signerPersonId` (a corporate prospect whose signer was changed in v2) and v2's template. The "missing" list is then worked out from the wrong template version (item 9).
Expected (rule B-24, "the record must file exactly what was signed"): the retainer's representative, signer and template after filing are the ones of version k. Anything downstream that reads the retainer row will act on the wrong people: the client and representative FO-7 makes from a won retainer, BR-3 visibility, and the signing request FO-6 cancels.

## Minor

**m-1 Minor — the version the client actually signed on paper is labelled "Not signed".** Where: `svc:416-417`.
Reproduction: v3 is SENT; Signed offline with `signedVersion 1`.
Observed page notes: `1:false:Not signed`, `2:false:Not signed`, `3:false:Not signed`, `4:true:Copied from version 1, signed on paper`.
The row asks for "the newer unsigned versions … marked 'not signed'", which means versions 2 and 3. Version 1 is older and is the one on paper, yet it gets the same label. That contradicts the audit (`signedVersion: 1`).
Expected: version k carries no "Not signed" label, or carries "Signed on paper (filed as version 4)".

**m-2 Minor — Signed offline with an earlier version, filed from a Draft page, ends the request a colleague has just sent (the B-25 pattern).** Where: `svc:523-529`. Signed offline checks only `expectedVersion`; it takes no `expectedStatus`.
Reproduction (`attack2.mts`, first section):
1. v1 is sent, then edited, so A's page shows DRAFT v2.
2. T sends v2 (200 SENT).
3. A files `expectedVersion 2, signedVersion 1`.
Observed: 200, with events `…, retainer.sent:2, retainer.request_ended:2, retainer.signed_offline:3`. A never saw that a live request existed, and filing ended it.
This is within the row's wording ("`expectedVersion` stays the stale check"). It is reported for Lead B because it is the same hazard that item 2 closes for Edit. Fix nothing here.

**m-3 Minor — the stale message has the direction wrong when the page names a version above the current one.** Where: `svc:75-76`.
Reproduction: Withdraw on a v1 SENT retainer with `expectedVersion 2, expectedStatus SENT`.
Observed: 409 "This agreement has a newer version (1) than the one you saw (2)."
Item 2 now requires `expectedVersion` on Withdraw, so this sentence is newly reachable there. Expected: the sentence from the 409 CHANGED rule without "newer", or a 422 for a version that never existed.

**m-4 Minor — leading zeros pass.** Where: `svc:71`, `svc:92`, regex `/^\d{1,9}$/`.
Observed: `signedVersion "01"` → 200, filed as v3, a copy of v1. `expectedVersion "02"` (multipart) → 200.
This does no harm: the value maps to the same whole number, and range and stale checks still apply. It is a non-canonical value that the row's "digits as text" does not forbid. JSON `expectedVersion: "1"` (a string) is 422 as specified.

## Held (17)

1. Edit without `expectedStatus` → 422. Lowercase `"draft"` → 422. `["DRAFT"]` → 422. A string `expectedVersion` in JSON → 422.
2. Edit from a DRAFT page after a colleague's Send → 409 CHANGED, "now sent (your page showed a draft)". Edit with SENT on a DRAFT → 409 CHANGED.
3. Withdraw without `expectedVersion` → 422, including when `expectedStatus` alone is sent. A wrong version → 409. A wrong status (DRAFT or VIEWED on a SENT) → 409 CHANGED. A real DRAFT with matching fields → 409 NOT_WITHDRAWABLE.
4. `signedVersion` `0`, `-1`, `n+1`, `999999999`, `9999999999`, `1.0`, `" 1"`, `1e0`, `0x1`, Arabic-Indic `١`, and the field sent twice → all 422 at `signedVersion`. A stale `expectedVersion` with a valid `signedVersion` → 409 CHANGED.
5. A number type in multipart cannot be sent over HTTP: every multipart field arrives as text. `svc:92` accepts a number only from a direct service call.
6. The copy (v3 SENT, k = 1) gives version 4:
   - the same SHA-256 as v1 (`4d9c3287…`);
   - the key `retainers/<id>/v4-<hex12>.docx`;
   - `agreement.version` "1" and `copied_from_version` 1;
   - fees copied (v4 = 150000, v1's; v2 and v3 had 1500000 and 15000000);
   - v3 ended UPDATED, v4 ended SIGNED_OFFLINE, the retainer SIGNED_OFFLINE@4.
7. Events for that run: exactly one `retainer.request_ended` naming v3 and one `retainer.signed_offline` naming v4. Nothing is duplicated or missing.
8. The audit line names `signedVersion 1`, `version 4` and `endedVersion 3`. There is one `prospect.won`, one WON stage move and `won_via SIGNED_OFFLINE`.
9. Double filing: the same body → 409 CHANGED. `expectedVersion 4` → 409 NOT_SIGNABLE. WON moves stay at 1.
10. A DRAFT v2 (never sent) with k = 1 → SIGNED_OFFLINE@3. No `request_ended` event (no request was open).
11. CLIENT_SIGNED v2 with k = 1 → 409 NOT_SIGNABLE with a plain sentence. With k = n → 200.
12. A missing source file (v1's file renamed away) → 409 VERSION_FILE_MISSING. The retainer stays SENT@2 and nothing is written.
13. Visibility with "everyone sees all" off: T, who neither owns the prospect nor represents the retainer, gets 404 on Edit, Withdraw, Signed offline and read. The other firm (S) gets 404. O gets 403 MISSING_PERMISSION on `void` and `offline-sign`.
14. Races, run 6 times each, every combination with exactly one 200 and all others 409 CHANGED. There was never a 500, a second filing, a second WON move or a second `signed_offline` event. The combinations:
    - from DRAFT v2: Edit+Send; Send+SignedOffline(k=1); Edit+SignedOffline(k=1); SignedOffline(k=1) ×5; SignedOffline(k=n)+SignedOffline(k=1);
    - from SENT v2: Edit+Withdraw; Withdraw+SignedOffline(k=1); Edit+SignedOffline(k=1); SignedOffline(k=n)+SignedOffline(k=1)+Withdraw+Edit; SignedOffline(k=1) ×8.
15. The opposite lock orders of Withdraw (version row, then retainer) and of Signed offline with a copy (retainer, then version) never produced a 500 in these runs. A possible deadlock is mapped to 409 by `svc:143`.
16. Load: 30 parallel Signed offline (k = 1) calls on 30 retainers → 30 × 200, no P2028.
17. The pair (version, status) names one state: the triggers at `mig:324-344` allow DRAFT again only together with a new version.

## Round 2 — head `f3505fc58` (items 2 and 3 as changed by `git diff 7338fdfa2 f3505fc58 -- …/retainers/service.ts`)

Same copy `brk_fo5f` on :4438, started fresh and stopped afterwards (scripts `scratchpad/brk/attack3.mts`, `attack4.mts`; logs `run4.log`, `run5.log`). **Result: 0 Blocker, 0 Major, 3 Minor. M-1, m-1, m-3 and m-4 are fixed; m-2 is with Lead B.**

**r2-m1 Minor — a legacy version (no ids) whose signer's email or representative's name changed later can never be filed as a copy, and the advice in the refusal cannot work.** Where: `svc:553-558`.
Reproduction: v1 is drafted; the subject person's email is changed; v2 is made by an edit; the ids are taken out of v1 to make it a pre-FO-5f row; Signed offline with `signedVersion 1`.
Observed: 409 NOT_SIGNABLE, "Edit the agreement back to version 1's people, then record it as signed". An edit prints the person's current email again, so v1's values are never matched. The same happens when a representative's display name changes.
Only versions written before `f3505fc58` are affected. Expected: compare the people (the retainer's ids at the time) rather than the printed text, or word the refusal so it does not promise a way out.

**r2-m2 Minor — the legacy comparison can match two different people.** Where: `svc:556`, which compares name, email and licence number but not `representative.licensing_body`.
Reproduction (`attack4.mts`): T is given R's display name and licence number; v1 is drafted with T; T is renamed back; v2 is edited to R; v1's ids are taken out; v1 is filed.
Observed: 200, and the retainer is filed naming **R**, although v1's paper names T. This needs two staff with the same name and licence number (a data error), so it is an edge case.

**r2-m3 Minor — filing on a version whose representative is no longer eligible returns "Edit to choose another" on a signed record.** Where: `svc:407`, `svc:415` (`blockers` returned whatever the status).
Reproduction: v1 rep T, v2 rep R; T's grants are ended; Signed offline with `signedVersion 1`.
Observed: 200 SIGNED_OFFLINE; the retainer names T, which is correct for the paper. The response's `blockers` say "The representative is no longer active, licensed or a case manager. Edit to choose another.", but a signed retainer cannot be edited. Expected: no Send blockers on a signed retainer, or a plain note.

**Held in round 2:**
1. **M-1, individual:** v1 rep R, v2 rep T, paper on v1 → the retainer, the page and the audit name R. With "everyone sees all" off, T reads it before filing (200) and not after (404). **M-1, corporate:** v1 signer A, v2 signer B, paper on v1 → A is restored, also after A's contact ended. A v1 with no signer is filed with signer null (as k = n allows).
2. **Legacy:** same people → filed with the retainer's ids; another representative → 409 NOT_SIGNABLE, nothing written. **Crafted ids:** templates naming `{signer.person_id}`, `{representative.staff_id}` or `{copied_from_version}` → 422. The ids come only from `mergeValues` (validated signer and representative), so another firm's staff cannot reach a version through the API, and `mig:166`'s composite foreign key would refuse it.
3. **m-1:** notes read `1:Signed on paper; filed as version 3`, `2:Not signed`, `3:Copied from version 1, signed on paper`. **m-3:** "This agreement is at version 1, not version 2." **m-4:** `expectedVersion "02"` and `"2 "`, and `signedVersion "01"`, `"001"`, `"+1"`, `"1 "` and `"0"` → all 422; JSON 2.5 → 422.
4. **Races with the new row update**, 6 runs each: Signed offline (k = 1) + Edit, + Withdraw, ×3 + Signed offline (k = n), and + Send from Draft. Each run has one 200 and the rest 409 CHANGED, never a 500; when the copy won, the retainer named v1's representative. The audit's `representativeStaffId` and `signerPersonId` match the row in every filing.
5. The ids in `version.values` are ids the page already returns. The template columns stay as version n's, which the trigger at `mig:362-371` requires; after filing only the "missing" list reads them.
