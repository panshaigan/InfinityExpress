import { useEffect, useMemo, useState } from 'react'
import { serializeModsCsv } from '../lib/mods/exportModsCsv'
import type { WorkingMod } from '../lib/mods/loadMods'
import { ExportPreviewDialog } from './ExportPreviewDialog'

interface Props {
  open: boolean
  onClose: () => void
  mods: WorkingMod[]
}

const DEFAULT_FILENAME = 'mods-export.csv'

export function ModsCsvExportDialog({ open, onClose, mods }: Props) {
  const [filename, setFilename] = useState(DEFAULT_FILENAME)

  useEffect(() => {
    if (!open) return
    setFilename(DEFAULT_FILENAME)
  }, [open])

  const text = useMemo(() => serializeModsCsv(mods), [mods])

  const meta =
    mods.length === 0
      ? 'No mods in the catalog.'
      : `${mods.length} mod${mods.length === 1 ? '' : 's'}`

  return (
    <ExportPreviewDialog
      open={open}
      onClose={onClose}
      title="Export mods CSV"
      meta={meta}
      text={text}
      filename={filename}
      onFilenameChange={setFilename}
      fallbackFilename={DEFAULT_FILENAME}
      previewAriaLabel="Mods CSV preview"
      copyAriaLabel="Copy mods CSV"
      saveAriaLabel="Save mods CSV"
    />
  )
}
