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
| `npm run test:coverage` | Run Vitest with V8 coverage reports and baseline coverage floors |
| `npm run test:rust` | Run Rust tests for the Tauri backend using the committed lockfile |
| `npm run test:coverage:rust` | Run instrumented Rust tests and generate LLVM coverage reports (requires cargo-llvm-cov and llvm-tools-preview) |
| `npm run test:all` | Run Vitest, typecheck/production web build, and Rust tests |
| `npm run test:desktop:windows` | Smoke-test the built production Windows executable and native IPC on temporary fixtures |
| `npm run test:installer:windows` | Install the isolated NSIS test package, exercise the installed app, and uninstall it |

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
- Project wizard validation/preparation/retry, session isolation across project
  switches, pending-save cancellation, and unload persistence
- Rendered component-tree selection with cores, conditional visibility, mixed
  parent checkboxes, alternative radios, and finished/installed selection locks
- Install-controller pause/resume, pending-pause cancellation, Stop/rollback/retry,
  failure retry, auto-skip, warning pauses, compatibility preflight, duplicate
  Play protection, and interactive input using deferred native responses
- Rendered confirmation-dialog interactions: initial Cancel focus, explicit
  confirmation, Escape, backdrop clicks, drag-selection dismissal protection,
  and listener cleanup
- Native-dialog wrapper options, cancellation, Unicode paths, save filters, write
  failures, browser guards, and directory-field Browse mapping/typed paths

Install persistence scheduler tests use fake timers and controlled disk-write
promises to check debounce, cancellation, flush, serialization, and recovery
after a write error. React tests use React DOM and jsdom; they do not launch a
browser or native webview.

### Coverage reports

`npm run test:coverage` writes HTML (`coverage/frontend/index.html`), LCOV, and
JSON summaries under `coverage/frontend/`. It includes unimported application
source, so untested UI contributes zero coverage. Tests, test helpers, static
curated data, declaration files, and the `main.tsx` mounting entry point are
excluded. Initial measured line coverage on Windows is about 38% overall and
75% for `src/lib/`. Baseline floors are enforced for the whole frontend
(37% lines, 36% statements, 33% functions/branches) and separately for libraries
(75% lines, 71% statements, 77% functions, 65% branches). Raise these floors as
coverage improves; do not exclude untested application code to meet them.

For backend reports, install the optional coverage tooling once:

```bash
rustup component add llvm-tools-preview
cargo install cargo-llvm-cov --version 0.9.1 --locked
npm run test:coverage:rust
```

The Rust command runs tests once, then renders LCOV (`coverage/rust/lcov.info`),
JSON (`coverage/rust/summary.json`), and HTML (`coverage/rust/html/index.html`)
from the same instrumentation data. Build-script code is excluded. The initial
Windows backend line coverage is about 28%; no Rust percentage floor is set
until Linux and Windows baselines have both been measured. Packaged-app smoke
tests run separately and are not included in either unit-suite coverage report.

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

Run all CI checks for the current operating system with:

```sh
npm run check:ci
```

Run `npm ci` first and install the desktop prerequisites described above. On
Windows, this includes the isolated NSIS installer lifecycle test and requires
an interactive desktop with WebView2. On Linux, install the packages listed in
`scripts/linux/install-ci-deps.sh --smoke`, plus `cargo-llvm-cov` and the Rust
`llvm-tools-preview` component. The Linux command includes package, signing,
and AppImage smoke checks. Run on both operating systems to cover both CI jobs.
The command stops at the first failure and does not publish or deploy anything.
Use `npm run check:ci -- --dry-run` to list the steps without executing them.
Frontend tests run once with coverage; both desktop and demo builds are checked.
Release signing and GitHub artifact uploads remain CI operations.

For the quicker frontend/build/Rust suite without packaging or desktop smoke
tests, use the existing `npm run test:all`.

Pushing to `main` runs Vitest coverage, the production web build (including
TypeScript checking), and Rust tests on Windows and Linux. Other branch pushes,
pull requests, and version tags do not trigger these checks. Let the checks on
the intended commit finish successfully before tagging it. Coverage
reports are retained as CI artifacts; Linux also collects Rust coverage. The Linux workflow
also builds packages and exercises native install/reinstall/uninstall, backups,
restore, and real Tauri IPC on disposable game fixtures; see [Linux checks](linux.md).

Native compilation dominates these checks. The checks on `main` populate the
Rust caches used by subsequent checks and release tags, so no separate cache
warmer is needed. Check and release jobs share an OS-specific Rust cache,
including the separate Linux coverage target, and preserve compiled dependencies
even after a later failure. Tags matching `v*` build release packages and deploy
the browser demo without repeating the test suites. These tag workflows do not
automatically gate on the earlier `main` checks.

