// Estado global (Zustand) + persistencia con el plugin-store de Tauri.
//
// Todo el estado de datos está indexado por proyecto: se pueden tener varios
// proyectos de Azure DevOps configurados (incluso de organizaciones distintas y
// con tokens distintos) y verlos en simultáneo.
import { create } from "zustand";
import { load, type Store } from "@tauri-apps/plugin-store";
import {
  DEFAULT_LOOKBACK_DAYS,
  DEFAULT_POLL_INTERVAL_SEC,
  DEFAULT_SIZE_POINTS,
  defaultAppConfig,
  itemKey,
  type AppConfig,
  type FeedEvent,
  type ProjectConfig,
  type ResolvedProject,
  type WorkItem,
} from "../types";
import type { Iteration, IterationDates } from "../lib/azureDevOps";
import { DEFAULT_PAT_ENV_VAR, getEnvPat, resolveEnvPats } from "../lib/env";

const STORE_FILE = "scrum-cockpit.json";
const CONFIG_KEY = "appConfig";
const LEGACY_CONFIG_KEY = "config";
const MAX_FEED = 500;

let tauriStore: Store | null = null;
async function getStore(): Promise<Store> {
  if (!tauriStore) {
    tauriStore = await load(STORE_FILE, { autoSave: true, defaults: {} });
  }
  return tauriStore;
}

export type SyncStatus = "idle" | "syncing" | "ok" | "error";

export interface ProjectSync {
  status: SyncStatus;
  lastSync: string | null;
  error: string | null;
  watermark: string | null;
}

const emptySync = (): ProjectSync => ({
  status: "idle",
  lastSync: null,
  error: null,
  watermark: null,
});

export function newProjectId(): string {
  return crypto.randomUUID();
}

/**
 * Devuelve el proyecto con su PAT resuelto desde SU variable de entorno. El
 * token nunca se persiste ni se ingresa por pantalla: se inyecta en runtime.
 * Devuelve null si esa variable no está definida (el proyecto no es usable).
 */
export function resolveProject(
  project: ProjectConfig,
  envPats: Record<string, string | null>,
): ResolvedProject | null {
  const pat = envPats[project.patEnvVar]?.trim();
  if (!pat) return null;
  return { ...project, pat };
}

/** Config de proyecto normalizada, con defaults para lo que falte. */
export function normalizeProject(p: Partial<ProjectConfig>): ProjectConfig {
  return {
    id: p.id || newProjectId(),
    label: (p.label || p.project || "Proyecto").trim(),
    org: (p.org || "").trim(),
    project: (p.project || "").trim(),
    team: p.team?.trim() || undefined,
    patEnvVar: (p.patEnvVar || DEFAULT_PAT_ENV_VAR).trim(),
    colorIndex: p.colorIndex,
  };
}

/** Sanea lo que viene del disco (o de una versión vieja de la app). */
function normalizeConfig(raw: Partial<AppConfig> | null): AppConfig {
  const base = defaultAppConfig();
  if (!raw) return base;
  const projects = (raw.projects ?? []).map((p, i) =>
    normalizeProject({ ...p, colorIndex: p.colorIndex ?? i }),
  );
  const ids = new Set(projects.map((p) => p.id));
  return {
    projects,
    activeIds: (raw.activeIds ?? []).filter((id) => ids.has(id)),
    pollIntervalSec: Math.max(10, Number(raw.pollIntervalSec) || DEFAULT_POLL_INTERVAL_SEC),
    lookbackDays: Math.max(
      1,
      Math.floor(Number(raw.lookbackDays) || DEFAULT_LOOKBACK_DAYS),
    ),
    sizePoints:
      raw.sizePoints && Object.keys(raw.sizePoints).length
        ? raw.sizePoints
        : { ...DEFAULT_SIZE_POINTS },
  };
}

/** Config vieja (un solo proyecto) tal como se guardaba antes. */
interface LegacyConfig {
  org?: string;
  project?: string;
  team?: string;
  pollIntervalSec?: number;
  lookbackDays?: number;
}

/**
 * Migra la config de un solo proyecto al formato multi-proyecto. El proyecto
 * heredado apunta a la variable de entorno por defecto, que es de donde salía
 * su token hasta ahora.
 */
function migrateLegacy(legacy: LegacyConfig): AppConfig {
  const project = normalizeProject({
    label: legacy.project || "Proyecto",
    org: legacy.org,
    project: legacy.project,
    team: legacy.team,
    patEnvVar: DEFAULT_PAT_ENV_VAR,
    colorIndex: 0,
  });
  return normalizeConfig({
    projects: [project],
    activeIds: [project.id],
    pollIntervalSec: legacy.pollIntervalSec,
    lookbackDays: legacy.lookbackDays,
  });
}

interface AppState {
  // Config
  config: AppConfig;
  /** nombre de variable de entorno → token (null si no está definida) */
  envPats: Record<string, string | null>;
  configLoaded: boolean;

