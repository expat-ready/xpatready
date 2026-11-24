# qa capability R1.58 — after FO-7t part 1 (#3033) (24 Nov)

**Ask:** Lead 24: #3033 merged at 12:51 IST; walk R1.58 on main's head (j_58, gate A by screens, the reader's verdict).
**Run:** main 21af27936 · isolated copies (`PLATFORM_IDENTITY=local`) · live AI off · US$0 · never :4400.

## Verdict
**Partial, no verdict (P-606).** Fresh reader (Opus): the same.

| Check | Result |
|---|---|
| `check_fo7t_trust.ts` (#3033's own: answer, requests, deposits, ledger, balances) | 62/62, exit 0, **twice** |
| j_58 | 8/22, exit 1, **twice**, same steps (unchanged from 23 Nov) |
| Gate A by screens (j_58 W5: Money › Trust) | no `/money/trust` page: FO-7s3b |

**Why j_58 did not move:** its FO-7t part 1 steps fail on the journey's own guesses.
* W1 deposit: it sends `receivedAt`. The server stamps the time itself, and the strict body answers 422 "Unrecognized key".
* W6 ledger: it asks `?party=`. The route takes `personId` or `companyId`, plus `caseId`, `currency`, `pageSize` and `after` (reads.ts:48).
* W1's operating cheque answers 404 "No such invoice": the journey's invoice setup needs a check during the alignment.

Aligning j_58 to #3033 is a test change, so it comes in its own qa PR.

## Parts missing
* FO-7t part 2: applications (Pay from trust), refunds, the deliberate pick.
* FO-7t part 3: the To move list and its batches.
* FO-7s3a, FO-7s3b: the trust screens, including Money › Trust and the client below zero in red.
* FO-7m.
* FO-7v: the reversal. It is not on checklist row 58.
* A shortfall read: no row names one.

## Run ids
None: a walks run of j_58 now would repeat its guesses. Once j_58 is aligned: `walks.yml`, ref `main`, journeys `j_58` (asked of the Lead).

## Questions for the Lead
1. OK for a small qa PR that aligns j_58 to #3033 (deposit and ledger bodies, the invoice setup)? That needs a reviewer Approve.
2. Are FO-7t parts 2-3, FO-7s3a/b and FO-7m on lanes? Lead 13 held parts 2-3 as owed starts.
