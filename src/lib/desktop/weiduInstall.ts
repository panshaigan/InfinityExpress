import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { isDesktopApp } from './fsDialogs'
import type {
  BackupManifest,
  WeiduComponentInfo,
  WeiduInstallEvent,
  WeiduLanguageInfo,
} from '../install/types'

export interface RunStepInput {
  weiduPath: string
  tp2Path: string
  gameDir: string
  componentId: string
  componentNumber: number
  languageIndex: number
  stepId: string
  logDir: string
  stepFolder: string
  timeoutSecs?: number
}

export interface StepResult {
  exitCode: number | null
  stdoutPath: string
  stderrPath: string
  debugPath: string | null
  logVerified: boolean
  timedOut: boolean
  cancelled: boolean
  /** WeiDU child wall time from spawn-wait through process exit. */
  durationMs: number
}

export interface BackupGameInput {
  sourceDir: string
  backupRoot: string
  gameKey: string
  kind: 'vanilla' | 'snapshot'
  name?: string | null
  excludeSafeDirs: boolean
}

export interface BackupEntry {
  kind: string
  name: string
  path: string
  createdAt: string
  excludeSafeDirs: boolean
}

export interface BackupGameResult {
  path: string
  entry: BackupEntry
}

export interface BackupProgress {
  phase: string
  message: string
  filesDone: number
  bytesDone: number
  filesTotal: number
  bytesTotal: number
}

export interface StageProgress {
  phase: string
  message: string
  filesDone: number
  bytesDone: number
}

export interface CleanupInput {
  gameDir: string
  stagedFolders: string[]
  keepFolders: string[]
  weiduPath: string
  logDir: string
}

function requireDesktop() {
  if (!isDesktopApp()) {
    throw new Error('Installation requires the desktop app.')
  }
}

export async function listWeiduComponents(
  weiduPath: string,
  tp2Path: string,
  gameDir: string,
  lang: number,
): Promise<WeiduComponentInfo[]> {
  requireDesktop()
  return invoke<WeiduComponentInfo[]>('list_weidu_components', {
    weiduPath,
    tp2Path,
    gameDir,
    lang,
  })
}

export async function listWeiduLanguages(
  weiduPath: string,
  tp2Path: string,
  gameDir: string,
): Promise<WeiduLanguageInfo[]> {
  requireDesktop()
  return invoke<WeiduLanguageInfo[]>('list_weidu_languages', {
    weiduPath,
    tp2Path,
    gameDir,
  })
}

export async function runWeiduStep(input: RunStepInput): Promise<StepResult> {
  requireDesktop()
  return invoke<StepResult>('run_weidu_step', {
    input: {
      weiduPath: input.weiduPath,
      tp2Path: input.tp2Path,
      gameDir: input.gameDir,
      componentId: input.componentId,
      componentNumber: input.componentNumber,
      languageIndex: input.languageIndex,
      stepId: input.stepId,
      logDir: input.logDir,
      stepFolder: input.stepFolder,
      timeoutSecs: input.timeoutSecs ?? null,
    },
  })
}

export interface ForceUninstallInput {
  weiduPath: string
  tp2Path: string
  gameDir: string
  componentNumber: number
  languageIndex: number
  logDir: string
  stepFolder: string
}

/** Same setup-{weiduId}.exe path as install; runs --force-uninstall. */
export async function runWeiduForceUninstall(
  input: ForceUninstallInput,
): Promise<void> {
  requireDesktop()
  await invoke('run_weidu_force_uninstall', {
    input: {
      weiduPath: input.weiduPath,
      tp2Path: input.tp2Path,
      gameDir: input.gameDir,
      componentNumber: input.componentNumber,
      languageIndex: input.languageIndex,
      logDir: input.logDir,
      stepFolder: input.stepFolder,
    },
  })
}

export async function sendWeiduStdin(text: string): Promise<void> {
  requireDesktop()
  await invoke('send_weidu_stdin', { text })
}

export async function cancelWeiduStep(): Promise<void> {
  if (!isDesktopApp()) return
  await invoke('cancel_weidu_step')
}

