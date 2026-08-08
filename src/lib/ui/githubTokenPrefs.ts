const STORAGE_KEY = 'infinity-express.github-token'

/** Optional GitHub PAT for higher API rate limits (localStorage only). */
export function readGithubToken(): string {
  try {
    return (window.localStorage.getItem(STORAGE_KEY) ?? '').trim()
  } catch {
    return ''
  }
}

export function writeGithubToken(token: string): void {
  try {
    const trimmed = token.trim()
    if (!trimmed) window.localStorage.removeItem(STORAGE_KEY)
    else window.localStorage.setItem(STORAGE_KEY, trimmed)
  } catch {
    /* private mode / blocked storage */
  }
}

export const GITHUB_TOKEN_HELP_URL =
  'https://github.com/settings/tokens/new?scopes=public_repo&description=InfinityExpress'
