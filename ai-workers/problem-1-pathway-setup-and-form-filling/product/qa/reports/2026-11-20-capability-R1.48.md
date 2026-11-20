# qa capability R1.48: re-score on main 1ee04f2b4, 20 Nov (cloud qa lane; Opus 5.5 medium; reader Opus 5.5 high; live AI off; US$0)

**Item:** R1.48 "Each message shows Sent, Delivered, Bounced or Failed from the provider's test events; a hard bounce stops sends to that address; the from-name is the firm's."

**Verdict: Partial.** The fresh Opus reader (high effort, ran nothing) gives Partial at ~85%, and qa agrees. Two things are still missing:
1. **J-48**, the item's journey test. It is not on main: it is built on `claude/sweet-goldberg-5mz60o` and held by Lead B (P-745, #2397's body).
2. **QA-601 (Gap · Major):** "Failed" from the provider is never reached.

**What "part missing PF-L" meant.** `design/journeys-2026-11-19.md` lists R1.48's missing part as "PF-L (PF-19b part 3)". PF-19b part 3 merged as #2397 on 20 Nov at 01:36 UTC. It records Delivered, adds the staff read `GET /api/platform/messages`, and puts a Messages box on the lead page. The libraries row PF-L merged long before.

## Clause by clause (on main 1ee04f2b4)
| Clause | Met? | Evidence |
|---|---|---|
| Sent, Delivered, Bounced shown in words, from the provider's test events | Met | Words in `web/src/modules/platform/messages/contract.ts:15-16`. The local adapter's test events (`channels/email/local.ts:26-31`) go through the SNS notice handler, which writes Delivered once (`bounces.ts:131-135`) and Bounced (`:140-143`). States only move forward (DW2). |
| **Failed** shown, from the provider | **Not met: QA-601** | A firm send the provider refuses throws inside `deliver()`. The transaction rolls back (`send/messages.ts:184`), the row stays QUEUED, and the hourly sweep re-queues it for ever (`:243`). FAILED is written only for "content changed" or "no channel" (`:166-177`). No test shows Failed. |
| A hard bounce stops sends to that address | Met | Suppression is checked at send (`messages.ts:102`) and again in the worker (`:174-175`). DW4: a Sample bounce address reads BOUNCED, and `msg_suppression` HARD_BOUNCE is written once. |
| The from-name is the firm's | Met on the email as sent | Render uses `firm.operatingName` (`messages.ts:103`). Recorded SES traffic shows the From name (`check_pf19b2_ses.ts`). The panel reads the *current* name, not the stored one: QA-603 (Minor). |

## Runs on fresh isolated copies (never :4400)
| Suite | Result | Output |
|---|---|---|
| `tests/check_pf19b3_delivery.ts` (runs part 2's `check_pf19b2_ses.ts` inside) | 24 passed, 0 failed, twice | `2026-11-20-capability-R1.48/pf19b3-delivery-run{1,2}.txt` |
| `tests/check_pf19b3_panel_browser.ts` (DW4 to DW6: the copy's own worker, test events, panel, keyboard, axe, 375/1024/1440 px, 404s) | 24/24 in runs 1, 3, 4, 5; **23/24 in run 2** (DW6 focus: QA-600) | `…/pf19b3-panel-run{1..5}.txt` |
| `tests/qa/check_qa600_older_focus.ts` (new; CPU x6, 6 tries) | fails today: focus lost in 4/6 and 6/6 tries | `…/qa600-run{1,2}.txt` |
| `tests/qa/check_qa601_provider_failed.ts` (new; a provider that always refuses, 8 fake hours of job runner and sweep) | fails today, twice: 9 tries, row still QUEUED, no reason, no FAILED event | `…/qa601-run{1,2}.txt` |

No GitHub run exists for R1.48. Item-proof cannot PASS until `tests/journeys/j_48.ts` exists (P-405: a missing journey is FAIL).

## Bugs: 0 Blocker · 0 Critical · 1 Major · 3 Minor (all new)
- **QA-600** (UX · Minor, WCAG 2.4.3): after "Show older messages", focus can drop to the page body (`messages-panel.tsx:43`, `requestAnimationFrame` before the new rows render). It also makes the panel suite flaky.
- **QA-601** (Gap · Major): no provider failure reaches Failed, and a refused firm email waits for ever.
- **QA-602** (Gap · Minor, cross-row, not counted against R1.48): no SES verified sender is wired (`send/channels.ts:20`; `ses.ts:42` throws), so every send in test or production throws. PF-8b makes the identity; no row wires it into the app.
- **QA-603** (Bug · Minor): the panel's from-name is the firm's current name, not the From the email went out with.

## Questions for the Lead
1. QA-601: should Failed be built into PF-19b (a try count on firm rows, as PF-19p does for platform rows, plus a local Sample refused address), or should the founder narrow R1.48's Done when to Sent, Delivered and Bounced? **Recommendation:** build it. It is small, and without it a refused email is silently stuck.
2. J-48: release the hold (P-745) once QA-601's fix lands, so J-48 can walk Failed too.

## Suggestions
- Count tries on firm outbox rows and end FAILED after N, as PF-19p does. *Needed for the proof · Capability.*
- J-48 walks one message through all four states on the lead page. *Needed for the proof · Capability.*
