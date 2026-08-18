import { useEffect, useMemo, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { testConnection } from "../lib/azureDevOps";
import { newProjectId, normalizeProject, useStore } from "../store/useStore";
import { DEFAULT_PAT_ENV_VAR, listPatEnvVars } from "../lib/env";
import { normalizeSize, safeSizePoints } from "../lib/points";
import { projectColor } from "../components/ProjectBadge";
import {
  DEFAULT_SIZE_POINTS,
  type ProjectConfig,
  type SizePoints,
} from "../types";

const PAT_DOCS =
  "https://learn.microsoft.com/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate";

interface Props {
  onDone: () => void;
}

const emptyDraft = (index: number): ProjectConfig => ({
  id: newProjectId(),
  label: "",
  org: "",
  project: "",
  team: "",
  patEnvVar: DEFAULT_PAT_ENV_VAR,
  colorIndex: index,
});

export default function Setup({ onDone }: Props) {
  const config = useStore((s) => s.config);
  const envPats = useStore((s) => s.envPats);
  const upsertProject = useStore((s) => s.upsertProject);
  const removeProject = useStore((s) => s.removeProject);
  const setGlobalSettings = useStore((s) => s.setGlobalSettings);
  const refreshEnvPats = useStore((s) => s.refreshEnvPats);

  const items = useStore((s) => s.items);
  const [draft, setDraft] = useState<ProjectConfig | null>(null);
  const [envVars, setEnvVars] = useState<string[]>([]);

  // Talles que aparecen en los datos ya cargados: si el equipo usa uno que no
  // está en la tabla, esas US valdrían 0 pts sin que se note. Mostrándolos acá
  // el hueco queda a la vista y se le puede poner un valor.
  const observedSizes = useMemo(() => {
    const set = new Set<string>();
    for (const it of Object.values(items)) {
      if (it.sizeEstimate?.trim()) set.add(normalizeSize(it.sizeEstimate));
    }
    return [...set];
  }, [items]);

  useEffect(() => {
    listPatEnvVars().then(setEnvVars);
  }, []);

  // Si no hay ningún proyecto, abrimos directo el formulario de alta.
  useEffect(() => {
    if (config.projects.length === 0 && draft === null) setDraft(emptyDraft(0));
  }, [config.projects.length, draft]);

  const hasProjects = config.projects.length > 0;
  const canClose = hasProjects && draft === null;

  return (
    <div className="h-full overflow-y-auto bg-slate-950 p-6">
      <div className="w-full max-w-3xl mx-auto space-y-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white">Scrum Cockpit</h1>
          <p className="text-slate-400 text-sm mt-1">
            Conectá uno o varios proyectos de Azure DevOps. Podés verlos de a uno o todos a la vez.
          </p>
        </div>

        {/* Proyectos configurados */}
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-200">Proyectos</h2>
            {draft === null && (
              <button
                type="button"
                onClick={() => setDraft(emptyDraft(config.projects.length))}
                className="btn-secondary text-xs"
              >
                + Agregar proyecto
              </button>
            )}
          </div>

          {!hasProjects && draft === null && (
            <p className="text-sm text-slate-500">Todavía no hay proyectos.</p>
          )}

          {config.projects.map((p, i) => (
            <ProjectRow
              key={p.id}
              project={p}
              index={i}
              hasToken={Boolean(envPats[p.patEnvVar])}
              onEdit={() => setDraft({ ...p, team: p.team ?? "" })}
              onRemove={() => removeProject(p.id)}
              disabled={draft !== null}
            />
          ))}

          {draft && (
            <ProjectForm
              draft={draft}
              envVars={envVars}
              envPats={envPats}
              lookbackDays={config.lookbackDays}
              onChange={setDraft}
              onCancel={hasProjects ? () => setDraft(null) : undefined}
              onSave={async (p) => {
                await upsertProject(p);
                setDraft(null);
              }}
              onRefreshEnv={async () => {
                await refreshEnvPats();
                setEnvVars(await listPatEnvVars());
              }}
            />
          )}
        </section>

        {/* Ajustes globales */}
        <GlobalSettings
          pollIntervalSec={config.pollIntervalSec}
          lookbackDays={config.lookbackDays}
          sizePoints={config.sizePoints}
          observedSizes={observedSizes}
          onSave={setGlobalSettings}
        />

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onDone}
            disabled={!canClose}
            className="btn-primary"
            title={canClose ? "" : "Guardá o cancelá el proyecto en edición"}
          >
            Listo
          </button>
        </div>

        <p className="text-xs text-slate-600 text-center">
          Los tokens se leen de variables de entorno y nunca se guardan en disco. Todo corre
          localmente: no se envía a ningún servidor externo.
        </p>
      </div>

      <SetupStyles />
    </div>
  );
}

