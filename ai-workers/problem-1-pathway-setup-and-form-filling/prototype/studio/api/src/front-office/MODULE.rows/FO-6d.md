Entry points: FO-6d `/api/front-office`: `POST signature-requests` (multipart `file`, title, prospectId, signerPersonIds, optional firmSignerStaffId; key agent/portal:request-work), `GET signature-requests?prospectId=`, `GET signature-requests/:id`, `GET prospects/:id/signers`, `POST signature-requests/:id/download-link` and `GET signing-files/:token` (key agent/document:show).
Tables: foSigningDocument, foSignatureRequest, foSigner.
Tests: `tests/check_fo6d_any_document.ts`.
