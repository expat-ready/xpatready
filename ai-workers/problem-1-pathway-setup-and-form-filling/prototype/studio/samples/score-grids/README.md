# Score grid files (AS-1g, R1.106)

A score grid (Express Entry's FSW selection factors, CRS, a provincial stream) enters the library as **one JSON file**,
imported through the configurator's guarded change: the author proposes it, a second person approves it on To review,
and each combination it names carries it in its next release (`snapshot.score_grids`). There is no authoring screen
(AG-03: pack authoring UI is Phase 2). Values for experts to set come from official pages only (AGENTS rule 4): each row
carries its `source_ref`, or the label `"Sample"`. A file whose rows are neither is refused whole; nothing is written.

```
POST /api/library/score-grids   { "grid": <the file>, "reason": "why, 3 to 300 characters" }   (author duty)
POST /api/library/changes/<id>/approve                                                        (a second person)
GET  /api/library/score-grids                                                                 (the grids now in the library)
```

## The file

| Field | Meaning |
|---|---|
| `key` | the grid's key, lower case with dots (`express_entry.crs`); a new file with the same key replaces the grid at approval |
| `label` | its name in words |
| `selection_model` | `FIXED_PASS_MARK` (a pass mark; FSW) or `DRAW_RANKING` (a ranking total only, no band; CRS, P-236) |
| `pass_mark` | a whole number for `FIXED_PASS_MARK`, `null` for `DRAW_RANKING`; never above `maximum` |
| `maximum` | the grid's highest total |
| `combinations` | the combination keys whose release carries the grid |
| `source_ref` | `{ "url", "section", "quote", "date": "YYYY-MM-DD" }`, or `"Sample"` |
| `factors[]` | `{ key, role: PRINCIPAL or SPOUSE, facts: [fact keys read], maximum, source_ref, bands[] }` |
| `factors[].bands[]` | `{ when: <condition>, points, source_ref }`; `points` never above the factor's `maximum` |
| `language_conversion[]` | `{ test (e.g. IELTS_GENERAL), skill: READING, WRITING, LISTENING or SPEAKING, score_min, score_max, clb (1-12), source_ref }` (AG-3-18) |

**A band's condition** uses the configurator's condition language (`contracts/rules.ts`) on the factor's own facts:
`{ "op": "eq", "field", "value" }`, `{ "op": "in", "field", "value": [...] }`, a comparison (`gt`, `gte`, `lt`, `lte`)
with a number, or `{ "op": "and", "args": [...] }` of those (a range: `gte` 18 and `lt` 36). Two bands of one factor that
one answer could both match are refused (one answer, two point values), and so are two language rows of one test and
skill whose score ranges meet.

## Example (Sample values, not IRCC's)

```json
{
  "key": "sample.grid", "label": "Sample grid", "selection_model": "FIXED_PASS_MARK", "pass_mark": 6, "maximum": 10,
  "combinations": ["wp.family"], "source_ref": "Sample",
  "factors": [{ "key": "age", "role": "PRINCIPAL", "facts": ["person.age"], "maximum": 10, "source_ref": "Sample",
    "bands": [
      { "when": { "op": "and", "args": [{ "op": "gte", "field": "person.age", "value": 18 }, { "op": "lt", "field": "person.age", "value": 36 }] }, "points": 10, "source_ref": "Sample" },
      { "when": { "op": "gte", "field": "person.age", "value": 36 }, "points": 5, "source_ref": "Sample" }
    ] }],
  "language_conversion": [{ "test": "SAMPLE_TEST", "skill": "READING", "score_min": 0, "score_max": 4.5, "clb": 4, "source_ref": "Sample" }]
}
```
