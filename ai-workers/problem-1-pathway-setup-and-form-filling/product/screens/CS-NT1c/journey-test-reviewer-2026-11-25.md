# Journey test: CS-NT1 part 3 (reviewer), 25 Nov 2026

Head: bbd1ad9e275d023a15acd58c33014698ffc72c16, also run at 8afd05d8c. Isolated copy `rvnt1c` on :4435 (`isolated.sh … --ttl 40 PLATFORM_IDENTITY=local`), stopped afterwards with its database dropped. Sample data only, US$0.
This part is API only, with no screen. A person would use it through part 4's panel, so the journeys run on the routes a screen would call, and the data is checked in the database underneath. There was no browser walk.

## Journeys (persona · goal · expected)
1. **Main.** Firm A's Owner adds a note on a case, then opens the case's timeline. Expected: the note shows with who and when; the case's other lines show newest first. (j_76 W1, W4)
2. **A person.** A Case Officer writes a note on the case client: "prefers email". Expected: it is stored on the client, not on a case, and is listed with its author. (j_76 W3, probe)
3. **Alternate.** Filter the timeline by kind (NOTE; DOCUMENT and DECISION together), by author and by day. Expected: only those lines. (check DW14)
4. **Empty.** A new case's timeline. Expected: 200 and no lines, `more: false`. (DW13 on A2, j_76 W4 fail)
5. **Error.** Text over 5,000 characters, a bad cursor, an unknown kind. Expected: 400 naming the field, in words. (probe, DW13, DW14)
6. **Wrong firm.** Firm B's Owner opens firm A's client notes, case notes and case timeline by URL. Expected: 404 every time and no words shown. (j_76 W7, DW18, probe)
7. **Recovery: double click.** Two adds at once with one idempotency key. Expected: 1 row. (probe)
8. **Recovery: stale edit.** Two officers edit one version. Expected: one 200, the rest 409 NOTE_CHANGED. (breaker's run; check_csnt1_notes)
9. **Across the screen boundary.** The case page shows the panel (part 4) and the person's timeline shows (CS-NT1t). Expected: **not built yet**. j_76 W5 and W8 fail as their parts are missing.

## What held
* j_76: **24/27** at both heads. The 3 failures are later parts only: CS-NT1t, part 4 and FO-4 part 2b.
* Probes: a multilingual note (German, Chinese, Arabic) → 201, stored as typed. Double click → 2 × 201, 1 row. 5,001 characters → 400 "Keep the note to 5000 characters.". Firm B → 404 "No such client in your firm.". The case's timeline holds no client note. Timeline 30-34 ms; client notes 16-33 ms.
* Data: each change wrote one `case client` audit line ("Note added on client CL-00001") with no case and no note words. `case_note` has one row per version.
* Paging: 120 lines with one timestamp page as 50/50/20 with no skip and no repeat (DW13). Another firm's planted line is left out (DW14). The F2 to F5 lines pass (check file, 32/32).

## Findings
* **Major (review M1).** @mentions (AG-13-22) and the client's timeline (AG-13-33) are not built. The stated blocker, "no NotificationPort on main", is false: `ports/notifications.ts` has been on main since 15 Nov. A person who is @mentioned is never told. See review.md.
* **Minor.** A page can be empty with `more: true` after 10 reads (`timeline.ts:124`). Part 4 should keep reading.
* **Minor.** Every read seq-scans `audit_event` on the `case_id` branch (`timeline.ts:89`). Fine at sample size, slow on a large trail.

## Score (0, ½ or 1, with evidence)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | j_76 W1-W4 and W7 pass. The note on a person and the case's timeline work end to end |
| Next step obvious | ½ | `more` and `nextCursor` tell a caller what comes next, but there is no screen yet (part 4) |
| Plain words | 1 | Errors and audit words are plain: "No such client in your firm.", "Note added on client CL-00001" |
| Feedback and state | ½ | `more` and `nextCursor`, 409 NOTE_CHANGED with the current note. An empty page can still say `more: true` |
| Correct data | 1 | DB checks after each journey: one row per version, idempotent, right firm, no leak (DW14, DW18, F5) |
| Error recovery | 1 | 400 naming the field, 409 with the current note, replay on a double click |
| Accessibility and screen sizes | ½ | No screen to check. j_76 had no page errors. Not evidenced, not failed |
| Speed | 1 | 30-34 ms on the copy; 109-126 ms with 200k lines (breaker), within the 200 ms of §9 |
| Visual quality | ½ | No screen (part 4) |
| Trust and sources | 1 | Every line has who, name, when and refId. No AI involved |
| **Total** | **8/10** | **Pass** (8 or more, no 0) |

What would raise it: part 4's panel, with an empty state and keyboard use (next step, accessibility, visual); filling a page until it is full (feedback).

Could not test: a real screen reader, an intended user's unaided walk (D17 and D20 stay with the founder), or a browser walk of this part (it has no page).

Verdict: pass 8/10. The review's verdict (review.md) is separate: Changes, because M1 is open.

## Round 2 (e0f270db3), reviewer, 25 Nov
Copy `rvnt1c2` on :4435 (`isolated.sh … --ttl 40 PLATFORM_IDENTITY=local`), stopped afterwards with its database dropped. Sample data only, US$0. j_76: **24/27** (the same 3 later parts).
New journeys (API, data checked in `msg_notification` and `audit_event`):
10. **@mention (main).** The Owner writes a note mentioning two colleagues and themself. Expected: each colleague is told once and the writer is not. **Held:** 2 rows. A replay adds none. The colleague's list shows the case number and a link to `/cases/<id>`.
11. **Error.** A mention of firm B's staff, of 21 people, or of a non-id. Expected: 400 naming `mentions`, nothing written. **Held.** The same idempotency key with other mentions gives 409 IDEMPOTENCY_KEY_REUSED.
12. **A person.** A client note mentions a colleague. **Partly held:** they are told, but their list gives no label and no link, so the bell would say "This item can no longer be opened" (review m5).
13. **Edge.** A deactivated colleague gives 201 and is listed in the audit as mentioned, but is not told (m7). Same words plus a new mention gives 200 `unchanged`, and no one is told (m8).

| Criterion | R1 | R2 | Evidence (round 2) |
|---|---|---|---|
| Task completed | 1 | 1 | Journeys 10-11 end to end through the real notification adapter |
| Next step obvious | ½ | ½ | A case mention links to the case; a client mention has no link (m5) |
| Plain words | 1 | 1 | "Mention people of your firm only.", "At most 20 people." |
| Feedback and state | ½ | ½ | m4 is still open; a mention on an unchanged edit gets no error (m8) |
| Correct data | 1 | 1 | One row per person; the replay and the reused key hold; the audit has ids, no words |
| Error recovery | 1 | 1 | 400 naming the field, nothing written; 409 on a reused key |
| Accessibility and screen sizes | ½ | ½ | No screen (part 4) |
| Speed | 1 | 1 | An add with 2 mentions takes 32-40 ms; the timeline reads within the workspace (m2) |
| Visual quality | ½ | ½ | No screen |
| Trust and sources | 1 | 1 | Who and when on every line; no AI |
| **Total** | 8 | **8/10** | **Pass** (no 0) |

To raise it: a `case-client` labeller (m5) for next step; part 4's panel for accessibility and visual. Could not test: a screen reader, an intended user's walk (D17, D20).

## Round 3 (7669263d8), reviewer, 25 Nov
Copy `rvnt1c3` on :4438 (`isolated.sh … --ttl 30 PLATFORM_IDENTITY=local`), stopped afterwards with its database dropped. Sample data only, US$0. j_76: **23/26**. The same 3 later parts fail. The setup "Demo › Load" line did not run because the copy already held the checkpoint.
This round re-ran journey 5 (Error) on the timeline's query only, because that is all the diff changes:
* **Held:** an unknown filter, a repeated filter, a bad kind, an impossible day, a reversed range and a foreign cursor each give 400 naming the field, in words. A blank filter still reads as no filter (200). Each 400 took 10-16 ms.
* **New, minor:** `?__proto__=1` now answers 200 (zod drops the key) where it was 400. Nothing is stored or shown (review m10).
* **Not a journey failure, but it blocks the merge:** the type check fails on 3 new errors in timeline.ts (review M2). At run time nothing changes for a person, because tsx strips types.

Score: unchanged at **8/10, pass** (no 0). Every criterion is as in round 2: no step a person takes changed, and the error words are the same. Could not test: a screen reader, an intended user's walk (D17, D20).
