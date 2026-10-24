import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { approveSharedDefinition } from "@/lib/roles.functions";

export function SharedApproval({ dataset, definition }: { dataset: "school" | "covid"; definition: { key: string; version?: number; title: string; meaning: string; expression: string; grain: string } }) {
  const save = useServerFn(approveSharedDefinition);
  const [busy, setBusy] = useState(false);
  return <Button variant="outline" size="sm" disabled={busy} onClick={async () => {
    setBusy(true);
    try { await save({ data: { dataset, key: definition.key, version: definition.version ?? 1, payload: { title: definition.title, meaning: definition.meaning, expression: definition.expression, grain: definition.grain } } }); toast.success("Shared approval recorded"); }
    catch { toast.error("Shared approval requires a signed-in admin or analyst account."); }
    finally { setBusy(false); }
  }}>{busy ? "Saving…" : "Approve shared definition"}</Button>;
}