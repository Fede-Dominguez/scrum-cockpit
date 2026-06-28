// Heurísticas compartidas de estado de un work item (terminado / en curso) y
// helpers de agregación usados por Métricas y Evolutivo.
// Match case-insensitive porque los estados de ADO varían en mayúsculas/espacios.
import type { WorkItem } from "../types";

export const DONE_STATES = new Set(
  [
    "Done",
    "Closed",
    "Resolved",
    "Completed",
    "Ready for test",
    "Merge",
    "To merge",
    "Testing",
  ].map((s) => s.toLowerCase()),
);

export const WIP_STATES = new Set(
  ["Active", "Doing", "In Progress", "Committed", "Resolved"].map((s) => s.toLowerCase()),
);

export const isBug = (it: WorkItem) => (it.type ?? "").toLowerCase() === "bug";
// US = todo lo que aporta puntos al sprint; en la práctica el equipo sólo usa
// "User Story" pero dejamos el match laxo por si aparece "Product Backlog Item".
export const isUserStory = (it: WorkItem) => {
  const t = (it.type ?? "").toLowerCase();
  return t === "user story" || t === "product backlog item";
};

export const isDone = (it: WorkItem) => DONE_STATES.has((it.state ?? "").toLowerCase());
// "En curso" excluye lo que ya cuenta como terminado, así no se duplica.
export const isWip = (it: WorkItem) =>
  WIP_STATES.has((it.state ?? "").toLowerCase()) && !isDone(it);
// "Pendiente": ni terminado ni en curso (típicamente New / To Do / Approved…).
export const isPending = (it: WorkItem) => !isDone(it) && !isWip(it);

export const points = (it: WorkItem) => it.storyPoints ?? 0;
export const sumPoints = (items: WorkItem[]) => items.reduce((s, it) => s + points(it), 0);

/** Etiqueta P1/P2/… a partir de la prioridad numérica */
export const priorityLabel = (p?: number) => (p == null ? "Sin prioridad" : `P${p}`);

/** Cuenta ocurrencias por clave (ignora null/undefined si se pasa skipEmpty) */
export function countBy<T extends string | number>(
  items: WorkItem[],
  key: (it: WorkItem) => T,
): Map<T, number> {
  const m = new Map<T, number>();
  for (const it of items) {
    const k = key(it);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}
