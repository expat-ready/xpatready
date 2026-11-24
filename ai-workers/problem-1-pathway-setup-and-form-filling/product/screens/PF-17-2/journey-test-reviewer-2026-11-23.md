# PF-17 part 2: journey test (reviewer role), 23 Nov 2026

Commit d1cf4ba67d872b2fbd3ecb1455d1d3d378e0176c. This part is an API only; the console screens come in part 4. I walked the journeys over HTTP against the **real app**: an isolated copy (`tools/isolated.sh rev_pf17s 4437`, runtime lane port; `PLATFORM_SYSTEM_IDENTITY=local`, `PLATFORM_IDENTITY=local`; the API connects as `xr_app` behind PF-12's walls). Port 4400 was not used. The firms raised their tickets through their own product route (`POST /api/platform/support/tickets`, multipart). Our staff were added by SQL, because no product screen adds them yet. I read the data with psql. The script is `journey.mjs` in the reviewer's scratchpad and is not committed. I ran it twice; both runs gave the same results. The copy was then stopped and its database dropped.

## Journeys
| # | Persona · goal | Steps | Result |
|---|---|---|---|
| J1 | Support staff: "what do I answer first?" | Sign in (second step) → `GET /api/system/support/tickets` | 200 in 17-44 ms. Firm A's and firm B's tickets come oldest first, each with its firm name, its subject (the first line, Unicode intact: "réservation ✓ 予約"), the raiser's name, the status and the message count. Held. |
| J1b | Support: "open it and answer" | `GET …/tickets/<t1>` → `POST …/<t1>/replies {body}` | The thread shows the raiser named from firm A's staff. The reply answers 201 with the ticket, status `WAITING_ON_FIRM`, the last message `SUPPORT`, "ExpatReady support". Held. |
| J1c | Firm A's Representative: "did support answer?" | `GET /api/platform/support/tickets/<t1>` with the firm's token | Status `WAITING_ON_FIRM`, our message last. In the queue, t1 drops below every unanswered ticket. Held (the step across the boundary to PF-18b's firm side). |
| J2 | The firm writes again | `POST /api/platform/support/tickets/<t1>/messages` | t1 is `WAITING_ON_SUPPORT` again. It goes back among the unanswered tickets, after the older ones, which is BR-15 read literally (by its latest message). Held. |
| J3 | Support: "only this firm / only waiting on firm" | `?firm=<UPPER-CASE uuid>`, `?status=WAITING_ON_FIRM` | Firm A's 2 tickets; the right count. Held. |
| J4 | Wrong role | Billing lists; Auditor and Admin reply; a firm token on the queue | 403 each time, naming the missing key. Auditor and Admin can still read (DW1). Held. |
| J5 | Error | Blank, missing or non-text body; an extra `ticketId`; `null` or broken JSON; text/plain; a closed ticket; `%00` and an encoded `../` id; `?status=` given twice; `?firm[a]=` | 422 SUPPORT_FIELDS or SUPPORT_QUERY with the field named; 400 BODY_NOT_JSON; 409 "A closed ticket takes no new message…"; 404 "No such support ticket.". Never 500. Held. |
| J6 | Recovery: double click on Send | Two identical replies at the same moment | **Both 201: two SUPPORT messages land** (review m4). Partly held. |
| J7 | Recovery: odd paths | Upper-case ticket id, upper-case path, trailing slash, HEAD | 200 each time. Held. |

## Break-it (15 min)
* Long text: a 5,000-character `é` reply is accepted. A reply with a direction override is stored as sent, under PF-18b's rules.
* Load: 5,006 tickets across 2 firms. Page 1 takes 16-22 ms, page 50 takes 24-27 ms, a status filter takes 12-15 ms; 50 rows a page; `total` is correct.
* All-or-nothing (a probe on the suite's harness): when PF-18b's audit line fails inside the reply, the error is raised and the message, the status and the firm's `platform.bypass` line are all rolled back. A good reply writes exactly one bypass line on its own firm.
* The service called on any other route, a firm's support route included, is refused (DW7).

## Data underneath
* The reply writes:
  * one `SUPPORT|support` message;
  * one `support.ticket.replied` line on the firm's own trail;
  * one `platform.bypass` line per open and per reply on that firm's trail;
  * one firm-less `platform.console.support-queue` line per list call.
* `plat_system_audit` has one line per call, refused calls included.
* Nothing else changed.

## Score (0 / ½ / 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1-J1c: read the queue, open a ticket, reply; the firm sees "Waiting on firm". |
| Next step obvious | ½ | The queue order says which ticket is next. But the refusals are PF-18b's words for the firm: a closed ticket says "raise a new ticket instead", and a blank reply says "write what you need help with". Neither is the support person's next step. |
| Plain words | 1 | "No such support ticket.", "Check the highlighted fields", the 403 names the key. |
| Feedback and state | 1 | 201 with the whole ticket and its new status; `total`, `page`, `pageSize` on every list. |
| Correct data | 1 | Firm, subject, raiser and count equal the rows (J1, DW2); one message, one replied line, one bypass line; all-or-nothing holds. |
| Error recovery | ½ | Every refusal is a 4xx in plain words. But a double click posts the reply twice (J6). |
| Accessibility and sizes | N/A | No screen in part 2 (part 4). |
| Speed | 1 | 13-44 ms per call; 5,006 tickets at 12-27 ms (STANDARDS §9). |
| Visual quality | N/A | No screen in part 2 (part 4). |
| Trust and sources | 1 | The keys are seeded as Sample with "Unconfirmed: SA10-X3 pending", the page size is Sample, and every call is audited on the right trail. |

**Score: 7 of the 8 applicable criteria, which scales to 8.75 / 10. No criterion is at 0, so it passes.**

Fixes that raise the low scores, most valuable first:
1. Record the double-submit departure (STANDARDS [M] "Idempotent creates"); part 4's composer should disable Send while a reply is in flight (m4).
2. Part 4: give support staff their own words for 409 and blank-body refusals.

Not tested: a real screen reader, widths and zoom (there is no page yet); an intended user's unaided walk (D17 and D20 stay with the founder).
