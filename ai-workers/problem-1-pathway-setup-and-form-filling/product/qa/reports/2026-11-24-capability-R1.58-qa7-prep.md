# R1.58, qa 7 (cloud, 24 Nov): a run ahead of #3442 (FO-7t part 2, Pay from trust and refund), no verdict

#3442's head 2b950dec5 does not hold #3440 (j_58 aligned to #3033), so its own j_58 is the older one: **8/22 twice** with it. That is not a regression; the file is stale.

**main's j_58 (after #3440) on #3442's head:** isolated copy :4474, PLATFORM_IDENTITY=local, live AI off, US$0. **14/22 twice, exit 1** (main: 11/22). Newly passing: W2's two refusals (Pay from trust of 1,000.01 with 1,000.00 held; a refund over the balance, both in words, nothing written) and W4's Pay from trust of 300.00 (one withdrawal to the invoice, the balance falls by 300.00).

The 8 FAILs:
* **W3, the deliberate pick (names FO-7t part 2): journey drift.** j_58 sends `otherFundsPick`; #3442's `ApplyIn` names it `pick` (`{ caseId?, personId?, companyId?, reason }`). With the key renamed (one run), the step answers 404 "No such invoice in your firm.", because the step's invoice is issued on a made-up case id (`CASE2 = randomUUID()`, money moved by SQL). After #3442 merges, qa aligns W3 (the key, and a real case for the invoice) before scoring.
* W3: the move-to-case route (no row). W4: To move list, batch refusal, "I moved these" (FO-7t part 3). W5: reversal (FO-7v), shortfall read (no row), Money › Trust screen (FO-7s3b).

So after #3442 merges R1.58 stays Partial, parts missing: FO-7t part 3, the move-to-case route, FO-7v, the shortfall read, FO-7s3b, no verdict (P-606).
