import { webcrypto } from 'node:crypto'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { contentRevision, prepareCatalogSnapshot, readCatalogSnapshot } from './catalogSnapshots'
import { getProject, saveProjectSession, updateProjectMeta } from '../projects/projectStore'
import { emptyWorkspaceSession, loadProjectWithCatalog, resolveProjectInstallSession } from '../projects/bootstrap'
import { createProjectFromWizard } from '../../ui/projects/createProject'
import { buildInstallPlan } from '../install/planBuilder'
import { buildPersistedInstallSession } from '../ui/appSessionPrefs'
import { parseInstallSequence } from '../xml/parseInstallSequence'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), isTauri: () => true }))

const oldXml = `<installSequence><base><mod id="old-download"><component id="a:0" label="Old A"/><component id="b:0" label="Old B"/></mod></base></installSequence>`
// Remove a selection, reorder the remainder, change download ids, and add a required component.
const newXml = `<installSequence><base><mod id="new-download"><component id="b:0" label="New B"/><component id="required:0" required="1"/></mod></base></installSequence>`
const catalogs = new Map<string, string>()
const files = new Map<string, string>()

beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto)
  localStorage.clear()
  catalogs.clear()
  files.clear()
  vi.mocked(invoke).mockReset().mockImplementation(async (command, args) => {
    const values = args as Record<string, string>
    if (command === 'save_catalog_snapshot') catalogs.set(values.revision, values.xml)
    else if (command === 'read_catalog_snapshot') return catalogs.get(values.revision) as never
    else if (command === 'read_optional_text_file') return (files.get(values.path) ?? null) as never
    else if (command === 'write_text_file') files.set(values.path, values.contents)
    else if (command === 'ensure_dir') return undefined as never
    else throw new Error(`Unexpected command: ${command}`)
    return undefined as never
  })
})
afterEach(() => { localStorage.clear(); vi.unstubAllGlobals() })

