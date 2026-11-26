# Review round 4 (merge only, P-303): FO-3v part 1, PR #3418 at bd4ca3598

Reviewer: Opus 5.5, fresh context (I did not build it). 26 Nov 2026. This is a diff-only re-review of merge commit `bd4ca359826ae8417cb20ca664e7f6c14d43f92d` (parents: 5177e24d1, the approved head, and origin/main 220f82567). No page changed, so no journey was run. The round-1 journey score, 9.5/10 (`journey-test-reviewer-fo3v-part1-2026-11-24.md`), stands.

**Verdict: Block** for bd4ca3598. The merge itself is clean. However, the migration it re-stamps fails a repository check, and that check also failed at 5177e24d1. Rounds 1 to 3 missed it, and the PR's affected-suite CI does not select it (B1).

## 1. Conflict resolution in `ports/notifications.ts`: correct
- `git show --remerge-diff`: the only hand-resolved hunk is `NOTIFICATION_ITEM_KIND`. It is now `[... "lead", "retainer", "booking"]`, so it keeps main's `retainer` (FO-5d) and this PR's `booking`. The comment names both.
- `NOTIFICATION_KIND` and `NOTIFICATION_GROUP` merged cleanly with nothing lost. They hold `VIDEO_LINK_NEEDED → NEEDS_YOU` (this PR) and `RETAINER_DECLINED → NEEDS_YOU` (main).
- Diff against 5177e24d1: only main's lines are added. Diff against 220f82567, and against current origin/main 791c6f82f (same file): only this PR's lines are added. Lines are only added, none reordered or renamed, as the port header requires.
- Order: the two kinds take indexes 7 and 8. The only index readers are `check_csdl3_milestones.ts:87` (`slice(0, 6)`) and `check_pf18n2_lead_notices.ts:95` (`[0]`), and neither is affected. `labels.ts:26` checks membership only. The DB check `msg_notification_item_kind_check` is a kebab-case regex, not a list. The fo3v test (`item.kind === "booking"`) and the fo5d test (`"retainer"`) compare by value.
- Re-run: `check_pf18np_port.ts` 11/11.

## 2. Migration re-stamp: rename correct, but the migration fails PF-8b F4's pairing rule (B1)
- `20261125051500_shared__fo3v_video` → `20261126063100_shared__fo3v_video`: similarity 100%, and the blob `ec8a05ae5` is the same at both commits.
- The new stamp, 20261126063100, is after main's newest, 20261125150000. Both `migration-slots.py check origin/main..bd4ca3598` and `mergify --check .mergify.yml` pass with exit 0.
- Main migrations between the old and new stamps (pf19m mailboxes, pff2 plat_file, fo7w1, r196, fo5d decline reason):
  - None touches `fo_booking` or `fo_consultation_type`.
  - None adds a trigger on `platform_staff`.
  - None reuses an `fo_video_*` or `FoVideoSource`/`FoMeetingProvider` name.
  - The only `platform_staff` reference is pf19m's `msg_mailbox` FK, `ON DELETE RESTRICT`. That FK does not interact with an `AFTER UPDATE OF status` trigger that deletes `fo_video_pref` rows.
  - The migration's meaning is unchanged by the move.

## Blocker
- **B1. `check_pf8b_f4_migrations.ts` fails on bd4ca3598**, with `FAIL every migration after F4 that hands xr_wall_reader a function grants it CREATE on public first and revokes it after (38 later): ["20261126063100_shared__fo3v_video"]`.
  - The migration runs `ALTER FUNCTION fo_video_drop_on_deactivate() OWNER TO xr_wall_reader;` with no `GRANT CREATE ON SCHEMA public TO xr_wall_reader;` before it and no `REVOKE ...` after it.
  - On RDS, 20261121230000_pf8b_f4_reader_create has already taken that CREATE back. The migration role is not a superuser there, so the owner change is refused and `migrate deploy` stops.
  - Every main migration after F4 that hands over a function has the pair, for example fo6 at lines 371 to 381 and r196 at lines 164 to 175. This is the only migration after F4 without it.
  - The same failure happens at 5177e24d1 with the old stamp: I checked by running the check on that commit's files in a scratch copy, which reported 32 later migrations. It is not new in this merge, but it is on the head being approved.
  - `pr-suites` picks suites by change and did not select this pure file-read check, so it went unseen. ci.yml's full shard run would turn main red after merge.
  - **Fix (migration text only, same stamp):** put `GRANT CREATE ON SCHEMA public TO xr_wall_reader;` before the `ALTER FUNCTION ... OWNER TO xr_wall_reader`, and `REVOKE CREATE ON SCHEMA public FROM xr_wall_reader;` after it. Then re-run `check_pf8b_f4_migrations.ts`, `check_pf12_walls.ts` and `check_fo3v_video.ts`.
  - **Process gap for the Lead:** `select-suites` misses this check when a migration changes. It should run whenever any `prisma/migrations/**` file is touched.

No Major. No Minor from the merge.

**Verdict: Block** (B1).
