Tests: tests/check_csw1_part2b.ts
Tables: runtime_case (unique rules on firm_id), firm_case_counter (primary key workspace_id, firm_id, year)
Entry points: runtime_next_case_number(ws, firm_key, at) resolves the platform firm inside; Runtime.reach, Runtime.list, Runtime.nextCaseNumber and createCase compare firm_id (409 for a firm with no platform account); case-close.ts and case-notes/service.ts find a case by firm_id
