import type { PresetGroup } from '../../data/presetCatalog'
import { resolvePackageTileInfo, resolveRecommendedTileInfo } from '../presets/resolvePresetCopy'
import type { InstallSequenceModel } from '../xml/schema'
import { catalogGroupByToken, type RecommendedGroup } from './catalog'

export type PresetGroupCheckState = 'checked' | 'unchecked' | 'indeterminate'

export interface PresetGroupMemberRef {
  kind: 'recommended' | 'package'
  token: string
  label: string
}

export interface ResolvedPresetGroup {
  id: string
  label: string
  members: PresetGroupMemberRef[]
  checkState: PresetGroupCheckState
}

function packageExists(
  groups: readonly RecommendedGroup[],
  token: string,
): boolean {
  return groups.some((g) => g.packages.some((pkg) => pkg.token === token))
}

function pushUnique(
  members: PresetGroupMemberRef[],
  seen: Set<string>,
  member: PresetGroupMemberRef,
): void {
  const key = `${member.kind}:${member.token}`
  if (seen.has(key)) return
  seen.add(key)
  members.push(member)
}

function expandGroupMembers(
  group: PresetGroup,
  catalog: readonly RecommendedGroup[],
  model: InstallSequenceModel,
): PresetGroupMemberRef[] {
  const byToken = catalogGroupByToken(catalog)
  const members: PresetGroupMemberRef[] = []
  const seen = new Set<string>()

  for (const include of group.include) {
    if (typeof include === 'string') {
      const rec = byToken.get(include)
      if (!rec?.hasBase) continue
      pushUnique(members, seen, {
        kind: 'recommended',
        token: include,
        label: resolveRecommendedTileInfo(include).label,
      })
      continue
    }

    if ('package' in include) {
      if (!packageExists(catalog, include.package)) continue
      pushUnique(members, seen, {
        kind: 'package',
        token: include.package,
        label: resolvePackageTileInfo(include.package, model).label,
      })
      continue
    }

    const rec = byToken.get(include.token)
    if (!rec) continue

    if (include.packages !== 'only' && rec.hasBase) {
      pushUnique(members, seen, {
        kind: 'recommended',
        token: rec.token,
        label: resolveRecommendedTileInfo(rec.token).label,
      })
    }

    if (include.packages === true || include.packages === 'only') {
      for (const pkg of rec.packages) {
        pushUnique(members, seen, {
          kind: 'package',
          token: pkg.token,
          label: resolvePackageTileInfo(pkg.token, model).label,
        })
      }
    }
  }

  return members
}

export function presetGroupCheckState(
  members: readonly PresetGroupMemberRef[],
  checkedRecommended: ReadonlySet<string>,
  checkedPackages: ReadonlySet<string>,
): PresetGroupCheckState {
  let on = 0
  for (const member of members) {
    const checked =
      member.kind === 'recommended'
        ? checkedRecommended.has(member.token)
        : checkedPackages.has(member.token)
    if (checked) on += 1
  }
  if (on === 0) return 'unchecked'
  if (on === members.length) return 'checked'
  return 'indeterminate'
}

/** Expand catalog groups against live tiles; omit groups with no eligible members. */
export function resolvePresetGroups(
  groups: readonly PresetGroup[],
  catalog: readonly RecommendedGroup[],
  model: InstallSequenceModel,
  checkedRecommended: ReadonlySet<string>,
  checkedPackages: ReadonlySet<string>,
): ResolvedPresetGroup[] {
  const out: ResolvedPresetGroup[] = []
  for (const group of groups) {
    const members = expandGroupMembers(group, catalog, model)
    if (members.length === 0) continue
    out.push({
      id: group.id,
      label: group.label,
      members,
      checkState: presetGroupCheckState(members, checkedRecommended, checkedPackages),
    })
  }
  return out
}

export function splitPresetGroupMembers(members: readonly PresetGroupMemberRef[]): {
  recommended: string[]
  packages: string[]
} {
  const recommended: string[] = []
  const packages: string[] = []
  for (const member of members) {
    if (member.kind === 'recommended') recommended.push(member.token)
    else packages.push(member.token)
  }
  return { recommended, packages }
}

export function applyPresetGroupToCheckedSets(
  checkedRecommended: ReadonlySet<string>,
  checkedPackages: ReadonlySet<string>,
  recommended: readonly string[],
  packages: readonly string[],
  wantChecked: boolean,
): { recommended: Set<string>; packages: Set<string> } {
  const nextRecommended = new Set(checkedRecommended)
  const nextPackages = new Set(checkedPackages)
  for (const token of recommended) {
    if (wantChecked) nextRecommended.add(token)
    else nextRecommended.delete(token)
  }
  for (const token of packages) {
    if (wantChecked) nextPackages.add(token)
    else nextPackages.delete(token)
  }
  return { recommended: nextRecommended, packages: nextPackages }
}
