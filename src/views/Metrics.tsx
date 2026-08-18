import { useMemo, useState } from "react";
import { useFilters } from "../store/useFilters";
import { applyFilters } from "../lib/selectors";
import { useSizePoints, useWindowedItems } from "../lib/useWindowedItems";
import { Avatar, TypeBadge } from "../components/common";
import ProjectBadge from "../components/ProjectBadge";
import FilterBar from "../components/FilterBar";
import {
  commitmentLevel,
  commitmentRank,
  countBy,
  isDone,
  isPending,
  isUserStory,
  isWip,
  sumPoints,
} from "../lib/workItemStatus";
import { itemPoints, pointsSource } from "../lib/points";
import type { SizePoints, WorkItem } from "../types";

/** Las tres cubetas de avance que se muestran en toda la pestaña. */
type Bucket = "wip" | "done" | "pending";

const BUCKETS: { id: Bucket; label: string; accent: string; bar: string }[] = [
  { id: "wip", label: "En curso", accent: "text-amber-300", bar: "bg-amber-500/70" },
  { id: "done", label: "Terminadas", accent: "text-emerald-300", bar: "bg-emerald-500/70" },
  { id: "pending", label: "Pendientes", accent: "text-rose-300", bar: "bg-rose-500/70" },
];

const bucketOf = (it: WorkItem): Bucket => (isDone(it) ? "done" : isWip(it) ? "wip" : "pending");

interface Cell {
  items: WorkItem[];
  points: number;
}

const emptyCell = (): Cell => ({ items: [], points: 0 });

interface CommitmentRow {
  level: string;
  total: Cell;
  wip: Cell;
  done: Cell;
  pending: Cell;
}

/**
 * Agrupa las US por nivel de compromiso y, dentro de cada nivel, por avance.
 * Es lo que responde "¿cuántos puntos de Mandatorio me faltan?".
 */
function buildCommitmentRows(us: WorkItem[], sizePoints: SizePoints): CommitmentRow[] {
  const rows = new Map<string, CommitmentRow>();
  for (const it of us) {
    const level = commitmentLevel(it.commitment);
    let row = rows.get(level);
    if (!row) {
      row = {
        level,
        total: emptyCell(),
        wip: emptyCell(),
        done: emptyCell(),
        pending: emptyCell(),
      };
      rows.set(level, row);
    }
    const pts = itemPoints(it, sizePoints);
    const cell = row[bucketOf(it)];
    cell.items.push(it);
    cell.points += pts;
    row.total.items.push(it);
    row.total.points += pts;
  }
  const round = (c: Cell) => {
    c.points = Math.round(c.points * 100) / 100;
  };
  const list = [...rows.values()];
  for (const r of list) {
    round(r.total);
    round(r.wip);
    round(r.done);
    round(r.pending);
  }
  return list.sort(
    (a, b) => commitmentRank(a.level) - commitmentRank(b.level) || a.level.localeCompare(b.level),
  );
}

