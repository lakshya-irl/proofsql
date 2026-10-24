import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { getPermissions, setDatasetAccess } from "@/lib/roles.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import "@lovable.dev/cloud-auth-js/styles.css";

export function AccountControls() {
  const get = useServerFn(getPermissions);
  const grant = useServerFn(setDatasetAccess);
  const cache = useQueryClient();
  const [signedIn, setSignedIn] = useState(false);
  const [permissions, setPermissions] = useState<Awaited<ReturnType<typeof getPermissions>> | null>(null);
  const [datasetId, setDatasetId] = useState(""); const [userId, setUserId] = useState(""); const [canQuery, setCanQuery] = useState(true);
  async function refresh() {
    const { data } = await supabase.auth.getUser(); setSignedIn(Boolean(data.user));
    if (data.user) { try { setPermissions(await get()); } catch { setPermissions(null); } } else setPermissions(null);
  }
  useEffect(() => { void refresh(); }, []);
  async function signIn(provider: "google" | "lovable") {
    const result = await lovable.auth.signInWithOAuth(provider, { redirect_uri: window.location.origin });
    if (result.error) toast.error("Sign-in did not complete.");
    else if (!result.redirected) await refresh();
  }
  return <section className="space-y-3 border-t border-border py-4"><h2 className="font-semibold">Account & permissions</h2>{signedIn ? <><p className="text-sm">Role: {permissions ? permissions.roles.join(", ") || "viewer (no privileged role assigned)" : "Not checked"}</p><Button variant="outline" onClick={refresh}>Refresh permissions</Button><Button variant="ghost" onClick={async () => { await cache.cancelQueries(); cache.clear(); await supabase.auth.signOut(); setSignedIn(false); setPermissions(null); }}>Sign out</Button></> : <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => signIn("google")}>Continue with Google</Button><Button className="lovable-auth-button" onClick={() => signIn("lovable")}>Continue with Lovable</Button></div>}<p className="text-xs text-muted-foreground">Admins and analysts approve shared definitions. Only admins manage access. Existing public uploads remain public; local demo approvals are separate.</p>{permissions?.manageAccess && <form className="space-y-2" onSubmit={async (e) => { e.preventDefault(); try { await grant({ data: { datasetId, userId, canQuery } }); toast.success("Access grant saved"); } catch { toast.error("Access could not be saved."); } }}><label className="block text-xs">Dataset ID<Input required value={datasetId} onChange={(e) => setDatasetId(e.target.value)} /></label><label className="block text-xs">User ID<Input required value={userId} onChange={(e) => setUserId(e.target.value)} /></label><label className="flex items-center gap-2 text-sm"><Checkbox checked={canQuery} onCheckedChange={(v) => setCanQuery(v === true)} />Allow query access</label><Button type="submit">Save access grant</Button></form>}</section>;
}