  // Datos (indexados por proyecto)
  items: Record<string, WorkItem>; // clave: `${projectId}#${id}`
  feed: FeedEvent[];
  iterations: Record<string, Iteration[]>; // por projectId
  iterationDates: Record<string, Record<string, IterationDates>>; // projectId → path → fechas

  // Estado de sync por proyecto
  sync: Record<string, ProjectSync>;

  // Acciones
  loadPersisted: () => Promise<void>;
  refreshEnvPats: () => Promise<void>;
  saveConfig: (cfg: AppConfig) => Promise<void>;
  upsertProject: (p: ProjectConfig) => Promise<void>;
  removeProject: (id: string) => Promise<void>;
  setActiveIds: (ids: string[]) => Promise<void>;
  setGlobalSettings: (
    s: Partial<Pick<AppConfig, "pollIntervalSec" | "lookbackDays" | "sizePoints">>,
  ) => Promise<void>;
  clearAll: () => Promise<void>;

  setItems: (projectId: string, items: WorkItem[]) => void;
  mergeItems: (items: WorkItem[]) => void;
  addEvents: (events: FeedEvent[]) => void;
  setIterations: (projectId: string, its: Iteration[]) => void;
  setIterationDates: (projectId: string, m: Record<string, IterationDates>) => void;
  setStatus: (projectId: string, s: SyncStatus) => void;
  setError: (projectId: string, e: string | null) => void;
  setLastSync: (projectId: string, iso: string) => void;
  setWatermark: (projectId: string, iso: string) => Promise<void>;
}

/** Patch inmutable del bloque de sync de un proyecto. */
function patchSync(
  sync: Record<string, ProjectSync>,
  projectId: string,
  patch: Partial<ProjectSync>,
): Record<string, ProjectSync> {
  return { ...sync, [projectId]: { ...(sync[projectId] ?? emptySync()), ...patch } };
}

