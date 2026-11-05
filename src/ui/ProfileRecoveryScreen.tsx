import { useState } from 'react'
import { isDesktopApp, pickFile, readOptionalTextFile } from '../lib/desktop/fsDialogs'
import { parseProfileRecovery, restoreProfileRecovery, type ProfileRecovery } from '../lib/persistence/profileRecovery'
import { ConfirmDialog } from './ConfirmDialog'

export function ProfileRecoveryScreen({ error }: { error: unknown }) {
  const [backup, setBackup] = useState<ProfileRecovery | null>(null)
  const [busy, setBusy] = useState(false)
  const [recoveryError, setRecoveryError] = useState('')

  async function chooseBackup() {
    try {
      setRecoveryError('')
      const path = await pickFile('Choose an iNfinity eXpress profile backup')
      if (!path) return
      const text = await readOptionalTextFile(path)
      if (text === null) throw new Error('The selected backup is missing.')
      setBackup(await parseProfileRecovery(text))
    } catch (error) {
      setRecoveryError(String(error))
    }
  }

  async function restore() {
    if (!backup || busy) return
    setBusy(true)
    try {
      await restoreProfileRecovery(backup)
      window.location.reload()
    } catch (error) {
      setRecoveryError(String(error))
      setBusy(false)
      setBackup(null)
    }
  }

  return (
    <main className="project-hub">
      <h1>Saved data needs attention</h1>
      <p role="alert">{String(error)}</p>
      <p>Startup stopped before opening projects. Your saved data has been kept.</p>
      <p>Desktop recovery copies are in the app data folder under <code>profile-backups</code>.</p>
      {isDesktopApp() ? (
        <button className="btn" disabled={busy} onClick={() => void chooseBackup()}>Choose profile backup</button>
      ) : null}
      {recoveryError ? <p role="alert">{recoveryError}</p> : null}
      <ConfirmDialog
        open={backup !== null && !busy}
        title="Restore profile backup?"
        message={`Replace settings and projects with the backup from ${backup?.createdAt ?? ''} (v${backup?.appVersion ?? ''})? A recovery copy of the current profile will be saved first. Game folders and install logs stay on disk.`}
        confirmLabel="Restore profile"
        danger
        onConfirm={() => void restore()}
        onCancel={() => setBackup(null)}
      />
      {busy ? <p role="status">Restoring profile…</p> : null}
    </main>
  )
}
