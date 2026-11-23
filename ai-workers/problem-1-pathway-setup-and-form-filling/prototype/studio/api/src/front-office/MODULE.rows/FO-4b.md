Entry points: FO-4b: `GET /api/public/embed/form.js` (the embed script, open read) and `OPTIONS /api/public/forms/:token/submissions` (the send's pre-flight, `sales/embed.ts`); the form's read, send and pre-flight carry CORS headers for its allowed sites only (`sales/public.ts` corsFor).
Tests: tests/check_fo4b_embed_browser.ts
