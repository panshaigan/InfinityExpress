import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { GAME_FULL_LABELS, GAME_LABELS } from '../../lib/xml/schema'
import {
  deleteProject,
  listProjects,
  updateProjectMeta,
  type ProjectMeta,
} from '../../lib/projects'
import { ConfirmDialog } from '../ConfirmDialog'
import { OutlinedTextField } from '../OutlinedTextField'
import { useBackdropDismiss } from '../backdropDismiss'

interface Props {
  onOpen: (projectId: string) => void
  onCreateNew: () => void
  onProjectsChanged?: () => void
}

function statusLabel(meta: ProjectMeta): string {
  return GAME_FULL_LABELS[meta.engine]
}

function PlusIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      aria-hidden="true"
      fill="currentColor"
    >
      <path d="M8 2a.75.75 0 0 1 .75.75v4.5h4.5a.75.75 0 0 1 0 1.5h-4.5v4.5a.75.75 0 0 1-1.5 0v-4.5h-4.5a.75.75 0 0 1 0-1.5h4.5v-4.5A.75.75 0 0 1 8 2Z" />
    </svg>
  )
}

export function ProjectHub({ onOpen, onCreateNew, onProjectsChanged }: Props) {
  const [tick, setTick] = useState(0)
  const projects = useMemo(() => listProjects(), [tick])
  const [pendingDelete, setPendingDelete] = useState<ProjectMeta | null>(null)
  const [pendingRename, setPendingRename] = useState<ProjectMeta | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)

  function refresh() {
    setTick((n) => n + 1)
    onProjectsChanged?.()
  }

  function confirmDelete() {
    if (!pendingDelete) return
    deleteProject(pendingDelete.id)
    setPendingDelete(null)
    refresh()
  }

  function openRename(project: ProjectMeta) {
    setPendingRename(project)
    setRenameDraft(project.name)
    setMenuOpenId(null)
  }

  function confirmRename() {
    if (!pendingRename) return
    const next = renameDraft.trim()
    if (!next || next === pendingRename.name) {
      setPendingRename(null)
      return
    }
    updateProjectMeta(pendingRename.id, { name: next })
    setPendingRename(null)
    refresh()
  }

  return (
    <div className="project-hub">
      <header className="project-hub-header">
        <div className="project-hub-hero">
          <h1 className="project-hub-app-title">iNfinity eXpress</h1>
          <p className="project-hub-motto">
            Infinity Engine Integrated Modding Environment
          </p>
        </div>
      </header>

      <div className="project-hub-section">
        <div className="project-hub-section-head">
          <div className="project-hub-section-intro">
            <h2 className="project-hub-title">Your projects</h2>
            <p className="project-hub-lede">
              Select an existing project or create a new one
            </p>
          </div>
          {projects.length > 0 ? (
            <button type="button" className="btn lg project-hub-new-btn" onClick={onCreateNew}>
              <PlusIcon />
              New Project
            </button>
          ) : null}
        </div>

        {projects.length === 0 ? (
          <div className="project-hub-empty-panel">
            <p>No projects yet.</p>
            <button type="button" className="btn" onClick={onCreateNew}>
              Create your first project
            </button>
          </div>
        ) : (
          <ul className="project-hub-list">
            {projects.map((p) => (
              <li key={p.id} className="project-hub-card">
                <button
                  type="button"
                  className="project-hub-card-main"
                  onClick={() => onOpen(p.id)}
                >
                  <span className="project-hub-card-name">{p.name}</span>
                  <span className="project-hub-card-meta">
                    <span className="project-hub-card-engine">{GAME_LABELS[p.engine]}</span>
                    <span className="project-hub-card-sep">·</span>
                    {statusLabel(p)}
                    <span className="project-hub-card-sep">·</span>
                    Created {formatRelative(p.createdAt)}
                  </span>
                </button>
                <ProjectCardMenu
                  open={menuOpenId === p.id}
                  onOpenChange={(open) => setMenuOpenId(open ? p.id : null)}
                  projectName={p.name}
                  onRename={() => openRename(p)}
                  onRemove={() => {
                    setMenuOpenId(null)
                    setPendingDelete(p)
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={pendingDelete != null}
        title="Remove project?"
        message={
          pendingDelete
            ? `Remove “${pendingDelete.name}” from iNfinity eXpress? Game folders and vanilla backups on disk are kept.`
            : ''
        }
        confirmLabel="Remove project"
        danger
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
      />

      <RenameProjectDialog
        open={pendingRename != null}
        name={renameDraft}
        onChange={setRenameDraft}
        onCancel={() => setPendingRename(null)}
        onConfirm={confirmRename}
      />
    </div>
  )
}

function ProjectCardMenu({
  open,
  onOpenChange,
  projectName,
  onRename,
  onRemove,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectName: string
  onRename: () => void
  onRemove: () => void
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({})

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    setMenuStyle({
      top: rect.bottom + 5,
      right: window.innerWidth - rect.right,
    })
  }, [open])

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        onOpenChange(false)
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onOpenChange(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onOpenChange])

  return (
    <div ref={rootRef} className="project-hub-card-menu">
      <button
        ref={triggerRef}
        type="button"
        className={`project-hub-menu-trigger${open ? ' open' : ''}`}
        aria-label={`Actions for ${projectName}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => onOpenChange(!open)}
      >
        <span aria-hidden="true">⋮</span>
      </button>
      {open
        ? createPortal(
            <div
              ref={menuRef}
              id={menuId}
              className="project-hub-menu project-hub-menu-portal"
              role="menu"
              aria-label={`Actions for ${projectName}`}
              style={menuStyle}
            >
              <button
                type="button"
                role="menuitem"
                className="project-hub-menu-item"
                onClick={onRename}
              >
                Rename
              </button>
              <button
                type="button"
                role="menuitem"
                className="project-hub-menu-item danger"
                onClick={onRemove}
              >
                Remove
              </button>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}

function RenameProjectDialog({
  open,
  name,
  onChange,
  onCancel,
  onConfirm,
}: {
  open: boolean
  name: string
  onChange: (value: string) => void
  onCancel: () => void
  onConfirm: () => void
}) {
  const backdrop = useBackdropDismiss(onCancel)
  const canSave = name.trim().length > 0

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

  return (
    <div
      className="confirm-dialog-backdrop"
      role="presentation"
      {...backdrop}
    >
      <div
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rename-project-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="confirm-dialog-header">
          <h2 id="rename-project-dialog-title">Rename project</h2>
        </div>
        <div className="project-hub-rename-field">
          <OutlinedTextField
            label="Name"
            value={name}
            onChange={onChange}
            autoFocus
            required
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                if (canSave) onConfirm()
              }
            }}
          />
        </div>
        <div className="confirm-dialog-actions">
          <button type="button" className="btn secondary" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn"
            disabled={!canSave}
            onClick={onConfirm}
          >
            Rename
          </button>
        </div>
      </div>
    </div>
  )
}

function formatRelative(iso: string): string {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return '—'
  const diff = Date.now() - t
  const mins = Math.round(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 48) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return `${days}d ago`
}
