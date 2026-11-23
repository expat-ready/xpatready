# Journey test: FO-7g part 3, j_56 W3, the tax default for one invoice (reviewer role, 23 Nov)

Head `267f25dfa54d7d43c8e19d7945d222116de64236` (PR #3190).

This change is API only: no screen. There was nothing to walk in a browser, so I walked the journeys over live HTTP:
* `j_56.ts` on an isolated copy `j56rv` on the runtime port **:4436** (stopped afterwards, database dropped);
* the PR's check;
* a probe copy of the check on its own scratch database.

I never used :4400. US$0, no model call.

## Journeys (persona: a biller at an Ontario firm, registered for tax; Owner holds `agent/invoice:edit`)
1. **Main:** a client is in Nova Scotia. The biller drafts an invoice and sets its Bill-to to NS (`PUT …/bill-to`).
   The default for that invoice is 14 % HST, source PARTY_PROVINCE, and the next fee line stores 14 %.
   j_56: W3 and W4 PASS (`FEE:150000:140000:21000`).
2. **Alternate, no edit:** the draft keeps the firm's ON copy. The invoice default is 13 %, FIRM_PROVINCE (B8 fallback).
   Without `invoiceId`, the default is the firm's, as before (B8, j_56 W2).
3. **Alternate, issued:** an issued NB invoice still answers NB's 15 % (B8; its Bill-to is frozen).
4. **Company client:** Bill-to QC answers QC's 5 % GST, PARTY_PROVINCE (probe).
5. **Error:** Bill-to ZZ gives 422 and the stored value stays NS (j_56 W3 fail). A malformed, repeated or empty
   `invoiceId` gives 422 with no rate (B8, probe).
6. **Wrong client or firm:** another client's invoice, firm B's invoice, a random id, and a cross-kind ask all give the
   same 404, "No such invoice for this client in your firm.". Firm B's token gives 404 (B8, probe, j_56 W8).
7. **Not registered:** a Bill-to NB invoice gives 0, NONE, `registered:false` (B8).
8. **Firm changes:**
   * The firm's province is unset: the invoice still gives the Bill-to's rate, the same as the line.
   * The firm moves ON → QC: an old ON copy gives ON's rate (correct), labelled PARTY_PROVINCE (m1).
9. **Recovery:** the read is safe to repeat. It writes nothing and adds no audit line (probe).
10. **Across the boundary:** the line step (`addLine`) stores exactly the rate this read gives, in every case tried. The
    invoice screens (FO-7s1, W9) are not merged, so W9 fails, as its label says.

## Findings (all Minor, details in `review-w3.md`)
* m1: `source` mislabels a stale fallback copy as PARTY_PROVINCE, and an explicitly chosen firm-province Bill-to as
  FIRM_PROVINCE. The rate is right in both cases.
* m2: `routes.ts:5-6` comment is stale.
* m3: B8 has no COMPANY or upper-case case.
* m4: the address-driven Bill-to is deferred by the row; restore it in W3 when the address row lands.

## Score
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | j_56 W3 and W4 pass live: NS 14 % on the default and on the stored line |
| Next step obvious | 1 | 422 names the field and the 13 codes; 404 says "for this client in your firm" |
| Plain words | 1 | the new 404 text is plain and the same for every hidden case |
| Feedback and state | ½ | `source` can mislabel who chose the province (m1) |
| Correct data | 1 | the rate equals `addLine`'s in every case; only cited-table rates; no write |
| Error recovery | 1 | 422 and 404 write nothing; a Bill-to refusal leaves the stored value unchanged |
| Accessibility and screen sizes | ½ | not applicable: no screen |
| Speed | ½ | not timed against §9; answers were immediate |
| Visual quality | ½ | not applicable: no screen |
| Trust and sources | 1 | cited CRA table only; P-797 and Memorandum 3-3-6 cited in code; "Unconfirmed: no accountant" |

**8/10, pass** (no criterion at 0). The fix that would raise the score most is m1: record whether a Bill-to was chosen
or copied, so `source` is true before a screen shows it.

Not tested:
* A browser, keyboard or screen reader (no screen).
* Timings.
* An intended user's unaided walk: D17 and D20 stay with the founder.
