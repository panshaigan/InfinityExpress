import type { DisplayNode } from '../selection/visibility'

export function listEmptyCopy(args: {
  listNodesLength: number
  isContentStation: boolean
  isMechanicsStation: boolean
  contentSubBranchesLength: number
  selectedSub: DisplayNode | null
  selectedMain: DisplayNode | null
  filtersActive: boolean
}): { title: string; body: string } | null {
  const {
    listNodesLength,
    isContentStation,
    isMechanicsStation,
    contentSubBranchesLength,
    selectedSub,
    selectedMain,
    filtersActive,
  } = args

  if (listNodesLength > 0) return null
  if (isContentStation && contentSubBranchesLength === 0) {
    return {
      title: 'No types in this bucket',
      body: 'This game branch has nothing left after filters. Clear filters or pick another Game tab.',
    }
  }
  if (isContentStation && selectedSub && listNodesLength === 0) {
    return {
      title: filtersActive ? 'Filters emptied this type' : 'Nothing in this type',
      body: filtersActive
        ? 'Clear Show levels, Size, Author, or Tags to reveal components here.'
        : 'This content type has no components for your engine. Try another Type tab.',
    }
  }
  if (isMechanicsStation && selectedMain && listNodesLength === 0) {
    return {
      title: filtersActive
        ? 'Filters emptied this category'
        : 'Nothing in this category',
      body: filtersActive
        ? 'Clear Show levels, Size, Author, or Tags to reveal components here.'
        : 'This Mechanics category has no components for your engine. Try another Category.',
    }
  }
  if (filtersActive) {
    return {
      title: 'Filters emptied this stop',
      body: 'Clear filters, or broaden Show levels / Size / Author / Tags to bring components back.',
    }
  }
  return {
    title: 'Nothing on this stop',
    body: 'This station has no visible components for your engine yet — some unlock after other picks.',
  }
}
