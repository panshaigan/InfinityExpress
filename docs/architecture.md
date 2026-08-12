# Architecture

Stack: React 18 + TypeScript + Vite + Vitest; Tauri 2 desktop shell. Pure domain in `src/lib/`; FS / WeiDU / acquire in `src-tauri/` + thin `src/lib/desktop/` wrappers.

## Folders

| Path | Role |
| --- | --- |
| `src/data/` | Curated `InstallSequence.xml`, `mods.csv` |
| `src/lib/xml/` | Parse, merge duplicate stations, content remap |
| `src/lib/selection/` | Toggle, visibility, conditions, levels |
| `src/lib/engine/` | Engine token allow-lists |
| `src/lib/mods/` | Catalog, disk presence, acquire helpers |
| `src/lib/presets/` | Selection + level-strip snapshots |
| `src/lib/export/` | Install-order text (`id;label`) |
| `src/lib/install/` | Plan, WeiDU resolve, console/log |
| `src/lib/desktop/` | Tauri dialogs / invoke wrappers |
| `src/lib/ui/` | Prefs, hotkey resolvers |
| `src/ui/` | Stations, dialogs, install / mods UI |
| `src/hooks/` | Nav, presets, install run, catalog |
| `src-tauri/` | Rust: WeiDU install, backups, mod FS/acquire |

## Phases

1. **Components** — XML stations in `STATION_ORDER` (`base` … `adjustements`) after Presets. Content has main/sub branch nav after remap. Engine is chosen once per **Project** (not a station).
2. **Mods** — Working copy of `mods.csv` (localStorage overlays). Desktop: scan Settings **mods download dir** by Download ID (subdir name); acquire / remove-from-disk. Completing last Components station can open Mods in journey mode.
3. **Install** — Plan/run WeiDU steps; **cursor** (`InstallRun.cursor`) marks the current package in the table; **vanilla** (app-wide) + named snapshots under the data root (see [weidu-install.md](weidu-install.md)); console dock. EET splits Pre-EET (`eet1`) vs EET (`eet`).

## Projects

A **Project** is one install universe: locked engine, component selection / presets, install run state, and **destination** game folder(s) (live/modded). Multiple projects can share the same engine (different mod lists / destinations).

- **Boot:** Project hub → open existing or **New project** wizard (engine → vanilla if missing → destinations).
- **Destinations:** Empty folder → copy from app-wide vanilla; non-empty → must contain the game exe.
- **Vanilla:** App-wide per `bg1`/`bg2`/`iwd`/`pst` (managed under data root preferred; external folder allowed). EET needs both BG1 and BG2 vanillas.
- **Persistence:** Project meta + session in localStorage (`infinity-express.projects-v1`). Legacy per-game `infinity-express.app-session` buckets migrate once into projects.

Settings (top bar): **Vanilla backups** + **App** (mods download dir, backup/logs/projects dir, WeiDU, GitHub token).

**Session restore:** Selection, station done marks, presets, install table/cursor live on the active project. Install console WeiDU output is **not** stored there — on startup it is reloaded from `{backupDir}/install-logs/{runId}/run-stdout.log` and `run-stderr.log` when a saved install run exists.

### Fresh install (clear projects + Settings)

Dev helper — see **[dev-fresh-install.md](dev-fresh-install.md)** for the PowerShell command (`IE_FRESH_INSTALL=1`) and DevTools `__ieClearFreshInstall()`. Disk game/mod folders are never deleted.

## UI confirmations

Destructive or rollback actions (install Previous / uninstall-back, backup delete, mod remove-from-disk) use [`src/ui/ConfirmDialog.tsx`](src/ui/ConfirmDialog.tsx): `confirm-dialog-backdrop` + `confirm-dialog`, cancel focused by default, `danger` prop for the primary confirm button.

## Data flow

```text
InstallSequence.xml → parseInstallSequence() → fold siblings → remap content (UI)
        → createInitialSelection() / toggleNode() / buildDisplayTree()
        → export install-order  OR  buildInstallPlan() → stage → resolve → run WeiDU
```

Selection is a `Set` of **component ids** (XML `id`), not tree keys. Detail panel joins `modId` → `mods.csv` Codename.

## Parse / merge / remap (UI)

- Root `<installSequence>`; known station tags only at top level.
- Duplicate station tags **merge for nav**; export / install order still uses each component’s document `orderIndex`.
- Same-tag nested containers reunite except `group`, `mod`, `component`, `alternatives`.
- Content remount (UI only): commons fold into game buckets (`bg1`/`bg2`/`iwd`/`eet`/`pst` rules in `remapContentForGame.ts`).

## Primary modules

| Area | Module |
| --- | --- |
| Parse / types | `xml/parseInstallSequence.ts`, `xml/schema.ts` |
| Fold / remap | `xml/foldSiblings.ts`, `xml/remapContentForGame.ts` |
| Engine | `engine/matchEngine.ts` |
| Selection / visibility | `selection/selectionEngine.ts`, `visibility.ts`, `conditions.ts` |
| Levels | `selection/selectionLevels.ts` |
| Presets | `presets/selectionPresets.ts` |
| Export | `export/installOrder.ts` |
| Install | `install/planBuilder.ts`, `weiduResolution.ts`, `hooks/useInstallRun.ts` |
| Shell | `App.tsx`, `ui/*` |

Further behaviour: [selection.md](selection.md), [install-sequence-schema.md](install-sequence-schema.md), [weidu-install.md](weidu-install.md).
