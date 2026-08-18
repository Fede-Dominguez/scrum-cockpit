import { useEffect, useMemo, useState } from "react";
import {
  activeProjects,
  aggregateStatus,
  runnableProjects,
  useStore,
} from "./store/useStore";
import { stopPolling, syncNow, syncPollers } from "./lib/poller";
import { relativeTime } from "./lib/format";
import { DEFAULT_LOOKBACK_DAYS } from "./types";
import ProjectSwitcher from "./components/ProjectSwitcher";
import Setup from "./views/Setup";
import Board from "./views/Board";
import Feed from "./views/Feed";
import Metrics from "./views/Metrics";
import Evolution from "./views/Evolution";
import QA from "./views/QA";

type View = "feed" | "board" | "metrics" | "evolution" | "qa";

const NAV: { id: View; label: string; icon: string }[] = [
  { id: "feed", label: "Actividad", icon: "📡" },
  { id: "board", label: "Board", icon: "🗂️" },
  { id: "metrics", label: "Métricas", icon: "📊" },
  { id: "evolution", label: "Evolutivo", icon: "📈" },
  { id: "qa", label: "QA", icon: "🧪" },
];

export default function App() {
  const configLoaded = useStore((s) => s.configLoaded);
  const config = useStore((s) => s.config);
  const envPats = useStore((s) => s.envPats);
  const loadPersisted = useStore((s) => s.loadPersisted);

  const [view, setView] = useState<View>("feed");
  const [editingConfig, setEditingConfig] = useState(false);

  useEffect(() => {
    loadPersisted();
  }, [loadPersisted]);

  // Proyectos activos que además tienen su token disponible.
  const runnable = useMemo(() => runnableProjects(config, envPats), [config, envPats]);

  // Un ciclo de polling por proyecto activo. syncPollers reconcilia (arranca los
  // nuevos, para los que se fueron, deja andando los que no cambiaron), así que
  // NO cortamos todo en el cleanup: eso reiniciaría los ciclos en cada cambio.
  useEffect(() => {
    if (editingConfig) {
      stopPolling();
      return;
    }
    syncPollers(runnable, {
      pollIntervalSec: config.pollIntervalSec,
      lookbackDays: config.lookbackDays,
    });
  }, [runnable, config.pollIntervalSec, config.lookbackDays, editingConfig]);

  // Al desmontar la app sí frenamos todo.
  useEffect(() => stopPolling, []);

  if (!configLoaded) {
    return (
      <div className="h-full flex items-center justify-center text-slate-500">Cargando…</div>
    );
  }

  // Sin proyectos configurados (o ninguno con token) no hay nada que mostrar:
  // el Setup explica cómo definir la variable de entorno de cada uno.
  const anyToken = config.projects.some((p) => envPats[p.patEnvVar]);
  if (config.projects.length === 0 || editingConfig || !anyToken) {
    return <Setup onDone={() => setEditingConfig(false)} />;
  }

  return (
    <div className="h-full flex flex-col bg-slate-950">
      <TopBar view={view} onView={setView} onSettings={() => setEditingConfig(true)} />
      <div className="flex-1 min-h-0">
        {view === "feed" && <Feed />}
        {view === "board" && <Board />}
        {view === "metrics" && <Metrics />}
        {view === "evolution" && <Evolution />}
        {view === "qa" && <QA />}
      </div>
      <StatusBar />
    </div>
  );
}

