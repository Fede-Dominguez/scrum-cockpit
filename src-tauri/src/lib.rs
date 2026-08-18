/// Variables de entorno consultadas por defecto cuando un proyecto no declara
/// la suya (compatibilidad con la configuración de un solo proyecto).
const DEFAULT_PAT_VARS: [&str; 3] = ["AZURE_DEVOPS_EXT_PAT", "AZURE_DEVOPS_PAT", "SCRUM_COCKPIT_PAT"];

/// `true` si el nombre puede contener un token de Azure DevOps.
///
/// Sólo dejamos leer variables cuyo nombre parece de credencial. Sin este
/// filtro el frontend podría pedir cualquier variable del proceso.
///
/// El criterio es por segmento (separado por `_`) y no por substring: un
/// `contains("PAT")` dejaría pasar `PATH`, `XDG_SESSION_PATH` y compañía.
/// `AZURE_DEVOPS_EXT_PAT` y `SCRUM_COCKPIT_PAT_MOBILE` pasan; `PATH` no.
fn is_allowed_pat_var(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 128
        && name
            .chars()
            .all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || c == '_')
        && name
            .split('_')
            .any(|seg| seg.ends_with("PAT") || seg.ends_with("TOKEN"))
}

#[cfg(test)]
mod tests {
    use super::is_allowed_pat_var;

    #[test]
    fn accepts_credential_looking_names() {
        for name in [
            "AZURE_DEVOPS_EXT_PAT",
            "AZURE_DEVOPS_PAT",
            "SCRUM_COCKPIT_PAT",
            "SCRUM_COCKPIT_PAT_MOBILE",
            "GITHUB_TOKEN",
            "MYPAT",
        ] {
            assert!(is_allowed_pat_var(name), "deberia aceptar {name}");
        }
    }

    #[test]
    fn rejects_everything_else() {
        for name in [
            "PATH",              // el caso peligroso: contiene "PAT"
            "XDG_SESSION_PATH",
            "QS_CONFIG_PATH",
            "HOME",
            "",
            "path_pat",          // minusculas
            "AZURE-DEVOPS-PAT",  // guiones
        ] {
            assert!(!is_allowed_pat_var(name), "deberia rechazar {name}");
        }
    }
}

/// Lee el PAT desde una variable de entorno concreta (la que declara el proyecto).
#[tauri::command]
fn get_env_var(name: String) -> Option<String> {
    let name = name.trim();
    if !is_allowed_pat_var(name) {
        return None;
    }
    std::env::var(name)
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
}

/// Lee el PAT de las variables por defecto, en orden de prioridad.
/// Prioridad: AZURE_DEVOPS_EXT_PAT (la que usa el CLI de Azure DevOps),
/// luego AZURE_DEVOPS_PAT y SCRUM_COCKPIT_PAT.
#[tauri::command]
fn get_env_pat() -> Option<String> {
    for key in DEFAULT_PAT_VARS {
        if let Ok(v) = std::env::var(key) {
            if !v.trim().is_empty() {
                return Some(v.trim().to_string());
            }
        }
    }
    None
}

/// Nombres (sin valores) de las variables de entorno que parecen contener un
/// PAT. Sirve para que Configuración ofrezca las opciones ya disponibles en la
/// máquina en vez de hacer escribir el nombre a mano.
#[tauri::command]
fn list_pat_env_vars() -> Vec<String> {
    let mut names: Vec<String> = std::env::vars()
        .map(|(k, _)| k)
        .filter(|k| is_allowed_pat_var(k))
        .collect();
    names.sort();
    names.dedup();
    names
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            get_env_pat,
            get_env_var,
            list_pat_env_vars
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
