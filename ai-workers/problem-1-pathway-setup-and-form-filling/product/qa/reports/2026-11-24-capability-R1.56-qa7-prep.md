# R1.56, qa 7 (cloud, 24 Nov): a run ahead of #3305 (FO-7s1 part 1), no verdict

j_56 as on main, on #3305's head 86e04deeb (isolated copy :4473, PLATFORM_IDENTITY=local, live AI off, US$0): **15/18 twice, exit 1, the same three FAILs.**
* W1: the draft refuses `retainerId` (422 "Unrecognized key"): invoice from a signed retainer, part missing (no row named yet).
* W9 "Money › Invoices lists the issued invoice with its number and its tax": the screen now lists INV-0001 (Bill to, Issued, Due, Total CAD 1,865.00, Open), but the list has no tax column, so `/\bHST\b/` on the list page fails. The tax is on the invoice detail #3305 adds. **Journey drift, not a fault:** after #3305 merges, qa aligns W9 to open the invoice from the list and read its HST line (and drops the stale "FO-7q" in its label, which is on main).
* W9 next step (R1.57): no card payment link, FO-7c missing.

So after #3305 merges R1.56 stays Partial, parts missing: invoice from retainer (W1), FO-7c (W9's next step), no verdict (P-606).
