Entry points: `case-document-reads.ts` (CS-D6 part 1: `CaseDocumentReadsController` and its service `CaseDocumentReads`, a document's Read by list and file check, behind PF-4's guard).
Tests: tests/check_csd6_reads_keep.ts
Entry points: `case-keep-period.ts` (CS-D6 part 2: `CaseKeepPeriodController`, the keep list behind PF-4's guard, and `KeepPeriodJobs`, which registers the weekly keep-period reminder once NotificationPort is bound).
