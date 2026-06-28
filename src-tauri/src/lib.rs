/// Lee el PAT de Azure DevOps desde variables de entorno conocidas.
/// Prioridad: AZURE_DEVOPS_EXT_PAT (la que usa el CLI de Azure DevOps),
/// luego AZURE_DEVOPS_PAT y SCRUM_COCKPIT_PAT.
#[tauri::command]
fn get_env_pat() -> Option<String> {
    for key in ["AZURE_DEVOPS_EXT_PAT", "AZURE_DEVOPS_PAT", "SCRUM_COCKPIT_PAT"] {
        if let Ok(v) = std::env::var(key) {
            if !v.trim().is_empty() {
                return Some(v.trim().to_string());
            }
        }
    }
    None
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .invoke_handler(tauri::generate_handler![get_env_pat])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
