import type { DisplayNode } from '../lib/selection/visibility'

function branchLabel(display: DisplayNode): string {
  return display.node.attrs.label ?? display.node.tag
}

interface Props {
  mainBranches: DisplayNode[]
  subBranches: DisplayNode[]
  mainKey: string | null
  subKey: string | null
  onSelectMain: (key: string) => void
  onSelectSub: (key: string) => void
}

export function ContentBranchNav({
  mainBranches,
  subBranches,
  mainKey,
  subKey,
  onSelectMain,
  onSelectSub,
}: Props) {
  if (mainBranches.length === 0) return null

  return (
    <div className="branch-nav">
      <div className="branch-nav-row" role="tablist" aria-label="Content main branches">
        {mainBranches.map((branch) => (
          <button
            key={branch.node.key}
            type="button"
            role="tab"
            aria-selected={mainKey === branch.node.key}
            className={mainKey === branch.node.key ? 'active' : ''}
            onClick={() => onSelectMain(branch.node.key)}
          >
            {branchLabel(branch)}
          </button>
        ))}
      </div>
      {subBranches.length > 0 && (
        <div className="branch-nav-row" role="tablist" aria-label="Content subbranches">
          {subBranches.map((branch) => (
            <button
              key={branch.node.key}
              type="button"
              role="tab"
              aria-selected={subKey === branch.node.key}
              className={subKey === branch.node.key ? 'active' : ''}
              onClick={() => onSelectSub(branch.node.key)}
            >
              {branchLabel(branch)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
