import { useEffect, useMemo, useState } from 'react'
import {
  buildInstallOrderText,
  countInstallOrderMods,
  type ExportPhase,
} from '../lib/export/installOrder'
import type { InstallSequenceModel, SelectedGame } from '../lib/xml/schema'
import { ExportPreviewDialog } from './ExportPreviewDialog'

type EetTab = 'eet1' | 'eet'

interface Props {
  open: boolean
  onClose: () => void
  model: InstallSequenceModel
  selectedIds: ReadonlySet<string>
  game: SelectedGame | null
}

const DEFAULT_FILENAME = 'install-order.txt'
const DEFAULT_PRE_EET_FILENAME = 'install-order-pre-eet.txt'
const DEFAULT_EET_FILENAME = 'install-order-eet.txt'

const EET_TABS = [
  { id: 'eet1', label: 'Pre-EET (install on BG1)' },
  { id: 'eet', label: 'EET' },
] as const

export function ExportDialog({ open, onClose, model, selectedIds, game }: Props) {
  const isEet = game === 'eet'
  const [tab, setTab] = useState<EetTab>('eet1')
  const [filenameAll, setFilenameAll] = useState(DEFAULT_FILENAME)
  const [filenamePreEet, setFilenamePreEet] = useState(DEFAULT_PRE_EET_FILENAME)
  const [filenameEet, setFilenameEet] = useState(DEFAULT_EET_FILENAME)

  useEffect(() => {
    if (!open) return
    setTab('eet1')
    setFilenameAll(DEFAULT_FILENAME)
    setFilenamePreEet(DEFAULT_PRE_EET_FILENAME)
    setFilenameEet(DEFAULT_EET_FILENAME)
  }, [open])

  const phase: ExportPhase = isEet ? tab : 'all'

  const text = useMemo(
    () => buildInstallOrderText(model, selectedIds, phase),
    [model, selectedIds, phase],
  )

  const lineCount = useMemo(
    () => (text ? text.trimEnd().split('\n').length : 0),
    [text],
  )

  const modCount = useMemo(
    () => countInstallOrderMods(model, selectedIds, phase),
    [model, selectedIds, phase],
  )

  const filename =
    !isEet ? filenameAll : tab === 'eet1' ? filenamePreEet : filenameEet

  function setFilename(next: string) {
    if (!isEet) setFilenameAll(next)
    else if (tab === 'eet1') setFilenamePreEet(next)
    else setFilenameEet(next)
  }

  const fallbackName =
    !isEet
      ? DEFAULT_FILENAME
      : tab === 'eet1'
        ? DEFAULT_PRE_EET_FILENAME
        : DEFAULT_EET_FILENAME

  const meta =
    lineCount === 0
      ? 'No components in this list.'
      : `${modCount} mod${modCount === 1 ? '' : 's'} · ${lineCount} component${lineCount === 1 ? '' : 's'}`

  return (
    <ExportPreviewDialog
      open={open}
      onClose={onClose}
      title="Export install order"
      meta={meta}
      text={text}
      filename={filename}
      onFilenameChange={setFilename}
      fallbackFilename={fallbackName}
      previewAriaLabel="Install order preview"
      copyAriaLabel="Copy install order"
      saveAriaLabel="Save install order"
      tabs={isEet ? [...EET_TABS] : undefined}
      activeTabId={tab}
      onTabChange={(id) => setTab(id as EetTab)}
      tablistAriaLabel="EET install phases"
    />
  )
}