function ProjectRow({
  project,
  index,
  hasToken,
  onEdit,
  onRemove,
  disabled,
}: {
  project: ProjectConfig;
  index: number;
  hasToken: boolean;
  onEdit: () => void;
  onRemove: () => void;
  disabled: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="flex items-center gap-3 bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-2">
      <span
        className={`w-2.5 h-2.5 rounded-full border shrink-0 ${projectColor(project, index)}`}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-slate-100 truncate">{project.label}</p>
        <p className="text-xs text-slate-500 truncate">
          {project.org}/{project.project}
          {project.team ? ` · ${project.team}` : ""} · {project.patEnvVar}
        </p>
      </div>
      {!hasToken && (
        <span
          className="text-xs text-amber-300 shrink-0"
          title={`Definí la variable ${project.patEnvVar} y reiniciá la app`}
        >
          ⚠ sin token
        </span>
      )}
      {confirming ? (
        <>
          <button onClick={onRemove} className="text-xs text-red-400 hover:text-red-300">
            Confirmar
          </button>
          <button
            onClick={() => setConfirming(false)}
            className="text-xs text-slate-400 hover:text-slate-200"
          >
            Cancelar
          </button>
        </>
      ) : (
        <>
          <button
            onClick={onEdit}
            disabled={disabled}
            className="text-xs text-sky-400 hover:text-sky-300 disabled:opacity-40"
          >
            Editar
          </button>
          <button
            onClick={() => setConfirming(true)}
            disabled={disabled}
            className="text-xs text-slate-500 hover:text-red-400 disabled:opacity-40"
          >
            Quitar
          </button>
        </>
      )}
    </div>
  );
}

