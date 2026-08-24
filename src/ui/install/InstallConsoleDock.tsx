import { useCallback, useEffect, useRef, useState } from 'react'
import {
  commandLinePartClass,
  consoleLineTone,
  consoleLineToneClass,
  splitCommandLineBody,
  splitConsoleTs,
} from '../../lib/install/consoleLineHighlight'
import { readInstallConsoleHeight, writeInstallConsoleHeight } from '../../lib/ui/installConsolePrefs'
import { isDesktopApp } from '../../lib/desktop/fsDialogs'
import { openInstallLogFolder } from '../../lib/desktop/openPath'
import { INSTALL_CONSOLE_MAX_LINES } from '../../lib/install/consoleLimits'
import { IconTip } from '../IconTip'
import { OutlinedTextField } from '../OutlinedTextField'
import { ChevronDoubleDownIcon, ChevronDoubleUpIcon } from './InstallControlIcons'
import { OpenLogFolderIcon, ResponseInputIcon } from './InstallLogIcons'

type ConsoleTab = 'output' | 'commands' | 'results'

interface Props {
  lines: string[]
  commandLines: string[]
  resultLines: string[]
  logDir: string | null
  statusText: string
  collapsed: boolean
  onToggleCollapsed: () => void
  waitingForInput: boolean
  inputPrompt: string | null
  onSendInput: (text: string) => void
  onResizeActiveChange?: (active: boolean) => void
}

