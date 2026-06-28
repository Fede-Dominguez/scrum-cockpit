# 🛰️ Scrum Cockpit

[🇬🇧 English](README.md) · **🇪🇸 Español**

**App de escritorio para Scrum Masters** que muestra, en una sola pantalla, toda la actividad de un proyecto de **Azure DevOps** (cloud) — pensada para usarse sin conocimientos técnicos. Sin servidor ni base de datos: todo corre localmente en tu equipo.

> App de escritorio multiplataforma hecha con **Tauri 2 + React + TypeScript**, hablando directo con la REST API de Azure DevOps.

## ✨ Funcionalidades

- **📡 Actividad (Feed)** — stream en vivo de movimientos en lenguaje natural (ej: _"Ana pasó la US 28173 a Bruno"_, _"Nueva US cargada a Ana"_).
- **🗂️ Board** — todas las US / BUG / TASK en columnas (por columna del board, estado o persona).
- **📊 Métricas** — WIP, completados, story points, carga por persona y distribución por estado.
- **📈 Evolutivo** — tendencias dentro de la ventana de tiempo elegida.
- **🔎 Filtros y búsqueda** — por tipo, persona, sprint y texto.

## 🔒 Seguridad y privacidad

Esta herramienta se pensó para compartir con la comunidad, así que sigue algunos principios:

- **El Personal Access Token (PAT) se lee *solo* desde una variable de entorno** y **nunca se guarda en disco** ni se ingresa por pantalla.
- Todo el tráfico queda entre tu equipo y Azure DevOps — **no se envía nada a ningún servidor de terceros**.
- La capa HTTP está **acotada por allowlist** a dominios de Azure DevOps (`dev.azure.com`, `*.dev.azure.com`, `app.vssps.visualstudio.com`).
- Se aplica una **Content-Security-Policy** restrictiva en la web view.

## 🚀 Puesta en marcha

### 1. Crear un PAT en Azure DevOps
Azure DevOps → *User settings* → *Personal access tokens*. Scopes mínimos:
**Work Items (Read)** y **Project and Team (Read)**.
📖 [Cómo generar un PAT](https://learn.microsoft.com/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate)

### 2. Exponerlo como variable de entorno
La app busca el token en estas variables (en orden): `AZURE_DEVOPS_EXT_PAT` (la misma del CLI de Azure DevOps), `AZURE_DEVOPS_PAT`, `SCRUM_COCKPIT_PAT`.

```bash
# Linux / macOS
export AZURE_DEVOPS_EXT_PAT="tu-token"
```
```powershell
# Windows (PowerShell, permanente)
setx AZURE_DEVOPS_EXT_PAT "tu-token"
```
> En Windows hay que reabrir la app después de setearla.

### 3. Configuración (primera vez)
Al abrir la app por primera vez se pide:
- **Organización** — el nombre en `dev.azure.com/TU-ORG`.
- **Proyecto** — nombre exacto del proyecto.
- **Equipo** *(opcional)* — solo para métricas de sprint.
- **Intervalo** — cada cuántos segundos se consultan cambios (default 30).
- **Últimos días** — ventana de fecha. Solo se trae actividad modificada en los últimos *N* días (default **60**, ~2 meses) para no arrastrar sprints/versiones de años atrás. Se puede subir si hace falta más historia.

El botón **Probar conexión** valida los datos antes de guardar.

## ⚙️ Cómo funciona

La app hace *polling* de la REST API de Azure DevOps (no necesita servidor):

1. **WIQL** para detectar items cambiados desde el último chequeo.
2. `/workItems/{id}/updates` para saber **quién** cambió **qué** (campo, valor viejo → nuevo) y armar el texto del feed.
3. `workitemsbatch` para llenar el board.

## 🛠️ Stack

Tauri 2 · React 19 · TypeScript · Vite · Tailwind 4 · Zustand · plugins de Tauri `http` (llamar la API sin CORS) y `store` (persistencia local de la config).

## 💻 Desarrollo

Requisitos: Node, Rust/Cargo y (en Linux) `webkit2gtk-4.1`, `libsoup-3.0`, `gtk+-3.0`.

```bash
npm install
npm run tauri dev      # corre la app en modo desarrollo
```

## 📦 Build

```bash
npm run tauri build    # instalador en src-tauri/target/release/bundle/
```

En Windows 10/11 la app usa el WebView2 ya incluido en el sistema.

### Cross-compile a Windows desde Linux
Con [`cargo-xwin`](https://github.com/rust-cross/cargo-xwin), sin máquina Windows:

```bash
./build-windows.sh
```

Requisitos: `rustup target add x86_64-pc-windows-msvc`, `cargo install --locked cargo-xwin`, LLVM (`clang-cl`, `lld-link`) y `7z`. NSIS (`makensis`) solo si además querés el instalador.

> El `.msi` (WiX) **no** cross-compila desde Linux; el `.exe` autónomo y el instalador NSIS sí.

## 🤝 Contribuir

Issues y pull requests son bienvenidos. Esto arrancó como una herramienta personal y se comparte para que otros equipos Scrum la usen y la mejoren.

## 📄 Licencia

[MIT](LICENSE) — libre para usar, modificar y compartir.
