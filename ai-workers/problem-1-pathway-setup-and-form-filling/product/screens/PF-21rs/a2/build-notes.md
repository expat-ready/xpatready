# PF-21rs A2 — build notes (R1.86; concept r2 §7 Q1; row W4; j_86 W6)

**What A2 builds:** the breach's own page `/system/privacy/breaches/:id` (concept §4 "A breach", board §3-§4), on top of A1 (#3538):
* the header: calculated status, "n of m sent", recorded by, "Kept 7 years; never deleted", the one next step (`NEXT_STEP`);
* **What happened** card, with "Edit the record". For a draft from an alert it shows "Confirm the record" instead (A1's form, `record-breach.tsx`, with `breach`: PATCH of what changed only; confirm adds `status: RECORDED` and the description; no discovery time; a notified firm offers no Remove);
* **Decision** card: "Decide" or "Change the decision" (Notify the affected firms / No notice, Why, the guard's reason), fixed once a notice is sent;
* **Notices to firms:** one row per firm the breach names (and any notified firm). A sent row shows its time in `<time datetime>`, the recipients and roles, the sender, the subject and "Words sent" (the words as sent, from R0's read; the note when they cannot be read back), and "Sent: cannot be sent again". An unsent row has "Send notice to <firm>" behind a confirmation, one firm at a time; a 409 shows the API's words on that firm's row;
* **History:** every event in words (`historyWords`), newest first, with our staff member's name.
* The list's rows now link to the page, and "Record the breach" opens the new breach's page with "Recorded. Next: decide whether firms are told." (A1's list-side note is removed).

**Not in A2:** "Send to every firm" and an alerts page's "Open a draft" (concept 6b, *Not built*); requests and holds (part B).

**Files** (`prototype/studio/`): `web/src/modules/system/privacy/{breach-page.tsx (new), contract.ts, record-breach.tsx, breaches-page.tsx}`, `web/src/modules/system/routes.tsx`, `tests/check_pf21rs_browser.ts` (A2 steps).

**Checks:** `check_pf21rs_browser.ts` 37/37 twice on a fresh copy, before the rebase onto A1's merged head. j_86 27/28: W6 passes; W10 moves to R1.87 (Lead 2 on #3538).
