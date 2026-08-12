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
  useExistingManagedVanilla,
  vanillaPath,
} from '../../lib/projects'
import { DirectoryField } from '../DirectoryField'
import { OutlinedTextField } from '../OutlinedTextField'
import { IconTip } from '../IconTip'
import { listenBackupProgress } from '../../lib/desktop/weiduInstall'
import { isDesktopApp } from '../../lib/desktop/fsDialogs'

const GAME_BLURBS: Record<SelectedGame, string> = {
  bg1: "Baldur's Gate with Siege of Dragonspear (SoD)",
  bg2: 'Shadows of Amn (SoA) and Throne of Bhaal (ToB)',
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

interface Props {
  onCancel: () => void
  onCreated: (projectId: string) => void
}

export function ProjectWizard({ onCancel, onCreated }: Props) {
  const [step, setStep] = useState<WizardStep>('engine')
  const [engine, setEngine] = useState<SelectedGame | null>(null)
  const [name, setName] = useState('')
  const [destinations, setDestinations] = useState<GameFolderPaths>(emptyDestinations)
  const [destErrors, setDestErrors] = useState<Partial<Record<GameFolderKey, string>>>({})
  const [vanillaBusyKey, setVanillaBusyKey] = useState<GameFolderKey | null>(null)
  const [vanillaError, setVanillaError] = useState<string | null>(null)
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
    if (missingVanillaKeys(engine).length > 0) {
      setVanillaError('Set vanilla for every required game before continuing')
      return
    }
    setVanillaError(null)
    setStep('destination')
  }

  async function onCreateManaged(key: GameFolderKey) {
    const source = vanillaSource[key]?.trim()
    if (!source) {
      setVanillaError('Pick an unmodded game folder to copy from')
      return
    }
    if (!appDirs.backupDir.trim()) {
      setVanillaError('Set the backup / logs / projects directory first')
      return
    }
    setVanillaBusyKey(key)
    setVanillaError(null)
    try {
      await createManagedVanillaFromFolder(key, source)
      refreshRegistry()
    } catch (err) {
      setVanillaError(String(err))
    } finally {
      setVanillaBusyKey(null)
      setProgressMsg(null)
    }
  }

  async function onUseExternal(key: GameFolderKey) {
    const source = vanillaSource[key]?.trim()
    if (!source) {
      setVanillaError('Pick an unmodded game folder')
      return
    }
    setVanillaBusyKey(key)
    setVanillaError(null)
    try {
      await registerExternalVanilla(key, source)
      refreshRegistry()
    } catch (err) {
      setVanillaError(String(err))
    } finally {
      setVanillaBusyKey(null)
    }
  }

  async function onUseExistingManaged(key: GameFolderKey) {
    setVanillaBusyKey(key)
    setVanillaError(null)
    try {
      const path = await useExistingManagedVanilla(key)
      if (!path) {
        setVanillaError(`No managed vanilla found for ${GAME_LABELS[key]}`)
        return
      }
      refreshRegistry()
    } catch (err) {
      setVanillaError(String(err))
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
        <p className="lede">
          {step === 'engine' && 'Choose the engine for this project. It cannot be changed later.'}
          {step === 'vanilla' &&
            'Vanilla backups are app-wide. Create a managed copy from an unmodded folder (recommended), or point at an existing folder.'}
          {step === 'destination' &&
            'Pick the folder where mods will be installed. Empty folders are filled from vanilla; non-empty folders must already contain the game executable.'}
        </p>
      </header>

      {step === 'engine' ? (
        <div className="engine-grid">
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
          <OutlinedTextField
            id="project-wizard-name"
            label="Project name"
            value={name}
            onChange={setName}
            placeholder="Name this install…"
          />
        </div>
      ) : null}

      {step === 'vanilla' && engine ? (
        <div className="project-wizard-vanilla">
          <DirectoryField
            id="project-wizard-data-root"
            label="Backup / logs / projects directory"
            value={appDirs.backupDir}
            onChange={(value) => {
              const next = { ...appDirs, backupDir: value }
              setAppDirs(next)
              writeAppDirPaths(next)
            }}
            placeholder="Select data folder…"
            browseTitle="Select backup / logs / projects folder"
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
                      label="Unmodded game folder"
                      value={vanillaSource[key] ?? ''}
                      onChange={(value) =>
                        setVanillaSource((prev) => ({ ...prev, [key]: value }))
                      }
                      placeholder="Path to unmodded game…"
                      browseTitle={`Select unmodded ${GAME_LABELS[key]}`}
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
                      <button
                        type="button"
                        className="btn secondary"
                        disabled={vanillaBusyKey === key || !appDirs.backupDir.trim()}
                        onClick={() => void onUseExistingManaged(key)}
                      >
                        Use existing managed vanilla
                      </button>
                    </div>
                  </>
                )}
              </div>
            )
          })}
          {vanillaError ? <p className="field-error">{vanillaError}</p> : null}
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
        <button type="button" className="btn secondary" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
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
