export interface AppBlockingFlags {
  mods: boolean
  install: boolean
  settings: boolean
  wizard: boolean
}

export const EMPTY_BLOCKING_FLAGS: AppBlockingFlags = {
  mods: false,
  install: false,
  settings: false,
  wizard: false,
}

export function isAppBlocking(flags: AppBlockingFlags): boolean {
  return flags.mods || flags.install || flags.settings || flags.wizard
}

export function projectsBlockedTip(flags: AppBlockingFlags): string {
  if (!isAppBlocking(flags)) return 'Projects'
  return 'Unavailable while a download, install, or backup is in progress'
}

function describeActiveWork(flags: AppBlockingFlags): string {
  const parts: string[] = []
  if (flags.mods) parts.push('mod download or update')
  if (flags.install) parts.push('mod installation or backup operation')
  if (flags.settings || flags.wizard) parts.push('game folder setup or backup')
  if (parts.length === 0) return 'operation'
  if (parts.length === 1) return parts[0]!
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`
}

function describeCaveats(flags: AppBlockingFlags): string {
  const caveats: string[] = []
  if (flags.mods) caveats.push('leave partial mod downloads on disk')
  if (flags.install) {
    caveats.push('interrupt WeiDU and leave your game folder inconsistent')
    caveats.push('corrupt an in-progress snapshot or restore')
  }
  if (flags.settings || flags.wizard) {
    caveats.push('leave an in-progress vanilla backup incomplete')
  }
  if (caveats.length === 0) return 'cause unexpected results'
  if (caveats.length === 1) return caveats[0]!
  if (caveats.length === 2) return `${caveats[0]} or ${caveats[1]}`
  return `${caveats.slice(0, -1).join(', ')}, or ${caveats[caveats.length - 1]}`
}

export function exitConfirmCopy(flags: AppBlockingFlags): {
  title: string
  message: string
} {
  const work = describeActiveWork(flags)
  const caveats = describeCaveats(flags)
  return {
    title: 'Quit while work is in progress?',
    message: `A ${work} is still running. Closing now may ${caveats}. Wait for the operation to finish, or pause the install first if you need to switch projects.`,
  }
}
