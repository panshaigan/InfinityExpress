# WeiDU install

Identity rule also auto-attaches via `.cursor/rules/weidu-mod-ids.mdc`. Architecture: [architecture.md](architecture.md).

## Never confuse these IDs

| Concept | Meaning | Example |
| --- | --- | --- |
| XML `<mod id>` / `<component modId>` | **Download folder** under mods download dir | `Tweaks-Anthology` |
| WeiDU mod id | Folder with `.tp2` after staging (`stagedFolderName`) | `cdtweaks` |
| Component id `folder:N` | Designated WeiDU **number** `N` | `stratagems:6020` |
| Component id without `:N` | WeiDU **LABEL** → resolve via `--list-components-json` | `cd_tweaks_…` → `4000` |

Never treat XML `modId` as WeiDU id, `setup-*.exe` stem, or tp2 path segment.

## Plan

`buildInstallPlan(model, selectedIds, game)` in `install/planBuilder.ts`:

- Same ordering as export: document `orderIndex`, skip `noExport`, first id wins.
- Group consecutive same XML `modId` into steps.
- **EET:** phases `eet1` then `eet` (same token rules as export). Other games: `single`.
- `tp2Path` / `stagedFolderName` / `weiduNumbers` filled later by resolution.

## Resolve & run

1. Stage by XML `modId` (download folder) → discover tp2 → WeiDU id = tp2 parent folder.
2. List: `weidu.exe --nogame --noautoupdate --list-components-json <tp2> <lang>`.
3. Resolve: prefer `:N` → number; else match WeiDU `label[]` to **component id** (not XML UI `label`/`name`).
4. Language: prefer English TRA name; else first listed (`pickEnglishLanguage`).
5. Copy `weidu.exe` → `{gameDir}/setup-{weiduId}.exe`; run that exe (no tp2 argv) with `--language`, `--use-lang`, `--force-install-list`, etc.

Orchestration: `hooks/useInstallRun.ts` + `lib/desktop/weiduInstall.ts` → Rust `src-tauri/src/weidu_install.rs`. Console/log helpers under `src/lib/install/`.

## Backups

Settings **backup dir**. UI: `ui/install/BackupManagerDialog.tsx`. Rust: `weidu_backup.rs`. Baseline + named snapshots; restore/delete via desktop commands. Install logs under `backupDir/install-logs`.

## Key paths

| Area | Path |
| --- | --- |
| Types / plan | `src/lib/install/types.ts`, `planBuilder.ts` |
| Label → number | `src/lib/install/weiduResolution.ts` |
| Run hook | `src/hooks/useInstallRun.ts` |
| UI | `src/ui/install/InstallStation.tsx`, console dock, log dialog |
| Rust install / backup | `src-tauri/src/weidu_install.rs`, `weidu_backup.rs` |

Tauri FS boundary (dialogs vs persisted paths): `.cursor/rules/tauri-desktop.mdc`.
