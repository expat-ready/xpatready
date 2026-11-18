# qa after-merge, 18 Nov 2026 (12:3x to 13:0x IST): the 17 Nov evening merges, after the org move

**Run:** main **39c1203cd** (#2008, 16:15 UTC 17 Nov), repository `expat-ready/xpatready` (the org move was verified by Lead 79). Mac qa copy. Opus 5.5, medium (P-608). Live AI off: no STUDIO_*_LIVE, no priced button. US$0.
* Isolated copy only on :4473 (never :4400, never the main copy's database), stopped after the walk. No `xr_studio_qa_%` database is left.
* The checks ran on an export of main in scratch space. This worktree cannot switch branches, because the sandbox keeps `.claude/` read-only and main changed `.claude/settings.json`.

**Brief:** Lead 79 (local_25aa8878), 18 Nov:
* Dispatch the nightly C8.2 and C11.6 checkpoint runs (this also covers E15).
* Then run after-merge qa on the 14 PRs merged last night.

**Scope:**
* Every first-parent merge on main since 499bf07ef (the last qa pass, `2026-11-17-after-merge.md`) that changes app code or its checks.
* That is 14 PRs: 11 change api, engine, prisma or ports code; #2021 adds a port; #2054 and #2092 fix flaky checks.
* None changes a screen.
* Records, tooling and concept merges (#2086, #2099, #2080, #2075, #2073, #2027, #2068, #2065, #2071, #2079, #2030) are out of scope, and so is qa's own #2010 (its R1.6 retest and qa checks).
* This round also carries yesterday's records (qa #2088, which is not merged and now conflicts with main) into one PR.

## Verdict
**C8.2 and C11.6: green on the checkpoint on main's head on GitHub's runners, but not yet Works.** Both stay Partial: the first part of the Works rule is met, the other three are not.
* Run **44256761591** (workflow_dispatch, `capabilities: C8.2 C11.6`, `data: checkpoint`, head 39c1203cd):
  * C8.2: "C8.2.test.ts on the checkpoint: exit 0, 19/19 passed" (job 134640396986);
  * C11.6: "C11.6.test.ts on the checkpoint: exit 0, 14/14 passed" (job 134640397274).
* Still needed (RULES.md P-339, P-348c; `rules/works.md`):
  * an independent re-run (P-290);
  * a fresh Opus reader's verdict, by a reader that ran nothing (P-303, P-432);
  * a gate A walk by screens to the next capability's first step (P-348c). The last walk was 11 Nov on 68a7b59d1, before BK-21 changed this path.
* `REGRESSION-DATA.md` gets their "checkpoint" lines with the Works verdict, not before.

No regression found. **Two new findings:** QA-507 (Bug · Minor) and QA-508 (Conflict · Minor: R1.58's text is out of date). No other row moves: each still has parts missing (P-606).

| Merge (UTC 17 Nov) | What | Row | Underneath (here twice · CI) | Like a person | Row now |
|---|---|---|---|---|---|
| #2045 PF-6m2 (11:16) | the accept re-checks the inviter (410) | R1.6 | pf6m2 19/19 · 19/19; pf5_signup_billing 53/53 · 53/53 | API only (no accept screen yet) | Partial: PF-6 part 2b, J-6 part 2 |
| #2017 CS-SD1 (12:24) | schema matches the migrations | enabler | prisma_schema 8/8 · 8/8; cssd1 — · 17/17 | — | enabler |
| #2054 QA-498 (12:24) | BK-5 BR-6 in any shard order | — | `check_bk5_start_browser.cjs` quarantined in CI, Chromium not here | — | fix not yet run |
| #2042 CS-V1 part 2 (12:24) | strict input schemas | enabler | csv1 29/30 (DW3 needs :4486) · 71/71 | — | enabler |
| #1956 PF-19b part 2 (13:09) | SES, SNS bounces, one-click unsubscribe | R1.28, R1.48, R1.49 | pf19b2 44/44 · 44/44 | walked, below | R1.28 Partial (FO-2 part 3); R1.48 Partial (PF-L); R1.49 Partial (QA-495) |
| #1918 FO-3a part 1a (13:09) | booking-types API | R1.41, R1.42 | fo3a 48/48 · 48/48; fo3w_manage_browser — · 50/50 | API only | Partial (FO-3st; FO-3a later parts, FO-3w-staff) |
| #2062 FO-9a part 1 (13:09) | duplicate match keys, `POST duplicates/check` | R1.29 | fo9a 53/53 · 53/53 | API only | Partial (was Not built): FO-9a screens, FO-9b, FO-9s |
| #1991 FO-7a2 (13:09) | trust reversals, credited trust | R1.58 | fo7a2 35/35, fo7a_money_schema 123/123, fo7mv 45/45 · same | API only | Partial (was Not built): FO-7t; text out of date, **QA-508** |
| #2092 QA-53k (13:09) | `check_forms_qa53` start race | — | needs its own server (sandbox refuses) · quarantined in CI | — | fix not yet run |
| #2087 PF-0bp (13:54) | body-parser errors as problem answers | enabler | cannot start its server here · 13/13; probed on :4473 | probe, below | **QA-507** |
| #2052 PF-4c part 1 (13:54) | batch invite, one seat check | R1.20 | pf4c 24/24 · 24/24 | API only | Partial (was Not built): PF-4c part 2, PF-15, the Invite screen's batch |
| #2021 FO-9b part 0 (14:58) | PersonMergePort, fake, contract | R1.29 | fo9b_port 20/20 · 20/20 | port only | as #2062 |
| #2105 AS-1m (16:03) | eligibility rules into `engine/eligibility/` | enabler | as1m 50/50, sh3_resolver 85/85 · same | — | enabler |
| #2008 AUD-5 part 1 (16:15) | keep periods as data | R1.105 | aud5 57/57, b164 64 · 57/57, 65 | API only | Partial (was Not built): AUD-5 later parts, AUD-2, PF-5 close |

**CI run:** every check above except the two quarantined ones is PASS in **run 44111923337**, the merge batch of #2008. Its tree, 7e167bc68, is the same as main 39c1203cd's.
* Every batch that merged was green: 44064465004, 44072662844, 44073096826, 44073132759, 44083188421, 44084705067, 44091540442, 44096374760, 44110657182, 44111923337. Two check batches on 499bf07ef failed and did not merge: 44053132226 (#2054, stacked) and 44053104668 (#2017 + #1991 together).
* Lines read from the shard logs, for example: "check_pf19b2_ses.ts | PASS | 9 s | 44 passed, 0 failed", "check_fo7a2_ledger_rules.ts | PASS | 9 s | 35 passed, 0 failed".
* **Quarantined:** `check_bk5_start_browser.cjs` passed only on retry in 6 runs within 7 days, and `check_forms_qa53.ts` in 4 runs. The suite list's quarantine lines in run 44111923337 say so. Both last flaked before their fixes merged (#2054, #2092), so neither fix has a run yet.

## Walks and probes (copy `qa_r28` of main on :4473)
**One-click unsubscribe (PF-19b part 2; R1.28, R1.49). Persona: a person on the firm's marketing list.** A scratch script (the `--app` part of `check_pf19b2_ses.ts`, stopped before its Playwright step) recorded three consents and sent one marketing email through MessagePort.
* The demo inbox has it with `List-Unsubscribe` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click`.
* **Opening the link (browser pane, 800 px)** shows "Unsubscribe from Sample immigration firm's marketing email?" with one button. It says plainly that messages about the person's own file and their WhatsApp choices stay. Nothing is recorded yet (`r28-unsubscribe-page.jpg`).
* **A double click on Unsubscribe** gives "You are unsubscribed", in the same plain words (`r28-unsubscribed.jpg`). Underneath, the double click wrote:
  * exactly one `msg_consent_withdrawal` row (EMAIL MARKETING, via UNSUBSCRIBE, by `system:unsubscribe:…`);
  * one `consent.withdrawn` audit line ("1 live record ended");
  * and both WhatsApp consents stay live (`r28-database-after-unsubscribe.txt`).
* **Reloading, then opening the used link again** answers 404 "This page is not available. Check the address, or contact the firm that sent it to you." (`r28-link-used-404.jpg`). At 375 px it fits (`r28-link-used-375.jpg`).

**Body errors (PF-0bp, #2087).** `POST /api/platform/session/local`:
* broken JSON and plain text: 400 `BODY_NOT_JSON` ("The request body is not valid JSON. Nothing was saved or started.");
* `content-type: application/json; charset=klingon`: **500**;
* `content-encoding: zstd-nope`: **500**.

So the parser's 415 errors fall through `ProblemErrors` to the generic 500: **QA-507**. `tests/qa/check_qa507_body_charset.ts` fails 2/4 twice (B1 and B2 fail; the B3 broken-JSON control and the B4 no-leak check pass): `qa507-check-runs.txt`.

## Bugs
0 Blocker · 0 Critical · 0 Major · **2 Minor (new: QA-507, QA-508)** · closed: none. Carried from qa #2088: QA-504, QA-505, QA-506 (Minors), and QA-397 closed.
* **QA-508:** FO-7a2 #1991 builds P-634 (1): a reversal is always accepted, even below zero, and the party shows red in `money_trust_shortfall`. The founder chose that on 17 Nov in P-653 (2), after P-607 (1) (15 Nov, "Never negative"). R1.58's text still says "never goes below zero (fail case)", so the row cannot be scored as written. The tech lead rewrites the row text; qa does not change a requirement.

## Coverage
Not measured this round: c8 needs the API server under the tsx CLI, which this sandbox refuses. The floor is unchanged.

## What I could not test here, and why
* **Server-starting checks:** `check_pf0bp_body_errors`, `check_forms_qa53` and `check_cssd1_no_drift` start their own server or fetch, which the sandbox refuses (the tsx IPC pipe, the certificate store). `check_csv1_inputs` DW3 needs a copy on :4486, outside qa's ports. Evidence for these: CI's PASS lines; I probed PF-0bp by hand.
* **Browser checks:** Chromium cannot start here, so `check_fo3w_manage_browser` and `check_bk5_start_browser` were not run. The walk used the app's browser pane at its own width (800 px), not 1440 px.
* **Headless replays** at 400, 1024 and 1440 px, run twice: not done (same reason).
* **The invitation accept refusal (PF-6m2)** has no screen to walk; the builder's note says the Accept page still shows such an invitation as valid until accept is pressed.

## Questions for the tech lead
1. **QA-508:** R1.58's text says trust "never goes below zero"; P-634 and the founder's P-653 (2) say a reversal may take it below zero, shown red. Please rewrite R1.58's text to match.
2. **C8.2 and C11.6:** both are green on the checkpoint (run 44256761591). Who runs the independent re-run and the fresh Opus reader, and shall qa walk gate A on a copy loaded with the configured checkpoint next?
3. **R1.20:** the row says a 1-50 row invite "accepts the good rows and names each bad row's reason". PF-4c (backlog, AG-1-69) takes 1-20 rows and sends nothing while any row is flagged. Which one holds?
4. **qa #2088:** its records are merged into this PR, so #2088 can be closed. Close it, or shall I?

## Suggestions
* QA-507's fix: map the parser's 415 errors (`charset.unsupported`, `encoding.unsupported`) in `ProblemErrors` to a 415 problem answer in words. *Later* · *Capability*.
* A used unsubscribe link could say "You are already unsubscribed" rather than "This page is not available.". The present words leak nothing but may worry a person who clicks twice. Only if the single-use privacy rule allows it. *Later* · *Capability*.
