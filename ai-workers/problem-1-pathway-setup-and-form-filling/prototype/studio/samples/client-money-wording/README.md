# Client money wording (FO-7b part 1b)

Sample wording for the invoice, the payment receipt and the credit note, as the PDF and the email body print them
(`api/src/client-money/invoices/documents.ts`). English only in Release 1. Every line here is **Sample**: no firm, no
accountant and no counsel has read it (Unconfirmed: no accountant; Unconfirmed: no counsel). The content follows AG-6-63
rule 4 (receipt), AG-6-71 rule 1 (the operating details on an invoice) and AG-6-48 (credit note).

A `{{name}}` is filled from the stored rows; an unknown name stops the render. A line starting with `#` is a note and is
not printed. Figures are the stored ones: nothing here is recomputed (AG-6-4a).
