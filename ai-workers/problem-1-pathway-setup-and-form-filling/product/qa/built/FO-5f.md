FO-5f (#1791; API only, no schema change): retainer hardening.
* An edit that ends a sent signing request writes `retainer.request_ended`.
* Edit and Withdraw refuse a page that shows an old status or version (409 CHANGED, in plain words).
* Signed offline can name the earlier version the paper was signed on (`signedVersion`): that version is copied forward and filed as signed, and the newer versions show "Not signed".
* Template uploads refuse, with a plain reason:
  * placeholders in equations, drawings or SmartArt;
  * more than 2000 placeholders;
  * files that lie about their size ("This file is damaged or is not a Word file");
  * names that grow past 120 characters.
* The glossary is ignored.
* The "missing" list follows the template version the agreement was made from.
* Refused downloads say "No such file".
* A file over an upload's hard limit gets "This file is too large for this upload."
* The signed paper always downloads as an attachment with nosniff.
