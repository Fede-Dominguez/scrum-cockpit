# 🛰️ Scrum Cockpit

**🇬🇧 English** · [🇪🇸 Español](README.es.md)

A **desktop app for Scrum Masters** that shows, on a single screen, all the activity of one or more **Azure DevOps** (cloud) projects — built to be used without technical knowledge. No server, no database: everything runs locally on your machine.

> Cross-platform desktop app built with **Tauri 2 + React + TypeScript**, talking directly to the Azure DevOps REST API.

## ✨ Features

- **📡 Activity feed** — a live, natural-language stream of what's happening (e.g. _"Ana moved US 28173 to Bruno"_, _"New US assigned to Ana"_).
- **🗂️ Board** — every User Story / Bug / Task in columns (by board column, state or person).
- **📊 Metrics** — WIP, completed items, points, workload per person and a **breakdown by commitment level** (Mandatory / Committed / Desirable): how many stories and how many points are left at each level.
- **📈 Evolution** — trends over the selected time window.
- **🧪 QA** — per sprint: who closed each item (`Closed By`), test cases per tester and regression points.
- **🗂️ Multi-project** — several projects configured at once, **each with its own token**. View them one at a time (like a switcher) or all together in a merged view.
- **🔎 Filters & search** — by type, person, sprint, commitment and free text.

## 🔒 Security & privacy

This tool was built to be shared with the community, so it follows a few principles:

- **Personal Access Tokens (PATs) are read *only* from environment variables** and are **never written to disk** nor typed into the UI. Each project declares *which* variable it uses, so you can connect different organizations with different tokens.
- The frontend **cannot read arbitrary environment variables**: the native layer only returns variables whose name contains `PAT` or `TOKEN`.
- All traffic stays between your machine and Azure DevOps — **nothing is sent to any third-party server**.
- The HTTP layer is **allow-listed** to Azure DevOps domains only (`dev.azure.com`, `*.dev.azure.com`, `app.vssps.visualstudio.com`).
- A restrictive **Content-Security-Policy** is enforced in the web view.

## 🚀 Getting started

### 1. Create a PAT in Azure DevOps
Azure DevOps → *User settings* → *Personal access tokens*. Minimum scopes:
**Work Items (Read)** and **Project and Team (Read)**.
📖 [How to create a PAT](https://learn.microsoft.com/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate)

### 2. Expose it as an environment variable
By default the app looks for the token in `AZURE_DEVOPS_EXT_PAT` (the same one the Azure DevOps CLI uses); it also recognises `AZURE_DEVOPS_PAT` and `SCRUM_COCKPIT_PAT`.

```bash
# Linux / macOS
export AZURE_DEVOPS_EXT_PAT="your-token"
```
```powershell
# Windows (PowerShell, persistent)
setx AZURE_DEVOPS_EXT_PAT "your-token"
```
> On Windows, reopen the app after setting it.

**Several projects with different tokens?** Define one variable per token and tell the app which one each project uses. The name must contain `PAT` or `TOKEN`:

```powershell
setx SCRUM_COCKPIT_PAT_MOBILE "token-for-org-A"
setx SCRUM_COCKPIT_PAT_WEB    "token-for-org-B"
```

### 3. First-run setup
On first launch you add your first project:
- **Name** — the alias shown in the project switcher (e.g. *Mobile*).
- **Organization** — the name in `dev.azure.com/YOUR-ORG`.
- **Project** — the exact project name.
- **Team** *(optional)* — only needed for sprint metrics.
- **Token environment variable** — which of your variables holds the PAT for *this* project.

And under **General settings**, shared by every project:
- **Refresh interval** — how often (seconds) it polls for changes (default 30).
- **Lookback window** — only activity changed in the last *N* days is loaded (default **60**, ~2 months) to avoid dragging in sprints/versions from years ago. Increase it if you need more history.
- **Points per size** — how the custom *Estimación* field (XS/S/M/L/XL) converts to points.

Use **Test connection** to validate before saving. The switcher in the top bar is where you add more projects and pick which ones to view.

## 🧮 How points are counted

Each item contributes **its own Story Points**; when that field is empty, the custom **Estimación** field (T-shirt size XS/S/M/L/XL) is converted using the table in *General settings*. **The two fields are never counted for the same item**, so nothing is double-counted. Metrics shows how many stories came in via the size route.

## ⚙️ How it works

The app *polls* the Azure DevOps REST API (no server required):

1. **WIQL** query to detect work items changed since the last check.
2. `/workItems/{id}/updates` to know **who** changed **what** (field, old → new value) and build the feed text.
3. `workitemsbatch` to fill the board.

## 🛠️ Tech stack

Tauri 2 · React 19 · TypeScript · Vite · Tailwind 4 · Zustand · Tauri plugins `http` (CORS-free API calls) and `store` (local config persistence).

## 💻 Development

Requirements: Node, Rust/Cargo and, on Linux, `webkit2gtk-4.1`, `libsoup-3.0`, `gtk+-3.0`.

```bash
npm install
npm run tauri dev      # run the app in development mode
```

## 📦 Build

```bash
npm run tauri build    # installer in src-tauri/target/release/bundle/
```

On Windows 10/11 the app uses the system's built-in WebView2.

### Cross-compile a Windows `.exe` from Linux
Using [`cargo-xwin`](https://github.com/rust-cross/cargo-xwin) — no Windows machine needed:

```bash
./build-windows.sh
```

Requirements: `rustup target add x86_64-pc-windows-msvc`, `cargo install --locked cargo-xwin`, LLVM (`clang-cl`, `lld-link`), and `7z`. NSIS (`makensis`) is only needed if you also want the installer.

> The `.msi` (WiX) target does **not** cross-compile from Linux; the standalone `.exe` and the NSIS installer do.

## 🤝 Contributing

Issues and pull requests are welcome. This started as a personal tool and is shared so other Scrum teams can use and improve it.

## 📄 License

[MIT](LICENSE) — free to use, modify and share.
