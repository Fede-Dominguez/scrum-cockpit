// Cliente REST de Azure DevOps.
// Usa el plugin HTTP de Tauri (las requests salen desde Rust => sin bloqueo CORS).
import { fetch } from "@tauri-apps/plugin-http";
import { DEFAULT_LOOKBACK_DAYS, type AzureConfig, type WorkItem } from "../types";

const API_VERSION = "7.1";

/** Días de ventana de fecha configurados (o el default), saneado a un entero >= 1 */
function lookbackDays(cfg: AzureConfig): number {
  const n = Math.floor(Number(cfg.lookbackDays));
  return Number.isFinite(n) && n >= 1 ? n : DEFAULT_LOOKBACK_DAYS;
}

/** Campos que pedimos para el board */
export const WORK_ITEM_FIELDS = [
  "System.Id",
  "System.WorkItemType",
  "System.Title",
  "System.State",
  "System.BoardColumn",
  "System.AssignedTo",
  "System.CreatedBy",
  "System.IterationPath",
  "System.AreaPath",
  "System.Tags",
  "System.ChangedDate",
  "System.CreatedDate",
  "Microsoft.VSTS.Common.Priority",
  "Microsoft.VSTS.Common.Severity",
  "Microsoft.VSTS.Scheduling.StoryPoints",
];

/**
 * Campos custom resueltos por nombre visible (su reference name varía por
 * organización/proceso, así que los descubrimos en vez de hardcodearlos).
 */
export interface CustomFieldRefs {
  commitment?: string; // "Compromiso"
  sizeEstimate?: string; // "Estimación"
}

let customFieldCache: CustomFieldRefs | null = null;
let customFieldKey = "";

/** Quita acentos y pasa a minúscula, para matchear nombres de campo */
function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * Descubre los reference names de los campos custom "Compromiso" y "Estimación"
 * consultando la lista de campos del proyecto. Se cachea por org/project.
 */
export async function resolveCustomFields(cfg: AzureConfig): Promise<CustomFieldRefs> {
  const key = `${cfg.org}/${cfg.project}`;
  if (customFieldCache && customFieldKey === key) return customFieldCache;
  try {
    const url = `${projectUrl(cfg)}/_apis/wit/fields?api-version=${API_VERSION}`;
    const data = await adoFetch<{ value: { name: string; referenceName: string }[] }>(cfg, url);
    const find = (needle: string) =>
      data.value.find((f) => norm(f.name).includes(needle))?.referenceName;
    customFieldCache = {
      commitment: find("comprom"),
      sizeEstimate: find("estimac"),
    };
  } catch {
    customFieldCache = {};
  }
  customFieldKey = key;
  return customFieldCache;
}

/** Tipos de work item que seguimos */
export const TRACKED_TYPES = ["User Story", "Bug", "Task"];

function authHeader(pat: string): string {
  // Azure DevOps: Basic con usuario vacío y el PAT como password
  return "Basic " + btoa(":" + pat);
}

function orgUrl(cfg: AzureConfig): string {
  return `https://dev.azure.com/${encodeURIComponent(cfg.org)}`;
}

function projectUrl(cfg: AzureConfig): string {
  return `${orgUrl(cfg)}/${encodeURIComponent(cfg.project)}`;
}

