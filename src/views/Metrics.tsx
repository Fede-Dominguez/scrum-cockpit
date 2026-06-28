import { useMemo, useState } from "react";
import { useFilters } from "../store/useFilters";
import { applyFilters } from "../lib/selectors";
import { useWindowedItems } from "../lib/useWindowedItems";
import { Avatar, TypeBadge } from "../components/common";
import FilterBar from "../components/FilterBar";
import { countBy, isDone, isPending, isUserStory, isWip, sumPoints } from "../lib/workItemStatus";
import type { WorkItem } from "../types";

export default function Metrics() {
  const windowed = useWindowedItems();
  const filters = useFilters();

  const items = useMemo(() => applyFilters(windowed, filters), [windowed, filters]);

  const stats = useMemo(() => {
    // El avance del sprint se mide sólo sobre US: los bugs no llevan puntos ni
    // cuentan para el % de completamiento.
    const us = items.filter(isUserStory);
    const doneItems = us.filter(isDone);
    const wipItems = us.filter(isWip);
    const pendingItems = us.filter(isPending);

    const totalPoints = sumPoints(us);
    const donePoints = sumPoints(doneItems);
    const wipPoints = sumPoints(wipItems);
    const pendingPoints = sumPoints(pendingItems);

    const byType = countBy(items, (it) => it.type);
    const byState = countBy(items, (it) => it.state || "Sin estado");
    const byPerson = countBy(items, (it) => it.assignedTo || "Sin asignar");

    return {
      total: items.length,
      usTotal: us.length,
      doneItems,
      wipItems,
      pendingItems,
      totalPoints,
      donePoints,
      wipPoints,
      pendingPoints,
      byType,
      byState,
      byPerson,
    };
  }, [items]);

  const personRows = useMemo(
    () => [...stats.byPerson.entries()].sort((a, b) => b[1] - a[1]),
    [stats],
  );
  const stateRows = useMemo(() => [...stats.byState.entries()].sort((a, b) => b[1] - a[1]), [stats]);
  const maxPerson = personRows[0]?.[1] ?? 1;
  const maxState = stateRows[0]?.[1] ?? 1;

  const completionPct = stats.usTotal
    ? Math.round((stats.doneItems.length / stats.usTotal) * 100)
    : 0;
  const pointsPct = stats.totalPoints
    ? Math.round((stats.donePoints / stats.totalPoints) * 100)
    : 0;

  return (
    <div className="flex flex-col h-full">
      <FilterBar />
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-5xl mx-auto space-y-4">
          {/* Tarjetas resumen — las de items son desplegables */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Total items" value={`${stats.total} · ${stats.usTotal} US`} />
            <ExpandableStatCard
              label="US en curso (WIP)"
              value={`${stats.wipItems.length} · ${stats.wipPoints} pts`}
              accent="text-amber-300"
              items={stats.wipItems}
            />
            <ExpandableStatCard
              label="US terminadas"
              value={`${stats.doneItems.length} (${completionPct}%)`}
              accent="text-emerald-300"
              items={stats.doneItems}
            />
            <ExpandableStatCard
              label="US pendientes"
              value={`${stats.pendingItems.length} · faltan ${stats.pendingPoints} pts`}
              accent="text-rose-300"
              items={stats.pendingItems}
            />
          </div>

          {/* Progreso */}
          <Panel title="Progreso del trabajo">
            <ProgressBar label="US completadas" pct={completionPct} color="bg-emerald-500" />
            <ProgressBar
              label={`Story points completados (${stats.donePoints}/${stats.totalPoints})`}
              pct={pointsPct}
              color="bg-sky-500"
            />
          </Panel>

          <div className="grid md:grid-cols-2 gap-4">
            {/* Por persona */}
            <Panel title="Carga por persona">
              {personRows.length === 0 ? (
                <Empty />
              ) : (
                <div className="space-y-2">
                  {personRows.map(([name, count]) => (
                    <div key={name} className="flex items-center gap-2">
                      <Avatar name={name === "Sin asignar" ? undefined : name} size={24} />
                      <span className="text-sm text-slate-300 w-32 truncate">{name}</span>
                      <div className="flex-1 bg-slate-800 rounded h-4 overflow-hidden">
                        <div
                          className="bg-sky-500/70 h-full"
                          style={{ width: `${(count / maxPerson) * 100}%` }}
                        />
                      </div>
                      <span className="text-sm text-slate-400 w-6 text-right">{count}</span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            {/* Por estado */}
            <Panel title="Distribución por estado">
              {stateRows.length === 0 ? (
                <Empty />
              ) : (
                <div className="space-y-2">
                  {stateRows.map(([state, count]) => (
                    <div key={state} className="flex items-center gap-2">
                      <span className="text-sm text-slate-300 w-32 truncate">{state}</span>
                      <div className="flex-1 bg-slate-800 rounded h-4 overflow-hidden">
                        <div
                          className="bg-violet-500/70 h-full"
                          style={{ width: `${(count / maxState) * 100}%` }}
                        />
                      </div>
                      <span className="text-sm text-slate-400 w-6 text-right">{count}</span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>

          {/* Por tipo */}
          <Panel title="Por tipo de item">
            <div className="flex flex-wrap gap-4">
              {[...stats.byType.entries()].map(([type, count]) => (
                <div key={type} className="flex items-center gap-2">
                  <TypeBadge type={type} />
                  <span className="text-2xl font-bold text-slate-100">{count}</span>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent = "text-slate-100",
}: {
  label: string;
  value: string | number;
  accent?: string;
}) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${accent}`}>{value}</p>
    </div>
  );
}

/** Tarjeta que al tocarla despliega la lista de items (#id · título). */
function ExpandableStatCard({
  label,
  value,
  accent = "text-slate-100",
  items,
}: {
  label: string;
  value: string | number;
  accent?: string;
  items: WorkItem[];
}) {
  const [open, setOpen] = useState(false);
  const disabled = items.length === 0;
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl">
      <button
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        className="w-full text-left p-4 disabled:cursor-default"
      >
        <p className="text-xs text-slate-500 flex items-center justify-between">
          {label}
          {!disabled && <span className="text-slate-600">{open ? "▾" : "▸"}</span>}
        </p>
        <p className={`text-2xl font-bold mt-1 ${accent}`}>{value}</p>
      </button>
      {open && (
        <div className="border-t border-slate-800 max-h-60 overflow-y-auto px-3 py-2 space-y-1">
          {[...items]
            .sort((a, b) => (b.storyPoints ?? 0) - (a.storyPoints ?? 0))
            .map((it) => (
              <ItemRow key={it.id} item={it} />
            ))}
        </div>
      )}
    </div>
  );
}

export function ItemRow({ item }: { item: WorkItem }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <TypeBadge type={item.type} />
      <span className="text-slate-500 tabular-nums">{item.id}</span>
      <span className="text-slate-300 truncate flex-1" title={item.title}>
        {item.title}
      </span>
      {item.storyPoints != null && (
        <span className="text-xs text-slate-500 shrink-0">{item.storyPoints} pts</span>
      )}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-slate-300 mb-3">{title}</h3>
      {children}
    </div>
  );
}

function ProgressBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div className="mb-3 last:mb-0">
      <div className="flex justify-between text-xs text-slate-400 mb-1">
        <span>{label}</span>
        <span>{pct}%</span>
      </div>
      <div className="bg-slate-800 rounded-full h-2.5 overflow-hidden">
        <div className={`${color} h-full rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Empty() {
  return <p className="text-sm text-slate-500">Sin datos.</p>;
}
