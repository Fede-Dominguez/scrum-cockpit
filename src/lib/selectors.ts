import type { WorkItem } from "../types";
import { UNASSIGNED } from "../store/useFilters";

export interface FilterValues {
  search: string;
  type: string | null;
  assignee: string | null;
  iterations?: string[]; // iterationPaths seleccionados (multiselección); vacío = todos
  dateFrom?: string | null; // "YYYY-MM-DD" — filtra por changedDate (última actividad)
  dateTo?: string | null; // "YYYY-MM-DD"
}

export function applyFilters(items: WorkItem[], f: FilterValues): WorkItem[] {
  const q = f.search.trim().toLowerCase();
  const iterationSet = f.iterations && f.iterations.length ? new Set(f.iterations) : null;
  return items.filter((it) => {
    if (f.type && it.type !== f.type) return false;
    if (iterationSet && (!it.iterationPath || !iterationSet.has(it.iterationPath))) return false;
    if (f.dateFrom || f.dateTo) {
      const day = (it.changedDate ?? "").slice(0, 10); // YYYY-MM-DD
      if (f.dateFrom && day < f.dateFrom) return false;
      if (f.dateTo && day > f.dateTo) return false;
    }
    if (f.assignee) {
      if (f.assignee === UNASSIGNED) {
        if (it.assignedTo) return false;
      } else if (it.assignedTo !== f.assignee) {
        return false;
      }
    }
    if (q) {
      const haystack =
        `${it.id} ${it.title} ${it.assignedTo ?? ""} ${it.createdBy ?? ""} ${it.tags.join(" ")}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

/** Lista ordenada de asignados presentes en los items */
export function uniqueAssignees(items: WorkItem[]): string[] {
  const set = new Set<string>();
  for (const it of items) if (it.assignedTo) set.add(it.assignedTo);
  return [...set].sort((a, b) => a.localeCompare(b));
}

/** Lista de iteraciones presentes en los items (paths) */
export function uniqueIterations(items: WorkItem[]): string[] {
  const set = new Set<string>();
  for (const it of items) if (it.iterationPath) set.add(it.iterationPath);
  return [...set].sort((a, b) => a.localeCompare(b));
}
