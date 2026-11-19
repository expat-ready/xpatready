# PF-4dn review — the invite carries the person's name (AG-1-10, AG-1-69)

Reviewer (Opus, did not build it), 17 Nov 2026. Commit `1d40c5fc3b0b13e3b3df67f3eacdf195e63f1dce` on `claude/runtime-invite-name`; diff `origin/main...1d40c5fc3` (9 files, +165/-18, under the 800-line split). Brief: `lead-b-briefs/PF-4dn.md` on `lead-b-front-office`. Isolated copies on :4574-:4576 (never :4400), all stopped afterwards. Journey test: `journey-test-reviewer-2026-11-17.md` in this folder, **9/10**.

## Re-runs at this commit
`check_pf4dn_invite_name` 13/13 (:4574) · `check_pf4_identity` 119/119 (:4575) · `check_pf6m2_invite_recheck` 19 passed, 0 failed · `check_pf6_staff_browser` 49/49 (:4576; the screenshots it rewrote were restored to the commit's files). I did not re-run pf4b, pf4c or pf6m. I accept the builder's results for those three.

## Done-when lines
| Line | Test (`tests/check_pf4dn_invite_name.ts`) | Result |
|---|---|---|
| DW1 pass | invite with `"  Client A Staff  "` → accept → `platform_staff.display_name` = "Client A Staff", and the invitation row stores it trimmed; 120 characters kept whole | Met |
| DW2 fail | 121 characters → 400 `DISPLAY_NAME_TOO_LONG`, "The name is at most 120 characters.", 0 invitations stored. Bell and `\n` → 400 `DISPLAY_NAME_INVALID`, nothing stored. Non-text → 400. The DB refuses an untrimmed value | Met |
| DW3 neither | no name → accept gives the part of the email before the @ (`pf4dn.plain-…`), and the stored value is NULL; spaces only → NULL. PF-4 119/119 and PF-6m2 19/0 pass unchanged | Met |
| DW4 screen | 2 rows → 2 fields labelled "Name, person 1/2 (optional)"; axe clean (no serious or critical result; my walk found 0 violations of any impact); the request body carries `displayName` for row 1 and none for row 2; values stored | Met |

Mutation reasoning: removing the length check, the control check, the `?? fallback`, the resend carry or the DB check each makes a named assertion fail (codes and stored values are asserted, not only the status).

## Migration
* `20261119173000_pf4dn_invitation_display_name` (re-stamped 19 Nov from `20261117140000`, P-600 (d)) is later than every migration on `origin/main`; the newest there at re-stamp is `20261119144500_csnk1_field_name_key`.
* It adds one nullable `TEXT` column. Existing rows are NULL and pass the check, so no data is lost. The Prisma field is `String? @map("display_name")`.
* The check is `NULL OR (= btrim AND char_length 1-120 AND !~ [[:cntrl:]])`. Every value the API stores passes it: I probed emoji ×120, Devanagari, combining marks, and NBSP or ideographic-space padding, which the API trims away. Length counts code points on both sides.
* The check is **looser** than the API: the database accepts U+200B, U+2028 and NBSP padding, and the API refuses all three (finding 3).

## API rule (`identity/service.ts:76-85`)
I probed the live route. Trimming works, including NBSP and U+3000. 1-120 code points: 120 emoji are accepted and 121 are refused. These are all refused with 400: Cc (NUL, TAB, DEL, U+0085), Cf (U+200B, U+202E), Zl (U+2028) and a lone surrogate. Blank (`""`, spaces only, `"   "` or `null`) means no name. An array gets 400. The rule runs before the seat check, so a bad name gets 400, not 409. `<img onerror>` is stored and shown as text with no injection (j4 screenshot).

## Names in logs and audit
I searched every table of the copy and `api.log` for the test names. The names appear only in `platform_invitation` and `platform_staff`. All 9 `platform.invitation.*` audit lines carry roles and ids only, and `api.log` has 0 hits. The single invite does not pass the name to `emailInvitation`, so the invitation email has no greeting. That is unchanged and leaks nothing new. `redact.ts` already lists `displayname`.

## The builder's decisions outside the touch list
1. **`resend` carries the name** (`service.ts:428`): agreed. Without it, a resend silently drops the name. It reads `old.displayName` through Prisma's `openInvitation` and has its own assertion.
2. **`routes.ts` unchanged**: agreed. The route passes `@Body()` straight through (`routes.ts:22-23`) and has no input schema on main, so `displayNameOf` is the schema.
3. **Name after Email**: agreed. Email keeps the first focus (PF-6 DW8 still passes), and the Tab order is Email → Name → roles (my walk). The AG-1-69 order (name, email, roles) gives way to an existing tested rule, and the PR should say so.
4. **The PF-4c batch still drops its row name**: noted, not a finding here. `inviteBatch` calls `insertInvitation` without the name (`service.ts:390`), although the row's `name` reaches the email. That belongs to Lead B as a follow-up row.

## D1-D20 (runtime row on the Team screen's invite panel)
D1 5: does what AG-01 §3.2 says · D2 5: API and DB refuse bad names; one row per invite · D3 5: one rule function · D4 N/A · D5 5: resend keeps the name; discard-confirm counts the name · D6 4: audit unchanged and name-free · D7 N/A (no AI) · D8 5 · D9 5 · D10 5: plain refusals · D11 4: name error on the Email field (finding 1) · D12 5 · D13 5: axe 0; 1024 px, 200 % zoom and 400 px have no sideways scroll · D14 5: team Field/Input · D15 5: panel ~0.4 s, send ~0.16 s · D16 5 · D17 simulated only · D18 N/A · D19 5: name typed → staff member named → shown on Team · D20 simulated only.
BIC-01-20: N/A. This is a firm-admin panel, not a case-side screen (§6 scope).
Graph (P-86): `graph.mjs` reports G1 0 · G2 0. GRAPH.md has no PF-4dn entry, so no gap is attributed to this row.

## Findings (none Blocker or Major)
1. **Minor (Should)**: a refused name shows on the Email field. `invite-panel.tsx:34` puts the server message in `r.error`, which only the Email `Field` renders (`:52`). The Name `Field` (`:56`) has no `error`. Failing case: Name "Client​D" (a pasted zero-width space) → Send → "The name has a line break or an invisible character…" appears under "Email, person 1". Email gets `aria-invalid=true`, and Name has no `aria-describedby` (screenshot j2). EXPERIENCE §1.10 [M] asks for the error on the field. The typed value is kept and the words name the field, so I rate it Minor. Fix: route `DISPLAY_NAME_*` codes to the Name field.
2. **Minor (Should)**: `maxLength={120}` at `invite-panel.tsx:57` counts UTF-16 units, but the API counts code points. Failing case: paste 80 emoji, or a name in a supplementary-plane script; the field keeps 60 code points. It is stricter than the rule, never looser. Fix: drop `maxLength` and let the API answer, or count code points.
3. **Minor (Should)**: the migration comment (`migration.sql:4-5`) says the check holds "the same rule". The check refuses only btrim spaces and `[[:cntrl:]]` in a C-ctype database. Failing case: `update platform_invitation set display_name = E'Client​A'` is accepted by the DB but would be refused by the API. Fix: correct the comment ("a looser backstop"), or add `!~ '[​-‏ -‮⁠-⁤﻿]'`.
4. **Note**: the builder's evidence screenshot `invite-name-1440.png` shows the "10 of 5 seats" over-limit state with Send disabled. The DW4 test proves the field, so this is a note only.

## What I could not check
A real screen reader, and an intended user's unaided walk (D17, D20 stay with the founder). The accept *page* was walked only up to its hand-off. Accept itself was called directly on the public route, because the local stand-in has no mailbox link click.

Verdict: Approve 1d40c5fc3b0b13e3b3df67f3eacdf195e63f1dce

## Re-review at b160ffe88
Diff-only (P-277): `git diff 1d40c5fc3 b160ffe88`. It changes 4 code and evidence files (+24/-6, excluding my two reports). Isolated copy `pf4dn` on :4574 (never :4400), stopped afterwards. I rebuilt `web/dist` from the restored code, and the working tree is clean.

* **Finding 1 (m1), resolved.** `invite-panel.tsx:35-39` now sends a refusal whose `problem.code` starts with `DISPLAY_NAME_` to a new `Row.nameError`. The Name `Field` renders it (`:60`), and that `Field` gives the input `aria-invalid` and `aria-describedby` (`controls.tsx:58-59`, `role="alert"`). Typing in the Name field clears it, and every other refusal still goes to Email. The codes match the API (`service.ts:80-83`).
  * **Re-run:** `check_pf4dn_invite_name` passed 14/14. The new case ("Client​D") gives `{"nameInvalid":"true","emailInvalid":null}`, with the message inside row 1 and 0 invitations stored.
  * **Mutation:** I restored only the old one-line catch block, and the copy rebuilt the bundle. The run then went **13/14**, and the failing line was the m1 case: `FAIL … {"nameInvalid":null,"emailInvalid":"true"}`. I restored the file with `git checkout`. The test does catch the bug.
* **Finding 2 (m2), resolved.** `maxLength` is gone, so the API's code-point count (120) is the only limit, and 121+ is refused on the Name field via `DISPLAY_NAME_TOO_LONG`.
* **Finding 3 (m3), resolved.** The migration comment now calls the check "a backstop for the core of that rule … the API's rule is the stricter one". The comment is accurate, and the SQL is unchanged.
* **Note 4, resolved.** `invite-name-1440.png` now shows "10 of 20 seats after these invites" with Send enabled and the Name field filled.
* **Note (not a finding):** a stale Email refusal from an earlier send stays until the email is edited, as before this change. The server checks the name first, so the two messages never come from one response.
* **Journey score:** my journey report is updated to 10/10. Feedback and Error recovery move from ½ to 1. This rests on the scripted browser walk above, not a new unaided walk.

No Blocker, Major or Minor open.

Verdict: Approve b160ffe88267683207d3b645d59d8fd9264fa6cb

## Re-review at 1bfea5051
Diff-only (P-277): `git diff 1798ca865 1bfea5051`. It changes 2 files (+5/-2), and 1798ca865 holds only my review records. I used an isolated copy `pf4dn` on :4574 (never :4400) and stopped it afterwards. That removed its database and files. The working tree is clean.

* **Devin 1 (separator-only name), resolved, and the change is minimal.** The "no name" shortcut in `displayNameOf` (`service.ts:79`) now uses the same character class as the refusal on the next line, `[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]`. Before, `" ".trim()` was empty and the class had no `Zl`/`Zp`, so the input returned null (201, no name). Now the input falls through to the refusal (400 `DISPLAY_NAME_INVALID`). Nothing else in the function changed.
* **Other blank-looking input: no unexpected change.** I sent each value to the real route on :4574. The name check runs before the seat check, so a `PLAN_LIMIT_REACHED` reply means the name passed.
  * **Outcome changed, now refused:** U+2028, U+2029 and " U+2028 " give `DISPLAY_NAME_INVALID`. Before the change they were no name. These are the only inputs whose outcome changed.
  * **Still no name:** spaces only, "" , NBSP U+00A0, ideographic space U+3000 and em space U+2003 all pass the name check. These are all `Zs` characters, which `trim()` removes and the class does not match. So "spaces only is still no name" holds for Unicode spaces too, which matches the doc comment.
  * **Refused before and after:** U+0085 (Cc, which `trim()` keeps), U+FEFF (Cf), ZWSP U+200B (Cf), tab (Cc) and "Client U+2028 A" all give `DISPLAY_NAME_INVALID`.
* **Devin 2 (swallowed wait), resolved.** `tests/check_pf4dn_invite_name.ts:126` now lets the `waitFor` timeout throw. The only `.catch` left in the file is `browser.close()` in `finally`, which is fine.
* **Re-run:** `check_pf4dn_invite_name` passed **15/15** (:4574). The new case passed: U+2028 → 400 `DISPLAY_NAME_INVALID` with 0 invitations stored. The m1 case still gives `{"nameInvalid":"true","emailInvalid":null}`. I did not run a mutation this time. Before the change, the old line returned null for U+2028, which would give 201 and fail the new assertion (`status === 400`).
* **Note (not a finding):** the screen behaves as before. `invite-panel.tsx:34` sends `displayName` only when `r.name.trim()` is non-empty, and JS `trim()` removes U+2028/U+2029. So a separator pasted alone into the Name field is still sent as no name, and the API's new refusal only applies to direct API callers. This is harmless, because the field looks empty to the person typing. The change is server-side, as Devin's finding asked.

No Blocker, Major or Minor open. The journey score stays 10/10 because the screen is unchanged.

Verdict: Approve 1bfea50519bdf4a5a932e3b3423a27c111096454

1. None open. One note: the screen's own trim still sends a separator-only Name as no name, as before; this is expected and not a defect.

## Re-review at 8803e7718, 19 Nov (merge of origin/main)
Diff-only. I read `git diff 33f0aa577 8803e7718` limited to PF-4dn's files, and `git diff 21cc0c640 8803e7718` (main → merge). I ran an isolated copy `pf4dnrv` on :4595 (never :4400), stopped it afterwards (database and files removed), and stopped the database cluster I had started for it.

* **Nothing of PF-4dn was lost.** For identity/service.ts, identity/session/service.ts, platform.prisma, the migration, invite-panel.tsx, the test and the review records, the changed lines of main → merge are identical to merge-base → 33f0aa577.
* **Main's changes merged sensibly.** Main changed identity/service.ts (PF-15 seat check through PgEntitlements; PF-19r `emailInvitation` now returns `{ emailed, emailHeld? }`), session/service.ts (outbox mail for the two-step reset) and platform.prisma (back-relation slots). None of these overlap PF-4dn's hunks. `invite()` and `resend()` keep `displayName` / `old.displayName` and spread main's new mail result. The panel still reads `emailed === false`, which main keeps. tsc for api and web shows no error in PF-4dn's files.
* **MODULE.md resolution is correct.** Main's frozen card is taken whole (0 lines differ from main). PF-4dn's two card items (the `displayName` on `POST staff/invitations`, and the test) are in `api/src/platform/MODULE.rows/PF-4dn.md`. `web/src/MODULE.rows/PF-4dn.md` names invite-panel.tsx. Both follow the format of the other rows files (P-712).
* **Re-run:** `check_pf4dn_invite_name` passed **15/15** on a fresh copy built from 8803e7718. Both `20261117140000_pf4dn_…` and main's newest `20261119081500_fo3a_set_name_unique` are applied, and no migration failed.
* **Finding 1 (Major): the migration stamp breaks P-600 (d).** `20261117140000_pf4dn_invitation_display_name` now sorts before 14 of main's migrations (newest `20261119081500`). P-600 (d) says the later PR re-stamps and re-runs CI when an earlier one merges. Technically it is harmless: no later migration touches `platform_invitation`. I dropped the column and its `_prisma_migrations` row on the copy, and `prisma migrate deploy` applied it again after the newer ones ("All migrations have been successfully applied", column back). But this is a written rule with a two-minute fix, and no automated check catches it. Fix: `git mv` the folder to a stamp after `20261119081500` (and after main's newest at push time), update the stamp quoted in this file's line 19, and re-run CI.
* **Finding 2 (Minor): the kept `pf-6-staff/screenshots/invite-people-1440.png` is stale against the merged app.** It shows the Name field, but its left navigation has only Profile and Team. Main's version (PF-6 part 2b) shows Profile, Licence, Team, Licences and Security, and those pages are in the merged code. Fix: retake the screenshot from 8803e7718 or later, so it shows both the Name field and main's navigation.
* **Journey score:** this stays at 10/10 (journey report, 17 Nov). invite-panel.tsx is byte-identical to the approved head, and the scripted screen checks pass again.

