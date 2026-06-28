import { useEffect, useRef, useState } from "react";

/**
 * Desplegable de selección múltiple con checkboxes. Lo usamos para filtrar por
 * varias versiones/releases a la vez (compartido por Board y Evolutivo).
 * El botón muestra cuántas opciones hay elegidas; vacío = "todas".
 */
export default function MultiSelect({
  label,
  options,
  selected,
  onChange,
  renderOption,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  renderOption?: (value: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Cerrar al hacer click afuera.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const toggle = (value: string) => {
    onChange(
      selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value],
    );
  };

  const summary = selected.length === 0 ? `${label}: todas` : `${label}: ${selected.length}`;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1 bg-slate-800 border rounded-lg px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-sky-500 ${
          selected.length ? "border-sky-600" : "border-slate-700"
        }`}
      >
        <span className="truncate max-w-40">{summary}</span>
        <span className="text-slate-500">▾</span>
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-56 max-h-72 overflow-y-auto bg-slate-800 border border-slate-700 rounded-lg shadow-xl p-1">
          {options.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-slate-500">Sin opciones</p>
          ) : (
            <>
              {selected.length > 0 && (
                <button
                  onClick={() => onChange([])}
                  className="w-full text-left px-2 py-1.5 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-700/60 rounded"
                >
                  Limpiar selección
                </button>
              )}
              {options.map((opt) => (
                <label
                  key={opt}
                  className="flex items-center gap-2 px-2 py-1.5 text-sm text-slate-200 hover:bg-slate-700/60 rounded cursor-pointer"
                >
                  <input
                    type="checkbox"
                    className="accent-sky-500"
                    checked={selected.includes(opt)}
                    onChange={() => toggle(opt)}
                  />
                  <span className="truncate">{renderOption ? renderOption(opt) : opt}</span>
                </label>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
