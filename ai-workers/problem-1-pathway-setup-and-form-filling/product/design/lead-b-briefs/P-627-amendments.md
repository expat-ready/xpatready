# P-627 amendments to the PF/FO briefs (Lead B (6), rev 16.44, 16 Nov 07:2x IST)

These come from the founder's seven morning answers (P-627, on `lead/2026-11-07-lead31`) and P-628 (the Lead decides product questions while the founder is away). Answers (3), (4) and (5) are case-side batches (#1875, #1876, #1886), which are not Lead B rows. **Paste each block above its brief when starting the builder.** Where a block differs from the brief's text, the block wins.

## PF-13, firm branding (`lead-b-briefs/PF-13.md`, on `main`). P-627 (6) as amended by P-629 (rev 16.45)
**The founder's question is closed. Firms brand with the logo, colours, favicon, banner and a tagline** (P-574 (1), P-629). This is against AG-16-2's "no … banner or tagline field", and the founder's word wins (AGENTS rule 2, P-629). Read with the brief's "differ" point 1, which this replaces. Rev 16.44's "no tagline field anywhere" is withdrawn.
* **Part 1 adds the banner** as a third image kind:
  - It goes through `FilesPort` under `branding/banner`: `PUT /api/platform/branding/banner` (`agent/settings:edit`) and the public `GET /api/public/firms/:firmKey/branding/banner`. The rules match the logo's: the same stable link with `?v=`, `nosniff`, and the metadata walk.
  - PNG or JPEG only; SVG refused.
  - At most 2 MB (Sample).
  - It shows on the **client portal's header** (the client link pages' header, in part 2) and nowhere else.
* **Part 1 adds the tagline** as a registered setting `platform.branding.tagline`:
  - plain text, trimmed, 1 to 80 characters, one line (no line breaks, no markup);
  - empty means none;
  - change key `agent/settings:edit`;
  - in `GET /api/platform/branding` and the public `GET /api/public/firms/:firmKey/branding`;
  - audited like the other fields.
  - It shows **under the firm's name** on the client portal's header (part 2) and on FO-3w's public booking frame (the DW7 line). It is drawn as text, never as HTML.
* **Emails and PDFs keep only the logo and the firm's name** (P-629: deliverability, plain legal documents): no banner, no tagline, no favicon there.
  - Confirmed by Lead 64 (Lead ruling under P-628, 16 Nov 07:3x IST, listed for the founder's review): AG-16-2's SHALL items in the email (the sender name and the footer with the address, phone and licence text, DW8) and the brand colour (DW5) stay as the brief has them. P-629 is about the new extras, not the legal footer.
* **Added Done when lines:**
  - `PF-13 DW9 pass/fail` (banner).
    - Pass: a banner saves and shows on the client link page's header; its public link answers 200 after 10 minutes.
    - Fail: a 2 MB + 1 byte banner → 413 naming 2 MB; an email and a PDF after a save carry no banner.
  - `PF-13 DW10 pass/fail` (tagline).
    - Pass: "Immigration help, plainly" (25 characters) saves, comes back in both reads, and shows under the firm's name on the client link page and the public booking page.
    - Fail: 81 characters → 400 naming 80; a line break → 400; `<b>x</b>` is shown as those literal characters, not bold; an email and a PDF after a save carry no tagline; firm B's tagline never appears in firm A's answers.
* **Size (P-610):** the banner and tagline add about 60 and 40 lines, so part 1 stays under 800. If it would pass 800, the tagline moves whole to part 2 (setting, routes, DW10), and part 1 ships without it.
* Touch list unchanged.

## FO-3c, consultation agreement (`lead-b-briefs/FO-3c.md`, on `main`). P-627 (7)
**The founder's question is closed: one signing path.** The brief's "differ" paragraph and its founder question are replaced by this.
* **Part 1 is unchanged in scope** (AG-4-15's accept flow), with one addition. The booking records the acceptance as **kind, version, time and who**:
  - `fo_booking.accepted_via` (`BOOKING_PAGE | LINK`, the kind);
  - the existing `accepted_template_version` and the accepted time;
  - `accepted_by_person_id` (the booker's person record, who).
  - All in the same migration. The accepted copy and the audit line name all four.
  - **Added Done when line:** `FO-3c DW8 pass/fail`. Pass: a public tick stores `BOOKING_PAGE` and the person, and a staff booking's link stores `LINK`. Fail: an acceptance with no person is never stored.
* **No separate signing is built in FO-3c.** No `SigningPort` call, no signature columns, no "Sign" button.
* **Part 2 (new wording): signing through FO-6's `SigningPort`, starts when FO-6 is on `main`.**
  - After a booking, the consultation agreement is sent for signature through the same port the retainer uses: the client, then the licensed host (contracts §2.4).
  - The signed copy is filed through `FilesPort` under the person.
  - The recorded acceptance stays as the record until the signature lands.
  - **Signing never blocks a booking**: an unsigned agreement is a warning, as AG-4-15 r5 and MS-D13 have it for retainers.
  - **Unconfirmed: no counsel.** Code s. 23(3) says "signed", and whether a recorded acceptance meets it is not settled. That is why part 2 exists.
  - Part 2 gets its own brief from Lead B when FO-6 lands.
* **FO-3w is unaffected**: the tick on the type page is FO-3c part 1's line (P-626 A1).

## FO-3s1 to FO-3s5, calendar sync (BACKLOG rows). P-627 (1), (2)
* **Booking stays ours; no Calendly.** No row changes, because none used it.
* **Google first, with our own adapter (FO-3s2), US$0.** FO-3s5's screen may merge with Google alone, as its row already allows ("either adapter is enough to merge, the other's button hidden until it lands").
* **FO-3s3 (Microsoft) is not dropped.** P-627 does not name it. It stays shaped and comes after FO-3s2. If Lead 63 wants it held, that is a P-628 ruling for Lead 63.
* **Cronofy is a dated fallback only**, used if Google's review of the calendar scopes stalls. It needs:
  - **the date** (Lead 63's to set, P-628);
  - a line in the outside-dependency register: the Google OAuth app's verification for the free/busy and event-write scopes, which has a lead time of weeks, so it must start now;
  - **no Cronofy code** until that date passes. If it is needed, Cronofy is an adapter behind the same `CalendarPort` (FO-3s1), so no other row changes.
