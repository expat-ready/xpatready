// PF-6 part 2a (concept §4; AG-1-69; DW3): the role picker and Compare roles. Money permissions and licence actions are
// shown in their own groups, read from PF-6r's `class` for each key, never ticked as a group; the six roles in SA-06
// Appendix C's plain words (can / cannot).
import * as React from "react";
import { Button, Dialog } from "@/components/ui/controls";
import { keyWords, ROLE_WORDS, roleLabel, type Role } from "./contract";

function Groups({ role }: { role: Role }) {
  const group = (cls: "MONEY" | "LICENCE", title: string) => {
    const keys = role.keys.filter((k) => k.class === cls);
    return (
      <details data-key-group={cls} className="text-xs">
        <summary className="cursor-pointer text-text-muted">{title}: {keys.length}</summary>
        {keys.length ? <ul className="mt-1 list-disc pl-5">{keys.map((k) => <li key={k.key}>{keyWords(k.key)}</li>)}</ul> : <p className="mt-1">None.</p>}
      </details>
    );
  };
  return <div className="mt-1 flex flex-col gap-1">{group("MONEY", "Money permissions")}{group("LICENCE", "Licence actions")}</div>;
}

/** Tick one or more roles; only the roles offered can be ticked (the rest are not shown). */
export function RolePicker({ roles, offered, chosen, onChange, legend }: { roles: readonly Role[]; offered: readonly string[]; chosen: readonly string[]; onChange: (r: string[]) => void; legend: string }) {
  return (
    <fieldset data-role-picker>
      <legend className="text-xs font-medium">{legend}</legend>
      <div className="mt-1 flex flex-col gap-2">
        {roles.filter((r) => offered.includes(r.role)).map((r) => (
          <div key={r.role} className="rounded-lg border border-border px-3 py-2">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" className="size-4" data-role={r.role} checked={chosen.includes(r.role)}
                onChange={(e) => onChange(e.target.checked ? [...chosen, r.role] : chosen.filter((x) => x !== r.role))} />
              {roleLabel(r.role)}
            </label>
            <p className="mt-0.5 text-xs text-text-muted">{ROLE_WORDS[r.role]?.can} · not: {ROLE_WORDS[r.role]?.cannot}</p>
            <Groups role={r} />
          </div>
        ))}
      </div>
    </fieldset>
  );
}

export function CompareRoles({ roles }: { roles: readonly Role[] }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button variant="link" size="sm" onClick={() => setOpen(true)} data-compare-roles>Compare roles</Button>
      <Dialog open={open} onOpenChange={setOpen} title="Compare roles" description="The six starter roles: what each can and cannot do." wide>
        <div className="grid gap-3 sm:grid-cols-2" data-compare>
          {roles.map((r) => (
            <section key={r.role} className="rounded-lg border border-border p-3" data-compare-role={r.role} aria-label={roleLabel(r.role)}>
              <h3 className="text-sm font-semibold">{roleLabel(r.role)}</h3>
              <p className="mt-1 text-xs"><span className="font-medium">Can:</span> {ROLE_WORDS[r.role]?.can}</p>
              <p className="mt-1 text-xs"><span className="font-medium">Cannot:</span> {ROLE_WORDS[r.role]?.cannot}</p>
              <Groups role={r} />
            </section>
          ))}
        </div>
      </Dialog>
    </>
  );
}
