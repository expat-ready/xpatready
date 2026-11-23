# FO-7q part 3: journey test (reviewer, 23 Nov 2026)

Commit `e51fcc3e5bc93f5d0f3489f272729c4a0897c8ed`, PR #3306. **This row adds API reads only, with no screen.** Each journey is walked at the API the FO-7s1 builder's "Bill to" box and the invoice list will call. The calls go through the suite's Nest app (PF-4 guard, PF-12 walls, local sign-in) on a random port; the demo (:4400) was not used. A real browser walk waits for FO-7s1. Persona: a staff member of the Sample firm building an invoice (concept-invoices.md (b) step 1; Walk step 2).

## Journeys
| # | Persona and goal | Steps | Expected | Result |
|---|---|---|---|---|
| J1 main | Biller: "bill my client Client Wonbee" | sign in as user-R, GET `/money/parties?q=wonbee` | won person and won company, each with kind, name and province ON | Held (P2 pass, P6 pass, P7 pass via PgMoneyVisibility) |
| J2 alternate | Case officer with only their own case: "bill the client of my case" | scope = case X | X's client company only | Held (P4 pass) |
| J3 empty | Biller types a name with no won match | q = an open prospect's name, or an email | `items: []`, never the prospect | Held (P2 fail, P3 fail) |
| J4 error | Biller types one letter, or 101 letters | q=w, q missing, q of 101 letters, an extra `firmId` | 422 naming q ("Type at least 2 letters of the name.") | Held (P7) |
| J5 wrong role | READ_ONLY staff, or no session | GET with token T, then with no token | 403, 401 | Held (P7) |
| J6 other firm | Firm B staff search the same words | firm B ctx, ALL scope, then firm A ids forced into scope | only firm B's party; none of firm A's | Held (P1), enforced by SQL and PF-12 RLS |
| J7 case-side client | Biller: "bill Client Direct, whose case I opened on the case side" | party made as `runtime.ts:357` makes one (no prospect), with an invoice on their case, then search | Client Direct found (a client, not a prospect) | **Failed**: 0 hits with ALL scope and with that case in scope, though the invoice row names them (probe in a scratch copy) |
| J8 recovery | Biller retypes the same search, or double-fires it | repeat the GET 3 times | the same answer each time, no write | Held (read-only, RepeatableRead) |
| J9 across the boundary | Biller picks a hit, starts a draft, sees it in the list | hit kind and id go to `POST /invoices`, then the list row | the draft's Bill-to province equals the hit's; the row shows billTo name and caseLabel | Held by construction: the same `provinceCode(billToProvince(...))` (`drafts.ts:70`, `parties.ts:96-97`); list and detail labels (P5) |

## Data underneath
Rows checked through the suite's psql fixtures. The search writes nothing and adds no audit line (read-only). Each hit carries only kind, id, name and province, never email or phone. List and detail carry the same `billTo` and `caseLabel` (P5). A person with no stored name shows `name: null`, never their email.

## Break it (15 min)
* `%%` and `__`: no match; the LIKE escaping holds, and the mutation that removes it is caught.
* An array q, and an extra field (`firmId`): 422.
* 25 matching won people: 20 answered, sorted by name. The cut order can differ from the displayed order past 20 of one kind (review m2, Minor).
* Another firm's ids in the scope: nothing answers (J6).
* Long or non-English names: not walked beyond the 100-letter limit (Minor gap in this pass).

## Findings
* **Major (J7):** clients born on the case side are never found. See `review.md` M1 for the fix.
* Minors m1–m3 are in `review.md`.

## Score (each 0, ½ or 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | ½ | J1–J6 held; J7 failed for every case-side client |
| Next step obvious | 1 | the hit's kind and id feed `POST /invoices` with no other read (J9) |
| Plain words | 1 | "Type at least 2 letters of the name.", "At most 100 letters." |
| Feedback and state | 1 | 401, 403, 422 and `[]` are distinct; never "CAD 0" or a guessed name |
| Correct data | ½ | names and province exact (P3, P6); J7's clients missing |
| Error recovery | 1 | 422 names the field and nothing is read; retrying is safe (J8) |
| Accessibility and screen sizes | N/A | no UI in this row (FO-7s1) |
| Speed | 1 | HTTP search 15–20 ms; a list page with labels 8–12 ms; 3 batched reads per page |
| Visual quality | N/A | no UI in this row |
| Trust and sources | 1 | stored names only; province from the firm record; null, never a guess; fixtures marked Sample |

**Total: 7/8 on the applicable criteria, 8.5/10 scaled. Pass (8 or more, no 0).** The verdict is still **Changes** because of the open Major. To raise the score, fix J7 (M1); that lifts both "task completed" and "correct data".

## Not tested
No browser, screen reader, keyboard, 1024 px or 200 % zoom (no screen). D17 and D20 stay with the founder's walk on FO-7s1. Search speed at production scale was not measured.
