Entry points: `document-preview.tsx` (`DocumentPreview`, CS-D5 part 2) opens from a current file's name on a checklist line; it calls part 1's `POST /api/runtime/documents/:id/preview-link` and fetches the single-use link once into memory (PDF.js to a canvas, no iframe).
Tests: tests/check_csd5_preview_browser.ts (no code marks: check-module-cards.sh copies no tests/ into its fixture tree).