export const useStore = create<AppState>((set, get) => ({
  config: defaultAppConfig(),
  envPats: {},
  configLoaded: false,
  items: {},
  feed: [],
  iterations: {},
  iterationDates: {},
  sync: {},

  loadPersisted: async () => {
    const store = await getStore();
    let config = normalizeConfig((await store.get<AppConfig>(CONFIG_KEY)) ?? null);

    // Migración desde la config de un solo proyecto.
    if (config.projects.length === 0) {
      const legacy = (await store.get<LegacyConfig>(LEGACY_CONFIG_KEY)) ?? null;
      if (legacy?.org && legacy?.project) {
        config = migrateLegacy(legacy);
        await store.set(CONFIG_KEY, config);
        await store.set(LEGACY_CONFIG_KEY, null);
        await store.save();
      }
    }

    const feed = (await store.get<FeedEvent[]>("feed")) ?? [];
    const watermarks = (await store.get<Record<string, string>>("watermarks")) ?? {};
    const envPats = await loadEnvPats(config.projects);

    const sync: Record<string, ProjectSync> = {};
    for (const p of config.projects) {
      sync[p.id] = { ...emptySync(), watermark: watermarks[p.id] ?? null };
    }

    set({
      config,
      // El feed viejo no tenía projectId: descartamos los eventos huérfanos para
      // que no queden colgados de un proyecto que ya no existe.
      feed: feed.filter((e) => e.projectId && sync[e.projectId]),
      envPats,
      sync,
      configLoaded: true,
    });
  },

  refreshEnvPats: async () => {
    set({ envPats: await loadEnvPats(get().config.projects) });
  },

  saveConfig: async (cfg) => {
    const config = normalizeConfig(cfg);
    const store = await getStore();
    await store.set(CONFIG_KEY, config);
    await store.save();
    const envPats = await loadEnvPats(config.projects);
    // Descartar datos de proyectos que ya no están configurados.
    const alive = new Set(config.projects.map((p) => p.id));
    set((state) => ({
      config,
      envPats,
      items: pickByProject(state.items, alive),
      feed: state.feed.filter((e) => alive.has(e.projectId)),
      sync: Object.fromEntries(
        config.projects.map((p) => [p.id, state.sync[p.id] ?? emptySync()]),
      ),
    }));
  },

  upsertProject: async (p) => {
    const project = normalizeProject(p);
    const { config } = get();
    const exists = config.projects.some((x) => x.id === project.id);
    const projects = exists
      ? config.projects.map((x) => (x.id === project.id ? project : x))
      : [...config.projects, { ...project, colorIndex: project.colorIndex ?? config.projects.length }];
    // Un proyecto recién agregado arranca visible.
    const activeIds = exists
      ? config.activeIds
      : config.activeIds.length
        ? [...config.activeIds, project.id]
        : config.activeIds;
    await get().saveConfig({ ...config, projects, activeIds });
  },

  removeProject: async (id) => {
    const { config } = get();
    await get().saveConfig({
      ...config,
      projects: config.projects.filter((p) => p.id !== id),
      activeIds: config.activeIds.filter((x) => x !== id),
    });
    const store = await getStore();
    const watermarks = (await store.get<Record<string, string>>("watermarks")) ?? {};
    delete watermarks[id];
    await store.set("watermarks", watermarks);
    await store.save();
  },

  setActiveIds: async (ids) => {
    const { config } = get();
    await get().saveConfig({ ...config, activeIds: ids });
  },

  setGlobalSettings: async (s) => {
    const { config } = get();
    const next = normalizeConfig({ ...config, ...s });
    // Cambiar la ventana de datos obliga a recargar: reseteamos items y
    // watermarks para que el poller haga una carga inicial limpia.
    const windowChanged = next.lookbackDays !== config.lookbackDays;
    const store = await getStore();
    await store.set(CONFIG_KEY, next);
    if (windowChanged) await store.set("watermarks", {});
    await store.save();
    set((state) => ({
      config: next,
      items: windowChanged ? {} : state.items,
      sync: windowChanged
        ? Object.fromEntries(next.projects.map((p) => [p.id, emptySync()]))
        : state.sync,
    }));
  },

  clearAll: async () => {
    const store = await getStore();
    await store.set(CONFIG_KEY, defaultAppConfig());
    await store.set(LEGACY_CONFIG_KEY, null);
    await store.set("feed", []);
    await store.set("watermarks", {});
    await store.save();
    set({
      config: defaultAppConfig(),
      items: {},
      feed: [],
      iterations: {},
      iterationDates: {},
      sync: {},
    });
  },

  setItems: (projectId, items) => {
    set((state) => {
      // Reemplaza sólo los items de ESE proyecto; los demás quedan intactos.
      const map: Record<string, WorkItem> = {};
      for (const [k, v] of Object.entries(state.items)) {
        if (v.projectId !== projectId) map[k] = v;
      }
      for (const it of items) map[itemKey(it.projectId, it.id)] = it;
      return { items: map };
    });
  },

  mergeItems: (items) => {
    if (items.length === 0) return;
    set((state) => {
      const map = { ...state.items };
      for (const it of items) map[itemKey(it.projectId, it.id)] = it;
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

  setIterations: (projectId, its) =>
    set((state) => ({ iterations: { ...state.iterations, [projectId]: its } })),
  setIterationDates: (projectId, m) =>
    set((state) => ({ iterationDates: { ...state.iterationDates, [projectId]: m } })),

  setStatus: (projectId, status) =>
    set((state) => ({ sync: patchSync(state.sync, projectId, { status }) })),

  setError: (projectId, error) =>
    set((state) => ({
      sync: patchSync(state.sync, projectId, {
        error,
        ...(error ? { status: "error" as SyncStatus } : {}),
      }),
    })),

  setLastSync: (projectId, lastSync) =>
    set((state) => ({ sync: patchSync(state.sync, projectId, { lastSync }) })),

  setWatermark: async (projectId, iso) => {
    const store = await getStore();
    const watermarks = (await store.get<Record<string, string>>("watermarks")) ?? {};
    watermarks[projectId] = iso;
    await store.set("watermarks", watermarks);
    set((state) => ({ sync: patchSync(state.sync, projectId, { watermark: iso }) }));
  },
}));

/** Lee el token de cada proyecto desde su variable de entorno. */
async function loadEnvPats(projects: ProjectConfig[]): Promise<Record<string, string | null>> {
  const names = projects.map((p) => p.patEnvVar);
  const map = await resolveEnvPats(names);
  // La variable por defecto siempre se consulta: es la que sugiere Setup y la
  // que usaba la versión de un solo proyecto.
  if (!(DEFAULT_PAT_ENV_VAR in map)) {
    map[DEFAULT_PAT_ENV_VAR] = await getEnvPat();
  }
  return map;
}

function pickByProject(
  items: Record<string, WorkItem>,
  alive: Set<string>,
): Record<string, WorkItem> {
  const out: Record<string, WorkItem> = {};
  for (const [k, v] of Object.entries(items)) if (alive.has(v.projectId)) out[k] = v;
  return out;
}

// ---------------------------------------------------------------------------
// Selectores derivados
// ---------------------------------------------------------------------------

/** Proyectos visibles ahora mismo (activeIds vacío = todos). */
export function activeProjects(config: AppConfig): ProjectConfig[] {
  if (config.activeIds.length === 0) return config.projects;
  const set = new Set(config.activeIds);
  return config.projects.filter((p) => set.has(p.id));
}

/** Proyectos activos que además tienen su token disponible. */
export function runnableProjects(
  config: AppConfig,
  envPats: Record<string, string | null>,
): ResolvedProject[] {
  return activeProjects(config)
    .map((p) => resolveProject(p, envPats))
    .filter((p): p is ResolvedProject => p !== null);
}

/** Estado agregado para la barra inferior: error > syncing > ok > idle. */
export function aggregateStatus(sync: Record<string, ProjectSync>, ids: string[]): SyncStatus {
  const states = ids.map((id) => sync[id]?.status ?? "idle");
  if (states.includes("error")) return "error";
  if (states.includes("syncing")) return "syncing";
  if (states.includes("ok")) return "ok";
  return "idle";
}
