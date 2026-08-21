import { backupGameDir, listBackups, prepareProjectDestination } from '../desktop/weiduInstall'
import { GAME_FOLDER_EXE, probeGameFolder } from '../desktop/gameExe'
import {
  ensureDir,
  isDesktopApp,
  normalizeFolderPath,
  renamePath,
  validateCreatableDir,
  dirIsEmpty,
} from '../desktop/fsDialogs'
import { readAppDirPaths } from '../ui/appDirPrefs'
import type { GameFolderKey } from '../ui/gameFolderPrefs'
import {
  allocateProjectFolderName,
  getProject,
  upsertProject,
  type ProjectId,
} from './projectStore'
import { modsRoot, projectDir, projectsRoot } from './projectPaths'
import type { PrepareDestinationResult } from './types'
import {
  managedVanillaPath,
  readVanillaRegistry,
  setVanillaBinding,
  vanillaPath,
} from './vanillaRegistry'
import {
  rewriteInstallRunStateLogDir,
} from '../install/runStateStore'

/** Sync managed vanilla bindings from backup manifests when present. */
export async function syncManagedVanillasFromDisk(): Promise<void> {
  const { backupDir } = readAppDirPaths()
  if (!backupDir.trim() || !isDesktopApp()) return
  const registry = readVanillaRegistry()
  for (const key of ['bg1', 'bg2', 'iwd', 'pst'] as const) {
    try {
      const manifest = await listBackups(backupDir, key)
      const path = manifest.vanilla?.path?.trim()
      if (!path) continue
      const existing = registry[key]
      if (existing?.mode === 'external' && existing.path.trim()) continue
      setVanillaBinding(key, { mode: 'managed', path })
    } catch {
      /* ignore per-key */
    }
  }
}

/** Validate the main data folder path (may not exist yet if parent does). */
export async function validateMainDataFolder(path: string): Promise<string> {
  const trimmed = path.trim()
  if (!trimmed) throw new Error('Required')
  if (isDesktopApp()) {
    try {
      await validateCreatableDir(trimmed)
    } catch (err) {
      throw new Error(String(err))
    }
  }
  return trimmed
}

/** Ensure the main data folder exists (create if missing) and is usable. */
export async function ensureMainDataFolder(path: string): Promise<string> {
  const trimmed = await validateMainDataFolder(path)
  if (isDesktopApp()) {
    try {
      await ensureDir(trimmed)
      await ensureDir(projectsRoot(trimmed))
      await ensureDir(modsRoot(trimmed))
    } catch (err) {
      throw new Error(String(err))
    }
  }
  return trimmed
}

/** Create `{dataRoot}/projects/{folderName}` when the main data folder is set. */
export async function ensureProjectDir(folderName: string): Promise<void> {
  const { backupDir } = readAppDirPaths()
  if (!backupDir.trim() || !isDesktopApp()) return
  await ensureDir(projectDir(backupDir, folderName))
}

/**
 * Rename a project's display name and on-disk folder.
 * Updates persisted install `logDir` paths when the folder moves.
 */
export async function renameProject(
  id: ProjectId,
  nextName: string,
): Promise<void> {
  const trimmed = nextName.trim()
  if (!trimmed) throw new Error('Name is required')
  const record = getProject(id)
  if (!record) throw new Error('Project not found')
  if (trimmed === record.meta.name) return

  const nextFolder = allocateProjectFolderName(trimmed, id)
  const prevFolder = record.meta.folderName
  const { backupDir } = readAppDirPaths()

  if (
    backupDir.trim() &&
    isDesktopApp() &&
    prevFolder !== nextFolder
  ) {
    const from = projectDir(backupDir, prevFolder)
    const to = projectDir(backupDir, nextFolder)
    await renamePath(from, to)
  }

  let session = record.session
  if (session?.installRef?.logDir && prevFolder !== nextFolder && backupDir.trim()) {
    const fromPrefix = projectDir(backupDir, prevFolder).replace(/\\/g, '/')
    const toPrefix = projectDir(backupDir, nextFolder).replace(/\\/g, '/')
    const logDir = session.installRef.logDir.replace(/\\/g, '/')
    if (logDir === fromPrefix || logDir.startsWith(`${fromPrefix}/`)) {
      const rewritten = `${toPrefix}${logDir.slice(fromPrefix.length)}`
      session = {
        ...session,
        installRef: {
          runId: session.installRef.runId,
          logDir: rewritten,
        },
      }
      void rewriteInstallRunStateLogDir(logDir, rewritten)
    }
  }

  upsertProject(
    {
      meta: {
        ...record.meta,
        name: trimmed,
        folderName: nextFolder,
      },
      session,
    },
    { setLast: false },
  )
}

/**
 * Validate a project destination folder:
 * - missing / creatable (parent exists) → OK (will create + copy)
 * - existing empty → OK (will copy)
 * - existing non-empty → must have game exe (WeiDU.log / already-modded is OK)
 */
