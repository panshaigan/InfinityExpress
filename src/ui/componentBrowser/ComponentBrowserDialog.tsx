import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { PRESET_TILE_COPY } from '../../data/presetCatalog'
import {
  mergeConditionComponentOptions,
  type ConditionComponentOption,
} from '../../lib/componentBrowser/conditionEditor'
import {
  COMPONENT_COMPLEXITIES,
  COMPONENT_ENGINE_TOKENS,
  applySelectedAlternativeDefault,
  componentXmlId,
  createComponentTagDraft,
  serializeAlternativesBlock,
  serializeModComponentBlock,
  serializeSeparateComponentTags,
  serializeComponentTag,
  updateComponentCondition,
  validateComponentTagDraft,
  type ComponentTagDraft,
} from '../../lib/componentBrowser/componentTag'
import {
  componentBrowserKey,
  componentExistsInSequence,
  findComponentByIdentity,
  normalizeComponentIdentitySet,
  setVisibleComponentsSelected,
  summarizeComponentSelection,
  toggleComponentSelection,
} from '../../lib/componentBrowser/componentSelection'
import {
  discoverModTp2Candidates,
  listModWeiduComponents,
  listModWeiduLanguages,
  type ModTp2Candidate,
} from '../../lib/desktop/weiduInstall'
import { listSubdirNames } from '../../lib/desktop/modFs'
import { openExternalUrl } from '../../lib/desktop/openExternalUrl'
import type { WeiduComponentInfo, WeiduLanguageInfo } from '../../lib/install/types'
import { effectiveModFields, type WorkingMod } from '../../lib/mods/loadMods'
import { readAppDirPaths } from '../../lib/ui/appDirPrefs'
import { readWeiduPath } from '../../lib/ui/weiduPrefs'
import { isHttpUrl } from '../../lib/url'
import type { EngineToken } from '../../lib/xml/schema'
import { useBackdropDismiss } from '../backdropDismiss'
import { IconTip } from '../IconTip'
import { OutlinedSelect, type OutlinedSelectOption } from '../OutlinedSelect'
import { OutlinedTextField } from '../OutlinedTextField'
import { useToast } from '../toasts/toastContext'
import { ConditionExpressionField } from './ConditionExpressionField'

interface Props {
  open: boolean
  mods: readonly WorkingMod[]
  existingComponentIds: ReadonlySet<string>
  packageValues: readonly string[]
  conditionOptions: readonly ConditionComponentOption[]
  initialTarget?: { modId: string; componentId?: string } | null
  onClose: () => void
}

interface DownloadedMod {
  downloadId: string
  name: string
  url: string
  readme: string
}

interface ContextMenuState {
  component: WeiduComponentInfo
  x: number
  y: number
}

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase()
}

function componentSearchText(component: WeiduComponentInfo): string {
  return [
    component.number,
    component.name,
    ...component.label,
    ...(component.group ?? []),
    component.subgroup ?? '',
  ]
    .join(' ')
    .toLocaleLowerCase()
}

function selectEnglish(languages: readonly WeiduLanguageInfo[]): WeiduLanguageInfo | null {
  return (
    languages.find((language) => /\benglish\b/i.test(language.name)) ??
    languages[0] ??
    null
  )
}

