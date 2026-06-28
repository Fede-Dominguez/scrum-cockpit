// Cálculo de Lead/Cycle Time a partir del historial de estados de un work item.
// El historial se trae on-demand (1 request por item, cacheado en sesión) porque
// es pesado y sólo hace falta cuando se abre el panel de Lead Time del Evolutivo.
import { getWorkItemUpdates, type WorkItemUpdate } from "./azureDevOps";
import type { AzureConfig, WorkItem } from "../types";

/** Estado inicial especial: la creación del item (usa System.CreatedDate). */
export const CREATED_SENTINEL = "__created__";
export const CREATED_LABEL = "Creación";

export interface StateChange {
  state: string;
  date: string; // ISO
}

const eqState = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Línea de tiempo de transiciones de estado (de la más vieja a la más nueva). */
export function stateTimeline(updates: WorkItemUpdate[]): StateChange[] {
  const out: StateChange[] = [];
  for (const u of updates) {
    const nv = u.fields?.["System.State"]?.newValue;
    if (typeof nv !== "string") continue;
    // OJO: `revisedDate` de la última revisión (la vigente) viene como
    // "9999-01-01" en ADO, lo que reventaba el cálculo (millones de días). La
    // fecha real del cambio es el nuevo valor de System.ChangedDate de esa
    // revisión; caemos a revisedDate sólo si no estuviera.
    const changed = u.fields?.["System.ChangedDate"]?.newValue;
    const date = typeof changed === "string" ? changed : u.revisedDate;
    if (!date) continue;
    const t = new Date(date).getTime();
    // Descartar fechas centinela/absurdas (año 9999) por las dudas.
    if (Number.isNaN(t) || new Date(date).getUTCFullYear() > 9000) continue;
    out.push({ state: nv, date });
  }
  return out.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

/** Primer instante (ms) en que el item entró a `state`, o null si nunca. */
function firstEntryMs(timeline: StateChange[], state: string): number | null {
  for (const c of timeline) {
    if (eqState(c.state, state)) {
      const t = new Date(c.date).getTime();
      if (!Number.isNaN(t)) return t;
    }
  }
  return null;
}

/**
 * Días entre que el item entró a `fromState` (o su creación) y la primera vez
 * que alcanzó CUALQUIERA de los `toStates` después de ese momento. null si no
 * aplica (nunca pasó por el inicial, o ninguno de los finales lo siguió).
 */
export function leadTimeDays(
  timeline: StateChange[],
  createdDate: string,
  fromState: string,
  toStates: string[],
): number | null {
  if (toStates.length === 0) return null;
  const startMs =
    fromState === CREATED_SENTINEL ? new Date(createdDate).getTime() : firstEntryMs(timeline, fromState);
  if (startMs == null || Number.isNaN(startMs)) return null;

  let endMs: number | null = null;
  for (const c of timeline) {
    if (!toStates.some((ts) => eqState(c.state, ts))) continue;
    const t = new Date(c.date).getTime();
    if (!Number.isNaN(t) && t >= startMs) {
      endMs = t;
      break;
    }
  }
  if (endMs == null) return null;
  return (endMs - startMs) / 86400000;
}

const timelineCache = new Map<number, StateChange[]>();

/**
 * Trae (secuencialmente, con caché de sesión) la línea de tiempo de estados de
 * cada item. `onProgress(done, total)` permite mostrar avance en la UI.
 */
export async function fetchTimelines(
  cfg: AzureConfig,
  items: WorkItem[],
  onProgress?: (done: number, total: number) => void,
): Promise<Map<number, StateChange[]>> {
  const result = new Map<number, StateChange[]>();
  let done = 0;
  for (const it of items) {
    let timeline = timelineCache.get(it.id);
    if (!timeline) {
      try {
        timeline = stateTimeline(await getWorkItemUpdates(cfg, it.id));
      } catch {
        timeline = [];
      }
      timelineCache.set(it.id, timeline);
    }
    result.set(it.id, timeline);
    onProgress?.(++done, items.length);
  }
  return result;
}
