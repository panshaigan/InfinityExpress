import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { useModAcquireJob } from '../../hooks/useModAcquireJob'
import {
  acquireButtonKind,
  acquireButtonLabel,
  modsNeedingAcquire,
} from '../../lib/mods/acquireTargets'
import type { WorkingMod } from '../../lib/mods/loadMods'
import {
  collectModsFacetOptions,
  createDefaultModsTableFilters,
  filterAndSortWorkingMods,
  type ModsSortDir,
  type ModsSortKey,
  type ModsTableFilters,
} from '../../lib/mods/modsTable'
import { modsByCodename as shippedMods } from '../../lib/mods/catalog'
import type { UserModInput } from '../../lib/mods/userCatalog'
import { isDesktopApp } from '../../lib/desktop/fsDialogs'
import { readAppDirPaths } from '../../lib/ui/appDirPrefs'
import { PATHS_CHANGED_EVENT } from '../../lib/ui/pathPrefsEvents'
import { ConfirmDialog } from '../ConfirmDialog'
import { useToast } from '../toasts/toastContext'
import { AcquireJobDialog } from './AcquireJobDialog'
import { AcquireSizeConfirmDialog } from './AcquireSizeConfirmDialog'
import { ModDetail } from './ModDetail'
import { ModEditorDialog } from './ModEditorDialog'
import { ModsTable } from './ModsTable'
import { ModsToolbar } from './ModsToolbar'

export type ModsJourneyState = {
  locked: boolean
  requiredCodenames: string[]
}

interface Props {
  mods: WorkingMod[]
  neededCodenames: string[]
  journey: ModsJourneyState | null
  routeComplete: boolean
  detailCollapsed: boolean
  detailWidth: number
  onDetailWidthChange: (width: number) => void
  onToggleDetailCollapsed: () => void
  onAddMod: (input: UserModInput) => void
  onEditMod: (codename: string, input: UserModInput) => void
  onDeleteMod: (codename: string) => void
  onSetDiskStatus: (codename: string, status: WorkingMod['diskStatus']) => void
  onApplyAcquireSuccess: (
    codename: string,
    overlays: { version: string; release: string; sizeBytes: number | null },
    meta?: { author?: string | null },
  ) => void
  onRefreshDiskStatus: () => Promise<void>
  onRemoveFromDisk: (
    codenames: string[],
  ) => Promise<{ removed: string[]; errors: string[] }>
  onOpenSettings: () => void
  onProceedToInstall?: () => void
  onBusyChange?: (busy: boolean) => void
}

