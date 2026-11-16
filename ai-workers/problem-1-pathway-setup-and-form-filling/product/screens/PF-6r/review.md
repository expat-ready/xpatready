
## Re-review, diff only (P-277): f4cfd1531..cf3d48546
Minor 3 is fixed: `MODULE.md:10` now has "PF-6r: `GET roles` …" as its own entry after PF-4b's list. Minor 5 is fixed: one import line from `../identity/keys.ts`
(`service.ts:9`). There is no change in behaviour, and the PF-6r suite at cf3d48546 gives 17 passed, 0 failed. Minor 2 stays open, which I accept: `en_US.utf8` may be missing
on the CI cluster, and DW1's fail cases do not depend on that test. Minors 1 and 4 are outside this row, as written above.

Verdict: Approve cf3d48546477b0c934e393232cf400c7f91d3d12
