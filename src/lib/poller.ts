// Motor de polling: carga inicial + ciclos incrementales contra Azure DevOps.
//
// Corre un ciclo independiente por proyecto activo, así dos proyectos (aun de
// organizaciones distintas y con tokens distintos) se sincronizan en paralelo
// sin pisarse.
import { useStore } from "../store/useStore";
import {
  getAllIterationDates,
  getIterations,
  getWorkItems,
  getWorkItemUpdates,
  queryAllIds,
  queryChangedIds,
  type QueryConfig,
} from "./azureDevOps";
import { updatesToEvents } from "./feedEvents";
import { isTestCase } from "./workItemStatus";
import type { ResolvedProject } from "../types";

interface Runner {
  cfg: QueryConfig;
  timer: ReturnType<typeof setInterval> | null;
  ticking: boolean;
  /** Pedido de sync que llegó durante un tick en curso (no se pierde) */
  rerunPending: boolean;
  /** Invalida cargas iniciales en vuelo cuando el proyecto se detiene/reinicia */
  token: number;
}

const runners = new Map<string, Runner>();
let tokenSeq = 0;

export function isPolling(projectId?: string): boolean {
  if (projectId) return runners.get(projectId)?.timer != null;
  return [...runners.values()].some((r) => r.timer != null);
}

/** `true` si el proyecto ya tiene items cargados en el store. */
function hasItems(projectId: string): boolean {
  const items = useStore.getState().items;
  for (const it of Object.values(items)) if (it.projectId === projectId) return true;
  return false;
}

/** Carga inicial: trae todos los items + siembra el feed con la actividad reciente */
async function fullSync(cfg: QueryConfig): Promise<void> {
  const store = useStore.getState();
  const ids = await queryAllIds(cfg);
  const items = await getWorkItems(cfg, ids);
  store.setItems(cfg.id, items);

  getIterations(cfg)
    .then((its) => useStore.getState().setIterations(cfg.id, its))
    .catch(() => {});

  // Fechas de todas las iteraciones (incl. sprints viejos) para la ventana por meses.
  getAllIterationDates(cfg)
    .then((m) => useStore.getState().setIterationDates(cfg.id, m))
    .catch(() => {});

  // Sembrar feed con los 30 items modificados más recientemente. Los Test Case
  // se traen sólo para la pestaña QA y no se muestran en Actividad: pedirles el
  // historial sería un request por item para eventos que nadie ve (y que además
  // desplazarían del feed a los movimientos reales).
  const recent = items
    .filter((it) => !isTestCase(it))
    .sort((a, b) => new Date(b.changedDate).getTime() - new Date(a.changedDate).getTime())
    .slice(0, 30);
  for (const it of recent) {
    try {
      const updates = await getWorkItemUpdates(cfg, it.id);
      useStore
        .getState()
        .addEvents(updatesToEvents(cfg.id, it.id, it.type, it.title, updates));
    } catch {
      /* item individual que falla no corta la carga */
    }
  }
  await useStore.getState().setWatermark(cfg.id, new Date().toISOString());
}

/** Ciclo incremental: detecta cambios desde el watermark y actualiza items + feed */
async function tick(runner: Runner): Promise<void> {
  const cfg = runner.cfg;
  if (runner.ticking) {
    runner.rerunPending = true;
    return;
  }
  runner.ticking = true;
  const store = useStore.getState();
  store.setStatus(cfg.id, "syncing");
  try {
    const since = useStore.getState().sync[cfg.id]?.watermark ?? undefined;
    const checkpoint = new Date().toISOString();
    const changedIds = await queryChangedIds(cfg, since);

    if (changedIds.length > 0) {
      const items = await getWorkItems(cfg, changedIds);
      useStore.getState().mergeItems(items);

      // La WIQL filtra por día (no acepta hora), así que `changedIds` puede
      // incluir items ya vistos en ciclos anteriores del mismo día. Afinamos
      // con el watermark de precisión completa para no re-pedir el historial
      // (una llamada por item) de cosas que no cambiaron desde el último tick.
      const sinceMs = since ? new Date(since).getTime() : 0;
      const fresh = items
        .filter((i) => !isTestCase(i) && new Date(i.changedDate).getTime() > sinceMs)
        .sort((a, b) => new Date(b.changedDate).getTime() - new Date(a.changedDate).getTime());

      // Limitar a 50 detalles por ciclo para no saturar
      for (const it of fresh.slice(0, 50)) {
        try {
          const updates = await getWorkItemUpdates(cfg, it.id);
          useStore
            .getState()
            .addEvents(updatesToEvents(cfg.id, it.id, it.type, it.title, updates));
        } catch {
          /* noop */
        }
      }
    }

    await useStore.getState().setWatermark(cfg.id, checkpoint);
    const s = useStore.getState();
    s.setLastSync(cfg.id, new Date().toISOString());
    s.setError(cfg.id, null);
    s.setStatus(cfg.id, "ok");
  } catch (e) {
    useStore.getState().setError(cfg.id, e instanceof Error ? e.message : String(e));
  } finally {
    runner.ticking = false;
    // Atender un pedido que llegó mientras estábamos sincronizando
    if (runner.rerunPending) {
      runner.rerunPending = false;
      void tick(runner);
    }
  }
}

