import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { scrapeModPageMeta } from '../../lib/desktop/modPageMeta'
import type { ModInfo } from '../../lib/mods/loadMods'
import {
  GAME_TOKENS,
  joinGameTokens,
  splitGameTokens,
  withHtmlPreviewIfNeeded,
  type GameToken,
} from '../../lib/mods/modFieldParse'
import {
  provisionalCodenameFromUrl,
  type UserModInput,
} from '../../lib/mods/userCatalog'
import { isHttpUrl } from '../../lib/url'
import { OutlinedSelect, type OutlinedSelectOption } from '../OutlinedSelect'
import { OutlinedTextField } from '../OutlinedTextField'

export type ModEditorMode = 'create' | 'edit'

export interface ModEditorFacetOptions {
  categories: string[]
  types: string[]
  stabilities: string[]
}

interface Props {
  open: boolean
  mode: ModEditorMode
  initial: Partial<ModInfo> | null
  existingCodenames: ReadonlySet<string>
  facetOptions: ModEditorFacetOptions
  onSave: (input: UserModInput) => void
  onCancel: () => void
}

const EMPTY: UserModInput = {
  codename: '',
  name: '',
  abbreviation: '',
  category: '',
  url: '',
  readme: '',
  game: '',
  useMaster: false,
  useAssets: false,
  release: '',
  version: '',
  sizeBytes: null,
  author: '',
  type: '',
  stability: '',
}

type OpenSelect = 'category' | 'type' | 'stability' | null

function toForm(initial: Partial<ModInfo> | null): UserModInput {
  if (!initial) return { ...EMPTY }
  const readme = initial.readme ?? ''
  return {
    codename: initial.codename ?? '',
    name: initial.name ?? '',
    abbreviation: initial.abbreviation ?? '',
    category: initial.category ?? '',
    url: initial.url ?? '',
    readme: readme ? withHtmlPreviewIfNeeded(readme) : '',
    game: initial.game ?? '',
    useMaster: initial.useMaster ?? false,
    useAssets: initial.useAssets ?? false,
    release: initial.release ?? '',
    version: initial.version ?? '',
    sizeBytes: initial.sizeBytes ?? null,
    author: initial.author ?? '',
    type: initial.type ?? '',
    stability: initial.stability ?? '',
  }
}

function toSelectOptions(values: string[]): OutlinedSelectOption[] {
  return values.map((value) => ({ value, label: value }))
}

function withEmptyOption(
  values: string[],
  emptyLabel: string,
): OutlinedSelectOption[] {
  return [{ value: '', label: emptyLabel }, ...toSelectOptions(values)]
}

function selectedGameTokens(game: string): Set<GameToken> {
  const selected = new Set<GameToken>()
  for (const token of splitGameTokens(game)) {
    if ((GAME_TOKENS as readonly string[]).includes(token)) {
      selected.add(token as GameToken)
    }
  }
  return selected
}

