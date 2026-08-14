/** Resolve component `complexity` from InstallSequence.xml attrs (no catalog lookup). */
export function resolveComponentComplexity(
  component: { attrs: { complexity?: string } } | undefined,
): string | undefined {
  const v = component?.attrs.complexity?.trim()
  return v || undefined
}
