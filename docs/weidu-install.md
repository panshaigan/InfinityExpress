# WeiDU install

Identity rule also auto-attaches via `.cursor/rules/weidu-mod-ids.mdc`. Architecture: [architecture.md](architecture.md).

## Never confuse these IDs

| Concept | Meaning | Example |
| --- | --- | --- |
| XML `<mod id>` / `<component modId>` | **Download folder** under `{backupDir}/mods` | `Tweaks-Anthology` |
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
- **Play (fresh start)** places the cursor on the first unfinished step (`alreadyInstalled` / succeeded / skipped are skipped).
- Before the first **Play**, the table uses the same rule on the live plan (`planSteps`) so the cursor highlight skips packages already identified from `WeiDU.log`.
- Pause / Stop keep the cursor on the interrupted package. Skip advances it. Success advances it.
- Play resume / Skip / Stop all act relative to this index.

Hook: `useInstallRun` exposes `cursorStepId` (`steps[cursor]?.stepId`, or the first unfinished plan step when no run exists yet) for the table.

## Controls

Toolbar in `InstallStation.tsx`; state machine in `useInstallRun.ts`.

| Control | Enabled | Behavior |
| --- | --- | --- |
| **Play** | Not `running` (and paths/mods ready) | Fresh start when no run / `idle` / `completed`: `initRun` + vanillas + `executeFromCursor` from the first unfinished step (`alreadyInstalled` skipped). Resume when `paused` / `stopped` / `failed` / `waitingForInput`: continue from current cursor (no re-init). |
| **Pause** | `running` or `paused` (toggle) | **Pending pause** while `running`: finishes the current step, then halts before the next. Click again while pending to cancel. **Effective pause** sets `runState: 'paused'`. Click again (or Play) to resume. |
| **Stop** | `running` or `waitingForInput` | Kills the WeiDU child, then runs `--force-uninstall` via the same `setup-{weiduId}.exe` as install; resets the interrupted step to `queued`; **keeps cursor**; `runState: 'stopped'`. Less safe than Pause (tooltip says so). |
| **Skip** | `idle` / `paused` / `stopped` / `waitingForInput` / `failed` (or before first Play); at least one step after the cursor; cursor step not already finished | Marks the package at the cursor as `skipped`, advances cursor, stays halted — does **not** auto-continue. Creates an idle run via `ensureIdleRun()` when used before Play. |
| **Previous** | `idle` / `paused` / `stopped` / `failed` (or before first Play); `cursor > 0` | Confirms, then moves cursor back one install step, force-uninstalls that package via `setup-{weiduId}.exe`, resets it to `queued`. Creates an idle run via `ensureIdleRun()` when used before Play. |
| **Restart** | Vanilla exists; install has started; not mid-copy / WeiDU live | Restores the vanilla backup (EET: stage-only BG2 or full BG1+BG2) and resets the plan. |
| **Hide installed** | Always | Toolbar icon: hides rows with status `succeeded` / `alreadyInstalled` from the plan table. Persisted in the install session. |
| **Follow install cursor** | Cursor step exists | Toolbar toggle (next to Hide installed). When **on**, selection and table scroll track the install cursor as it advances. When **off**, selection stays put (row click also turns follow off). Turning **on** jumps to the cursor once. Persisted in the install session. |
| **Pause on warnings** | Always | Toolbar icon (next to Hide installed). When **on**, after a step finishes with WeiDU **exit code 3** (installed with warnings), the run pauses like Pause (finish current step → `paused`). When **off**, exit 3 continues as today (`succeededWithWarnings`). Does not auto-pause on exit 0 with incomplete WeiDU.log verify. Persisted in the install session. |
| **Take snapshot** | Vanilla exists for the current phase game; not mid-copy / WeiDU live | Name popup (`OutlinedTextField`, default `snapshot-{Ymd-His}`), then immediately copies that game folder (`createNamedBackup`, full copy). |
| **Restore snapshot** | At least one named snapshot exists; not mid-copy / WeiDU live | Opens the snapshot table ([`RestoreSnapshotDialog.tsx`](../src/ui/install/RestoreSnapshotDialog.tsx)). Disabled with “No snapshots yet” when the list is empty. |

