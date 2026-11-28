---
paths:
  - "ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio/engine/**"
---
# Builder convention: engine code (LR-152; loaded only when a file under studio/engine/ is read)
From `product/RULES.md`, word for word (the register keeps the row; this file only brings it to the builder at the right file):

| P-319 | No combination key, form number or program-specific branch in engine code (P-425). | prose (slice guards retired 8 Nov) | P-612 |

A combination key, form number or program name belongs in configuration or sample data, never in an `if` in `engine/`. `product/tools/check-engine-hardcode.sh` catches some of it; the rule is wider than the check.
