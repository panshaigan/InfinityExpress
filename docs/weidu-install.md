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

Settings **Backup & logs directory** (`appDirs.backupDir`). UI: [`BackupManagerDialog.tsx`](../src/ui/install/BackupManagerDialog.tsx). Rust: [`weidu_backup.rs`](../src-tauri/src/weidu_backup.rs). TS wrappers: [`weiduInstall.ts`](../src/lib/desktop/weiduInstall.ts). Types: `BackupKind` / `BackupManifest` in [`types.ts`](../src/lib/install/types.ts).

### Layout

```text
{backupDir}/
  {gameKey}/                 # bg1 | bg2 | iwd | pst  (never "eet")
    manifest.json
    vanilla/                 # required unmodded copy
    {snapshotName}/          # named snapshots as siblings of vanilla
  install-logs/
    {runId}/                 # WeiDU run stdout/stderr (not game backups)
```

Legacy trees are migrated on `list_backups` / create / delete:

- `baseline/` → `vanilla/`
- `snapshots/{name}/` → `{gameKey}/{name}/`
- Manifest field `baseline` is accepted on read; rewritten as `vanilla`

### Vanilla vs snapshot

| Kind | Path | Rules |
| --- | --- | --- |
| `vanilla` | `{gameKey}/vanilla/` | One per game key. Required before install Start. Recreate replaces existing. |
| `snapshot` | `{gameKey}/{name}/` | Named; same name replaces. Only allowed after vanilla exists for that key. |

**Create gate:** if vanilla is missing for the scoped keys, Back up UI only offers vanilla (no snapshot name). Once vanillas exist, named snapshots are available.

**EET:** Start requires **both** `bg1` and `bg2` vanillas. A vanilla created earlier under a non-EET BG1/BG2 install counts. Snapshot create shows BG1/BG2 checkboxes; each checked key gets a folder with the **same snapshot name**. Restore list merges both keys (Game column).

### Operations & progress

Event: `weidu-backup-progress` (`phase`, `message`, `filesDone`/`bytesDone`, `filesTotal`/`bytesTotal`).

| Op | Progress |
| --- | --- |
| Create | Measure → copy (per-file). Pre-delete of existing dest is async with indeterminate bar. |
| Restore | Wipe live game folder (`Cleaning game folder…`) → measure → copy. |
| Delete | Async `remove_dir_all` with indeterminate “Removing backup…”. |

UI shows message on the left and `copied / total` bytes on the right (no em dash). Indeterminate animated bar when totals are 0.

### Restore → install plan

1. Wipe target game dir, then copy backup tree.
2. If an install run is active, `restartFromBackup` resets steps to `queued`, then marks `alreadyInstalled` from each step’s phase game dir `weidu.log` (`parseWeiduLog` / `~tp2~ #lang #number`).
3. Vanilla (no log) → none marked installed. Does **not** change Components-phase selection checkboxes.

### Commands

`backup_game_dir`, `create_named_backup`, `list_backups`, `restore_game_dir`, `delete_backup`.

## Key paths

| Area | Path |
| --- | --- |
| Types / plan | `src/lib/install/types.ts`, `planBuilder.ts` |
| WeiDU.log parse | `src/lib/install/weiduLog.ts` |
| Label → number | `src/lib/install/weiduResolution.ts` |
| Run hook | `src/hooks/useInstallRun.ts` |
| UI | `src/ui/install/InstallStation.tsx`, `BackupManagerDialog.tsx`, console dock |
| Rust install / backup | `src-tauri/src/weidu_install.rs`, `weidu_backup.rs` |

Tauri FS boundary (dialogs vs persisted paths): `.cursor/rules/tauri-desktop.mdc`.
