# FO-3v part 1: review, round 3 (diff-only, P-277)

PR #3418 (R1.112) · branch `claude/runtime-fo3v-video` · head `adf4c983160c9d5332fd0a576de1f894644dc9e2` · round 2 approved `e0e4ef70c`. The reviewer did not build this item.

**Scope.** This round covers only `e0e4ef70c..adf4c9831` without what main brought in. That is the merge `b4ef0966d` (its resolution only), `d724880df` and `4d5ce051d` (the migration re-stamp), and `adf4c9831` (the CodeQL fixes, the Mergify scope, and `exact: true`). Everything round 2 approved is not re-scored.

## 1. Merge resolution (b4ef0966d): right, nothing lost
- **Footprint unchanged.** The PR's footprint after the merge (`git diff 63f5cc913 b4ef0966d`, the merge against main) is the same as before it (`git diff eee5f9edc e0e4ef70c`): the same 19 files and +1000/-21. Diffing the two patches leaves only context lines, which are main's lines:
  - main's `agreementWarning` import;
  - KEEP_PERIOD_PASSED and TRUST_TO_MOVE_WAITING.
- **`ports/notifications.ts:20-22, 32-34`.** All three kinds are present, each with its group: VIDEO_LINK_NEEDED → NEEDS_YOU, KEEP_PERIOD_PASSED → NEEDS_YOU, TRUST_TO_MOVE_WAITING → PAYMENTS. The `"booking"` item kind is kept.
- **`api/src/front-office/booking/service.ts:44`.** The file imports only `agreementWarning`. `gate.ts` on main no longer exports `assertAgreementSigned`, and nothing in `booking/` uses it.
- **No booking write skips the link.** I checked the booking writes in the merged file:
  - create (`:581-585`) and move (`:632-633`) call `setVideo`;
  - cancel (`:667`) voids the link;
  - the only other `foBooking.update` is the attendance status (`:464`), which does not change the host or the mode.
- **One reader for the link.** No path reads `type.meetingLink` for a booking any more. Every reader goes through `videoLink`.

## 2. Migration re-stamp: byte-identical
- **Identical SQL.** The blob of `20261124100000_fo3v_video/migration.sql` at e0e4ef70c and of `20261125051500_shared__fo3v_video/migration.sql` at adf4c9831 is the same, `ec8a05ae5b6d…`. Git shows the rename as 100%.
- **No stray folder.** The old folder is gone, and only one `fo3v` folder remains.
- **Slot check.** `migration-slots.py check origin/main..adf4c9831` (main is now `a1a086e3d`, which contains the merged `63f5cc913`) gives: PASS, 1 new migration against main's newest `20261124170000`.
- **Area.** `areas` names the folder `shared`, which is right: it changes `fo_booking` and `platform_staff` as well as the new tables.

## 3. `.mergify.yml`
- **The PR's own change.** Its change since the merge (`git diff b4ef0966d adf4c9831`) is exactly the `mig-front-office-video` scope (schema file, `*_front-office-video__*`, `*_shared__*`) and its `: 1` line. That is the same as `migration-slots.py mergify --check` prints (rc 0).
- **Against current main.** It differs only by those 6 lines.

## 4. CodeQL fixes
- **Same character set.** `video/service.ts:50-51`: `SHAPE` and `LINK_CHARS` allow exactly what the old `[!#-;=?-\[\]_a-z~]` allowed.
  - I tested every UTF-16 code unit from U+0000 to U+FFFF against the old class, the new class and `LINK_CHARS`. There were 0 differences, and all three allow 85 characters.
  - The printable ASCII they refuse is space and `" < > \ ^ \` { | }`, as before.
  - The only ranges left are `0-9`, `A-Z` and `a-z`; `-` is escaped. Neither regex has a flag, so `i` cannot widen the class.
- **The database check is unchanged.** It still uses ranges (`migration.sql:66`, under `COLLATE "C"`). That file had to stay byte-identical, and CodeQL's JS query does not read SQL. Not a finding.
- **The new character walk** (`tests/check_fo3v_video.ts:137-141`) is a real guard:
  - I widened the shape to `[!-~]`, and `linkOk` then accepted all 9 refused characters in the walk's position, so the walk turns red.
  - Its size and exclusion asserts pin `LINK_CHARS` to printable ASCII minus those 9.
