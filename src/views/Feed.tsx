import { useMemo, useState } from "react";
import { resolveConfig, useStore } from "../store/useStore";
import { UNASSIGNED, useFilters } from "../store/useFilters";
import { useWindowedIds } from "../lib/useWindowedItems";
import { Avatar, TypeBadge } from "../components/common";
import { htmlToText, relativeTime, shortTime } from "../lib/format";
import { getWorkItemComments, type WorkItemComment } from "../lib/azureDevOps";
import FilterBar from "../components/FilterBar";
import type { FeedEvent, FeedEventKind } from "../types";

// Cache de comentarios por work item, para no re-pedirlos al re-expandir.
const commentCache = new Map<number, WorkItemComment[]>();

const KIND_ICON: Record<FeedEventKind, string> = {
  created: "✨",
  assigned: "👤",
  state: "🔄",
  column: "➡️",
  other: "•",
};

const KIND_ACCENT: Record<FeedEventKind, string> = {
  created: "border-l-emerald-500",
  assigned: "border-l-sky-500",
  state: "border-l-amber-500",
  column: "border-l-violet-500",
  other: "border-l-slate-600",
};

export default function Feed() {
  const feed = useStore((s) => s.feed);
  const itemsMap = useStore((s) => s.items);
  const windowedIds = useWindowedIds();
  const filters = useFilters();

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    const iterationSet = filters.iterations.length ? new Set(filters.iterations) : null;
    return feed.filter((ev) => {
      if (filters.type && ev.workItemType !== filters.type) return false;
      const item = itemsMap[ev.workItemId];
      // Si el item está cargado pero su sprint quedó fuera de la ventana, ocultar.
      if (item && !windowedIds.has(item.id)) return false;
      if (iterationSet && (!item?.iterationPath || !iterationSet.has(item.iterationPath)))
        return false;
      if (filters.assignee) {
        if (filters.assignee === UNASSIGNED) {
          if (item?.assignedTo) return false;
        } else if (item?.assignedTo !== filters.assignee) {
          return false;
        }
      }
      if (q && !ev.text.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [feed, itemsMap, windowedIds, filters]);

  const groups = useMemo(() => groupByDay(filtered), [filtered]);

  return (
    <div className="flex flex-col h-full">
      <FilterBar />
      {filtered.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-slate-500">
          <div className="text-center">
            <p className="text-lg">Sin actividad todavía</p>
            <p className="text-sm mt-1">
              Los movimientos de US / BUG / TASK van a aparecer acá en cuanto ocurran.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 py-3">
          <div className="max-w-3xl mx-auto">
            {groups.map((g) => (
              <div key={g.label} className="mb-4">
                <div className="sticky top-0 z-10 bg-slate-950/90 backdrop-blur py-1 mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    {g.label}
                  </span>
                </div>
                <div className="space-y-2">
                  {g.events.map((ev) => (
                    <EventRow key={ev.id} ev={ev} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function EventRow({ ev }: { ev: FeedEvent }) {
  const config = useStore((s) => s.config);
  const envPat = useStore((s) => s.envPat);

  const [expanded, setExpanded] = useState(false);
  const [comments, setComments] = useState<WorkItemComment[] | null>(
    () => commentCache.get(ev.workItemId) ?? null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    const next = !expanded;
    setExpanded(next);
    if (next && comments === null && !loading) {
      const cfg = resolveConfig(config, envPat);
      if (!cfg || !cfg.pat) {
        setError("Sin configuración para traer comentarios.");
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const list = await getWorkItemComments(cfg, ev.workItemId);
        commentCache.set(ev.workItemId, list);
        setComments(list);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <div
      className={`bg-slate-900/60 rounded-lg border-l-2 ${KIND_ACCENT[ev.kind]} border border-slate-800`}
    >
      <button
        onClick={toggle}
        className="w-full flex items-start gap-3 p-3 text-left hover:bg-slate-800/40 transition-colors rounded-lg"
      >
        <Avatar name={ev.actor} size={32} />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-slate-100 leading-snug">
            <span className="mr-1">{KIND_ICON[ev.kind]}</span>
            {ev.text}
          </p>
          <p className="text-xs text-slate-500 mt-1 truncate">{ev.title}</p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <TypeBadge type={ev.workItemType} />
          <span
            className="text-xs text-slate-500"
            title={new Date(ev.timestamp).toLocaleString("es-AR")}
          >
            {relativeTime(ev.timestamp)}
          </span>
          <span className="text-[10px] text-slate-600">{shortTime(ev.timestamp)}</span>
        </div>
        <span className={`text-slate-500 text-xs mt-1 transition-transform ${expanded ? "rotate-180" : ""}`}>
          ▼
        </span>
      </button>

      {expanded && (
        <div className="px-3 pb-3 pl-12">
          <CommentList loading={loading} error={error} comments={comments} />
        </div>
      )}
    </div>
  );
}

function CommentList({
  loading,
  error,
  comments,
}: {
  loading: boolean;
  error: string | null;
  comments: WorkItemComment[] | null;
}) {
  if (loading) return <p className="text-xs text-slate-500 py-2">Cargando comentarios…</p>;
  if (error) return <p className="text-xs text-red-400 py-2">{error}</p>;
  if (!comments || comments.length === 0)
    return <p className="text-xs text-slate-500 py-2">Este item no tiene comentarios.</p>;

  return (
    <div className="space-y-2 border-l border-slate-700 pl-3">
      {comments.map((c) => (
        <div key={c.id} className="bg-slate-800/50 rounded-md p-2">
          <div className="flex items-center gap-2 mb-1">
            <Avatar name={c.createdBy} size={20} />
            <span className="text-xs font-medium text-slate-300">{c.createdBy ?? "Alguien"}</span>
            {c.createdDate && (
              <span
                className="text-[10px] text-slate-500 ml-auto"
                title={new Date(c.createdDate).toLocaleString("es-AR")}
              >
                {relativeTime(c.createdDate)}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-200 whitespace-pre-wrap leading-snug">
            {htmlToText(c.text)}
          </p>
        </div>
      ))}
    </div>
  );
}

function groupByDay(events: FeedEvent[]): { label: string; events: FeedEvent[] }[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const map = new Map<string, FeedEvent[]>();
  for (const ev of events) {
    const d = new Date(ev.timestamp);
    d.setHours(0, 0, 0, 0);
    let label: string;
    if (d.getTime() === today.getTime()) label = "Hoy";
    else if (d.getTime() === yesterday.getTime()) label = "Ayer";
    else label = new Date(ev.timestamp).toLocaleDateString("es-AR", { weekday: "long", day: "2-digit", month: "long" });
    if (!map.has(label)) map.set(label, []);
    map.get(label)!.push(ev);
  }
  return [...map.entries()].map(([label, evs]) => ({ label, events: evs }));
}
