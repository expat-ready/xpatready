Entry points: PF-19s: `LeadTemplateRecords` (`sales/template-records.ts`), the TemplateRecords adapter: the leads a person may preview a template with (`find`, `leadsSeenWhere`) and one lead's fill-in values (`values`; the lead read's own-or-all rule, an inactive owner's lead counts as unassigned; else the one not-found).
Tests: tests/check_pf19s_templates_browser.ts
