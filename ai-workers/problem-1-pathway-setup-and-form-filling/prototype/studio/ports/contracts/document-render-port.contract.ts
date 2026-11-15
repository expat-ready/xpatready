// PF-0c: DocumentRenderPort's contract (ports/render.ts). Run by fakeRender and by DocxRender
// (api/src/front-office/retainers/docx.ts). The port file's sentences: a template key and plain data in, a document's
// bytes out; an unknown template, or data the template cannot take, throws. What callers rely on (FO-5's starter): the
// same template and data give the same document, whatever the order of the data's keys, and other data a different
// one. "The same document" is the document's text as the adapter's own reader gives it, not its bytes: DocxRender's
// .docx is a zip whose entry times are the render time, so two renders a second apart differ in bytes (PR Questions).
import { defineContract, expect, expectRefused } from "./contract.ts";
import type { DocumentRenderPort, RenderData } from "../render.ts";

/** What a render adapter's test hands the contract. */
export type RenderHarness = {
  render: DocumentRenderPort;
  /** A template the adapter knows, and data it takes; `other` is different data it also takes. */
  template: string;
  data: RenderData;
  other: RenderData;
  /** The same data with its object keys in another order. */
  reordered: RenderData;
  /** The document's text, read back from its bytes (fake: the bytes as UTF-8; docx: the body's text). */
  text(bytes: Uint8Array): string;
};

export const documentRenderPortContract = defineContract("DocumentRenderPort", (make: () => Promise<RenderHarness> | RenderHarness) => [
  {
    name: "a known template renders to bytes with a media type",
    async run() {
      const h = await make(), d = await h.render.render(h.template, h.data);
      expect(d.bytes instanceof Uint8Array && d.bytes.length > 0 && /^[\w.+-]+\/[\w.+-]+/.test(d.contentType), "bytes and a media type", { length: d.bytes.length, contentType: d.contentType });
    },
  },
  {
    name: "the same template and data give the same document (whatever the key order); other data a different one",
    async run() {
      const h = await make();
      const a = await h.render.render(h.template, h.data), b = await h.render.render(h.template, h.reordered), c = await h.render.render(h.template, h.other);
      expect(h.text(a.bytes) === h.text(b.bytes) && a.contentType === b.contentType, "the same document twice", { a: h.text(a.bytes).slice(0, 200), b: h.text(b.bytes).slice(0, 200) });
      expect(h.text(a.bytes) !== h.text(c.bytes), "other data, another document", h.text(c.bytes).slice(0, 200));
    },
  },
  {
    name: "an unknown template, a key outside the dotted lower-case form, or data that is not plain JSON, is refused",
    async run() {
      const h = await make();
      await expectRefused(() => h.render.render("pf0c.no_such_template", h.data), "an unknown template");
      await expectRefused(() => h.render.render("Not A Key", h.data), "a bad template key");
      await expectRefused(() => h.render.render(h.template, { when: new Date() } as never), "a Date in the data");
    },
  },
]);
