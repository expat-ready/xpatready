Entry points: FO-5cr: `POST prospects/:id/retainers` takes an optional `consultRecordId` (read through ConsultRecordPort, `booking/consult/port.ts`): the first fee row is filled in from the record's recommended items and CAD quoted fee (`retainers/service.ts` `feesFromConsult`)
Tables: foConsultRecord (read through the port)
Tests: tests/check_fo5cr_consult_prefill.ts
