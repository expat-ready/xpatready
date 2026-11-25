J-6 part 2 (R1.6, rows rev 16.54): `tests/journeys/j_6.ts` now walks row 6's role steps by screens on a running copy. The walk (W1), in a visible browser and as a scripted check:

* The Owner opens Team, then Compare roles. Each role's money permissions and licence actions show in their own groups, counted as `GET /api/platform/roles` counts them.
* The Owner invites a Billing and finance person. "This gives <email> 12 money permissions." shows before Send.
* The invitee accepts on the Accept invitation page and is signed in.
* PF-6m's money-keys line is read back from the audit: written by the Owner, Billing and finance, 12 keys (DW1). A Read only accept writes no money line.
* The new person opening `/platform/team` sees the server's refusal, the API answers 403, and their menu has no Team entry.
* FO-2v's rule shows on Leads: with "everyone sees all" off the Owner sees only their own leads; with it on, every lead (DW2).
* A Case Officer with "own" sees only their own leads.
* The walk ends on My account (row 5).

DW1 and DW2 fail when the product part is broken (the reviewer's mutation run: 52/62). Seats are lent for the walk and given back in a `finally`. Results: 63/63 on a fresh copy, and 63/63 again on the same kept copy in a visible browser.
