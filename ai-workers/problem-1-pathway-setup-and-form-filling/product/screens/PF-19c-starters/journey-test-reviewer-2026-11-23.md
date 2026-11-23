# Journey test: PF-19c part 2 platform starters (reviewer, 23 Nov 2026)

Head `c80fe79b146ce30bdbf2b48789376ebb6f9585e2`. This is a data-only item with no screen: no browser walk, axe or width checks apply. The journeys go through the starters' consumer (the send path, with the local email adapter on a fake clock) and the deploy, on scratch databases only (never :4400).

## Journeys
| # | Persona and goal | Steps | Expected | Result |
|---|---|---|---|---|
| 1 | Firm staff, firm never touched templates: "acknowledge a new lead" | send `lead.acknowledgement` for firm A with the lead's values | filled email, platform version, subject "Thank you for contacting Maple Immigration" | Held (check_pf19c line 5) |
| 2 | Same: follow-up and going-cold | send both | filled, no `{{` left | Held (line 5) |
| 3 | Firm edits its follow-up | firm A publishes its own version 1, sends | firm's version used | Held (line 7, `r2`) |
| 4 | Other firm unaffected | firm B sends follow-up after A edited | platform's version | Held (line 7, `r3`) |
| 5 | Error: missing value | send without `firm_name`/`owner_name` | refused, naming the field, nothing sent | Held (line 6) |
| 6 | Recovery: migration runs twice | apply the file again | no second template or version | Held (line 2) |
| 7 | Operator deploys on a runner that is neither superuser nor BYPASSRLS (RDS admin owns the tables) | apply migration as a NOBYPASSRLS owner | starters seeded | **Failed**: `new row violates row-level security policy for table "msg_template"`. F7 suite: 1 failed |

## Data underneath
Three PLATFORM rows (EMAIL, `en`), version 1 each, `published_by = seed:sa05-a1`. Subject and body are byte-identical to `registry.ts` on #3179. Nothing else changed: PF-19a's check reads `0|6`.

## Break it
Rerun (held). Write-once update and delete of a platform version (refused). A firm template on the same key (wins only for that firm). Non-bypass runner (failed, journey 7).

## Score
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | ½ | journeys 1-6 pass; journey 7 fails |
| Next step obvious | N/A | no screen |
| Plain words | 1 | the starters' wording, matching the registry exactly |
| Feedback and state | 1 | the refusal names the missing field |
| Correct data | 1 | rows, versions and bytes as expected |
| Error recovery | 0 | a refused migration leaves Prisma's record failed, and later deploys wait for a manual resolve |
| Accessibility and screen sizes | N/A | no screen |
| Speed | 1 | the suite runs in seconds |
| Visual quality | N/A | no screen |
| Trust and sources | 1 | marked Sample (P-170) in the migration; ruling cited |

There are 6 applicable criteria, totalling 4.5 of 6, which scales to **7.5 / 10**. **Fail** (below 8, and one criterion at 0). Fixing PF-8b F7's lift wrapper (review B1) raises "task completed" and "error recovery" to 1, giving 10/10.

Could not test: a real RDS instance (a local non-bypass owner stands in), a screen reader, or an intended user (none apply here).
