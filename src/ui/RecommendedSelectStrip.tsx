import type {
  RecommendedContentCounts,
  RecommendedGroup,
} from '../lib/recommended/catalog'
import { IconTip } from './IconTip'

interface Props {
  enabled: boolean
  groups: readonly RecommendedGroup[]
  checkedRecommended: ReadonlySet<string>
  checkedPackages: ReadonlySet<string>
  onRecommendedToggle: (token: string, wantChecked: boolean) => void
  onPackageToggle: (token: string, wantChecked: boolean) => void
  contentCounts?: Readonly<Record<string, RecommendedContentCounts>>
}

function formatCounts(counts: RecommendedContentCounts | undefined): string | null {
  if (!counts) return null
  const modLabel = counts.mods === 1 ? '1 mod' : `${counts.mods} mods`
  const compLabel =
    counts.components === 1 ? '1 component' : `${counts.components} components`
  return `${modLabel} · ${compLabel}`
}

function PresetTile({
  label,
  hint,
  countsLabel,
  checked,
  enabled,
  coupled,
  onChange,
}: {
  label: string
  hint?: string
  countsLabel?: string | null
  checked: boolean
  enabled: boolean
  coupled?: boolean
  onChange: (wantChecked: boolean) => void
}) {
  const showTip = !!countsLabel
  return (
    <label
      className={`level-card${coupled ? ' recommended-package-card' : ''}${
        !enabled ? ' disabled' : ''
      }${checked ? ' active' : ''}${showTip ? ' has-tip' : ''}`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={!enabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="level-card-copy">
        <span className="level-card-label">{label}</span>
        {hint ? <span className="level-card-hint">{hint}</span> : null}
      </span>
      {showTip && countsLabel ? (
        <IconTip variant="level-card" hostSelector=".has-tip">
          <span className="level-card-tip-section">
            <span className="level-card-tip-heading">In this preset</span>
            <span className="level-card-tip-body">{countsLabel}</span>
          </span>
        </IconTip>
      ) : null}
    </label>
  )
}

export function RecommendedSelectStrip({
  enabled,
  groups,
  checkedRecommended,
  checkedPackages,
  onRecommendedToggle,
  onPackageToggle,
  contentCounts,
}: Props) {
  if (groups.length === 0) return null

  return (
    <div
      className={`recommended-preselect${!enabled ? ' disabled' : ''}`}
      aria-label="Recommended categories"
    >
      <div className="recommended-preselect-grid">
        {groups.map((group) => (
          <div key={group.token} className="recommended-group">
            <PresetTile
              label={group.label}
              countsLabel={formatCounts(contentCounts?.[group.token])}
              checked={checkedRecommended.has(group.token)}
              enabled={enabled}
              onChange={(want) => onRecommendedToggle(group.token, want)}
            />
            {group.packages.length > 0 ? (
              <div
                className="recommended-package-row"
                role="group"
                aria-label={`${group.label} packages`}
              >
                {group.packages.map((pkg) => (
                  <PresetTile
                    key={pkg.token}
                    label={pkg.label}
                    countsLabel={formatCounts(contentCounts?.[`package:${pkg.token}`])}
                    checked={checkedPackages.has(pkg.token)}
                    enabled={enabled}
                    coupled
                    onChange={(want) => onPackageToggle(pkg.token, want)}
                  />
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}