`InstallRunState` includes `stopped` (hard stop after kill/cleanup), separate from soft `paused`.

When halted (`paused` / `stopped` / `waitingForInput`), cursor normalization skips `succeeded` / `alreadyInstalled` / `skipped` so the highlight stays on the next actionable package.

## Table actions

Install table rows (one per component / install step) expose the same actions via a right-click menu and an **Actions** column — visible before the first **Play** as well (disabled/enabled per rules below). Breakpoints can be set on an idle plan via `ensureIdleRun()`.

| Action | When | Behavior |
| --- | --- | --- |
| **Go back one step** | Same as toolbar **Previous** (`cursor > 0`; `idle` / `paused` / `stopped` / `failed`) | Same confirm + uninstall as the toolbar control. |
| **Skip package at cursor** | Same as toolbar **Skip** (step after cursor; skippable cursor package; allowed halt/idle states) | Same as the toolbar Skip control. |
| **Uninstall back to here** | `idle` / `paused` / `stopped` / `failed`; target step before cursor | Force-uninstall each package from cursor−1 down to the target step (including Done / Installed); move cursor to target. Confirms first. Blocked while `running` / `waitingForInput`. |
| **Add / remove breakpoint** | Future, not-yet-installed steps (including before first Play) | Toggle `InstallRun.breakpointStepIds`. Row class `install-breakpoint` (top-edge marker line). |
| **Plan / remove snapshot** | Same eligibility as breakpoints | Adding opens a name popup (`OutlinedTextField`, default `snapshot-{Ymd-His}`). Stores `{ stepId, name }` on `InstallRun.plannedSnapshots`. Row class `install-snapshot` (top-edge marker line). Removing does not prompt. |
| **Move cursor here** | `idle` / `paused` / `stopped` / `failed`; not on finished steps | Sets `cursor` to the selected install step. First use before **Play** creates an idle run via `ensureIdleRun()`. Disabled when target is `succeeded` / `alreadyInstalled` / `skipped`, and while `running` / `waitingForInput`. Confirms when moving backward across installed packages. |
| **Remove from plan** | `paused` / `stopped` / `failed`; step at or after cursor, not yet finished | Unchecks the component in Components (updates selection + syncs the run plan). |

**Breakpoints (mode B):** when the runner reaches a breakpoint step, it pauses **before staging/copying** that package (`runState: paused`, cursor on the breakpoint step). The hit breakpoint is removed automatically (one-shot), so resuming continues forward and later breakpoints still trigger.

**Planned snapshots:** when the runner is about to start a marked step, it temporarily shows `runState: paused`, copies that step’s live game folder (`createNamedBackup`, full copy), then auto-resumes and continues installing. Game mapping: EET `eet1` → BG1, EET `eet` → BG2, other engines → that game. Marker is one-shot (removed after success). Snapshot failure pauses and keeps the marker so Play retries. A breakpoint on the same step still pauses after the snapshot.

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
2. List: `weidu.exe --nogame --noautoupdate --list-components-json <tp2> <lang>` (stdout is parsed only — not mirrored to the WeiDU/Results console).
3. Resolve: prefer `:N` → number; else match WeiDU `label[]` to **component id** (not XML UI `label`/`name`).
4. Language: prefer English TRA name; else first listed (`pickEnglishLanguage`). `--list-languages` probe output is likewise not mirrored to the console.
5. Copy `weidu.exe` → `{gameDir}/setup-{weiduId}.exe`; run **that** exe (no tp2 argv) with:

   - `--noautoupdate`
   - `--no-exit-pause`, `--skip-at-view` (no interactive pauses)
   - `--language`, `--use-lang`
   - `--force-install` + component number

**Exit codes** (install step status):

