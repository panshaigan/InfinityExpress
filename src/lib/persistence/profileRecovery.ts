import { invoke } from '@tauri-apps/api/core'
import { contentRevision } from './catalogSnapshots'
import { createProfileCheckpoint, profileEntries } from './profileCheckpoint'

export interface ProfileRecovery {
  version: 1
  appVersion: string
  createdAt: string
  entries: Record<string, string>
  catalogs: Record<string, string>
}

export async function parseProfileRecovery(text: string): Promise<ProfileRecovery> {
  const value = JSON.parse(text) as ProfileRecovery
  if (value?.version !== 1 || typeof value.appVersion !== 'string' || typeof value.createdAt !== 'string' ||
    !value.entries || typeof value.entries !== 'object' || Array.isArray(value.entries) ||
    !value.catalogs || typeof value.catalogs !== 'object' || Array.isArray(value.catalogs)) {
    throw new Error('This file is not a supported profile backup.')
  }
  if (Object.entries(value.entries).some(([key, entry]) => !key.startsWith('infinity-express.') || typeof entry !== 'string')) {
    throw new Error('The profile backup contains invalid settings.')
  }
  for (const [revision, xml] of Object.entries(value.catalogs)) {
    if (!/^[a-f0-9]{64}$/.test(revision) || typeof xml !== 'string' || await contentRevision(xml) !== revision) {
      throw new Error('The profile backup contains a damaged component catalog.')
    }
  }
  const projects = value.entries['infinity-express.projects-v1']
  if (projects) {
    const index = JSON.parse(projects) as { projects?: Record<string, { catalogRevision?: string }> }
    for (const record of Object.values(index.projects ?? {})) {
      if (record.catalogRevision && !Object.hasOwn(value.catalogs, record.catalogRevision)) {
        throw new Error('The profile backup is missing a project component catalog.')
      }
    }
  }
  return value
}

function replaceEntries(entries: Record<string, string>): void {
  for (const key of Object.keys(profileEntries())) localStorage.removeItem(key)
  for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value)
}

/** Only call before App mounts, so live session unload handlers cannot overwrite recovery. */
export async function restoreProfileRecovery(backup: ProfileRecovery): Promise<void> {
  // Revalidate even if a caller mutated the preview object after it was selected.
  const verified = await parseProfileRecovery(JSON.stringify(backup))
  await createProfileCheckpoint('recovery')
  for (const [revision, xml] of Object.entries(verified.catalogs)) {
    await invoke('restore_catalog_snapshot', { revision, xml })
  }
  const previous = profileEntries()
  try {
    replaceEntries(verified.entries)
  } catch (error) {
    replaceEntries(previous)
    throw error
  }
}