function ProjectForm({
  draft,
  envVars,
  envPats,
  lookbackDays,
  onChange,
  onCancel,
  onSave,
  onRefreshEnv,
}: {
  draft: ProjectConfig;
  envVars: string[];
  envPats: Record<string, string | null>;
  lookbackDays: number;
  onChange: (p: ProjectConfig) => void;
  onCancel?: () => void;
  onSave: (p: ProjectConfig) => Promise<void>;
  onRefreshEnv: () => Promise<void>;
}) {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const set = <K extends keyof ProjectConfig>(key: K, value: ProjectConfig[K]) => {
    onChange({ ...draft, [key]: value });
    setResult(null);
  };

  const pat = envPats[draft.patEnvVar]?.trim() ?? "";
  const canSubmit = Boolean(draft.org.trim() && draft.project.trim() && draft.patEnvVar.trim());

  // Ofrecemos las variables detectadas más la que ya tenga el proyecto.
  const envOptions = useMemo(() => {
    const set = new Set([DEFAULT_PAT_ENV_VAR, ...envVars]);
    if (draft.patEnvVar.trim()) set.add(draft.patEnvVar.trim());
    return [...set].sort();
  }, [envVars, draft.patEnvVar]);

  async function handleTest() {
    setTesting(true);
    setResult(null);
    try {
      if (!pat) throw new Error(`La variable ${draft.patEnvVar} no está definida en este sistema.`);
      const count = await testConnection({ ...normalizeProject(draft), pat, lookbackDays });
      setResult({ ok: true, msg: `¡Conexión exitosa! Se detectaron ${count} items recientes.` });
    } catch (e) {
      setResult({ ok: false, msg: e instanceof Error ? e.message : String(e) });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="bg-slate-950/60 border border-sky-900/60 rounded-lg p-4 space-y-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Nombre" hint="Cómo lo vas a ver en el selector, ej “Mobile”">
          <input
            className="input"
            placeholder="Mobile"
            value={draft.label}
            onChange={(e) => set("label", e.target.value)}
          />
        </Field>
        <Field label="Organización" hint="El nombre que aparece en dev.azure.com/TU-ORG">
          <input
            className="input"
            placeholder="mi-organizacion"
            value={draft.org}
            onChange={(e) => set("org", e.target.value)}
          />
        </Field>
        <Field label="Proyecto" hint="Nombre exacto del proyecto en Azure DevOps">
          <input
            className="input"
            placeholder="Mi Proyecto"
            value={draft.project}
            onChange={(e) => set("project", e.target.value)}
          />
        </Field>
        <Field label="Equipo (opcional)" hint="Necesario sólo para las métricas de sprint">
          <input
            className="input"
            placeholder="Mi Proyecto Team"
            value={draft.team ?? ""}
            onChange={(e) => set("team", e.target.value)}
          />
        </Field>
      </div>

      <Field
        label="Variable de entorno con el token"
        hint="Cada proyecto puede usar su propia variable, así podés conectar organizaciones con tokens distintos. El nombre debe contener PAT o TOKEN."
      >
        <div className="flex gap-2">
          <input
            className="input"
            list="pat-env-vars"
            placeholder={DEFAULT_PAT_ENV_VAR}
            value={draft.patEnvVar}
            onChange={(e) => set("patEnvVar", e.target.value.toUpperCase())}
          />
          <datalist id="pat-env-vars">
            {envOptions.map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
          <button type="button" onClick={onRefreshEnv} className="btn-secondary shrink-0">
            Releer
          </button>
        </div>
      </Field>

      {pat ? (
        <div className="text-sm rounded-lg px-3 py-2 bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
          ✓ Token detectado en <code>{draft.patEnvVar}</code>. Nunca se guarda en disco.
        </div>
      ) : (
        <div className="text-sm rounded-lg px-3 py-3 bg-amber-500/10 text-amber-200 border border-amber-500/30 space-y-2">
          <p className="font-medium">
            ⚠️ La variable <code className="text-amber-100">{draft.patEnvVar || "—"}</code> no está
            definida. Definila y reiniciá la app:
          </p>
          <pre className="bg-black/40 rounded p-2 text-xs overflow-x-auto text-amber-100">{`# Linux / macOS
export ${draft.patEnvVar || DEFAULT_PAT_ENV_VAR}="tu-token"

# Windows (PowerShell, permanente)
setx ${draft.patEnvVar || DEFAULT_PAT_ENV_VAR} "tu-token"`}</pre>
          <button
            type="button"
            onClick={() => openUrl(PAT_DOCS)}
            className="text-xs text-sky-400 hover:text-sky-300 text-left"
          >
            ¿Cómo genero un PAT? (scopes: Work Items Read, Project and Team Read) →
          </button>
        </div>
      )}

      {result && (
        <div
          className={`text-sm rounded-lg px-3 py-2 ${
            result.ok
              ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
              : "bg-red-500/15 text-red-300 border border-red-500/30"
          }`}
        >
          {result.msg}
        </div>
      )}

      <div className="flex gap-3 pt-1">
        <button
          type="button"
          onClick={handleTest}
          disabled={!canSubmit || testing}
          className="btn-secondary"
        >
          {testing ? "Probando…" : "Probar conexión"}
        </button>
        <button
          type="button"
          onClick={() => onSave(draft)}
          disabled={!canSubmit}
          className="btn-primary flex-1"
        >
          Guardar proyecto
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="btn-secondary">
            Cancelar
          </button>
        )}
      </div>
    </div>
  );
}

