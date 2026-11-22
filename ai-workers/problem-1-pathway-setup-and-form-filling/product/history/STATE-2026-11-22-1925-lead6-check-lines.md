# Lead 6 check lines, 22 Nov 19:1x-19:2x IST (moved word for word from STATE.md for size)

**Lead 6, 19:1x IST:** AWS report 19:11 (973f6adb3, Step 9): staging on main 93237d8d2, 2 tasks; R1.13 Pass, R1.15 Pass, R1.5 AWS half Pass, R1.24 Partial (no firm). Told it: seed the Sample firms (`seed-sample-firms.ts` then `firm-seed.ts`; stop if the script refuses its environment), prove `sample-firm.<suffix>` 200 plus an unknown name 404, then scale to 0; reserved names (admin etc.) serving the platform app is by design (`web-address/rules.ts:12-16`, PF-25). Owed fix row: no Strict-Transport-Security header (Minor). xr_app password reset from its secret by the AWS session.

**Lead 6 check 19:13-19:4x IST:** #3068 PF-8b F7 Lead read OK, labelled (pure merge of main; migrations lane). #2938 FO-7c: Lead read OK, round 9 allowed for a re-stamp to 20261122060000 (clashed with #3068's stamp); lane re-stamped, labelled. #2922 queued (batch #3096, ETA 20:15 IST); ruled walk j_104 does not hold the part. #3082 records: P-806 tied to PF-29f, body lines added, Approve on 237a0aa95. #3037 and #3003 dequeued (shard fails + module card not updated): lanes told. Main green at 5dd56f9e7. R1 rows at Works on main: 46 (grep of CAPABILITIES).


**Lead 6, 19:3x:** R1.24 blocked: Sample seed refused on RDS (42501, row security; AWS report 58cd0f40d). Row PF-8b-f8 (RDS-safe seed) typed into the PF-8b builder lane; staging told to scale to 0 until it merges.

**Lead 6, 19:5x:** no merge since 18:53. Base batch #3093 (#2955 PF-F1 alone on main 5dd56f9) failed shard (15) `check_fo8_prospect_won` DW4 (client number given back, 'CL-00013' twice) and shard (21) `check_pf30s_find_box_browser` TimeoutError, both retried; #2955 touches neither (S3 adapter only). When Mergify dequeues it: post 'Batch failures covered' and relabel (playbook 1); FO-8 DW4 is a suspected main-level fault, owed a qa bug row. #3068 labelled but not queued: re-ran review-rounds, `@mergifyio refresh` 19:4x.
