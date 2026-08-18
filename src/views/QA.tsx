// Pestaña QA: quién cerró qué en el sprint y cómo está repartido el testing.
import { useEffect, useMemo, useState } from "react";
import { useSizePoints, useTestCases, useWindowedItems } from "../lib/useWindowedItems";
import { sprintName, uniqueIterations } from "../lib/selectors";
import { Avatar, TypeBadge } from "../components/common";
import ProjectBadge from "../components/ProjectBadge";
import { hasTag, isClosed, isTestCase, sumPoints } from "../lib/workItemStatus";
import { itemPoints } from "../lib/points";
import { relativeTime } from "../lib/format";
import type { SizePoints, WorkItem } from "../types";

/** Tag que marca los test cases de regresión (se compara sin acentos ni mayúsculas). */
const REGRESSION_TAG = "Regresión";

const SIN_ASIGNAR = "Sin asignar";
const SIN_DATO = "Sin dato";

interface PersonBucket {
  name: string;
  items: WorkItem[];
  points: number;
}

/** Agrupa por persona y ordena por la métrica que importa en cada tabla. */
function groupByPerson(
  items: WorkItem[],
  key: (it: WorkItem) => string | undefined,
  fallback: string,
  sizePoints: SizePoints,
  sortBy: "count" | "points",
): PersonBucket[] {
  const map = new Map<string, PersonBucket>();
  for (const it of items) {
    const name = key(it)?.trim() || fallback;
    let bucket = map.get(name);
    if (!bucket) {
      bucket = { name, items: [], points: 0 };
      map.set(name, bucket);
    }
    bucket.items.push(it);
    bucket.points += itemPoints(it, sizePoints);
  }
  const list = [...map.values()];
  for (const b of list) b.points = Math.round(b.points * 100) / 100;
  return list.sort((a, b) =>
    sortBy === "points"
      ? b.points - a.points || b.items.length - a.items.length
      : b.items.length - a.items.length || b.points - a.points,
  );
}