export default function Metrics() {
  const windowed = useWindowedItems();
  const filters = useFilters();
  const sizePoints = useSizePoints();

  const items = useMemo(() => applyFilters(windowed, filters), [windowed, filters]);

  const stats = useMemo(() => {
    // El avance del sprint se mide sólo sobre US: los bugs no llevan puntos ni
    // cuentan para el % de completamiento.
    const us = items.filter(isUserStory);
    const doneItems = us.filter(isDone);
    const wipItems = us.filter(isWip);
    const pendingItems = us.filter(isPending);

    return {
      total: items.length,
      us,
      usTotal: us.length,
      doneItems,
      wipItems,
      pendingItems,
      totalPoints: sumPoints(us, sizePoints),
      donePoints: sumPoints(doneItems, sizePoints),
      wipPoints: sumPoints(wipItems, sizePoints),
      pendingPoints: sumPoints(pendingItems, sizePoints),
      byType: countBy(items, (it) => it.type),
      byState: countBy(items, (it) => it.state || "Sin estado"),
      byPerson: countBy(items, (it) => it.assignedTo || "Sin asignar"),
      // Cuántas US aportan puntos vía el campo "Estimación" (talle) por no tener
      // Story Points. Se muestra para que el número no parezca salido de la nada.
      fromSize: us.filter((it) => pointsSource(it, sizePoints) === "sizeEstimate"),
    };
  }, [items, sizePoints]);

  const commitmentRows = useMemo(
    () => buildCommitmentRows(stats.us, sizePoints),
    [stats.us, sizePoints],
  );

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

  const sizePointsSum = useMemo(
    () => sumPoints(stats.fromSize, sizePoints),
    [stats.fromSize, sizePoints],
  );

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
              label={`Puntos completados (${stats.donePoints}/${stats.totalPoints})`}
              pct={pointsPct}
              color="bg-sky-500"
            />
            {stats.fromSize.length > 0 && (
              <p className="text-xs text-slate-500 mt-2">
                {stats.fromSize.length} US sin Story Points aportan {sizePointsSum} pts vía el
                campo <span className="text-slate-400">Estimación</span> (talle). Nunca se cuenta
                un item por los dos campos.
              </p>
            )}
          </Panel>

          <CommitmentPanel rows={commitmentRows} />

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

/**
 * Matriz compromiso × avance. Cada celda se puede abrir para ver las US que la
 * componen, y el nivel se puede fijar como filtro de toda la pestaña.
 */
function CommitmentPanel({ rows }: { rows: CommitmentRow[] }) {
  const selected = useFilters((s) => s.commitments);
  const setCommitments = useFilters((s) => s.setCommitments);
  const [openCell, setOpenCell] = useState<string | null>(null);

  const toggleLevel = (level: string) => {
    setCommitments(
      selected.includes(level) ? selected.filter((l) => l !== level) : [...selected, level],
    );
  };

  const openItems = useMemo(() => {
    if (!openCell) return null;
    const [level, bucket] = openCell.split("|");
    const row = rows.find((r) => r.level === level);
    if (!row) return null;
    const cell = bucket === "total" ? row.total : row[bucket as Bucket];
    return { title: `${level} · ${bucketLabel(bucket)}`, items: cell.items };
  }, [openCell, rows]);

  return (
    <Panel title="Por nivel de compromiso">
      {rows.length === 0 ? (
        <Empty />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-xs text-slate-500">
                  <th className="text-left font-medium py-1 pr-2">Compromiso</th>
                  <th className="text-right font-medium py-1 px-2">Total</th>
                  {BUCKETS.map((b) => (
                    <th key={b.id} className="text-right font-medium py-1 px-2">
                      {b.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const active = selected.includes(row.level);
                  return (
                    <tr key={row.level} className="border-t border-slate-800">
                      <td className="py-1.5 pr-2">
                        <button
                          onClick={() => toggleLevel(row.level)}
                          className={`text-left truncate max-w-40 ${
                            active ? "text-sky-300 font-semibold" : "text-slate-300 hover:text-slate-100"
                          }`}
                          title="Filtrar toda la pestaña por este nivel"
                        >
                          {active && "✓ "}
                          {row.level}
                        </button>
                      </td>
                      <CellButton
                        cell={row.total}
                        accent="text-slate-100"
                        onClick={() => setOpenCell(toggleKey(openCell, `${row.level}|total`))}
                      />
                      {BUCKETS.map((b) => (
                        <CellButton
                          key={b.id}
                          cell={row[b.id]}
                          accent={b.accent}
                          onClick={() => setOpenCell(toggleKey(openCell, `${row.level}|${b.id}`))}
                        />
                      ))}
                    </tr>
                  );
                })}
                <tr className="border-t border-slate-700 text-slate-400">
                  <td className="py-1.5 pr-2 text-xs">Total</td>
                  <TotalCell cells={rows.map((r) => r.total)} />
                  {BUCKETS.map((b) => (
                    <TotalCell key={b.id} cells={rows.map((r) => r[b.id])} />
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          {openItems && (
            <div className="mt-3 border-t border-slate-800 pt-2">
              <p className="text-xs text-slate-500 mb-1">{openItems.title}</p>
              <div className="max-h-60 overflow-y-auto space-y-1">
                {openItems.items.length === 0 ? (
                  <Empty />
                ) : (
                  [...openItems.items]
                    .sort((a, b) => (b.storyPoints ?? 0) - (a.storyPoints ?? 0))
                    .map((it) => <ItemRow key={`${it.projectId}#${it.id}`} item={it} />)
                )}
              </div>
            </div>
          )}

          <p className="text-xs text-slate-600 mt-2">
            Tocá un número para ver las US; tocá el nivel para filtrar toda la pestaña.
          </p>
        </>
      )}
    </Panel>
  );
}

const toggleKey = (current: string | null, next: string) => (current === next ? null : next);

function bucketLabel(bucket: string): string {
  return BUCKETS.find((b) => b.id === bucket)?.label ?? "Total";
}

function CellButton({
  cell,
  accent,
  onClick,
}: {
  cell: Cell;
  accent: string;
  onClick: () => void;
}) {
  const empty = cell.items.length === 0;
  return (
    <td className="py-1.5 px-2 text-right tabular-nums">
      <button
        onClick={onClick}
        disabled={empty}
        className={`${empty ? "text-slate-600 cursor-default" : `${accent} hover:underline`}`}
      >
        {cell.items.length} US
        <span className="text-slate-500"> · </span>
        {cell.points} pts
      </button>
    </td>
  );
}

function TotalCell({ cells }: { cells: Cell[] }) {
  const count = cells.reduce((s, c) => s + c.items.length, 0);
  const pts = Math.round(cells.reduce((s, c) => s + c.points, 0) * 100) / 100;
  return (
    <td className="py-1.5 px-2 text-right tabular-nums text-xs">
      {count} US · {pts} pts
    </td>
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
              <ItemRow key={`${it.projectId}#${it.id}`} item={it} />
            ))}
        </div>
      )}
    </div>
  );
}

export function ItemRow({ item }: { item: WorkItem }) {
  const sizePoints = useSizePoints();
  const pts = itemPoints(item, sizePoints);
  const fromSize = pointsSource(item, sizePoints) === "sizeEstimate";
  return (
    <div className="flex items-center gap-2 text-sm">
      <ProjectBadge projectId={item.projectId} />
      <TypeBadge type={item.type} />
      <span className="text-slate-500 tabular-nums">{item.id}</span>
      <span className="text-slate-300 truncate flex-1" title={item.title}>
        {item.title}
      </span>
      {pts > 0 && (
        <span
          className="text-xs text-slate-500 shrink-0"
          title={fromSize ? `Estimación: ${item.sizeEstimate}` : "Story Points"}
        >
          {pts} pts{fromSize ? "*" : ""}
        </span>
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
