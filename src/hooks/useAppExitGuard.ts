import { useCallback, useEffect, useRef, useState } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { isDesktopApp } from '../lib/desktop/fsDialogs'

interface Options {
  blocking: boolean
  onFlushSession: () => void
}

export function useAppExitGuard({ blocking, onFlushSession }: Options) {
  const blockingRef = useRef(blocking)
  blockingRef.current = blocking

  const onFlushSessionRef = useRef(onFlushSession)
  onFlushSessionRef.current = onFlushSession

  const [exitConfirmOpen, setExitConfirmOpen] = useState(false)

  useEffect(() => {
    if (!isDesktopApp()) return
    let unlisten: (() => void) | undefined
    void getCurrentWindow()
      .onCloseRequested((event) => {
        if (!blockingRef.current) return
        event.preventDefault()
        setExitConfirmOpen(true)
      })
      .then((fn) => {
        unlisten = fn
      })
    return () => {
      unlisten?.()
    }
  }, [])

  useEffect(() => {
    if (!blocking) return
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [blocking])

  const confirmExit = useCallback(async () => {
    setExitConfirmOpen(false)
    onFlushSessionRef.current()
    if (isDesktopApp()) {
      await getCurrentWindow().destroy()
    }
  }, [])

  const cancelExit = useCallback(() => {
    setExitConfirmOpen(false)
  }, [])

  return { exitConfirmOpen, confirmExit, cancelExit }
}
