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

Linux integration status, native tools, and remaining limitations:
[Linux desktop support](linux.md).

- Node.js 22.12+ (Vite 8 requires a current Node runtime)
- For the desktop shell: Rust (rustup), MSVC C++ Build Tools, WebView2 (usually already on Windows 10/11)

The **Windows desktop app** ships with WeiDU and 7-Zip. Linux bundles native
x86_64 WeiDU; RAR extraction needs a system 7-Zip executable (see [Linux support](linux.md)).
Settings → App allows a custom WeiDU path override.

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
| `npm run test:rust` | Run Rust tests for the Tauri backend using the committed lockfile |
| `npm run test:all` | Run Vitest, typecheck/production web build, and Rust tests |

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

Tests live next to the code as `src/**/*.test.ts` / `src/**/*.test.tsx` and cover:

- Engine token matching (`matchEngine`)
- `alwaysIf` / `displayIf` condition parsing and evaluation
- Selection, station merge, alternatives, visibility, and install-order export
- Parsing the curated `InstallSequence.xml`
- Install plans, WeiDU log import, restore reconciliation, run-state persistence,
  logs, timings, and install status helpers
- Project storage/migration, presets, mod catalog and component-browser helpers
- React hook integration for navigation, buffered console output, and backup restore
- Rendered confirmation-dialog interactions: initial Cancel focus, explicit
  confirmation, Escape, backdrop clicks, drag-selection dismissal protection,
  and listener cleanup

Install persistence scheduler tests use fake timers and controlled disk-write
promises to check debounce, cancellation, flush, serialization, and recovery
after a write error. React tests use React DOM and jsdom; they do not launch a
browser or native webview.

### Desktop / Rust (`src-tauri`)

Tests for Tauri backend logic live as `#[cfg(test)]` modules next to the Rust sources (not a separate `tests/` crate). From the repo root:

```bash
npm run test:rust
```

This runs `cargo test --manifest-path src-tauri/Cargo.toml --locked`.

Covered modules today:

| File | Focus |
| --- | --- |
| `src-tauri/src/mod_fs.rs` | Folder-name validation and log-tail reads |
| `src-tauri/src/mod_acquire.rs` | Release asset selection, archive recognition, and page metadata |
| `src-tauri/src/weidu_install.rs` | TP2 discovery/containment, WeiDU metadata/log parsing, cleanup, and process-output batching |
| `src-tauri/src/weidu_backup.rs` | Manifest discovery/migration, corrupt manifests, canonical path guards, media exclusions, and directory cleanup using temporary fixtures; symlink escape test on Unix |
| `src-tauri/src/install_compatibility.rs` | Executable-platform compatibility checks |
| `src-tauri/src/dev_reset.rs` | Fresh-install environment flag parsing |

The backup tests exercise filesystem helpers; they do not run the complete
AppHandle-driven backup/restore commands.

### CI and remaining coverage

Pull requests and pushes to `main` run Vitest, the production web build (including
TypeScript checking), and Rust tests on Windows and Linux. The Linux workflow
also builds packages and exercises native install/reinstall/uninstall, backups,
restore, and real Tauri IPC on disposable game fixtures; see [Linux checks](linux.md).

Coverage remains strongest in domain logic. Rendered project-wizard, component
selection, and install-control flows still need broader integration tests,
especially pause/stop/retry and project switching. Windows checks do not yet
launch the packaged app or exercise native dialogs/IPC. The suite currently has
no code-coverage report or enforced coverage threshold. A passing unit suite
does not establish compatibility with every real game/mod list.

## Releases

Production builds (public beta **0.10.0**) bundle WeiDU and 7-Zip, check for app updates on startup (About → **Check for updates**), and block the native WebView right-click menu.

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
