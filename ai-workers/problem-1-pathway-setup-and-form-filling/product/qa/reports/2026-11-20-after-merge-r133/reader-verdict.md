VERDICT: PARTIAL

R1.33 Phone numbers, main a70aa2c36 (studio tree = #2268 merge 7aa9b3b84). Fresh Opus reader (P-303), read only: nothing run.
App code read at /tmp/claude-501/qa7/rec/.../prototype/studio/ (paths below are relative to studio/).

## 1. Done-when clauses against j_33 PASS lines
(a) Stored as E.164 with country: MET for the staff edit door only.
  - PASS "J-33 W3: underneath, the person holds +14165550100, readable, and the database's phone_e164 follows" -> "+14165550100|true|+14165550100".
    j_33.ts:86 + :126 read fo_person by SQL (not only the screen); :125 checks the screen; :139 reads the API answer (phone "+14165550101").
  - "With country" means the E.164 calling code only. No country column exists (prisma/schema/front-office-sales.prisma:174-179);
    +1 is shared by CA, US and the rest of NANP. The FO-9a-ph row (BACKLOG.md:376) defines it as "keeps its country (E.164)", so I accept it.
    Non-Canadian numbers are covered by check_fo9a_phone_edit.ts:92 (+44 kept), not by the journey.
(b) An impossible number refused on the field: MET on staff edit only.
  - PASS "J-33 W2: staff entering "12" see the field's sentence under the field (role alert, the field marked invalid)" (the sentence is quoted in the line);
    PASS "J-33 W2: nothing is saved ... "12|false|-""; PASS "J-33 W2: the same through the route: 422 ... fields.phone". Asserted at j_33.ts:113-118.
(c) Two spellings of one number flagged as duplicates: NOT IN THE JOURNEY. No W step in j_33.ts (W1-W4) enters a second spelling or checks "Possible match".
  No other journey covers it: j_28 matches by email only, j_28.ts:178. Covered only at service level by check_fo9a_duplicates.ts:98-104
  (53/53, ci-suites.txt job 135878881537) and by the 18 Nov qa walk on 15c75cd52 (row.md). Gate A (P-348c) by screens is not shown for this clause.
Seeded or set up outside the screens: the web form is switched on, and its consent wording published, by SQL/store (j_33.ts:47-49, declared Sample).
Firm B's lead is made through the API (j_33.ts:133). seedSampleFirms + seedSampleFirmsFrontOffice. This is acceptable set-up; nothing under test is faked.

## 2. Doors that take a phone (read in the code, not run)
- Staff edit PATCH /api/front-office/people/:id (people/edit.ts:41-51): libphonenumber phoneE164Exact (duplicates/phone.ts:20-29). Refuses with the field's sentence. GOOD.
- Public web form (sales/public.ts:100) and staff "Add a lead" (sales/leads.ts:154), also corporate new person (sales/corporate/service.ts:213):
  FO-2's regex phone() (sales/common.ts:44-50), not libphonenumber. GAPS:
  * "+44 (0) 20 7946 0958" is stored as "+4402079460958", readable, which is not E.164 (the trunk 0 is kept). duplicates/service.ts:31-34 admits this
    ("stored by FO-2's rule as +4402…"). The same number typed "+44 20 7946 0958" then gives +442079460958: no match in arrival.ts:41 (exact stored phone)
    and none in dup.check either. So two spellings of one number do not match, and the stored value is wrong: this fails clauses (a) and (c) for such input.
  * Any "+" followed by 7-15 digits counts as readable with no possibility check ("+999 1234567", "+1 234 5678" -> +12345678): stored as
    E.164 with no Fix number, although the edit route would refuse the same number.
  * Staff "Add a lead" (staff typing, not a public door) accepts "12" with 201 and no field message. j_33.ts:133/137 depends on this (bLead.status === 201).
    edit.ts:6-7 says staff typing "can be asked to correct it". Only the edit route does so. This needs a Lead ruling on whether rev 17.21 covers Add a lead.
- Public booking (booking/service.ts:126): a zod regex ^\+[1-9][0-9]{6,14}$ after stripping punctuation. "416 555 0100" with no country code is refused
  (that is in words, "with its country code"), but an impossible "+"-shaped number is passed on as readable:true (sales/arrival-port.ts:69). Same gap as above.
- FO person port (people/fo-person-port.ts:27, case-side client creation): keepPhone with phoneE164, which uses isPossible plus region CA. The review M1
  bug fixed in the edit route (local-only "555 0100" -> "+15550100") is still open in this door, by the same reading (duplicates/phone.ts:11 vs :23-25).

## 3. Permissions on the staff phone edit
Key agent/prospect:edit (edit.ts:74); own versus all as FO-2v (edit.ts:31-38); any other person is 404. The journey proves only the firm wall
(PASS "J-33 W4: firm A's Owner ... -> 404, and B's person still holds "12"") and the firm's own Owner (PASS "J-33 W4: firm B's Owner can fix their own person").
Roles are covered at service level in check_fo9a_phone_edit.ts: Case Manager 404 and own lead (:106-:125), deactivated owner (:122),
Read-only role without the edit key (:166, a key-list check, not an HTTP 403 call), under the firm walls as xr_app (:172-:174). Adequate.
The screen hides Edit without permission (web/src/modules/front-office/sales/lead-page.tsx:67-69, mayEdit). Not walked as a lower role.

## 4. P-339 evidence
- Pack: auto-verdict.json run 44619429206 (job 135897157513) on 7aa9b3b84, overall PASS, j_33 exit 0 + secret scan pass. walk-steps-autoproof.txt: 16/16 PASS.
- Independent re-run: walks.yml run 44619936002 job 135898927378 on main a70aa2c36. walk-steps-rerun.txt: the same 16 PASS lines (new run stamp).
  It has no secret-check line, which is normal for walks.yml.
- Batch: ci 44613682025 (draft #2386, head 9ac8b4da0): all 29 listed jobs success (ci-jobs.txt). Studio tree 49982094d = main's (batch-checks.txt).
  Front-office suites green: check_fo9a_phone_edit 36/36, check_fo9a_duplicates 53/53, check_fo2_leads_prospects 113/113.
P-339 is met for what the journey asserts.

## 5. Holds (P-305)
bugs-open.md is empty: no open Major or Critical names R1.33. Nothing holds it on that ground.

## Why PARTIAL
1. Clause (c), duplicates, has no PASS line in the journey walked by screens. The only proof is service-level, plus a walk on an older head.
2. The public web form, staff Add a lead and booking doors do not use the libphonenumber normaliser. A "+44 (0) …" spelling is stored as non-E.164
   and does not match its other spelling. Impossible "+"-shaped numbers are stored as readable E.164.
3. Staff Add a lead keeps "12" with no field message (the journey itself relies on the 201). The refusal "on the field" exists only on the edit route.

## Minor findings worth logging
- M-a: the FO person port still turns a local-only "555 0100" into a readable "+15550100" (the review M1 fix was not applied there).
- M-b: no possibility check for impossible "+" numbers at the regex doors. Suggest one normaliser (phoneE164Exact semantics, never refusing on public doors).
- M-c: fixing a number through the edit route does not re-run the possible-match check, so a fixed "12" -> +14165550100 that equals another person is never flagged.
- M-d: "country" is stored only as the calling code. If an ISO country is needed (+1 is CA, US and others), ask the Lead to rule.
- M-e: J-33 should gain a W5: a second web-form lead "+1 (416) 555 0100" -> "Possible match" on screen, with the DB link checked by SQL.