| Code | Meaning | Status | Continues? |
| --- | --- | --- | --- |
| `0` + WeiDU.log verified | Success | `succeeded` | yes |
| `0` + log not verified | Soft success | `succeededWithWarnings` | yes |
| `3` | Installed with warnings | `succeededWithWarnings` | yes |
| stdout/results contain `SKIPPING:` | WeiDU skipped the component (predicate / game check) | `skipped` | yes |
| `2` (and other non-0/3) | Failed | `failed` | no |

**Console tabs:** WeiDU tab = raw process stdout/stderr only (`run-stdout.log` / `run-stderr.log`). Commands tab = setup command lines + app-synthesized status/info/error (`run-commands.log`). Results = keyword highlights (`run-results.log`). List probes (`--list-components-json`, `--list-languages`) stay on the Commands tab as argv only — their JSON/language dumps are not emitted to WeiDU or Results. UI keeps only the last ~800 lines per tab (live append and reload); full history stays on disk. On **project open** (when not mid-WeiDU), those tails are loaded from disk into all three tabs; later phase switches do not reload. See `.cursor/rules/weidu-console-tabs.mdc`.

**Install run persistence:** Full install session (`InstallRun` statuses/cursor/durations/breakpoints/log paths + UI toggles) is stored as `{runDir}/run-state.json`. Project localStorage keeps only `installRef: { runId, logDir }`. Legacy inlined `session.install` blobs migrate to disk on project open.

**Stop cleanup:** same `setup-{weiduId}.exe` path with `--noautoupdate --force-uninstall` (`run_weidu_force_uninstall`). Do not invoke the configured `weidu.exe` directly for install or uninstall.

Orchestration: `hooks/useInstallRun.ts` + `lib/desktop/weiduInstall.ts` → Rust `src-tauri/src/weidu_install.rs`. Console/log helpers under `src/lib/install/`.

## Backups

Settings **main data folder directory** (`appDirs.backupDir`). App-wide **vanilla** bindings live in `infinity-express.vanilla-registry` (managed path under the data root, or an external unmodded folder). UI: Settings → Vanilla backups (cards for set bindings; ⋮ retarget / copy-elsewhere); wizard on new project; Install toolbar **Restart** (restore vanilla + reset plan), **Take snapshot** (name popup then copy now), and **Restore snapshot** ([`RestoreSnapshotDialog.tsx`](../src/ui/install/RestoreSnapshotDialog.tsx)). Rust: [`weidu_backup.rs`](../src-tauri/src/weidu_backup.rs). TS wrappers: [`weiduInstall.ts`](../src/lib/desktop/weiduInstall.ts). Types: `BackupKind` / `BackupManifest` in [`types.ts`](../src/lib/install/types.ts).

### Layout

```text
{backupDir}/
  mods/
    {DownloadId}/            # acquired / staged mod folders (XML mod id)
  backups/
    {gameKey}.json           # per-game backup manifest (sidecar)
    {gameKey}/               # bg1 | bg2 | iwd | pst
      vanilla/               # managed unmodded game copy
      {snapshotName}/        # named snapshots (siblings of vanilla)
  projects/
    {folderName}/            # sanitized project display name
      {YYYY-MM-DD_HH-mm-ss}/ # one install run until Reset all
        run-state.json       # install session (statuses, cursor, UI, transport)
        run-stdout.log       # WeiDU stdout (append)
        run-stderr.log       # WeiDU stderr (append)
        run-commands.log     # Commands tab (append)
        run-results.log      # Results tab (append)
        {NNN}-{safeModId}-{safeComponentId}/
          {safeModId}-{safeComponentId}-mod.log        # process stdout (append)
          {safeModId}-{safeComponentId}-component.log  # process stderr (append)
          {safeModId}-{safeComponentId}-results.log    # result highlights (append)
  metrics/
    component-install-times.jsonl  # append-only per-component install samples
```