function TopBar({
  view,
  onView,
  onSettings,
}: {
  view: View;
  onView: (v: View) => void;
  onSettings: () => void;
}) {
  return (
    <div className="flex items-center gap-1 px-3 py-2 border-b border-slate-800 bg-slate-900">
      <span className="font-bold text-white mr-3 select-none">Scrum Cockpit</span>
      {NAV.map((n) => (
        <button
          key={n.id}
          onClick={() => onView(n.id)}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            view === n.id
              ? "bg-sky-600 text-white"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
          }`}
        >
          <span className="mr-1">{n.icon}</span>
          {n.label}
        </button>
      ))}
      <div className="ml-auto flex items-center gap-3">
        <LookbackSelect />
        <ProjectSwitcher onManage={onSettings} />
        <button
          onClick={onSettings}
          className="text-slate-400 hover:text-slate-200 text-sm"
          title="Configuración"
        >
          ⚙️
        </button>
      </div>
    </div>
  );
}

// Presets de la ventana de datos, en meses → días. Controla qué tan atrás se
// traen items de ADO (System.ChangedDate), así que aplica a todas las pestañas.
const LOOKBACK_PRESETS = [
  { months: 2, days: 60 },
  { months: 3, days: 90 },
  { months: 4, days: 120 },
  { months: 6, days: 180 },
  { months: 12, days: 365 },
];

/** Selector "traer sprints de los últimos N meses" en la barra superior. */
function LookbackSelect() {
  const lookbackDays = useStore((s) => s.config.lookbackDays);
  const setGlobalSettings = useStore((s) => s.setGlobalSettings);
  const sync = useStore((s) => s.sync);
  const syncing = Object.values(sync).some((s) => s.status === "syncing");
  const current = lookbackDays ?? DEFAULT_LOOKBACK_DAYS;
  // Si el valor guardado no coincide con un preset, lo mostramos igual (≈ meses).
  const isPreset = LOOKBACK_PRESETS.some((p) => p.days === current);

  return (
    <label
      className="flex items-center gap-1 text-xs text-slate-500"
      title="Cuántos meses de actividad traer (afecta todas las pestañas y todos los proyectos)"
    >
      <span>Últimos</span>
      <select
        className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-100 outline-none focus:border-sky-500 disabled:opacity-50"
        value={current}
        disabled={syncing}
        onChange={(e) => void setGlobalSettings({ lookbackDays: Number(e.target.value) })}
      >
        {!isPreset && <option value={current}>≈{Math.round(current / 30)} meses</option>}
        {LOOKBACK_PRESETS.map((p) => (
          <option key={p.days} value={p.days}>
            {p.months} meses
          </option>
        ))}
      </select>
    </label>
  );
}

function StatusBar() {
  const config = useStore((s) => s.config);
  const envPats = useStore((s) => s.envPats);
  const sync = useStore((s) => s.sync);
  const itemCount = useStore((s) => Object.keys(s.items).length);

  const active = useMemo(() => activeProjects(config), [config]);
  const activeIds = active.map((p) => p.id);
  const status = aggregateStatus(sync, activeIds);

  // El sync más reciente entre los proyectos visibles.
  const lastSync = activeIds
    .map((id) => sync[id]?.lastSync)
    .filter((x): x is string => Boolean(x))
    .sort()
    .pop();

  // Errores por proyecto: se muestran juntos y con el nombre delante, así se
  // sabe cuál de los proyectos está fallando.
  const errors = active
    .map((p) => (sync[p.id]?.error ? `${p.label}: ${sync[p.id]!.error}` : null))
    .filter((x): x is string => Boolean(x));

  const missingToken = active.filter((p) => !envPats[p.patEnvVar]);

  const dot =
    status === "error"
      ? "bg-red-500"
      : status === "syncing"
        ? "bg-amber-400 animate-pulse"
        : "bg-emerald-500";

  const label =
    status === "error"
      ? "Error de conexión"
      : status === "syncing"
        ? "Sincronizando…"
        : lastSync
          ? `Actualizado ${relativeTime(lastSync)}`
          : "Listo";

  return (
    <div className="flex items-center gap-3 px-4 py-1.5 border-t border-slate-800 bg-slate-900 text-xs">
      <span className={`w-2 h-2 rounded-full ${dot}`} />
      <span className="text-slate-400">{label}</span>
      <span className="text-slate-600">·</span>
      <span className="text-slate-500">
        {itemCount} items · {active.length} proyecto{active.length === 1 ? "" : "s"}
      </span>
      {missingToken.length > 0 && (
        <span
          className="text-amber-300 truncate"
          title={missingToken.map((p) => `${p.label}: falta ${p.patEnvVar}`).join("\n")}
        >
          ⚠ {missingToken.length} sin token
        </span>
      )}
      {errors.length > 0 && (
        <span className="text-red-400 truncate max-w-md" title={errors.join("\n")}>
          {errors[0]}
        </span>
      )}
      <button
        onClick={() => void syncNow()}
        className="ml-auto text-slate-400 hover:text-slate-200"
        disabled={status === "syncing"}
      >
        ↻ Actualizar ahora
      </button>
    </div>
  );
}
