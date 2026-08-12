import { useEffect, useMemo, useRef, useState } from 'react'
import { readAppDirPaths, writeAppDirPaths } from '../../lib/ui/appDirPrefs'
import { gameFolderKeysForEngine } from '../../lib/ui/installPathValidation'
import type { GameFolderKey, GameFolderPaths } from '../../lib/ui/gameFolderPrefs'
import { GAME_LABELS, type SelectedGame } from '../../lib/xml/schema'
import {
  createManagedVanillaFromFolder,
  defaultProjectName,
  destinationsForEngine,
  emptyDestinations,
  ensureMainDataFolder,
  missingVanillaKeys,
  prepareDestinationForKey,
  readVanillaRegistry,
  registerExternalVanilla,
} from '../../lib/projects'
import { DirectoryField } from '../DirectoryField'
import { OutlinedSelect, type OutlinedSelectOption } from '../OutlinedSelect'
import { OutlinedTextField } from '../OutlinedTextField'
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

const MAIN_DATA_FOLDER_TIP =
  'Stores vanilla backups, install logs, and project data for Infinity Express.'

const VANILLA_FOLDER_TIP =
  'Point at an untouched fresh installation — no mods applied yet.'

type WizardStep = 'engine' | 'vanilla' | 'destination'
type VanillaErrorKey = GameFolderKey | 'backupDir'
type VanillaMethod = 'create' | 'external'