Desktop checks use Tauri's existing frontend build hook instead of building the
same web assets immediately before it. Frontend suites and coverage floors are
unchanged. Linux dependency setup uses only Ubuntu repositories for system
packages, skips optional recommended packages, and bounds network retries, lock
waits, and command time. Smoke setup also installs the official Minisign 0.12
static binary with a pinned SHA-256 checksum because Ubuntu 22.04 does not
provide the executable package.

The Windows workflow builds an unsigned NSIS package with a separate
`InfinityExpress Smoke Test` product name and `com.infinityexpress.smoketest`
identity, then runs `npm run test:installer:windows`. It silently installs per
user into an ignored workspace fixture, checks the application/tool payloads,
uninstall registration and shortcut targets, and runs the full desktop smoke
suite against the **installed** executable. It then uninstalls and checks that
resources, registration, and shortcuts were removed while sibling player data
survived. Existing smoke identities are refused rather than overwritten.
Normal InfinityExpress installations use a different identity.

The desktop smoke suite starts the actual React/WebView2 app with a
temporary profile, verifies bundled tools, and exercises compatibility checks,
destination preparation, mod staging, real WeiDU install/reinstall/uninstall,
snapshots, and vanilla restore through Tauri IPC. It also creates two projects
through the actual wizard and switches between them through the App shell,
checking that their preset selections stay independent. It saves a screenshot, native
log, and result JSON under `.cache/windows-check/` when run directly, then removes its temporary
game/profile fixtures. No real game folders or existing app profile are used.

Native dialogs are opened through the actual Tauri dialog plugin. A bounded
Windows UI Automation helper selects only fixture items or sends OK/Cancel to
the test process's exact, uniquely titled dialog window. Checks include folder
and file selection, save/cancel, Unicode paths, UTF-8 output, and plugin-fs
denying writes to an unselected sibling path. No global keystrokes are sent.
An interactive Windows desktop is required for these checks.

To reproduce on Windows with WebView2 installed:

```powershell
npm run tauri:build -- --no-bundle
npm run test:desktop:windows
```

`IE_SMOKE_BINARY` can select another production executable, and
`IE_SMOKE_RESULT_DIR` changes the artifact directory. The smoke test uses
WebView2's [documented remote-debugging and profile-isolation environment variables](https://playwright.dev/docs/webview2),
passed only to the child process. It needs no downloaded browser driver.

To reproduce the installer lifecycle check (WebView2 must already be installed):

```powershell
npm run tauri:build -- --bundles nsis --config scripts/windows/tauri.smoke.conf.json
npm run test:installer:windows
```

Its report and nested desktop artifacts are under `.cache/windows-installer/`.
The test config disables updater artifacts and WebView2 installation; it does
not use production signing keys or alter release configuration. NSIS intentionally
patches its bundle-type marker into the packaged executable, so payload hashing
normalizes that single marker while comparing the rest of the binary exactly.

Remaining gaps include MSI lifecycle checks, native dialogs on Linux,
acquisition cancellation/network failures, broader rendered UI coverage, and
real-game mod lists. A passing fixture suite does not establish compatibility
with every game/mod.

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

## Browser demo (GitHub Pages)

Run `npm run dev:demo` and open `http://localhost:5173/InfinityExpress/`.
Build with `npm run build:demo`; preview with `npm run preview -- --base /InfinityExpress/` and open the same path on the preview port.
The demo starts in the project hub, creates projects with name and engine only, and saves projects/presets in browser localStorage. Components share the desktop selection/export logic. Desktop phases and setup controls are disabled; completion opens export. Demo exports use `.csv` filenames with the existing semicolon-separated `componentId;label` format and EET phase tabs.

One-time deployment setup: in the GitHub repository, open Settings → Pages and select **GitHub Actions** as the source. In Settings → Environments → `github-pages`, allow tags matching `v*` under **Deployment branches and tags** (select **Selected branches and tags** and add a **Tag** rule). Replace any branch-only restriction that would block tags.

The `Browser demo` workflow builds and deploys the tagged commit only when a version tag matching `v*` is pushed. Branch pushes, pull requests, and manual runs do not trigger this workflow. Frontend tests run in the Windows and Linux checks on `main`; deployment waits for the demo build without rerunning those tests. The checks on `main` do not automatically gate Pages deployment. The site is served at `https://panshaigan.github.io/InfinityExpress/`; no custom domain or backend is required. A public repository supports Pages on GitHub Free.

Normal `dev`, `build`, and Tauri commands keep desktop behavior. Demo restrictions are selected explicitly by Vite mode `demo` (`src/lib/runtime.ts`). Screen navigation stays within the single page so reloads work on Pages without route rewrites.