export async function validateDestinationFolder(
  key: GameFolderKey,
  path: string,
): Promise<string> {
  const trimmed = path.trim()
  if (!trimmed) throw new Error('Required')
  if (!isDesktopApp()) return trimmed

  try {
    await validateCreatableDir(trimmed)
  } catch (err) {
    throw new Error(String(err))
  }

  let empty = false
  try {
    empty = await dirIsEmpty(trimmed)
  } catch (err) {
    throw new Error(String(err))
  }
  if (empty) return trimmed

  const probe = await probeGameFolder(key, trimmed, { rejectWeiduLog: false })
  if (!probe.ok) throw new Error(probe.error)
  return trimmed
}

/** Create a managed vanilla under the data root from an unmodded source folder. */
export async function createManagedVanillaFromFolder(
  key: GameFolderKey,
  sourceDir: string,
): Promise<{ path: string; version: string }> {
  const { backupDir } = readAppDirPaths()
  if (!backupDir.trim()) {
    throw new Error('Set the main data folder first')
  }
  const probe = await probeGameFolder(key, sourceDir)
  if (!probe.ok) throw new Error(probe.error)

  const dest = managedVanillaPath(backupDir, key)
  // Source is already the managed backup location and valid — bind without re-copying.
  if (normalizeFolderPath(sourceDir) === normalizeFolderPath(dest)) {
    setVanillaBinding(key, {
      mode: 'managed',
      path: dest,
      version: probe.version || undefined,
    })
    return { path: dest, version: probe.version }
  }

  if (!isDesktopApp()) {
    setVanillaBinding(key, {
      mode: 'managed',
      path: dest,
      version: probe.version || undefined,
    })
    return { path: dest, version: probe.version }
  }

  const result = await backupGameDir({
    sourceDir: sourceDir.trim(),
    backupRoot: backupDir.trim(),
    gameKey: key,
    kind: 'vanilla',
    name: null,
    excludeSafeDirs: false,
  })
  setVanillaBinding(key, {
    mode: 'managed',
    path: result.path,
    version: probe.version || undefined,
  })
  return { path: result.path, version: probe.version }
}

export async function registerExternalVanilla(
  key: GameFolderKey,
  folderPath: string,
): Promise<{ path: string; version: string }> {
  const probe = await probeGameFolder(key, folderPath)
  if (!probe.ok) throw new Error(probe.error)
  setVanillaBinding(key, {
    mode: 'external',
    path: folderPath.trim(),
    version: probe.version || undefined,
  })
  return { path: folderPath.trim(), version: probe.version }
}

export async function useExistingManagedVanilla(
  key: GameFolderKey,
): Promise<string | null> {
  const { backupDir } = readAppDirPaths()
  if (!backupDir.trim()) return null
  if (isDesktopApp()) {
    const manifest = await listBackups(backupDir, key)
    const path = manifest.vanilla?.path?.trim()
    if (path) {
      setVanillaBinding(key, { mode: 'managed', path })
      return path
    }
  }
  const binding = readVanillaRegistry()[key]
  if (binding?.mode === 'managed' && binding.path.trim()) return binding.path.trim()
  return null
}

/** Copy the current vanilla for `key` into an empty folder and bind it as external. */
export async function copyVanillaToFolder(
  key: GameFolderKey,
  targetDir: string,
): Promise<{ path: string; version: string }> {
  const trimmed = targetDir.trim()
  if (!trimmed) throw new Error('Pick a destination folder')

  const binding = readVanillaRegistry()[key]
  const source = vanillaPath(binding)
  if (!source) throw new Error('No vanilla backup set for this game')

  if (normalizeFolderPath(source) === normalizeFolderPath(trimmed)) {
    throw new Error('Choose a different folder from the current backup')
  }

  if (isDesktopApp()) {
    try {
      await validateCreatableDir(trimmed)
    } catch (err) {
      throw new Error(String(err))
    }
    let empty = false
    try {
      empty = await dirIsEmpty(trimmed)
    } catch (err) {
      throw new Error(String(err))
    }
    if (!empty) {
      throw new Error('Destination folder must be empty')
    }

    await prepareProjectDestination({
      targetDir: trimmed,
      vanillaSource: source,
      exeName: GAME_FOLDER_EXE[key],
    })
  }

  return registerExternalVanilla(key, trimmed)
}

export async function prepareDestinationForKey(
  key: GameFolderKey,
  targetDir: string,
): Promise<PrepareDestinationResult> {
  const trimmed = targetDir.trim()
  if (!trimmed) throw new Error('Destination path is required')

  const vanilla = vanillaPath(readVanillaRegistry()[key])
  const exeName = GAME_FOLDER_EXE[key]

  if (!isDesktopApp()) {
    // Browser preview: accept path without copy/probe.
    return { action: 'accepted_existing', path: trimmed }
  }

  return prepareProjectDestination({
    targetDir: trimmed,
    vanillaSource: vanilla || null,
    exeName,
  })
}

