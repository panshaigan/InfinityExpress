import type { DifficultyLevel, LadderLevel } from '../lib/levels'
import type { LevelContentCounts } from '../lib/selection/levelCounts'
import type { PresetTileRef } from '../lib/selection/presetPreview'
import type { RecommendedGroup, RecommendedContentCounts } from '../lib/recommended/catalog'
import { IconTip } from './IconTip'
import { LevelSelectStrip } from './LevelSelectStrip'
import { RecommendedSelectStrip } from './RecommendedSelectStrip'

interface Props {
  enabled: boolean
  checkedLadderLevels: ReadonlySet<LadderLevel>
  lowerDifficulty: boolean
  higherDifficulty: boolean
  onLadderToggle: (level: LadderLevel, wantChecked: boolean) => void
  onDifficultyChange: (token: DifficultyLevel, want: boolean) => void
  levelCounts?: Readonly<Record<string, LevelContentCounts>>
  recommendedGroups?: readonly RecommendedGroup[]
  checkedRecommended?: ReadonlySet<string>
  checkedPackages?: ReadonlySet<string>
  onRecommendedToggle?: (token: string, wantChecked: boolean) => void
  onPackageToggle?: (token: string, wantChecked: boolean) => void
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
  checkedLadderLevels,
  lowerDifficulty,
  higherDifficulty,
  onLadderToggle,
  onDifficultyChange,
  levelCounts,
  recommendedGroups = [],
  checkedRecommended = new Set<string>(),
  checkedPackages = new Set<string>(),
  onRecommendedToggle = () => {},
  onPackageToggle = () => {},
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
  return (
    <section className="engine-station presets-station">
      <div className="engine-station-header">
        <h2 className="presets-station-heading">
          <span>Start with a preset</span>
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
        <LevelSelectStrip
          enabled={enabled}
          checkedLadderLevels={checkedLadderLevels}
          lowerDifficulty={lowerDifficulty}
          higherDifficulty={higherDifficulty}
          onLadderToggle={onLadderToggle}
          onDifficultyChange={onDifficultyChange}
          levelCounts={levelCounts}
          onTileFocus={onTileFocus}
          onTileHover={onTileHover}
          isTileFocused={isTileFocused}
        />
        {recommendedGroups.length > 0 ? (
          <>
            <hr className="level-difficulty-rule" />
            <RecommendedSelectStrip
              enabled={enabled}
              groups={recommendedGroups}
              checkedRecommended={checkedRecommended}
              checkedPackages={checkedPackages}
              onRecommendedToggle={onRecommendedToggle}
              onPackageToggle={onPackageToggle}
              contentCounts={recommendedCounts}
              onTileFocus={onTileFocus}
              onTileHover={onTileHover}
              isTileFocused={isTileFocused}
            />
          </>
        ) : null}
      </div>
    </section>
  )
}
