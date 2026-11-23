Tables: PF-10a: `plat_import_batch`, `plat_import_row`, `plat_import_mapping`, `plat_import_attestation` (`prisma/schema/platform-import.prisma`; migration `20261124050000_pf10a_import_tables`): firm-scoped, PF-12 walls; reasons are {field, rule} names only; attestations insert-only, Owner only. The engine that writes them is PF-10b.
Tests: tests/check_pf10a_import_schema.ts
