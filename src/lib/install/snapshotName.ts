function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** Default snapshot name: snapshot-{Ymd-His} in local time. */
export function defaultSnapshotName(now = new Date()): string {
  return `snapshot-${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}-${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`
}
