import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch, ApiError } from "@workspace/api-client-react";
import { AppShell, PageHeader, PageContent } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle } from "lucide-react";

/**
 * Program Requirements Admin. For a department administrator (and super
 * admins) to maintain the planning view of the programs they are scoped to:
 * Department Notes, global overrides of the Bulletin's wording, requirements the
 * Bulletin does not list, Sample Plans, and the change history.
 *
 * Everything here is an OVERLAY on the Bulletin data: nothing edits the Bulletin
 * source, and "Reset to Bulletin" restores it exactly. The server is the real
 * boundary (a program outside the person's scope answers 403); this page only
 * lists what the server allows.
 */

interface Me { superAdmin: boolean; programKeys: string[] | null; edition: string }
interface Program { programKey: string; type: "major" | "minor"; code: string; title: string; collegeName: string }
interface AdminNote {
  id: number; targetKey: string | null; title: string | null; body: string; courseCodes: string[]; kind: string | null; status: string; origin: string;
  sourceLabel: string | null; sourceReference: string | null; sourceAnchorText: string | null; reviewedBy: string | null; updatedBy: string; updatedAt: string;
}
interface AdminItem {
  stableKey: string; label: string; description: string; courses: string[];
  override: { id: number; title: string | null; description: string | null; hidden: boolean; bulletinChangedSince: boolean } | null;
}
interface AdminGroup {
  stableKey: string; title: string; category: string; shared: boolean; editable: boolean;
  provenance: { sourceLabel: string | null; sourceUrl: string | null; sourceVersion: string | null; lastVerified: string | null };
  items: AdminItem[];
  added: { id: number; stableKey: string; title: string | null; courseCodes: string[] }[];
}
interface Detail { edition: { id: string; label: string }; program: Program; groups: AdminGroup[]; notes: AdminNote[] }
interface AuditEntry { id: number; at: string; actor: string; entity: string; action: string; targetKey: string | null; before: unknown; after: unknown }
interface SamplePlanRow { id: number; slug: string; version: string; program: string; programKey: string | null; title: string; planLength: string; status: string; importWarnings: string[]; schoolName: string }

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  published: "default", draft: "secondary", archived: "outline", unmapped: "destructive",
};