- **Whole-link comparison.** `hasLink` and `linksIn` (`:115-116`) compare whole links, and the positive asserts use them (`:185, :194, :215`).
- **Re-run.** I re-ran `check_fo3v_video` myself: **32/32 PASS**.

## 5. j_48 / j_49 `exact: true`
- **The cause is real.** I walked the booking page at 1024 px on the isolated copy: there are two cards, `aria-label` "Choose Free consultation" and "Choose Free consultation (Sample)". The loose name matches 2 links and the exact name matches 1.
- **Other walk results.** The page loaded in 384 ms, with no sideways scroll and no page errors.
- **Runs.** `j_48` gave **41/41** on copy `rv3j48` :4437. `j_49` gave **30/30** on copy `rv3j49` :4438. Both copies are stopped and their databases dropped.

## Journey test (reviewer role, this round's diff)
This part has no screen (the panel is part 1b). The journeys are the booking flow the changed tests walk (visitor books → confirmation → host email, j_48 W1–W5 and j_49), plus the link-shape walk through the API (`check_fo3v_video`, DW1–DW6 over HTTP).

| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | j_48 41/41, j_49 30/30, check 32/32 |
| Next step obvious | 1 | The booking page names each card, and the exact name picks one |
| Plain words | 1 | "Your join link will follow." and the field error "Enter a full link starting with https://" are unchanged |
| Feedback and state | 1 | The DW3 item exists once per booking, and the confirmations carry the link |
| Correct data | 1 | Same character set (0 of 65,536 differ), identical SQL blob |
| Error recovery | 1 | The 15 bad links get 422 on the field with nothing saved, and the database refuses what gets past the API |
| Accessibility and sizes | 1 | j_48 axe and no-sideways checks pass; 1024 px walk has no sideways scroll |
| Speed | 1 | Booking page at 384 ms |
| Visual quality | ½ | No visible change in this diff, so not re-judged |
| Trust and sources | 1 | The Sample type is labelled "(Sample)"; no link in audit or log lines (DW6) |

**9.5 / 10. Pass** (8 or more, no 0).

## Findings
**Blockers:** none. **Majors:** none.

**Minors** (none blocks; fix when the file is next touched):
- **m1.** `api/src/front-office/booking/video/service.ts:44-49`. There are now two JSDoc blocks in a row, and the second one attaches to `LINK_CHARS`. Its text has two wording slips:
  - `\\` shows as two backslashes;
  - "except space" (space is not between `!` and `~` anyway).

  The fix is one block, with a single `\`.
- **m2.** `tests/check_fo3v_video.ts:190, :226`. The two negative asserts changed from `!text.includes(LINK)` to `!hasLink(text, LINK)`, which is weaker. A leaked link glued to other text, or followed by a character outside `linksIn`'s trim list, would no longer be caught. Today the email writer puts the link alone, so there is no real gap. A stricter negative, which is not a sanitiser, would be `!linksIn(text).some((l) => l.startsWith(LINK))`.

**Carried, not re-scored:** round 2's n6–n9 and m1/m3 stay as recorded in `review-fo3v-part1.md`. n9 (`booking.video_link_removed` is untested) is still open.

## Could not check
- **CI.** CI for this head was still running when I read it: the parts, the guards, and CodeQL `Analyze (javascript-typescript)`. CodeQL's code-scanning alerts were not readable (403). So I could not confirm that the two alerts are closed. The merge gate will.
- **Type check.** A full `tsc` of the API ran out of memory on this machine. `tsx` loads cleanly, and CI's type check covers the rest.
- **The PR body and its questions** (no PR read through GraphQL).
- **Not run on this head:** check_fo3_booking, check_pf12_walls, check_cssd1_no_drift and the PF-18n checks. These are the builder's results, from 4d5ce051d.

Verdict: Approve adf4c983160c9d5332fd0a576de1f894644dc9e2
