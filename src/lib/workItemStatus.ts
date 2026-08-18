// Heurísticas compartidas de estado de un work item (terminado / en curso) y
// helpers de agregación usados por Métricas, Evolutivo y QA.
// Match case-insensitive porque los estados de ADO varían en mayúsculas/espacios.
import { DEFAULT_SIZE_POINTS, type SizePoints, type WorkItem } from "../types";
import { itemPoints, sumItemPoints } from "./points";

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
export const isTestCase = (it: WorkItem) => (it.type ?? "").toLowerCase() === "test case";
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
/** Estado Closed exacto: es el único en el que ADO completa "Closed By". */
export const isClosed = (it: WorkItem) => (it.state ?? "").toLowerCase() === "closed";

/** Puntos del item: Story Points, y si está vacío, el talle de Estimación. */
export const points = (it: WorkItem, table: SizePoints = DEFAULT_SIZE_POINTS) =>
  itemPoints(it, table);
export const sumPoints = (items: WorkItem[], table: SizePoints = DEFAULT_SIZE_POINTS) =>
  sumItemPoints(items, table);

// ---------------------------------------------------------------------------
// Compromiso (campo custom "Compromiso")
// ---------------------------------------------------------------------------

export const NO_COMMITMENT = "Sin compromiso";

/** Niveles canónicos, en el orden en que se muestran. */
export const COMMITMENT_LEVELS = ["Mandatorio", "Comprometido", "Deseable"] as const;

/** Quita acentos y pasa a minúscula, para comparar valores de campo/tag. */
export function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

/**
 * Lleva el valor crudo del campo a uno de los niveles canónicos. Los proyectos
 * escriben "mandatorio", "MANDATORIO", "Comprometido " … y a veces con
 * prefijos ("1 - Mandatorio"), así que matcheamos por contenido normalizado.
 */
export function commitmentLevel(raw: string | undefined): string {
  const v = normalizeText(raw ?? "");
  if (!v) return NO_COMMITMENT;
  for (const level of COMMITMENT_LEVELS) {
    if (v.includes(normalizeText(level))) return level;
  }
  // Valor desconocido: lo mostramos tal cual en vez de esconderlo.
  return (raw ?? "").trim() || NO_COMMITMENT;
}

/** Orden de presentación: los canónicos primero, el resto al final. */
export function commitmentRank(level: string): number {
  const i = (COMMITMENT_LEVELS as readonly string[]).indexOf(level);
  if (i !== -1) return i;
  return level === NO_COMMITMENT ? COMMITMENT_LEVELS.length + 1 : COMMITMENT_LEVELS.length;
}

/** Niveles de compromiso presentes en los items, ya ordenados. */
export function uniqueCommitments(items: WorkItem[]): string[] {
  const set = new Set<string>();
  for (const it of items) set.add(commitmentLevel(it.commitment));
  return [...set].sort((a, b) => commitmentRank(a) - commitmentRank(b) || a.localeCompare(b));
}

/** `true` si el item tiene ese tag (ignora acentos y mayúsculas). */
export function hasTag(it: WorkItem, tag: string): boolean {
  const needle = normalizeText(tag);
  if (!needle) return false;
  return it.tags.some((t) => normalizeText(t) === needle);
}

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