export default function QA() {
  const items = useWindowedItems();
  const testCases = useTestCases();
  const sizePoints = useSizePoints();

  // Los sprints se ofrecen combinando work items y test cases: los test cases de
  // regresión a veces viven en otro sprint que el trabajo que verifican.
  const sprints = useMemo(
    () => uniqueIterations([...items, ...testCases]),
    [items, testCases],
  );

  const [sprint, setSprint] = useState<string>("");
  // Tag de regresión del sprint: por convención es el nombre del sprint
  // ("5.26.05"), pero se puede corregir a mano si el equipo etiqueta distinto.
  const [tagOverride, setTagOverride] = useState<string | null>(null);

  // Elegir el sprint más reciente en cuanto haya datos (y si el elegido desaparece).
  useEffect(() => {
    if (sprints.length && !sprints.includes(sprint)) setSprint(sprints[0]);
  }, [sprints, sprint]);

  const sprintTag = tagOverride ?? sprint;

  const inSprint = useMemo(
    () => items.filter((it) => sprintName(it) === sprint),
    [items, sprint],
  );
  const testCasesInSprint = useMemo(
    () => testCases.filter((it) => sprintName(it) === sprint),
    [testCases, sprint],
  );

  // 1. Cerradas: ADO sólo completa "Closed By" en el estado Closed.
  const closedRows = useMemo(
    () =>
      groupByPerson(
        inSprint.filter(isClosed),
        (it) => it.closedBy,
        SIN_DATO,
        sizePoints,
        "count",
      ),
    [inSprint, sizePoints],
  );

  // 2. Test cases del sprint que NO son de regresión, por tester.
  const funcionalRows = useMemo(
    () =>
      groupByPerson(
        testCasesInSprint.filter((it) => !hasTag(it, REGRESSION_TAG)),
        (it) => it.assignedTo,
        SIN_ASIGNAR,
        sizePoints,
        "count",
      ),
    [testCasesInSprint, sizePoints],
  );

  // 3. Regresión: se identifica por TAGS (regresión + tag del sprint), no por
  //    iteración: esos test cases suelen estar fuera del sprint que verifican.
  const regresionItems = useMemo(
    () =>
      testCases.filter(
        (it) => hasTag(it, REGRESSION_TAG) && (!sprintTag || hasTag(it, sprintTag)),
      ),
    [testCases, sprintTag],
  );
  const regresionRows = useMemo(
    () => groupByPerson(regresionItems, (it) => it.assignedTo, SIN_ASIGNAR, sizePoints, "points"),
    [regresionItems, sizePoints],
  );

  const regresionPoints = useMemo(
    () => sumPoints(regresionItems, sizePoints),
    [regresionItems, sizePoints],
  );

  return (
    <div className="flex flex-col h-full">
      {/* Barra propia: QA razona sobre UN sprint por vez */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-2 border-b border-slate-800 bg-slate-900/60">
        <label className="flex items-center gap-1.5 text-sm">
          <span className="text-xs text-slate-500">Sprint</span>
          <select
            className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-sky-500"
            value={sprint}
            onChange={(e) => {
              setSprint(e.target.value);
              setTagOverride(null); // el tag vuelve a seguir al sprint
            }}
          >
            {sprints.length === 0 && <option value="">Sin sprints</option>}
            {sprints.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <label
          className="flex items-center gap-1.5 text-sm"
          title="Tag que identifica la regresión de este sprint. Por defecto es el nombre del sprint."
        >
          <span className="text-xs text-slate-500">Tag de regresión</span>
          <input
            className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-100 w-32 outline-none focus:border-sky-500"
            value={sprintTag}
            onChange={(e) => setTagOverride(e.target.value)}
            placeholder="5.26.05"
          />
        </label>

        {tagOverride !== null && tagOverride !== sprint && (
          <button
            onClick={() => setTagOverride(null)}
            className="text-xs text-slate-400 hover:text-slate-200"
          >
            Usar el del sprint
          </button>
        )}

        <span className="ml-auto text-xs text-slate-500">
          {testCasesInSprint.length} test cases en el sprint · {regresionItems.length} de regresión
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-5xl mx-auto space-y-4">
          {sprints.length === 0 && (
            <p className="text-sm text-slate-500">
              Todavía no hay datos cargados. Esperá a que termine la primera sincronización.
            </p>
          )}

          <PersonTable
            title={`Items cerrados en ${sprint || "el sprint"} — por quién los cerró`}
            subtitle="Sólo items en estado Closed: es el único donde Azure DevOps completa el campo Closed By."
            rows={closedRows}
            metric="count"
            unit="items"
            empty="No hay items cerrados en este sprint."
          />

          <div className="grid lg:grid-cols-2 gap-4">
            <PersonTable
              title="Test Cases sin tag Regresión"
              subtitle={`Test cases del sprint ${sprint || "seleccionado"}, por tester asignado.`}
              rows={funcionalRows}
              metric="count"
              unit="TC"
              empty="No hay test cases sin el tag de regresión en este sprint."
            />

            <PersonTable
              title="Regresión — puntos por tester"
              subtitle={`Test cases con tag "${REGRESSION_TAG}" + tag "${sprintTag || "—"}". Total: ${regresionPoints} pts.`}
              rows={regresionRows}
              metric="points"
              unit="pts"
              empty={
                sprintTag
                  ? `No hay test cases con los tags "${REGRESSION_TAG}" y "${sprintTag}".`
                  : "Indicá el tag del sprint para contabilizar la regresión."
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Tabla persona → barra + total, con la lista de items desplegable. */
function PersonTable({
  title,
  subtitle,
  rows,
  metric,
  unit,
  empty,
}: {
  title: string;
  subtitle?: string;
  rows: PersonBucket[];
  metric: "count" | "points";
  unit: string;
  empty: string;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const valueOf = (b: PersonBucket) => (metric === "points" ? b.points : b.items.length);
  const max = rows.length ? Math.max(...rows.map(valueOf), 1) : 1;
  const total = rows.reduce((s, b) => s + valueOf(b), 0);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <h3 className="text-sm font-semibold text-slate-300">{title}</h3>
        {rows.length > 0 && (
          <span className="text-xs text-slate-500 shrink-0 tabular-nums">
            {Math.round(total * 100) / 100} {unit}
          </span>
        )}
      </div>
      {subtitle && <p className="text-xs text-slate-500 mb-3">{subtitle}</p>}

      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">{empty}</p>
      ) : (
        <div className="space-y-1">
          {rows.map((b) => {
            const value = valueOf(b);
            const isOpen = open === b.name;
            return (
              <div key={b.name}>
                <button
                  onClick={() => setOpen(isOpen ? null : b.name)}
                  className="w-full flex items-center gap-2 py-0.5 text-left hover:bg-slate-800/50 rounded px-1"
                >
                  <Avatar
                    name={b.name === SIN_ASIGNAR || b.name === SIN_DATO ? undefined : b.name}
                    size={24}
                  />
                  <span className="text-sm text-slate-300 w-36 truncate" title={b.name}>
                    {b.name}
                  </span>
                  <div className="flex-1 bg-slate-800 rounded h-4 overflow-hidden min-w-8">
                    <div
                      className="bg-sky-500/70 h-full"
                      style={{ width: `${(value / max) * 100}%` }}
                    />
                  </div>
                  <span className="text-sm text-slate-200 w-20 text-right tabular-nums shrink-0">
                    {value} {unit}
                  </span>
                  <span className="text-slate-600 text-xs w-3 shrink-0">{isOpen ? "▾" : "▸"}</span>
                </button>
                {isOpen && (
                  <div className="ml-8 mb-2 max-h-60 overflow-y-auto space-y-1 border-l border-slate-800 pl-2">
                    {b.items.map((it) => (
                      <QaItemRow key={`${it.projectId}#${it.id}`} item={it} metric={metric} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function QaItemRow({ item, metric }: { item: WorkItem; metric: "count" | "points" }) {
  const sizePoints = useSizePoints();
  const pts = itemPoints(item, sizePoints);
  return (
    <div className="flex items-center gap-2 text-sm">
      <ProjectBadge projectId={item.projectId} />
      <TypeBadge type={item.type} />
      <span className="text-slate-500 tabular-nums">{item.id}</span>
      <span className="text-slate-300 truncate flex-1" title={item.title}>
        {item.title}
      </span>
      {metric === "points" && pts > 0 && (
        <span className="text-xs text-slate-500 shrink-0">{pts} pts</span>
      )}
      {!isTestCase(item) && item.closedDate && (
        <span className="text-xs text-slate-600 shrink-0">{relativeTime(item.closedDate)}</span>
      )}
    </div>
  );
}
