# CS-V1 part 2 review: PR #2042 at 52e39187

Reviewer (fresh context, did not build it). Status: in progress, break-it pass running.

## Established so far
* `check_csv1_inputs.ts 4494 xr_studio_rev_csv1b` on my copy: 61 passed, 0 failed, exit 0.
* `check_csc1_close.ts` (in-process): 55 passed, 0 failed.
* Case-close words: differential test, CS-C1a's hand checks copied verbatim from origin/main against the new schemas plus `parsed()`, 167,128 bodies: 0 differ. The only differences are the declared ones: unknown fields, the decide order change, and a filingId over 200 characters (404 before, 400 now).
* Web callers (readiness.tsx, add-form.tsx, documents-drawer.tsx, forms.tsx, eligibility.tsx) and finished-story.ts send only fields the schemas accept.

## Open findings (draft)
* Over-long values answer in zod's default English: `?original=` over 10 characters and `signature` over 40.
* `?original=` refusals name the field `body`, not `original`.

Verdict: Changes requested