Verdict: Block 8803e771841276028feb71d05681d6eec3611475

1. Major: re-stamp the migration later than main's newest (P-600 (d)) and re-run CI.
2. Minor: retake `pf-6-staff/screenshots/invite-people-1440.png` from the merged head (it is missing main's Licence, Licences and Security navigation).

## Re-review at 8cb024a69, 19 Nov
Diff-only: `git diff 8803e7718 8cb024a69`. Both earlier findings are resolved, and nothing new is open.

* **Major 1 resolved.** The migration folder was renamed to `20261119173000_pf4dn_invitation_display_name` with byte-identical SQL. It is later than `origin/main`'s newest, `20261119144500_csnk1_field_name_key`. Line 19 of this file is updated.
* **Minor 2 resolved.** `invite-people-1440.png` now shows the Name field and the full navigation (Profile, Licence, Availability, Team, Licences, Security, Terms).
* **Merge of main (f23a4c1f0):** main's newer commits touch none of PF-4dn's files, and no new migration touches `platform_invitation`. PF-4dn's changed lines match the 8803e7718 merge exactly.
* **Re-run:** `check_pf4dn_invite_name` passed **15/15** on a fresh copy `pf4dnrv` on :4595, which I stopped afterwards. The newest applied migration is `20261119173000_pf4dn…`, and none failed.
* **Journey score:** stays 10/10.

Verdict: Approve 8cb024a69212b0e041c865d908cc290d06a7a922
