# qa after-merge — wave 1, night batch 18 Nov (qa-4: front-office and case rows)

**Split (agreed with qa `local_bb3bf1ad`, Lead 81's list):** qa-4 takes #2140 FO-2 part 3, #2138 FO-1p, #2011 FO-13i, #2000 CS-DL1 part 1, #2125 CS-W1; the other qa session takes the platform rows. Opus 5.5; live AI off; US$0; never :4400.

## Merged so far
| PR | Row | Evidence | Verdict |
|---|---|---|---|
| #2138 FO-1p (main b403d310d, 17:39 UTC) | none of its own (enabler for CS-K1 part 2; P-703 product rows only) | ci 44346271784 green (merge batch of #2138; tree 656c7fdc2 = main b403d310d's): kind, types, 8 shards, 5 regression jobs; independent re-run `check_fo1p_person_port.ts` 35/35 twice on main's studio tree (scratch database dropped at the end; no copy started) | Enabler line in CAPABILITIES; `qa/built/FO-1p.md` deleted |

## Still waiting (no verdict yet)
#2140 FO-2 part 3 and #2011 FO-13i (dequeued at ~23:3x IST), #2000 CS-DL1 part 1 (queued), #2125 CS-W1 (approved, not queued).

## Notes for the Lead
* This copy cannot merge main any more: main changed `.claude/skills/qa/SKILL.md` (P-700 line), which the sandbox keeps read-only. Records go on fresh branches built from `origin/main` without a checkout.
* Local re-runs here need the project's Node 24.21.0 (`.tools/node-v24.21.0`), an npm and Prisma cache under the temp folder, and `node --import tsx` (the tsx CLI's pipe is refused by the sandbox).
