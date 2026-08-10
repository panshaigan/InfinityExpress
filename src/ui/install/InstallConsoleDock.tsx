import { useCallback, useEffect, useRef, useState } from 'react'
import { readInstallConsoleHeight, writeInstallConsoleHeight } from '../../lib/ui/installConsolePrefs'

interface Props {
  lines: string[]
  statusText: string
  collapsed: boolean
  onToggleCollapsed: () => void
  waitingForInput: boolean
  inputPrompt: string | null
  onSendInput: (text: string) => void
}

export function InstallConsoleDock({
  lines,
  statusText,
  collapsed,
  onToggleCollapsed,
  waitingForInput,
  inputPrompt,
  onSendInput,
}: Props) {
  const [height, setHeight] = useState(() => readInstallConsoleHeight())
  const [input, setInput] = useState('')
  const preRef = useRef<HTMLPreElement>(null)
  const dragRef = useRef<{ startY: number; startH: number } | null>(null)

  useEffect(() => {
    const el = preRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lines])

  const onResizeStart = useCallback(
    (clientY: number) => {
      dragRef.current = { startY: clientY, startH: height }
      function onMove(ev: MouseEvent) {
        const d = dragRef.current
        if (!d) return
        const next = Math.min(480, Math.max(120, d.startH + (d.startY - ev.clientY)))
        setHeight(next)
      }
      function onUp() {
        dragRef.current = null
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
        setHeight((h) => {
          writeInstallConsoleHeight(h)
          return h
        })
      }
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    },
    [height],
  )

  return (
    <div
      className={`install-console-dock${collapsed ? ' collapsed' : ''}`}
      style={collapsed ? undefined : { height }}
    >
      {!collapsed ? (
        <div
          className="install-console-resize"
          role="separator"
          aria-orientation="horizontal"
          onMouseDown={(e) => onResizeStart(e.clientY)}
        />
      ) : null}
      <div className="install-console-header">
        <button type="button" className="btn secondary" onClick={onToggleCollapsed}>
          {collapsed ? 'Show output' : 'Hide output'}
        </button>
        <span className="install-console-status" role="status" aria-live="polite">
          {statusText}
        </span>
      </div>
      {!collapsed ? (
        <>
          <pre ref={preRef} className="install-console-output" aria-live="polite">
            {lines.join('\n')}
          </pre>
          {waitingForInput ? (
            <form
              className="install-console-input"
              onSubmit={(e) => {
                e.preventDefault()
                if (!input.trim()) return
                onSendInput(input)
                setInput('')
              }}
            >
              {inputPrompt ? (
                <div className="install-console-prompt">{inputPrompt}</div>
              ) : (
                <div className="install-console-prompt">
                  WeiDU may be waiting — type a response (e.g. 0 for English) and Send
                </div>
              )}
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Response"
                autoFocus
              />
              <button type="submit" className="btn primary">
                Send
              </button>
            </form>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
