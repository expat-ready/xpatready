# PF-28 (R1.10): the sweep's 19 by-design exceptions and what still blocks proof (22 Nov, 16:2x IST)

Asked by the tech lead (Lead 4, 16:02 IST) so qa's j_10 can name what is missing.
* **Counted on:** `tests/pf28-allow-list.json` with parts 2-6 merged, i.e. main plus #2933 (part 5).
* **After #2933 and #3039 merge:** the probe list is empty, the code list is empty, and 19 exceptions stay.
* **The rule for an exception:** a line that answers otherwise by design, with a written reason the tech lead accepts (`REASON` in `check_pf28_inputs.ts`). It still has to fail the way it says.

## Accepted (4): no block
The tech lead accepted these at 16:02 IST. In each, `{}` is a valid body, so a random id answers 404:

| Line | Part |
|---|---|
| `POST /api/public/bookings/:token/cancel missing` (cancel by link) | 4 |
| `PUT /api/front-office/bookings/:id/consult-record missing` | 4 |
| `POST /api/front-office/prospects/:id/retainers missing` (Prepare retainer) | 5 |
| `POST /api/front-office/retainers/:id/download-link missing` | 5 |

## Not yet accepted, by design (11): they block until the tech lead says yes; nothing to build
**Recommendation: accept all 11.** Each is the same class as an accepted line, or the door's own answer for any input.

**`{}` is a valid body, so a random id answers 404** (the same class as the four above):

| Line | Part |
|---|---|
| `POST /api/platform/staff/invitations/:id/resend missing` | 2a |
| `POST /api/front-office/conflict-checks/:id/confirm missing` | 3b |
| `POST /api/front-office/prospects/:id/convert missing` | 3a |

**One answer for every id, so a malformed one says nothing:**

| Line | Answer | Part |
|---|---|---|
| `DELETE /api/platform/complaints/:id id:id` | 405 `COMPLAINT_KEPT` (a complaint is never deleted) | PF-21w |
| `GET /api/public/invitations/:token id:token` | 200 with its state, `NOT_VALID` (the token is not a uuid) | PF-4b |
| `POST /api/public/invitations/:token/accept id:token` | 410 `INVITATION_NOT_VALID` | PF-4b, PF-6m2 |

**A sign-in door's own status:**

| Line | Answer | Part |
|---|---|---|
| `POST /api/platform/session/callback missing` | 401 `SIGN_IN_CODE_REFUSED` (no code) | 2a |

**The SNS door checks the signature first, so an unsigned body is 400 "not signed by Amazon SNS" before any field is read** (PF-19b part 2, AG-10-32):
* `POST /api/public/messages/ses-notices 1mb`: also keeps AWS's own 300 KB limit
* `POST /api/public/messages/ses-notices missing`
* `POST /api/public/messages/ses-notices unknown`
* `POST /api/public/messages/ses-notices wrong-type`

With #3039, the envelope runs through the one rule after the signature. The check is `check_pf19b2_ses` "PF-28 fail: a signed notice whose envelope breaks the schema". Accept these four once #3039 merges.

## A real gap in the sweep (4): block proof by the sweep; a small follow-up row is recommended
These four lines are all `POST /api/public/forms/:token/submissions` (the public web form, FO-2), with the probes `missing`, `unknown`, `wrong-type` and `unreached`.

**Why the sweep can't reach the door:** the sweep's copy has no live web form.
* The seeded forms are off.
* A live form needs a consent wording.
* The door checks the page's origin.

**Where it is proved today:** part 3b proves the door on a live form in other suites, `check_fo4_sales_browser` and `check_fo2_leads_prospects`. There, an unknown field, a wrong type or no submission id → 422 named, nothing stored.

**The gap:** this is outside the sweep. A web-form route added later would not be swept automatically (row line (4)).

**Two options for the tech lead:**
* **(a)** Accept the other suites as the proof, and accept the four lines.
* **(b) Recommended:** a follow-up, about 30 lines in `check_pf28_inputs.ts` only. Before it counts rows, the sweep switches on one Sample form with the Sample consent wording, and probes it with the form's `Origin` header. Then the four lines leave, and the exceptions drop to 15.

## For j_10
To be proven, R1.10 needs:
1. #2933 (part 5) and #3039 (SNS) merged, so the probe and code lists are empty.
2. The tech lead's yes on the 11 by-design lines above.
3. For the 4 web-form lines, either (a) or the (b) follow-up.

Until then, j_10 names these 15 lines as the missing ones (11 + 4).

**Also seen, not R1.10's:** `journeys/j_48.ts:120` stops before its SNS step. The locator "Choose Free consultation" now matches two links, `free` and the seeded `sample-free-consultation`. The change behind #3039 touches no booking or web file, so this looks like a breakage already on main, for the J-48 owner.
