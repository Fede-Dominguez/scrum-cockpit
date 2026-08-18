// Cálculo de puntos de un work item.
//
// Regla única (evita el doble conteo): un item aporta SUS Story Points si los
// tiene; si el campo está vacío, se cae al campo custom "Estimación" (talle
// XS/S/M/L/XL) convertido con la tabla configurable. Nunca se suman ambos.
import { DEFAULT_SIZE_POINTS, type SizePoints, type WorkItem } from "../types";

/** Normaliza un talle para buscarlo en la tabla: sin espacios y en mayúscula. */
export function normalizeSize(raw: string): string {
  return raw.trim().toUpperCase();
}

/**
 * Puntos que aporta el talle según la tabla. Acepta que el valor del campo
 * venga como "M", "m", " M " o incluso "M - Mediano" (toma el primer token).
 */
export function sizeToPoints(raw: string | undefined, table: SizePoints): number | null {
  if (!raw) return null;
  const key = normalizeSize(raw);
  if (key in table) return table[key];
  // Algunos proyectos guardan el talle con descripción: "M - Mediano".
  const first = normalizeSize(key.split(/[\s\-–—/|:]+/)[0] ?? "");
  if (first && first in table) return table[first];
  // O directamente un número en el campo de estimación.
  const n = Number(key.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** De dónde salieron los puntos de un item (para poder mostrarlo en la UI). */
export type PointsSource = "storyPoints" | "sizeEstimate" | "none";

export function pointsSource(it: WorkItem, table: SizePoints = DEFAULT_SIZE_POINTS): PointsSource {
  if (typeof it.storyPoints === "number" && Number.isFinite(it.storyPoints)) return "storyPoints";
  if (sizeToPoints(it.sizeEstimate, table) != null) return "sizeEstimate";
  return "none";
}

/** Puntos de un item: Story Points, y si no hay, el talle de Estimación. */
export function itemPoints(it: WorkItem, table: SizePoints = DEFAULT_SIZE_POINTS): number {
  if (typeof it.storyPoints === "number" && Number.isFinite(it.storyPoints)) return it.storyPoints;
  return sizeToPoints(it.sizeEstimate, table) ?? 0;
}

export function sumItemPoints(items: WorkItem[], table: SizePoints = DEFAULT_SIZE_POINTS): number {
  // Redondeamos a 2 decimales: los talles pueden dar sumas con coma.
  const total = items.reduce((s, it) => s + itemPoints(it, table), 0);
  return Math.round(total * 100) / 100;
}

/** Parsea la tabla talle→puntos que viene del store, con fallback al default. */
export function safeSizePoints(table: SizePoints | undefined): SizePoints {
  if (!table || Object.keys(table).length === 0) return { ...DEFAULT_SIZE_POINTS };
  const out: SizePoints = {};
  for (const [k, v] of Object.entries(table)) {
    const n = Number(v);
    if (k.trim() && Number.isFinite(n)) out[normalizeSize(k)] = n;
  }
  return Object.keys(out).length ? out : { ...DEFAULT_SIZE_POINTS };
}
