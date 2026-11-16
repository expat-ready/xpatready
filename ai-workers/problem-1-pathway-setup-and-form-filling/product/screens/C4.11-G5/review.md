# Review: PR #1988, C4.11-G5 flake fix (pack 2 setup order)

Independent reviewer (P-303). Commit reviewed: `9f2d34cdfa073eee8df8de5d397c9f9e155530b8` (branch `claude/amazing-shannon-s683zc`).
Scope: one file, `prototype/studio/acceptance/lib/pack2.ts` (`questionsBySteps`, the B74 apply loop, lines 116-123), +7/-2.
This is test setup, not a screen. The screen-review parts that need a screen (concept fit, D1-D20, BIC table, keyboard and zoom)
and the journey test do not apply. **Journey score: N/A** (no screen, no person's journey; nothing a person sees changes).

## What I checked and how
- Read the diff, `api/src/ai.ts` (plan 89-195, launch 296-345, pump/step 395-413), `api/src/demo.ts` 376-384 (Reset to the six,
  one catalogue batch), `api/src/features/checkpoint/040-field-map-review.ts` 56-92 (`reviewOrder`), and the Prisma schema
  (`prisma/schema/proposals.prisma` 8-68) plus migration `20261021070000_ai_batches` (`plan JSONB NOT NULL`).
- Started my own copy (`isolated.sh rvw 4795`, live AI off, US$0, stopped afterwards) and ran `acceptance/C4.11.test.ts` once
  at this commit: **exit 0, `C4.11-G5 pass … {"ready":6,"nobody":0}`**; setup `{"accepted":191,"applied":8,"approved":185,"placed":154,"refused":[]}`.
- Ran psql on that copy, after the run.

## Answers to the five questions
1. **The SQL is correct in PostgreSQL.** `plan` is JSONB, so `jsonb_array_elements(b.plan->'targets') with ordinality t(v, o)`
   is valid. `t.v->>'attachmentId' = a.id::text` compares text with text (uuid cast). With the left join, a job with no
   batch gives `jsonb_array_elements(NULL)`, which returns no rows, so `min` is NULL and `nulls last` puts it last. On the
   copy, all 37 targets of the copy's batches carry `attachmentId` (the camel-case key `ai.ts:122` writes, `base.attachmentId`),
   with no repeats, so `min(t.o)` takes the target's only position. That matches `reviewOrder`'s first-index map. The query
   ran in the real setup (`applied: 8` = the 8 completed map jobs).
2. **The reasoning holds, and the copy showed the race.** `ai.ts:411` sets `startedAt: new Date()` when a job is claimed.
   `MAX_PARALLEL = 2` (`ai.ts:46`) runs targets 1 and 2 at the same time. `ai_batch.started_at` is set once at creation
   (`ai.ts:325`; it is never updated). The plan is saved in the batch at launch, ordered by combination, then by attachment
   `createdAt asc` (`ai.ts:89`). On my copy, Visitor visa's attachments were created about 0.5 s apart, so the order is stable.
   On my run, **`imm5257_1e.pdf` started at 08:20:14.476, before `imm5257e.pdf` at .479**. The old
   `order by j.started_at, a.file_name desc` would have applied the Schedule first. The new order applied IMM 5257 first
   (plan position 1, then 2 to 7, then the B71 IRM 0002 batch at 08:20:21). G5 passed, the library held `person.uci` and no
   `person.uci_number`, and the counts were the PR's "normal" 185 approved and 154 placed. This is direct evidence that the
   fix works in the very case that failed. I did not re-create the failing branch myself: the
   checksum and saved-run fallback (steps 3 and 4 of the PR body) are the builder's evidence. My numbers are consistent with it.
3. **The other packs keep their order, apart from the race.** Every `field_map` job is made in `ai.ts:328` (launch) or
   `ai.ts:541` (retry in the same batch). Neither path leaves a job without a batch on the six, and a FAILED job that was
   retried is filtered out by `status='COMPLETED'`. Between batches, the order is the batch start time.
   `questionsBySteps` launches the B71 replay only after the Reset batch has settled, so it still comes last, as before.
   None of the callers launch other map batches before setup: C3.6, C3.16, C4.1, C4.2, C4.5, C4.7, C4.8, C4.11, C4.11-spread,
   and `tests/*` (grepped for `/ai/batches` and `/attachments/:id/draft`). Within a batch, the plan order is also the queue
   order, so the new order is the order most runs already got; only the swapped runs change. Jobs without a batch (older
   fixtures) sort by `coalesce(j.started_at)` and then `file_name desc`, which is the old order unchanged.
4. **The assertion is untouched and no retry was added.** `C4.11.test.ts:112` is unchanged. The only retry in the loop is
   the earlier 503 re-press (`pack2.ts:127`), which was there before.
5. **Rules.** No personal names. 7 lines, far under 800. The comment gives the why with numbers (B74, C4.11-G5, P-641), with
   no status, dates or sessions. Title and body follow "Every PR" (what and why, evidence, "On the demo", cost US$0, Questions).

## Findings
- **Minor**, `pack2.ts:116-117`: the B74 sentence kept above the new text still says the maps take a fixed order
  "a form before its schedule, by file name". File name is now only a tie-break after the plan position, so the two
  sentences read as if they disagree. Fix: say "in the batch plan's order (file name only breaks ties)", or fold it into the
  C4.11-G5 sentence.
- **Minor (PR body, not code):** "Done when: passes 20 runs in a row … under parallel load" is still unticked, with
  "(20-run lines added when the loop finishes)". My one run is green in the race case. The builder should add the 20-run
  lines before merge, as the body itself promises.
- **Note**, `pack2.ts:120-123`: the comment says the order follows `reviewOrder`. That is true for batched jobs, which is
  every job here. Three points differ but do not affect these packs:
  - Jobs without a batch: `reviewOrder` puts them last, while this query places them by their own start time.
  - The file-name tie-break: ascending in `reviewOrder` (`040-field-map-review.ts:75`), descending here.
  - BK-16 later sources: wave1 only, so the six's per-combination setup never meets them.
  No change needed. If the two orders ever have to match exactly, a shared helper would stop them drifting apart.
- **Note:** P-641 is not yet in `DECISIONS.md` on `origin/main` (highest there: P-637). Other open PRs cite it as the tech
  lead's fix-row ruling (#1989). That is for the tech lead's records, not this PR.

No Blocker, no Major.

## Could not check
- I did not run 20 times in a row under parallel load. I did not deliberately reproduce the failing order to see `ready:0`.
  Both are the builder's evidence (PR body).

Verdict: Approve 9f2d34cdfa073eee8df8de5d397c9f9e155530b8

## Re-review: diff 9f2d34cd..a7728b469 only (P-277)
- `pack2.ts:116-122`: only comments changed. No line other than a comment changed, and the SQL order line is byte-identical.
  The new text says the order is by batch, then the batch's plan, with the file name only a tie-break, and that a job
  with no batch goes by its start. That matches the query and closes Minor 1 and the Note on jobs with no batch. The
  comment still gives the why with its numbers (B74, C4.11-G5, P-641) and no status, dates or names.
- `screens/C4.11-G5/review.md`: committed byte-identical to the review written above.
- Still open from above, in the PR body and not in the code: the "20 runs in a row" Done-when lines (Minor 2). It does not block.

No new findings. No Blocker, no Major.

Verdict: Approve a7728b4692087364427ab96f0bf3505132ed2574
