import type {
  RecommendedContentCounts,
  RecommendedGroup,
  ResolvedPresetLayoutSection,
} from '../lib/recommended/catalog'
import {
  resolvePackageTileInfo,
  resolveRecommendedTileInfo,
  type ResolvedPresetTileInfo,
} from '../lib/presets/resolvePresetCopy'
import type { PresetTileRef } from '../lib/selection/presetPreview'
import type { InstallSequenceModel } from '../lib/xml/schema'
import { IconTip } from './IconTip'

interface Props {
  enabled: boolean
  model: InstallSequenceModel
  sections: readonly ResolvedPresetLayoutSection[]
  checkedRecommended: ReadonlySet<string>
  checkedPackages: ReadonlySet<string>
  onRecommendedToggle: (token: string, wantChecked: boolean) => void
  onPackageToggle: (token: string, wantChecked: boolean) => void
  contentCounts?: Readonly<Record<string, RecommendedContentCounts>>
  onTileFocus?: (tile: PresetTileRef) => void
  onTileHover?: (tile: PresetTileRef | null) => void
  isTileFocused?: (tile: PresetTileRef) => boolean
}

function formatCounts(counts: RecommendedContentCounts | undefined): string | null {
  if (!counts) return null
  const modLabel = counts.mods === 1 ? '1 mod' : `${counts.mods} mods`
  const compLabel =
    counts.components === 1 ? '1 component' : `${counts.components} components`
  return `${modLabel} · ${compLabel}`
}

function PresetTile({
  tileRef,
  info,
  countsLabel,
  checked,
  enabled,
  coupled,
  focused,
  onChange,
  onTileFocus,
  onTileHover,
}: {
  tileRef: PresetTileRef
  info: ResolvedPresetTileInfo
  countsLabel?: string | null
  checked: boolean
  enabled: boolean
  coupled?: boolean
  focused?: boolean
  onChange: (wantChecked: boolean) => void
  onTileFocus?: (tile: PresetTileRef) => void
  onTileHover?: (tile: PresetTileRef | null) => void
}) {
  const showTip =
    !!countsLabel || !!info.typeAndDepth.trim() || !!info.recommendedFor.trim()

  return (
    <label
      className={`level-card${coupled ? ' recommended-package-card' : ''}${
        !enabled ? ' disabled' : ''
      }${checked ? ' active' : ''}${focused ? ' tile-focused' : ''}${
        showTip ? ' has-tip' : ''
      }`}
      onPointerEnter={() => onTileHover?.(tileRef)}
      onClick={() => onTileFocus?.(tileRef)}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={!enabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="level-card-copy">
        <span className="level-card-label">{info.label}</span>
        {info.summary ? (
          <span className="level-card-hint">{info.summary}</span>
        ) : null}
      </span>
      {showTip ? (
        <IconTip variant="level-card" hostSelector=".has-tip">
          {countsLabel ? (
            <span className="level-card-tip-section">
              <span className="level-card-tip-heading">In this preset</span>
              <span className="level-card-tip-body">{countsLabel}</span>
            </span>
          ) : null}
          {info.typeAndDepth ? (
            <span className="level-card-tip-section">
              <span className="level-card-tip-heading">Type & Depth of Changes</span>
              <span className="level-card-tip-body">{info.typeAndDepth}</span>
            </span>
          ) : null}
          {info.recommendedFor ? (
            <span className="level-card-tip-section">
              <span className="level-card-tip-heading">Who It&apos;s Recommended For</span>
              <span className="level-card-tip-body">{info.recommendedFor}</span>
            </span>
          ) : null}
        </IconTip>
      ) : null}
    </label>
  )
}

function RecommendedGroupBlock({
  model,
  group,
  enabled,
  checkedRecommended,
  checkedPackages,
  contentCounts,
  onRecommendedToggle,
  onPackageToggle,
  onTileFocus,
  onTileHover,
  isTileFocused,
}: {
  model: InstallSequenceModel
  group: RecommendedGroup
  enabled: boolean
  checkedRecommended: ReadonlySet<string>
  checkedPackages: ReadonlySet<string>
  contentCounts?: Readonly<Record<string, RecommendedContentCounts>>
  onRecommendedToggle: (token: string, wantChecked: boolean) => void
  onPackageToggle: (token: string, wantChecked: boolean) => void
  onTileFocus?: (tile: PresetTileRef) => void
  onTileHover?: (tile: PresetTileRef | null) => void
  isTileFocused?: (tile: PresetTileRef) => boolean
}) {
  const baseTile: PresetTileRef = { kind: 'recommended', token: group.token }
  const info = resolveRecommendedTileInfo(group.token)

  return (
    <div className="recommended-group">
      {group.hasBase ? (
        <PresetTile
          tileRef={baseTile}
          info={info}
          countsLabel={formatCounts(contentCounts?.[group.token])}
          checked={checkedRecommended.has(group.token)}
          enabled={enabled}
          focused={isTileFocused?.(baseTile)}
          onChange={(want) => onRecommendedToggle(group.token, want)}
          onTileFocus={onTileFocus}
          onTileHover={onTileHover}
        />
      ) : null}
      {group.packages.length > 0 ? (
        <div
          className="recommended-package-row"
          role="group"
          aria-label={`${info.label} packages`}
        >
          {group.packages.map((pkg) => {
            const pkgTile: PresetTileRef = { kind: 'package', token: pkg.token }
            return (
              <PresetTile
                key={pkg.token}
                tileRef={pkgTile}
                info={resolvePackageTileInfo(pkg.token, model)}
                countsLabel={formatCounts(contentCounts?.[`package:${pkg.token}`])}
                checked={checkedPackages.has(pkg.token)}
                enabled={enabled}
                coupled
                focused={isTileFocused?.(pkgTile)}
                onChange={(want) => onPackageToggle(pkg.token, want)}
                onTileFocus={onTileFocus}
                onTileHover={onTileHover}
              />
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

export function PresetLayoutStrip({
  enabled,
  model,
  sections,
  checkedRecommended,
  checkedPackages,
  onRecommendedToggle,
  onPackageToggle,
  contentCounts,
  onTileFocus,
  onTileHover,
  isTileFocused,
}: Props) {
  if (sections.length === 0) return null

  return (
    <div
      className={`preset-layout${!enabled ? ' disabled' : ''}`}
      aria-label="Start with a preset"
      onPointerLeave={() => onTileHover?.(null)}
    >
      {sections.map((section) => (
        <section key={section.label} className="preset-layout-section">
          <h3 className="preset-layout-section-title">{section.label}</h3>
          <div className="preset-layout-section-body">
            {section.rows.map((row, rowIndex) => (
              <div
                key={`${section.label}-${rowIndex}`}
                className="preset-layout-row"
                style={{
                  gridTemplateColumns: `repeat(${row.cells.length}, minmax(0, 1fr))`,
                }}
              >
                {row.cells.map(({ token, group }) => (
                  <RecommendedGroupBlock
                    key={token}
                    model={model}
                    group={group}
                    enabled={enabled}
                    checkedRecommended={checkedRecommended}
                    checkedPackages={checkedPackages}
                    contentCounts={contentCounts}
                    onRecommendedToggle={onRecommendedToggle}
                    onPackageToggle={onPackageToggle}
                    onTileFocus={onTileFocus}
                    onTileHover={onTileHover}
                    isTileFocused={isTileFocused}
                  />
                ))}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
