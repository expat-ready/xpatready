// PF-31 (Lead 13, breaker on 2fd5352aa M1): a dropdown menu portals to the page's body, so a menu left open in a workspace
// tab that is then hidden (Alt+PageDown, Back, a strip click) would float over the shown tab, keep the page's pointer
// lock and act on the hidden tab. MenuRoot is DropdownMenu.Root that is open only while its tab is shown.
import * as React from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useTabActive } from "@/components/workspace";

export function MenuRoot(props: Omit<React.ComponentProps<typeof DropdownMenu.Root>, "open" | "onOpenChange" | "defaultOpen">) {
  const shown = useTabActive(), [open, setOpen] = React.useState(false);
  React.useEffect(() => { if (!shown) setOpen(false); }, [shown]);
  return <DropdownMenu.Root {...props} open={open && shown} onOpenChange={setOpen} />;
}
