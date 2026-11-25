# Journey test: PF-21j (only a person who may record complaints can handle one), reviewer role

Reviewer (fresh agent, did not build it) · commit `7de1529c00fe1e4da13e833837598822d94a1ff0` · 19 Nov 2026, about 20:55 IST.
Copy: my own `rev_pf21j` on :4482 (`PLATFORM_IDENTITY=local`, fresh database, Sample firms seeded), served from a scratch extract of exactly `7de1529c0` (web rebuilt from it), because the shared checkout moved past that commit while I worked. Started and stopped in the same command each time. :4400 never used. US$0.
Method: headless Playwright driven like a person (labels, roles, clicks, typing), a screenshot at each decision point (scratchpad only, not committed). No visible browser pane in this session. Data read from PostgreSQL after each journey. The script ran twice with the same result (19 passed, 3 failed both times).

## Journeys (written from the brief, `pf-21-complaints/concept.md` BR-2 and BR-3, before walking)
| # | Persona · goal | Steps | Expected | Result |
|---|---|---|---|---|
| J1 main | Owner: "record this complaint and give it to the Case Manager" | List → Record a complaint → Handler picker → fill → save | The picker offers only people who may record complaints; one row, RECEIVED event, audit line | **Held.** The picker lists Owner and Case Managers, and leaves out the Case Officer and the Read-only person. Saved to the record page in about 100 ms. DB: one row, handler = Case Manager, one RECEIVED event |
| J2 alternate | Case Manager handler (record key, no read key): "acknowledge mine" | Open the record → "Record the acknowledgement" → save | The next step is offered, and the save works | **Held.** `acknowledged_at` set |
| J3 wrong role | Handler later made Read-only: "what can I do with my complaint?" | Open their complaint at 1440, 1024 and 400 px → press the filled button → save | They read it, see the read-only line, and are offered no action | **Not as briefed.** They see "Needs you", the filled "Record the acknowledgement" and 4 other actions, and no read-only line. Saving gives "You can't change this complaint. Ask an Owner or Admin. Changing a complaint needs … or being its handler." After the re-read the same actions are still offered (a dead end). The server held: nothing written |
| J4 wrong role by URL | Read-only person opens a complaint's address | Go to `/platform/complaints/<id>` | Not-found words, 404 | Held |
| J5 error + recovery | Owner: the picker was loaded, then the chosen Case Manager was made Read-only | Select them → save → choose another → save | 422 at Handler with the new sentence, nothing written, then saved | **Held.** "Handler: This person cannot handle complaints. Choose someone who may record them." 0 rows, then recorded with the next choice |
| Boundary | The reminder job hands over to whoever must acknowledge | Code read, plus the builder's breaker M2 | A handler who cannot act is not the one reminded | **Not as briefed** at this commit (`complaints.ts:465-470`: active handler only, no key check) |

Covered by the suites rather than by my walks: keyboard-only, double click and reload (`check_pf21s_complaints_browser.ts` 117/117 on this commit), and idempotent replay (`check_pf21i_idempotent.ts` 30/0).

## Break it (about 15 minutes)
* A Case Manager posts a Case Officer as handler straight to the API → 422 with the sentence. Body keys: `type,title,status,detail,message,code,fields`.
* A Read-only person by URL → 404, the same as an unknown id.
* Mutations on a scratch copy:
  * Removing `endedAt: null` from `mayHandle` (`complaints.ts:226`): **every suite stays green** (pf21j 15/15, pf21v 55/55, pf21 108/108, pf21w 83/83). No case covers an ended grant in the list or in the handler check.
  * Main's `canAct`, main's `handlers()`, and dropping the key check in `checkHandler` are each caught by pf21j. An over-wide `canAct` is caught by pf21j and pf21.
  * Removing `status: "ACTIVE"` from `mayHandle` is caught by pf21v, through the deactivated Case Manager only.

## Score (each 0, ½ or 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1, J2, J5 complete; J4 refused |
| Next step obvious | ½ | J3: the demoted handler is offered a filled next step the server refuses |
| Plain words | ½ | J3 refusal says "…or being its handler" to the handler; picker hints still say "An active staff member of your firm." |
| Feedback and state | ½ | J3: no read-only line (BIC-18, read-only says why); J1/J5 feedback clear |
| Correct data | 1 | 422 and 403 write nothing (DB before and after); one row and one RECEIVED event per record |
| Error recovery | ½ | J5 recovers at the field; J3 loops: refused, re-read, offered again |
| Accessibility and screen sizes | 1 | axe (WCAG 2.2 A/AA) finds no serious or critical issue on the drawer, the drawer error and J3 at 400, 1024 and 1440 px; no sideways scroll; keyboard per pf21s |
| Speed | 1 | List ready in 342-370 ms; save to the record page about 100 ms |
| Visual quality | 1 | Unchanged team look (`j1-drawer-1440.png`, `j5-handler-refused-1440.png`) |
| Trust and sources | 1 | Sample marks unchanged; no AI on this screen |
| **Total** | **7.5 / 10** | **Below the pass (8)**, no criterion at 0 |

**Fixes that would raise the score, most valuable first:**
1. Web `canAct` (`contract.ts:11`) to the server's rule, so J3 shows the read-only line, plus the `READ_ONLY` words. This raises next step, feedback and error recovery.
2. The 403 detail (`complaints.ts:355`) and the picker hints to the new rule. This raises plain words.
3. The reminder skips a handler without the record key.

Screenshots (scratchpad, not committed): `/tmp/claude-0/-home-user-xpatready/d51f943f-dad9-5f7c-b253-2a56d58620bb/scratchpad/jt/shots/j3-refused-1440.png`, `…/j3-demoted-handler-{400,1024,1440}.png`, `…/j5-handler-refused-1440.png`, `…/j1-drawer-1440.png` (same folder).

**Could not test:** a real screen reader; a visible browser pane; an intended user's unaided walk (D17 and D20 stay with the founder).
