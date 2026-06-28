// Restringe los items a los sprints cuya fecha cae dentro de la ventana
// configurada (config.lookbackDays). Es la diferencia clave con el filtro de
// fetch: ese trae por ChangedDate (un item viejo tocado hace poco arrastra a su
// sprint viejo), mientras que acá descartamos por la FECHA del sprint mismo
// (iteration finishDate/startDate), que es lo que el usuario entiende por
// "traeme sólo los sprints de los últimos N meses".
import { useMemo } from "react";
import { useStore } from "../store/useStore";
import { DEFAULT_LOOKBACK_DAYS, type WorkItem } from "../types";

/** Fin (ms) de cada iteración conocida: finishDate, o startDate si no hay. */
function useIterationEndMap(): Map<string, number | undefined> {
  const iterationDates = useStore((s) => s.iterationDates);
  return useMemo(() => {
    const m = new Map<string, number | undefined>();
    for (const [path, d] of Object.entries(iterationDates)) {
      const end = d.finishDate ?? d.startDate;
      m.set(path, end ? new Date(end).getTime() : undefined);
    }
    return m;
  }, [iterationDates]);
}

/**
 * `true` si el item entra en la ventana de sprints. Criterio: si su sprint es
 * conocido y tiene fecha, su fin debe ser >= cutoff; si el sprint es desconocido
 * (no está en la lista del equipo) o no tiene fecha, lo dejamos pasar para no
 * ocultar items legítimos por datos incompletos.
 */
function inWindow(it: WorkItem, ends: Map<string, number | undefined>, cutoff: number): boolean {
  if (!it.iterationPath || !ends.has(it.iterationPath)) return true;
  const end = ends.get(it.iterationPath);
  return end == null || end >= cutoff;
}

/** Items visibles tras aplicar la ventana de sprints (todas las pestañas la usan). */
export function useWindowedItems(): WorkItem[] {
  const itemsMap = useStore((s) => s.items);
  const lookbackDays = useStore((s) => s.config?.lookbackDays) ?? DEFAULT_LOOKBACK_DAYS;
  const ends = useIterationEndMap();
  return useMemo(() => {
    const cutoff = Date.now() - lookbackDays * 86400000;
    return Object.values(itemsMap).filter((it) => inWindow(it, ends, cutoff));
  }, [itemsMap, ends, lookbackDays]);
}

/** Set de ids visibles en la ventana (para filtrar el feed, que indexa por item). */
export function useWindowedIds(): Set<number> {
  const items = useWindowedItems();
  return useMemo(() => new Set(items.map((it) => it.id)), [items]);
}
