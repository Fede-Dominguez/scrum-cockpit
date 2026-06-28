// Estado global (Zustand) + persistencia con el plugin-store de Tauri.
import { create } from "zustand";
import { load, type Store } from "@tauri-apps/plugin-store";
import type { AzureConfig, FeedEvent, WorkItem } from "../types";
import type { Iteration, IterationDates } from "../lib/azureDevOps";
import { getEnvPat } from "../lib/env";

const STORE_FILE = "scrum-cockpit.json";
const MAX_FEED = 500;

let tauriStore: Store | null = null;
async function getStore(): Promise<Store> {
  if (!tauriStore) {
    tauriStore = await load(STORE_FILE, { autoSave: true, defaults: {} });
  }
  return tauriStore;
}

export type SyncStatus = "idle" | "syncing" | "ok" | "error";

/**
 * Devuelve el config con el PAT resuelto exclusivamente desde la variable de
 * entorno. El token nunca se persiste ni se ingresa por pantalla, así que lo
 * inyectamos en tiempo de ejecución y descartamos cualquier valor guardado.
 */
export function resolveConfig(
  config: AzureConfig | null,
  envPat: string | null,
): AzureConfig | null {
  if (!config) return null;
  return { ...config, pat: envPat?.trim() || "" };
}

interface AppState {
  // Config
  config: AzureConfig | null;
  envPat: string | null; // PAT detectado en variable de entorno
  configLoaded: boolean;

  // Datos
  items: Record<number, WorkItem>;
  feed: FeedEvent[];
  iterations: Iteration[];
  iterationDates: Record<string, IterationDates>; // todas las iteraciones (por IterationPath)

  // Estado de sync
  status: SyncStatus;
  lastSync: string | null;
  error: string | null;
  watermark: string | null;

  // Acciones
  loadPersisted: () => Promise<void>;
  saveConfig: (cfg: AzureConfig) => Promise<void>;
  clearConfig: () => Promise<void>;
  setItems: (items: WorkItem[]) => void;
  mergeItems: (items: WorkItem[]) => void;
  addEvents: (events: FeedEvent[]) => void;
  setIterations: (its: Iteration[]) => void;
  setIterationDates: (m: Record<string, IterationDates>) => void;
  setStatus: (s: SyncStatus) => void;
  setError: (e: string | null) => void;
  setLastSync: (iso: string) => void;
  setWatermark: (iso: string) => Promise<void>;
}

export const useStore = create<AppState>((set, get) => ({
  config: null,
  envPat: null,
  configLoaded: false,
  items: {},
  feed: [],
  iterations: [],
  iterationDates: {},
  status: "idle",
  lastSync: null,
  error: null,
  watermark: null,

  loadPersisted: async () => {
    const store = await getStore();
    const config = (await store.get<AzureConfig>("config")) ?? null;
    const feed = (await store.get<FeedEvent[]>("feed")) ?? [];
    const watermark = (await store.get<string>("watermark")) ?? null;
    const envPat = await getEnvPat();
    set({ config, feed, watermark, envPat, configLoaded: true });
  },

  saveConfig: async (cfg) => {
    const store = await getStore();
    // Nunca persistimos el token: se lee siempre de la variable de entorno.
    const persisted: AzureConfig = { ...cfg, pat: "" };
    await store.set("config", persisted);
    // Resetear el watermark y los items para que el poller haga una carga
    // inicial limpia con la nueva ventana de fecha (lookbackDays).
    await store.set("watermark", null);
    await store.save();
    set({ config: persisted, items: {}, watermark: null });
  },

  clearConfig: async () => {
    const store = await getStore();
    await store.set("config", null);
    await store.set("feed", []);
    await store.set("watermark", null);
    await store.save();
    set({ config: null, feed: [], items: {}, watermark: null, status: "idle", error: null });
  },

  setItems: (items) => {
    const map: Record<number, WorkItem> = {};
    for (const it of items) map[it.id] = it;
    set({ items: map });
  },

  mergeItems: (items) => {
    set((state) => {
      const map = { ...state.items };
      for (const it of items) map[it.id] = it;
      return { items: map };
    });
  },

  addEvents: (events) => {
    if (events.length === 0) return;
    set((state) => {
      const existing = new Set(state.feed.map((e) => e.id));
      const fresh = events.filter((e) => !existing.has(e.id));
      if (fresh.length === 0) return state;
      const merged = [...fresh, ...state.feed]
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, MAX_FEED);
      // Persistir sin bloquear
      getStore().then((s) => s.set("feed", merged));
      return { feed: merged };
    });
  },

  setIterations: (its) => set({ iterations: its }),
  setIterationDates: (m) => set({ iterationDates: m }),
  setStatus: (s) => set({ status: s }),
  setError: (e) => set({ error: e, status: e ? "error" : get().status }),
  setLastSync: (iso) => set({ lastSync: iso }),
  setWatermark: async (iso) => {
    const store = await getStore();
    await store.set("watermark", iso);
    set({ watermark: iso });
  },
}));
