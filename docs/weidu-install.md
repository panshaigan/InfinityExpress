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
| **Restart** | Vanilla exists; install has started; not mid-copy / WeiDU live | Restores the vanilla backup (EET: stage-only BG2 or full BG1+BG2) and resets the plan. |
| **Take snapshot** | Vanilla exists for the current phase game; not mid-copy / WeiDU live | Name popup (`OutlinedTextField`, default `snapshot-{Ymd-His}`), then immediately copies that game folder (`createNamedBackup`, full copy). |
| **Restore snapshot** | At least one named snapshot exists; not mid-copy / WeiDU live | Opens the snapshot table ([`RestoreSnapshotDialog.tsx`](../src/ui/install/RestoreSnapshotDialog.tsx)). Disabled with “No snapshots yet” when the list is empty. |

`InstallRunState` includes `stopped` (hard stop after kill/cleanup), separate from soft `paused`.

When halted (`paused` / `stopped` / `waitingForInput`), cursor normalization skips `succeeded` / `alreadyInstalled` / `skipped` so the highlight stays on the next actionable package.

## Table actions

Install table rows (one per component / install step) expose the same actions via a right-click menu and an **Actions** column — visible before the first **Play** as well (disabled/enabled per rules below). Breakpoints can be set on an idle plan via `ensureIdleRun()`.

| Action | When | Behavior |
| --- | --- | --- |
| **Uninstall back to here** | `paused` / `stopped`; target step before cursor | Force-uninstall each package from cursor−1 down to the target step; move cursor to target. Confirms first. |
| **Add / remove breakpoint** | Future, not-yet-installed steps (including before first Play) | Toggle `InstallRun.breakpointStepIds`. Row class `install-breakpoint`. |
| **Plan / remove snapshot** | Same eligibility as breakpoints | Adding opens a name popup (`OutlinedTextField`, default `snapshot-{Ymd-His}`). Stores `{ stepId, name }` on `InstallRun.plannedSnapshots`. Row class `install-snapshot`. Removing does not prompt. |
| **Move cursor here** | `paused` / `stopped` (immediate), or while `running` / `waitingForInput` (after current step); not on finished steps | Sets `cursor` to the selected install step. Disabled when target is `succeeded` / `alreadyInstalled` / `skipped`. Confirms when moving backward across installed packages. |
| **Remove from plan** | `paused` / `stopped` / `failed`; step at or after cursor, not yet finished | Unchecks the component in Components (updates selection + syncs the run plan). |

**Breakpoints (mode B):** when the runner reaches a breakpoint step, it pauses **before staging/copying** that package (`runState: paused`, cursor on the breakpoint step).

**Planned snapshots:** when the runner is about to start a marked step, it copies that step’s live game folder (`createNamedBackup`, full copy) under the chosen name, then **continues installing** (no pause). Game mapping: EET `eet1` → BG1, EET `eet` → BG2, other engines → that game. Marker is one-shot (removed after success). Snapshot failure pauses and keeps the marker so Play retries. A breakpoint on the same step still pauses after the snapshot.

## Cross-phase install lock

After the first **Play**, Components and Mods respect the active install run:

| Run state | Components | Mods | Route reopen |
| --- | --- | --- | --- |
| **Running** / **waitingForInput** | Tree readonly; no toggles | All action icons disabled | Reopen route / stop disabled |
| **Paused** / **stopped** / **failed** | Steps **before cursor** locked (badge: Installed); only at/after cursor toggles; `alwaysIf` partners of locked steps stay locked | Acquire/remove only for mods with no steps before cursor | Reopen allowed |
| **Idle** / no run | Normal | Normal | Normal |

Logic: [`installLock.ts`](../src/lib/install/installLock.ts). Session snapshot in App drives lock even before visiting Install.

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

Settings **main data folder directory** (`appDirs.backupDir`). App-wide **vanilla** bindings live in `infinity-express.vanilla-registry` (managed path under the data root, or an external unmodded folder). UI: Settings → Vanilla backups; wizard on new project; Install toolbar **Restart** (restore vanilla + reset plan), **Take snapshot** (name popup then copy now), and **Restore snapshot** ([`RestoreSnapshotDialog.tsx`](../src/ui/install/RestoreSnapshotDialog.tsx)). Rust: [`weidu_backup.rs`](../src-tauri/src/weidu_backup.rs). TS wrappers: [`weiduInstall.ts`](../src/lib/desktop/weiduInstall.ts). Types: `BackupKind` / `BackupManifest` in [`types.ts`](../src/lib/install/types.ts).

