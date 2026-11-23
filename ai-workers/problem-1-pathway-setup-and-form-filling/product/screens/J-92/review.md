# J-92 review: R1.92 journey (PR #3028, branch claude/runtime-j92)

Reviewed commit **93187bee5e5f8e546d99f1445d54a8c0ea70e236**. Reviewer: a fresh session that did not write the journey. 22 Nov 2026.
Scope: `prototype/studio/tests/journeys/j_92.ts` and its six screenshots only. No screen, route or migration changes, so the screen-review checks for concept fit, D1-D20 and BIC-01 to BIC-20 do not apply. They belong to the PF-18s, PF-6 and PF-5s reviews.

**Verdict: Rework (Block).** Two Majors, both about what a step claims against what it checks or names as missing. The run itself matches the brief exactly.

## What I ran (isolated copies only; never :4400; US$0, live AI off)
* main + this PR, `rvj92` on **:4495**, run twice on the same copy: **13/16 both times**. The only FAILs are W1 (no "Firm profile" entry; sections listed), W2 (404) and W6's warning (CICC, `pattern: null`). The second run was clean (`before: 3`, new names), so the journey can be re-run.
* #3003 (`origin/claude/sharp-johnson-ztwuoq`) in a scratch worktree with j_92.ts copied in, **:4496**, run twice: **15/17 both times**. W2 pass (200, Winnipeg, setting row and one audit line `A:platform.time_zone`) and W2 fail (422, `fields.timeZone` "Choose a time zone from the list") both PASS. The restore PUT works: the second run's W4 "first office keeps firm zone" still holds. So W2 will pass once #3003 merges.
* Both copies stopped. Worktree removed. The screenshots my runs overwrote were checked out back to the committed files.

## Step by step
| Step | Proves what it claims? | Notes |
|---|---|---|
| setup | yes | Firm and Owner come from the database. Local sign-in. |
| W1 | **no (Major 1)** | It checks only the menu label. The label lookup is reasonable: the PF-5s concept names "Firm profile" under Firm settings next to Team · Licences · Security · Plan and billing, which share this nav. |
| W2 | yes | API, database and audit underneath. The 422 is checked on the field, with no write. Verified against #3003. |
| W3 | yes | The AB pre-fill is checked before saving. Both rows and the count are checked. It does not check the DB or the audit `timeZoneFrom` (PF-18s DW3 does). |
| W4 | mostly | It would catch hours converted to the viewer's zone (09:00 would vanish), but it cannot tell "own" hours from a shared default (Minor 1). |
| W5 | partly | API only. It matches the whole body text, not the field (Minor 2). |
| W6 saved / read back | yes | DB, Licences screen and API all agree. The body is "never refused". |
| W6 warning | **cause misnamed (Major 2)** | The data-driven body choice is reasonable, with one edge (Minor 4). |
| W7 | yes | axe on `main` at 400 and 1440 px, no sideways scroll, page errors from every tab. |

## Findings
**Major 1. W1 claims a page that saves the IANA zone, but checks only that a menu label exists.** `j_92.ts:70-75`: the line at :74 says "a page that saves the firm's IANA time zone", and the condition at :75 is `!!profileEntry`. Once S5 adds the entry, W1 passes without anything being saved: a false pass waiting to happen. The PF-5s concept's S5 / BR-7 field list (branch `lead-b-front-office`, `screens/pf-5s-saas/concept.md` l.18, l.32) names no time zone. So S5 built as written would turn W1 green while "profile saves with a valid IANA zone" is still unproven on screen. **Fix:** when the entry exists, open it, change the time zone to another listed zone, save, and read `platform_firm_setting` `platform.time_zone` (plus the one audit line), as W2 does. Until then the step fails and names the part. If the zone is not meant to be on S5, the FAIL text should say so, and the lead should be told in a `challenge.md`, not silently.

