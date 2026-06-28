import { invoke } from "@tauri-apps/api/core";

/** Lee el PAT desde la variable de entorno (AZURE_DEVOPS_EXT_PAT y similares). */
export async function getEnvPat(): Promise<string | null> {
  try {
    return (await invoke<string | null>("get_env_pat")) ?? null;
  } catch {
    return null;
  }
}