### Layout

```text
{backupDir}/
  backups/
    {gameKey}/               # bg1 | bg2 | iwd | pst — managed unmodded copy
    {gameKey}.json           # per-game backup manifest (sidecar)
  {gameKey}/                 # legacy / named snapshots (until project snapshots land)
    {snapshotName}/
  projects/
    {projectId}/
      logs/
        {runId}/             # WeiDU run stdout/stderr (not game backups)
  metrics/
    component-install-times.jsonl  # append-only per-component install samples
```

**Project destinations** (live/modded folders) are per-project, not under this tree. Creating a project: empty destination → `prepare_project_destination` copies vanilla into it; non-empty destination must already contain the game executable (and no `WeiDU.log`).

Legacy trees are migrated on `list_backups` / create / delete:

- `baseline/` → managed vanilla under `backups/{gameKey}/`
- `{gameKey}/vanilla/` → `backups/{gameKey}/`
- `snapshots/{name}/` → `{gameKey}/{name}/`
- Manifest field `baseline` is accepted on read; rewritten as `vanilla`
- Legacy `{gameKey}/manifest.json` is read and rewritten to `backups/{gameKey}.json`

### Vanilla vs snapshot

| Kind | Path | Rules |
| --- | --- | --- |
| `vanilla` | `backups/{gameKey}/` | One per game key. Required before install Start. Recreate replaces existing. |
| `snapshot` | `{gameKey}/{name}/` | Named; same name replaces. Only allowed after vanilla exists for that key. (Project-scoped snapshots under `projects/` are planned later.) |

Named snapshots are created from the Install toolbar (**Take snapshot**) or as planned row snapshots. Both copy the current phase’s live game folder (full copy). Vanilla create/recreate stays in Settings (and the new-project wizard). If vanilla is missing on Play, Install opens Settings.

**EET:** Start requires **both** `bg1` and `bg2` vanillas. A vanilla created earlier under a non-EET BG1/BG2 install counts. Take / planned snapshot uses the current phase folder (`eet1` → BG1, `eet` → BG2). Restore list merges both keys (Game column). **Restart** offers EET stage only (BG2) or full installation (BG1 + BG2).

### Operations & progress

Event: `weidu-backup-progress` (`phase`, `message`, `filesDone`/`bytesDone`, `filesTotal`/`bytesTotal`).

| Op | Progress |
| --- | --- |
| Create | Measure → copy (per-file). Pre-delete of existing dest is async with indeterminate bar. |
| Restore | Wipe live game folder (`Cleaning game folder…`) → measure → copy. |
| Delete | Async `remove_dir_all` with indeterminate “Removing snapshot…”. |

UI shows message on the left and `copied / total` bytes on the right (no em dash). Indeterminate animated bar when totals are 0.

### Restore → install plan

1. Wipe target game dir, then copy snapshot or vanilla tree.
2. If an install run exists, `restartFromBackup` resets steps to `queued`, marks `alreadyInstalled` from each step’s phase game dir `weidu.log` (`parseWeiduLog` / `~tp2~ #lang #number`), and places the **cursor** on the first unfinished step.
3. Leaves `runState: 'idle'` — **does not** start or resume WeiDU. User presses Play.
4. Vanilla restore (no log) → none marked installed. Does **not** change Components-phase selection checkboxes.

Install toolbar **Restart** restores the vanilla backup (with EET scope choice) then runs the same plan reset. **Restore snapshot** restores a named snapshot only (vanilla is not listed there).

### Commands

`backup_game_dir`, `create_named_backup`, `list_backups`, `restore_game_dir`, `delete_backup`.

## Key paths

| Area | Path |
| --- | --- |
| Types / plan | `src/lib/install/types.ts`, `planBuilder.ts` |
| WeiDU.log parse | `src/lib/install/weiduLog.ts` |
| Label → number | `src/lib/install/weiduResolution.ts` |
| Install timings | `src/lib/install/installTiming.ts` — JSONL under `{backupDir}/metrics/` |
| Run hook | `src/hooks/useInstallRun.ts` |
| UI | `src/ui/install/InstallStation.tsx`, `InstallTable.tsx`, `RestoreSnapshotDialog.tsx`, `PlanSnapshotDialog.tsx`, `RestartConfirmDialog.tsx`, console dock |
| Rust install / backup | `src-tauri/src/weidu_install.rs`, `weidu_backup.rs` |

Tauri FS boundary (dialogs vs persisted paths): `.cursor/rules/tauri-desktop.mdc`.
