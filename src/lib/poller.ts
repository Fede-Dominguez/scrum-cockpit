// Motor de polling: carga inicial + ciclos incrementales contra Azure DevOps.
import { useStore } from "../store/useStore";
import {
  getAllIterationDates,
  getIterations,
  getWorkItems,
  getWorkItemUpdates,
  queryAllIds,
  queryChangedIds,
} from "./azureDevOps";
import { updatesToEvents } from "./feedEvents";
import type { AzureConfig } from "../types";

let timer: ReturnType<typeof setInterval> | null = null;
let ticking = false;
// Si llega un pedido de sync mientras hay un tick en curso, lo encolamos para
// que "Actualizar ahora" no se pierda silenciosamente.
let rerunPending = false;
// Token de arranque: invalida cargas iniciales en vuelo si el config cambia o
// se detiene el poller mientras el fullSync todavía no terminó.
let startToken = 0;

export function isPolling(): boolean {
  return timer !== null;
}

/** Carga inicial: trae todos los items + siembra el feed con la actividad reciente */
async function fullSync(cfg: AzureConfig): Promise<void> {
  const store = useStore.getState();
  const ids = await queryAllIds(cfg);
  const items = await getWorkItems(cfg, ids);
  store.setItems(items);

  getIterations(cfg)
    .then(store.setIterations)
    .catch(() => {});

  // Fechas de todas las iteraciones (incl. sprints viejos) para la ventana por meses.
  getAllIterationDates(cfg)
    .then(store.setIterationDates)
    .catch(() => {});

  // Sembrar feed con los 30 items modificados más recientemente
  const recent = [...items]
    .sort((a, b) => new Date(b.changedDate).getTime() - new Date(a.changedDate).getTime())
    .slice(0, 30);
  for (const it of recent) {
    try {
      const updates = await getWorkItemUpdates(cfg, it.id);
      store.addEvents(updatesToEvents(it.id, it.type, it.title, updates));
    } catch {
      /* item individual que falla no corta la carga */
    }
  }
  await store.setWatermark(new Date().toISOString());
}

/** Ciclo incremental: detecta cambios desde el watermark y actualiza items + feed */
async function tick(cfg: AzureConfig): Promise<void> {
  if (ticking) {
    rerunPending = true;
    return;
  }
  ticking = true;
  const store = useStore.getState();
  store.setStatus("syncing");
  try {
    const since = store.watermark ?? undefined;
    const checkpoint = new Date().toISOString();
    const changedIds = await queryChangedIds(cfg, since);

    if (changedIds.length > 0) {
      const items = await getWorkItems(cfg, changedIds);
      store.mergeItems(items);

      // La WIQL filtra por día (no acepta hora), así que `changedIds` puede
      // incluir items ya vistos en ciclos anteriores del mismo día. Afinamos
      // con el watermark de precisión completa para no re-pedir el historial
      // (una llamada por item) de cosas que no cambiaron desde el último tick.
      const sinceMs = since ? new Date(since).getTime() : 0;
      const fresh = items
        .filter((i) => new Date(i.changedDate).getTime() > sinceMs)
        .sort((a, b) => new Date(b.changedDate).getTime() - new Date(a.changedDate).getTime());

      // Limitar a 50 detalles por ciclo para no saturar
      for (const it of fresh.slice(0, 50)) {
        try {
          const updates = await getWorkItemUpdates(cfg, it.id);
          store.addEvents(updatesToEvents(it.id, it.type, it.title, updates));
        } catch {
          /* noop */
        }
      }
    }

    await store.setWatermark(checkpoint);
    store.setLastSync(new Date().toISOString());
    store.setStatus("ok");
    store.setError(null);
  } catch (e) {
    store.setError(e instanceof Error ? e.message : String(e));
  } finally {
    ticking = false;
    // Atender un pedido que llegó mientras estábamos sincronizando
    if (rerunPending) {
      rerunPending = false;
      void tick(cfg);
    }
  }
}

/** Arranca el polling. Hace carga inicial si todavía no hay items. */
export async function startPolling(cfg: AzureConfig): Promise<void> {
  stopPolling(); // bumpea startToken => invalida cualquier arranque en vuelo
  const myToken = startToken;
  const store = useStore.getState();

  if (Object.keys(store.items).length === 0) {
    store.setStatus("syncing");
    try {
      await fullSync(cfg);
    } catch (e) {
      if (myToken === startToken) {
        store.setError(e instanceof Error ? e.message : String(e));
      }
      return; // no arrancar el intervalo si la carga inicial falló
    }
    // Si mientras cargábamos cambió el config o se detuvo el poller, este
    // arranque quedó obsoleto: no pisamos estado ni montamos un segundo intervalo.
    if (myToken !== startToken) return;
    store.setLastSync(new Date().toISOString());
    store.setStatus("ok");
  }

  const intervalMs = Math.max(10, cfg.pollIntervalSec) * 1000;
  timer = setInterval(() => void tick(cfg), intervalMs);
  void tick(cfg);
}

export function stopPolling(): void {
  startToken++; // invalida fullSync en curso de un startPolling previo
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }
}

/** Fuerza un ciclo manual ya mismo */
export async function syncNow(cfg: AzureConfig): Promise<void> {
  await tick(cfg);
}
