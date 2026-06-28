# 🛰️ Scrum Cockpit

**🇬🇧 English** · [🇪🇸 Español](README.es.md)

A **desktop app for Scrum Masters** that shows, on a single screen, all the activity of an **Azure DevOps** (cloud) project — built to be used without technical knowledge. No server, no database: everything runs locally on your machine.

> Cross-platform desktop app built with **Tauri 2 + React + TypeScript**, talking directly to the Azure DevOps REST API.

## ✨ Features

- **📡 Activity feed** — a live, natural-language stream of what's happening (e.g. _"Ana moved US 28173 to Bruno"_, _"New US assigned to Ana"_).
- **🗂️ Board** — every User Story / Bug / Task in columns (by board column, state or person).
- **📊 Metrics** — WIP, completed items, story points, workload per person and distribution by state.
- **📈 Evolution** — trends over the selected time window.
- **🔎 Filters & search** — by type, person, sprint and free text.

## 🔒 Security & privacy

This tool was built to be shared with the community, so it follows a few principles:

- **The Personal Access Token (PAT) is read *only* from an environment variable** and is **never written to disk** nor typed into the UI.
- All traffic stays between your machine and Azure DevOps — **nothing is sent to any third-party server**.
- The HTTP layer is **allow-listed** to Azure DevOps domains only (`dev.azure.com`, `*.dev.azure.com`, `app.vssps.visualstudio.com`).
- A restrictive **Content-Security-Policy** is enforced in the web view.

## 🚀 Getting started

### 1. Create a PAT in Azure DevOps
Azure DevOps → *User settings* → *Personal access tokens*. Minimum scopes:
**Work Items (Read)** and **Project and Team (Read)**.
📖 [How to create a PAT](https://learn.microsoft.com/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate)

### 2. Expose it as an environment variable
The app looks for the token in these variables (in order): `AZURE_DEVOPS_EXT_PAT` (the same one the Azure DevOps CLI uses), `AZURE_DEVOPS_PAT`, `SCRUM_COCKPIT_PAT`.

```bash
# Linux / macOS
export AZURE_DEVOPS_EXT_PAT="your-token"
```
```powershell
# Windows (PowerShell, persistent)
setx AZURE_DEVOPS_EXT_PAT "your-token"
```
> On Windows, reopen the app after setting it.

### 3. First-run setup
On first launch the app asks for:
- **Organization** — the name in `dev.azure.com/YOUR-ORG`.
- **Project** — the exact project name.
- **Team** *(optional)* — only needed for sprint metrics.
- **Refresh interval** — how often (seconds) it polls for changes (default 30).
- **Lookback window** — only activity changed in the last *N* days is loaded (default **60**, ~2 months) to avoid dragging in sprints/versions from years ago. Increase it if you need more history.

Use **Test connection** to validate before saving.

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
