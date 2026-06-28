// Modelo de dominio de Scrum Cockpit

export interface AzureConfig {
  /** Nombre de la organización en dev.azure.com/{org} */
  org: string;
  /** Nombre del proyecto */
  project: string;
  /**
   * Personal Access Token (scopes: Work Items Read, Project and Team Read).
   * No se persiste: se resuelve en runtime desde la variable de entorno
   * (ver resolveConfig / get_env_pat). En la config guardada queda vacío.
   */
  pat: string;
  /** Equipo opcional (para iteraciones / sprints) */
  team?: string;
  /** Intervalo de polling en segundos */
  pollIntervalSec: number;
  /**
   * Ventana de fecha (en días hacia atrás) para traer actividad.
   * Sólo se cargan items con ChangedDate dentro de esta ventana, así no se
   * arrastran sprints/versiones de años atrás. Default 60 (~2 meses).
   */
  lookbackDays?: number;
}

/** Ventana de fecha por defecto (días) si la config no la trae */
export const DEFAULT_LOOKBACK_DAYS = 60;

export interface WorkItem {
  id: number;
  type: string; // System.WorkItemType: "User Story" | "Bug" | "Task" | ...
  title: string;
  state: string; // System.State
  boardColumn?: string; // System.BoardColumn
  assignedTo?: string; // displayName
  assignedToEmail?: string;
  createdBy?: string; // displayName de quien creó el item
  createdByEmail?: string;
  iterationPath?: string;
  areaPath?: string;
  tags: string[];
  changedDate: string;
  createdDate: string;
  priority?: number;
  storyPoints?: number;
  /** Severidad del Bug (campo estándar Microsoft.VSTS.Common.Severity), ej "2 - High" */
  severity?: string;
  /** Compromiso (campo custom): "Mandatorio" | "Comprometido" | ... */
  commitment?: string;
  /** Estimación por talle (campo custom): "XS" | "S" | "M" | "L" | "XL" */
  sizeEstimate?: string;
}

export type FeedEventKind = "created" | "assigned" | "state" | "column" | "other";

export interface FeedEvent {
  id: string; // único: `${workItemId}-${rev}-${field}`
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