**Project destinations** (live/modded folders) are per-project, not under this tree. Creating a project: empty destination → `prepare_project_destination` copies vanilla into it; non-empty destination must already contain the game executable (an existing `WeiDU.log` is allowed).

Project disk folders use `meta.folderName` (from the display name); UUID `meta.id` stays in localStorage only. Renaming a project renames the on-disk folder when possible. A run folder is minted on first Play (or after **Reset all**) and reused across Play / Restart until Reset all clears the install session; prior run folders are kept as history.

### Vanilla vs snapshot

| Kind | Path | Rules |
| --- | --- | --- |
| `vanilla` | `backups/{gameKey}/vanilla/` | One per game key. Required before install Start. Recreate replaces existing. |
| `snapshot` | `backups/{gameKey}/{name}/` | Named; same name replaces. Reserved names: `vanilla`, `baseline`, `snapshots`, `manifest.json`. Only allowed after vanilla exists for that key. |

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

### Destination WeiDU.log import

Picking a project destination that already has `WeiDU.log` (new project or Settings retarget) reverse-maps installed rows onto InstallSequence component ids:

1. Parse `~tp2~ #lang #number` (`parseWeiduLog`). Language is kept on the install step but **not** used for matching.
2. Numbered XML ids (`weiduFolder:N`) match the tp2 parent folder + designated number (no WeiDU process).
3. Leftover LABEL ids: `--list-components-json` on the **game-dir** tp2 (do not stage from the download dir). Find the listing row whose `number` equals the log’s component number, then look up each `label[]` in `componentsById` (case-insensitive). Skip numbered `folder:N` ids so `EEex:1` cannot steal another mod’s `#1`. Export-phase is not used as a filter (`engineMatches` only), so an `eet1` component can still map from the BG2 log.
4. Identified ids are saved on the project session (`installedFromWeiduLog`) and restored on open. Listing failures are reported (not swallowed). If WeiDU.exe is unset, numbered ids still import; the LABEL pass re-runs when a WeiDU path appears. A background rescan **merges** with the persisted hit list while the log is still present (so LABEL hits are not dropped just because listing failed this time).
5. Components selection is **replaced** with required/`alwaysIf` plus mapped ids (Fixes seed is skipped). Unmapped log rows are skipped.
6. Install status is **identified ∩ current plan**, keyed by component id **and** phase: a dual-token EET component (EEFP Core Fixes / Game Text Update) is `alreadyInstalled` on the Pre-EET step only if it is in BG1’s `WeiDU.log`, and on the EET step only if it is in BG2’s log. Checking a previously identified component later still marks the matching-phase step. An in-flight rescan (`weiduLogImport == null`) does not unmark.

Vanilla folders still reject `WeiDU.log`. Mapping lives in [`weiduLogMap.ts`](../src/lib/install/weiduLogMap.ts).

### Restore → install plan

1. Wipe target game dir, then copy snapshot or vanilla tree.
2. If an install run exists, `restartFromBackup` resets steps to `queued`, reverse-maps each phase game dir `weidu.log` onto component ids, marks those steps `alreadyInstalled`, and places the **cursor** on the first unfinished step.
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
| WeiDU.log → XML ids | `src/lib/install/weiduLogMap.ts` |
| Label → number | `src/lib/install/weiduResolution.ts` |
| Install timings | `src/lib/install/installTiming.ts` — JSONL under `{backupDir}/metrics/` |
| Run hook | `src/hooks/useInstallRun.ts` |
| Run state on disk | `src/lib/install/runStateStore.ts`, `runStatePersistence.ts` |
| UI | `src/ui/install/InstallStation.tsx`, `InstallTable.tsx`, `RestoreSnapshotDialog.tsx`, `PlanSnapshotDialog.tsx`, `RestartConfirmDialog.tsx`, console dock |
| Rust install / backup | `src-tauri/src/weidu_install.rs`, `weidu_backup.rs` |

Tauri FS boundary (dialogs vs persisted paths): `.cursor/rules/tauri-desktop.mdc`.
