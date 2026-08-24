import { stepDurationMs } from './formatDuration'
import type { ComponentRunStatus, InstallRunState, InstallStep } from './types'
import {
  effectiveModFields,
  type WorkingMod,
} from '../mods/loadMods'
import type { InstallSequenceModel } from '../xml/schema'

export const STATUS_LABEL: Record<ComponentRunStatus, string> = {
  queued: 'Queued',
  copying: 'Copying',
  installing: 'Installing',
  succeeded: 'Done',
  succeededWithWarnings: 'Installed (w)',
  failed: 'Failed',
  skipped: 'Skipped',
  alreadyInstalled: 'Installed',
  needsInput: 'Input needed',
}

export const INSTALL_STATUS_FILTER_OPTIONS: ComponentRunStatus[] = [
  'queued',
  'copying',
  'installing',
  'succeeded',
  'succeededWithWarnings',
  'failed',
  'skipped',
  'alreadyInstalled',
  'needsInput',
]

export type InstallSortKey =
  | 'order'
  | 'mod'
  | 'component'
  | 'category'
  | 'duration'
  | 'status'

export type InstallSortDir = 'asc' | 'desc'

export interface InstallTableFilters {
  search: string
  statuses: ComponentRunStatus[]
  categories: string[]
  modIds: string[]
}

export interface InstallFilterRow {
  stepId: string
  order: number
  modId: string
  modDisplay: string
  componentId: string
  componentLabel: string
  weiduLabel: string
  xmlLabel: string
  category: string
  status: ComponentRunStatus
  durationMs: number | null
}

export function createDefaultInstallTableFilters(): InstallTableFilters {
  return {
    search: '',
    statuses: [],
    categories: [],
    modIds: [],
  }
}

export function buildInstallFilterRows(
  steps: readonly InstallStep[],
  mods: readonly WorkingMod[],
  model: InstallSequenceModel,
  nowMs = Date.now(),
  runState: InstallRunState | null = null,
): InstallFilterRow[] {
  const modsByCodename = new Map<string, WorkingMod>()
  for (const m of mods) modsByCodename.set(m.codename.toLowerCase(), m)

  return steps.map((step, stepIndex) => {
    const component = model.componentsById.get(step.componentId)
    const mod = modsByCodename.get(step.modId.toLowerCase())
    const eff = mod ? effectiveModFields(mod) : null
    return {
      stepId: step.stepId,
      order: stepIndex + 1,
      modId: step.modId,
      modDisplay: eff?.name?.trim() || step.modId,
      componentId: step.componentId,
      componentLabel: step.componentLabel,
      weiduLabel: component?.attrs.name?.trim() ?? '',
      xmlLabel: component?.attrs.label?.trim() ?? '',
      category: eff?.category?.trim() || '',
      status: step.status,
      durationMs: stepDurationMs(step, nowMs, runState),
    }
  })
}

export function collectInstallFacetOptions(rows: readonly InstallFilterRow[]): {
  categories: string[]
  mods: { modId: string; label: string }[]
} {
  const categories = new Set<string>()
  const mods = new Map<string, string>()
  for (const row of rows) {
    if (row.category) categories.add(row.category)
    if (!mods.has(row.modId)) mods.set(row.modId, row.modDisplay)
  }
  const collator = new Intl.Collator(undefined, { sensitivity: 'base' })
  return {
    categories: [...categories].sort(collator.compare),
    mods: [...mods.entries()]
      .map(([modId, label]) => ({ modId, label }))
      .sort((a, b) => collator.compare(a.label, b.label)),
  }
}

function matchesSearch(row: InstallFilterRow, search: string): boolean {
  const q = search.trim().toLowerCase()
  if (!q) return true
  return [row.xmlLabel, row.weiduLabel, row.componentId, row.componentLabel]
    .join('\0')
    .toLowerCase()
    .includes(q)
}

export function filterInstallRows(
  rows: readonly InstallFilterRow[],
  filters: InstallTableFilters,
  hideInstalled = false,
): InstallFilterRow[] {
  const statuses = filters.statuses.length ? new Set(filters.statuses) : null
  const categories = filters.categories.length
    ? new Set(filters.categories)
    : null
  const modIds = filters.modIds.length ? new Set(filters.modIds) : null

  return rows.filter((row) => {
    if (
      hideInstalled &&
      (row.status === 'succeeded' || row.status === 'alreadyInstalled')
    ) {
      return false
    }
    if (!matchesSearch(row, filters.search)) return false
    if (statuses && !statuses.has(row.status)) return false
    if (categories && !categories.has(row.category)) return false
    if (modIds && !modIds.has(row.modId)) return false
    return true
  })
}

function sortValue(
  row: InstallFilterRow,
  key: InstallSortKey,
): string | number {
  switch (key) {
    case 'order':
      return row.order
    case 'mod':
      return row.modDisplay.toLowerCase()
    case 'component':
      return row.componentLabel.toLowerCase()
    case 'category':
      return row.category.toLowerCase()
    case 'duration':
      return row.durationMs ?? -1
    case 'status':
      return STATUS_LABEL[row.status].toLowerCase()
  }
}

export function sortInstallRows(
  rows: readonly InstallFilterRow[],
  key: InstallSortKey,
  dir: InstallSortDir,
): InstallFilterRow[] {
  const mul = dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const va = sortValue(a, key)
    const vb = sortValue(b, key)
    if (typeof va === 'number' && typeof vb === 'number') {
      return (va - vb) * mul
    }
    const cmp = String(va).localeCompare(String(vb))
    if (cmp !== 0) return cmp * mul
    return (a.order - b.order) * mul
  })
}

export function filterAndSortInstallRows(
  rows: readonly InstallFilterRow[],
  filters: InstallTableFilters,
  sortKey: InstallSortKey,
  sortDir: InstallSortDir,
  hideInstalled = false,
): InstallFilterRow[] {
  return sortInstallRows(
    filterInstallRows(rows, filters, hideInstalled),
    sortKey,
    sortDir,
  )
}
