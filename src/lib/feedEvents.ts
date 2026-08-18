// Transforma los "updates" de Azure DevOps en eventos legibles para el feed.
import type { FeedEvent } from "../types";
import type { WorkItemUpdate } from "./azureDevOps";
import { personName } from "./azureDevOps";
import { shortType } from "./format";

function fieldStr(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  // Campos persona vienen como objeto { displayName }
  const asPerson = personName(value);
  if (asPerson) return asPerson;
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return undefined;
}

/**
 * Convierte el historial de updates de un work item en una lista de eventos del feed.
 * Genera frases como "Ana pasó la US 28173 a Bruno".
 */
export function updatesToEvents(
  projectId: string,
  workItemId: number,
  type: string,
  title: string,
  updates: WorkItemUpdate[],
): FeedEvent[] {
  const events: FeedEvent[] = [];
  const t = shortType(type);

  for (const u of updates) {
    const fields = u.fields || {};
    const actor = u.revisedBy?.displayName ?? "Alguien";
    const ts =
      fieldStr(fields["System.ChangedDate"]?.newValue) ?? u.revisedDate ?? new Date().toISOString();

    const base = { projectId, workItemId, workItemType: type, title, actor, timestamp: ts };

    // Alta del work item (primera revisión)
    if (u.rev === 1) {
      const assignee = fieldStr(fields["System.AssignedTo"]?.newValue);
      events.push({
        ...base,
        id: `${projectId}-${workItemId}-${u.rev}-created`,
        kind: "created",
        text: assignee
          ? `Nueva ${t} ${workItemId} cargada a ${assignee}`
          : `Nueva ${t} ${workItemId} cargada`,
      });
      continue;
    }

    // Cambio de asignación
    const assignField = fields["System.AssignedTo"];
    const from = fieldStr(assignField?.oldValue);
    const to = fieldStr(assignField?.newValue);
    if (assignField && to !== from) {
      events.push({
        ...base,
        id: `${projectId}-${workItemId}-${u.rev}-assigned`,
        kind: "assigned",
        field: "System.AssignedTo",
        oldValue: from,
        newValue: to,
        text: to
          ? `${actor} pasó la ${t} ${workItemId} a ${to}`
          : `${actor} desasignó la ${t} ${workItemId}`,
      });
    }

    // Cambio de columna del board (más específico que el estado)
    const colField = fields["System.BoardColumn"];
    if (colField) {
      const o = fieldStr(colField.oldValue);
      const n = fieldStr(colField.newValue);
      if (n && n !== o) {
        events.push({
          ...base,
          id: `${projectId}-${workItemId}-${u.rev}-column`,
          kind: "column",
          field: "System.BoardColumn",
          oldValue: o,
          newValue: n,
          text: o
            ? `${actor} movió la ${t} ${workItemId} de "${o}" a "${n}"`
            : `${actor} movió la ${t} ${workItemId} a "${n}"`,
        });
      }
    }

    // Cambio de estado (sólo si no hubo cambio de columna, para no duplicar)
    const stateField = fields["System.State"];
    if (stateField && !colField) {
      const o = fieldStr(stateField.oldValue);
      const n = fieldStr(stateField.newValue);
      if (n && n !== o) {
        events.push({
          ...base,
          id: `${projectId}-${workItemId}-${u.rev}-state`,
          kind: "state",
          field: "System.State",
          oldValue: o,
          newValue: n,
          text: o
            ? `${actor} cambió la ${t} ${workItemId} de "${o}" a "${n}"`
            : `${actor} marcó la ${t} ${workItemId} como "${n}"`,
        });
      }
    }
  }

  return events;
}