/** Arranca (o reinicia) el polling de un proyecto. */
async function startProject(cfg: QueryConfig): Promise<void> {
  stopProject(cfg.id);
  const runner: Runner = {
    cfg,
    timer: null,
    ticking: false,
    rerunPending: false,
    token: ++tokenSeq,
  };
  runners.set(cfg.id, runner);
  const myToken = runner.token;
  const alive = () => runners.get(cfg.id)?.token === myToken;

  if (!hasItems(cfg.id)) {
    useStore.getState().setStatus(cfg.id, "syncing");
    try {
      await fullSync(cfg);
    } catch (e) {
      if (alive()) {
        useStore.getState().setError(cfg.id, e instanceof Error ? e.message : String(e));
      }
      return; // no arrancar el intervalo si la carga inicial falló
    }
    // Si mientras cargábamos cambió el config o se detuvo el poller, este
    // arranque quedó obsoleto: no pisamos estado ni montamos un segundo intervalo.
    if (!alive()) return;
    const s = useStore.getState();
    s.setLastSync(cfg.id, new Date().toISOString());
    s.setStatus(cfg.id, "ok");
  }

  if (!alive()) return;
  const intervalMs = Math.max(10, cfg.pollIntervalSec ?? 30) * 1000;
  runner.timer = setInterval(() => void tick(runner), intervalMs);
  void tick(runner);
}

function stopProject(projectId: string): void {
  const runner = runners.get(projectId);
  if (!runner) return;
  if (runner.timer !== null) clearInterval(runner.timer);
  runners.delete(projectId); // invalida fullSync en curso (cambia el token vigente)
}

/**
 * Sincroniza los runners con la lista de proyectos que deberían estar corriendo:
 * arranca los nuevos, para los que ya no están y reinicia los que cambiaron
 * (org/proyecto/token/intervalo/ventana).
 */
export function syncPollers(
  projects: ResolvedProject[],
  opts: { pollIntervalSec: number; lookbackDays: number },
): void {
  const wanted = new Map<string, QueryConfig>(
    projects.map((p) => [
      p.id,
      { ...p, pollIntervalSec: opts.pollIntervalSec, lookbackDays: opts.lookbackDays },
    ]),
  );

  for (const id of [...runners.keys()]) {
    if (!wanted.has(id)) stopProject(id);
  }

  for (const [id, cfg] of wanted) {
    const current = runners.get(id);
    if (current && sameConfig(current.cfg, cfg)) {
      current.cfg = cfg;
      continue;
    }
    void startProject(cfg);
  }
}

function sameConfig(a: QueryConfig, b: QueryConfig): boolean {
  return (
    a.org === b.org &&
    a.project === b.project &&
    a.team === b.team &&
    a.pat === b.pat &&
    a.pollIntervalSec === b.pollIntervalSec &&
    a.lookbackDays === b.lookbackDays
  );
}

/** Detiene todos los ciclos (al desmontar o al entrar a Configuración). */
export function stopPolling(): void {
  for (const id of [...runners.keys()]) stopProject(id);
}

/** Fuerza un ciclo manual ya mismo en todos los proyectos activos. */
export async function syncNow(): Promise<void> {
  await Promise.all([...runners.values()].map((r) => tick(r)));
}
