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
- One install step per selected component (no batching by mod).
- **EET:** phases `eet1` then `eet` (same token rules as export). Other games: `single`.
- `tp2Path` / `stagedFolderName` / `weiduNumber` filled later by resolution.

## Cursor

`InstallRun.cursor` is the **install cursor**: index of the current package in `steps`.

- Table rows for that step use class `install-cursor` (CSS `--install-cursor`), distinct from selection / keyboard `focused` / row hover.
- Soft pulse (`install-cursor-live`) while `runState === 'running'`.
- **Play (fresh start)** sets `cursor: 0` so the first row is highlighted immediately.
- Pause / Stop keep the cursor on the interrupted package. Skip advances it. Success advances it.
- Play resume / Skip / Stop all act relative to this index.

Hook: `useInstallRun` exposes `cursorStepId` (`steps[cursor]?.stepId`) for the table.

## Controls

Toolbar in `InstallStation.tsx`; state machine in `useInstallRun.ts`.

| Control | Enabled | Behavior |
| --- | --- | --- |
| **Play** | Not `running` (and paths/mods ready) | Fresh start when no run / `idle` / `completed`: `initRun` + vanillas + `executeFromCursor` from cursor 0. Resume when `paused` / `stopped` / `failed` / `waitingForInput`: continue from current cursor (no re-init). |
| **Pause** | `running` or `paused` (toggle) | **Pending pause** while `running`: finishes the current step, then halts before the next. Click again while pending to cancel. **Effective pause** sets `runState: 'paused'`. Click again (or Play) to resume. |
| **Stop** | `running` or `waitingForInput` | Kills the WeiDU child, then runs `--force-uninstall` via the same `setup-{weiduId}.exe` as install; resets the interrupted step to `queued`; **keeps cursor**; `runState: 'stopped'`. Less safe than Pause (tooltip says so). |
| **Skip** | `paused`, `stopped`, or `waitingForInput` | Marks the package at the cursor as `skipped`, advances cursor, stays halted — does **not** auto-continue. |
| **Previous** | `paused` or `stopped` | Confirms, then moves cursor back one install step, force-uninstalls that package via `setup-{weiduId}.exe`, resets it to `queued`. |

`InstallRunState` includes `stopped` (hard stop after kill/cleanup), separate from soft `paused`.

When halted (`paused` / `stopped` / `waitingForInput`), cursor normalization skips `succeeded` / `alreadyInstalled` / `skipped` so the highlight stays on the next actionable package.

## Table actions

Install table rows (one per component / install step) expose the same actions via a right-click menu and an **Actions** column — visible before the first **Play** as well (disabled/enabled per rules below). Breakpoints can be set on an idle plan via `ensureIdleRun()`.

| Action | When | Behavior |
| --- | --- | --- |
| **Uninstall back to here** | `paused` / `stopped`; target step before cursor | Force-uninstall each package from cursor−1 down to the target step; move cursor to target. Confirms first. |
| **Add / remove breakpoint** | Future, not-yet-installed steps (including before first Play) | Toggle `InstallRun.breakpointStepIds`. Row class `install-breakpoint`. |
| **Move cursor here** | `paused` / `stopped` (immediate), or while `running` / `waitingForInput` (after current step); not on finished steps | Sets `cursor` to the selected install step. Disabled when target is `succeeded` / `alreadyInstalled` / `skipped`. Confirms when moving backward across installed packages. |

**Breakpoints (mode B):** when the runner reaches a breakpoint step, it pauses **before staging/copying** that package (`runState: paused`, cursor on the breakpoint step).

Dangerous rollback actions use [`ConfirmDialog.tsx`](../src/ui/ConfirmDialog.tsx) (`confirm-dialog-backdrop` / `confirm-dialog`; `danger` for destructive confirms).

## Resolve & run

1. Stage by XML `modId` (download folder) → discover tp2 → WeiDU id = tp2 parent folder.
2. List: `weidu.exe --nogame --noautoupdate --list-components-json <tp2> <lang>`.
3. Resolve: prefer `:N` → number; else match WeiDU `label[]` to **component id** (not XML UI `label`/`name`).
4. Language: prefer English TRA name; else first listed (`pickEnglishLanguage`).
5. Copy `weidu.exe` → `{gameDir}/setup-{weiduId}.exe`; run **that** exe (no tp2 argv) with:

   - `--noautoupdate`
   - `--safe-exit` (so a killed install can be cleaned with force-uninstall)
   - `--language`, `--use-lang`
   - `--force-install` + component number

**Stop cleanup:** same `setup-{weiduId}.exe` path with `--noautoupdate --force-uninstall` (`run_weidu_force_uninstall`; no `--safe-exit` on uninstall). Do not invoke the configured `weidu.exe` directly for install or uninstall.

Orchestration: `hooks/useInstallRun.ts` + `lib/desktop/weiduInstall.ts` → Rust `src-tauri/src/weidu_install.rs`. Console/log helpers under `src/lib/install/`.

## Backups

Settings **Backup / logs / projects directory** (`appDirs.backupDir`). App-wide **vanilla** bindings live in `infinity-express.vanilla-registry` (managed path under the data root, or an external unmodded folder). UI: Settings → Vanilla backups; wizard on new project; [`BackupManagerDialog.tsx`](../src/ui/install/BackupManagerDialog.tsx) for snapshots. Rust: [`weidu_backup.rs`](../src-tauri/src/weidu_backup.rs). TS wrappers: [`weiduInstall.ts`](../src/lib/desktop/weiduInstall.ts). Types: `BackupKind` / `BackupManifest` in [`types.ts`](../src/lib/install/types.ts).

### Layout

```text
{backupDir}/
  {gameKey}/                 # bg1 | bg2 | iwd | pst  (never "eet")
    manifest.json
    vanilla/                 # managed unmodded copy (preferred)
    {snapshotName}/          # named snapshots as siblings of vanilla
  install-logs/
    {runId}/                 # WeiDU run stdout/stderr (not game backups)
```

**Project destinations** (live/modded folders) are per-project, not under this tree. Creating a project: empty destination → `prepare_project_destination` copies vanilla into it; non-empty destination must already contain the game executable.

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
2. If an install run exists, `restartFromBackup` resets steps to `queued`, marks `alreadyInstalled` from each step’s phase game dir `weidu.log` (`parseWeiduLog` / `~tp2~ #lang #number`), and places the **cursor** on the first unfinished step.
3. Leaves `runState: 'idle'` — **does not** start or resume WeiDU. User presses Play.
4. Vanilla (no log) → none marked installed. Does **not** change Components-phase selection checkboxes.

### Commands

`backup_game_dir`, `create_named_backup`, `list_backups`, `restore_game_dir`, `delete_backup`.

## Key paths

| Area | Path |
| --- | --- |
| Types / plan | `src/lib/install/types.ts`, `planBuilder.ts` |
| WeiDU.log parse | `src/lib/install/weiduLog.ts` |
| Label → number | `src/lib/install/weiduResolution.ts` |
| Run hook | `src/hooks/useInstallRun.ts` |
| UI | `src/ui/install/InstallStation.tsx`, `InstallTable.tsx`, `BackupManagerDialog.tsx`, console dock |
| Rust install / backup | `src-tauri/src/weidu_install.rs`, `weidu_backup.rs` |

Tauri FS boundary (dialogs vs persisted paths): `.cursor/rules/tauri-desktop.mdc`.
