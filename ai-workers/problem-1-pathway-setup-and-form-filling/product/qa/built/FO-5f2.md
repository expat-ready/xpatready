FO-5f2 (#1809; API only, no schema change): a firm's Word template can never take down the API.
* Template uploads, and every render, now refuse:
  * a file with parts a Word template does not have, or a Word part named outside its standard place ("This Word file has parts a template cannot have.");
  * a `[Content_Types].xml` or `.rels` over 256 KB, before it is read ("This Word file is too complex to use as a template.").
* Every compile, render and placeholder read runs in one worker with a 256 MB memory limit and a 5 s time limit (Sample). A file that exhausts it is refused with "too complex", the worker restarts, and other pages and firms keep answering.
* Placeholders come from the library's own parse, so an unknown one in a property, a header title, settings, CDATA, a cover page, or after a delimiter change (`{=<< >>=}`) is refused by name, never printed blank.
* Real Word and LibreOffice templates with headers, footers and images are accepted and render exactly as before.
