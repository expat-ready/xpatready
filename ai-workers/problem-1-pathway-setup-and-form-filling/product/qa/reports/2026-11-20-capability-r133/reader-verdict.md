# R1.33 Phone numbers: fresh reader's verdict (20 Nov 2026)

Fresh reader on Opus 5.5. I did not build or test this row. I only read: I ran nothing that changes state and started no server. Main is d07a08fbc on branch claude/modest-franklin-ixcjfu, which adds qa's evidence (007ef8c7a, d8db83498). Paths are relative to `prototype/studio/` unless they start with `product/`.

VERDICT: WORKS. Each Done-when clause, read under P-747, is met by screens and underneath on main's app code. One condition before the row is marked Works: qa must close QA-526 and QA-528 and mark QA-527 answered in `product/qa/BUGS.md`. All three still read "Open" (BUGS.md:40-42). While QA-526 (Major) stays Open, the RULES "no open Major" test fails on paper.

## 1. Done-when clauses (under P-747)
- **Stored as E.164 with country: met.** "Country" means the E.164 calling code, as FO-9a-ph defines it and as the earlier reader accepted. There is no separate country column.
  - By screens: J-33 W3 PASS "the number is saved and shown in E.164 (+14165550100)". W5 PASS "on screen ... shows the number in E.164". The W5 screenshot shows +442079460958 on the lead page.
  - Underneath: W3 PASS `+14165550100|true|+14165550100`. W5 PASS `+442079460958,+442079460958`.
  - Below the screens only: door probe A1, A2, W1, B1 and E2 (one "+44" number at each door, a trunk 0 dropped, "011" dialling). Also check_fo9b_phone_doors D1-D5 (26/26 in ci 44650353018, job 136005240188).
- **Impossible number refused on the field (edit route only): met.**
  - By screens: W2 PASS "staff entering "12" see the field's sentence under the field (role alert, the field marked invalid)". Also PASS "nothing is saved ... no phone audit line", PASS on axe, and the route gives 422 with fields.phone.
  - Code: `api/src/front-office/people/edit.ts:51`.
- **Impossible number kept at every arrival door (P-747): met.**
  - By screens: only the web form, J-33 W1 PASS `12|false|-`, with "Fix number" on the list and the lead page.
  - Below the screens only: Add a lead (probe A3-A6), the web form (W2), booking (B2 `555-0101|false|-`), and the company contact and person port (builder D3-D4).
- **Two spellings match as duplicates: met.**
  - By screens: W5 PASS "the booking's lead says "Possible match: <the web-form person>"". The two people have different emails, so the phone is the only shared key and the check cannot pass on the email. `sales/arrival.ts:41` matches on email or readable phone only, never on name.
  - Below the screens only: probe A7 (Add a lead gives 409 KNOWN_PERSON naming the first person) and builder D6 (the staff duplicate check finds both spellings).
- **Pack on main's head:**
  - j_33 19/19 twice: walks.yml runs 44666100413 and 44666113220 (jobs 136055885546 and 136055899809). The two logs differ only in run stamps and ids.
  - Merge batch ci 44650353018: all 29 jobs succeed.
  - I confirmed `git diff --stat 2d83d243f d07a08fbc -- studio`. It touches only messages code, `lead-page.tsx` (+2 lines, the MessagesPanel only) and qa tests. Nothing phone-related changed after #2405.

## 2. Doors that take a phone
| Door | Normaliser | Readable input | Impossible input |
|---|---|---|---|
| Public web form `sales/public.ts:100` | `phone()` (`sales/common.ts:46-51`), which calls `phoneE164Exact` | E.164, readable | Kept as typed, unreadable (201) |
| Add a lead `sales/leads.ts:154` | `phone()` | E.164, then the 409 match | Kept as typed, unreadable |
| Company new contact `sales/corporate/service.ts:213,229` | `phone()` | E.164, then the 409 match | Kept as typed, unreadable |
| FO person port `people/fo-person-port.ts:27` | `keepPhone(…, phoneE164Exact)` | E.164 | Kept as typed, unreadable |
| Public booking `booking/service.ts:297-298` | `phoneE164Exact` | E.164 | Sent with `phoneReadable:false`; the port's schema refuses an unflagged non-E.164 phone (`ports/arrival.ts:27`) |
| Booking arrival adapter `sales/arrival-port.ts:69,121-127` | Trusts the flag from above | — | Fills an empty phone as unreadable |
| Booking page UI `web/.../booking-public/type-page.tsx:26` | Checks only that the field is not empty (phone mode) | — | Not refused (P-747) |
| Staff edit `people/edit.ts:51` | `phoneE164Exact` | E.164, Fix number cleared | 422 with the field's sentence |
| Duplicate check `duplicates/service.ts:33` | `phoneE164Exact` | Phone key | No key |

