# qa capability R1.56 — W3 after FO-7g part 3 (24 Nov 01:3x IST)

**Ask:** Lead 13: #3190 (FO-7g part 3, the Bill-to province) merged at 01:28 IST; walk R1.56's W3 on main.
**Run:** main afe9727ee · isolated copies (`PLATFORM_IDENTITY=local`, port 4456) · live AI off · US$0 · never :4400.

## Verdict
**Partial, no verdict (P-606).** W3 now passes; three steps still wait on unmerged parts.

| Run | Result |
|---|---|
| j_56 local, run 1 | 15/18, exit 1 |
| j_56 local, run 2 | 15/18, exit 1 (same steps) |
| walks.yml on GitHub, 45255715529 (afe9727ee) | 15/18 (same steps) |

**W3 (new passes):**
* A client billed in Nova Scotia (the invoice's Bill-to province) gets Nova Scotia's HST, 14 %, not the Ontario firm's 13 %. The source is `PARTY_PROVINCE`.
* A Bill-to outside the 13 codes is refused (422) in words, and the Bill-to stays NS.

Tax rates are Unconfirmed: no counsel.

**Still failing, each naming its part:**
* W1, invoice from a signed retainer: `retainerId` is refused (422 "Unrecognized key"). No backlog row is named yet.
* W9, Money › Invoices lists the issued invoice: waits on FO-7s1, the invoice screens. The label also names FO-7q, which is on main (#3001, #3197), so that wording is stale.
* W9, the walk on to R1.57's card link: waits on FO-7c and FO-7s1.

No new bugs. No fresh reader was run, because nothing here claims Works (P-339 applies to Works).

## Questions for the Lead
1. W1: which row builds "invoice from retainer"? The journey has been waiting on an unnamed row since 22 Nov.
2. Is FO-7s1 (the invoice screens) on a lane? It is now the last screen part R1.56 needs besides W1.
