import { invoke } from "@tauri-apps/api/core";

/** Variable de entorno usada por defecto cuando un proyecto no declara la suya. */
export const DEFAULT_PAT_ENV_VAR = "AZURE_DEVOPS_EXT_PAT";

/** Lee el PAT desde las variables por defecto (AZURE_DEVOPS_EXT_PAT y similares). */
export async function getEnvPat(): Promise<string | null> {
  try {
    return (await invoke<string | null>("get_env_pat")) ?? null;
  } catch {
    return null;
  }
}

/**
 * Lee el PAT de una variable de entorno concreta. Rust sólo permite nombres que
 * contengan PAT o TOKEN, así que el frontend no puede espiar otras variables.
 */
export async function getEnvVar(name: string): Promise<string | null> {
  const key = name?.trim();
  if (!key) return null;
  try {
    return (await invoke<string | null>("get_env_var", { name: key })) ?? null;
  } catch {
    return null;
  }
}

/** Nombres (sin valores) de las variables de entorno que parecen tener un PAT. */
export async function listPatEnvVars(): Promise<string[]> {
  try {
    return (await invoke<string[]>("list_pat_env_vars")) ?? [];
  } catch {
    return [];
  }
}

/**
 * Resuelve el token de cada variable pedida, en paralelo. Devuelve un mapa
 * nombre → token (o null si no está definida).
 */
export async function resolveEnvPats(names: string[]): Promise<Record<string, string | null>> {
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  const entries = await Promise.all(
    unique.map(async (name) => [name, await getEnvVar(name)] as const),
  );
  return Object.fromEntries(entries);
}