- No door disagrees. The loose `phoneE164` (`duplicates/phone.ts:8`) is still exported, but nothing in `api/src` imports it; builder check G asserts this.
- `fo_person.phone_e164` is filled by the database only when the phone is readable and fits `^\+[1-9]…` (FO-9a migration:19-21).
- Both 40-character limits (`common.ts:47`, `booking/service.ts:133`) still refuse an over-long phone with a 422. This is a length rule, not a phone-format refusal, and I accept it.

## 3. Earlier findings
- **QA-526 (Major): fixed in code.** All doors above use `phoneE164Exact`. Proof: builder D1-D5 and G (26/26 in ci), and qa probe A, W and B, 17 of 18 passing twice. BUGS.md:40 still says Open, so qa must close it.
- **QA-527 (Ambiguity): answered by P-747.** The code follows the ruling: arrival doors keep the number, the edit route refuses it. BUGS.md:41 should be marked answered.
- **QA-528 (Minor): fixed.** J-33 W5 walks two spellings ("+44 (0)20…" through the web form, "0044 20…" through the booking page) to the "Possible match" line on screen, and the walks on d07a08fbc pass. BUGS.md:42 still says Open.

## 4. Gate A
- **The walk reaches Engage, and Engage takes the output.** check_r133_gate_a_engage passes 6/6 at 1440, 1024 and 400:
  - The lead shows the E.164 number with no Fix number.
  - Engage makes a prospect in "Engaged".
  - G4: one prospect per person, and the person holds the readable E.164 number.
- **The gate is weak.** Engage does not use the phone at all, and by design the prospect page shows no contact details. So the gate shows "nothing breaks downstream", not "the phone is used downstream".
- **The file header claims more than the check does.** `tests/qa/check_r133_gate_a_engage.ts:4-5` says "a prospect whose page shows the number ... the prospect's intake reads that same number". In fact G2 and G3 go back to the lead page (lines 76-81), and G4 reads `fo_person`, not an intake.
- **A real downstream user of the phone is not gated:** the retainer merge value `client.phone` (finding N2).
- **Ways a qa check could pass for the wrong reason:**
  - On a kept copy, W5 and gate G1 reuse +442079460958. `possibleMatch` picks the newest other person with that phone, so a person from an earlier run could be matched. It works on walks.yml's fresh copies, and on this copy the 1024 and 400 runs show matches to earlier runs' people.
  - The walk logs carry no sha line. The 19/19 lines match, but the link to d07a08fbc rests on qa's run metadata.
  - Probe A7 searches the 409 body for the first person's id. The match has no name key, so this is sound.

## 5. New findings
- **N1, qa E3: Gap · Minor. Does not hold R1.33.** A staff edit that gives a person another person's number does not re-flag their lead as a possible match. The edit route makes no match at all (`people/edit.ts:56-65`), and the staff are not warned. The Done when asks that two spellings match as duplicates. W5 and A7 show that at arrival, and the staff duplicate check (`duplicates/service.ts`) would still find the pair. AG-2-84's flag is set on arrival. Raise it as a suggestion for an FO-9 follow-up.
- **N2: Gap · Minor. Does not hold R1.33.** The retainer merge value `client.phone` takes the raw `fo_person.phone` whether it is readable or not (`retainers/service.ts:321`). A "Fix number" phone such as "12" or "555-0101" can be printed in an agreement. The booking `contactOf` drops an unreadable phone (`arrival-port.ts:114`); retainers do not.
- **N3: Gap · Minor. Does not hold R1.33.** FO-9b has no data migration. Rows stored by FO-2's old rule stay readable in their old form, for example "+4402079460958" (trunk 0 kept) or "+9991234567", and keep that `phone_e164`. They will never match the new spelling. This matters only for databases kept from before bc51aac90, such as the demo, if its database persists.
- **N4: UX · Minor. Does not hold R1.33.** E.164 is shown unformatted to staff ("+442079460958", visible in the W5 screenshot). It is hard to read aloud or dial.
- **N5: Ambiguity · Minor. Does not hold R1.33.** The gate A header claims more than the gate checks (see section 4).

## 6. Not checked
- I did not open the GitHub runs, so I could not confirm the run and job ids or the head sha. I relied on the saved logs and git.
- I did not re-run the door probe or gate A; their outputs come from qa's own isolated copy at d8db83498, whose app code equals d07a08fbc's.
- I did not check libphonenumber-js behaviour beyond the cases tested, for example other countries' trunk prefixes.
- I did not check the web form's and Add a lead's own client-side field rules beyond what the walks show.
- Case-side `case_party_index.phone_e164` uses a separate rule (country code plus number). It is outside R1.33's front-office scope and I did not check it.
