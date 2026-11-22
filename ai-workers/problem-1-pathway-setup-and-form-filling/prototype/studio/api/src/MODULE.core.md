---
paths:
  - "ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio/api/src/{main,features,core,studio,busy,refusal,health,health-verdict,firms,canada}.ts"
---
# Module card: api-core (P-615)
The API's start-up, shared providers and the configuration service. Read this before editing these files; update it in the same PR when an entry point, invariant, table or test below changes (or say `Card unchanged: <reason>` in the PR body).

**Purpose.** `main.ts` builds the Nest app (body limit, session, combination read) and adds `features/*.ts`; `core.ts` holds the shared providers (`Db`, paths, simulated people and duties, demo workspace, audit, versioned edits); `studio.ts` is the Product Studio service (programs, combinations, library edits, preview, validation, review, release); `canada.ts` is the one canada.ca port; `refusal.ts` the release gates' shared refusal.
**Owner area.** Shared by every lane (Unconfirmed: no lane map in code).
**Entry points.** `GET /api/health`, `GET /api/session`, `PATCH /api/session/preferences`, `GET /api/combinations/:id`; providers `Db`, `Audit`, `Workspace`, `Studio`; `registerFeatures`/`featureSteps` (features.ts); `LiveCanada`/`FixtureCanada`.

**Invariants (set by).**
- A new controller or service registers in `features/<name>.ts`, never in `main.ts`'s list (P-214, P-376, B120).
- canada.ca is read only through `canada.ts`; tests, CI and copies replay the recorded fixtures (`STUDIO_CANADA` unset).
- Sample content passes only in the demo workspace and is a "Demo release", never a real publish (P-240).
- A gate refusal carries every blocking problem in `errors[]`, never only the first (G1/G2 BR-8, `refusal.ts`).
- Field formats come from the form and are enforced here (P-162); a list row's source is never blank (P-158).
- Who fills a placement, and whether a question is a background answer, change only through a second person (P-97, B154).
- Family information forms are the library's form roles, never a list in code (P-319).
- A JSON body over 5 MB is refused in words before any route (P-179).
- Busy errors (40P01, 55P03, P2034) mean nothing was written; try again (`busy.ts`).
- `Db` connects as `xr_app`, which owns no table, through PF-12's walled pool: each query runs as its caller's firm (`platform/firm-scope.ts`), and Prisma's same-tick merge of `findUnique` calls is off outside a transaction (`oneQueryPerCaller`) (PF-12).
- A case's platform firm id comes from the database's one lookup (`firms.ts` `firmIdByKey`, `firmIdOfActor`); at start, right after the Sample seed, the cases still without one are filled (`fillCaseFirmIdsOnStart`, time-bounded, never stops the start) (CS-W1).
- `Audit.log` keeps its signature and writes through AuditPort as a `CaseEntry` (its workspace; a case or configuration entity, never an area one; its case's own firm, else the request's or job's (R1.8, QA-595: a line for another firm's case, or naming another firm, is refused), and the request's or job's correlation; the case id only for a case entity whose key or words name exactly one case of the workspace, never from a configuration line's words); `system` and `rules` are stored as `system:studio` and `system:rules`, read back by `actorWordOf` (AUD-1m).
- `ConfigReadGuard` leaves `/api/platform/*`, `/api/front-office/*` and `/api/runtime/*` routes that declare `@PermissionKeys` (exact case) to PF-4's guard; any other Bearer is 403 link-only (Lead 58, #1818).

**Tables.** combination, programDef, canonicalField, configRelease, reviewSubmission, sectionQuestion, documentRequirement, predicate, auditEvent, combinationForm, formFieldMap.
**Tests.** `tests/check_features_registry.ts`, `tests/check_pf0p_ports.ts`, `tests/check_f8_empty_release.ts`, `tests/check_bk4a.ts`, `tests/check_csw1_firm_id.ts`.
**Row lists (P-712).** Never hand-edit this card's frozen `Tests.`, `Tables.` or `Entry points.` line: put your row's items in `MODULE.core.rows/<ROW>.md` next to it (one file per row; `module-cards.py` fails the PR otherwise).

**Do not.**
- Add a provider to `main.ts`'s `@Module` list for a new feature.
- Call canada.ca, a model or the network outside the ports.
- Name a combination or form number in code (P-319).
- Return only the first problem of a gate.
