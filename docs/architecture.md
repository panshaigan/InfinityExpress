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

1. **Components** — Engine station (game + folder prefs) then XML stations in `STATION_ORDER` (`base` … `adjustements`). Content has main/sub branch nav after remap.
2. **Mods** — Working copy of `mods.csv` (localStorage overlays). Desktop: scan Settings **mods download dir** by Download ID (subdir name); acquire / remove-from-disk. Completing last Components station can open Mods in journey mode.
3. **Install** — Plan/run WeiDU steps; **cursor** (`InstallRun.cursor`) marks the current package in the table; **vanilla** + named snapshots under Settings backup path (see [weidu-install.md](weidu-install.md) for cursor, controls, backups); console dock. EET splits Pre-EET (`eet1`) vs EET (`eet`).

Settings (top bar): game folders, mods download dir, backup dir, WeiDU path (`gameFolderPrefs`, `appDirPrefs`, `weiduPrefs`).

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
