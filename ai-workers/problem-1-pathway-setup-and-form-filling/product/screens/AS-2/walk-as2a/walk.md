# AS-2a walk at 1440 px (25 Nov 2026, isolated copy evidence_as2a, head 57e2df814)

Setup: the Visitor visa set up (its library), then a Sample stream "Sample stream AS2A" with one cited Sample gate,
assessment only, submitted, signed off and released by a second person (no form). US$0, live AI off.

1. `1-open-a-case-dialog-1440.png`: the case officer opens "Open a case". The stream is listed under "Released, not ready
   for new cases" with: "Sample stream AS2A": Assessment only: no forms. This release is used to assess a person; a case
   does not open on it. **As intended.** Opening it by the API gives 409 in the same words (check_as2a A).
2. `2-review-release-1440.png`: the author's combination page, Review and release. Released in Release 3, version 1.
   **Finding (for a screens part, not fixed here):** the page still reads the release as a broken filing configuration.
   It shows the badge "Not ready", the next step "Assessment only: no forms … firms cannot open cases until it is fixed",
   "Forms 3 to do" and "Documents 1 to do", the button "Open a case on Release 3", and "Next: the firm opens a case on
   it". Nothing stops a person: the case side refuses. But the words are wrong for a release that is meant to have no
   case. The gate's source does not show on this page either; the review lines carry it (check_as2a W and A).

Proposed part **AS-2a2** (screens; `engine/setup-checklist.ts` and the combination page): an assessment-only release
shows the status "Assessment only" (not "Not ready" or "Live"), no form or document to-do, no "Open a case" button and
no "Next: the firm opens a case", and lists each gate with its source. About 150 lines, before AS-2d1 shows real streams.
