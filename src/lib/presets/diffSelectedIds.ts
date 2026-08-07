/** Diff two selection id sets for preset-load feedback. */
export function diffSelectedIds(
  before: ReadonlySet<string>,
  after: ReadonlySet<string>,
): { added: number; removed: number } {
  let added = 0
  let removed = 0
  for (const id of after) {
    if (!before.has(id)) added += 1
  }
  for (const id of before) {
    if (!after.has(id)) removed += 1
  }
  return { added, removed }
}
