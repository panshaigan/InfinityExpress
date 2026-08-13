import { useMemo, useState } from 'react'
import { GAME_FULL_LABELS } from '../../lib/xml/schema'
import {
  deleteProject,
  listProjects,
  type ProjectMeta,
} from '../../lib/projects'
import { ConfirmDialog } from '../ConfirmDialog'

interface Props {
  onOpen: (projectId: string) => void
  onCreateNew: () => void
  onProjectsChanged?: () => void
}

function statusLabel(meta: ProjectMeta): string {
  return GAME_FULL_LABELS[meta.engine]
}

export function ProjectHub({ onOpen, onCreateNew, onProjectsChanged }: Props) {
  const [tick, setTick] = useState(0)
  const projects = useMemo(() => listProjects(), [tick])
  const [pendingDelete, setPendingDelete] = useState<ProjectMeta | null>(null)

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

  return (
    <div className="project-hub">
      <header className="project-hub-header">
        <div>
          <h1 className="project-hub-title">Your projects</h1>
          <p>Select an existing project or create a new one</p>
        </div>
      </header>

      {projects.length === 0 ? (
        <div className="project-hub-empty">
          <p>No projects yet.</p>
          <button type="button" className="btn primary" onClick={onCreateNew}>
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
                  {statusLabel(p)}
                  <span className="project-hub-card-sep">·</span>
                  Created {formatRelative(p.createdAt)}
                </span>
              </button>
              <button
                type="button"
                className="btn secondary project-hub-card-delete"
                onClick={() => setPendingDelete(p)}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
      <div>
        <button type="button" className="btn primary lg" onClick={onCreateNew}>
          New Project
        </button>
      </div>

      <ConfirmDialog
        open={pendingDelete != null}
        title="Delete project?"
        message={
          pendingDelete
            ? `Remove “${pendingDelete.name}” from Infinity Express? Game folders and vanilla backups on disk are kept.`
            : ''
        }
        confirmLabel="Delete project"
        danger
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
      />
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
