import { useEffect, useMemo, useState } from 'react'
import { readAppDirPaths, writeAppDirPaths } from '../../lib/ui/appDirPrefs'
import { gameFolderKeysForEngine } from '../../lib/ui/installPathValidation'
import type { GameFolderKey, GameFolderPaths } from '../../lib/ui/gameFolderPrefs'
import { GAME_LABELS, type SelectedGame } from '../../lib/xml/schema'
import {
  createManagedVanillaFromFolder,
  defaultProjectName,
  destinationsForEngine,
  emptyDestinations,
  missingVanillaKeys,
  prepareDestinationForKey,
  readVanillaRegistry,
  registerExternalVanilla,
  vanillaPath,
} from '../../lib/projects'
import { DirectoryField } from '../DirectoryField'
import { OutlinedTextField } from '../OutlinedTextField'
import { IconTip } from '../IconTip'
import { listenBackupProgress } from '../../lib/desktop/weiduInstall'
import { isDesktopApp } from '../../lib/desktop/fsDialogs'

const GAME_BLURBS: Record<SelectedGame, string> = {
  bg1: "Baldur's Gate, with optional Siege of Dragonspear",
  bg2: 'Shadows of Amn and Throne of Bhaal',
  eet: 'The full saga merged into one game',
  iwd: 'Icewind Dale',
  pst: 'Planescape: Torment',
}

const ENGINE_ROWS: SelectedGame[][] = [
  ['bg1', 'bg2'],
  ['eet'],
  ['iwd', 'pst'],
]

type WizardStep = 'engine' | 'vanilla' | 'destination'
type VanillaErrorKey = GameFolderKey | 'backupDir'

interface Props {
  onCancel: () => void
  onCreated: (projectId: string) => void
  /** When false (no projects yet), Cancel is hidden — there is nowhere to return. */
  canCancel?: boolean
}

