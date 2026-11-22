Entry points: PF-30a: `find.ts` `FrontOfficeFinder`, registered on the find door as `front-office`: people with a lead or prospect (email, phone in E.164 with the firm's country, name prefix or FO-9a's similar name), prospects by number (exact, then prefix) and companies by name, each named only by the lists' own rules (`sees`, the prospects' own-or-all, `seesCompany`); Lost, Won and Closed labelled; reads only.
Tables: foPerson, foLead, foProspect, foCompany, platformFirm
Tests: tests/check_fd1_find.ts
