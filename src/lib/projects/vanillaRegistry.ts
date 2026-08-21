import type { GameFolderKey } from '../ui/gameFolderPrefs'
import type { SelectedGame } from '../xml/schema'
import type { VanillaBinding, VanillaRegistry } from './types'

const STORAGE_KEY = 'infinity-express.vanilla-registry'

const EMPTY: VanillaRegistry = {}

function isBinding(value: unknown): value is VanillaBinding {
  if (!value || typeof value !== 'object') return false
  const o = value as Record<string, unknown>
  if (o.mode !== 'external' && o.mode !== 'managed') return false
  if (typeof o.path !== 'string' || !o.path.trim()) return false
  if (o.version != null && typeof o.version !== 'string') return false
  return true
}

function isRegistry(value: unknown): value is VanillaRegistry {
  if (!value || typeof value !== 'object') return false
  for (const key of Object.keys(value as object)) {
    if (key !== 'bg1' && key !== 'bg2' && key !== 'iwd' && key !== 'pst') return false
    const binding = (value as Record<string, unknown>)[key]
    if (binding != null && !isBinding(binding)) return false
  }
  return true
}

export function readVanillaRegistry(): VanillaRegistry {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...EMPTY }
    const parsed: unknown = JSON.parse(raw)
    if (!isRegistry(parsed)) return { ...EMPTY }
    return { ...parsed }
  } catch {
    return { ...EMPTY }
  }
}

export function writeVanillaRegistry(registry: VanillaRegistry): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(registry))
  } catch {
    /* private mode / blocked storage */
  }
}

export function setVanillaBinding(
  key: GameFolderKey,
  binding: VanillaBinding | null,
): VanillaRegistry {
  const next = { ...readVanillaRegistry() }
  if (binding == null) delete next[key]
  else next[key] = binding
  writeVanillaRegistry(next)
  return next
}

export function vanillaPath(binding: VanillaBinding | undefined | null): string {
  return binding?.path?.trim() ?? ''
}

export function hasVanillaForKey(
  registry: VanillaRegistry,
  key: GameFolderKey,
): boolean {
  return vanillaPath(registry[key]).length > 0
}

/** Engine keys that need a vanilla binding before install / project seed. */
export function vanillaKeysForEngine(engine: SelectedGame): GameFolderKey[] {
  if (engine === 'eet') return ['bg1', 'bg2']
  if (engine === 'bg1' || engine === 'bg2' || engine === 'iwd' || engine === 'pst') {
    return [engine]
  }
  return ['bg2']
}

export function missingVanillaKeys(
  engine: SelectedGame,
  registry: VanillaRegistry = readVanillaRegistry(),
): GameFolderKey[] {
  return vanillaKeysForEngine(engine).filter((key) => !hasVanillaForKey(registry, key))
}

export function managedVanillaPath(dataRoot: string, key: GameFolderKey): string {
  const root = dataRoot.replace(/\\/g, '/').replace(/\/$/, '')
  return `${root}/backups/${key}/vanilla`
}
