import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from 'react'
import type { WorkingMod } from '../../lib/mods/loadMods'
import {
  collectModsFacetOptions,
  createDefaultModsTableFilters,
  filterAndSortWorkingMods,
  type ModsSortDir,
  type ModsSortKey,
  type ModsTableFilters,
} from '../../lib/mods/modsTable'
import type { UserModInput } from '../../lib/mods/userCatalog'
import { ConfirmDialog } from '../ConfirmDialog'
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
  onClearJourneyLock: () => void
  detailCollapsed: boolean
  detailWidth: number
  onDetailWidthChange: (width: number) => void
  onToggleDetailCollapsed: () => void
  onAddMod: (input: UserModInput) => void
  onEditMod: (codename: string, input: UserModInput) => void
  onDeleteMod: (codename: string) => void
  onStubAction: (
    codenames: string[],
    kind: 'download' | 'update' | 'check' | 'remove',
  ) => void
}

export function ModsStation({
  mods,
  neededCodenames,
  journey,
  onClearJourneyLock,
  detailCollapsed,
  detailWidth,
  onDetailWidthChange,
  onToggleDetailCollapsed,
  onAddMod,
  onEditMod,
  onDeleteMod,
  onStubAction,
}: Props) {
  const journeyLocked = !!journey?.locked
  const [filters, setFilters] = useState<ModsTableFilters>(() =>
    createDefaultModsTableFilters(),
  )
  const [sortKey, setSortKey] = useState<ModsSortKey>('name')
  const [sortDir, setSortDir] = useState<ModsSortDir>('asc')
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [focusedCodename, setFocusedCodename] = useState<string | null>(null)
  const [stubNotice, setStubNotice] = useState<string | null>(null)
  const [editor, setEditor] = useState<
    | { mode: 'create'; initial: null }
    | { mode: 'edit'; initial: WorkingMod }
    | null
  >(null)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)

  // Sync journey lock → filters + selection
  useEffect(() => {
    if (!journey?.locked) return
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
  }, [journey])

  // Keep "Only needed" filter list in sync with current component selection.
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
    if (!focusedCodename) return null
    return mods.find((m) => m.codename === focusedCodename) ?? null
  }, [focusedCodename, mods])

  const existingCodenames = useMemo(
    () => new Set(mods.map((m) => m.codename)),
    [mods],
  )

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
      if (journeyLocked) return
      setSelected((prev) => {
        const next = new Set(prev)
        if (want) next.add(codename)
        else next.delete(codename)
        return next
      })
    },
    [journeyLocked],
  )

  const onToggleAllVisible = useCallback(
    (want: boolean) => {
      if (journeyLocked) return
      setSelected((prev) => {
        const next = new Set(prev)
        for (const row of rows) {
          if (want) next.add(row.codename)
          else next.delete(row.codename)
        }
        return next
      })
    },
    [journeyLocked, rows],
  )

  const flashStub = useCallback((message: string) => {
    setStubNotice(message)
    window.setTimeout(() => setStubNotice(null), 3200)
  }, [])

  const runStub = useCallback(
    (codenames: string[], kind: 'download' | 'update' | 'check' | 'remove') => {
      if (codenames.length === 0) return
      onStubAction(codenames, kind)
      const labels = {
        download: 'Download queued (stub — desktop app will fetch files).',
        update: 'Update queued (stub — desktop app will refresh files).',
        check: 'Checked for updates (stub — simulated status).',
        remove: 'Removed from disk (stub — catalog entry kept).',
      } as const
      flashStub(labels[kind])
    },
    [flashStub, onStubAction],
  )

  const selectedList = useMemo(() => [...selected], [selected])

  function handleFiltersChange(next: ModsTableFilters) {
    if (journeyLocked) return
    setFilters(next)
  }

  function handleContinueBrowsing() {
    setFilters((prev) => ({ ...prev, requiredCodenames: null }))
    onClearJourneyLock()
  }

  return (
    <div
      className={`workspace mods-workspace${
        detailCollapsed ? ' detail-collapsed' : ''
      }`}
      style={{ '--detail-width': `${detailWidth}px` } as CSSProperties}
    >
      <div className="list-pane mods-list-pane">
        <div className="list-pane-header mods-list-header">
          <div className="list-pane-header-title">
            <h2>Mods</h2>
          </div>
          <ModsToolbar
            filters={filters}
            onChange={handleFiltersChange}
            facets={facets}
            neededCodenames={neededCodenames}
            journeyLocked={journeyLocked}
            selectedCount={selected.size}
            visibleCount={rows.length}
            totalCount={mods.length}
            onDownload={() => runStub(selectedList, 'download')}
            onCheckUpdates={() => runStub(selectedList, 'check')}
            onUpdate={() => runStub(selectedList, 'update')}
            onRemoveFromDisk={() => runStub(selectedList, 'remove')}
            onAddMod={() => setEditor({ mode: 'create', initial: null })}
            onContinueBrowsing={handleContinueBrowsing}
            stubNotice={stubNotice}
          />
        </div>
        <div className="list-pane-scroll mods-table-scroll">
          <ModsTable
            rows={rows}
            selected={selected}
            focusedCodename={focusedCodename}
            selectionLocked={journeyLocked}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={onSort}
            onToggle={onToggle}
            onToggleAllVisible={onToggleAllVisible}
            onFocusRow={setFocusedCodename}
          />
        </div>
      </div>

      <ModDetail
        mod={focusedMod}
        collapsed={detailCollapsed}
        width={detailWidth}
        onWidthChange={onDetailWidthChange}
        onToggleCollapsed={onToggleDetailCollapsed}
        onEdit={() => {
          if (focusedMod?.origin === 'user') {
            setEditor({ mode: 'edit', initial: focusedMod })
          }
        }}
        onDeleteFromCatalog={() => {
          if (focusedMod?.origin === 'user') {
            setPendingDelete(focusedMod.codename)
          }
        }}
        onDownload={() =>
          focusedMod && runStub([focusedMod.codename], 'download')
        }
        onCheckUpdates={() =>
          focusedMod && runStub([focusedMod.codename], 'check')
        }
        onUpdate={() => focusedMod && runStub([focusedMod.codename], 'update')}
        onRemoveFromDisk={() =>
          focusedMod && runStub([focusedMod.codename], 'remove')
        }
      />

      <ModEditorDialog
        open={editor != null}
        mode={editor?.mode ?? 'create'}
        initial={editor?.mode === 'edit' ? editor.initial : null}
        existingCodenames={existingCodenames}
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
        title="Delete mod from catalog?"
        message="This removes the entry you added. It does not delete files from disk."
        confirmLabel="Delete"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) {
            onDeleteMod(pendingDelete)
            setSelected((prev) => {
              const next = new Set(prev)
              next.delete(pendingDelete)
              return next
            })
            if (focusedCodename === pendingDelete) setFocusedCodename(null)
          }
          setPendingDelete(null)
        }}
      />
    </div>
  )
}
