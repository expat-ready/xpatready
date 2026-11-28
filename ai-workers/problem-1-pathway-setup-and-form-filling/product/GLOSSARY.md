# Glossary: the ID codes and what they mean in plain words

Lab row LR-090 (source SF:A1; written 28 Nov 2026 by the cleanup lane). About 14 ID schemes are in use, and a builder meets 8 of them in one row. This page gives each one a plain name, puts it on one of three levels, and says where its rows live. **Every code shown to a reader carries its plain name** the first time it appears ("PF-22v, saved views", not "PF-22v" alone).

`tools/check-glossary.py` (run by `tools/check-docs.sh`, so in CI) fails when an instruction file (skills, agents, `CLAUDE.md`, `AGENTS.md`, `WAY-OF-WORKING.md`, `RULES.md`) uses a code `XX-n` whose prefix has no row in the table below. A new scheme gets a row here in the same change. Test: `tools/check-glossary.sh`.

## The three levels

1. **Requirement**: what the team or the law asks for. It comes from the team's requirement pack (`domain/requirements-*/`) or an official source, and we never change it.
2. **Capability**: one thing Release 1 must do for a user, numbered `R1.n` (for example R1.57, getting paid). It counts as delivered only when Proven (P-636). Capabilities list the requirements they meet.
3. **Task**: one piece of work toward a capability or toward the factory: a backlog row, a lab row, a bug. Each one is one small PR or a short series of them.

Rulings sit beside the levels: founder decisions (`P-n`), the founder's asks (`A`n) and the rule register's rows explain *why* work is done a certain way, but they are not work themselves.

## Codes with a dash (the check reads this table)

