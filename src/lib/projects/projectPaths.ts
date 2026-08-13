function normalizeDataRoot(dataRoot: string): string {
  return dataRoot.replace(/\\/g, '/').replace(/\/$/, '')
}

function assertSafeSegment(value: string, label: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error(`${label} is required`)
  }
  if (trimmed.includes('/') || trimmed.includes('\\')) {
    throw new Error(`${label} must not contain a path separator`)
  }
  if (trimmed === '.' || trimmed === '..') {
    throw new Error(`${label} is invalid`)
  }
  return trimmed
}

export function projectsRoot(dataRoot: string): string {
  return `${normalizeDataRoot(dataRoot)}/projects`
}

export function projectDir(dataRoot: string, projectId: string): string {
  return `${projectsRoot(dataRoot)}/${assertSafeSegment(projectId, 'projectId')}`
}

export function projectLogsDir(dataRoot: string, projectId: string): string {
  return `${projectDir(dataRoot, projectId)}/logs`
}

export function installRunLogDir(
  dataRoot: string,
  projectId: string,
  runId: string,
): string {
  return `${projectLogsDir(dataRoot, projectId)}/${assertSafeSegment(runId, 'runId')}`
}
