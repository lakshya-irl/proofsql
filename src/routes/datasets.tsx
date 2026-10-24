import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Database as DbIcon, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { csvToDb, kindOf, profileDb, safeIdent, type TableProfile } from "@/lib/proofsql/uploads";

export const Route = createFileRoute("/datasets")({
  head: () => ({
    meta: [
      { title: "Datasets — ProofSQL" },
      { name: "description", content: "Upload real CSV, SQLite or SQL datasets and get a measured data-quality profile." },
      { property: "og:title", content: "Datasets — ProofSQL" },
      { property: "og:description", content: "Shared online dataset uploads with a real, measured data-quality profile." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DatasetsPage,
});

type Row = { id: string; name: string; file_path: string; file_type: string; size_bytes: number; source_note: string | null; created_at: string };
const MAX = 20 * 1024 * 1024;

async function getSql() {
  const initSqlJs = (await import("sql.js")).default;
  return initSqlJs({ locateFile: (f: string) => `/wasm/${f}` });
}

function DatasetsPage() {
  const [list, setList] = useState<Row[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [opening, setOpening] = useState<string | null>(null);
  const [profile, setProfile] = useState<{ ds: Row; tables: TableProfile[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    setLoadingList(true);
    const { data, error } = await supabase.from("datasets").select("*").order("created_at", { ascending: false }).limit(100);
    if (error) toast.error(`Could not load datasets: ${error.message}`);
    setList((data as Row[]) ?? []);
    setLoadingList(false);
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  async function upload(file: File) {
    const kind = kindOf(file.name);
    if (!kind) { toast.error("Only .csv, .sqlite/.db or .sql files are supported."); return; }
    if (file.size === 0 || file.size > MAX) { toast.error("File must be between 1 byte and 20 MB."); return; }
    setBusy(true);
    try {
      // Validate locally before storing: the file must actually open.
      const SQL = await getSql();
      if (kind === "csv") csvToDb(SQL, await file.text(), "data").close();
      else if (kind === "sqlite") new SQL.Database(new Uint8Array(await file.arrayBuffer())).close();
      else { const d = new SQL.Database(); d.exec(await file.text()); d.close(); }
      const path = `${crypto.randomUUID()}/${safeIdent(file.name.replace(/\.[^.]+$/, ""), "dataset")}.${kind}`;
      const up = await supabase.storage.from("datasets").upload(path, file, { contentType: "application/octet-stream" });
      if (up.error) throw new Error(up.error.message);
      const ins = await supabase.from("datasets").insert({ name: file.name.slice(0, 200), file_path: path, file_type: kind, size_bytes: file.size, source_note: note.trim().slice(0, 500) || null });
      if (ins.error) throw new Error(ins.error.message);
      toast.success(`Uploaded ${file.name}`);
      setNote("");
      await refresh();
    } catch (e) {
      toast.error(`Upload failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function open(ds: Row) {
    setOpening(ds.id); setProfile(null);
    try {
      const dl = await supabase.storage.from("datasets").download(ds.file_path);
      if (dl.error || !dl.data) throw new Error(dl.error?.message ?? "Download failed");
      const SQL = await getSql();
      let db;
      if (ds.file_type === "csv") db = csvToDb(SQL, await dl.data.text(), safeIdent(ds.name.replace(/\.[^.]+$/, ""), "data"));
      else if (ds.file_type === "sqlite") db = new SQL.Database(new Uint8Array(await dl.data.arrayBuffer()));
      else { db = new SQL.Database(); db.exec(await dl.data.text()); }
      setProfile({ ds, tables: profileDb(db) });
      db.close();
    } catch (e) {
      toast.error(`Could not open dataset: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setOpening(null); }
  }

  return (
    <div className="max-w-4xl space-y-4">
      <h1 className="text-xl font-semibold">Datasets</h1>
      <p className="rounded border border-border bg-muted p-3 text-xs">
        Shared online and public: no sign-in, so <strong>anyone using this app can see and download every upload</strong>. Do not upload personal or confidential data.
        Uploaded data gets a real measured profile here. Ask &amp; Verify still answers only against the built-in demo database — questions on uploaded datasets are NOT SUPPORTED yet.
      </p>

      <section className="space-y-2 rounded-lg border border-border bg-card p-4">
        <h2 className="font-semibold">Upload a dataset</h2>
        <p className="text-xs text-muted-foreground">CSV, SQLite (.sqlite/.db) or SQL file, up to 20 MB. For UDISE+, download a CSV from udiseplus.gov.in or data.gov.in and upload it here.</p>
        <label className="block text-xs">Source (optional, e.g. download link)
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} className="mt-1 w-full rounded border border-input bg-background px-2 py-1 text-sm" placeholder="https://..." />
        </label>
        <input ref={fileRef} type="file" accept=".csv,.sqlite,.sqlite3,.db,.sql" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
        <Button onClick={() => fileRef.current?.click()} disabled={busy}>
          {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Checking and uploading…</> : <><Upload className="h-4 w-4" /> Choose file</>}
        </Button>
      </section>

      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="mb-2 font-semibold">Uploaded datasets</h2>
        {loadingList ? <p className="text-xs text-muted-foreground">Loading…</p> : list.length === 0 ? <p className="text-xs text-muted-foreground">No datasets uploaded yet.</p> : (
          <ul className="divide-y divide-border">
            {list.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <DbIcon className="h-4 w-4 text-muted-foreground" aria-hidden />
                <span className="min-w-0 break-all font-medium">{d.name}</span>
                <span className="text-xs text-muted-foreground">{d.file_type.toUpperCase()} · {(d.size_bytes / 1024).toFixed(1)} KB · {new Date(d.created_at).toLocaleString()}</span>
                {d.source_note && <span className="w-full break-all text-xs text-muted-foreground">Source: {d.source_note}</span>}
                <Button size="sm" variant="outline" className="ml-auto" disabled={opening !== null} onClick={() => void open(d)}>
                  {opening === d.id ? <><Loader2 className="h-3 w-3 animate-spin" /> Profiling…</> : "Profile"}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {profile && (
        <section className="space-y-3 rounded-lg border border-border bg-card p-4">
          <h2 className="font-semibold">Profile: {profile.ds.name}</h2>
          {profile.tables.map((t) => (
            <div key={t.name} className="space-y-1">
              <div className="text-sm"><span className="font-mono">{t.name}</span> — {t.rows} rows, {t.duplicateRows} exact duplicate rows</div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="text-left text-muted-foreground"><th className="pr-2">Column</th><th className="pr-2">Type</th><th className="pr-2">Empty (NULL)</th><th className="pr-2">Placeholder (blank/NA/-)</th><th>Distinct</th></tr></thead>
                  <tbody>{t.columns.map((c) => <tr key={c.name} className="border-t border-border"><td className="pr-2 font-mono">{c.name}</td><td className="pr-2">{c.type}</td><td className="pr-2">{c.nulls}</td><td className="pr-2">{c.blanks}</td><td>{c.distinct}</td></tr>)}</tbody>
                </table>
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
