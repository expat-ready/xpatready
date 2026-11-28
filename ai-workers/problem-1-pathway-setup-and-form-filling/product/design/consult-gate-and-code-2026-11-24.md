# Consultation gate and the Code: Q1 (no signed agreement) and Q2 (email code off), 24 Nov 2026

For Lead 26's ruling. The founder's ask was typed to Lead 25 on 24 Nov: "consultation may go without a signed agreement … see what the best in class practices do … I don't want to over tighten it … keep it flexible". R1.104. Every legal point here is **Unconfirmed: no counsel**.

**How this was read.** From this cloud container, laws-lois.justice.gc.ca, college-ic.ca, canada.ca and every vendor help site were refused by the network policy. So:
* The Code quotes come from the full read of 13 Nov. File `product/design/lead-b-trace-2026-11-14/t8-regulator.md` on branch `lead-b-front-office` @198f43adce. Page "current to 2026-10-19", "Date modified 2026-11-02".
* Lead 25 read the official text again on 24 Nov (the brief for this lane): s. 23(1), 23(2)(c), 23(3) "signed", no urgency exception, no e-signature or identity rule found.
* **s. 26 was not re-read by anyone I can cite: verify it on the Mac before ruling.**
* Vendor lines are search-result excerpts, seen 24 Nov, from the URL given. They are vendor claims, not checked against the live page.

## Q1: may a consultation go ahead with no signed agreement?

**Facts (Code SOR/2022-128):**
* s. 23(1): before an initial consultation the licensee "must enter into a written consultation agreement with that potential client". This applies even when the consultation is free (s. 23(2)(c): "the fee for the consultation or, if the consultation is provided pro bono").
* s. 23(3): the licensee must "keep a copy of the signed consultation agreement … provide a copy to the client".
* s. 25: "Sections 23 and 24 do not apply to a licensee who is a salaried employee" (of an education institution or its representative body, conditions apply). This is narrow. It is not a general exception.
* College Guide 2022-001 (2022, pre-dates SOR/2026-68, so it may be stale): the agreement "must be dated and signed by the client and the licensee". Of the service agreement it says "A service agreement can be in written or digital form".
* Nothing found in the Code allows urgency or a verbal agreement. The 13 Nov reading records "digital signature allowed (guide only)" from the Guide; the Code itself has no e-signature rule.
* The Code binds the **licensee**, not the software or the booking. A lawyer, a Quebec notary or a non-Canadian adviser using the product is not a College licensee. I found no equivalent rule for them, but did not verify that.