export async function stageModIntoGameDir(
  modsDownloadDir: string,
  codename: string,
  gameDir: string,
  options?: { tp2Hint?: string | null; gameVersion?: string | null },
): Promise<string> {
  requireDesktop()
  return invoke<string>('stage_mod_into_game_dir', {
    modsDownloadDir,
    codename,
    gameDir,
    tp2Hint: options?.tp2Hint ?? null,
    gameVersion: options?.gameVersion ?? null,
  })
}

export async function cleanupInstallArtifacts(input: CleanupInput): Promise<void> {
  requireDesktop()
  await invoke('cleanup_install_artifacts', { input })
}

export async function readGameWeiduLog(gameDir: string): Promise<string> {
  if (!isDesktopApp()) return ''
  return invoke<string>('read_game_weidu_log', { gameDir })
}

export async function readGameExeVersion(
  gameDir: string,
  exeName: string,
): Promise<string> {
  requireDesktop()
  return invoke<string>('read_game_exe_version', { gameDir, exeName })
}

export async function backupGameDir(input: BackupGameInput): Promise<BackupGameResult> {
  requireDesktop()
  return invoke<BackupGameResult>('backup_game_dir', { input })
}

export async function restoreGameDir(
  backupPath: string,
  targetDir: string,
): Promise<void> {
  requireDesktop()
  await invoke('restore_game_dir', { backupPath, targetDir })
}

export async function listBackups(
  backupRoot: string,
  gameKey: string,
): Promise<BackupManifest> {
  if (!isDesktopApp()) {
    return { gameKey, vanilla: null, snapshots: [] }
  }
  return invoke<BackupManifest>('list_backups', { backupRoot, gameKey })
}

export async function createNamedBackup(
  input: BackupGameInput,
): Promise<BackupGameResult> {
  requireDesktop()
  return invoke<BackupGameResult>('create_named_backup', { input })
}

export async function deleteBackup(
  backupRoot: string,
  gameKey: string,
  backupPath: string,
): Promise<void> {
  requireDesktop()
  await invoke('delete_backup', { backupRoot, gameKey, backupPath })
}

export async function prepareProjectDestination(input: {
  targetDir: string
  vanillaSource?: string | null
  exeName: string
}): Promise<import('../projects/types').PrepareDestinationResult> {
  requireDesktop()
  return invoke('prepare_project_destination', {
    targetDir: input.targetDir,
    vanillaSource: input.vanillaSource ?? null,
    exeName: input.exeName,
  })
}

export async function listenWeiduInstallEvents(
  handler: (event: WeiduInstallEvent) => void,
): Promise<UnlistenFn> {
  if (!isDesktopApp()) return () => {}
  return listen<WeiduInstallEvent>('weidu-install-event', (ev) => {
    handler(ev.payload)
  })
}

export async function listenBackupProgress(
  handler: (payload: BackupProgress) => void,
): Promise<UnlistenFn> {
  if (!isDesktopApp()) return () => {}
  return listen<BackupProgress>('weidu-backup-progress', (ev) => {
    handler(ev.payload)
  })
}

export async function listenStageProgress(
  handler: (payload: StageProgress) => void,
): Promise<UnlistenFn> {
  if (!isDesktopApp()) return () => {}
  return listen<StageProgress>('weidu-stage-progress', (ev) => {
    handler(ev.payload)
  })
}

export function gameDirForPhase(
  game: import('../xml/schema').SelectedGame,
  phase: import('../install/types').InstallPhase,
  folders: import('../ui/gameFolderPrefs').GameFolderPaths,
): string {
  if (game === 'eet') {
    return phase === 'eet1' ? folders.bg1 : folders.bg2
  }
  if (game === 'bg1') return folders.bg1
  if (game === 'bg2') return folders.bg2
  if (game === 'iwd') return folders.iwd
  return folders.pst
}

export function gameKeysForRun(
  game: import('../xml/schema').SelectedGame,
): string[] {
  if (game === 'eet') return ['bg1', 'bg2']
  return [game]
}
