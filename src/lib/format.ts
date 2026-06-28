// Helpers de presentación

/** Abrevia el tipo de work item para los textos del feed y las cards */
export function shortType(type: string): string {
  switch (type) {
    case "User Story":
      return "US";
    case "Bug":
      return "BUG";
    case "Task":
      return "TASK";
    case "Feature":
      return "FEAT";
    case "Epic":
      return "EPIC";
    default:
      return type.toUpperCase();
  }
}

/** Color (clases Tailwind) por tipo de work item */
export function typeColor(type: string): { bg: string; text: string; border: string } {
  switch (type) {
    case "User Story":
      return { bg: "bg-blue-500/15", text: "text-blue-300", border: "border-blue-500/40" };
    case "Bug":
      return { bg: "bg-red-500/15", text: "text-red-300", border: "border-red-500/40" };
    case "Task":
      return { bg: "bg-amber-500/15", text: "text-amber-300", border: "border-amber-500/40" };
    case "Feature":
      return { bg: "bg-purple-500/15", text: "text-purple-300", border: "border-purple-500/40" };
    default:
      return { bg: "bg-slate-500/15", text: "text-slate-300", border: "border-slate-500/40" };
  }
}

/** Tiempo relativo en español, ej: "hace 5 min" */
export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffSec = Math.round((Date.now() - then) / 1000);
  if (diffSec < 60) return "recién";
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `hace ${d} d`;
  return new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
}

/** Hora corta, ej: "14:32" */
export function shortTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

/** Iniciales de un nombre para el avatar */
export function initials(name?: string): string {
  if (!name) return "·";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Color determinístico para el avatar a partir del nombre */
export function avatarColor(name?: string): string {
  const palette = [
    "bg-rose-500/30 text-rose-200",
    "bg-emerald-500/30 text-emerald-200",
    "bg-sky-500/30 text-sky-200",
    "bg-violet-500/30 text-violet-200",
    "bg-amber-500/30 text-amber-200",
    "bg-teal-500/30 text-teal-200",
    "bg-fuchsia-500/30 text-fuchsia-200",
  ];
  if (!name) return "bg-slate-600/40 text-slate-300";
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

/** Convierte el HTML de un comentario de ADO a texto plano legible */
export function htmlToText(html: string): string {
  if (!html) return "";
  const withBreaks = html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*(p|div|li)\s*>/gi, "\n");
  const doc = new DOMParser().parseFromString(withBreaks, "text/html");
  return (doc.body.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
}

/** Última parte de un path (ej: iteration "Proj\\Sprint 5" -> "Sprint 5") */
export function lastPathSegment(path?: string): string {
  if (!path) return "";
  const parts = path.split("\\");
  return parts[parts.length - 1];
}
