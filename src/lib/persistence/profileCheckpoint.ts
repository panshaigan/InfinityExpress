import { invoke } from '@tauri-apps/api/core'
import { isDesktopApp } from '../desktop/fsDialogs'
import { APP_VERSION } from '../appVersion'
import { contentRevision, prepareCatalogSnapshot } from './catalogSnapshots'
import xml from '../../data/InstallSequence.xml?raw'
import csv from '../../data/mods.csv?raw'

const RELEASE_KEY = 'infinity-express.profile-release-v1'

export function profileEntries(): Record<string, string> {
  const entries: Record<string, string> = {}
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index)
    if (key?.startsWith('infinity-express.')) entries[key] = localStorage.getItem(key)!
  }
  return entries
}

/** Desktop backups are outside the install directory, written before any migration. */
export async function createProfileCheckpoint(reason: 'release' | 'update' | 'recovery'): Promise<string | null> {
  if (!isDesktopApp()) return null
  return invoke<string>('create_profile_checkpoint', {
    snapshot: JSON.stringify({
      version: 1,
      appVersion: APP_VERSION,
      createdAt: new Date().toISOString(),
      reason,
      entries: profileEntries(),
      // Retain the incoming bundled sources as well as all previously pinned XMLs.
      installSequenceXml: xml,
      modsCsv: csv,
    }),
  })
}

export async function prepareSavedProfile(): Promise<void> {
  const release = await contentRevision(JSON.stringify([APP_VERSION, xml, csv]))
  if (localStorage.getItem(RELEASE_KEY) !== release) {
    await createProfileCheckpoint('release')
    // Commit the marker only after the immutable catalog is safely stored too.
    await prepareCatalogSnapshot(xml)
    localStorage.setItem(RELEASE_KEY, release)
  } else {
    await prepareCatalogSnapshot(xml)
  }
}
