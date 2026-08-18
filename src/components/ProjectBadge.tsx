// Badge de proyecto: sólo aparece cuando hay más de un proyecto visible, para
// poder distinguir de dónde viene cada item en la vista fusionada.
import { useActiveProjects } from "../lib/useWindowedItems";
import type { ProjectConfig } from "../types";

/** Paleta por índice de proyecto (estable mientras no se reordenen). */
export const PROJECT_COLORS = [
  "bg-sky-500/20 text-sky-200 border-sky-500/40",
  "bg-emerald-500/20 text-emerald-200 border-emerald-500/40",
  "bg-fuchsia-500/20 text-fuchsia-200 border-fuchsia-500/40",
  "bg-amber-500/20 text-amber-200 border-amber-500/40",
  "bg-violet-500/20 text-violet-200 border-violet-500/40",
  "bg-teal-500/20 text-teal-200 border-teal-500/40",
];

export function projectColor(p: ProjectConfig | undefined, fallbackIndex = 0): string {
  const i = p?.colorIndex ?? fallbackIndex;
  return PROJECT_COLORS[Math.abs(i) % PROJECT_COLORS.length];
}

/** Etiqueta corta del proyecto; `null` si hay uno solo activo (no aporta nada). */
export default function ProjectBadge({ projectId }: { projectId: string }) {
  const projects = useActiveProjects();
  if (projects.length < 2) return null;
  const idx = projects.findIndex((p) => p.id === projectId);
  const project = projects[idx];
  if (!project) return null;
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border shrink-0 ${projectColor(project, idx)}`}
      title={`${project.org}/${project.project}`}
    >
      {project.label}
    </span>
  );
}
