// Selector de proyectos de la barra superior.
//
// Es multiselección a propósito: con uno elegido funciona como un switcher
// clásico (mismas pestañas, otro proyecto), y con varios se ven todos a la vez
// en una sola vista fusionada, como tener dos pestañas del navegador abiertas.
import { useEffect, useRef, useState } from "react";
import { useStore } from "../store/useStore";
import { projectColor } from "./ProjectBadge";

export default function ProjectSwitcher({ onManage }: { onManage: () => void }) {
  const config = useStore((s) => s.config);
  const envPats = useStore((s) => s.envPats);
  const setActiveIds = useStore((s) => s.setActiveIds);
  const sync = useStore((s) => s.sync);

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const { projects, activeIds } = config;
  // activeIds vacío = todos visibles (estado inicial y tras borrar la selección).
  const isActive = (id: string) => activeIds.length === 0 || activeIds.includes(id);
  const activeCount = activeIds.length === 0 ? projects.length : activeIds.length;

  const toggle = (id: string) => {
    const current = activeIds.length === 0 ? projects.map((p) => p.id) : activeIds;
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    // No dejamos apagar el último: sin proyectos no hay nada que mostrar.
    if (next.length === 0) return;
    void setActiveIds(next.length === projects.length ? [] : next);
  };

  const only = (id: string) => {
    void setActiveIds(projects.length === 1 ? [] : [id]);
    setOpen(false);
  };

  const summary =
    projects.length === 0
      ? "Sin proyectos"
      : activeCount === 1
        ? (projects.find((p) => isActive(p.id))?.label ?? "Proyecto")
        : `${activeCount} proyectos`;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-sm text-slate-100 hover:border-slate-600"
        title="Elegir qué proyectos ver"
      >
        <span className="truncate max-w-40">{summary}</span>
        <span className="text-slate-500">▾</span>
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-1 w-72 bg-slate-800 border border-slate-700 rounded-lg shadow-xl p-1">
          {projects.length === 0 ? (
            <p className="px-2 py-2 text-xs text-slate-400">
              Todavía no hay proyectos configurados.
            </p>
          ) : (
            projects.map((p, i) => {
              const hasToken = Boolean(envPats[p.patEnvVar]);
              const err = sync[p.id]?.error;
              return (
                <div
                  key={p.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-700/60 group"
                >
                  <input
                    type="checkbox"
                    className="accent-sky-500 shrink-0"
                    checked={isActive(p.id)}
                    onChange={() => toggle(p.id)}
                  />
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 border ${projectColor(p, i)}`}
                    aria-hidden
                  />
                  <button
                    type="button"
                    onClick={() => only(p.id)}
                    className="flex-1 min-w-0 text-left"
                    title="Ver sólo este proyecto"
                  >
                    <span className="block text-sm text-slate-100 truncate">{p.label}</span>
                    <span className="block text-[11px] text-slate-500 truncate">
                      {p.org}/{p.project}
                    </span>
                  </button>
                  {!hasToken ? (
                    <span
                      className="text-amber-400 text-xs shrink-0"
                      title={`Falta la variable de entorno ${p.patEnvVar}`}
                    >
                      ⚠
                    </span>
                  ) : err ? (
                    <span className="text-red-400 text-xs shrink-0" title={err}>
                      ●
                    </span>
                  ) : null}
                </div>
              );
            })
          )}

          <div className="border-t border-slate-700 mt-1 pt-1">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onManage();
              }}
              className="w-full text-left px-2 py-1.5 text-xs text-sky-400 hover:text-sky-300 hover:bg-slate-700/60 rounded"
            >
              + Agregar / administrar proyectos
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
