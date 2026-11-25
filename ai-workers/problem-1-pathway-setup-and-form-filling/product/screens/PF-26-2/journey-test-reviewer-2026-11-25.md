# Journey test: PF-26 part 2 (R1.34), reviewer, 25 Nov 2026

Head 4931ba67bee2182960d177a033808dedad801091. This part is API only; its screen is PF-26s (part 6). So I walked the journeys as API calls
on a scratch database: the real routes, PF-4's guard, audit and PgLegalHolds, with fake jobs, files and clock. I opened no browser and
used no port (never :4400). The script is in the scratchpad only (`break/b1.mts`), plus `tests/check_pf26_person_export.ts`.

## Journeys (persona · goal · result)
1. **Main path.** A Case Manager (user-T) who sees Client B: "give Client B a copy of everything." POST with a reason gives 201
   QUEUED. The job makes it READY. The download is one JSON file holding every module, Client B and the merged record, unmasked, with
   the person's language and the deleted item marked. The request, ready and download lines each name who, the person's id and the
   hash. **Held.**
2. **Alternate.** The lead's owner (user-R) exports with everyone-sees-all off: 201. **Held.**
3. **Empty.** A person with no lead, prospect or client file: 201 with view.all and everyone-sees-all on, 404 otherwise. **Held.**
4. **Error: bad input.** An empty, blank, 301-character or direction-mark reason gives 422 on the field. **Held.** A reason with a line
   break or a tab gives **500** and nothing is saved. **Failed** (review M1).
5. **Error: a failed module.** A module that throws, or one that writes, ends FAILED, the download gives 409 "Export failed", and no
   file is stored. **Held.**
6. **Wrong role.** A Case Officer (no key) gets 403, and no session gets 401. Another staff member's download, another firm's staff,
   and another person's path all get 404. **Held.**
7. **Recovery.** A double click makes two exports (m4). A queue failure after the commit gives 500 and leaves the row QUEUED with no
   job (m3). A retried build after a failed finish orphans the first file (M3, by reading and the breaker's run). **Failed.**
8. **Expiry and hold.** After 7 days the download gives 410 and the file is deleted. While a hold covers the person, the file is kept,
   but it stays after the hold is released: 60 days later it still exists and no job is waiting. **Failed** (M2).
9. **Across the boundary.** The next step is PF-26s's dialog. `GET allowed` answers 200 or 404 (503 until whole), which the screen
   needs to show or hide the action. **Held.**

## Data underneath
There is one row per request, and the reason is stored exactly as sent. The audit lines hold no reason, name or content. A failed export
has `file_key` null and names only its module. As xr_app, firm B sees 0 of firm A's rows. Roles are enforced on the server (journey 6).

## Break it (15 min)
* Held: a 55-record merge chain in the lineage, upper-case ids, firm B with firm A's ids, and a write inside the build.
* Failed: the 55-record lineage is cut to 51 without a word (m2), and a client file without a case is refused (m1).

## Score
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | journey 1 end to end |
| Next step obvious | ½ | a stuck QUEUED row gives no next step (journey 7) |
| Plain words | 1 | "This download has expired", "Request the export again.", "Not available yet" |
| Feedback and state | ½ | a line break gives 500 with no field error (journey 4); "Preparing" never ends (journey 7) |
| Correct data | ½ | an orphaned and a kept copy (journeys 7, 8); the lineage is cut short |
| Error recovery | ½ | a 500 on ordinary input; a retry ends FAILED (files) |
| Accessibility and screen sizes | N/A | no screen in this part |
| Speed | 1 | the whole suite takes 8.5 s; each call is well under 1 s |
| Visual quality | N/A | no screen |
| Trust and sources | 1 | the 7 days are marked Sample; "Unconfirmed: no counsel"; a hash header and the hash on the line |

That is 6 of 8 applicable criteria, so **7.5/10: below pass**. These fixes would raise the score, most valuable first: M1 (feedback and
recovery), M2 and M3 (correct data), m3 (next step).

## Not tested
A real screen reader, the screen itself (part 6), an intended user's unaided walk (D17 and D20 stay with the founder), pg-boss and S3.
