import type { WorkItem } from "../types";
import { UNASSIGNED } from "../store/useFilters";
import { lastPathSegment } from "./format";
import { commitmentLevel } from "./workItemStatus";

export interface FilterValues {
  search: string;
  type: string | null;
  assignee: string | null;
  /**
   * Sprints seleccionados por NOMBRE (último segmento del iterationPath), no
   * por path completo: con varios proyectos abiertos el mismo sprint (ej
   * "5.26.05") vive en paths distintos y el usuario espera filtrar los dos.
   * Vacío = todos.
   */
  iterations?: string[];
  /** Niveles de compromiso seleccionados (Mandatorio / Comprometido / …); vacío = todos */
  commitments?: string[];
  dateFrom?: string | null; // "YYYY-MM-DD" — filtra por changedDate (última actividad)
  dateTo?: string | null; // "YYYY-MM-DD"
}

/** Nombre de sprint de un item (lo que se muestra y por lo que se filtra). */
export const sprintName = (it: WorkItem): string => lastPathSegment(it.iterationPath);

export function applyFilters(items: WorkItem[], f: FilterValues): WorkItem[] {
  const q = f.search.trim().toLowerCase();
  const iterationSet = f.iterations && f.iterations.length ? new Set(f.iterations) : null;
  const commitmentSet = f.commitments && f.commitments.length ? new Set(f.commitments) : null;
  return items.filter((it) => {
    if (f.type && it.type !== f.type) return false;
    if (iterationSet && !iterationSet.has(sprintName(it))) return false;
    if (commitmentSet && !commitmentSet.has(commitmentLevel(it.commitment))) return false;
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

/**
 * Nombres de sprint presentes en los items, del más nuevo al más viejo.
 * Se ordena descendente porque los sprints se nombran por versión ("5.26.05").
 */
export function uniqueIterations(items: WorkItem[]): string[] {
  const set = new Set<string>();
  for (const it of items) {
    const name = sprintName(it);
    if (name) set.add(name);
  }
  return [...set].sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
}
