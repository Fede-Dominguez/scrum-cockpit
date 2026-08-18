// Estado de los filtros compartidos por Board / Feed / Métricas.
import { create } from "zustand";

export type GroupBy = "boardColumn" | "state" | "assignedTo";

interface FilterState {
  search: string;
  type: string | null; // "User Story" | "Bug" | "Task" | null
  assignee: string | null; // displayName o "__unassigned__"
  iterations: string[]; // nombres de sprint seleccionados (multiselección); vacío = todos
  commitments: string[]; // niveles de compromiso (Mandatorio / Comprometido / …); vacío = todos
  dateFrom: string | null; // "YYYY-MM-DD" — filtra por última actividad (changedDate)
  dateTo: string | null; // "YYYY-MM-DD"
  groupBy: GroupBy;

  setSearch: (v: string) => void;
  setType: (v: string | null) => void;
  setAssignee: (v: string | null) => void;
  setIterations: (v: string[]) => void;
  setCommitments: (v: string[]) => void;
  setDateFrom: (v: string | null) => void;
  setDateTo: (v: string | null) => void;
  setGroupBy: (v: GroupBy) => void;
  reset: () => void;
}

export const UNASSIGNED = "__unassigned__";

export const useFilters = create<FilterState>((set) => ({
  search: "",
  type: null,
  assignee: null,
  iterations: [],
  commitments: [],
  dateFrom: null,
  dateTo: null,
  groupBy: "boardColumn",

  setSearch: (search) => set({ search }),
  setType: (type) => set({ type }),
  setAssignee: (assignee) => set({ assignee }),
  setIterations: (iterations) => set({ iterations }),
  setCommitments: (commitments) => set({ commitments }),
  setDateFrom: (dateFrom) => set({ dateFrom }),
  setDateTo: (dateTo) => set({ dateTo }),
  setGroupBy: (groupBy) => set({ groupBy }),
  reset: () =>
    set({
      search: "",
      type: null,
      assignee: null,
      iterations: [],
      commitments: [],
      dateFrom: null,
      dateTo: null,
    }),
}));
