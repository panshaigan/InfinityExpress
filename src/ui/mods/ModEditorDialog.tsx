import { useEffect, useId, useState, type FormEvent } from 'react'
import type { ModInfo } from '../../lib/mods/loadMods'
import type { UserModInput } from '../../lib/mods/userCatalog'

export type ModEditorMode = 'create' | 'edit'

interface Props {
  open: boolean
  mode: ModEditorMode
  initial: Partial<ModInfo> | null
  existingCodenames: ReadonlySet<string>
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
  release: '',
  version: '',
  sizeBytes: null,
  author: '',
  type: '',
  stability: '',
}

function toForm(initial: Partial<ModInfo> | null): UserModInput {
  if (!initial) return { ...EMPTY }
  return {
    codename: initial.codename ?? '',
    name: initial.name ?? '',
    abbreviation: initial.abbreviation ?? '',
    category: initial.category ?? '',
    url: initial.url ?? '',
    readme: initial.readme ?? '',
    game: initial.game ?? '',
    release: initial.release ?? '',
    version: initial.version ?? '',
    sizeBytes: initial.sizeBytes ?? null,
    author: initial.author ?? '',
    type: initial.type ?? '',
    stability: initial.stability ?? '',
  }
}

export function ModEditorDialog({
  open,
  mode,
  initial,
  existingCodenames,
  onSave,
  onCancel,
}: Props) {
  const titleId = useId()
  const [form, setForm] = useState<UserModInput>(() => toForm(initial))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setForm(toForm(initial))
    setError(null)
  }, [open, initial])

  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onCancel])

  if (!open) return null

  function setField<K extends keyof UserModInput>(key: K, value: UserModInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const code = form.codename.trim()
    if (!code) {
      setError('Codename is required')
      return
    }
    const original = initial?.codename ?? ''
    if (
      (mode === 'create' || code !== original) &&
      existingCodenames.has(code)
    ) {
      setError(`Codename "${code}" already exists`)
      return
    }
    setError(null)
    onSave({
      ...form,
      codename: code,
      sizeBytes:
        form.sizeBytes != null && Number.isFinite(form.sizeBytes)
          ? Math.floor(form.sizeBytes)
          : null,
    })
  }

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
        <div className="confirm-dialog-header">
          <h2 id={titleId}>{mode === 'create' ? 'Add mod' : 'Edit mod'}</h2>
        </div>
        <form className="mod-editor-form" onSubmit={handleSubmit}>
          <label>
            <span>Codename</span>
            <input
              value={form.codename}
              onChange={(e) => setField('codename', e.target.value)}
              required
              autoFocus
            />
          </label>
          <label>
            <span>Name</span>
            <input
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
            />
          </label>
          <label>
            <span>Abbreviation</span>
            <input
              value={form.abbreviation}
              onChange={(e) => setField('abbreviation', e.target.value)}
            />
          </label>
          <label>
            <span>Category</span>
            <input
              value={form.category}
              onChange={(e) => setField('category', e.target.value)}
            />
          </label>
          <label>
            <span>Game</span>
            <input
              value={form.game}
              onChange={(e) => setField('game', e.target.value)}
            />
          </label>
          <label>
            <span>URL</span>
            <input
              value={form.url}
              onChange={(e) => setField('url', e.target.value)}
            />
          </label>
          <label>
            <span>Readme</span>
            <input
              value={form.readme}
              onChange={(e) => setField('readme', e.target.value)}
            />
          </label>
          <label>
            <span>Author</span>
            <input
              value={form.author}
              onChange={(e) => setField('author', e.target.value)}
            />
          </label>
          <label>
            <span>Release</span>
            <input
              value={form.release}
              onChange={(e) => setField('release', e.target.value)}
            />
          </label>
          <label>
            <span>Version</span>
            <input
              value={form.version}
              onChange={(e) => setField('version', e.target.value)}
            />
          </label>
          <label>
            <span>Size (bytes)</span>
            <input
              type="number"
              min={0}
              value={form.sizeBytes ?? ''}
              onChange={(e) => {
                const v = e.target.value
                setField('sizeBytes', v === '' ? null : Number(v))
              }}
            />
          </label>
          <label>
            <span>Type</span>
            <input
              value={form.type}
              onChange={(e) => setField('type', e.target.value)}
            />
          </label>
          <label>
            <span>Stability</span>
            <input
              value={form.stability}
              onChange={(e) => setField('stability', e.target.value)}
            />
          </label>
          {error ? <p className="mod-editor-error">{error}</p> : null}
          <div className="confirm-dialog-actions">
            <button type="button" className="btn secondary" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="btn">
              {mode === 'create' ? 'Add' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