const msg = (e: unknown) => (e instanceof ApiError ? ((e.data as { error?: string } | null)?.error ?? e.message) : "Something went wrong.");
const json = (method: string, body?: unknown) => ({ method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

export default function AdminProgramRequirementsPage() {
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ["/api/admin/department/me"], queryFn: () => customFetch<Me>("/api/admin/department/me"), retry: false });
  const programs = useQuery({ queryKey: ["/api/admin/department/programs"], queryFn: () => customFetch<{ programs: Program[] }>("/api/admin/department/programs"), enabled: me.isSuccess });
  const [programKey, setProgramKey] = useState("");
  const detail = useQuery({
    queryKey: ["/api/admin/department/programs", programKey],
    queryFn: () => customFetch<Detail>(`/api/admin/department/programs/${encodeURIComponent(programKey)}`),
    enabled: !!programKey,
  });
  const audit = useQuery({
    queryKey: ["/api/admin/department/programs", programKey, "audit"],
    queryFn: () => customFetch<{ entries: AuditEntry[] }>(`/api/admin/department/programs/${encodeURIComponent(programKey)}/audit`),
    enabled: !!programKey,
  });
  const samples = useQuery({ queryKey: ["/api/admin/department/sample-plans"], queryFn: () => customFetch<{ plans: SamplePlanRow[] }>("/api/admin/department/sample-plans"), enabled: me.isSuccess });

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const forbidden = me.error instanceof ApiError && me.error.status === 403;

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("/api/admin/department") });
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  }

  const grouped = useMemo(() => {
    const list = programs.data?.programs ?? [];
    return { major: list.filter((p) => p.type === "major"), minor: list.filter((p) => p.type === "minor") };
  }, [programs.data]);

  const unmapped = detail.data?.notes.filter((n) => n.status === "unmapped") ?? [];
  const notesFor = (key: string | null) => detail.data?.notes.filter((n) => n.targetKey === key && n.status !== "unmapped") ?? [];

  return (
    <AppShell>
      <PageHeader
        title="Program Requirements Admin"
        subtitle="Department Notes, planning overrides and Sample Plans for the programs you maintain. The Bulletin data is never changed; every change here is recorded."
      />
      <PageContent>
        {me.isLoading && <Card className="p-4 text-sm text-muted-foreground">Loading…</Card>}
        {forbidden && (
          <Card className="flex items-center gap-2 p-4 text-sm text-muted-foreground" data-testid="admin-program-forbidden">
            <AlertTriangle className="h-4 w-4 shrink-0" /> You are not a department administrator. Ask CampusVal support to be given a program.
          </Card>
        )}
        {me.data && (
          <div className="space-y-4" data-testid="admin-program-content">
            <Card className="space-y-2 p-3">
              <Label htmlFor="admin-program" className="text-xs">Program</Label>
              <Select value={programKey} onValueChange={setProgramKey}>
                <SelectTrigger id="admin-program" className="max-w-md" data-testid="admin-program-select"><SelectValue placeholder="Choose a program" /></SelectTrigger>
                <SelectContent className="max-h-80">
                  {grouped.major.length > 0 && (
                    <SelectGroup><SelectLabel>Majors</SelectLabel>{grouped.major.map((p) => <SelectItem key={p.programKey} value={p.programKey}>{p.title}</SelectItem>)}</SelectGroup>
                  )}
                  {grouped.minor.length > 0 && (
                    <SelectGroup><SelectLabel>Minors</SelectLabel>{grouped.minor.map((p) => <SelectItem key={p.programKey} value={p.programKey}>{p.title} (minor)</SelectItem>)}</SelectGroup>
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Bulletin edition: {me.data.edition}. {me.data.superAdmin ? "You can maintain every program." : `You can maintain ${me.data.programKeys?.length ?? 0} program(s).`}
              </p>
            </Card>
            {error && <p role="alert" className="text-sm text-destructive" data-testid="admin-program-error">{error}</p>}

            <Tabs defaultValue="requirements">
              <TabsList>
                <TabsTrigger value="requirements">Requirements & notes</TabsTrigger>
                <TabsTrigger value="unmapped" data-testid="tab-unmapped">Needs review{unmapped.length ? ` (${unmapped.length})` : ""}</TabsTrigger>
                <TabsTrigger value="samples">Sample Plans</TabsTrigger>
                <TabsTrigger value="history">Change history</TabsTrigger>
                {me.data.superAdmin && <TabsTrigger value="admins">Administrators</TabsTrigger>}
              </TabsList>

              <TabsContent value="requirements" className="space-y-3">
                {!programKey && <p className="text-sm text-muted-foreground">Choose a program to see its requirements.</p>}
                {detail.data?.groups.map((group) => (
                  <GroupEditor key={group.stableKey} group={group} programKey={programKey} notesFor={notesFor} busy={busy} act={act} />
                ))}
              </TabsContent>

              <TabsContent value="unmapped" className="space-y-2">
                <p className="text-xs text-muted-foreground">Imported text that could not be placed on a requirement with certainty. It is not shown to students until a person places and publishes it.</p>
                {unmapped.length === 0 && <p className="text-sm text-muted-foreground">Nothing is waiting for review.</p>}
                {unmapped.map((n) => (
                  <UnmappedNote key={n.id} note={n} group={detail.data!.groups.find((g) => !g.shared)!} busy={busy} act={act} />
                ))}
              </TabsContent>

              <TabsContent value="samples" className="space-y-2">
                {(samples.data?.plans ?? [])
                  .filter((p) => !programKey || p.programKey === programKey || me.data!.superAdmin)
                  .slice(0, 80)
                  .map((p) => (
                    <Card key={p.id} className="flex flex-wrap items-center justify-between gap-2 p-2 text-xs" data-testid={`sample-row-${p.id}`}>
                      <span><span className="font-medium">{p.program}</span> — {p.title} <span className="text-muted-foreground">v{p.version} · {p.planLength}{p.importWarnings.length ? ` · ${p.importWarnings.length} warning(s)` : ""}</span></span>
                      <span className="flex items-center gap-2">
                        <Badge variant={STATUS_VARIANT[p.status] ?? "outline"}>{p.status}</Badge>
                        {p.status !== "published" ? (
                          <Button size="sm" className="h-7" disabled={busy} onClick={() => act(() => customFetch(`/api/admin/department/sample-plans/${p.id}`, json("PATCH", { status: "published" })))}>Publish</Button>
                        ) : (
                          <Button size="sm" variant="outline" className="h-7" disabled={busy} onClick={() => act(() => customFetch(`/api/admin/department/sample-plans/${p.id}`, json("PATCH", { status: "draft" })))}>Unpublish</Button>
                        )}
                      </span>
                    </Card>
                  ))}
              </TabsContent>

              <TabsContent value="history" className="space-y-1">
                {(audit.data?.entries ?? []).map((e) => (
                  <Card key={e.id} className="p-2 text-xs" data-testid={`audit-${e.id}`}>
                    <span className="font-medium">{e.entity} {e.action}</span> by {e.actor} · {new Date(e.at).toLocaleString()}
                    {e.targetKey && <span className="block break-all text-muted-foreground">{e.targetKey}</span>}
                  </Card>
                ))}
                {programKey && audit.data?.entries.length === 0 && <p className="text-sm text-muted-foreground">No changes recorded yet.</p>}
              </TabsContent>

              {me.data.superAdmin && <TabsContent value="admins"><ScopeManager programs={programs.data?.programs ?? []} act={act} busy={busy} /></TabsContent>}
            </Tabs>
          </div>
        )}
      </PageContent>
    </AppShell>
  );
}

type Act = (fn: () => Promise<unknown>) => Promise<void>;

/** "BIOL 110, BIOL 112\nCHEM 141" -> ["BIOL 110", "BIOL 112", "CHEM 141"]. The server checks every code against the catalog. */
function parseCourseList(text: string): string[] {
  return text
    .split(/[,;\n]+/)
    .map((c) => c.trim().toUpperCase().replace(/\s+/g, " "))
    .filter(Boolean);
}

/** Title and course list: optional structure around the free-text note. */
function NoteStructureFields({
  title,
  setTitle,
  courses,
  setCourses,
  idPrefix,
}: {
  title: string;
  setTitle: (v: string) => void;
  courses: string;
  setCourses: (v: string) => void;
  idPrefix: string;
}) {
  return (
    <div className="grid gap-1 sm:grid-cols-2">
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={120}
        placeholder="Title (optional), e.g. Courses that fulfill the CMB theme"
        aria-label="Department Note title"
        className="h-7 text-xs"
        data-testid={`${idPrefix}-title`}
      />
      <Input
        value={courses}
        onChange={(e) => setCourses(e.target.value)}
        placeholder="Courses (optional), e.g. BIOL 110, BIOL 112"
        aria-label="Courses this note refers to, separated by commas"
        className="h-7 font-mono text-xs"
        data-testid={`${idPrefix}-courses`}
      />
    </div>
  );
}

function NoteRow({ note, act, busy }: { note: AdminNote; act: Act; busy: boolean }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note.body);
  const [title, setTitle] = useState(note.title ?? "");
  const [courses, setCourses] = useState((note.courseCodes ?? []).join(", "));
  const patch = (body: object) => act(() => customFetch(`/api/admin/department/notes/${note.id}`, json("PATCH", body)));
  return (
    <div className="rounded border border-amber-200 bg-amber-50/60 p-1.5 text-xs" data-testid={`admin-note-${note.id}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant={STATUS_VARIANT[note.status] ?? "outline"}>{note.status}</Badge>
        <span className="text-[10px] text-muted-foreground">{note.origin === "imported" ? `imported · ${note.sourceReference ?? ""}${note.reviewedBy ? "" : " · not reviewed"}` : `by ${note.updatedBy}`}</span>
      </div>
      {editing ? (
        <div className="mt-1 space-y-1">
          <NoteStructureFields title={title} setTitle={setTitle} courses={courses} setCourses={setCourses} idPrefix={`edit-note-${note.id}`} />
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={1200} aria-label="Department Note text" />
          <Button size="sm" className="h-7" disabled={busy || !text.trim()} data-testid={`save-note-${note.id}`}
            onClick={async () => { await patch({ body: text, title: title.trim() || null, courseCodes: parseCourseList(courses) }); setEditing(false); }}>Save</Button>
          <Button size="sm" variant="ghost" className="h-7" onClick={() => { setText(note.body); setTitle(note.title ?? ""); setCourses((note.courseCodes ?? []).join(", ")); setEditing(false); }}>Cancel</Button>
        </div>
      ) : (
        <>
          {note.title && <p className="mt-0.5 font-semibold">{note.title}</p>}
          <p className="mt-0.5 whitespace-pre-line break-words">{note.body}</p>
          {note.courseCodes?.length > 0 && (
            <p className="mt-0.5 font-mono text-[10px] text-amber-900" data-testid={`admin-note-courses-${note.id}`}>{note.courseCodes.join(", ")}</p>
          )}
        </>
      )}
      {!editing && (
        <div className="mt-1 flex flex-wrap gap-1">
          <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={() => setEditing(true)}>Edit</Button>
          {note.status !== "published" && <Button size="sm" className="h-6 px-2 text-[11px]" disabled={busy} onClick={() => patch({ status: "published" })} data-testid={`publish-note-${note.id}`}>Publish</Button>}
          {note.status === "published" && <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" disabled={busy} onClick={() => patch({ status: "draft" })}>Unpublish</Button>}
          {note.status !== "archived" && <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" disabled={busy} onClick={() => patch({ status: "archived" })}>Archive</Button>}
        </div>
      )}
    </div>
  );
}

function AddNote({ programKey, targetKey, act, busy }: { programKey: string; targetKey: string | null; act: Act; busy: boolean }) {
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [courses, setCourses] = useState("");
  const [open, setOpen] = useState(false);
  const save = async (status: "published" | "draft") => {
    await act(() =>
      customFetch(
        "/api/admin/department/notes",
        json("POST", { programKey, targetKey, body: text, title: title.trim() || null, courseCodes: parseCourseList(courses), status }),
      ),
    );
    setText("");
    setTitle("");
    setCourses("");
    setOpen(false);
  };
  if (!open) return <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={() => setOpen(true)} data-testid="add-department-note">Add Department Note</Button>;
  return (
    <div className="space-y-1">
      <NoteStructureFields title={title} setTitle={setTitle} courses={courses} setCourses={setCourses} idPrefix="new-note" />
      <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={1200} placeholder="Advising guidance for students, in the department's words" aria-label="New Department Note" data-testid="new-note-text" />
      <div className="flex gap-1">
        <Button size="sm" className="h-7" disabled={busy || !text.trim()} data-testid="save-note-published" onClick={() => save("published")}>
          Publish
        </Button>
        <Button size="sm" variant="outline" className="h-7" disabled={busy || !text.trim()} onClick={() => save("draft")}>
          Save as draft
        </Button>
        <Button size="sm" variant="ghost" className="h-7" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </div>
  );
}

function GroupEditor({ group, programKey, notesFor, busy, act }: { group: AdminGroup; programKey: string; notesFor: (k: string | null) => AdminNote[]; busy: boolean; act: Act }) {
  const [addOpen, setAddOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [codes, setCodes] = useState("");
  return (
    <details className="rounded-md border bg-card" open={!group.shared} data-testid={`admin-group-${group.stableKey}`}>
      <summary className="cursor-pointer px-2.5 py-2 text-sm font-semibold">
        {group.title} <Badge variant="outline" className="ml-1 text-[10px]">{group.category}</Badge>
        {group.shared && <span className="ml-1 text-[10px] font-normal text-muted-foreground">shared by every program of the school{group.editable ? "" : " · notes only"}</span>}
      </summary>
      <div className="space-y-2 border-t p-2.5">
        <p className="text-[11px] text-muted-foreground">Bulletin source: {[group.provenance.sourceLabel, group.provenance.sourceVersion, group.provenance.lastVerified && `verified ${group.provenance.lastVerified}`].filter(Boolean).join(" · ")}</p>
        <div className="space-y-1">
          {notesFor(group.stableKey).map((n) => <NoteRow key={n.id} note={n} act={act} busy={busy} />)}
          {!group.shared && <AddNote programKey={programKey} targetKey={group.stableKey} act={act} busy={busy} />}
        </div>
        {group.items.map((item) => (
          <div key={item.stableKey} className={`rounded border p-2 text-xs ${item.override?.hidden ? "border-dashed opacity-80" : ""}`} data-testid={`admin-item-${item.stableKey}`}>
            <div className="flex flex-wrap items-start justify-between gap-1">
              <div className="min-w-0">
                <div className="font-medium">{item.override?.title ?? item.label}{item.override?.title && <Badge variant="outline" className="ml-1 text-[9px]">department edit</Badge>}{item.override?.hidden && <Badge variant="secondary" className="ml-1 text-[9px]">hidden</Badge>}</div>
                {item.override?.title && <div className="text-[10px] text-muted-foreground">Bulletin: {item.label}</div>}
                {item.override?.bulletinChangedSince && <div className="text-[10px] text-amber-800">The Bulletin changed since this override was made. Review it.</div>}
              </div>
              {group.editable && (
                <div className="flex flex-wrap gap-1">
                  <WordingEditor item={item} busy={busy} act={act} />
                  <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" disabled={busy} data-testid={`toggle-hide-${item.stableKey}`}
                    onClick={() => act(() => customFetch("/api/admin/department/overrides", json("PUT", { targetKey: item.stableKey, hidden: !item.override?.hidden })))}>
                    {item.override?.hidden ? "Show" : "Hide from planning view"}
                  </Button>
                  {item.override && <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" disabled={busy} data-testid={`reset-${item.stableKey}`} onClick={() => act(() => customFetch(`/api/admin/department/overrides/${item.override!.id}`, { method: "DELETE" }))}>Reset to Bulletin</Button>}
                </div>
              )}
            </div>
            <div className="mt-1 space-y-1">
              {notesFor(item.stableKey).map((n) => <NoteRow key={n.id} note={n} act={act} busy={busy} />)}
              <AddNote programKey={programKey} targetKey={item.stableKey} act={act} busy={busy} />
              <ProvenanceView programKey={programKey} targetKey={item.stableKey} />
            </div>
          </div>
        ))}
        {group.added.map((a) => (
          <div key={a.id} className="flex items-center justify-between rounded border border-amber-200 p-2 text-xs">
            <span>{a.title} <Badge variant="outline" className="text-[9px]">added by department</Badge> <span className="font-mono text-[10px]">{a.courseCodes.join(", ")}</span></span>
            {group.editable && <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" disabled={busy} onClick={() => act(() => customFetch(`/api/admin/department/overrides/${a.id}`, { method: "DELETE" }))}>Remove</Button>}
          </div>
        ))}
        {group.editable && !group.shared && (
          addOpen ? (
            <div className="space-y-1 rounded border p-2">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Requirement title" aria-label="New requirement title" maxLength={160} />
              <Input value={codes} onChange={(e) => setCodes(e.target.value)} placeholder="Course codes, comma separated (optional, SCU catalog only)" aria-label="Course codes" />
              <div className="flex gap-1">
                <Button size="sm" className="h-7" disabled={busy || !title.trim()}
                  onClick={async () => { await act(() => customFetch("/api/admin/department/requirements", json("POST", { groupKey: group.stableKey, title, courseCodes: codes.split(",").map((c) => c.trim()).filter(Boolean) }))); setTitle(""); setCodes(""); setAddOpen(false); }}>
                  Add requirement
                </Button>
                <Button size="sm" variant="ghost" className="h-7" onClick={() => setAddOpen(false)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAddOpen(true)}>Add a requirement the Bulletin does not list</Button>
          )
        )}
      </div>
    </details>
  );
}

interface Provenance {
  base: { edition: string; sourceLabel: string | null; sourceUrl: string | null; sourceVersion: string | null; lastVerified: string | null; group: string; label: string };
  department: { override: { title: string | null; hidden: boolean; updatedBy: string; bulletinChangedSince: boolean } | null; notes: { id: number; status: string; origin: string }[] };
  student: string;
}

/** Base (Bulletin) / Department / Student, for debugging what a student is seeing. */
function ProvenanceView({ programKey, targetKey }: { programKey: string; targetKey: string }) {
  const [open, setOpen] = useState(false);
  const data = useQuery({
    queryKey: ["/api/admin/department/programs", programKey, "provenance", targetKey],
    queryFn: () => customFetch<Provenance>(`/api/admin/department/programs/${encodeURIComponent(programKey)}/provenance?targetKey=${encodeURIComponent(targetKey)}`),
    enabled: open,
  });
  return (
    <details className="text-[10px] text-muted-foreground" onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="cursor-pointer">Where this comes from</summary>
      {data.data && (
        <dl className="mt-1 space-y-0.5" data-testid="provenance-panel">
          <div><dt className="inline font-semibold">Base: </dt><dd className="inline">{data.data.base.edition} Bulletin · {data.data.base.sourceLabel} · {data.data.base.sourceVersion} · verified {data.data.base.lastVerified}</dd></div>
          <div><dt className="inline font-semibold">Department: </dt><dd className="inline">{data.data.department.override ? `override by ${data.data.department.override.updatedBy}${data.data.department.override.hidden ? " (hidden)" : ""}${data.data.department.override.bulletinChangedSince ? " — the Bulletin changed since" : ""}` : "no override"}; {data.data.department.notes.length} note(s)</dd></div>
          <div><dt className="inline font-semibold">Student: </dt><dd className="inline">{data.data.student}</dd></div>
        </dl>
      )}
    </details>
  );
}

function WordingEditor({ item, busy, act }: { item: AdminItem; busy: boolean; act: Act }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(item.override?.title ?? item.label);
  if (!open) return <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={() => setOpen(true)} data-testid={`edit-wording-${item.stableKey}`}>Edit wording</Button>;
  return (
    <span className="flex flex-wrap items-center gap-1">
      <Input value={text} onChange={(e) => setText(e.target.value)} maxLength={160} className="h-7 w-64 text-xs" aria-label="Wording shown to students" data-testid="wording-input" />
      <Button size="sm" className="h-7" disabled={busy} data-testid="wording-save"
        onClick={async () => { await act(() => customFetch("/api/admin/department/overrides", json("PUT", { targetKey: item.stableKey, title: text.trim() || null }))); setOpen(false); }}>
        Save
      </Button>
      <Button size="sm" variant="ghost" className="h-7" onClick={() => setOpen(false)}>Cancel</Button>
    </span>
  );
}

function UnmappedNote({ note, group, busy, act }: { note: AdminNote; group: AdminGroup; busy: boolean; act: Act }) {
  const [target, setTarget] = useState("");
  return (
    <Card className="space-y-1 p-2 text-xs" data-testid={`unmapped-${note.id}`}>
      <p className="whitespace-pre-line break-words">{note.body}</p>
      <p className="text-[10px] text-muted-foreground">Beside “{note.sourceAnchorText}” · {note.sourceReference}</p>
      <div className="flex flex-wrap items-center gap-1">
        <Select value={target} onValueChange={setTarget}>
          <SelectTrigger className="h-7 max-w-xs text-xs" aria-label="Place on requirement"><SelectValue placeholder="Place on a requirement" /></SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value={group.stableKey}>The program as a whole</SelectItem>
            {group.items.map((i) => <SelectItem key={i.stableKey} value={i.stableKey}>{i.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" className="h-7" disabled={busy || !target} onClick={() => act(() => customFetch(`/api/admin/department/notes/${note.id}`, json("PATCH", { targetKey: target })))}>Place as draft</Button>
        <Button size="sm" variant="ghost" className="h-7" disabled={busy} onClick={() => act(() => customFetch(`/api/admin/department/notes/${note.id}`, json("PATCH", { status: "archived" })))}>Discard</Button>
      </div>
    </Card>
  );
}

function ScopeManager({ programs, act, busy }: { programs: Program[]; act: Act; busy: boolean }) {
  const scopes = useQuery({ queryKey: ["/api/admin/department/scopes"], queryFn: () => customFetch<{ scopes: { id: number; email: string; programKey: string }[] }>("/api/admin/department/scopes") });
  const [email, setEmail] = useState("");
  const [program, setProgram] = useState("");
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">A department administrator can maintain only the programs listed against their address.</p>
      <div className="flex flex-wrap items-end gap-2">
        <div><Label htmlFor="scope-email" className="text-xs">Email</Label><Input id="scope-email" value={email} onChange={(e) => setEmail(e.target.value)} type="email" className="w-64" /></div>
        <div>
          <Label htmlFor="scope-program" className="text-xs">Program</Label>
          <Select value={program} onValueChange={setProgram}>
            <SelectTrigger id="scope-program" className="w-64"><SelectValue placeholder="Program" /></SelectTrigger>
            <SelectContent className="max-h-72">{programs.map((p) => <SelectItem key={p.programKey} value={p.programKey}>{p.title}{p.type === "minor" ? " (minor)" : ""}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <Button disabled={busy || !email || !program} onClick={async () => { await act(() => customFetch("/api/admin/department/scopes", json("POST", { email, programKey: program }))); await scopes.refetch(); }}>Grant</Button>
      </div>
      {(scopes.data?.scopes ?? []).map((s) => (
        <div key={s.id} className="flex items-center justify-between rounded border p-1.5 text-xs">
          <span>{s.email} → {s.programKey}</span>
          <Button size="sm" variant="ghost" className="h-6" disabled={busy} onClick={async () => { await act(() => customFetch("/api/admin/department/scopes", json("DELETE", { email: s.email, programKey: s.programKey }))); await scopes.refetch(); }}>Revoke</Button>
        </div>
      ))}
    </div>
  );
}
