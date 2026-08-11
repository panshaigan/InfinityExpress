import { useEffect, useState } from 'react'
import {
  gameDirForPhase,
  readGameWeiduLog,
} from '../lib/desktop/weiduInstall'
import { isDesktopApp } from '../lib/desktop/fsDialogs'
import {
  readGameFolderPaths,
  type GameFolderPaths,
} from '../lib/ui/gameFolderPrefs'
import type { SelectedGame } from '../lib/xml/schema'
import { ExportPreviewDialog } from './ExportPreviewDialog'

type EetTab = 'eet1' | 'eet'

interface Props {
  open: boolean
  onClose: () => void
  game: SelectedGame
}

const DEFAULT_FILENAME = 'WeiDU.log'
const DEFAULT_BG1_FILENAME = 'WeiDU-bg1.log'
const DEFAULT_BG2_FILENAME = 'WeiDU-bg2.log'

const EET_TABS = [
  { id: 'eet1', label: 'Pre-EET (install on BG1)' },
  { id: 'eet', label: 'EET' },
] as const

function lineCountOf(text: string): number {
  const trimmed = text.trimEnd()
  if (!trimmed) return 0
  return trimmed.split('\n').length
}

export function WeiduLogExportDialog({ open, onClose, game }: Props) {
  const isEet = game === 'eet'
  const [tab, setTab] = useState<EetTab>('eet1')
  const [filenameAll, setFilenameAll] = useState(DEFAULT_FILENAME)
  const [filenameBg1, setFilenameBg1] = useState(DEFAULT_BG1_FILENAME)
  const [filenameBg2, setFilenameBg2] = useState(DEFAULT_BG2_FILENAME)
  const [logAll, setLogAll] = useState('')
  const [logBg1, setLogBg1] = useState('')
  const [logBg2, setLogBg2] = useState('')
  const [foundAll, setFoundAll] = useState(true)
  const [foundBg1, setFoundBg1] = useState(true)
  const [foundBg2, setFoundBg2] = useState(true)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setTab('eet1')
    setFilenameAll(DEFAULT_FILENAME)
    setFilenameBg1(DEFAULT_BG1_FILENAME)
    setFilenameBg2(DEFAULT_BG2_FILENAME)
    setLogAll('')
    setLogBg1('')
    setLogBg2('')
    setFoundAll(true)
    setFoundBg1(true)
    setFoundBg2(true)

    const gameFolders = readGameFolderPaths()
    let cancelled = false
    async function load() {
      if (!isDesktopApp()) return
      setLoading(true)
      try {
        if (isEet) {
          const bg1Dir = gameDirForPhase(game, 'eet1', gameFolders)
          const bg2Dir = gameDirForPhase(game, 'eet', gameFolders)
          const [a, b] = await Promise.all([
            bg1Dir.trim() ? readGameWeiduLog(bg1Dir) : Promise.resolve(''),
            bg2Dir.trim() ? readGameWeiduLog(bg2Dir) : Promise.resolve(''),
          ])
          if (cancelled) return
          setLogBg1(a)
          setLogBg2(b)
          setFoundBg1(a.trim().length > 0)
          setFoundBg2(b.trim().length > 0)
        } else {
          const dir = gameDirForPhase(game, 'single', gameFolders)
          const text = dir.trim() ? await readGameWeiduLog(dir) : ''
          if (cancelled) return
          setLogAll(text)
          setFoundAll(text.trim().length > 0)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [open, game, isEet])

  const text = !isEet ? logAll : tab === 'eet1' ? logBg1 : logBg2
  const found = !isEet ? foundAll : tab === 'eet1' ? foundBg1 : foundBg2
  const filename =
    !isEet ? filenameAll : tab === 'eet1' ? filenameBg1 : filenameBg2

  function setFilename(next: string) {
    if (!isEet) setFilenameAll(next)
    else if (tab === 'eet1') setFilenameBg1(next)
    else setFilenameBg2(next)
  }

  const fallbackName =
    !isEet
      ? DEFAULT_FILENAME
      : tab === 'eet1'
        ? DEFAULT_BG1_FILENAME
        : DEFAULT_BG2_FILENAME

  const lines = lineCountOf(text)
  let meta: string
  if (loading) meta = 'Loading…'
  else if (!found) meta = 'WeiDU.log not found.'
  else meta = `${lines} line${lines === 1 ? '' : 's'}`

  return (
    <ExportPreviewDialog
      open={open}
      onClose={onClose}
      title="Export WeiDU.log"
      meta={meta}
      text={text}
      filename={filename}
      onFilenameChange={setFilename}
      fallbackFilename={fallbackName}
      previewAriaLabel="WeiDU.log preview"
      copyAriaLabel="Copy WeiDU.log"
      saveAriaLabel="Save WeiDU.log"
      tabs={isEet ? [...EET_TABS] : undefined}
      activeTabId={tab}
      onTabChange={(id) => setTab(id as EetTab)}
      tablistAriaLabel="EET install phases"
    />
  )
}

/** True when at least one relevant WeiDU.log has content. */
export async function hasAnyWeiduLog(
  game: SelectedGame,
  gameFolders: GameFolderPaths = readGameFolderPaths(),
): Promise<boolean> {
  if (!isDesktopApp()) return false
  if (game === 'eet') {
    const bg1Dir = gameDirForPhase(game, 'eet1', gameFolders)
    const bg2Dir = gameDirForPhase(game, 'eet', gameFolders)
    const [a, b] = await Promise.all([
      bg1Dir.trim() ? readGameWeiduLog(bg1Dir) : Promise.resolve(''),
      bg2Dir.trim() ? readGameWeiduLog(bg2Dir) : Promise.resolve(''),
    ])
    return a.trim().length > 0 || b.trim().length > 0
  }
  const dir = gameDirForPhase(game, 'single', gameFolders)
  if (!dir.trim()) return false
  const text = await readGameWeiduLog(dir)
  return text.trim().length > 0
}
