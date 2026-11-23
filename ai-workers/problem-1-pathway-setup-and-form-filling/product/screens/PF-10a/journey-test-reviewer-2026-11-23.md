# PF-10a journey test: reviewer, 23 Nov 2026 (commit 9d717c8ec)

## How I tested
* PF-10a is schema only: there is no screen and no route.
* The "user" is the next builder (PF-10b's engine, PF-10t's targets). I played what a firm's Owner, Admin and Agent will do through those rows.
* Each journey ran as SQL, as `xr_app` inside a firm session (`app.firm_id`), on a scratch database with every migration plus `seedSampleFirms`.
* No browser, axe or screen widths: there is nothing to show. The database is dropped.

## Journeys
| # | Persona and goal | Steps (as data) | Expected | Result |
|---|---|---|---|---|
| 1 | The Owner confirms the firm may move its client list (AG-18-49) | insert an attestation as `xr_app` naming the Owner, with a backdated `at` | written; time is the database's | Held (`at` replaced by `clock_timestamp()`) |
| 2 | An Admin tries to attest for the Owner | attestation naming a Case Officer; a suspended Owner | refused | Held ("only an active Owner…") |
| 3 | An Admin starts an import, dry run, then run | DRAFT batch → rows written for the preview → the run updates row 1 with its record → state COMPLETED, attestation and undo deadline set | each step allowed | Held |
| 4 | The run crashes and resumes | the same `(batch, row 1)` again with `ON CONFLICT DO NOTHING` | one row | Held (`INSERT 0 0`) |
| 5 | The Admin changes the mapping after the dry run | update `mapping` on the batch | allowed (PF-10b refuses the run by hash) | Held; the file, target and importer stay frozen |
| 6 | The Admin undoes within 14 days | COMPLETED → UNDOING → UNDONE | allowed | Held |
| 7 | Two colleagues save the same source's mapping | upsert on `(firm, source, target)` by a second staff member | one mapping, last saver | Held (`saved_at` only if the code sets it) |
| 8 | Wrong firm: firm A's session writes for firm B | attestation or batch with firm B's id; read firm B's batch | refused by the gate first; nothing read | Held (no Owner-check oracle across firms) |
| 9 | Someone tries to erase the attestation | `xr_app` delete; owner-role update, delete, truncate | refused | Held |
| 10 | A failing row's reason carries the email address | `{"field":"email","rule":"jane doe@example.com"}`, an extra `value` key | refused, never an error | Held. A name-shaped value ("JaneDoe") passes: review m4 |

## Break-it pass (15 min)
* **Odd JSON in `reasons`:** `null`, a string, a number, `[null]`, `[[]]`, `[{}]`, duplicate keys, a newline inside a name, an accented letter, 51 items. Each was refused or answered false. None raised an error.
* **Rollback:** rollback.sql in one transaction, then the catalogue matched the database before the migration exactly (6,108 objects, ACLs and schema rights). Re-applying the migration then worked.
* **Concurrency:** the Owner check takes no lock on the grant (review m5). I reasoned this out and did not race it.
* **CI:** `check_prisma_schema` fails on the area rule line (M1), and `module-cards` fails on the backticked prisma path in the fragment (M2).

## Score (adapted to a schema row: each criterion judged for the builder who writes through it)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | All 10 journeys store or refuse as intended |
| Next step obvious | 1 | Each refusal names its rule ("a batch's firm, target, source, file and importer never change"; constraint names `plat_import_row_reasons_shape`, …) |
| Plain words | 1 | Comments and messages in plain words; AG ids beside each rule |
| Feedback and state | ½ | The eight batch states are all present. A row has no marker for "previewed" versus "applied" (review note for PF-10b) |
| Correct data | 1 | Firm-pair keys on every link; frozen facts; insert-only attestation; database time |
| Error recovery | 1 | Resume key; rollback exact and re-runnable |
| Access (stands in for accessibility and screen sizes) | 1 | PF-12 policy and gate on all four tables; the definer function cannot be used to look into another firm |
| Speed | 1 | Indexes for the paginated home and the preview; the reasons check is cheap per row; suite 14 s |
| Consistency (stands in for visual quality) | ½ | Follows the FO-6/FO-9b wall and F4 pattern. Breaks the area-file rule line (M1) and the fragment check (M2) |
| Trust and sources | ½ | Sample marked, AG ids cited. Raw-value exclusion is only partly enforced by the database (m4) |

**8.5/10, no criterion at 0: passes the journey bar.** The open Majors M1 and M2 still block the row on their own.

Fixes that raise the low scores, most valuable first:
1. M1: put the rule line on one line.
2. M2: remove the backticks around the prisma path in the fragment.
3. m4: record that PF-10b builds reasons only from schema identifiers.
4. Write down the dry-run versus applied row rule for PF-10b.

## Not tested
* A real screen reader, or an intended user walking it unaided (D17 and D20 stay with the founder).
* A real RDS cluster beyond `check_pf8b_f4_migrations`.
* The full demo reset on an isolated copy.
