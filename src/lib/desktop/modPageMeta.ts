import { invoke } from '@tauri-apps/api/core'
import { isDesktopApp } from './fsDialogs'
import { readGithubToken } from '../ui/githubTokenPrefs'

export interface ModPageMeta {
  name: string
  readme: string
  author: string
}

/** Fetch display name / readme hints from a mod page. Desktop only. */
export async function scrapeModPageMeta(url: string): Promise<ModPageMeta | null> {
  if (!isDesktopApp()) return null
  const trimmed = url.trim()
  if (!trimmed) return null
  try {
    return await invoke<ModPageMeta>('scrape_mod_page_meta', {
      url: trimmed,
      githubToken: readGithubToken() || null,
    })
  } catch {
    return null
  }
}
