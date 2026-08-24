import { useEffect, useMemo, useRef } from 'react'
import { PRESET_GROUPS } from '../data/presetCatalog'
import type { RecommendedGroup } from '../lib/recommended/catalog'
import {
  resolvePresetGroups,
  splitPresetGroupMembers,
  type ResolvedPresetGroup,
} from '../lib/recommended/presetGroups'
import type { InstallSequenceModel } from '../lib/xml/schema'
import { IconTip } from './IconTip'

interface Props {
  enabled: boolean
  model: InstallSequenceModel
  recommendedGroups: readonly RecommendedGroup[]
  checkedRecommended: ReadonlySet<string>
  checkedPackages: ReadonlySet<string>
  onPresetGroupToggle: (
    recommended: readonly string[],
    packages: readonly string[],
    wantChecked: boolean,
  ) => void
}

function GroupCheckbox({
  group,
  enabled,
  onToggle,
}: {
  group: ResolvedPresetGroup
  enabled: boolean
  onToggle: (wantChecked: boolean) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = group.checkState === 'indeterminate'
    }
  }, [group.checkState])

  const tip = group.members.map((m) => m.label).join(', ')

  return (
    <label className={`preset-group-check has-icon-tip${!enabled ? ' disabled' : ''}`}>
      <input
        ref={inputRef}
        type="checkbox"
        checked={group.checkState === 'checked'}
        disabled={!enabled}
        onChange={(e) => onToggle(e.target.checked)}
      />
      <span className="preset-group-check-label">{group.label}</span>
      <IconTip>{tip}</IconTip>
    </label>
  )
}

export function PresetGroupChecks({
  enabled,
  model,
  recommendedGroups,
  checkedRecommended,
  checkedPackages,
  onPresetGroupToggle,
}: Props) {
  const groups = useMemo(
    () =>
      resolvePresetGroups(
        PRESET_GROUPS,
        recommendedGroups,
        model,
        checkedRecommended,
        checkedPackages,
      ),
    [recommendedGroups, model, checkedRecommended, checkedPackages],
  )

  if (groups.length === 0) return null

  return (
    <div className="preset-group-checks" role="group" aria-label="Starting preset groups">
      {groups.map((group) => {
        const { recommended, packages } = splitPresetGroupMembers(group.members)
        return (
          <GroupCheckbox
            key={group.id}
            group={group}
            enabled={enabled}
            onToggle={(want) => onPresetGroupToggle(recommended, packages, want)}
          />
        )
      })}
    </div>
  )
}
