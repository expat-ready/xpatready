# qa capability R1.86: breach register with firm notices (24 Nov)

**Run:** `/qa capability R1.86`, qa 6 (cloud qa copy, Opus 5.5 medium), under Lead 24. Live AI off, US$0. Tested on main 3af5fc4b0, after #3209 (AUD-3 part 1) merged; PF-21c (#3185) had merged on 23 Nov. Isolated copies only, started from j_86's own header line (`PLATFORM_IDENTITY=local PLATFORM_SYSTEM_IDENTITY=local`); :4400 not touched.

**Verdict: Partial, parts missing, no verdict (P-606).** The checklist names "PF-21c, PF-21rs". **PF-21rs** (our console's privacy pages: requests, holds, breaches and their notices) is not built, and no PR is open for it.

## Evidence
| What | Where | Result |
|---|---|---|
| `check_pf21c_breaches.ts` | `run-suites.sh --only`, main 3af5fc4b0 | 48 passed, 0 failed |
| j_86 (`walk.mjs`, trace and step shots) | isolated copies, twice | **21 PASS, 7 FAIL both times, the same steps** |
| GitHub walk | not dispatched | there is no Works claim; a cloud lane asks (P-439) |

## Done when, clause by clause
* **"A breach is recorded with its assessment."** Through the API, on main.
  * W1: the record is 201 and is stored as written: RECORDED, discovery time, description, both firms, our staff member.
  * W1: there is one RECORDED event, plus the guard's ALLOWED line with the reason.
  * W2: categories, root cause, containment and the decision to notify (who, when, why) are stored. The decision is a CHANGED event, UNDECIDED > NOTIFY_FIRMS.
  * **On screen: not built.** W1 needs our console's Breaches page with "Record a breach"; that is PF-21rs.
* **"And the firms notified."** On main.
  * W3: a notice to firm A reaches only its active Owner and Admin, never its case officer. Firm B's notice reaches its Owner.
  * W3: a firm the breach does not name gets 422. A second notice to the same firm gets 409 `ALREADY_NOTIFIED`.
* **"Each with time."** On main. W4: the sent time is the same on the answer, the notice row and the firm's own audit line, and falls inside the call. The local mail adapter marks all three messages delivered.
* **"And words."**
  * On main, underneath (W5): the notice uses the published Security incident notice template (Sample words, Unconfirmed: no counsel). Each recipient's words are exactly the notice filled for their firm (outbox file = `rendered_hash`), and one firm's words never name the other.
  * Our console cannot show the words: no route returns them (**QA-757**, Open: `BreachNotice` still carries `templateVersionId` only, `register/breaches/service.ts:51`, `:120`).
* **Shown to the firm, and walls.**
  * W7: firm A's Owner sees the Security incident notice line in the Activity log, on screen. Each firm's log holds only its own notice.
  * W8: a firm's Owner gets 403 on our register for list, read, record and notify, and nothing is recorded.

## The 7 failing steps
| Step | Waits on |
|---|---|
| W1: the Breaches page with "Record a breach" | PF-21rs |
| W6: the breach page lists each notice with its firm, time and subject | PF-21rs, QA-757 |
| W6: no second send offered to a notified firm | PF-21rs |
| W9 at 400, 1024 and 1440 px | PF-21rs |
| W10: our read of a breach naming firm A writes a line on firm A's trail | a ruling (#3447 question 2) |

**W10.** #3209 declares the breach read `@ReadsAcrossFirms`, because the row names more than one firm. So the read writes one `cross_tenant.access` line on the platform's trail and none on firm A's. That is what AUD-3's row (1) says for a read across firms. The journey's expectation (a line on firm A's trail) was written before #3209 and is not backed by a row clause. It is not filed as a bug: it waits on the Lead's answer to question 2 on #3447 (R1.87), and the journey is aligned after the ruling.

## Gate A
The walk by screens stops at its first step: there is no Breaches page in our console (PF-21rs). The next capability's first step (R1.87: our read lands on the firm's trail) is reached through the API only.

## Bugs
No new bugs. QA-757 (Gap, Minor) is still open, with the same evidence.

## Questions for the Lead
1. Is PF-21rs on a lane? It is the one part missing; its BACKLOG row is shaped (W1-W6).
2. W10: see #3447 question 2. One answer serves both rows.

## Suggestions
* *Needed for the proof, Capability:* PF-21rs, with QA-757's words route (a `words` field on each notice, or `GET …/notices/:id`). The breach page needs it.