const VANILLA_METHOD_OPTIONS: OutlinedSelectOption[] = [
  {
    value: 'create',
    label: 'Use this folder to create a clean backup',
  },
  {
    value: 'external',
    label: 'Use this folder as the clean backup',
  },
]

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
  const autofilledNameRef = useRef<string | null>(null)
  const [destinations, setDestinations] = useState<GameFolderPaths>(emptyDestinations)
  const [destErrors, setDestErrors] = useState<Partial<Record<GameFolderKey, string>>>({})
  const [vanillaBusy, setVanillaBusy] = useState(false)
  const [vanillaErrors, setVanillaErrors] = useState<Partial<Record<VanillaErrorKey, string>>>({})
  const [vanillaSource, setVanillaSource] = useState<Partial<Record<GameFolderKey, string>>>({})
  const [vanillaMethod, setVanillaMethod] = useState<
    Partial<Record<GameFolderKey, VanillaMethod>>
  >({})
  const [openMethodKey, setOpenMethodKey] = useState<GameFolderKey | null>(null)
  const [progressMsg, setProgressMsg] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [registryTick, setRegistryTick] = useState(0)
  const [appDirs, setAppDirs] = useState(readAppDirPaths)
  const [skippedVanillaStep, setSkippedVanillaStep] = useState(false)

  const registry = useMemo(() => readVanillaRegistry(), [registryTick])
  const missingVanilla = engine ? missingVanillaKeys(engine, registry) : []
  const destKeys = engine ? gameFolderKeysForEngine(engine) : []
  const footerBusy = submitting || vanillaBusy

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

  function methodFor(key: GameFolderKey): VanillaMethod {
    return vanillaMethod[key] ?? 'create'
  }

  function chooseEngine(next: SelectedGame) {
    setEngine(next)
    const suggested = defaultProjectName(next)
    setName((prev) => {
      if (!prev.trim() || prev === autofilledNameRef.current) {
        autofilledNameRef.current = suggested
        return suggested
      }
      return prev
    })
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

  async function goAfterVanilla() {
    if (!engine) return
    const keys = missingVanillaKeys(engine)
    const nextErrors: Partial<Record<VanillaErrorKey, string>> = {}

    const backupDir = appDirs.backupDir.trim()
    if (!backupDir) {
      nextErrors.backupDir = 'Required'
    }

    for (const key of keys) {
      if (!vanillaSource[key]?.trim()) {
        nextErrors[key] = 'Required'
      }
    }

    if (Object.keys(nextErrors).length > 0) {
      setVanillaErrors((prev) => ({ ...prev, ...nextErrors }))
      return
    }

    setVanillaBusy(true)
    setVanillaErrors({})
    setProgressMsg(null)
    try {
      try {
        const ensured = await ensureMainDataFolder(backupDir)
        const nextDirs = { ...appDirs, backupDir: ensured }
        setAppDirs(nextDirs)
        writeAppDirPaths(nextDirs)
      } catch (err) {
        setVanillaErrors({ backupDir: String(err) })
        return
      }

      for (const key of keys) {
        const source = vanillaSource[key]!.trim()
        try {
          if (methodFor(key) === 'create') {
            await createManagedVanillaFromFolder(key, source)
          } else {
            await registerExternalVanilla(key, source)
          }
        } catch (err) {
          setVanillaErrors({ [key]: String(err) })
          refreshRegistry()
          return
        }
      }

      refreshRegistry()
      setStep('destination')
    } finally {
      setVanillaBusy(false)
      setProgressMsg(null)
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
            onChange={(value) => {
              setName(value)
              if (!value.trim()) autofilledNameRef.current = null
            }}
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
            label="Main data folder"
            tip={MAIN_DATA_FOLDER_TIP}
            tipAriaLabel="About main data folder"
            value={appDirs.backupDir}
            onChange={(value) => {
              const next = { ...appDirs, backupDir: value }
              setAppDirs(next)
              writeAppDirPaths(next)
              clearVanillaError('backupDir')
            }}
            placeholder="Select or type the path…"
            browseTitle="Select main data folder"
            error={vanillaErrors.backupDir ?? null}
            required
          />
          {missingVanilla.map((key) => (
            <div key={key} className="project-wizard-vanilla-block">
              <h3>{GAME_LABELS[key]}</h3>
              <div className="project-wizard-vanilla-fields">
                <DirectoryField
                  id={`project-wizard-vanilla-src-${key}`}
                  label="Vanilla game folder"
                  tip={VANILLA_FOLDER_TIP}
                  tipAriaLabel="About vanilla game folder"
                  value={vanillaSource[key] ?? ''}
                  onChange={(value) => {
                    setVanillaSource((prev) => ({ ...prev, [key]: value }))
                    clearVanillaError(key)
                  }}
                  placeholder="Select or type the path…"
                  browseTitle={`Select unmodded ${GAME_LABELS[key]}`}
                  error={vanillaErrors[key] ?? null}
                  required
                />
                <OutlinedSelect
                  label="Backup method"
                  className="outlined-field-wide"
                  value={methodFor(key)}
                  options={VANILLA_METHOD_OPTIONS}
                  open={openMethodKey === key}
                  onOpenChange={(open) => setOpenMethodKey(open ? key : null)}
                  onChange={(value) =>
                    setVanillaMethod((prev) => ({
                      ...prev,
                      [key]: value as VanillaMethod,
                    }))
                  }
                  disabled={vanillaBusy}
                />
              </div>
            </div>
          ))}
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
          <button
            type="button"
            className="btn secondary lg"
            onClick={onCancel}
            disabled={footerBusy}
          >
            Cancel
          </button>
        ) : (
          <span />
        )}
        <div className="project-wizard-footer-right">
          {step !== 'engine' ? (
            <button
              type="button"
              className="btn secondary lg"
              disabled={footerBusy}
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
              className="btn primary lg"
              disabled={!engine || !name.trim()}
              onClick={goAfterEngine}
            >
              Continue
            </button>
          ) : null}
          {step === 'vanilla' ? (
            <button
              type="button"
              className="btn primary lg"
              disabled={vanillaBusy}
              onClick={() => void goAfterVanilla()}
            >
              {vanillaBusy ? 'Preparing…' : 'Continue'}
            </button>
          ) : null}
          {step === 'destination' ? (
            <button
              type="button"
              className="btn primary lg"
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
