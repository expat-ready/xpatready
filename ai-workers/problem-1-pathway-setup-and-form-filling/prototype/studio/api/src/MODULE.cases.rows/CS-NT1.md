Entry points: behind PF-4's guard, `GET|POST cases/:id/notes`, `GET cases/:id/notes/:noteKey/versions`, `PUT cases/:id/notes/:noteKey/text|pin|visibility` (`case-notes/service.ts` `CaseNotes`; keys `agent/case:show`, `agent/case:edit`, and `agent/note:share-with-client` to show a note to the client); the client's `GET cases/:id` carries its CLIENT_VISIBLE notes (`clientNotesOf`, CS-NT1 part 1).
Tables: caseNote (area file `case-notes.prisma`, CS-NT1 part 1).
Tests: tests/check_csnt1_notes.ts.
