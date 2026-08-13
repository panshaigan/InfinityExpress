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
  hasVanillaForKey,
  missingVanillaKeys,
  prepareDestinationForKey,
  readVanillaRegistry,
  registerExternalVanilla,
  validateDestinationFolder,
  validateMainDataFolder,
  vanillaPath,
} from '../../lib/projects'
import { probeGameFolder } from '../../lib/desktop/gameExe'
import { DirectoryField } from '../DirectoryField'
import { OutlinedSelect, type OutlinedSelectOption } from '../OutlinedSelect'
import { OutlinedTextField } from '../OutlinedTextField'
import {
  listenBackupProgress,
  type BackupProgress,
} from '../../lib/desktop/weiduInstall'
import { isDesktopApp, normalizeFolderPath } from '../../lib/desktop/fsDialogs'

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
  'Stores vanilla backups, install logs, and project data for iNfinity eXpress.'

const VANILLA_FOLDER_TIP =
  'Point at an untouched fresh installation — no mods installed yet.'

const DESTINATION_FOLDER_TIP =
  'Folder where mods will be installed and the game will be modified.'

type WizardStep = 'engine' | 'vanilla' | 'destination'
type VanillaErrorKey = GameFolderKey | 'backupDir'
type VanillaMethod = 'create' | 'external'

const VANILLA_METHOD_OPTIONS: OutlinedSelectOption[] = [
  {
    value: 'create',
    label: 'Copy this folder to create a backup (needs additional disk space)',
  },
  {
    value: 'external',
    label: 'Use this folder as the backup',
  },
]

interface Props {
  onCancel: () => void
  onCreated: (projectId: string) => void
  /** When false (no projects yet), Cancel is hidden — there is nowhere to return. */
  canCancel?: boolean
}

function formatWizardProgress(
  progress: BackupProgress | null,
  busy: boolean,
): { heading: string; detail: string } | null {
  if (!busy || !progress?.message?.trim()) return null
  const message = progress.message.trim()
  const phase = progress.phase
  const isPerFileCopy =
    phase === 'copy' &&
    !message.toLowerCase().startsWith('copying') &&
    !message.toLowerCase().startsWith('measuring') &&
    !message.includes('/') &&
    !message.includes('\\')

  return {
    heading: 'Creating a base backup',
    detail: isPerFileCopy ? `Copying… ${message}` : message,
  }
}

function formatDestinationProgress(
  progress: BackupProgress | null,
  busy: boolean,
): { heading: string; detail: string } | null {
  if (!busy || !progress?.message?.trim()) return null
  const message = progress.message.trim()
  const phase = progress.phase
  const isPerFileCopy =
    phase === 'copy' &&
    !message.toLowerCase().startsWith('copying') &&
    !message.toLowerCase().startsWith('measuring') &&
    !message.includes('/') &&
    !message.includes('\\')

  return {
    heading: 'Preparing destination',
    detail: isPerFileCopy ? `Copying… ${message}` : message,
  }
}

