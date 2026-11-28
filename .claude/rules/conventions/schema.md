---
paths:
  - "ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio/prisma/schema/**"
  - "ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio/prisma/migrations/**"
  - "ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio/api/src/case-prepare.ts"
---
# Builder convention: schema, migrations and case-prepare (LR-152; loaded only when one of these files is read)
From `product/RULES.md`, word for word (the register keeps the rows; this file only brings them to the builder at the right file):

| P-600 | Schema rows run in parallel, each with its own file and migration folder, additive, a later stamp; the Lead reads the migration before the label (P-601). | prose | 14 Nov |
| P-438b | One builder at a time on prisma/schema.prisma and api/src/case-prepare.ts; the Lead names the holder in STATE. | prose | P-612 |

The schema is a folder now (`prisma/schema/<area>.prisma`, DB-SPLIT): a new area gets its own file. A migration is additive (`product/tools/check-migration-additive.sh`) and its folder stamp is later than main's newest.
