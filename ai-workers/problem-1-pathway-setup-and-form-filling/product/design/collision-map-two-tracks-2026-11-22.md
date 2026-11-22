# Collision map, near-done sweep and two-track proposal (A279 parts 1-3)

Independent read-only reader, 22 Nov ~11:0x IST, main `01841047d`. Method: part ids in commit subjects under each merge PR since 14 Nov against the qa notes in `qa/CAPABILITIES.md`; open PRs not read ("unmerged" = not on main). To be re-checked by the Lead before any row is briefed.

## A. Near-done rows (only five; every other Partial/Not built row has 2+ unmerged parts or an outside dependency)
| Row | Merged since the qa note | Left | Class |
|---|---|---|---|
| R1.90 sign-up, trial | PF-5 p2 #1959; PF-5s p1 #2608, p2 #2881/#2899; PF-16 p1a #2866 | later PF-16 parts unknown; no "private plan link" code found | walk; one clause doubtful |
| R1.21 our invoices with tax | #1959; invoices on the billing page #2881 | walk; Stripe test key needed for proof: unknown | all merged |
| R1.88 firm reads its audit log | AUD-4 #2339 | AUD-4s screen (concept countersigned, BACKLOG line 1166) | one part |
| R1.104 consultation agreement | FO-5s #2802/#2826 | FO-3c (API only, BACKLOG line 331) | one part |
| R1.55 withdraw, decline | FO-6 p1 #2038, FO-5s | decline with reason: no route in `front-office/retainers/service.ts`, no BACKLOG row | one part, needs shaping |

Not close: blocked outside R1.1 (PF-8c, AWS), R1.91, R1.22 (Stripe test account), R1.112 (Google OAuth); 2+ parts R1.29, R1.50, R1.3, R1.93, R1.105, R1.36, R1.58; chained waits R1.46 (PF-19c), R1.66/68/69 (PF-F1/F2).

## B. Where lanes bump (last 7 days: 490 merged PRs, 264 touching the app, 455 "merge main into branch" commits, 48 in the last day)
| PRs | File(s) | Why | Can it be made one-file-per-part? |
|---|---|---|---|
| 94 | `qa/CAPABILITIES.md` (580 KB) | one line per verdict | yes: one file per R1 row |
| 35, 20, 18, 15, 14 | `tools/check-guards.sh`, `cockpit-data.py`, `test_cockpit_data.py`, `lead-watch.sh`, `decision-impact.sh` | each tooling fix registers in one script | partly |
| 33, 29, 13, 7 | `api/src/platform/MODULE.md`, `front-office/MODULE.md`, `MODULE.cases.md`, `MODULE.core.md` | entry points listed in the card | yes: `MODULE.rows/` exists but the card is still edited |
| 18 | `BACKLOG.md` | rows added and amended | records queue; low risk |
| 17 | `ports/events.ts` | every new event | yes: `ports/events/<module>.ts` |
| 15 | `platform/firm-scope.ts` | registry of walled tables | yes: per-module registry |
| 14, 7 | `prisma/schema/platform.prisma`, `front-office-booking.prisma` | new tables | yes: one file per part |
| 17, 14, 11, 11, 10, 10 | `booking/service.ts`, `identity/service.ts`, `firms/signup.ts`, `retainers/service.ts`, `identity/session/service.ts`, `messages/send/messages.ts` | big service files | only by splitting per use case |
| 12, 9, 8 | `web/.../front-office/routes.tsx`, `platform/routes.tsx`, `account-sections.ts` | route and menu registration | yes: per-feature route files |
| 11, 8, 7 | `tests/check_forms_qa53.ts`, `check_pf12_walls.ts`, `check_pf12b_bypass_audit.ts` | allow-lists and counts in the test | yes: marker on the route or table |
| 9, 9, 8, 7 | `features/front-office-sales.ts`, `.github/workflows/ci.yml`, `api/src/runtime.ts` (1,129 lines), `api/src/main.ts` | wiring, CI steps, case-side monolith | partly: auto-discover modules |
Also: migrations are one Mergify scope with capacity 1 (`.mergify.yml` lines 112-140) and branches re-stamp migration timestamps after each main move. Web, tests and unfenced API files are in no Mergify scope (lines 21-23).

Layout: fenced areas `api/src/platform/*` (27 sub-folders), `api/src/front-office/*`, `api/src/client-money/`, each with its own `prisma/schema/<area>*.prisma`; web has `modules/{platform,front-office}` only; case side, forms and configurator are ~150 flat files in `api/src/*.ts`; `ports/` holds 30 contracts with fakes.
Groups: platform R1.90, 21, 88, 50, 46, 45, 93, 35, 95, 85, 86, 87, 97, 105, 22, 91 · front office R1.104, 55, 29, 36, 54, 43, 112, 52, 106, 107, 62 · client money R1.56, 57, 58, 96, 111, 61 · case side and documents R1.3, 76, 75, 98, 64-70, 79.
**Platform and front office are not disjoint** (events, firm-scope, cards, web routes). **Cleanest split: platform against case side plus client money.** Track B's needs from Track A: CS-T1 needs PF-29b's TaskPort (unmerged); CS-D5/D6 need PF-F2/F3 (unmerged); PF-21d needs FO-7b; any new table registers in firm-scope and the walls test.

## C. Two tracks
Track A (platform), in order: R1.90 (walk) · R1.21 (walk) · R1.88 (AUD-4s) · R1.50 (PF-18s notifications, PF-18ns) · R1.45 then R1.46 (PF-19c, PF-19s, FO-5p) · R1.93 (PF-4s, PF-17, PF-18s) · R1.87 (AUD-3, AUD-3b) · R1.85, R1.86 (PF-21b later, PF-21d, PF-21c, PF-21rs) · R1.35 (PF-10a/b/t/s; .xlsx library ruling) · R1.95 (PF-22a/v/s; question 8) · R1.97, R1.105 (AUD-1c, AUD-2, AUD-2c, PF-11c; S3 Object Lock).
Track B (case side + money), in order: R1.3 (CS-W2, CS-W3 p2-3, CS-W4) · R1.76 (CS-NT1 2 PRs, FO-2 notes) · R1.58 (FO-7ts p3, FO-7t, FO-7s3a/b, FO-7m) · R1.56 (FO-7b rest, FO-7q, FO-7s1, FO-7g; cited tax table) · R1.96, R1.111 (FO-7p/r/v, FO-7s4/s5) · R1.75 (PF-29a-f, CS-T1; question 6) · R1.98 (needs shaping) · R1.64-70 (PF-F1-F3, CS-D5-D7; PF-F1c needs AWS) · R1.57, R1.61 (Stripe keys; signing vendor held, P-561).
**Capacity on today's structure:** ~9 PRs per capability yesterday (97 for 11). Track A ~5-6 rows provable in 24 h; Track B ~2-4 (money and migrations run one at a time; nothing near-done). **10-15 per track per day is not supported by the evidence while the shared lists and the single migration lane stay.**
**Three structural changes that unlock it:** (1) make the shared lists one-file-per-part (events, firm-scope, route markers instead of test lists, cards from `MODULE.rows/` only, per-feature web routes, one file per CAPABILITIES row); (2) a schema and migration baton per area, no re-stamp for disjoint schema files; (3) path owners in the Mergify scopes per area, and split `runtime.ts` and the big service files by use case.