| Prefix | Plain name | Level | Where the rows live |
|---|---|---|---|
| `P-` | Founder decision (P-611b = that decision's 2nd row, not its part (2)) | ruling | `DECISIONS.md` (older rows in `decisions/`) |
| `IDX-` | Index row of the rule register, pointing at decisions kept word for word in a side file | ruling | `RULES.md`, `rules/*.md` |
| `G-` | Goal rows of the rule register (G-847); in "G-4 candidates", the G-4 class of prose-only rules | ruling | `RULES.md`, `rules/prose-only-g4-candidates.md` |
| `F-` | Founder rule dated by day (F-6Nov) | ruling | `RULES.md`, `rules/tech-lead.md` |
| `ENF-` | Enforcer for a decision: the script, hook or CI step that makes a rule bite (ENF-733) | task | `BACKLOG.md`, `RULES.md` "Enforced by" |
| `LR-` | Lab register row (Intended, Built, Proven) | task | `design/lab-register-2026-11-27.md` |
| `OS-` | Operating-system backlog row: the factory's tooling and pipeline (P-828) | task | `design/os-backlog.md` |
| `PF-` | Platform backlog row: firms, staff, sign-in, audit, templates, shared services | task | `BACKLOG.md` |
| `FO-` | Front-office backlog row: leads, consults, retainers, money, the client portal | task | `BACKLOG.md` |
| `CS-` | Case-side backlog row: cases, documents, tasks, notes on a case | task | `BACKLOG.md` |
| `AS-` | Assessment backlog row: eligibility and scoring in the configurator | task | `BACKLOG.md` |
| `AUD-` | Audit backlog row: the insert-only audit trail and its reports | task | `BACKLOG.md` |
| `BK-` | Configurator backlog row from the Bake period (forms, Sample cases) | task | `BACKLOG.md` |
| `TR-` | Traceability tooling row (requirements as data) | task | `BACKLOG.md` |
| `RQ-` | Case-row draft from the requirement read (P-814), shaped by the Lead before it is built | task | `BACKLOG.md` |
| `SEC-` | Security row (alerts, dependencies, gold-class code); SEC-1 is shaped under OS-67 | task | `design/os-backlog.md`, `MVP-CHECKLIST.md` |
| `TK-`, `FD-` | Draft names for task and find rows, held for consolidation: TK-1 to TK-6 to become PF-29a to PF-29f; FD-1, FD-3, FD-2 to become PF-30a, PF-30s, CS-30c | task (history) | `BACKLOG.md` |
| `X-` | A row left out of the first build, kept so it is not lost (P-582) | task (left out) | `BACKLOG.md` |
| `CL-`, `SS-`, `FP-`, `AM-`, `PS-` | Bulk change of a lab lane (clean-up, ship-security, full-power, automation-measures, private-split; the fast-route lane's are FR-A, FR-B, FR-C); `PS-` is also a row of the private-split plan (PS-1b) | task (bundle) | `design/lab-register-2026-11-27.md` › Bulk changes; `design/private-split-plan-2026-11-27.md` |
| `L-` | Lab before-and-after item (L-1 to L-9) | task (source) | `design/lab-before-after-2026-11-27.md` |
| `CK-` | Conformance-check item (CK-1 the conformance check, CK-2 the heartbeat) | task | `tools/check-guards.sh` header, `design/os-backlog.md` |
| `R-` | October backlog row carried over (R-109: re-check an agreed screen before building) | task (history) | `design/backlog-carry-over-2026-10-31.md` |
| `QA-` | qa's bug or finding (QA-526, Major) | task | `qa/BUGS.md` |
| `J-` | Journey test for a capability (J-31; file names use `j_31`) | test | `prototype/studio/tests/journeys/`, the journey-test skill |
| `BR-` | Business rule: in a screen concept, BR-1, BR-2 …; in the team's pack, its numbered business rules | requirement | `screens/<item>/concept.md`; `domain/requirements-*/` |
| `SA-` | Section of the team's solution architecture pack (SA-01B, SA-1B-34, SA-8-27) | requirement | `domain/requirements-*/` |
| `AG-` | The team's agent-side requirement (AG-6-75 = document 6, item 75; AG-03 = document 3) | requirement | `domain/requirements-*/02-functional-requirements/agent/` |
| `NFR` | The team's non-functional requirement (NFR5-14) | requirement | `domain/requirements-*/` |
| `UXL-` | The 14 UX checks (UXL-01 to UXL-14) | requirement (our bar) | `EXPERIENCE.md` §7 |
| `BIC-` | Best-in-class practice we hold screens to (BIC-01, ask once) | requirement (our bar) | `EXPERIENCE.md` |
| `AT-`, `SI-`, `FQ-` | Numbered items in older requirement and question lists (attachments, stand-ins, fee questions) | requirement (history) | the row that cites them |
| `IMM-` | An IRCC form number (an official form, not one of our codes) | outside | canada.ca |
| `SOR-` | A Canadian regulation number (SOR/2022-128) | outside | laws-lois.justice.gc.ca |

## Codes without a dash (not read by the check)

| Code | Plain name |
|---|---|
| `R1.n` | Release 1 capability n (110 of them, P-842) |
| `A`n (A453) | The founder's ask, numbered as the Lead received it |
| `B`n (B193) | Older backlog row (before the PF, FO and OS schemes) |
| `M2`, `M3`, `M4` | Milestones (M3 done 29/29, 10 Nov) |
| `C`n.n (C6.9) | An M3 configurator capability (case check), in `qa/CAPABILITIES.md` |
| `D1`-`D20` | The screen review's quality dimensions (screen-review skill) |
| `E`n | A numbered step inside one plan or brief; read it where it is cited |
| `#n` | A pull request on GitHub |
| `CU:`, `FP #`, `SF:`, `ME` | Source rows of the lab register: clean-up plan, full-power plan, software-factory review, measures |

## Not codes

`UTF-8`, `SHA-256`, `ISO-8601`, `COVID-19` and the other standard names listed in backticks in this section (the check reads them here and skips their prefixes; add one here, never to the table above), dates such as `2026-11-28`, and words inside a path or file name (`RULES-2026-11-28-…`) are not ID codes; the check skips anything joined to the word or path before it.

The check also skips: a code right after another dash (the second P in `P-854-P-859`), and prefixes longer than six characters. It misses those, never flags them wrongly.