export function InstallConsoleDock({
  lines,
  commandLines,
  resultLines,
  logDir,
  statusText,
  collapsed,
  onToggleCollapsed,
  waitingForInput,
  inputPrompt,
  onSendInput,
  onResizeActiveChange,
}: Props) {
  const [height, setHeight] = useState(() => readInstallConsoleHeight())
  const [input, setInput] = useState('')
  const [tab, setTab] = useState<ConsoleTab>('output')
  const [responseOpen, setResponseOpen] = useState(false)
  const [responseCollapsed, setResponseCollapsed] = useState(false)
  const preRef = useRef<HTMLPreElement>(null)
  const dragRef = useRef<{ startY: number; startH: number } | null>(null)
  const prevWaitingRef = useRef(false)

  const activeLines =
    tab === 'output' ? lines : tab === 'commands' ? commandLines : resultLines
  const colorize = tab === 'output' || tab === 'results'
  const highlightCommands = tab === 'commands'

  useEffect(() => {
    const el = preRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [activeLines, tab])

  useEffect(() => {
    if (waitingForInput && !prevWaitingRef.current) {
      setResponseOpen(true)
      setResponseCollapsed(false)
      setTab('output')
    }
    prevWaitingRef.current = waitingForInput
  }, [waitingForInput])

  const onResizeStart = useCallback(
    (clientY: number) => {
      dragRef.current = { startY: clientY, startH: height }
      onResizeActiveChange?.(true)
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
        onResizeActiveChange?.(false)
        setHeight((h) => {
          writeInstallConsoleHeight(h)
          return h
        })
      }
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    },
    [height, onResizeActiveChange],
  )

  const collapseLabel = collapsed ? 'Show output' : 'Hide output'
  const showResponse = responseOpen && tab === 'output' && !collapsed
  const responseTip = showResponse && !responseCollapsed ? 'Hide response' : 'Show response'
  const canOpenLogFolder = isDesktopApp() && !!logDir?.trim()
  const consoleTruncated =
    tab === 'output' && lines.length >= INSTALL_CONSOLE_MAX_LINES
  const displayStatus = consoleTruncated
    ? `${statusText} (last ${INSTALL_CONSOLE_MAX_LINES} lines)`
    : statusText

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
        <button
          type="button"
          className="btn secondary install-control-btn install-console-collapse-btn has-icon-tip"
          onClick={onToggleCollapsed}
          aria-expanded={!collapsed}
          aria-label={collapseLabel}
        >
          {collapsed ? <ChevronDoubleUpIcon /> : <ChevronDoubleDownIcon />}
          <IconTip>{collapseLabel}</IconTip>
        </button>
        {!collapsed ? (
          <div className="install-console-tabs" role="tablist" aria-label="Install console">
            <button
              type="button"
              role="tab"
              id="install-console-tab-output"
              aria-selected={tab === 'output'}
              aria-controls="install-console-panel"
              className={`install-console-tab${tab === 'output' ? ' active' : ''}`}
              onClick={() => setTab('output')}
            >
              WeiDU
            </button>
            <button
              type="button"
              role="tab"
              id="install-console-tab-commands"
              aria-selected={tab === 'commands'}
              aria-controls="install-console-panel"
              className={`install-console-tab${tab === 'commands' ? ' active' : ''}`}
              onClick={() => setTab('commands')}
            >
              Commands
            </button>
            <button
              type="button"
              role="tab"
              id="install-console-tab-results"
              aria-selected={tab === 'results'}
              aria-controls="install-console-panel"
              className={`install-console-tab${tab === 'results' ? ' active' : ''}`}
              onClick={() => setTab('results')}
            >
              Results
            </button>
          </div>
        ) : null}
        {canOpenLogFolder ? (
          <button
            type="button"
            className="btn secondary install-control-btn install-console-open-log-btn has-icon-tip"
            onClick={() => void openInstallLogFolder(logDir!)}
            aria-label="Open log folder"
          >
            <OpenLogFolderIcon />
            <IconTip>Open log folder</IconTip>
          </button>
        ) : null}
        <button
          type="button"
          className={`btn secondary install-control-btn install-console-response-btn has-icon-tip${
            waitingForInput || responseOpen ? ' active' : ''
          }`}
          aria-pressed={responseOpen}
          aria-label={responseTip}
          onClick={() => {
            if (collapsed) onToggleCollapsed()
            if (tab !== 'output' || collapsed || !responseOpen) {
              setTab('output')
              setResponseOpen(true)
              setResponseCollapsed(false)
              return
            }
            setResponseOpen(false)
          }}
        >
          <ResponseInputIcon />
          <IconTip>{responseTip}</IconTip>
        </button>
        <span className="install-console-status" role="status" aria-live="polite">
          {displayStatus}
        </span>
      </div>
      {!collapsed ? (
        <>
          <pre
            ref={preRef}
            id="install-console-panel"
            role="tabpanel"
            aria-labelledby={
              tab === 'output'
                ? 'install-console-tab-output'
                : tab === 'commands'
                  ? 'install-console-tab-commands'
                  : 'install-console-tab-results'
            }
            className="install-console-output"
            aria-live="polite"
          >
            {activeLines.length > 0 ? (
              activeLines.map((line, i) => {
                const tone = colorize ? consoleLineTone(line) : null
                const { ts, body } = splitConsoleTs(line)
                const commandParts = highlightCommands ? splitCommandLineBody(body) : null
                return (
                  <div
                    key={`${i}:${line.slice(0, 48)}`}
                    className={`install-console-line${consoleLineToneClass(tone)}`}
                  >
                    {ts ? <span className="install-console-ts">{ts} </span> : null}
                    {commandParts
                      ? commandParts.map((part, j) => {
                          const cls = commandLinePartClass(part.kind)
                          return cls ? (
                            <span key={j} className={cls}>
                              {part.text}
                            </span>
                          ) : (
                            <span key={j}>{part.text}</span>
                          )
                        })
                      : body}
                  </div>
                )
              })
            ) : tab === 'commands' ? (
              <div className="install-console-line install-console-empty">
                (No commands logged yet)
              </div>
            ) : tab === 'results' ? (
              <div className="install-console-line install-console-empty">
                (No errors, warnings, or successes logged yet)
              </div>
            ) : null}
          </pre>
          {showResponse ? (
            <div className="install-console-input">
              <div className="install-console-input-chrome">
                <button
                  type="button"
                  className="btn secondary install-control-btn install-console-response-fold has-icon-tip"
                  onClick={() => setResponseCollapsed((v) => !v)}
                  aria-expanded={!responseCollapsed}
                  aria-label={
                    responseCollapsed ? 'Show response input' : 'Hide response input'
                  }
                >
                  {responseCollapsed ? <ChevronDoubleUpIcon /> : <ChevronDoubleDownIcon />}
                  <IconTip>
                    {responseCollapsed ? 'Show response' : 'Hide response'}
                  </IconTip>
                </button>
                {responseCollapsed && waitingForInput ? (
                  <span className="install-console-response-needed">Response needed</span>
                ) : null}
              </div>
              {!responseCollapsed ? (
                <form
                  className="install-console-input-form"
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (!input.trim()) return
                    onSendInput(input)
                    setInput('')
                  }}
                >
                  {inputPrompt ? (
                    <div className="install-console-prompt">{inputPrompt}</div>
                  ) : null}
                  <div className="install-console-input-row">
                    <OutlinedTextField
                      label="Response"
                      value={input}
                      onChange={setInput}
                      autoFocus
                      className="install-console-response-field"
                      spellCheck={false}
                      autoComplete="off"
                    />
                    <button type="submit" className="btn primary">
                      Send
                    </button>
                  </div>
                </form>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
