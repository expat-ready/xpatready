PF-6 part 2b (#2127; web only, no API, no migration): with part 1 (frame, session) and part 2a (Team, Invite people, Compare roles, the Person panel), the staff screens are built.

* **Accept invitation** (`/invitation#t=…`, the invitation email's link): an invitee sees the firm and their email, and Continue to set your password signs them in.
  - An expired link shows "This invitation has expired. Ask <firm> to send a new one."
  - A used or revoked link shows "This invitation is no longer valid."
* **My account → Licence:** everyone records their own licence and sees their two-step state.
  - Types and bodies come from the IMM 5476 page; the law societies are Sample until read.
  - The number is shown with the hint "Checked against the usual format only. We never verify licences."
* **Licences** (Owner and Admin, `agent/firm-credential:manage`): everyone's records with the number in full; Change one, or Add licence for a person with none.
* **Security** (`agent/security-policy:manage`): the read-only line "Two-step sign-in is required for everyone."

The licence number is never in a toast, an audit line, an event, an outbox email or a request address. Checked by `tests/check_pf6_staff_browser.ts`: DW5-DW8 for part 2b, DW1-DW4 and DW8 for part 2a, 84/84.

Known gaps (asked on the PR):
* Reset two-step on the Person panel (in the PF-6 row) is in neither part of the brief.
* The provider's two-step set-up link is not returned by the API.
