// Restringe los items a los proyectos activos y a los sprints cuya fecha cae
// dentro de la ventana configurada (config.lookbackDays). Es la diferencia clave
// con el filtro de fetch: ese trae por ChangedDate (un item viejo tocado hace
// poco arrastra a su sprint viejo), mientras que acá descartamos por la FECHA
// del sprint mismo (iteration finishDate/startDate), que es lo que el usuario
// entiende por "traeme sólo los sprints de los últimos N meses".
import { useMemo } from "react";
import { activeProjects, useStore } from "../store/useStore";
import { safeSizePoints } from "./points";
import { isTestCase } from "./workItemStatus";
import { DEFAULT_LOOKBACK_DAYS, type ProjectConfig, type SizePoints, type WorkItem } from "../types";

/** Proyectos visibles ahora mismo (según el selector de la barra superior). */
export function useActiveProjects(): ProjectConfig[] {
  const config = useStore((s) => s.config);
  return useMemo(() => activeProjects(config), [config]);
}

/** Tabla talle → puntos configurada, saneada. */
export function useSizePoints(): SizePoints {
  const raw = useStore((s) => s.config.sizePoints);
  return useMemo(() => safeSizePoints(raw), [raw]);
}

/** Fin (ms) de cada iteración conocida, por proyecto: finishDate, o startDate. */
function useIterationEndMap(): Map<string, number | undefined> {
  const iterationDates = useStore((s) => s.iterationDates);
  return useMemo(() => {
    const m = new Map<string, number | undefined>();
    for (const [projectId, paths] of Object.entries(iterationDates)) {
      for (const [path, d] of Object.entries(paths)) {
        const end = d.finishDate ?? d.startDate;
        m.set(`${projectId}#${path}`, end ? new Date(end).getTime() : undefined);
      }
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
  if (!it.iterationPath) return true;
  const key = `${it.projectId}#${it.iterationPath}`;
  if (!ends.has(key)) return true;
  const end = ends.get(key);
  return end == null || end >= cutoff;
}

/** Items de los proyectos activos dentro de la ventana de sprints, sin filtrar tipo. */
function useAllWindowedItems(): WorkItem[] {
  const itemsMap = useStore((s) => s.items);
  const lookbackDays = useStore((s) => s.config.lookbackDays) ?? DEFAULT_LOOKBACK_DAYS;
  const projects = useActiveProjects();
  const ends = useIterationEndMap();
  return useMemo(() => {
    const cutoff = Date.now() - lookbackDays * 86400000;
    const active = new Set(projects.map((p) => p.id));
    return Object.values(itemsMap).filter(
      (it) => active.has(it.projectId) && inWindow(it, ends, cutoff),
    );
  }, [itemsMap, ends, lookbackDays, projects]);
}

/**
 * Items visibles en Actividad / Board / Métricas / Evolutivo. Excluye los Test
 * Case: se traen de ADO sólo para la pestaña QA y ensuciarían el board y el
 * conteo de puntos si aparecieran acá.
 */
export function useWindowedItems(): WorkItem[] {
  const all = useAllWindowedItems();
  return useMemo(() => all.filter((it) => !isTestCase(it)), [all]);
}

/** Test Cases de los proyectos activos dentro de la ventana (pestaña QA). */
export function useTestCases(): WorkItem[] {
  const all = useAllWindowedItems();
  return useMemo(() => all.filter(isTestCase), [all]);
}

/** Set de claves visibles en la ventana (para filtrar el feed, que indexa por item). */
export function useWindowedIds(): Set<string> {
  const items = useWindowedItems();
  return useMemo(() => new Set(items.map((it) => `${it.projectId}#${it.id}`)), [items]);
}