**Major 2. W6's warning will not pass when the named part (PF-4c part 2) lands.** The brief for PF-4c part 2 is API only. Its touch list (`design/lead-b-briefs/PF-4c.md:32, :46`) is `licence-format.ts`, `service.ts` (`saveCredential` returns `warning`) and the JSON, with no screen. The licence form throws the answer away: `web/src/modules/platform/account/licence-form.tsx:32` (`save: (l: Fields) => Promise<void>`) shows only `error` and `note` (:77-78), and no file under `web/src/modules/platform` reads a licence `warning`. After PF-4c part 2, W6 will switch to "the warning is missing" and stay red. The header (`j_92.ts:15-17`) and the FAIL text (`:149`) name only the data half. **Fix:** name both missing parts: (a) PF-4c part 2 (`numberPattern` and `saveCredential`'s `warning`) and (b) the licence form (My account → Licence, and the Owner's Licences panel) showing the returned warning on the field. Tell the tech lead that no row's touch list holds (b). The PF-6 2b break report m2 already found that the hint "Checked against the usual format only" is untrue today.

**Minor 1.** `j_92.ts:122`: the hours check is `businessHours.every(h => text.includes(h.opens))`. Every office has the default Mon-Fri 09:00-17:00, so it cannot tell one office's hours from another's, and `closes` is not checked. Give one office different hours (the office edit route) before reading the rows, or check `opens` and `closes` per day.
**Minor 2.** `j_92.ts:129-131`: W5 says "refused on the office's field" but tests `/time zone/i` against the whole response text. Test `badOffice.body?.fields?.timeZone` (the shape W2 uses at :88).
**Minor 3.** `j_92.ts:143-144`: the wait for "not busy" can resolve before the click sets `aria-busy`, so the step leans on a fixed 500 ms. Wait for the saved toast ("Your licence record was saved.") or `[data-licence-error]` instead.
**Minor 4.** `j_92.ts:134, :137`: the first body with any `numberPattern` is chosen, and `X-<run>` is assumed to break it. A permissive pattern (for example `[A-Za-z0-9-]+`) would make the warning step fail for the wrong reason. Choose `bodies.find(b => b.numberPattern && !new RegExp(b.numberPattern).test(wrong))`.
**Minor 5.** `j_92.ts:21, :29`: the default port 4492 is outside the runtime range 4430-4439 (`WAY-OF-WORKING.md:18`). The guard against :4400 and `xr_studio_demo` is correct.
**Minor 6.** `j_92.ts:157`: no 1024 px width and no keyboard-only path (journey-test §3). PF-18s covers both for Offices (`check_pf18s_offices_browser.ts` DW7). The Licence page has neither here.

## Compared with `tests/check_pf18s_offices_browser.ts` and `journeys/j_89.ts`
It follows both patterns: the same `api`, `signIn`, `tab` (session in sessionStorage), `axe` on `main`, `recorder`, the :4400 and demo guard, and the header with W-lines and a run line. Unlike PF-18s it does not need a fresh copy: it uses per-run names and a counted `before` (PF-18s stops on existing offices, `:49`). It overlaps with PF-18s DW3 (AB pre-fill) and adds the BC pre-fill, the API cross-read, the first office keeping the firm zone, and the licence half. It does not repeat PF-18s's role refusals, stale edit or audit `timeZoneFrom` checks, which is fine for a journey. Like j_89, it puts back what it changes (W2's zone, `:91`).

## Journey score (reviewer, R1.92 as it runs on main): 7 / 10, below the pass mark (8). That is expected while parts are missing.
Full report: `screens/J-92/journey-test-reviewer-2026-11-22.md`.

## What I could not check
The graph tool (`graph.mjs`) was not run: it rewrites `qa/GRAPH.md`, and this review may write only two files. No real screen reader. No intended user's unaided walk (D17 and D20 stay with the founder). S5 does not exist, so the label lookup is judged from the concept only.

**Verdict: Block.** To fix: Major 1 (W1 must prove the save, not the label) and Major 2 (W6 must name the screen half of the warning).

Reviewer: Block 93187bee5e5f8e546d99f1445d54a8c0ea70e236