export function ModsStation({
  mods,
  neededCodenames,
  journey,
  routeComplete,
  detailCollapsed,
  detailWidth,
  onDetailWidthChange,
  onToggleDetailCollapsed,
  onAddMod,
  onEditMod,
  onDeleteMod,
  onSetDiskStatus,
  onApplyAcquireSuccess,
  onRefreshDiskStatus,
  onRemoveFromDisk,
  onOpenSettings,
  onProceedToInstall,
  onBusyChange,
}: Props) {
  const { pushToast } = useToast()
  const journeyLocked = routeComplete && !!journey
  const [filters, setFilters] = useState<ModsTableFilters>(() =>
    createDefaultModsTableFilters(),
  )
  const [sortKey, setSortKey] = useState<ModsSortKey>('name')
  const [sortDir, setSortDir] = useState<ModsSortDir>('asc')
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [focusedCodename, setFocusedCodename] = useState<string | null>(null)
  const deferredFocusedCodename = useDeferredValue(focusedCodename)
  const selectionAnchorRef = useRef<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [editor, setEditor] = useState<
    | { mode: 'create'; initial: null }
    | { mode: 'edit'; initial: WorkingMod }
    | null
  >(null)
  const [pendingDelete, setPendingDelete] = useState<string[] | null>(null)
  const [pendingRemove, setPendingRemove] = useState<string[] | null>(null)
  const [removing, setRemoving] = useState(false)
  const promptedMissingDirRef = useRef(false)

  const clearSelection = useCallback((codename: string) => {
    setSelected((prev) => {
      if (!prev.has(codename)) return prev
      const next = new Set(prev)
      next.delete(codename)
      return next
    })
  }, [])

  const acquire = useModAcquireJob({
    mods,
    patchDiskStatus: onSetDiskStatus,
    applyAcquireSuccess: onApplyAcquireSuccess,
    refreshDiskStatus: onRefreshDiskStatus,
    clearSelection,
    onMissingDownloadDir: onOpenSettings,
    onJobFinished: pushToast,
  })

  useEffect(() => {
    onBusyChange?.(acquire.job.running)
    return () => onBusyChange?.(false)
  }, [acquire.job.running, onBusyChange])

  useEffect(() => {
    function maybePromptDownloadDir() {
      if (!isDesktopApp()) return
      const dir = readAppDirPaths().modsDownloadDir.trim()
      if (dir) {
        promptedMissingDirRef.current = false
        return
      }
      if (promptedMissingDirRef.current) return
      promptedMissingDirRef.current = true
      onOpenSettings()
    }
    maybePromptDownloadDir()
    window.addEventListener(PATHS_CHANGED_EVENT, maybePromptDownloadDir)
    return () =>
      window.removeEventListener(PATHS_CHANGED_EVENT, maybePromptDownloadDir)
  }, [onOpenSettings])

  useEffect(() => {
    if (!journey) {
      setFilters((prev) =>
        prev.requiredCodenames == null
          ? prev
          : { ...prev, requiredCodenames: null },
      )
      return
    }
    if (!journey.locked && !routeComplete) return
    setFilters((prev) => ({
      ...prev,
      search: '',
      categories: [],
      games: [],
      authors: [],
      statuses: [],
      requiredCodenames: journey.requiredCodenames,
    }))
    setSelected(new Set(journey.requiredCodenames))
    setFocusedCodename(journey.requiredCodenames[0] ?? null)
    selectionAnchorRef.current = journey.requiredCodenames[0] ?? null
  }, [journey, routeComplete])

  useEffect(() => {
    if (journeyLocked) return
    setFilters((prev) => {
      if (prev.requiredCodenames == null) return prev
      const cur = prev.requiredCodenames
      if (
        cur.length === neededCodenames.length &&
        cur.every((c, i) => c === neededCodenames[i])
      ) {
        return prev
      }
      return { ...prev, requiredCodenames: neededCodenames }
    })
  }, [neededCodenames, journeyLocked])

  const facets = useMemo(() => collectModsFacetOptions(mods), [mods])

  const rows = useMemo(
    () => filterAndSortWorkingMods(mods, filters, sortKey, sortDir),
    [mods, filters, sortKey, sortDir],
  )

  const focusedMod = useMemo(() => {
    if (!deferredFocusedCodename) return null
    return mods.find((m) => m.codename === deferredFocusedCodename) ?? null
  }, [deferredFocusedCodename, mods])

  const existingCodenames = useMemo(
    () => new Set(mods.map((m) => m.codename)),
    [mods],
  )

  const selectedList = useMemo(() => [...selected], [selected])

  const allRequiredDownloaded = useMemo(() => {
    if (!journey) return false
    const required = journey.requiredCodenames
    if (required.length === 0) return false
    return required.every((code) => {
      const mod = mods.find((m) => m.codename === code)
      return mod && mod.diskStatus !== 'not_present'
    })
  }, [journey, mods])

  const removeFromDiskDisabled = useMemo(() => {
    if (selectedList.length === 0) return true
    return selectedList.every((code) => {
      const mod = mods.find((m) => m.codename === code)
      return !mod || mod.diskStatus === 'not_present'
    })
  }, [mods, selectedList])

  const checkableSelectedList = useMemo(
    () =>
      selectedList.filter((code) => {
        const mod = mods.find((m) => m.codename === code)
        return mod != null && mod.diskStatus !== 'not_present'
      }),
    [mods, selectedList],
  )

  const checkUpdatesDisabled = checkableSelectedList.length === 0

  const selectedAcquireKind = useMemo(() => {
    const targets = modsNeedingAcquire(mods, selectedList)
    return acquireButtonKind(targets.map((m) => m.diskStatus))
  }, [mods, selectedList])

  const focusedAcquireKind = useMemo(() => {
    if (!focusedMod) return 'none' as const
    return acquireButtonKind(
      modsNeedingAcquire(mods, [focusedMod.codename]).map((m) => m.diskStatus),
    )
  }, [focusedMod, mods])

  const rowProgress = useMemo(() => {
    const map = new Map<string, { pct: number | null; label: string }>()
    if (!acquire.job.running && !acquire.job.open && !acquire.job.minimized) {
      return map
    }
    for (const entry of acquire.job.entries) {
      if (entry.status === 'pending') {
        map.set(entry.codename, { pct: 0, label: 'Queued' })
      } else if (entry.status === 'running') {
        const p = acquire.job.progress
        if (p && p.codename === entry.codename && p.bytesTotal && p.bytesReceived != null) {
          const pct = Math.min(
            99,
            Math.round((p.bytesReceived / p.bytesTotal) * 100),
          )
          map.set(entry.codename, { pct, label: p.phase || 'Working…' })
        } else {
          map.set(entry.codename, { pct: null, label: entry.message || 'Working…' })
        }
      }
    }
    return map
  }, [acquire.job])

  const onSort = useCallback((key: ModsSortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    setSortDir('asc')
  }, [sortKey])

  const onToggle = useCallback(
    (codename: string, want: boolean) => {
      selectionAnchorRef.current = codename
      setSelected((prev) => {
        const next = new Set(prev)
        if (want) next.add(codename)
        else next.delete(codename)
        return next
      })
    },
    [],
  )

  const onToggleAllVisible = useCallback(
    (want: boolean) => {
      setSelected((prev) => {
        const next = new Set(prev)
        for (const row of rows) {
          if (want) next.add(row.codename)
          else next.delete(row.codename)
        }
        return next
      })
      selectionAnchorRef.current = rows[0]?.codename ?? null
    },
    [rows],
  )

  const onRowModifierClick = useCallback(
    (codename: string, e: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => {
      setFocusedCodename(codename)
      if (e.shiftKey) {
        const endIdx = rows.findIndex((r) => r.codename === codename)
        const anchor = selectionAnchorRef.current
        const startIdx = anchor
          ? rows.findIndex((r) => r.codename === anchor)
          : -1
        if (endIdx < 0) return
        if (startIdx < 0) {
          selectionAnchorRef.current = codename
          setSelected((prev) => {
            const next = new Set(prev)
            if (next.has(codename)) next.delete(codename)
            else next.add(codename)
            return next
          })
          return
        }
        const lo = Math.min(startIdx, endIdx)
        const hi = Math.max(startIdx, endIdx)
        setSelected((prev) => {
          const next = new Set(prev)
          for (let i = lo; i <= hi; i++) {
            const row = rows[i]
            if (row) next.add(row.codename)
          }
          return next
        })
        return
      }
      if (e.ctrlKey || e.metaKey) {
        selectionAnchorRef.current = codename
        setSelected((prev) => {
          const next = new Set(prev)
          if (next.has(codename)) next.delete(codename)
          else next.add(codename)
          return next
        })
      }
    },
    [rows],
  )

  const flashNotice = useCallback((message: string) => {
    setNotice(message)
    window.setTimeout(() => setNotice(null), 3200)
  }, [])

  const requestRemoveFromDisk = useCallback((codenames: string[]) => {
    if (codenames.length === 0) return
    setPendingRemove(codenames)
  }, [])

  const requestDeleteFromCatalog = useCallback((codenames: string[]) => {
    if (journeyLocked) return
    const deletable = codenames.filter((c) => !shippedMods.has(c))
    if (deletable.length === 0) {
      flashNotice('Built-in mods cannot be removed from the catalog.')
      return
    }
    setPendingDelete(deletable)
  }, [flashNotice, journeyLocked])

  const confirmRemoveFromDisk = useCallback(async () => {
    if (!pendingRemove || removing) return
    const targets = pendingRemove
    setPendingRemove(null)
    setRemoving(true)
    try {
      const result = await onRemoveFromDisk(targets)
      if (result.errors.length > 0 && result.removed.length === 0) {
        flashNotice(result.errors[0] ?? 'Failed to remove from disk.')
      } else if (result.errors.length > 0) {
        flashNotice(
          `Removed ${result.removed.length}; ${result.errors.length} failed.`,
        )
      } else if (result.removed.length === 0) {
        flashNotice('Nothing to remove from disk.')
      } else if (result.removed.length === 1) {
        flashNotice(`Removed ${result.removed[0]} from disk.`)
      } else {
        flashNotice(`Removed ${result.removed.length} mods from disk.`)
      }
    } finally {
      setRemoving(false)
    }
  }, [flashNotice, onRemoveFromDisk, pendingRemove, removing])

  const removeConfirmMessage = useMemo(() => {
    if (!pendingRemove || pendingRemove.length === 0) return ''
    if (pendingRemove.length === 1) {
      return `Permanently delete the \"${pendingRemove[0]}\" folder from the mods download directory? The catalog entry is kept.`
    }
    return `Permanently delete ${pendingRemove.length} mod folders from the mods download directory? Catalog entries are kept.`
  }, [pendingRemove])

  const deleteConfirmMessage = useMemo(() => {
    if (!pendingDelete || pendingDelete.length === 0) return ''
    if (pendingDelete.length === 1) {
      return 'This removes the mod from your working catalog and deletes any downloaded files from disk.'
    }
    return `This removes ${pendingDelete.length} mods from your working catalog and deletes any downloaded files from disk.`
  }, [pendingDelete])

  const deleteConfirmTitle = useMemo(() => {
    if (!pendingDelete || pendingDelete.length <= 1) {
      return 'Delete mod from catalog?'
    }
    return `Delete ${pendingDelete.length} mods from catalog?`
  }, [pendingDelete])

  function handleFiltersChange(next: ModsTableFilters) {
    if (journeyLocked) {
      // Keep required-mods filter locked during journey
      next = { ...next, requiredCodenames: filters.requiredCodenames }
    }
    setFilters(next)
  }

  const jobMinimized = acquire.job.minimized
  const jobRunning = acquire.job.running
  const jobSummary = acquire.job.summary
  const jobBarActive = jobMinimized || !!notice

  return (
    <div className="mods-workspace-shell">
      <div
        className={`workspace mods-workspace${
          detailCollapsed || !focusedMod ? ' detail-collapsed' : ''
        }`}
        style={{ '--detail-width': `${detailWidth}px` } as CSSProperties}
      >
        <div className="list-pane mods-list-pane">
          <div className="list-pane-header mods-list-header">
            <ModsToolbar
              filters={filters}
              onChange={handleFiltersChange}
              facets={facets}
              neededCodenames={neededCodenames}
              journeyLocked={journeyLocked}
              selectedCount={selected.size}
              visibleCount={rows.length}
              totalCount={mods.length}
              acquireLabel={acquireButtonLabel(selectedAcquireKind)}
              acquireDisabled={selectedAcquireKind === 'none'}
              jobRunning={jobRunning}
              onAcquire={() => acquire.requestAcquire(selectedList)}
              onCheckUpdates={() => {
                void acquire.runCheck(checkableSelectedList)
              }}
              checkUpdatesDisabled={checkUpdatesDisabled}
              removeFromDiskDisabled={removeFromDiskDisabled}
              onRemoveFromDisk={() => requestRemoveFromDisk(selectedList)}
              onDeleteFromCatalog={() => requestDeleteFromCatalog(selectedList)}
              onAddMod={() => setEditor({ mode: 'create', initial: null })}
              allRequiredDownloaded={allRequiredDownloaded}
              onProceedToInstall={onProceedToInstall}
            />
          </div>
          <div className="list-pane-scroll mods-table-scroll">
            <ModsTable
              rows={rows}
              selected={selected}
              focusedCodename={focusedCodename}
              selectionLocked={false}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={onSort}
              onToggle={onToggle}
              onToggleAllVisible={onToggleAllVisible}
              onFocusRow={setFocusedCodename}
              onRowModifierClick={onRowModifierClick}
              rowProgress={rowProgress}
              rowActions={{
                acquireLabel: (mod) =>
                  acquireButtonLabel(acquireButtonKind([mod.diskStatus])),
                acquireDisabled: (mod) =>
                  acquireButtonKind([mod.diskStatus]) === 'none',
                jobRunning,
                onAcquire: (codename) => acquire.requestAcquire([codename]),
                onCheckUpdates: (codename) => {
                  const mod = mods.find((m) => m.codename === codename)
                  if (!mod || mod.diskStatus === 'not_present') return
                  void acquire.runCheck([codename])
                },
                editDisabled: journeyLocked,
                catalogDeleteDisabled: journeyLocked,
                isModProtected: (codename) => shippedMods.has(codename),
                onEdit: (codename) => {
                  if (journeyLocked) return
                  const mod = mods.find((m) => m.codename === codename)
                  if (mod) setEditor({ mode: 'edit', initial: mod })
                },
                onRemoveFromDisk: (codename) =>
                  requestRemoveFromDisk([codename]),
                onDeleteFromCatalog: (codename) =>
                  requestDeleteFromCatalog([codename]),
              }}
            />
          </div>
        </div>

        <ModDetail
          mod={focusedMod}
          collapsed={detailCollapsed || !focusedMod}
          width={detailWidth}
          onWidthChange={onDetailWidthChange}
          onToggleCollapsed={onToggleDetailCollapsed}
          onEdit={() => {
            if (journeyLocked) return
            if (focusedMod) {
              setEditor({ mode: 'edit', initial: focusedMod })
            }
          }}
          onDeleteFromCatalog={() => {
            if (focusedMod) requestDeleteFromCatalog([focusedMod.codename])
          }}
          editDisabled={journeyLocked}
          catalogDeleteDisabled={journeyLocked || (focusedMod ? shippedMods.has(focusedMod.codename) : false)}
          acquireLabel={acquireButtonLabel(focusedAcquireKind)}
          acquireDisabled={focusedAcquireKind === 'none'}
          jobRunning={jobRunning}
          onAcquire={() =>
            focusedMod && acquire.requestAcquire([focusedMod.codename])
          }
          onCheckUpdates={() => {
            if (!focusedMod || focusedMod.diskStatus === 'not_present') return
            void acquire.runCheck([focusedMod.codename])
          }}
          onRemoveFromDisk={() =>
            focusedMod && requestRemoveFromDisk([focusedMod.codename])
          }
        />
      </div>

      <div className="mods-job-bar" role="status" aria-live="polite">
        {jobMinimized ? (
          <button
            type="button"
            className={`mods-job-chip${jobRunning ? ' running' : ''}`}
            onClick={acquire.restoreJob}
          >
            {jobRunning
              ? 'Job running — show progress'
              : jobSummary
                ? `Job finished — ${jobSummary}`
                : 'Show job log'}
          </button>
        ) : null}
        {notice ? (
          <p className="mods-job-bar-notice">{notice}</p>
        ) : !jobBarActive ? (
          <span className="mods-job-bar-idle">No active job</span>
        ) : null}
      </div>

      <ModEditorDialog
        open={editor != null}
        mode={editor?.mode ?? 'create'}
        initial={editor?.mode === 'edit' ? editor.initial : null}
        existingCodenames={existingCodenames}
        facetOptions={{
          categories: facets.categories,
          types: facets.types,
          stabilities: facets.stabilities,
        }}
        onCancel={() => setEditor(null)}
        onSave={(input) => {
          if (editor?.mode === 'edit') {
            onEditMod(editor.initial.codename, input)
            setFocusedCodename(input.codename.trim())
          } else {
            onAddMod(input)
            setFocusedCodename(input.codename.trim())
            setSelected((prev) => new Set(prev).add(input.codename.trim()))
          }
          setEditor(null)
        }}
      />

      <ConfirmDialog
        open={pendingDelete != null}
        title={deleteConfirmTitle}
        message={deleteConfirmMessage}
        confirmLabel="Delete"
        danger
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) {
            const toDelete = pendingDelete
            void onRemoveFromDisk(toDelete).then(() => {
              for (const codename of toDelete) {
                onDeleteMod(codename)
              }
            })
            setSelected((prev) => {
              const next = new Set(prev)
              for (const codename of toDelete) next.delete(codename)
              return next
            })
            if (
              focusedCodename &&
              toDelete.includes(focusedCodename)
            ) {
              setFocusedCodename(null)
            }
          }
          setPendingDelete(null)
        }}
      />

      <ConfirmDialog
        open={pendingRemove != null}
        title="Remove from disk?"
        message={removeConfirmMessage}
        confirmLabel={removing ? 'Removing…' : 'Remove'}
        danger
        onCancel={() => {
          if (!removing) setPendingRemove(null)
        }}
        onConfirm={() => {
          void confirmRemoveFromDisk()
        }}
      />

      <AcquireSizeConfirmDialog
        state={acquire.sizeConfirm}
        onCancel={acquire.cancelSizeConfirm}
        onConfirm={() => {
          void acquire.confirmAcquire()
        }}
      />

      <AcquireJobDialog
        job={acquire.job}
        onMinimize={acquire.minimizeJob}
        onCancel={acquire.cancelJob}
        onClose={acquire.dismissJob}
      />
    </div>
  )
}
