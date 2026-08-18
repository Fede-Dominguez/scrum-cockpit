// Modelo de dominio de Scrum Cockpit

/**
 * Un proyecto de Azure DevOps configurado en la app. Se pueden tener varios
 * (incluso de organizaciones distintas y con tokens distintos) y verlos a la vez.
 */
export interface ProjectConfig {
  /** Id interno estable (no viene de ADO) */
  id: string;
  /** Alias visible en el selector, ej "Mobile" */
  label: string;
  /** Nombre de la organización en dev.azure.com/{org} */
  org: string;
  /** Nombre del proyecto */
  project: string;
  /** Equipo opcional (para iteraciones / sprints) */
  team?: string;
  /**
   * Nombre de la variable de entorno que contiene el PAT de ESTE proyecto.
   * El token nunca se persiste ni se ingresa por pantalla: cada proyecto apunta
   * a su propia variable, así se pueden usar credenciales distintas en paralelo.
   */
  patEnvVar: string;
  /** Color del badge (índice en PROJECT_COLORS) */
  colorIndex?: number;
}

/** Conversión talle → puntos para el campo custom "Estimación" */
export type SizePoints = Record<string, number>;

/**
 * Tabla por defecto de talles. Se usa sólo cuando la US no tiene Story Points,
 * para no contabilizar dos veces el mismo trabajo.
 */
export const DEFAULT_SIZE_POINTS: SizePoints = { XS: 1, S: 2, M: 3, L: 5, XL: 8 };

/** Configuración completa de la app (lo que se persiste en disco, sin tokens) */
export interface AppConfig {
  projects: ProjectConfig[];
  /** Proyectos visibles ahora mismo; vacío = todos los configurados */
  activeIds: string[];
  /** Intervalo de polling en segundos (global) */
  pollIntervalSec: number;
  /**
   * Ventana de fecha (en días hacia atrás) para traer actividad.
   * Sólo se cargan items con ChangedDate dentro de esta ventana, así no se
   * arrastran sprints/versiones de años atrás. Default 60 (~2 meses).
   */
  lookbackDays: number;
  /** Talle → puntos, editable desde Configuración */
  sizePoints: SizePoints;
}

/**
 * Config efectiva de un proyecto: lo guardado + el PAT resuelto en runtime
 * desde su variable de entorno. Es lo que consume el cliente REST.
 */
export interface ResolvedProject extends ProjectConfig {
  pat: string;
}

/** Ventana de fecha por defecto (días) si la config no la trae */
export const DEFAULT_LOOKBACK_DAYS = 60;

export const DEFAULT_POLL_INTERVAL_SEC = 30;

export function defaultAppConfig(): AppConfig {
  return {
    projects: [],
    activeIds: [],
    pollIntervalSec: DEFAULT_POLL_INTERVAL_SEC,
    lookbackDays: DEFAULT_LOOKBACK_DAYS,
    sizePoints: { ...DEFAULT_SIZE_POINTS },
  };
}

export interface WorkItem {
  /** Proyecto del que vino (los ids de ADO se repiten entre organizaciones) */
  projectId: string;
  id: number;
  type: string; // System.WorkItemType: "User Story" | "Bug" | "Task" | "Test Case" | ...
  title: string;
  state: string; // System.State
  boardColumn?: string; // System.BoardColumn
  assignedTo?: string; // displayName
  assignedToEmail?: string;
  createdBy?: string; // displayName de quien creó el item
  createdByEmail?: string;
  /** Quién cerró el item (Microsoft.VSTS.Common.ClosedBy); sólo en estado Closed */
  closedBy?: string;
  closedDate?: string;
  iterationPath?: string;
  areaPath?: string;
  tags: string[];
  changedDate: string;
  createdDate: string;
  priority?: number;
  storyPoints?: number;
  /** Severidad del Bug (campo estándar Microsoft.VSTS.Common.Severity), ej "2 - High" */
  severity?: string;
  /** Compromiso (campo custom): "Mandatorio" | "Comprometido" | "Deseable" */
  commitment?: string;
  /** Estimación por talle (campo custom): "XS" | "S" | "M" | "L" | "XL" */
  sizeEstimate?: string;
}

/** Clave única de un item en el store (los ids de ADO chocan entre orgs) */
export function itemKey(projectId: string, id: number): string {
  return `${projectId}#${id}`;
}

export type FeedEventKind = "created" | "assigned" | "state" | "column" | "other";

export interface FeedEvent {
  id: string; // único: `${projectId}-${workItemId}-${rev}-${field}`
  projectId: string;
  workItemId: number;
  workItemType: string;
  title: string;
  actor: string; // quién hizo el cambio (revisedBy)
  kind: FeedEventKind;
  text: string; // texto legible, ej: "Ana pasó la US 28173 a Bruno"
  field?: string;
  oldValue?: string;
  newValue?: string;
  timestamp: string; // ISO
}