export function ProjectWizard({ onCancel, onCreated, canCancel = true }: Props) {
  const [step, setStep] = useState<WizardStep>('engine')
  const [engine, setEngine] = useState<SelectedGame | null>(null)
  const [name, setName] = useState('')
  const [destinations, setDestinations] = useState<GameFolderPaths>(emptyDestinations)
  const [destErrors, setDestErrors] = useState<Partial<Record<GameFolderKey, string>>>({})
  const [vanillaBusyKey, setVanillaBusyKey] = useState<GameFolderKey | null>(null)
  const [vanillaErrors, setVanillaErrors] = useState<Partial<Record<VanillaErrorKey, string>>>({})
  const [vanillaSource, setVanillaSource] = useState<Partial<Record<GameFolderKey, string>>>({})
  const [progressMsg, setProgressMsg] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [registryTick, setRegistryTick] = useState(0)
  const [appDirs, setAppDirs] = useState(readAppDirPaths)
  const [skippedVanillaStep, setSkippedVanillaStep] = useState(false)

  const registry = useMemo(() => readVanillaRegistry(), [registryTick])
  const missingVanilla = engine ? missingVanillaKeys(engine, registry) : []
  const destKeys = engine ? gameFolderKeysForEngine(engine) : []

  useEffect(() => {
    if (!isDesktopApp()) return
    let unlisten: (() => void) | undefined
    void listenBackupProgress((p) => {
      setProgressMsg(p.message || null)
    }).then((fn) => {
      unlisten = fn
    })
    return () => unlisten?.()
  }, [])

  function refreshRegistry() {
    setRegistryTick((n) => n + 1)
  }

  function clearVanillaError(key: VanillaErrorKey) {
    setVanillaErrors((prev) => {
      if (!prev[key]) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  function chooseEngine(next: SelectedGame) {
    setEngine(next)
    setName((prev) => (prev.trim() ? prev : defaultProjectName(next)))
  }

  function goAfterEngine() {
    if (!engine) return
    if (missingVanillaKeys(engine).length > 0) {
      setSkippedVanillaStep(false)
      setStep('vanilla')
    } else {
      setSkippedVanillaStep(true)
      setStep('destination')
    }
  }

  function goAfterVanilla() {
    if (!engine) return
    const missing = missingVanillaKeys(engine)
    if (missing.length > 0) {
      const next: Partial<Record<VanillaErrorKey, string>> = {}
      for (const key of missing) {
        next[key] = 'Set vanilla before continuing'
      }
      setVanillaErrors((prev) => ({ ...prev, ...next }))
      return
    }
    setVanillaErrors({})
    setStep('destination')
  }

  async function onCreateManaged(key: GameFolderKey) {
    const source = vanillaSource[key]?.trim()
    if (!source) {
      setVanillaErrors((prev) => ({
        ...prev,
        [key]: 'Pick an unmodded game folder to copy from',
      }))
      return
    }
    if (!appDirs.backupDir.trim()) {
      setVanillaErrors((prev) => ({
        ...prev,
        backupDir: 'Set the main data folder first',
      }))
      return
    }
    setVanillaBusyKey(key)
    clearVanillaError(key)
    clearVanillaError('backupDir')
    try {
      await createManagedVanillaFromFolder(key, source)
      refreshRegistry()
    } catch (err) {
      setVanillaErrors((prev) => ({ ...prev, [key]: String(err) }))
    } finally {
      setVanillaBusyKey(null)
      setProgressMsg(null)
    }
  }

  async function onUseExternal(key: GameFolderKey) {
    const source = vanillaSource[key]?.trim()
    if (!source) {
      setVanillaErrors((prev) => ({
        ...prev,
        [key]: 'Pick an unmodded game folder',
      }))
      return
    }
    setVanillaBusyKey(key)
    clearVanillaError(key)
    try {
      await registerExternalVanilla(key, source)
      refreshRegistry()
    } catch (err) {
      setVanillaErrors((prev) => ({ ...prev, [key]: String(err) }))
    } finally {
      setVanillaBusyKey(null)
    }
  }

  async function finish() {
    if (!engine || !name.trim()) return
    setSubmitting(true)
    setDestErrors({})
    setProgressMsg(null)
    try {
      for (const key of destKeys) {
        const path = destinations[key]?.trim()
        if (!path) {
          setDestErrors((prev) => ({ ...prev, [key]: 'Required' }))
          setSubmitting(false)
          return
        }
        try {
          await prepareDestinationForKey(key, path)
        } catch (err) {
          setDestErrors((prev) => ({ ...prev, [key]: String(err) }))
          setSubmitting(false)
          return
        }
      }

      const { createProjectFromWizard } = await import('./createProject')
      const id = createProjectFromWizard({
        name: name.trim(),
        engine,
        destinations: destinationsForEngine(engine, destinations),
      })
      onCreated(id)
    } finally {
      setSubmitting(false)
      setProgressMsg(null)
    }
  }

  return (
    <div className="project-wizard">
      <header className="project-wizard-header">
        <h1>New project</h1>
      </header>

      {step === 'engine' ? (
        <div className="engine-grid">
          <OutlinedTextField
            id="project-wizard-name"
            label="Project name"
            value={name}
            onChange={setName}
            placeholder="Enter a name…"
          />
          {ENGINE_ROWS.map((row) => (
            <div
              key={row.join('-')}
              className={`engine-row${row.length === 1 ? ' engine-row-span' : ''}`}
            >
              {row.map((g) => (
                <button
                  key={g}
                  type="button"
                  className={engine === g ? 'engine-card active' : 'engine-card'}
                  onClick={() => chooseEngine(g)}
                >
                  <span className="engine-card-title">{GAME_LABELS[g]}</span>
                  <span className="engine-card-blurb">{GAME_BLURBS[g]}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      ) : null}

      {step === 'vanilla' && engine ? (
        <div className="project-wizard-vanilla">
          <DirectoryField
            id="project-wizard-data-root"
            label="Main data folder (backups, logs, project data)"
            value={appDirs.backupDir}
            onChange={(value) => {
              const next = { ...appDirs, backupDir: value }
              setAppDirs(next)
              writeAppDirPaths(next)
              clearVanillaError('backupDir')
            }}
            placeholder="Select data folder…"
            browseTitle="Select main data folder folder"
            error={vanillaErrors.backupDir ?? null}
          />
          {missingVanilla.map((key) => {
            const binding = registry[key]
            return (
              <div key={key} className="project-wizard-vanilla-block">
                <h3>{GAME_LABELS[key]}</h3>
                {binding ? (
                  <p className="hint">
                    Set ({binding.mode}): {vanillaPath(binding)}
                  </p>
                ) : (
                  <>
                    <DirectoryField
                      id={`project-wizard-vanilla-src-${key}`}
                      label="Vanilla game folder"
                      value={vanillaSource[key] ?? ''}
                      onChange={(value) => {
                        setVanillaSource((prev) => ({ ...prev, [key]: value }))
                        clearVanillaError(key)
                      }}
                      placeholder="Path to unmodded game…"
                      browseTitle={`Select unmodded ${GAME_LABELS[key]}`}
                      error={vanillaErrors[key] ?? null}
                    />
                    <div className="project-wizard-vanilla-actions">
                      <button
                        type="button"
                        className="btn primary has-icon-tip"
                        disabled={vanillaBusyKey === key}
                        onClick={() => void onCreateManaged(key)}
                      >
                        Create vanilla backup from folder
                        <IconTip>
                          Copies into the backups directory (recommended).
                        </IconTip>
                      </button>
                      <button
                        type="button"
                        className="btn secondary"
                        disabled={vanillaBusyKey === key}
                        onClick={() => void onUseExternal(key)}
                      >
                        Use folder as vanilla
                      </button>
                    </div>
                  </>
                )}
              </div>
            )
          })}
          {progressMsg ? <p className="hint">{progressMsg}</p> : null}
        </div>
      ) : null}

      {step === 'destination' && engine ? (
        <div className="project-wizard-dest">
          {destKeys.map((key) => (
            <DirectoryField
              key={key}
              id={`project-wizard-dest-${key}`}
              label={`${GAME_LABELS[key]} destination`}
              value={destinations[key]}
              onChange={(value) => {
                setDestinations((prev) => ({ ...prev, [key]: value }))
                setDestErrors((prev) => {
                  if (!prev[key]) return prev
                  const next = { ...prev }
                  delete next[key]
                  return next
                })
              }}
              placeholder="Path for the modded install…"
              browseTitle={`Select ${GAME_LABELS[key]} destination`}
              error={destErrors[key] ?? null}
              required
            />
          ))}
          {progressMsg ? <p className="hint">{progressMsg}</p> : null}
        </div>
      ) : null}

      <footer className="project-wizard-footer">
        {canCancel ? (
          <button type="button" className="btn secondary" onClick={onCancel} disabled={submitting}>
            Cancel
          </button>
        ) : (
          <span />
        )}
        <div className="project-wizard-footer-right">
          {step !== 'engine' ? (
            <button
              type="button"
              className="btn secondary"
              disabled={submitting}
              onClick={() =>
                setStep(
                  step === 'destination'
                    ? skippedVanillaStep
                      ? 'engine'
                      : 'vanilla'
                    : 'engine',
                )
              }
            >
              Back
            </button>
          ) : null}
          {step === 'engine' ? (
            <button
              type="button"
              className="btn primary"
              disabled={!engine || !name.trim()}
              onClick={goAfterEngine}
            >
              Continue
            </button>
          ) : null}
          {step === 'vanilla' ? (
            <button type="button" className="btn primary" onClick={goAfterVanilla}>
              Continue
            </button>
          ) : null}
          {step === 'destination' ? (
            <button
              type="button"
              className="btn primary"
              disabled={submitting}
              onClick={() => void finish()}
            >
              {submitting ? 'Preparing…' : 'Create project'}
            </button>
          ) : null}
        </div>
      </footer>
    </div>
  )
}
