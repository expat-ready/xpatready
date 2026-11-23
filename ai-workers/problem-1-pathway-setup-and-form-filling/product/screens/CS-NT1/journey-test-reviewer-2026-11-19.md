# Journey test (reviewer): CS-NT1 part 1, plain notes on a case, API level

Commit `e8cc6fbfbd2407c4ae0678d9dcbbbd4e1c5b2585`. Isolated copy `rv_csnt1` on :4681 (`PLATFORM_IDENTITY=local`, sample seed), stopped afterwards. Part 1 has no screen (the panel is part 4), so every journey was walked through the API as each person's requests, in order, with the database read underneath. No browser, no axe, no screen sizes. Live AI off, US$0.

## Journeys
1. **Case officer, main path:** "write down what the client told me, pin the important one, share one update with the client." Open a case → add 2 notes → pin the first → mark the second client-visible → list. Expected: 201, 201, pinned first, the shared one badged. **Held** (builder's walk, 30/30 OK).
2. **Client:** "see the updates my firm shared." user-P `GET /api/runtime/cases/:id`. Expected: only the client-visible current note, no staff names or ids. **Held**; after "make it internal again" the client sees none; an old CLIENT_VISIBLE version never shows.
3. **Alternate, edit:** the author edits the shared note → the client sees the new words; history keeps every version. **Held** (4 versions).
4. **Wrong person:** a Case Manager who is not the author edits → 403 `NOT_NOTE_AUTHOR`; Owner → 200. **Held.** With a stale version the non-author gets 409 first, then 403 on retry (review m2).
5. **Wrong firm:** firm B's Owner on firm A's case, and on firm A's note through firm B's own case, on all 6 routes → 404, nothing written. **Held** (8 calls). Same-firm sibling case with the note's key → 404. **Held.**
6. **Not signed in:** x-actor user-O with no token on list and add → 401. Another client (user-Q) on the case read → 404; a configuration person → 403. **Held.**
7. **Error input:** U+2028, NBSP only, array body, non-JSON body, 2 MB text, version "1" or 1.5 → 400 with a field message each. Russian, Chinese, Arabic, an emoji and CRLF are kept exactly. `<script>` is stored and returned as plain text (rich text is part 2; the panel must render it as text). **Held.**
8. **Recovery, double click and two tabs:** 10 adds at once with one idempotency key → 10× 201, one note id; same key with other text → 409 `IDEMPOTENCY_KEY_REUSED`; pin and visibility on one version at once (two people) → one 200, one 409 `NOTE_CHANGED` carrying the current note. Two adds without a key → two notes (the key is the double-click guard; part 4 must send one). **Held.**
9. **Reset, across the boundary:** a note on a case → Demo › Reset to the six → 0 notes left; full Reset; the configured checkpoint loads again. **Held.**

## Data underneath
One `case_note` row per version; `author` fixed, `by_actor` per version; firm id is the case's. One `audit_event` per change (`case note`, keyed by the case, summary "Note edited on case 34cee3a8"), detail with `beforeVersionId`/`afterVersionId`, visibility and pin: **no note text**. api.log: no note text. Read path: `case_id` is not an index condition (review M1).

## Score (each 0 / ½ / 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | Journeys 1-3, 9 all complete through the product's own routes |
| Next step obvious | ½ | No screen; responses carry `version`, `canEditText`, `edited`, `unchanged` for the panel |
| Plain words | 1 | "Write the note first.", "Someone changed this note since you opened it (you had version 1; it is now version 2). Nothing was saved." |
| Feedback and state | 1 | 409 returns the current note; `unchanged: true` when nothing was written; `replayed: true` on a retry |
| Correct data | 1 | Values stored exactly (non-Latin, CRLF, emoji); one row per retry; audit lines match |
| Error recovery | 1 | Idempotent add, stale-version 409 with the current note, field errors on 400 |
| Accessibility and screen sizes | ½ | No screen to test (part 4) |
| Speed | 1 | Every call ≤ 50 ms with the checkpoint loaded (unindexed read noted, M1) |
| Visual quality | ½ | No screen to test (part 4) |
| Trust and sources | 1 | Author and last changed by on each note; every version kept and readable; client sees no staff ids |

**Total 8.5 / 10, pass (8 or more, no 0).** The three ½ scores are "no screen in this part", not defects; part 4's journey W1 scores them.

## Could not test
A browser, keyboard, axe, 400/1024/1440 px (no screen). A real screen reader. An intended user's unaided walk (D17, D20 stay with the founder). Playwright replay (nothing to drive until part 4).
