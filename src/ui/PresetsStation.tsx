import { PRESET_LAYOUT } from '../data/presetCatalog'
import type { RecommendedContentCounts, RecommendedGroup } from '../lib/recommended/catalog'
import { resolvePresetLayout } from '../lib/recommended/catalog'
import type { InstallSequenceModel } from '../lib/xml/schema'
import type { PresetTileRef } from '../lib/selection/presetPreview'
import { IconTip } from './IconTip'
import { PresetLayoutStrip } from './PresetLayoutStrip'

interface Props {
  enabled: boolean
  model: InstallSequenceModel
  recommendedGroups: readonly RecommendedGroup[]
  checkedRecommended: ReadonlySet<string>
  checkedPackages: ReadonlySet<string>
  onRecommendedToggle: (token: string, wantChecked: boolean) => void
  onPackageToggle: (token: string, wantChecked: boolean) => void
  recommendedCounts?: Readonly<Record<string, RecommendedContentCounts>>
  onTileFocus?: (tile: PresetTileRef) => void
  onTileHover?: (tile: PresetTileRef | null) => void
  isTileFocused?: (tile: PresetTileRef) => boolean
  finished: boolean
  canContinue: boolean
  onContinue: () => void
  onReopen: () => void
  reopenDisabled?: boolean
}

export function PresetsStation({
  enabled,
  model,
  recommendedGroups,
  checkedRecommended,
  checkedPackages,
  onRecommendedToggle,
  onPackageToggle,
  recommendedCounts,
  onTileFocus,
  onTileHover,
  isTileFocused,
  finished,
  canContinue,
  onContinue,
  onReopen,
  reopenDisabled = false,
}: Props) {
  const layoutSections = resolvePresetLayout(PRESET_LAYOUT, recommendedGroups)

  return (
    <section className="engine-station presets-station">
      <div className="engine-station-header">
        <h2 className="presets-station-heading">
          <span>Compose your starting preset</span>
          {finished ? (
            <span className="station-finished-mark" aria-label="Finished">
              ✓
            </span>
          ) : null}
        </h2>
        {finished ? (
          <span className="has-icon-tip">
            <button
              type="button"
              className="btn engine-start-btn"
              disabled={reopenDisabled}
              onClick={onReopen}
            >
              Reopen
            </button>
            <IconTip>
              {reopenDisabled
                ? 'Cannot reopen while install is running'
                : 'Mark this stop unfinished again'}
            </IconTip>
          </span>
        ) : (
          <span className="has-icon-tip">
            <button
              type="button"
              className="btn engine-start-btn"
              disabled={!canContinue}
              onClick={onContinue}
            >
              Continue
            </button>
            <IconTip>Start selecting components</IconTip>
          </span>
        )}
      </div>
      <div className="engine-preselect">
        <PresetLayoutStrip
          enabled={enabled}
          model={model}
          sections={layoutSections}
          checkedRecommended={checkedRecommended}
          checkedPackages={checkedPackages}
          onRecommendedToggle={onRecommendedToggle}
          onPackageToggle={onPackageToggle}
          contentCounts={recommendedCounts}
          onTileFocus={onTileFocus}
          onTileHover={onTileHover}
          isTileFocused={isTileFocused}
        />
      </div>
    </section>
  )
}