async function adoFetch<T>(cfg: AzureConfig, url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: authHeader(cfg.pat),
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    let detail = "";
    try {
      detail = await res.text();
    } catch {
      /* noop */
    }
    if (res.status === 401 || res.status === 203) {
      throw new Error("Credenciales inválidas (revisá el PAT y sus permisos).");
    }
    if (res.status === 404) {
      throw new Error("No se encontró la organización o el proyecto (revisá los nombres).");
    }
    throw new Error(`Azure DevOps respondió ${res.status}. ${detail.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

/** Extrae el displayName de un campo persona (puede venir como objeto o string) */
export function personName(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null && "displayName" in value) {
    return (value as { displayName?: string }).displayName;
  }
  return undefined;
}

function personEmail(value: unknown): string | undefined {
  if (value && typeof value === "object" && "uniqueName" in value) {
    return (value as { uniqueName?: string }).uniqueName;
  }
  return undefined;
}

interface WiqlResponse {
  workItems: { id: number }[];
}

/** WIQL: IDs de items que cambiaron desde `sinceIso` (o dentro de la ventana de lookback si no se pasa) */
export async function queryChangedIds(cfg: AzureConfig, sinceIso?: string): Promise<number[]> {
  const url = `${projectUrl(cfg)}/_apis/wit/wiql?api-version=${API_VERSION}`;
  const typeList = TRACKED_TYPES.map((t) => `'${t}'`).join(",");
  // WIQL compara [System.ChangedDate] con precisión de día: no acepta hora en
  // el literal (responde 400). Usamos sólo la parte de fecha (YYYY-MM-DD); el
  // tick re-trae el día en curso, pero el store deduplica por id.
  const sinceDate = sinceIso?.slice(0, 10);
  const dateClause = sinceDate
    ? `[System.ChangedDate] >= '${sinceDate}'`
    : `[System.ChangedDate] >= @today - ${lookbackDays(cfg)}`;
  const query =
    `SELECT [System.Id] FROM WorkItems ` +
    `WHERE [System.TeamProject] = @project ` +
    `AND [System.WorkItemType] IN (${typeList}) ` +
    `AND ${dateClause} ` +
    `ORDER BY [System.ChangedDate] DESC`;
  const data = await adoFetch<WiqlResponse>(cfg, url, {
    method: "POST",
    body: JSON.stringify({ query }),
  });
  return data.workItems.map((w) => w.id);
}

/**
 * WIQL: IDs de los items activos del proyecto (excluye Removed) dentro de la
 * ventana de fecha configurada. Limita por ChangedDate para no arrastrar
 * sprints/versiones de años atrás (y evitar el tope de items de la WIQL).
 */
export async function queryAllIds(cfg: AzureConfig): Promise<number[]> {
  const url = `${projectUrl(cfg)}/_apis/wit/wiql?api-version=${API_VERSION}`;
  const typeList = TRACKED_TYPES.map((t) => `'${t}'`).join(",");
  const query =
    `SELECT [System.Id] FROM WorkItems ` +
    `WHERE [System.TeamProject] = @project ` +
    `AND [System.WorkItemType] IN (${typeList}) ` +
    `AND [System.State] <> 'Removed' ` +
    `AND [System.ChangedDate] >= @today - ${lookbackDays(cfg)} ` +
    `ORDER BY [System.ChangedDate] DESC`;
  const data = await adoFetch<WiqlResponse>(cfg, url, {
    method: "POST",
    body: JSON.stringify({ query }),
  });
  return data.workItems.map((w) => w.id);
}

interface RawWorkItem {
  id: number;
  fields: Record<string, unknown>;
}

function mapWorkItem(raw: RawWorkItem, custom: CustomFieldRefs = {}): WorkItem {
  const f = raw.fields;
  const tagsRaw = (f["System.Tags"] as string) || "";
  const str = (ref?: string) => (ref ? (f[ref] as string | undefined) : undefined);
  return {
    id: raw.id,
    type: (f["System.WorkItemType"] as string) || "",
    title: (f["System.Title"] as string) || "(sin título)",
    state: (f["System.State"] as string) || "",
    boardColumn: f["System.BoardColumn"] as string | undefined,
    assignedTo: personName(f["System.AssignedTo"]),
    assignedToEmail: personEmail(f["System.AssignedTo"]),
    createdBy: personName(f["System.CreatedBy"]),
    createdByEmail: personEmail(f["System.CreatedBy"]),
    iterationPath: f["System.IterationPath"] as string | undefined,
    areaPath: f["System.AreaPath"] as string | undefined,
    tags: tagsRaw ? tagsRaw.split(";").map((t) => t.trim()).filter(Boolean) : [],
    changedDate: (f["System.ChangedDate"] as string) || "",
    createdDate: (f["System.CreatedDate"] as string) || "",
    priority: f["Microsoft.VSTS.Common.Priority"] as number | undefined,
    storyPoints: f["Microsoft.VSTS.Scheduling.StoryPoints"] as number | undefined,
    severity: f["Microsoft.VSTS.Common.Severity"] as string | undefined,
    commitment: str(custom.commitment),
    sizeEstimate: str(custom.sizeEstimate),
  };
}

/** Trae los work items completos a partir de sus IDs (batch de a 200) */
export async function getWorkItems(cfg: AzureConfig, ids: number[]): Promise<WorkItem[]> {
  if (ids.length === 0) return [];
  const url = `${orgUrl(cfg)}/_apis/wit/workitemsbatch?api-version=${API_VERSION}`;
  const custom = await resolveCustomFields(cfg);
  const fields = [...WORK_ITEM_FIELDS, custom.commitment, custom.sizeEstimate].filter(
    (x): x is string => Boolean(x),
  );
  const result: WorkItem[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const data = await adoFetch<{ value: RawWorkItem[] }>(cfg, url, {
      method: "POST",
      body: JSON.stringify({ ids: chunk, fields }),
    });
    for (const raw of data.value) result.push(mapWorkItem(raw, custom));
  }
  return result;
}

export interface WorkItemUpdate {
  id: number;
  rev: number;
  revisedBy?: { displayName?: string; uniqueName?: string };
  revisedDate?: string;
  fields?: Record<string, { oldValue?: unknown; newValue?: unknown }>;
}

/** Historial de cambios (updates) de un work item */
export async function getWorkItemUpdates(
  cfg: AzureConfig,
  id: number,
): Promise<WorkItemUpdate[]> {
  const url = `${projectUrl(cfg)}/_apis/wit/workItems/${id}/updates?api-version=${API_VERSION}`;
  const data = await adoFetch<{ value: WorkItemUpdate[] }>(cfg, url);
  return data.value || [];
}

export interface WorkItemComment {
  id: number;
  text: string; // viene como HTML
  createdBy?: string; // displayName
  createdDate?: string; // ISO
}

interface RawComment {
  id: number;
  text?: string;
  createdBy?: { displayName?: string };
  createdDate?: string;
  modifiedDate?: string;
}

/**
 * Comentarios (discusión) de un work item, del más nuevo al más viejo.
 * El endpoint de comentarios sigue en preview (api-version 7.1-preview.4).
 */
export async function getWorkItemComments(
  cfg: AzureConfig,
  id: number,
): Promise<WorkItemComment[]> {
  const url = `${projectUrl(cfg)}/_apis/wit/workItems/${id}/comments?api-version=7.1-preview.4&$top=200`;
  const data = await adoFetch<{ comments?: RawComment[] }>(cfg, url);
  const comments = (data.comments || []).map((c) => ({
    id: c.id,
    text: c.text || "",
    createdBy: c.createdBy?.displayName,
    createdDate: c.createdDate,
  }));
  // ADO los devuelve por id ascendente; mostramos del más reciente arriba.
  return comments.sort(
    (a, b) => new Date(b.createdDate ?? 0).getTime() - new Date(a.createdDate ?? 0).getTime(),
  );
}

/** Prueba de conexión: devuelve la cantidad de items visibles */
export async function testConnection(cfg: AzureConfig): Promise<number> {
  const ids = await queryChangedIds(cfg);
  return ids.length;
}

/** Iteraciones (sprints) del equipo */
export interface Iteration {
  id: string;
  name: string;
  path: string;
  attributes?: { startDate?: string; finishDate?: string; timeFrame?: string };
}

export async function getIterations(cfg: AzureConfig): Promise<Iteration[]> {
  const team = cfg.team?.trim();
  const teamSegment = team ? `/${encodeURIComponent(team)}` : "";
  const url = `${projectUrl(cfg)}${teamSegment}/_apis/work/teamsettings/iterations?api-version=${API_VERSION}`;
  try {
    const data = await adoFetch<{ value: Iteration[] }>(cfg, url);
    return data.value || [];
  } catch {
    // Si no hay equipo configurado o falla, no es crítico
    return [];
  }
}

export interface IterationDates {
  startDate?: string;
  finishDate?: string;
}

interface ClassificationNode {
  name: string;
  attributes?: IterationDates;
  children?: ClassificationNode[];
}

/**
 * Fechas (start/finish) de TODAS las iteraciones del proyecto, no sólo las del
 * equipo. El endpoint de team settings suele omitir sprints viejos sacados del
 * schedule; el árbol de classification nodes los trae igual, y con eso podemos
 * descartar por fecha los sprints fuera de la ventana. La clave del mapa es el
 * IterationPath tal cual aparece en los work items (nombres unidos por "\").
 */
export async function getAllIterationDates(
  cfg: AzureConfig,
): Promise<Record<string, IterationDates>> {
  const url = `${projectUrl(cfg)}/_apis/wit/classificationnodes/iterations?$depth=10&api-version=${API_VERSION}`;
  const out: Record<string, IterationDates> = {};
  try {
    const root = await adoFetch<ClassificationNode>(cfg, url);
    const walk = (node: ClassificationNode, prefix: string) => {
      const path = prefix ? `${prefix}\\${node.name}` : node.name;
      if (node.attributes?.startDate || node.attributes?.finishDate) {
        out[path] = {
          startDate: node.attributes.startDate,
          finishDate: node.attributes.finishDate,
        };
      }
      for (const c of node.children ?? []) walk(c, path);
    };
    walk(root, "");
  } catch {
    // Sin permisos o falla → vacío; se cae al comportamiento sin ventana por fecha.
  }
  return out;
}
