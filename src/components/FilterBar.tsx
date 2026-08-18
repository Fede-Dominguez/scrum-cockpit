import { useMemo } from "react";
import { UNASSIGNED, useFilters } from "../store/useFilters";
import { uniqueAssignees, uniqueIterations } from "../lib/selectors";
import { useWindowedItems } from "../lib/useWindowedItems";
import { uniqueCommitments } from "../lib/workItemStatus";
import { TRACKED_TYPES } from "../lib/azureDevOps";
import MultiSelect from "./MultiSelect";

export default function FilterBar({ showGroupBy = false }: { showGroupBy?: boolean }) {
  const items = useWindowedItems();
  const {
    search,
    type,
    assignee,
    iterations: selectedIterations,
    commitments: selectedCommitments,
    dateFrom,
    dateTo,
    groupBy,
  } = useFilters();
  const {
    setSearch,
    setType,
    setAssignee,
    setIterations,
    setCommitments,
    setDateFrom,
    setDateTo,
    setGroupBy,
    reset,
  } = useFilters();

  const assignees = useMemo(() => uniqueAssignees(items), [items]);
  const iterationOptions = useMemo(() => uniqueIterations(items), [items]);
  const commitmentOptions = useMemo(() => uniqueCommitments(items), [items]);

  const hasFilters =
    search ||
    type ||
    assignee ||
    selectedIterations.length ||
    selectedCommitments.length ||
    dateFrom ||
    dateTo;

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-slate-800 bg-slate-900/60">
      <input
        className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-100 placeholder-slate-500 w-56 outline-none focus:border-sky-500"
        placeholder="Buscar por id, título, persona…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <Select value={type ?? ""} onChange={(v) => setType(v || null)}>
        <option value="">Todos los tipos</option>
        {TRACKED_TYPES.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </Select>

      <Select value={assignee ?? ""} onChange={(v) => setAssignee(v || null)}>
        <option value="">Todas las personas</option>
        <option value={UNASSIGNED}>Sin asignar</option>
        {assignees.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </Select>

      <MultiSelect
        label="Sprint"
        options={iterationOptions}
        selected={selectedIterations}
        onChange={setIterations}
      />

      <MultiSelect
        label="Compromiso"
        options={commitmentOptions}
        selected={selectedCommitments}
        onChange={setCommitments}
      />

      <div className="flex items-center gap-1" title="Filtra por última actividad (ChangedDate)">
        <span className="text-xs text-slate-500">Actividad</span>
        <DateInput value={dateFrom ?? ""} onChange={(v) => setDateFrom(v || null)} />
        <span className="text-xs text-slate-500">→</span>
        <DateInput value={dateTo ?? ""} onChange={(v) => setDateTo(v || null)} />
      </div>

      {showGroupBy && (
        <div className="flex items-center gap-1 ml-auto">
          <span className="text-xs text-slate-500">Agrupar:</span>
          <Select value={groupBy} onChange={(v) => setGroupBy(v as never)}>
            <option value="boardColumn">Columna</option>
            <option value="state">Estado</option>
            <option value="assignedTo">Persona</option>
          </Select>
        </div>
      )}

      {hasFilters && (
        <button
          onClick={reset}
          className={`text-xs text-slate-400 hover:text-slate-200 ${showGroupBy ? "" : "ml-auto"}`}
        >
          Limpiar filtros
        </button>
      )}
    </div>
  );
}

function DateInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="date"
      className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-sky-500 [color-scheme:dark]"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function Select({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-sky-500"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {children}
    </select>
  );
}