describe('catalog updates', () => {
  it('refreshes existing projects from canonical XML, persists the selection, and archives old install history', async () => {
    const oldRevision = await prepareCatalogSnapshot(oldXml)
    const destinations = { bg1: '', bg2: '/games/bg2', iwd: '', pst: '' }
    const oldId = createProjectFromWizard({ name: 'Old project', engine: 'bg2', destinations })
    saveProjectSession(oldId, { ...emptyWorkspaceSession(), selectedIds: ['a:0', 'b:0'] })
    const original = (await loadProjectWithCatalog(oldId, oldXml))!
    const steps = buildInstallPlan(original.model, new Set(['a:0', 'b:0']), 'bg2').map(step => ({
      ...step, tp2Path: 'old/mod.tp2', stagedFolderName: 'old', weiduNumber: 0, languageIndex: 0,
      status: 'succeeded' as const, stdoutLogPath: '/history/original.log',
    }))
    const install = buildPersistedInstallSession({
      game: 'bg2', selectedIds: new Set(['a:0', 'b:0']),
      run: { runId: 'run1', game: 'bg2', logDir: '/history/run1', cursor: 1, runState: 'paused', steps,
        breakpointStepIds: ['single:0001'], plannedSnapshots: [{ stepId: 'single:0001', name: 'original snapshot' }] },
      paused: true, selectedStepId: 'single:0001', selectedComponentId: 'b:0', hideInstalled: false,
      pauseOnWarnings: true, autoSkipOnErrors: false, followCursor: false, runElapsedMs: 100,
    })
    saveProjectSession(oldId, { ...original.session!, legacyInstall: install })

    const newRevision = await prepareCatalogSnapshot(newXml)
    expect(newRevision).not.toBe(oldRevision)
    updateProjectMeta(oldId, { name: 'Renamed old project' })
    const reopened = (await loadProjectWithCatalog(oldId, newXml))!
    expect(reopened.record.catalogRevision).toBe(newRevision)
    expect(reopened.session!.selectedIds).toEqual(['b:0', 'required:0'])
    expect(getProject(oldId)!.session!.selectedIds).toEqual(['b:0', 'required:0'])
    expect(reopened.model.componentsInOrder.map(component => component.componentId)).toEqual(['b:0', 'required:0'])
    const resumed = await resolveProjectInstallSession(reopened.model, reopened.session, 'bg2')
    expect(resumed!.run.steps.map(step => [step.modId, step.componentId, step.status])).toEqual([
      ['new-download', 'b:0', 'queued'], ['new-download', 'required:0', 'queued'],
    ])
    expect(resumed!.run.steps[0].tp2Path).toBe('')
    expect(resumed!.run.runState).toBe('paused')
    expect(resumed!.ui.pauseOnWarnings).toBe(true)
    const archives = [...files].filter(([path]) => path.includes('before-catalog-'))
    expect(archives).toHaveLength(1)
    expect(JSON.parse(archives[0][1]).run).toEqual(install.run)
    await loadProjectWithCatalog(oldId, newXml)
    expect([...files.keys()].filter(path => path.includes('before-catalog-'))).toHaveLength(1)

    const newId = createProjectFromWizard({ name: 'New project', engine: 'bg2', destinations })
    expect(getProject(newId)!.catalogRevision).toBe(newRevision)
    const latest = (await loadProjectWithCatalog(newId, newXml))!
    expect(latest.model.componentsInOrder.map(component => component.componentId)).toEqual(['b:0', 'required:0'])
  })

  it('refreshes legacy projects and uses the canonical XML even if the previous snapshot is missing', async () => {
    await prepareCatalogSnapshot(oldXml)
    const id = createProjectFromWizard({ name: 'Legacy', engine: 'bg2', destinations: { bg1: '', bg2: '', iwd: '', pst: '' } })
    saveProjectSession(id, { ...emptyWorkspaceSession(), selectedIds: ['a:0', 'b:0'] })
    const index = JSON.parse(localStorage.getItem('infinity-express.projects-v1')!)
    delete index.projects[id].catalogRevision
    localStorage.setItem('infinity-express.projects-v1', JSON.stringify(index))
    catalogs.clear()
    const loaded = (await loadProjectWithCatalog(id, newXml))!
    expect(loaded.session!.selectedIds).toEqual(['b:0', 'required:0'])
    expect(getProject(id)!.catalogRevision).toBe(await contentRevision(newXml))
    catalogs.clear()
    expect((await loadProjectWithCatalog(id, newXml))!.session!.selectedIds).toEqual(['b:0', 'required:0'])
  })

  it('keeps the project and original run untouched if reading or archiving a run fails', async () => {
    await prepareCatalogSnapshot(oldXml)
    const id = createProjectFromWizard({ name: 'Saved run', engine: 'bg2', destinations: { bg1: '', bg2: '', iwd: '', pst: '' } })
    saveProjectSession(id, { ...emptyWorkspaceSession(), selectedIds: ['a:0'], installRef: { runId: 'run1', logDir: '/history/run1' } })
    const before = localStorage.getItem('infinity-express.projects-v1')
    await expect(loadProjectWithCatalog(id, newXml)).rejects.toThrow('missing')
    expect(localStorage.getItem('infinity-express.projects-v1')).toBe(before)
    const original = vi.mocked(invoke).getMockImplementation()!
    vi.mocked(invoke).mockImplementation(async (command, args) => {
      if (command === 'write_text_file') throw new Error('disk full')
      return original(command, args)
    })
    const run = buildPersistedInstallSession({
      game: 'bg2', selectedIds: new Set(['a:0']),
      run: { runId: 'run1', game: 'bg2', logDir: '/history/run1', cursor: 0, runState: 'paused',
        steps: buildInstallPlan(parseInstallSequence(oldXml).model, new Set(['a:0']), 'bg2').map(step => ({
          ...step, tp2Path: '', stagedFolderName: '', weiduNumber: null, languageIndex: null,
        })), breakpointStepIds: [], plannedSnapshots: [] },
      paused: true, selectedStepId: null, selectedComponentId: null, hideInstalled: false,
      pauseOnWarnings: false, autoSkipOnErrors: false, followCursor: false, runElapsedMs: 0,
    })
    files.set('/history/run1/run-state.json', JSON.stringify(run))
    await expect(loadProjectWithCatalog(id, newXml)).rejects.toThrow('disk full')
    expect(localStorage.getItem('infinity-express.projects-v1')).toBe(before)
    expect(files.get('/history/run1/run-state.json')).toBe(JSON.stringify(run))
  })

  it('refuses missing or corrupt snapshots rather than falling back to the new bundled catalog', async () => {
    const revision = await prepareCatalogSnapshot(oldXml)
    catalogs.set(revision, newXml)
    await expect(readCatalogSnapshot(revision)).rejects.toThrow('missing or damaged')
    catalogs.delete(revision)
    await expect(readCatalogSnapshot(revision)).rejects.toThrow('missing or damaged')
    await expect(readCatalogSnapshot('../escape')).rejects.toThrow('Invalid')
  })

  it('uses a stable content hash independent of release version', async () => {
    expect(await contentRevision('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})
