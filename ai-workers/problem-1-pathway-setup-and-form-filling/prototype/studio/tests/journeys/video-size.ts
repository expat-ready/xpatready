// P-729 (1): a journey's video is scaled down to fit 800 x 800 with its aspect kept (1440 x 900 → 800 x 500), so a
// recording stays small enough to keep 90 days and to watch on a phone; the page keeps its own viewport, so the journey
// still walks at 1440 px. Even sizes (the encoder halves them). Used by record.ts; checked by tests/check_item_proof.ts.
export function videoSize(v: { width: number; height: number }): { width: number; height: number } {
  const k = Math.min(1, 800 / v.width, 800 / v.height), even = (n: number) => Math.max(2, Math.floor((n * k) / 2) * 2);
  return { width: even(v.width), height: even(v.height) };
}
