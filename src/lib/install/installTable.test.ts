import { describe, expect, it } from 'vitest'
import {
  collectInstallFacetOptions,
  createDefaultInstallTableFilters,
  filterAndSortInstallRows,
  filterInstallRows,
  sortInstallRows,
  type InstallFilterRow,
} from './installTable'
import type { ComponentRunStatus } from './types'

function row(
  partial: Partial<InstallFilterRow> & Pick<InstallFilterRow, 'stepId' | 'order'>,
): InstallFilterRow {
  return {
    modId: 'mod-a',
    modDisplay: 'Mod A',
    componentId: `comp-${partial.order}`,
    componentLabel: `Label ${partial.order}`,
    weiduLabel: '',
    xmlLabel: '',
    category: 'NPC',
    status: 'queued',
    durationMs: null,
    ...partial,
  }
}

const rows: InstallFilterRow[] = [
  row({
    stepId: 's1',
    order: 1,
    modId: 'zebra',
    modDisplay: 'Zebra',
    componentId: 'z:1',
    componentLabel: 'Core',
    xmlLabel: 'Core',
    weiduLabel: 'Install Core Components',
    category: 'Quest',
    status: 'succeeded',
    durationMs: 4000,
  }),
  row({
    stepId: 's2',
    order: 2,
    modId: 'alpha',
    modDisplay: 'Alpha',
    componentId: 'a:10',
    componentLabel: 'Portraits',
    xmlLabel: 'Portraits',
    weiduLabel: 'Unique Portrait Pack',
    category: 'NPC',
    status: 'queued',
    durationMs: null,
  }),
  row({
    stepId: 's3',
    order: 3,
    modId: 'alpha',
    modDisplay: 'Alpha',
    componentId: 'a:11',
    componentLabel: 'Voices',
    xmlLabel: 'Voices',
    weiduLabel: 'Voice Pack',
    category: 'NPC',
    status: 'alreadyInstalled',
    durationMs: 1000,
  }),
  row({
    stepId: 's4',
    order: 4,
    modId: 'beta',
    modDisplay: 'Beta',
    componentId: 'b:0',
    componentLabel: 'Tweaks',
    xmlLabel: 'Tweaks',
    weiduLabel: 'Gameplay Tweaks',
    category: 'Tweaks',
    status: 'failed',
    durationMs: null,
  }),
]

describe('installTable filter/sort', () => {
  it('matches search on XML label, WeiDU label, and component id', () => {
    expect(
      filterInstallRows(rows, {
        ...createDefaultInstallTableFilters(),
        search: 'portrait',
      }).map((r) => r.stepId),
    ).toEqual(['s2'])

    expect(
      filterInstallRows(rows, {
        ...createDefaultInstallTableFilters(),
        search: 'unique portrait',
      }).map((r) => r.stepId),
    ).toEqual(['s2'])

    expect(
      filterInstallRows(rows, {
        ...createDefaultInstallTableFilters(),
        search: 'a:11',
      }).map((r) => r.stepId),
    ).toEqual(['s3'])
  })

  it('still matches the stored componentLabel fallback', () => {
    const fallback = row({
      stepId: 's5',
      order: 5,
      componentId: 'x:0',
      componentLabel: 'Fallback Title',
      xmlLabel: '',
      weiduLabel: '',
    })
    expect(
      filterInstallRows([fallback], {
        ...createDefaultInstallTableFilters(),
        search: 'fallback',
      }).map((r) => r.stepId),
    ).toEqual(['s5'])
  })

  it('filters by status, category, and modId', () => {
    const failed: ComponentRunStatus[] = ['failed']
    expect(
      filterInstallRows(rows, {
        ...createDefaultInstallTableFilters(),
        statuses: failed,
      }).map((r) => r.stepId),
    ).toEqual(['s4'])

    expect(
      filterInstallRows(rows, {
        ...createDefaultInstallTableFilters(),
        categories: ['NPC'],
      }).map((r) => r.stepId),
    ).toEqual(['s2', 's3'])

    expect(
      filterInstallRows(rows, {
        ...createDefaultInstallTableFilters(),
        modIds: ['alpha'],
      }).map((r) => r.stepId),
    ).toEqual(['s2', 's3'])
  })

  it('ANDs hideInstalled with other filters', () => {
    expect(
      filterInstallRows(
        rows,
        {
          ...createDefaultInstallTableFilters(),
          categories: ['NPC'],
        },
        true,
      ).map((r) => r.stepId),
    ).toEqual(['s2'])
  })

  it('collects unique categories and mods from the unfiltered plan', () => {
    const facets = collectInstallFacetOptions(rows)
    expect(facets.categories).toEqual(['NPC', 'Quest', 'Tweaks'])
    expect(facets.mods.map((m) => m.modId)).toEqual(['alpha', 'beta', 'zebra'])
  })

  it('keeps plan order by default and sorts by mod/status', () => {
    const defaults = createDefaultInstallTableFilters()
    expect(
      filterAndSortInstallRows(rows, defaults, 'order', 'asc').map(
        (r) => r.stepId,
      ),
    ).toEqual(['s1', 's2', 's3', 's4'])

    expect(
      sortInstallRows(rows, 'mod', 'asc').map((r) => r.modDisplay),
    ).toEqual(['Alpha', 'Alpha', 'Beta', 'Zebra'])

    expect(
      sortInstallRows(rows, 'status', 'asc').map((r) => r.status),
    ).toEqual(['succeeded', 'failed', 'alreadyInstalled', 'queued'])
  })
})
