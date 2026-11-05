/** Never turn an unreadable/future store into an empty store that can overwrite it. */
export function readSavedStore<T>(
  key: string,
  parse: (value: unknown) => T | null,
  empty: () => T,
): T {
  const raw = window.localStorage.getItem(key)
  if (raw === null) return empty()
  let parsed: T | null
  try {
    parsed = parse(JSON.parse(raw) as unknown)
  } catch {
    throw new Error(`Cannot read saved data (${key}). The original data has been kept. Use a compatible app version or restore a profile backup.`)
  }
  if (parsed === null) {
    throw new Error(`Unsupported saved data (${key}). The original data has been kept. Use a compatible app version or restore a profile backup.`)
  }
  return parsed
}
