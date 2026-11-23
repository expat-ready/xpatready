// PF-31 (EXPERIENCE §4 "conflict", §2.12): someone else saved the record after this draft began, so the save was refused
// (409) and nothing was written. Both values show side by side; the person takes the saved one or keeps theirs (the draft
// moves onto the newer version, and the next Save writes it). Never overwritten silently.
import { Button, Notice } from "@/components/ui/controls";

export type ConflictRow = { label: string; saved: string; mine: string };

export function ConflictNotice({ rows, message, onSaved, onMine }: { rows: ConflictRow[]; message: string; onSaved: () => void; onMine: () => void }) {
  const differ = rows.filter((r) => r.saved !== r.mine);
  return (
    <div data-conflict tabIndex={-1} className="rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
      <Notice tone="warn" title="Someone else saved this first">
        <p data-conflict-message>{message} Nothing of yours was saved. Compare, then choose.</p>
        {differ.length ? <table className="mt-2 w-full text-left text-sm">
          <thead><tr><th scope="col" className="py-1 pr-2 font-medium">Detail</th><th scope="col" className="py-1 pr-2 font-medium">Saved now</th><th scope="col" className="py-1 font-medium">Yours</th></tr></thead>
          <tbody>{differ.map((r) => <tr key={r.label} data-conflict-row={r.label}><td className="py-1 pr-2">{r.label}</td><td className="py-1 pr-2 [overflow-wrap:anywhere]" data-conflict-saved>{r.saved || "Not set"}</td><td className="py-1 [overflow-wrap:anywhere]" data-conflict-mine>{r.mine || "Not set"}</td></tr>)}</tbody>
        </table> : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={onSaved} data-conflict-take-saved>Use the saved version</Button>
          <Button type="button" size="sm" variant="outline" onClick={onMine} data-conflict-keep-mine>Keep mine, then Save</Button>
        </div>
      </Notice>
    </div>
  );
}