export function ModEditorDialog({
  open,
  mode,
  initial,
  existingCodenames,
  facetOptions,
  onSave,
  onCancel,
}: Props) {
  const titleId = useId()
  const gameFieldId = useId()
  const [form, setForm] = useState<UserModInput>(() => toForm(initial))
  const [error, setError] = useState<string | null>(null)
  const [openSelect, setOpenSelect] = useState<OpenSelect>(null)
  const [scraping, setScraping] = useState(false)
  const scrapeCacheRef = useRef<{ url: string; name: string; readme: string; author: string } | null>(
    null,
  )
  const scrapePromiseRef = useRef<Map<string, Promise<{ name: string; readme: string; author: string } | null>>>(
    new Map(),
  )
  const formRef = useRef(form)
  formRef.current = form

  useEffect(() => {
    if (!open) return
    setForm(toForm(initial))
    setError(null)
    setOpenSelect(null)
    setScraping(false)
    scrapeCacheRef.current = null
    scrapePromiseRef.current.clear()
  }, [open, initial])

  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        if (openSelect) {
          setOpenSelect(null)
          return
        }
        onCancel()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onCancel, openSelect])

  if (!open) return null

  function setField<K extends keyof UserModInput>(key: K, value: UserModInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function toggleGameToken(token: GameToken, checked: boolean) {
    setForm((prev) => {
      const next = selectedGameTokens(prev.game)
      if (checked) next.add(token)
      else next.delete(token)
      return { ...prev, game: joinGameTokens([...next]) }
    })
  }

  function resolvedCodename(url: string, current: UserModInput): string {
    const code = current.codename.trim()
    if (code) return code
    if (mode === 'create') {
      return provisionalCodenameFromUrl(url, existingCodenames)
    }
    return ''
  }

  async function fillEmptyFromUrl(
    url: string,
    current: UserModInput,
  ): Promise<UserModInput> {
    const needName = !current.name.trim()
    const needReadme = !current.readme.trim()
    if (!needName && !needReadme) return current

    let next = { ...current }
    const cached = scrapeCacheRef.current
    let meta =
      cached && cached.url === url
        ? { name: cached.name, readme: cached.readme, author: cached.author }
        : null

    if (!meta) {
      let pending = scrapePromiseRef.current.get(url)
      if (!pending) {
        setScraping(true)
        pending = scrapeModPageMeta(url)
          .then((scraped) => {
            if (!scraped) return null
            const result = {
              name: scraped.name.trim(),
              readme: scraped.readme.trim(),
              author: scraped.author.trim(),
            }
            scrapeCacheRef.current = { url, ...result }
            return result
          })
          .finally(() => {
            scrapePromiseRef.current.delete(url)
            setScraping(false)
          })
        scrapePromiseRef.current.set(url, pending)
      }
      meta = await pending
    }

    if (meta && !next.author.trim() && meta.author) {
      next = { ...next, author: meta.author }
    }
    if (needName) {
      const fromScrape = meta?.name?.trim() ?? ''
      const code = resolvedCodename(url, next)
      next = { ...next, name: fromScrape || code }
    }
    if (needReadme && meta?.readme && isHttpUrl(meta.readme)) {
      next = { ...next, readme: withHtmlPreviewIfNeeded(meta.readme) }
    }
    return next
  }

  async function onUrlBlur() {
    const url = formRef.current.url.trim()
    if (!isHttpUrl(url)) return
    const current = formRef.current
    if (current.name.trim() && current.readme.trim()) return
    const next = await fillEmptyFromUrl(url, current)
    setForm(next)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const url = form.url.trim()
    if (!url) {
      setError('URL is required')
      return
    }
    if (!isHttpUrl(url)) {
      setError('URL must be a valid http(s) address')
      return
    }

    let next = await fillEmptyFromUrl(url, form)
    if (!next.name.trim()) {
      const code = resolvedCodename(url, next)
      next = { ...next, name: code }
    }

    const readmeRaw = next.readme.trim()
    const readme = readmeRaw ? withHtmlPreviewIfNeeded(readmeRaw) : ''
    if (readme && !isHttpUrl(readme)) {
      setError('Readme must be a valid http(s) address')
      setForm({ ...next, readme })
      return
    }

    let code = next.codename.trim()
    if (!code) {
      if (mode === 'create') {
        code = provisionalCodenameFromUrl(url, existingCodenames)
      } else {
        setError('Download ID is required')
        setForm(next)
        return
      }
    }

    const original = initial?.codename ?? ''
    if (
      (mode === 'create' || code !== original) &&
      existingCodenames.has(code)
    ) {
      setError(`Download ID "${code}" already exists`)
      setForm(next)
      return
    }
    setError(null)
    onSave({
      ...next,
      url,
      readme,
      game: joinGameTokens(splitGameTokens(next.game)),
      codename: code,
      sizeBytes:
        next.sizeBytes != null && Number.isFinite(next.sizeBytes)
          ? Math.floor(next.sizeBytes)
          : null,
    })
  }

  const categoryOptions = withEmptyOption(facetOptions.categories, '—')
  const typeOptions = withEmptyOption(facetOptions.types, '—')
  const stabilityOptions = withEmptyOption(facetOptions.stabilities, 'Released')
  const games = selectedGameTokens(form.game)

  return (
    <div
      className="confirm-dialog-backdrop"
      role="presentation"
      onClick={onCancel}
    >
      <div
        className="mod-editor-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="confirm-dialog-header mod-editor-header">
          <h2 id={titleId}>{mode === 'create' ? 'Add mod' : 'Edit mod'}</h2>
          <div className="mod-editor-header-flags">
            <label className="mod-editor-check">
              <input
                type="checkbox"
                checked={form.useMaster}
                onChange={(e) => setField('useMaster', e.target.checked)}
              />
              Use master
            </label>
            <label className="mod-editor-check">
              <input
                type="checkbox"
                checked={form.useAssets}
                onChange={(e) => setField('useAssets', e.target.checked)}
              />
              Use assets
            </label>
          </div>
        </div>
        <form className="mod-editor-form" onSubmit={(e) => void handleSubmit(e)}>
          <OutlinedTextField
            className="mod-editor-span-2"
            label="URL"
            type="url"
            value={form.url}
            onChange={(v) => setField('url', v)}
            onBlur={() => void onUrlBlur()}
            required
            autoFocus
            placeholder="https://…"
            spellCheck={false}
            autoComplete="off"
          />
          <OutlinedTextField
            className="mod-editor-span-2"
            label="Readme"
            type="url"
            value={form.readme}
            onChange={(v) => setField('readme', v)}
            placeholder="https://…"
            spellCheck={false}
            autoComplete="off"
          />
          <OutlinedTextField
            className="mod-editor-span-2"
            label="Name"
            value={form.name}
            onChange={(v) => setField('name', v)}
            placeholder={scraping ? 'Looking up…' : undefined}
          />
          <OutlinedTextField
            label="Abbreviation"
            value={form.abbreviation}
            onChange={(v) => setField('abbreviation', v)}
          />
          <OutlinedTextField
            label="Author"
            value={form.author}
            onChange={(v) => setField('author', v)}
          />
          <OutlinedSelect
            className="outlined-field-wide"
            label="Category"
            value={form.category}
            options={categoryOptions}
            emptyLabel="—"
            open={openSelect === 'category'}
            onOpenChange={(o) => setOpenSelect(o ? 'category' : null)}
            onChange={(v) => setField('category', v)}
          />
          <OutlinedSelect
            className="outlined-field-wide"
            label="Type"
            value={form.type}
            options={typeOptions}
            emptyLabel="—"
            open={openSelect === 'type'}
            onOpenChange={(o) => setOpenSelect(o ? 'type' : null)}
            onChange={(v) => setField('type', v)}
          />
          <OutlinedSelect
            className="outlined-field-wide"
            label="Stability"
            value={form.stability}
            options={stabilityOptions}
            emptyLabel="Released"
            open={openSelect === 'stability'}
            onOpenChange={(o) => setOpenSelect(o ? 'stability' : null)}
            onChange={(v) => setField('stability', v)}
          />
          <fieldset className="mod-editor-check-group mod-editor-span-2">
            <legend id={gameFieldId}>Game</legend>
            <div
              className="mod-editor-check-row mod-editor-game-row"
              role="group"
              aria-labelledby={gameFieldId}
            >
              {GAME_TOKENS.map((token) => (
                <label key={token} className="mod-editor-check">
                  <input
                    type="checkbox"
                    checked={games.has(token)}
                    onChange={(e) => toggleGameToken(token, e.target.checked)}
                  />
                  {token}
                </label>
              ))}
            </div>
          </fieldset>
          {error ? <p className="mod-editor-error">{error}</p> : null}
          <div className="confirm-dialog-actions">
            <button type="button" className="btn secondary" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="btn" disabled={scraping}>
              {mode === 'create' ? 'Add' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
