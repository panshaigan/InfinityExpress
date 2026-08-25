/** Relative install weight from InstallSequence.xml `cost` / `costScale`. */

export interface ComponentCostAttrs {
  cost?: string
  costScale?: string
}

export interface ParsedComponentCost {
  /** Light-base weight (integer ≥ 1). */
  cost: number
  /** Extra weight per 1000 prior base-cost points; omit when absent. */
  costScale?: number
}

/** Parse `cost` / `costScale` attrs; invalid or missing `cost` → undefined. */
export function parseComponentCost(
  attrs: ComponentCostAttrs | undefined,
): ParsedComponentCost | undefined {
  const raw = attrs?.cost?.trim()
  if (!raw) return undefined
  const cost = Number.parseInt(raw, 10)
  if (!Number.isFinite(cost) || cost < 1) return undefined
  const scaleRaw = attrs?.costScale?.trim()
  if (!scaleRaw) return { cost }
  const costScale = Number.parseInt(scaleRaw, 10)
  if (!Number.isFinite(costScale) || costScale < 1) return { cost }
  return { cost, costScale }
}

/**
 * Effective weight for a step given the sum of base `cost` of earlier plan steps.
 * `effective = cost + round(priorBase * costScale / 1000)` when scale is set.
 */
export function effectiveComponentCost(
  parsed: ParsedComponentCost,
  priorBaseCostSum: number,
): number {
  const prior = Math.max(0, priorBaseCostSum)
  if (parsed.costScale == null) return parsed.cost
  return parsed.cost + Math.round((prior * parsed.costScale) / 1000)
}

export interface PlanEffectiveCosts {
  /** Parallel to input steps; null when component has no valid `cost`. */
  effectiveCosts: (number | null)[]
  /** Max among non-null effective costs; 0 when none. */
  planMax: number
}

/**
 * Walk plan order: accumulate base costs for `priorBase`, compute effective per step.
 * Lookup via `componentsById.get(step.componentId)?.attrs`.
 */
export function planEffectiveCosts(
  steps: readonly { componentId: string }[],
  componentsById: ReadonlyMap<string, { attrs: ComponentCostAttrs }>,
): PlanEffectiveCosts {
  const effectiveCosts: (number | null)[] = []
  let priorBase = 0
  let planMax = 0
  for (const step of steps) {
    const parsed = parseComponentCost(componentsById.get(step.componentId)?.attrs)
    if (!parsed) {
      effectiveCosts.push(null)
      continue
    }
    const effective = effectiveComponentCost(parsed, priorBase)
    effectiveCosts.push(effective)
    if (effective > planMax) planMax = effective
    priorBase += parsed.cost
  }
  return { effectiveCosts, planMax }
}