**Facts (our requirement and code):**
* AG-4-15 rule 4 (AG-04 v2.1, 25 Oct, MS-D3): "'Not accepted yet' is a warning on the booking and never blocks anything". Test: "given a staff-made booking never accepted, then it still confirms and the reminders still go". AG-04's decision table, Rule 7 (line 153): "Warn, never block; no regulator or statute names in product text". AG-4-15 asks for acceptance and lists "No e-signature" as a non-goal; our build adds the firm's countersignature (FO-3c, B3 in the challenge).
* Today's `gate.ts` (main @1a7028e7d, from #3420, Lead 22's ruling on QA-772) refuses Attended (`booking/service.ts:457`) and the consult record (`consult/service.ts:140`) with 409 `AGREEMENT_NOT_SIGNED`. It does this whenever the type needs the agreement and none is signed, including when none could ever be sent (no client email, no template, nobody licensed).
* Paper counts in the gate (`SIGNED_OFFLINE`). But "Signed offline has no route while nothing has been sent: FO-5's draft lacks `booking.id`" (#3420 comment 7124548527).

**Market (14 products surveyed; 9 documented):**

| Product | What it does | Source (seen 24 Nov) |
|---|---|---|
| Acuity Scheduling | Requires acceptance at public booking, per type. Paraphrase: "clients must acknowledge these terms to complete their booking" | help.acuityscheduling.com/hc/articles/47291505860749 |
| Microsoft Bookings | Required questions at booking (not an agreement as such): "won't be able to complete the booking until they've answered the required questions" | learn.microsoft.com/…/bookings/add-questions |
| Practice Better | Requires it at booking, per service. Forms needing the practitioner's signature cannot be booking forms | help.practicebetter.io/hc/en-us/articles/360016092851 |
| Jane App | Tracks and reminds; staff may fill a form in: "Jane will record that the form was completed by a staff member" | jane.app/guide/completing-intake-forms-in-clinic-fill-out-options |
| SimplePractice | Tracks and reminds; paper upload; "visibly show, the client's IP address along with the timestamp" | support.simplepractice.com/…/41929603998605 |
| Clio Grow | Tracks: "track status, set due dates, send reminders, and resend expired document links". Booking can require payment, not a signature | help.clio.com/…/53355315984923 |
| INSZoom (Mitratech) | Tracks a DocuSign contract's status; no scheduling gate | success.mitratech.com/INSZoom/…/INSZoom_-_Contract_Management |
| Cal.com, Wix Bookings | A required checkbox or waiver at public booking only | cal.com/help/event-types/booking-questions.md; Wix waiver article |
| Docketwise, Officio, MyCase, Lawmatics, Smokeball | Nothing documented on any gate | — |

**Pattern:**
* Public self-booking may require acceptance before the booking completes.
* Staff bookings and the meeting itself are tracked and reminded, never blocked. No product documents a hard block on holding the meeting.
* No product documents an override with a reason and an audit trail. Ours would go beyond the market.
* Caveat: none of these tools is bound by a pre-consultation agreement rule, so "no block" is an absence of documentation in unregulated tools, not proof of best practice under a rule like s. 23.

**Testing the Lead's hypothesis, part by part:**
1. *Booking always allowed.* **Holds.** It matches AG-4-15, the Code (s. 23 binds the consultation, not the booking) and every tool.
2. *A signed paper copy counts.* **Holds.** The Guide's "dated and signed" is met by paper. **Gap:** no route exists when nothing was sent. It must be added, or "paper" is unusable in exactly the cases that need it (no client email).
3. *The firm's choice per consultation type stays.* **Holds.** Same as AG-4-15 r1 and every booking tool.
4. *A licensee may go ahead with a recorded reason.* **Holds, and for a stronger reason than "flexible".** The software cannot stop a meeting. A Zoom or phone call happens whatever the app says. Refusing Attended only:
   * (a) hides a consultation that happened;
   * (b) blocks billing, because Attended bills the paid consult (AG-4-44);
   * (c) pushes staff to mark No-show or skip the record.

   A hard block makes the records less true, not the firm more compliant. What reduces the Code risk is: the agreement sent early, the paper route, a reason recorded by the licensee who answers for it, and a firm list of exceptions to fix.
5. *A consultation that really happened can always be recorded.* **Holds.** It follows from 4. The reason is asked in the same click as Attended, so nothing is ever hidden.
6. *A warning only where the Code does not apply.* **Holds, but s. 25 is too narrow to drive the product.** The real case is a firm whose staff are not College licensees, which is a firm setting. Keep it a firm-level choice ("our consultants are not College licensees: warn only"), not a per-person detection. s. 26 is unverified (see the top).

**Recommendation Q1 (judgement; confidence medium-high on the product, low on the law):**
* Replace the hard 409 with a **licensee's reason**.
* Attended or the consult record on a booking that needs an unsigned agreement asks for a reason, in the same request:
  * "Client signed on paper, copy to upload";
  * "Client agreed in writing by email";
  * "Urgent, agreement to follow";
  * "Other: <text>".
* Only staff with a licence record may give it. Anyone else gets today's 409, worded "a licensed consultant must record why".
* It is audited. The booking shows "Held without a signed agreement: <reason>, <who>, <when>". A firm list "Consultations without a signed agreement" shows these, and the signed copy can be added later.
* Add the Signed-offline route for a booking with no agreement row.
* Firm setting "Warn only", off by default, for firms that are not College licensees.
* This returns to AG-4-15's spirit (never hide, never trap), keeps the Code's pressure where it belongs, and needs a DECISIONS row (Lead 22's ruling changes).

**Cost:**
* 2 PRs, about 1.5 days of a builder:
  * (1) API: reason, permission, audit, firm list, paper route, tests (~550 lines);
  * (2) the booking and consult screens and the list (~350 lines).
* **One additive migration** (3 nullable columns on `fo_booking`, plus the firm setting) needs the Lead's stamp.
* The no-migration alternative reads the reason back from the audit log. It is cheaper by about 2 h but fragile; I advise against it.

## Q2: a signing link with the email code switched off

**Facts:**
* P-564 (14 Nov): the code is on by default and a firm may switch it off. It goes beyond AG-5-61 r13.
* Canadian law asks for no particular strength:
  * The Ontario Electronic Commerce Act s. 11(1) says a signature requirement "is satisfied by an electronic signature" (ontario.ca/laws/statute/00e17). Its reliability test in s. 11(3) applies only to prescribed documents.
  * BC ETA s. 11(1) says the same.
  * PIPEDA's "secure electronic signature" (SOR/2005-30, a certificate-based digital signature) applies only to listed federal requirements, not to client contracts.
* The Treasury Board *Guidance on Using Electronic Signatures* (2019) ties strength to the harm of a wrong signature (assurance levels 1-4). The level table was not read.
* The Code and the College say nothing on e-signatures (Lead 25, 24 Nov). The Guide accepts "written or digital form" for the service agreement.

**Market (seen 24 Nov):**

| Product | Default beyond the emailed link | Who can lower it | Source |
|---|---|---|---|
| DocuSign | None | Admin sets "Any recipient must authenticate…", sender-choice, or disabled | support.docusign.com (pik1583277475390) |
| Adobe Acrobat Sign | Email only ("For many customers, this is sufficient") | Admin default by account or group; "When disabled, only the default method … can be used" | helpx.adobe.com/sign/config/send-settings/auth-methods/overview.html |
| Dropbox Sign | None | Admin makes methods available; "senders choose whether to apply" | help.dropbox.com/security/manage-signer-authentication-settings-dropbox-sign |
| PandaDoc | None unless the admin sets a "Default verification" (incl. email code) | Senders "can override the verification method per recipient" | support.pandadoc.com/en/articles/10205305 |
| Zoho Sign | None unless the admin ticks "Enforce Authentication" (Email OTP etc.) | Admin, account-wide | help.zoho.com/…/recipient-authentication |
| signNow, BoldSign | None; per recipient | Sender | signnow.com/help/add-two-factor-authentication; support.boldsign.com/kb/article/20362 |

**Pattern:**
* No product turns an email code on by default. P-564 is already stricter than the market.
* Where a stronger check exists, the admin decides and can lock it (DocuSign, Adobe, Zoho).
* **No product limits lowering by document kind.** The finest grain is Adobe's group.

**Recommendation Q2 (confidence medium-high): keep P-564, and warn at switch-off.**
* Only the Owner (the firm's admin role) may switch it off.
* The switch shows: "Signing links will work for anyone who has the email. Keep the code on for retainers."
* The switch-off is audited with who and when.
* Signed copies and the audit trail record "email code: off" for each signature, so a later dispute shows it.
* **Do not limit it by document kind.** There is no market or legal precedent, and it adds a matrix for little gain. Revisit if counsel asks.

**Cost:** about 3 h, 1 PR under 200 lines, no migration. It waits on #3433 (the setting lives there; not touched by this lane).

## Revised after the challenge (`consult-gate-and-code-2026-11-24-challenge.md`)
The challenge's verdicts: Q1 agree with changes, Q2 agree with changes. Taken:
* **A1, licensed is self-declared.** A licence record is free text that any staff member can save for themselves (`platform/identity/routes.ts:73-75`, `identity/service.ts:356-358`). The app cannot verify a licence. So the reason is given by the person who **answers for it**: the host with a licence record, else a representative of record (`gate.ts` `CAN_SIGN`, the same rule as signing today). It is attributed to them by name in the audit, and it is never presented as "verified".
* **A2, the reasons.**
  * "Signed on paper" becomes the `SIGNED_OFFLINE` route (also for a booking with nothing sent), and the booking shows "copy owed" until the file is uploaded.
  * "Agreed in writing by email" and "Urgent, agreement to follow" are dropped: neither is a signed agreement, and the second invites a breach.
  * What is left: **"Other: <reason, required text>"**, plus the paper route.
  * The firm list is named for what it is: consultations held without a signed agreement. That is a record the College may ask for, which is the point of truthful records. It is not a risk-reducer.
* **A3, who rules.** The founder's 24 Nov ask ("consultation may go without a signed agreement … implement") is the authority. Lead 26 rules the design and writes the DECISIONS row owed since Lead 22's ruling (`gate.ts:11`), which conflicts with AG-4-15 r4. If Lead 26 reads it as still open, it goes to the founder (AGENTS rule 2).
* **A4, money.** On the reason path, Attended does not bill by default: "Bill when signed" (the default) or "Bill now". The fee is itself a term of the unsigned agreement (s. 23(2)(c)), and the trust rules are s. 32-33 (Unconfirmed: no counsel).
* **B1, before the meeting.** The app does hand out the join link (`booking/service.ts:930`, `:937`). Add a warning to the host on the booking before the start, and "Please sign the consultation agreement before the meeting" beside the client's join link. No block.
* **B4, B5.**
  * "Warn only" is Owner-only and audited, and is shown on the firm list. Its wording names no regulator (Rule 7): "Our consultants are not required to have a signed agreement before a first consultation".
  * An Admin may give the reason for the host only if the Admin is themselves the answering licensee (A1's rule); otherwise 409.
* **Cost, revised:**
  * About 2.5 builder days in 3 PRs:
    * (1) API reason, audit, billing hold, tests (~550 lines);
    * (2) the paper route with no agreement sent, and "copy owed" (~300 lines);
    * (3) screens, warnings, the list (~400 lines).
  * 1 additive migration (reason columns, the firm setting) to stamp, and possibly a 2nd for the paper route's link to the booking.
* **Q2 wording fixed:** "Signing links will then open for anyone who has the client's email. This applies to every agreement you send." Store "email code: off" on each signature; this needs no migration only if signature evidence is JSON (to check in #3433). The "stricter than the market" point is context, not the argument; the argument is harm-based (Treasury Board guidance).
* Also check, on the Mac: whether the Guide (2022) is still current, and whether the College's 2026 regulations (SOR/2026-68) touched s. 23.

## Question for the tech lead
1. **Q1:** replace the hard 409 with an audited reason from the answering licensee ("Other: <text>"), plus the paper route (also with nothing sent), billing held until signed, a warning before the meeting, and an Owner-only "Warn only" setting? **Recommended.** About 2.5 days, 3 PRs, 1-2 migrations to stamp, and a DECISIONS row replacing Lead 22's ruling.
2. **Q2:** keep P-564, Owner-only switch-off with the warning above and an audit line, "email code: off" stored on each signature, no limit by document kind? **Recommended.** About 3 h, after #3433 merges.
3. **Before ruling:** read s. 23, s. 26 and SOR/2026-68 on the Mac (this container cannot reach laws-lois or college-ic).