export function ProjectWizard({ onCancel, onCreated, canCancel = true }: Props) {
  const [step, setStep] = useState<WizardStep>('engine')
  const [engine, setEngine] = useState<SelectedGame | null>(null)
  const [name, setName] = useState('')
  const nameUserEditedRef = useRef(false)
  const [destinations, setDestinations] = useState<GameFolderPaths>(emptyDestinations)
  const [destErrors, setDestErrors] = useState<Partial<Record<GameFolderKey, string>>>({})
  const [vanillaBusy, setVanillaBusy] = useState(false)
  const [vanillaErrors, setVanillaErrors] = useState<Partial<Record<VanillaErrorKey, string>>>({})
  const [vanillaSource, setVanillaSource] = useState<Partial<Record<GameFolderKey, string>>>({})
  const [vanillaMethod, setVanillaMethod] = useState<
    Partial<Record<GameFolderKey, VanillaMethod>>
  >({})
  const [vanillaKeysForStep, setVanillaKeysForStep] = useState<GameFolderKey[]>([])
  const [openMethodKey, setOpenMethodKey] = useState<GameFolderKey | null>(null)
  const [progress, setProgress] = useState<BackupProgress | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [appDirs, setAppDirs] = useState(readAppDirPaths)
  const [skippedVanillaStep, setSkippedVanillaStep] = useState(false)

  const destKeys = engine ? gameFolderKeysForEngine(engine) : []
  const footerBusy = submitting || vanillaBusy

  const vanillaContinueBlocked = useMemo(() => {
    if (!appDirs.backupDir.trim() || vanillaErrors.backupDir) return true
    for (const key of vanillaKeysForStep) {
      if (!vanillaSource[key]?.trim() || vanillaErrors[key]) return true
    }
    return false
  }, [appDirs.backupDir, vanillaErrors, vanillaKeysForStep, vanillaSource])

  const destinationContinueBlocked = useMemo(() => {
    for (const key of destKeys) {
      if (!destinations[key]?.trim() || destErrors[key]) return true
    }
    return false
  }, [destKeys, destinations, destErrors])

  const vanillaProgress = formatWizardProgress(progress, vanillaBusy)
  const destinationProgress = formatDestinationProgress(progress, submitting)

  useEffect(() => {
    if (!isDesktopApp()) return
    let unlisten: (() => void) | undefined
    void listenBackupProgress((p) => {
      setProgress(p)
    }).then((fn) => {
      unlisten = fn
    })
    return () => unlisten?.()
  }, [])

  function clearVanillaError(key: VanillaErrorKey) {
    setVanillaErrors((prev) => {
      if (!prev[key]) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  function setVanillaFieldError(key: VanillaErrorKey, message: string | null) {
    setVanillaErrors((prev) => {
      if (!message) {
        if (!prev[key]) return prev
        const next = { ...prev }
        delete next[key]
        return next
      }
      if (prev[key] === message) return prev
      return { ...prev, [key]: message }
    })
  }

  function setDestFieldError(key: GameFolderKey, message: string | null) {
    setDestErrors((prev) => {
      if (!message) {
        if (!prev[key]) return prev
        const next = { ...prev }
        delete next[key]
        return next
      }
      if (prev[key] === message) return prev
      return { ...prev, [key]: message }
    })
  }

  function methodFor(key: GameFolderKey): VanillaMethod {
    return vanillaMethod[key] ?? 'create'
  }

  function chooseEngine(next: SelectedGame) {
    setEngine(next)
    if (!nameUserEditedRef.current) {
      setName(defaultProjectName(next))
    }
  }

  /** Find a clash among labeled paths; returns error for the field being checked. */
  function distinctPathError(
    _selfLabel: string,
    selfPath: string,
    others: { label: string; path: string }[],
  ): string | null {
    const selfNorm = normalizeFolderPath(selfPath)
    if (!selfNorm) return null
    for (const other of others) {
      const otherNorm = normalizeFolderPath(other.path)
      if (!otherNorm) continue
      if (selfNorm === otherNorm) {
        return `Must be a different folder from ${other.label}`
      }
    }
    return null
  }

  function vanillaDistinctOthers(
    exclude: VanillaErrorKey,
  ): { label: string; path: string }[] {
    const others: { label: string; path: string }[] = []
    if (exclude !== 'backupDir') {
      others.push({ label: 'Main data folder', path: appDirs.backupDir })
    }
    for (const key of vanillaKeysForStep) {
      if (key === exclude) continue
      others.push({
        label: `${GAME_LABELS[key]} vanilla game folder`,
        path: vanillaSource[key] ?? '',
      })
    }
    return others
  }

  function destinationDistinctOthers(
    exclude: GameFolderKey,
  ): { label: string; path: string }[] {
    const others: { label: string; path: string }[] = [
      { label: 'Main data folder', path: appDirs.backupDir },
      { label: 'Mods download directory', path: appDirs.modsDownloadDir },
    ]
    const registry = readVanillaRegistry()
    for (const key of ['bg1', 'bg2', 'iwd', 'pst'] as const) {
      const vPath = vanillaPath(registry[key])
      if (vPath) {
        others.push({
          label: `${GAME_LABELS[key]} vanilla`,
          path: vPath,
        })
      }
    }
    for (const key of destKeys) {
      if (key === exclude) continue
      others.push({
        label: `${GAME_LABELS[key]} destination`,
        path: destinations[key] ?? '',
      })
    }
    return others
  }

  async function validateBackupDir(value: string) {
    const trimmed = value.trim()
    if (!trimmed) {
      setVanillaFieldError('backupDir', 'Required')
      return
    }
    try {
      await validateMainDataFolder(trimmed)
    } catch (err) {
      setVanillaFieldError('backupDir', String(err))
      return
    }
    const clash = distinctPathError(
      'Main data folder',
      trimmed,
      vanillaDistinctOthers('backupDir'),
    )
    setVanillaFieldError('backupDir', clash)
  }

  async function validateVanillaDir(key: GameFolderKey, value: string) {
    const trimmed = value.trim()
    if (!trimmed) {
      setVanillaFieldError(key, 'Required')
      return
    }
    const probe = await probeGameFolder(key, trimmed)
    if (!probe.ok) {
      setVanillaFieldError(key, probe.error)
      return
    }
    const clash = distinctPathError(
      `${GAME_LABELS[key]} vanilla game folder`,
      trimmed,
      vanillaDistinctOthers(key),
    )
    setVanillaFieldError(key, clash)
  }

  async function validateDestDir(key: GameFolderKey, value: string) {
    const trimmed = value.trim()
    if (!trimmed) {
      setDestFieldError(key, 'Required')
      return
    }
    try {
      await validateDestinationFolder(key, trimmed)
    } catch (err) {
      setDestFieldError(key, String(err))
      return
    }
    const clash = distinctPathError(
      `${GAME_LABELS[key]} destination`,
      trimmed,
      destinationDistinctOthers(key),
    )
    setDestFieldError(key, clash)
  }

  function goAfterEngine() {
    if (!engine) return
    const missing = missingVanillaKeys(engine)
    if (missing.length > 0) {
      setVanillaKeysForStep(missing)
      setSkippedVanillaStep(false)
      setStep('vanilla')
    } else {
      setVanillaKeysForStep([])
      setSkippedVanillaStep(true)
      setStep('destination')
    }
  }

  async function goAfterVanilla() {
    if (!engine || vanillaContinueBlocked) return
    const keys = vanillaKeysForStep
    const nextErrors: Partial<Record<VanillaErrorKey, string>> = {}

    const backupDir = appDirs.backupDir.trim()
    if (!backupDir) nextErrors.backupDir = 'Required'

    for (const key of keys) {
      if (!vanillaSource[key]?.trim()) nextErrors[key] = 'Required'
    }

    if (Object.keys(nextErrors).length > 0) {
      setVanillaErrors((prev) => ({ ...prev, ...nextErrors }))
      return
    }

    // Distinct-path preflight for all filled fields.
    {
      const backupClash = distinctPathError(
        'Main data folder',
        backupDir,
        vanillaDistinctOthers('backupDir'),
      )
      if (backupClash) nextErrors.backupDir = backupClash
      for (const key of keys) {
        const clash = distinctPathError(
          `${GAME_LABELS[key]} vanilla game folder`,
          vanillaSource[key]!.trim(),
          vanillaDistinctOthers(key),
        )
        if (clash) nextErrors[key] = clash
      }
      if (Object.keys(nextErrors).length > 0) {
        setVanillaErrors((prev) => ({ ...prev, ...nextErrors }))
        return
      }
    }

    setVanillaBusy(true)
    setProgress(null)
    try {
      try {
        await validateMainDataFolder(backupDir)
      } catch (err) {
        setVanillaFieldError('backupDir', String(err))
        return
      }

      for (const key of keys) {
        const source = vanillaSource[key]!.trim()
        const probe = await probeGameFolder(key, source)
        if (!probe.ok) {
          setVanillaFieldError(key, probe.error)
          return
        }
      }

      try {
        const ensured = await ensureMainDataFolder(backupDir)
        const nextDirs = { ...appDirs, backupDir: ensured }
        setAppDirs(nextDirs)
        writeAppDirPaths(nextDirs)
      } catch (err) {
        setVanillaFieldError('backupDir', String(err))
        return
      }

      // Process snapshot keys in order; skip any that became bound mid-run.
      for (const key of keys) {
        if (hasVanillaForKey(readVanillaRegistry(), key)) continue
        const source = vanillaSource[key]!.trim()
        try {
          if (methodFor(key) === 'create') {
            await createManagedVanillaFromFolder(key, source)
          } else {
            await registerExternalVanilla(key, source)
          }
        } catch (err) {
          setVanillaFieldError(key, String(err))
          return
        }
      }

      const stillMissing = keys.filter(
        (key) => !hasVanillaForKey(readVanillaRegistry(), key),
      )
      if (stillMissing.length > 0) {
        setVanillaFieldError(stillMissing[0]!, 'Set vanilla before continuing')
        return
      }

      setVanillaErrors({})
      setStep('destination')
    } finally {
      setVanillaBusy(false)
      setProgress(null)
    }
  }

  async function finish() {
    if (!engine || !name.trim() || destinationContinueBlocked) return

    for (const key of destKeys) {
      const path = destinations[key]?.trim()
      if (!path) {
        setDestFieldError(key, 'Required')
        return
      }
      const clash = distinctPathError(
        `${GAME_LABELS[key]} destination`,
        path,
        destinationDistinctOthers(key),
      )
      if (clash) {
        setDestFieldError(key, clash)
        return
      }
    }

    setSubmitting(true)
    setProgress(null)
    try {
      for (const key of destKeys) {
        const path = destinations[key]!.trim()
        try {
          await validateDestinationFolder(key, path)
        } catch (err) {
          setDestFieldError(key, String(err))
          setSubmitting(false)
          return
        }
        try {
          await prepareDestinationForKey(key, path)
        } catch (err) {
          setDestFieldError(key, String(err))
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
      setProgress(null)
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
              nameUserEditedRef.current = value.trim().length > 0
              setName(value)
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
            onValidate={(value) => void validateBackupDir(value)}
            placeholder="Select or type the path…"
            browseTitle="Select main data folder"
            error={vanillaErrors.backupDir ?? null}
            required
          />
          {vanillaKeysForStep.map((key) => (
            <div key={key} className="project-wizard-vanilla-block">
              <h3>{GAME_LABELS[key]}</h3>
              <div className="project-wizard-vanilla-fields">
                <DirectoryField
                  id={`project-wizard-vanilla-src-${key}`}
                  label={`${GAME_LABELS[key]} vanilla game folder`}
                  tip={VANILLA_FOLDER_TIP}
                  tipAriaLabel="About vanilla game folder"
                  value={vanillaSource[key] ?? ''}
                  onChange={(value) => {
                    setVanillaSource((prev) => ({ ...prev, [key]: value }))
                    clearVanillaError(key)
                  }}
                  onValidate={(value) => void validateVanillaDir(key, value)}
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
          {vanillaProgress ? (
            <div className="project-wizard-progress" role="status" aria-live="polite">
              <p className="project-wizard-progress-heading">{vanillaProgress.heading}</p>
              <p className="project-wizard-progress-detail">{vanillaProgress.detail}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {step === 'destination' && engine ? (
        <div className="project-wizard-dest">
          {destKeys.map((key) => (
            <DirectoryField
              key={key}
              id={`project-wizard-dest-${key}`}
              label={`Modded ${GAME_LABELS[key]} destination`}
              tip={DESTINATION_FOLDER_TIP}
              tipAriaLabel="About destination folder"
              value={destinations[key]}
              onChange={(value) => {
                setDestinations((prev) => ({ ...prev, [key]: value }))
                setDestFieldError(key, null)
              }}
              onValidate={(value) => void validateDestDir(key, value)}
              placeholder="Select or type the path…"
              browseTitle={`Select ${GAME_LABELS[key]} destination`}
              error={destErrors[key] ?? null}
              required
            />
          ))}
          {destinationProgress ? (
            <div className="project-wizard-progress" role="status" aria-live="polite">
              <p className="project-wizard-progress-heading">
                {destinationProgress.heading}
              </p>
              <p className="project-wizard-progress-detail">{destinationProgress.detail}</p>
            </div>
          ) : null}
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
              disabled={vanillaBusy || vanillaContinueBlocked}
              onClick={() => void goAfterVanilla()}
            >
              {vanillaBusy ? 'Preparing…' : 'Continue'}
            </button>
          ) : null}
          {step === 'destination' ? (
            <button
              type="button"
              className="btn primary lg"
              disabled={submitting || destinationContinueBlocked}
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
