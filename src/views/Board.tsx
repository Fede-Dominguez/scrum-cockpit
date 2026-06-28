import { useMemo } from "react";
import { useStore } from "../store/useStore";
import { useFilters } from "../store/useFilters";
import { applyFilters } from "../lib/selectors";
import { useWindowedItems } from "../lib/useWindowedItems";
import { Avatar, TypeBadge } from "../components/common";
import { lastPathSegment } from "../lib/format";
import FilterBar from "../components/FilterBar";
import type { WorkItem } from "../types";

// Orden sugerido de columnas típicas de un board
const COLUMN_ORDER = ["New", "Approved", "Committed", "To Do", "Doing", "In Progress", "Active", "Done", "Resolved", "Closed"];

function groupKey(item: WorkItem, groupBy: string): string {
  if (groupBy === "boardColumn") return item.boardColumn || item.state || "Sin estado";
  if (groupBy === "state") return item.state || "Sin estado";
  if (groupBy === "assignedTo") return item.assignedTo || "Sin asignar";
  return "—";
}

function sortColumns(keys: string[]): string[] {
  return keys.sort((a, b) => {
    const ia = COLUMN_ORDER.indexOf(a);
    const ib = COLUMN_ORDER.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b);
  });
}

export default function Board() {
  const itemsMap = useStore((s) => s.items);
  const windowed = useWindowedItems();
  const filters = useFilters();

  const columns = useMemo(() => {
    const items = applyFilters(windowed, filters);
    const groups = new Map<string, WorkItem[]>();
    for (const it of items) {
      const k = groupKey(it, filters.groupBy);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(it);
    }
    for (const arr of groups.values()) {
      arr.sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99) || a.id - b.id);
    }
    return sortColumns([...groups.keys()]).map((k) => ({ key: k, items: groups.get(k)! }));
  }, [windowed, filters]);

  const total = useMemo(() => Object.keys(itemsMap).length, [itemsMap]);

  return (
    <div className="flex flex-col h-full">
      <FilterBar showGroupBy />
      {columns.length === 0 ? (
        <Empty total={total} />
      ) : (
        <div className="flex-1 overflow-x-auto overflow-y-hidden">
          <div className="flex gap-3 p-4 h-full">
            {columns.map((col) => (
              <Column key={col.key} title={col.key} items={col.items} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Column({ title, items }: { title: string; items: WorkItem[] }) {
  const points = items.reduce((s, it) => s + (it.storyPoints ?? 0), 0);
  return (
    <div className="flex flex-col w-72 shrink-0 bg-slate-900/50 rounded-xl border border-slate-800 h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800">
        <span className="font-semibold text-sm text-slate-200 truncate">{title}</span>
        <span className="text-xs text-slate-500 shrink-0 ml-2">
          {items.length}
          {points > 0 && ` · ${points} pts`}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {items.map((it) => (
          <Card key={it.id} item={it} />
        ))}
      </div>
    </div>
  );
}

function Card({ item }: { item: WorkItem }) {
  return (
    <div className="bg-slate-800/80 hover:bg-slate-800 rounded-lg p-2.5 border border-slate-700/60 transition-colors">
      <div className="flex items-center gap-2 mb-1.5">
        <TypeBadge type={item.type} />
        <span className="text-xs text-slate-500">#{item.id}</span>
        {item.storyPoints != null && (
          <span className="ml-auto text-xs font-semibold text-slate-400 bg-slate-700/60 rounded px-1.5">
            {item.storyPoints}
          </span>
        )}
      </div>
      <p className="text-sm text-slate-100 leading-snug line-clamp-3">{item.title}</p>
      <div className="flex items-center gap-2 mt-2">
        <Avatar name={item.assignedTo} size={22} />
        <span className="text-xs text-slate-400 truncate">{item.assignedTo ?? "Sin asignar"}</span>
        {item.iterationPath && (
          <span className="ml-auto text-[10px] text-slate-500 truncate max-w-24">
            {lastPathSegment(item.iterationPath)}
          </span>
        )}
      </div>
      {item.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {item.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="text-[10px] text-slate-400 bg-slate-700/50 rounded px-1.5 py-0.5">
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Empty({ total }: { total: number }) {
  return (
    <div className="flex-1 flex items-center justify-center text-center text-slate-500">
      <div>
        <p className="text-lg">No hay items para mostrar</p>
        <p className="text-sm mt-1">
          {total === 0
            ? "Esperando la primera sincronización…"
            : "Probá ajustar o limpiar los filtros."}
        </p>
      </div>
    </div>
  );
}