function ComponentTagDialog({
  component,
  weiduId,
  draft,
  packageValues,
  conditionOptions,
  onDraftChange,
  onClose,
}: {
  component: WeiduComponentInfo
  weiduId: string
  draft: ComponentTagDraft
  packageValues: readonly string[]
  conditionOptions: readonly ConditionComponentOption[]
  onDraftChange: (draft: ComponentTagDraft) => void
  onClose: () => void
}) {
  const titleId = useId()
  const [openSelect, setOpenSelect] = useState<
    'recommended' | 'package' | 'complexity' | null
  >(null)
  const [error, setError] = useState<string | null>(null)
  const { pushToast } = useToast()
  const backdrop = useBackdropDismiss(onClose)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      if (openSelect) setOpenSelect(null)
      else onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, openSelect])

  function setField<K extends keyof ComponentTagDraft>(
    key: K,
    value: ComponentTagDraft[K],
  ) {
    onDraftChange({ ...draft, [key]: value })
  }

  function toggleEngine(token: EngineToken, checked: boolean) {
    const selected = new Set(draft.engine)
    if (checked) selected.add(token)
    else selected.delete(token)
    setField('engine', COMPONENT_ENGINE_TOKENS.filter((value) => selected.has(value)))
  }

  function setCondition(
    key: 'alwaysIf' | 'displayIf' | 'displayIfNot',
    value: string,
  ) {
    onDraftChange(updateComponentCondition(draft, key, value))
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    const validation = validateComponentTagDraft(draft)
    if (validation) {
      setError(validation)
      return
    }
    try {
      await navigator.clipboard.writeText(serializeComponentTag(draft))
      pushToast({ tone: 'success', message: 'Component XML copied' })
      onClose()
    } catch (reason) {
      setError(`Could not copy XML: ${String(reason)}`)
    }
  }

  const recommendedOptions: OutlinedSelectOption[] = [
    { value: '', label: '—' },
    ...Object.entries(PRESET_TILE_COPY).map(([value, copy]) => ({
      value,
      label: copy.label ? `${copy.label} (${value})` : value,
    })),
  ]
  const complexityOptions: OutlinedSelectOption[] = [
    { value: '', label: '—' },
    ...COMPONENT_COMPLEXITIES.map((value) => ({ value, label: value })),
  ]
  const packageOptions: OutlinedSelectOption[] = [
    { value: '', label: '—' },
    ...packageValues.map((value) => ({ value, label: value })),
  ]

  return (
    <div className="confirm-dialog-backdrop component-tag-backdrop" role="presentation" {...backdrop}>
      <div
        className="component-tag-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="confirm-dialog-header">
          <div>
            <h2 id={titleId}>Copy component XML</h2>
            <p className="component-browser-subtitle">
              WeiDU component #{component.number} · {weiduId}
            </p>
          </div>
        </div>
        <form className="component-tag-form" onSubmit={(event) => void submit(event)}>
          <OutlinedTextField
            label="ID"
            value={draft.id}
            onChange={(value) => setField('id', value)}
            required
            disabled
          />
          <OutlinedTextField
            label="Mod download ID"
            value={draft.modId}
            onChange={(value) => setField('modId', value)}
            required
            disabled
          />
          <OutlinedTextField
            className="component-tag-span-2"
            label="WeiDU name"
            value={draft.name}
            onChange={(value) => setField('name', value)}
            required
            disabled
          />
          <OutlinedTextField
            className="component-tag-span-2"
            label="Display label"
            value={draft.label}
            onChange={(value) => setField('label', value)}
            required
            autoFocus
          />
          <fieldset className="component-tag-fieldset component-tag-span-2">
            <legend>Engine</legend>
            <div className="component-tag-checks">
              {COMPONENT_ENGINE_TOKENS.map((token) => (
                <label key={token}>
                  <input
                    type="checkbox"
                    checked={draft.engine.includes(token)}
                    onChange={(event) => toggleEngine(token, event.target.checked)}
                  />
                  {token}
                </label>
              ))}
            </div>
          </fieldset>
          <OutlinedSelect
            label="Recommended"
            value={draft.recommended}
            options={recommendedOptions}
            emptyLabel="—"
            open={openSelect === 'recommended'}
            onOpenChange={(value) => setOpenSelect(value ? 'recommended' : null)}
            onChange={(value) => setField('recommended', value)}
          />
          <OutlinedSelect
            label="Package"
            value={draft.package}
            options={packageOptions}
            emptyLabel="—"
            open={openSelect === 'package'}
            onOpenChange={(value) => setOpenSelect(value ? 'package' : null)}
            onChange={(value) => setField('package', value)}
          />
          <OutlinedSelect
            label="Complexity"
            value={draft.complexity}
            options={complexityOptions}
            emptyLabel="—"
            open={openSelect === 'complexity'}
            onOpenChange={(value) => setOpenSelect(value ? 'complexity' : null)}
            onChange={(value) => setField('complexity', value)}
          />
          <fieldset className="component-tag-fieldset component-tag-conditions component-tag-span-2">
            <legend>Conditions</legend>
            <ConditionExpressionField
              attribute="alwaysIf"
              label="Always selected when"
              help="Automatically selects this component when the expression is true."
              value={draft.alwaysIf}
              currentComponentId={draft.id}
              options={conditionOptions}
              onChange={(value) => setCondition('alwaysIf', value)}
            />
            <ConditionExpressionField
              attribute="displayIf"
              label="Shown when"
              help="Shows this component only when the expression is true."
              value={draft.displayIf}
              currentComponentId={draft.id}
              options={conditionOptions}
              onChange={(value) => setCondition('displayIf', value)}
            />
            <ConditionExpressionField
              attribute="displayIfNot"
              label="Hidden when"
              help="Hides this component when the expression is true."
              value={draft.displayIfNot}
              currentComponentId={draft.id}
              options={conditionOptions}
              onChange={(value) => setCondition('displayIfNot', value)}
            />
          </fieldset>
          <div className="component-tag-boolean-row component-tag-span-2">
            <label>
              <input
                type="checkbox"
                checked={draft.required}
                onChange={(event) => setField('required', event.target.checked)}
              />
              Required component
            </label>
            <label>
              <input
                type="checkbox"
                checked={draft.noDisplay}
                onChange={(event) => setField('noDisplay', event.target.checked)}
              />
              Hidden by default
            </label>
            <label>
              <input
                type="checkbox"
                checked={draft.core}
                onChange={(event) => setField('core', event.target.checked)}
              />
              Core component
            </label>
            <label>
              <input
                type="checkbox"
                checked={draft.default}
                onChange={(event) => setField('default', event.target.checked)}
              />
              Default alternative
            </label>
          </div>
          {component.label.length > 1 ? (
            <p className="component-tag-note component-tag-span-2">
              WeiDU labels: {component.label.join(', ')}
            </p>
          ) : null}
          {error ? <p className="mod-editor-error component-tag-span-2">{error}</p> : null}
          <div className="confirm-dialog-actions component-tag-span-2">
            <button type="button" className="btn secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn">
              Copy
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function ComponentBrowserDialog({
  open,
  mods,
  existingComponentIds,
  packageValues,
  conditionOptions,
  initialTarget,
  onClose,
}: Props) {
  const titleId = useId()
  const modSuggestionsId = useId()
  const { pushToast } = useToast()
  const [downloadedMods, setDownloadedMods] = useState<DownloadedMod[]>([])
  const [modQuery, setModQuery] = useState('')
  const [modSuggestionIndex, setModSuggestionIndex] = useState(-1)
  const [selectedMod, setSelectedMod] = useState<DownloadedMod | null>(null)
  const [candidates, setCandidates] = useState<ModTp2Candidate[]>([])
  const [selectedTp2, setSelectedTp2] = useState('')
  const [languages, setLanguages] = useState<WeiduLanguageInfo[]>([])
  const [languageIndex, setLanguageIndex] = useState('')
  const [components, setComponents] = useState<WeiduComponentInfo[]>([])
  const [componentQuery, setComponentQuery] = useState('')
  const [openSelect, setOpenSelect] = useState<'tp2' | 'language' | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [editing, setEditing] = useState<WeiduComponentInfo | null>(null)
  const [indicatedComponentKey, setIndicatedComponentKey] = useState<string | null>(
    null,
  )
  const [selectedComponentKeys, setSelectedComponentKeys] = useState<Set<string>>(
    () => new Set(),
  )
  const [sessionDrafts, setSessionDrafts] = useState<Map<string, ComponentTagDraft>>(
    () => new Map(),
  )
  const requestId = useRef(0)
  const componentRowRefs = useRef(new Map<string, HTMLTableRowElement>())
  const modSuggestionRefs = useRef(new Map<string, HTMLButtonElement>())
  const selectAllRef = useRef<HTMLInputElement>(null)
  const backdrop = useBackdropDismiss(onClose)

  const catalog = useMemo(() => {
    const map = new Map<string, WorkingMod>()
    for (const mod of mods) map.set(normalized(mod.codename), mod)
    return map
  }, [mods])
  const normalizedExistingComponentIds = useMemo(
    () => normalizeComponentIdentitySet(existingComponentIds),
    [existingComponentIds],
  )

  useEffect(() => {
    if (!open) return
    const current = ++requestId.current
    setSelectedMod(null)
    setCandidates([])
    setSelectedTp2('')
    setLanguages([])
    setLanguageIndex('')
    setComponents([])
    setModQuery('')
    setModSuggestionIndex(-1)
    setComponentQuery('')
    setSelectedComponentKeys(new Set())
    setIndicatedComponentKey(null)
    setOpenSelect(null)
    setError(null)
    const { modsDownloadDir } = readAppDirPaths()
    if (!modsDownloadDir) {
      setDownloadedMods([])
      setError('Set the main data folder in Settings before browsing components.')
      return
    }
    void listSubdirNames(modsDownloadDir)
      .then((folders) => {
        if (requestId.current !== current) return
        const downloaded = folders
          .filter((folder) => !folder.startsWith('.'))
          .map((downloadId) => {
            const catalogMod = catalog.get(normalized(downloadId))
            const fields = catalogMod ? effectiveModFields(catalogMod) : null
            return {
              downloadId,
              name: fields?.name || downloadId,
              url: fields?.url ?? '',
              readme: fields?.readme ?? '',
            }
          })
        setDownloadedMods(downloaded)
        if (initialTarget) {
          const requested = downloaded.find(
            (mod) => normalized(mod.downloadId) === normalized(initialTarget.modId),
          )
          if (requested) void chooseMod(requested)
          else {
            setModQuery(initialTarget.modId)
            setError(`Downloaded mod “${initialTarget.modId}” was not found.`)
          }
        }
      })
      .catch((reason) => {
        if (requestId.current === current) setError(String(reason))
      })
  }, [catalog, initialTarget, open])

  useEffect(() => {
    if (!open || !indicatedComponentKey) return
    const frame = requestAnimationFrame(() => {
      componentRowRefs.current
        .get(indicatedComponentKey)
        ?.scrollIntoView({ block: 'center' })
    })
    return () => cancelAnimationFrame(frame)
  }, [indicatedComponentKey, open])

  useEffect(() => {
    if (!open) requestId.current++
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      if (editing) return
      event.preventDefault()
      if (openSelect) setOpenSelect(null)
      else if (contextMenu) setContextMenu(null)
      else onClose()
    }
    function closeMenu() {
      setContextMenu(null)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('click', closeMenu)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('click', closeMenu)
    }
  }, [contextMenu, editing, onClose, open, openSelect])

  const modSuggestions = useMemo(() => {
    const query = normalized(modQuery)
    return downloadedMods
      .filter(
        (mod) =>
          !query ||
          normalized(mod.downloadId).includes(query) ||
          normalized(mod.name).includes(query),
      )
      .slice(0, 30)
  }, [downloadedMods, modQuery])

  useEffect(() => {
    setModSuggestionIndex((previous) =>
      previous >= modSuggestions.length ? modSuggestions.length - 1 : previous,
    )
  }, [modSuggestions.length])

  useEffect(() => {
    const suggestion = modSuggestions[modSuggestionIndex]
    if (!suggestion) return
    modSuggestionRefs.current
      .get(suggestion.downloadId)
      ?.scrollIntoView({ block: 'nearest' })
  }, [modSuggestionIndex, modSuggestions])

  const filteredComponents = useMemo(() => {
    const query = normalized(componentQuery)
    if (!query) return components
    return components.filter((component) => componentSearchText(component).includes(query))
  }, [componentQuery, components])

  const tp2Options = candidates.map((candidate) => ({
    value: candidate.relativePath,
    label: candidate.relativePath,
  }))
  const languageOptions = languages.map((language) => ({
    value: String(language.index),
    label: language.name,
  }))
  const activeCandidate = candidates.find(
    (candidate) => candidate.relativePath === selectedTp2,
  )
  const currentModConditionOptions = useMemo<ConditionComponentOption[]>(() => {
    if (!activeCandidate || !selectedMod) return []
    return components.map((component) => ({
      id: componentXmlId(component, activeCandidate.weiduId),
      label: component.name,
      name: component.name,
      modId: selectedMod.downloadId,
    }))
  }, [activeCandidate, components, selectedMod])
  const availableConditionOptions = useMemo(
    () => mergeConditionComponentOptions(conditionOptions, currentModConditionOptions),
    [conditionOptions, currentModConditionOptions],
  )
  const visibleSelection = useMemo(
    () => summarizeComponentSelection(selectedComponentKeys, filteredComponents),
    [filteredComponents, selectedComponentKeys],
  )

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate =
        visibleSelection.some && !visibleSelection.all
    }
  }, [visibleSelection])

  function sessionDraftKey(component: WeiduComponentInfo): string {
    return `${normalized(selectedMod?.downloadId ?? '')}\u0000${normalized(
      selectedTp2,
    )}\u0000${component.number}`
  }

  function draftFor(component: WeiduComponentInfo): ComponentTagDraft {
    const saved = sessionDrafts.get(sessionDraftKey(component))
    if (saved) return saved
    return createComponentTagDraft(
      component,
      activeCandidate?.weiduId ?? '',
      selectedMod?.downloadId ?? '',
    )
  }

  function saveDraft(component: WeiduComponentInfo, draft: ComponentTagDraft) {
    const key = sessionDraftKey(component)
    setSessionDrafts((previous) => {
      const next = new Map(previous)
      next.set(key, draft)
      return next
    })
  }

  function selectedDrafts(): ComponentTagDraft[] {
    return components
      .filter((component) =>
        selectedComponentKeys.has(componentBrowserKey(component)),
      )
      .map(draftFor)
  }

  async function copySelectedGrouped() {
    if (!selectedMod) return
    const drafts = selectedDrafts()
    try {
      const xml = serializeModComponentBlock(
        selectedMod.downloadId,
        drafts,
      )
      await navigator.clipboard.writeText(xml)
      pushToast({
        tone: 'success',
        message: `Copied ${drafts.length} grouped component${drafts.length === 1 ? '' : 's'}`,
      })
    } catch (reason) {
      setError(`Could not copy XML: ${String(reason)}`)
    }
  }

  async function copySelectedSeparate() {
    const drafts = selectedDrafts()
    try {
      await navigator.clipboard.writeText(serializeSeparateComponentTags(drafts))
      pushToast({
        tone: 'success',
        message: `Copied ${drafts.length} separate component${drafts.length === 1 ? '' : 's'}`,
      })
    } catch (reason) {
      setError(`Could not copy XML: ${String(reason)}`)
    }
  }

  async function copyAlternativesGroup(label: string) {
    const group = components.filter(
      (component) => normalized(component.subgroup ?? '') === normalized(label),
    )
    const selectedIndex = group.findIndex((component) =>
      selectedComponentKeys.has(componentBrowserKey(component)),
    )
    const drafts = applySelectedAlternativeDefault(
      group.map(draftFor),
      selectedIndex,
    )
    try {
      await navigator.clipboard.writeText(
        serializeAlternativesBlock(label, drafts),
      )
      pushToast({
        tone: 'success',
        message: `Copied ${group.length} alternatives`,
      })
    } catch (reason) {
      setError(`Could not copy alternatives XML: ${String(reason)}`)
    }
  }

  async function loadComponents(
    mod: DownloadedMod,
    candidate: ModTp2Candidate,
    language: WeiduLanguageInfo,
  ) {
    const current = ++requestId.current
    const paths = readAppDirPaths()
    const weiduPath = readWeiduPath()
    if (!weiduPath) {
      setError('Set the WeiDU executable in Settings before browsing components.')
      return
    }
    setLoading(true)
    setError(null)
    setComponents([])
    setSelectedComponentKeys(new Set())
    setIndicatedComponentKey(null)
    try {
      const result = await listModWeiduComponents(
        weiduPath,
        paths.modsDownloadDir,
        mod.downloadId,
        candidate.relativePath,
        language.index,
      )
      if (requestId.current !== current) return
      setComponents(result)
      if (
        initialTarget?.componentId &&
        normalized(initialTarget.modId) === normalized(mod.downloadId)
      ) {
        const match = findComponentByIdentity(
          result,
          candidate.weiduId,
          initialTarget.componentId,
        )
        if (match) setIndicatedComponentKey(componentBrowserKey(match))
        else {
          setError(
            `Component “${initialTarget.componentId}” was not found in ${candidate.relativePath}.`,
          )
        }
      }
    } catch (reason) {
      if (requestId.current === current) setError(String(reason))
    } finally {
      if (requestId.current === current) setLoading(false)
    }
  }

  async function chooseCandidate(mod: DownloadedMod, candidate: ModTp2Candidate) {
    const current = ++requestId.current
    const paths = readAppDirPaths()
    const weiduPath = readWeiduPath()
    setSelectedTp2(candidate.relativePath)
    setLanguages([])
    setLanguageIndex('')
    setComponents([])
    setSelectedComponentKeys(new Set())
    setIndicatedComponentKey(null)
    setLoading(true)
    setError(null)
    if (!weiduPath) {
      setLoading(false)
      setError('Set the WeiDU executable in Settings before browsing components.')
      return
    }
    try {
      const result = await listModWeiduLanguages(
        weiduPath,
        paths.modsDownloadDir,
        mod.downloadId,
        candidate.relativePath,
      )
      if (requestId.current !== current) return
      setLanguages(result)
      const language = selectEnglish(result)
      if (!language) throw new Error('WeiDU did not list any languages for this TP2.')
      setLanguageIndex(String(language.index))
      await loadComponents(mod, candidate, language)
    } catch (reason) {
      if (requestId.current === current) {
        setError(String(reason))
        setLoading(false)
      }
    }
  }

  async function chooseMod(mod: DownloadedMod) {
    const current = ++requestId.current
    setSelectedMod(mod)
    setModQuery(mod.name === mod.downloadId ? mod.downloadId : `${mod.name} — ${mod.downloadId}`)
    setCandidates([])
    setSelectedTp2('')
    setLanguages([])
    setLanguageIndex('')
    setComponents([])
    setComponentQuery('')
    setSelectedComponentKeys(new Set())
    setIndicatedComponentKey(null)
    setLoading(true)
    setError(null)
    try {
      const result = await discoverModTp2Candidates(
        readAppDirPaths().modsDownloadDir,
        mod.downloadId,
      )
      if (requestId.current !== current) return
      setCandidates(result)
      const numberedTargetWeiduId = initialTarget?.componentId?.match(
        /^(.*):\d+$/,
      )?.[1]
      const first =
        (numberedTargetWeiduId
          ? result.find(
              (candidate) =>
                normalized(candidate.weiduId) === normalized(numberedTargetWeiduId),
            )
          : undefined) ?? result[0]
      if (!first) throw new Error('No TP2 files found in this download.')
      await chooseCandidate(mod, first)
    } catch (reason) {
      if (requestId.current === current) {
        setError(String(reason))
        setLoading(false)
      }
    }
  }

  function openContextMenu(event: ReactMouseEvent, component: WeiduComponentInfo) {
    event.preventDefault()
    event.stopPropagation()
    setContextMenu({
      component,
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 230)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 70)),
    })
  }

  if (!open) return null

  return (
    <div className="confirm-dialog-backdrop" role="presentation" {...backdrop}>
      <div
        className="component-browser-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="confirm-dialog-header component-browser-header">
          <div>
            <h2 id={titleId}>Mod component browser</h2>
            <p className="component-browser-subtitle">
              Inspect downloaded TP2 installers and copy InstallSequence XML.
            </p>
          </div>
          <button type="button" className="btn secondary" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="component-browser-controls">
          <div className="component-browser-mod-picker">
            <OutlinedTextField
              label="Downloaded mod"
              value={modQuery}
              onChange={(value) => {
                setModQuery(value)
                setModSuggestionIndex(-1)
                setSelectedMod(null)
                setCandidates([])
                setSelectedTp2('')
                setLanguages([])
                setLanguageIndex('')
                setComponents([])
                setSelectedComponentKeys(new Set())
                setIndicatedComponentKey(null)
              }}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown' && modSuggestions.length > 0) {
                  event.preventDefault()
                  setModSuggestionIndex((previous) =>
                    Math.min(previous + 1, modSuggestions.length - 1),
                  )
                  return
                }
                if (event.key === 'ArrowUp' && modSuggestions.length > 0) {
                  event.preventDefault()
                  setModSuggestionIndex((previous) =>
                    previous < 0 ? modSuggestions.length - 1 : Math.max(previous - 1, 0),
                  )
                  return
                }
                const suggestion =
                  modSuggestions[modSuggestionIndex] ?? modSuggestions[0]
                if (event.key === 'Enter' && suggestion) {
                  event.preventDefault()
                  void chooseMod(suggestion)
                }
              }}
              autoFocus
              placeholder="Search by name or download ID…"
            />
            {!selectedMod && modQuery.trim() ? (
              <div
                id={modSuggestionsId}
                className="component-browser-suggestions"
                role="listbox"
              >
                {modSuggestions.length > 0 ? (
                  modSuggestions.map((mod, index) => (
                    <button
                      key={mod.downloadId}
                      ref={(element) => {
                        if (element) {
                          modSuggestionRefs.current.set(mod.downloadId, element)
                        } else {
                          modSuggestionRefs.current.delete(mod.downloadId)
                        }
                      }}
                      type="button"
                      role="option"
                      className={index === modSuggestionIndex ? 'active' : undefined}
                      aria-selected={index === modSuggestionIndex}
                      onMouseEnter={() => setModSuggestionIndex(index)}
                      onClick={() => void chooseMod(mod)}
                    >
                      <span>{mod.name}</span>
                      <small>{mod.downloadId}</small>
                    </button>
                  ))
                ) : (
                  <p>No downloaded mods match.</p>
                )}
              </div>
            ) : null}
          </div>
          <OutlinedSelect
            label="TP2"
            value={selectedTp2}
            options={tp2Options}
            emptyLabel="Select a mod first"
            disabled={!selectedMod || candidates.length === 0 || loading}
            open={openSelect === 'tp2'}
            onOpenChange={(value) => setOpenSelect(value ? 'tp2' : null)}
            onChange={(value) => {
              const candidate = candidates.find((item) => item.relativePath === value)
              if (selectedMod && candidate) void chooseCandidate(selectedMod, candidate)
            }}
          />
          <OutlinedSelect
            label="Language"
            value={languageIndex}
            options={languageOptions}
            emptyLabel="—"
            disabled={!activeCandidate || languages.length === 0 || loading}
            open={openSelect === 'language'}
            onOpenChange={(value) => setOpenSelect(value ? 'language' : null)}
            onChange={(value) => {
              setLanguageIndex(value)
              const language = languages.find((item) => item.index === Number(value))
              if (selectedMod && activeCandidate && language) {
                void loadComponents(selectedMod, activeCandidate, language)
              }
            }}
          />
        </div>

        {selectedMod &&
        (isHttpUrl(selectedMod.url) || isHttpUrl(selectedMod.readme)) ? (
          <div className="component-browser-links" aria-label="Mod links">
            {isHttpUrl(selectedMod.url) ? (
              <a
                href={selectedMod.url}
                target="_blank"
                rel="noreferrer"
                onClick={(event) => {
                  event.preventDefault()
                  void openExternalUrl(selectedMod.url)
                }}
              >
                Mod page ↗
              </a>
            ) : null}
            {isHttpUrl(selectedMod.readme) ? (
              <a
                href={selectedMod.readme}
                target="_blank"
                rel="noreferrer"
                onClick={(event) => {
                  event.preventDefault()
                  void openExternalUrl(selectedMod.readme)
                }}
              >
                Readme ↗
              </a>
            ) : null}
          </div>
        ) : null}

        <div className="component-browser-list-header">
          <OutlinedTextField
            label="Filter components"
            value={componentQuery}
            onChange={setComponentQuery}
            disabled={components.length === 0}
            placeholder="Number, name, label, group…"
          />
          <span>
            {filteredComponents.length} of {components.length} components
          </span>
          <button
            type="button"
            className="btn secondary component-browser-copy-selected"
            disabled={selectedComponentKeys.size === 0}
            onClick={() => void copySelectedSeparate()}
          >
            Copy separate ({selectedComponentKeys.size})
          </button>
          <button
            type="button"
            className="btn secondary component-browser-copy-selected"
            disabled={selectedComponentKeys.size === 0}
            onClick={() => void copySelectedGrouped()}
          >
            Copy grouped ({selectedComponentKeys.size})
          </button>
        </div>

        {error ? <div className="component-browser-error">{error}</div> : null}
        <div className="component-browser-table-wrap">
          {loading ? (
            <div className="component-browser-empty">Reading components with WeiDU…</div>
          ) : components.length === 0 ? (
            <div className="component-browser-empty">
              Choose a downloaded mod to browse its components.
            </div>
          ) : (
            <table className="component-browser-table">
              <thead>
                <tr>
                  <th className="component-browser-select">
                    <input
                      ref={selectAllRef}
                      type="checkbox"
                      checked={visibleSelection.all}
                      disabled={filteredComponents.length === 0}
                      onChange={(event) =>
                        setSelectedComponentKeys((previous) =>
                          setVisibleComponentsSelected(
                            previous,
                            filteredComponents,
                            components,
                            event.target.checked,
                          ),
                        )
                      }
                      aria-label="Select all visible components"
                    />
                  </th>
                  <th>#</th>
                  <th>Name</th>
                  <th>WeiDU LABEL</th>
                  <th>Group</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {filteredComponents.map((component) => {
                  const key = componentBrowserKey(component)
                  const subgroup = component.subgroup?.trim() ?? ''
                  const exists = activeCandidate
                    ? componentExistsInSequence(
                        normalizedExistingComponentIds,
                        component,
                        activeCandidate.weiduId,
                      )
                    : false
                  return (
                    <tr
                      key={key}
                      ref={(element) => {
                        if (element) componentRowRefs.current.set(key, element)
                        else componentRowRefs.current.delete(key)
                      }}
                      className={
                        indicatedComponentKey === key
                          ? 'component-browser-indicated'
                          : undefined
                      }
                      onContextMenu={(event) => openContextMenu(event, component)}
                    >
                      <td className="component-browser-select">
                        <input
                          type={subgroup ? 'radio' : 'checkbox'}
                          name={
                            subgroup
                              ? `component-alternative-${normalized(subgroup)}`
                              : undefined
                          }
                          checked={selectedComponentKeys.has(key)}
                          onChange={() =>
                            setSelectedComponentKeys((previous) =>
                              toggleComponentSelection(previous, component, components),
                            )
                          }
                          aria-label={`${subgroup ? 'Choose alternative' : 'Select component'} ${component.number}: ${component.name}`}
                        />
                      </td>
                      <td className="component-browser-number">{component.number}</td>
                      <td>
                        <span className="component-browser-name">
                          {component.name}
                          {exists ? (
                            <span className="component-browser-existing-badge">
                              In sequence
                            </span>
                          ) : null}
                          {indicatedComponentKey === key ? (
                            <span className="component-browser-opened-badge">
                              Opened here
                            </span>
                          ) : null}
                        </span>
                        {subgroup ? (
                          <button
                            type="button"
                            className="component-browser-subgroup has-icon-tip"
                            onClick={(event) => {
                              event.stopPropagation()
                              void copyAlternativesGroup(subgroup)
                            }}
                          >
                            {subgroup}
                            <IconTip>Copy this alternatives group</IconTip>
                          </button>
                        ) : null}
                      </td>
                      <td>
                        {component.label.length > 0 ? (
                          component.label.map((label, index) => (
                            <code key={`${index}:${label}`}>{label}</code>
                          ))
                        ) : (
                          <span className="component-browser-muted">No LABEL</span>
                        )}
                      </td>
                      <td>
                        {(component.group ?? []).join(' · ') || (
                          <span className="component-browser-muted">—</span>
                        )}
                        {component.forced ? <small>Forced</small> : null}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn secondary component-browser-xml-btn"
                          onClick={() => setEditing(component)}
                          aria-label={`Copy component ${component.number} as XML`}
                        >
                          XML
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {contextMenu ? (
          <div
            className="component-browser-context-menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            role="menu"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setEditing(contextMenu.component)
                setContextMenu(null)
              }}
            >
              Copy as &lt;component /&gt;…
            </button>
          </div>
        ) : null}
      </div>
      {editing && selectedMod && activeCandidate ? (
        <ComponentTagDialog
          component={editing}
          weiduId={activeCandidate.weiduId}
          draft={draftFor(editing)}
          packageValues={packageValues}
          conditionOptions={availableConditionOptions}
          onDraftChange={(draft) => saveDraft(editing, draft)}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  )
}
