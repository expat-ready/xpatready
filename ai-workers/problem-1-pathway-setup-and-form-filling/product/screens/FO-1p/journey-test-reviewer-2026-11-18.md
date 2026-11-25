# FO-1p journey test: reviewer, 18 Nov 2026 (commit 6f65706d0)

FO-1p is a port and has no screen or route. The "user" is the case side's opening, CS-K1 part 2, acting for a case officer, plus its backfill job and FO-8. I ran each journey as a call to `PrismaFoPerson`, as xr_app under the firm walls, on a scratch database with every migration: the PR's suite plus my own probes. There was no browser, axe or screen-width pass, because there is nothing to show. No isolated app copy was needed, since nothing is served.

## Journeys
| # | Persona and goal | Steps (as calls) | Expected | Result |
|---|---|---|---|---|
| 1 | A case officer opens a case for a new person client | `ensureForClient` with names, email in mixed case, phone `(416) 555-0101` | one fo_person; email lower case; `+14165550101`; `created_by staff:<id>`; one ids-only audit line | Held |
| 2 | The opening is refused after the port ran | the caller throws after both calls | no person, no company, no audit line | Held (and a forced audit failure leaves none) |
| 3 | A returning client has the same email as an old enquirer | an existing person has the same email | a new person, never linked; FO-9a can see the pair | Held (the pair assertion is weak, m4) |
| 4 | FO-8: a won Individual or Corporate prospect becomes a client | `prospectId` (also in upper case) | that prospect's person or company; no row; no line | Held. A not-won prospect also returns its party (decision; accepted). |
| 5 | A company client is opened | `ensureCompanyForClient` "Sample Maple Works Ltd" | one fo_company, trimmed, no person | Held |
| 6 | The wrong kind is asked for | a Corporate prospect to `ensureForClient`, and the reverse | 409 `FoPersonKindMismatch`, nothing written | Held |
| 7 | Wrong firm: firm A names firm B's prospect, an unknown id, or "P-00001" | three calls | 404 `FoPersonNotFound`; nothing in either firm | Held. A firm-A transaction with firm B's id is refused, but with a misleading message (m1). |
| 8 | A brand-new firm's first case, three openings at once | 3 parallel walled transactions, no setup row | all succeed; 1 setup row, seeded once | Held (my probe: `1/1` seeded, 16 stages, 2 persons) |
| 9 | Backfill over a DELETED or ABANDONED firm's clients | `ensureForClient` | a named refusal, the same as the fake | **Failed:** raw Prisma FK error; the fake makes a person (m1) |
| 10 | Bad input from a caller's bug | untyped actor, `person:` actor, blank name, bad email; then a line break, NUL, "--", a 5,000-character phone | 400 `FoPersonInvalidInput`, nothing written | **Partly:** the first group is refused as expected; the second is stored, or reaches a raw DB error (m2) |

## Data underneath
After the journeys I read fo_person, fo_company, fo_sales_setup and audit_event directly:
* Each row exists once, with exactly the values given.
* No other row changed.
* Each audit line has `entity` fo_person or fo_company, an `actor_type` that matches the actor word, `detail.firmId` set to the caller's firm, and no name, email or phone.

## Break-it pass
* **Race:** three first calls at once held. The FOR SHARE lock on the prospect is held, so an UPDATE times out at 500 ms; this has no test (m3).
* **Long and non-English text:** the 200-character limits hold.
* **Phone length:** a 5,000-character phone is accepted (m2).
* **Company names:** "Ltd." and "Co. Inc." keep their words (FO-2b's rule). "²" reaches a check violation (the same edge exists in FO-2b).
* **Fake against adapter:** their phone readability differs ("+1 555 0101", "1234567"; m5).

## Score (adapted to a port: each criterion judged for the calling code)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | ½ | 8 of 10 journeys hold; J9 fails; J10 holds only in part |
| Next step obvious | 1 | three named errors with statuses (404, 409, 400), each naming the field or the kind to ask for |
| Plain words | 1 | "No such prospect in this firm.", "This prospect is a company: ask for its company." |
| Feedback and state | 1 | ids returned; one audit line per party made, none for a prospect's own party |
| Correct data | ½ | values exact, but control marks, line breaks and a no-letter name are stored, and the phone has no limit (m2) |
| Error recovery | ½ | rollback is clean and the seed is retry-safe, but DELETED/ABANDONED/unknown firms and NUL give raw errors (m1, m2) |
| Access (stands in for accessibility and screen sizes) | 1 | firm-scoped lookup plus the walls; cross-firm refused with nothing written |
| Speed | 1 | one setup read per call; the suite runs in 7 s; the seed runs once per firm |
| Consistency (stands in for visual quality) | 1 | follows the PF-0c port pattern: port, fake, token, contract, adapter, one binding line |
| Trust and sources | 1 | ids-only lines; typed actor; the fake's phone rule labelled Sample |

**8.5/10, no criterion at 0: passes the journey bar.**

Fixes that would raise the low scores, most valuable first:
1. m1: a named refusal for a closed or unknown firm, the same in the fake.
2. m2: FO-2's text rule in the port schema.
3. m4: assert both persons in FO-9a's result.

Not tested: a real case opening (CS-K1 part 2 is not built yet); a seed with released combinations; an intended user's walk (D17/D20 are N/A for a port).
