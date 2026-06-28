import { useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { testConnection } from "../lib/azureDevOps";
import { resolveConfig, useStore } from "../store/useStore";
import { DEFAULT_LOOKBACK_DAYS, type AzureConfig } from "../types";

const PAT_DOCS = "https://learn.microsoft.com/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate";

interface Props {
  onDone: () => void;
}

export default function Setup({ onDone }: Props) {
  const config = useStore((s) => s.config);
  const envPat = useStore((s) => s.envPat);
  const saveConfig = useStore((s) => s.saveConfig);

  const [org, setOrg] = useState(config?.org ?? "");
  const [project, setProject] = useState(config?.project ?? "");
  const [team, setTeam] = useState(config?.team ?? "");
  const [interval, setInterval] = useState(config?.pollIntervalSec ?? 30);
  const [lookbackDays, setLookbackDays] = useState(config?.lookbackDays ?? DEFAULT_LOOKBACK_DAYS);

  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const buildConfig = (): AzureConfig => ({
    org: org.trim(),
    project: project.trim(),
    team: team.trim() || undefined,
    // El token nunca se ingresa ni se guarda acá: se resuelve desde la variable
    // de entorno en tiempo de ejecución (ver resolveConfig).
    pat: "",
    pollIntervalSec: Math.max(10, Number(interval) || 30),
    lookbackDays: Math.max(1, Math.floor(Number(lookbackDays) || DEFAULT_LOOKBACK_DAYS)),
  });

  // Solo se puede operar si el token está en la variable de entorno.
  const canSubmit = Boolean(org.trim() && project.trim() && envPat);

  async function handleTest() {
    setTesting(true);
    setResult(null);
    try {
      const effective = resolveConfig(buildConfig(), envPat)!;
      const count = await testConnection(effective);
      setResult({ ok: true, msg: `¡Conexión exitosa! Se detectaron ${count} items recientes.` });
    } catch (e) {
      setResult({ ok: false, msg: e instanceof Error ? e.message : String(e) });
    } finally {
      setTesting(false);
    }
  }

  async function handleSave() {
    await saveConfig(buildConfig());
    onDone();
  }

  return (
    <div className="h-full overflow-y-auto bg-slate-950 flex items-center justify-center p-6">
      <div className="w-full max-w-xl">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-white">Scrum Cockpit</h1>
          <p className="text-slate-400 text-sm mt-1">
            Conectá tu proyecto de Azure DevOps para ver el feed de actividad, el board y las métricas.
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
          <Field label="Organización" hint="El nombre que aparece en dev.azure.com/TU-ORG">
            <input
              className="input"
              placeholder="mi-organizacion"
              value={org}
              onChange={(e) => setOrg(e.target.value)}
            />
          </Field>

          <Field label="Proyecto" hint="Nombre exacto del proyecto en Azure DevOps">
            <input
              className="input"
              placeholder="Mi Proyecto"
              value={project}
              onChange={(e) => setProject(e.target.value)}
            />
          </Field>

          <Field label="Equipo (opcional)" hint="Necesario sólo para las métricas de sprint">
            <input
              className="input"
              placeholder="Mi Proyecto Team"
              value={team}
              onChange={(e) => setTeam(e.target.value)}
            />
          </Field>

          {envPat ? (
            <div className="text-sm rounded-lg px-3 py-2 bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
              ✓ Token detectado en la variable de entorno. Por seguridad, el PAT solo se lee de
              ahí y nunca se guarda en disco.
            </div>
          ) : (
            <div className="text-sm rounded-lg px-3 py-3 bg-amber-500/10 text-amber-200 border border-amber-500/30 space-y-2">
              <p className="font-medium">
                ⚠️ No se detectó el token. Por seguridad, Scrum Cockpit lee el PAT solo desde una
                variable de entorno (nunca se guarda en disco).
              </p>
              <p>Definí <code className="text-amber-100">AZURE_DEVOPS_EXT_PAT</code> y reiniciá la app:</p>
              <pre className="bg-black/40 rounded p-2 text-xs overflow-x-auto text-amber-100">{`# Linux / macOS
export AZURE_DEVOPS_EXT_PAT="tu-token"

# Windows (PowerShell, permanente)
setx AZURE_DEVOPS_EXT_PAT "tu-token"`}</pre>
              <button
                type="button"
                onClick={() => openUrl(PAT_DOCS)}
                className="text-xs text-sky-400 hover:text-sky-300 text-left"
              >
                ¿Cómo genero un PAT? (scopes: Work Items Read, Project and Team Read) →
              </button>
            </div>
          )}

          <Field label="Intervalo de actualización (segundos)" hint="Cada cuánto consulta cambios (mínimo 10)">
            <input
              className="input w-32"
              type="number"
              min={10}
              value={interval}
              onChange={(e) => setInterval(Number(e.target.value))}
            />
          </Field>

          <Field
            label="Traer actividad de los últimos (días)"
            hint="Sólo carga items modificados en esta ventana. Default 60 (~2 meses). Subilo si necesitás ver versiones más viejas."
          >
            <input
              className="input w-32"
              type="number"
              min={1}
              value={lookbackDays}
              onChange={(e) => setLookbackDays(Number(e.target.value))}
            />
          </Field>

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

          <div className="flex gap-3 pt-2">
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
              onClick={handleSave}
              disabled={!canSubmit}
              className="btn-primary flex-1"
            >
              Guardar y entrar
            </button>
          </div>
        </div>

        <p className="text-xs text-slate-600 text-center mt-4">
          El token se lee de una variable de entorno y nunca se guarda en disco. Todo corre
          localmente: no se envía a ningún servidor externo.
        </p>
      </div>

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
    </div>
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
