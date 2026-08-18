# 🛰️ Scrum Cockpit

[🇬🇧 English](README.md) · **🇪🇸 Español**

**App de escritorio para Scrum Masters** que muestra, en una sola pantalla, toda la actividad de uno o varios proyectos de **Azure DevOps** (cloud) — pensada para usarse sin conocimientos técnicos. Sin servidor ni base de datos: todo corre localmente en tu equipo.

> App de escritorio multiplataforma hecha con **Tauri 2 + React + TypeScript**, hablando directo con la REST API de Azure DevOps.

## ✨ Funcionalidades

- **📡 Actividad (Feed)** — stream en vivo de movimientos en lenguaje natural (ej: _"Ana pasó la US 28173 a Bruno"_, _"Nueva US cargada a Ana"_).
- **🗂️ Board** — todas las US / BUG / TASK en columnas (por columna del board, estado o persona).
- **📊 Métricas** — WIP, completados, puntos, carga por persona y **desglose por nivel de compromiso** (Mandatorio / Comprometido / Deseable): cuántas US y cuántos puntos faltan de cada nivel.
- **📈 Evolutivo** — tendencias dentro de la ventana de tiempo elegida.
- **🧪 QA** — por sprint: quién cerró cada item (`Closed By`), test cases por tester y puntos de regresión.
- **🗂️ Multi-proyecto** — varios proyectos configurados a la vez, cada uno **con su propio token**. Se ven de a uno (como un switcher) o todos juntos en una vista fusionada.
- **🔎 Filtros y búsqueda** — por tipo, persona, sprint, compromiso y texto.

## 🔒 Seguridad y privacidad

Esta herramienta se pensó para compartir con la comunidad, así que sigue algunos principios:

- **El Personal Access Token (PAT) se lee *solo* desde variables de entorno** y **nunca se guarda en disco** ni se ingresa por pantalla. Cada proyecto declara *cuál* variable usa, así se pueden conectar organizaciones distintas con tokens distintos.
- El frontend **no puede leer cualquier variable de entorno**: la capa nativa solo devuelve variables cuyo nombre contiene `PAT` o `TOKEN`.
- Todo el tráfico queda entre tu equipo y Azure DevOps — **no se envía nada a ningún servidor de terceros**.
- La capa HTTP está **acotada por allowlist** a dominios de Azure DevOps (`dev.azure.com`, `*.dev.azure.com`, `app.vssps.visualstudio.com`).
- Se aplica una **Content-Security-Policy** restrictiva en la web view.

## 🚀 Puesta en marcha

### 1. Crear un PAT en Azure DevOps
Azure DevOps → *User settings* → *Personal access tokens*. Scopes mínimos:
**Work Items (Read)** y **Project and Team (Read)**.
📖 [Cómo generar un PAT](https://learn.microsoft.com/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate)

### 2. Exponerlo como variable de entorno
Por defecto la app busca el token en `AZURE_DEVOPS_EXT_PAT` (la misma del CLI de Azure DevOps); también reconoce `AZURE_DEVOPS_PAT` y `SCRUM_COCKPIT_PAT`.

```bash
# Linux / macOS
export AZURE_DEVOPS_EXT_PAT="tu-token"
```
```powershell
# Windows (PowerShell, permanente)
setx AZURE_DEVOPS_EXT_PAT "tu-token"
```
> En Windows hay que reabrir la app después de setearla.

**¿Varios proyectos con tokens distintos?** Definí una variable por token y en la app indicá cuál usa cada proyecto. El nombre tiene que contener `PAT` o `TOKEN`:

```powershell
setx SCRUM_COCKPIT_PAT_MOBILE "token-de-la-org-A"
setx SCRUM_COCKPIT_PAT_WEB    "token-de-la-org-B"
```

### 3. Configuración (primera vez)
Al abrir la app por primera vez se agrega el primer proyecto:
- **Nombre** — alias con el que lo vas a ver en el selector (ej. *Mobile*).
- **Organización** — el nombre en `dev.azure.com/TU-ORG`.
- **Proyecto** — nombre exacto del proyecto.
- **Equipo** *(opcional)* — solo para métricas de sprint.
- **Variable de entorno con el token** — cuál de tus variables tiene el PAT de *este* proyecto.

Y en **Ajustes generales**, para todos los proyectos:
- **Intervalo** — cada cuántos segundos se consultan cambios (default 30).
- **Últimos días** — ventana de fecha. Solo se trae actividad modificada en los últimos *N* días (default **60**, ~2 meses) para no arrastrar sprints/versiones de años atrás. Se puede subir si hace falta más historia.
- **Puntos por talle** — cómo se convierte el campo *Estimación* (XS/S/M/L/XL) a puntos.

El botón **Probar conexión** valida los datos antes de guardar. Desde el selector de la barra superior se agregan más proyectos y se elige cuáles ver.

## 🧮 Cómo se cuentan los puntos

Cada item aporta **sus Story Points**; si ese campo está vacío, se usa el campo custom **Estimación** (talle XS/S/M/L/XL) convertido con la tabla de *Ajustes generales*. **Nunca se cuentan los dos campos para el mismo item**, así que no hay doble conteo. En Métricas se indica cuántas US llegaron por la vía del talle.

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
./run-dev.sh           # launcher: chequea el entorno, avisa qué tokens ve y levanta la app
./run-dev.sh --check   # sólo el diagnóstico, sin levantar nada
```

O a mano:

```bash
npm install
npm run tauri dev
```

Si tenés varios proyectos con tokens distintos, podés dejarlos en un `.env.local`
en la raíz (ya ignorado por git) y el launcher los carga solo:

```bash
export AZURE_DEVOPS_EXT_PAT="token-de-la-org-A"
export SCRUM_COCKPIT_PAT_MOBILE="token-de-la-org-B"
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