/** Ajustes que valen para todos los proyectos. */
function GlobalSettings({
  pollIntervalSec,
  lookbackDays,
  sizePoints,
  observedSizes,
  onSave,
}: {
  pollIntervalSec: number;
  lookbackDays: number;
  sizePoints: SizePoints;
  observedSizes: string[];
  onSave: (s: {
    pollIntervalSec?: number;
    lookbackDays?: number;
    sizePoints?: SizePoints;
  }) => Promise<void>;
}) {
  const table = useMemo(() => safeSizePoints(sizePoints), [sizePoints]);
  const sizes = useMemo(
    () => [
      ...new Set([...Object.keys(DEFAULT_SIZE_POINTS), ...Object.keys(table), ...observedSizes]),
    ],
    [table, observedSizes],
  );
  const unmapped = sizes.filter((s) => table[s] == null);

  return (
    <section className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
      <h2 className="text-sm font-semibold text-slate-200">Ajustes generales</h2>

      <div className="grid sm:grid-cols-2 gap-3">
        <Field
          label="Intervalo de actualización (segundos)"
          hint="Cada cuánto consulta cambios (mínimo 10)"
        >
          <CommitNumberInput
            value={pollIntervalSec}
            onCommit={(n) => onSave({ pollIntervalSec: Math.max(10, n || 30) })}
            min={10}
          />
        </Field>

        <Field
          label="Traer actividad de los últimos (días)"
          hint="Sólo carga items modificados en esta ventana. Default 60 (~2 meses). Cambiarla recarga los datos."
        >
          <CommitNumberInput
            value={lookbackDays}
            onCommit={(n) => onSave({ lookbackDays: Math.max(1, Math.floor(n || 60)) })}
            min={1}
          />
        </Field>
      </div>

      <Field
        label="Puntos por talle (campo “Estimación”)"
        hint="Se usa sólo cuando la US no tiene Story Points, así ningún item se cuenta dos veces."
      >
        <div className="flex flex-wrap gap-2">
          {sizes.map((size) => (
            <label key={size} className="flex items-center gap-1">
              <span
                className={`text-xs w-8 truncate ${table[size] == null ? "text-amber-300" : "text-slate-400"}`}
                title={size}
              >
                {size}
              </span>
              <CommitNumberInput
                value={table[size] ?? 0}
                onCommit={(n) => onSave({ sizePoints: { ...table, [size]: n } })}
                min={0}
                step="0.5"
                className="input w-16"
              />
            </label>
          ))}
        </div>
        {unmapped.length > 0 && (
          <p className="text-xs text-amber-300 mt-1">
            Estos talles aparecen en tus items pero no tienen puntos asignados:{" "}
            {unmapped.join(", ")}. Hasta que les pongas un valor, esas US suman 0.
          </p>
        )}
      </Field>
    </section>
  );
}

/**
 * Input numérico que confirma al salir del campo (o con Enter). Guardar en cada
 * tecla haría que escribir "120" pase por 1 y 12, y cambiar la ventana de datos
 * dispara una recarga completa.
 */
function CommitNumberInput({
  value,
  onCommit,
  min,
  step,
  className = "input w-32",
}: {
  value: number;
  onCommit: (n: number) => void;
  min?: number;
  step?: string;
  className?: string;
}) {
  const [draft, setDraft] = useState(String(value));

  // Si el valor cambia desde afuera (otra pantalla, reset), reflejarlo.
  useEffect(() => setDraft(String(value)), [value]);

  const commit = () => {
    const n = Number(draft);
    if (!Number.isFinite(n) || n === value) {
      setDraft(String(value));
      return;
    }
    onCommit(n);
  };

  return (
    <input
      className={className}
      type="number"
      min={min}
      step={step}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-300 mb-1">{label}</label>
      {children}
      {hint && <p className="text-xs text-slate-500 mt-1">{hint}</p>}
    </div>
  );
}

function SetupStyles() {
  return (
    <style>{`
      .input {
        width: 100%;
        background: #0f172a;
        border: 1px solid #1e293b;
        border-radius: 8px;
        padding: 8px 12px;
        color: #e2e8f0;
        font-size: 14px;
        outline: none;
      }
      .input:focus { border-color: #38bdf8; }
      .btn-primary {
        background: #0284c7;
        color: white;
        border-radius: 8px;
        padding: 8px 16px;
        font-size: 14px;
        font-weight: 600;
      }
      .btn-primary:hover:not(:disabled) { background: #0369a1; }
      .btn-primary:disabled { opacity: 0.5; }
      .btn-secondary {
        background: #1e293b;
        color: #e2e8f0;
        border-radius: 8px;
        padding: 8px 16px;
        font-size: 14px;
        font-weight: 500;
      }
      .btn-secondary:hover:not(:disabled) { background: #334155; }
      .btn-secondary:disabled { opacity: 0.5; }
    `}</style>
  );
}
