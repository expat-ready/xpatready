# qa capability R1.48: proof on main f0b4fb03c, 20 Nov, after #2521 (cloud qa lane; Opus 5.5 medium; fresh Opus reader, ran nothing; live AI off; US$0)

**Item:** R1.48 "Each message shows Sent, Delivered, Bounced or Failed from the provider's test events; a hard bounce stops sends to that address; the from-name is the firm's." The tech lead (Lead 4, series 3) asked for this proof at 19:2x IST.
**Main:** f0b4fb03c. Its app code is the same as 78ccdacf9's (no `prototype/` or `.github/` change between them) and contains #2521 (fc3d2aab2). The local runs used commit 954347590: main 78ccdacf9 merged into the qa branch, with the same app tree.

**Verdict: Works** (updated 19:4x IST, after the GitHub walks below). Every clause is met on main's code, and J-48 is green on GitHub's runners on main's head, twice (P-339). The fresh Opus reader gives **Works, ~90%**, on condition the GitHub walk of J-48 passes. qa agrees. The row stays **Partial** until J-48 is green on GitHub's runners on main's head, twice. The tech lead was asked on #2521 (comment 7041038849), because item-proof never ran for #2521 (QA-607).

## Clause by clause (main f0b4fb03c)
| Clause | Met? | Evidence |
|---|---|---|
| Sent, Delivered, Bounced, from the provider's test events | Met | The worker writes SENT plus its event (`send/messages.ts:218-221`). The local test events (Delivery, or a Permanent Bounce for the Sample addresses, `channels/email/local.ts:33-37`) go through the SES notice handler. J-48 W5 shows Delivered on the lead page, and the staff read gives DELIVERED and BOUNCED. |
| **Failed** | **Met (QA-601 closed)** | A throwing adapter becomes `ProviderRefused` (`:218`). `countRefusal` counts tries on the row and ends the 5th try FAILED "send failed" with one FAILED event (`:176-189`). The sweep re-queues after 2, 4, 8, 16 min. The local adapter refuses `refused@example.com` (`local.ts:21,43`). The panel shows "Failed" with "The email provider did not take it" (`web/.../contract.ts:16,28`); screenshot `2026-11-20-capability-R1.48-main/J-48-DW6-lead-messages-failed-1440.png`. |
| A hard bounce stops sends to that address | Met | The consent gate runs at send and again in the worker (`messages.ts:110,113`, `:208-209`). J-48 W4: the next send gets 409 "Not sent: this address does not take email from the firm". An address that did not bounce is not refused. |
| The from-name is the firm's | Met on the email as sent | Render uses `operatingName` (`messages.ts:111`). J-48 DW4 checks each of firm A's four emails; firm B's name never appears; SES gets the firm's name as the From display name. The panel shows the *current* name: QA-603 (Minor, open). |

**On "from the provider's test events":** Failed comes from the provider refusing the send at once (shaped like SES MessageRejected), not from a provider notice. The notice handler still takes Bounce, Complaint and Delivery only. qa and the reader read "test events" as including a refusal. DW6 uses a fake clock only to shorten the waits; the worker, sweep and adapter are the same code that runs live. On a running copy, Failed takes about 20-30 minutes.

## Runs (fresh isolated copies, never :4400)
| Run | Result | Output |
|---|---|---|
| `node studio/tests/journeys/walk.mjs j_48` (recorded gate A walk) | **41/41, exit 0, twice** (7 videos, 2 traces, 75 and 74 step shots). It **ends at J-49's first step** (W1's host email, SERVICE, carries the one-click unsubscribe headers; the visitor's TRANSACTIONAL email carries none). | `2026-11-20-capability-R1.48-main/j48-walk{1,2}.json`, `…-steps.txt` |
| `tests/qa/check_qa601_provider_failed.ts` | 2/2, twice (state FAILED, reason "send failed", 1 event, 5 tries); it failed before #2521 | `qa601-run{1,2}.txt` |
| `run-suites.sh --only` the 9 PF-19 suites | all PASS, twice: pf19a schema 94 · pf19b_sending 42 · pf19b_mail 29 · pf19b2_ses 44 · pf19b3_delivery 24 · pf19b3_panel_browser 24/24 · pf19p_platform_mail 68 · pf19r_senders 24 · pf19r_case_links 21 | `pf19-suites-run{1,2}.txt` |

The first two walk attempts crashed before any app step, on a missing Playwright ffmpeg in this container (`/opt/pw-browsers/ffmpeg-1013`). Linking the system ffmpeg there (container only, nothing committed) fixed it; that is the same workaround #2521's builder used. Both J-48 walks rewrote the builder's committed screenshots; qa restored them and commits none.

Walked as a person, from the DW6 screenshot: the lead page's Messages box reads Sent, **Failed** in red with "The email provider did not take it", and Delivered, with addresses masked and the firm's name on each line. DW6's rows sit on the visitor's person record by design (the journey sends the refused address to that person), so a different masked address on that lead is expected.

## GitHub walks: green, twice, on main's head f0b4fb03c (the Lead's dispatch, 19:3x IST)
- walks run **44750278940** (job 136336516275): j_48 **41 PASS, 0 FAIL**, 7 videos, 75 step shots; it ends at J-49's first step.
- walks run **44750290384** (job 136336365407): j_48 **41 PASS, 0 FAIL**, the same. Artifact `walk-j_48-f0b4fb03ce656a82c025dd94eef47f37b7164d2a`. The self-test journeys j_0_fails and j_0_throws behaved as expected in both runs.

Before the dispatch:
- item-proof on #2521's merge (run **44740866695**, fc3d2aab2): `items []`, so nothing ran (QA-607).
- walks.yml has not been dispatched for j_48 on main. Lead asked on #2521.

## Bugs: 0 Blocker · 0 Critical · 0 Major · 1 Minor new (QA-607); QA-601 closed
- **QA-601 closed** (Gap · Major), moved to `BUGS-CLOSED.md`.
- **QA-607** (Bug · Minor, tooling, new): a `Completes:` that is not at the start of its line is dropped silently by `item-proof.mjs detect`, and pr-rules lets it pass.
- **QA-600** (focus after "Show older"): open, unchanged (`messages-panel.tsx:43`). The panel suite passed 24/24 in both runs here, but it was flaky 1 in 5 before.
- **QA-602**: open. Its effect changed: a deployed send with no verified sender now ends FAILED after 5 tries, not QUEUED for ever (row updated).
- **QA-603**: open, Minor (`staff-routes.ts:81,87`). It does not block the clause: the email goes out under the firm's name.
- Reviewer m1 on #2521 (accepted follow-up): a daily-cap hold overwrites the try count's reason (`messages.ts:217`), so a capped refused row can get more than 5 tries. The reader re-found it; it is not a new row.

`qa/built/R1.48.md` was deleted (re-scored).

## Questions for the Lead
1. Done: the Lead dispatched both walks, and they are green.
2. QA-607 (accepted by the Lead as tooling, 19:3x IST): should the fix be pr-rules refusing a mid-line `Completes:` (recommended: loud, and one line of shell), or `detect` reading it anywhere?

## Could not test
- A real SES refusal: QA-602 still blocks deployed sends.
- c8 coverage: not run this round.
