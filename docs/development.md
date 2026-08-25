# Development

Contributor setup for **iNfinity eXpress**. End-user docs live in the root [README.md](../README.md). Agent workflow: [AGENTS.md](../AGENTS.md).

## Tech stack

- React 18 + TypeScript + Vite + Vitest
- **Tauri 2** (`src-tauri/`) — native webview; dialogs, FS, WeiDU install, backups, mod acquire

Domain and keyboard command resolution stay in pure TypeScript under `src/lib/` so the web and Tauri hosts share behaviour.

Curated data:

- `src/data/InstallSequence.xml`
- `src/data/mods.csv` (detail panel + Mods phase catalog)

## Requirements

- Node.js 18+
- For the desktop shell: Rust (rustup), MSVC C++ Build Tools, WebView2 (usually already on Windows 10/11)

The **installed desktop app** ships with WeiDU and 7-Zip — users do not need to install those separately. Settings → App still allows a custom WeiDU path override.

## Setup

```bash
npm install
npm run dev
```

Desktop shell (starts Vite, then opens the native window):

```bash
npm run tauri:dev
```

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite development server (browser) |
| `npm run tauri:dev` | Start Vite + Tauri desktop window |
| `npm run tauri:build` | Production desktop bundle |
| `npm run build` | Typecheck (`tsc --noEmit`) then production web build |
| `npm run preview` | Serve the production build locally |
| `npm test` | Run the frontend (Vitest) suite once |
| `npm run test:watch` | Run Vitest in watch mode |
| `cd src-tauri; cargo test` | Run Rust unit tests for the Tauri backend (PowerShell) |

### WSL / cross-OS installs

Native packages (Rollup, esbuild) are platform-specific. If `node_modules` was installed on Windows and you run the project under Linux/WSL (or the reverse), reinstall on the OS you are using:

```bash
rm -rf node_modules && npm install
```

Otherwise `npm test` / `npm run dev` may fail looking for the wrong `@rollup/rollup-*` binary.

## Testing

### Frontend (Vitest)

```bash
npm test
npm run test:watch
```

Tests live next to the code as `src/**/*.test.ts` and cover:

- Engine token matching (`matchEngine`)
- `alwaysIf` / `displayIf` condition parsing and evaluation
- Selection, station merge, alternatives, visibility, and install-order export
- Parsing the curated `InstallSequence.xml`
- Install plan builder / WeiDU resolution helpers where present

### Desktop / Rust (`src-tauri`)

Unit tests for Tauri backend logic live as `#[cfg(test)]` modules next to the Rust sources (not a separate `tests/` crate). From the repo root on Windows/PowerShell:

```powershell
cd src-tauri; cargo test
```

On bash/WSL: `cd src-tauri && cargo test`.

Covered modules today:

| File | Focus |
| --- | --- |
| `src-tauri/src/mod_fs.rs` | Safe folder-name validation for mod dirs |
| `src-tauri/src/mod_acquire.rs` | GitHub release asset URL picking / href absolutizing |
| `src-tauri/src/weidu_install.rs` | Setup exe path from tp2, component JSON labels, WeiDU command formatting |

There is no npm script for these; run `cargo test` directly under `src-tauri/`.

## Releases

Production builds (public beta **0.9.0**) bundle WeiDU and 7-Zip, check for app updates on startup (About → **Check for updates**), and block the native WebView right-click menu.

Release builds use GitHub Actions (`.github/workflows/release.yml`). Maintainers: see [src-tauri/keys/README.md](../src-tauri/keys/README.md) for updater signing key setup before tagging a version.

## Domain documentation

| Doc | Topic |
| --- | --- |
| [AGENTS.md](../AGENTS.md) | Agent entry: when to load which doc |
| [architecture.md](architecture.md) | Stack, phases, data flow, key modules |
| [selection.md](selection.md) | Visibility, selection rules, presets, export |
| [install-sequence-schema.md](install-sequence-schema.md) | XML tags and attributes |
| [weidu-install.md](weidu-install.md) | Install plan, WeiDU IDs, run, backups |
| [keyboard.md](keyboard.md) | Tree and chrome keyboard bindings |
| [ui.md](ui.md) | Tooltips, inputs, scrollbars, collapsible chrome |
| [dev-fresh-install.md](dev-fresh-install.md) | Clear projects / Settings for a fresh local install |
