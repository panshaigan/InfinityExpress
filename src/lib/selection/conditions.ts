export type ConditionAst =
  | { type: 'id'; id: string }
  | { type: 'and'; left: ConditionAst; right: ConditionAst }
  | { type: 'or'; left: ConditionAst; right: ConditionAst }

class ParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConditionParseError'
  }
}

/**
 * Parse alwaysIf / displayIf / displayIfNot expressions.
 * Identifiers: component ids (letters, digits, _ : - @ #)
 * `,` = AND (higher precedence than `|` when ungrouped — use `()` explicitly)
 * `|` = OR
 * `()` for grouping
 */
export function parseCondition(input: string): ConditionAst {
  const src = input.trim()
  if (!src) throw new ParseError('Empty condition')
  let i = 0

  function peek(): string {
    return src[i] ?? ''
  }

  function skipWs() {
    while (/\s/.test(peek())) i++
  }

  function parsePrimary(): ConditionAst {
    skipWs()
    if (peek() === '(') {
      i++
      const inner = parseOr()
      skipWs()
      if (peek() !== ')') throw new ParseError(`Expected ) at ${i}`)
      i++
      return inner
    }
    const start = i
    while (/[A-Za-z0-9_:\-@#.]/.test(peek())) i++
    if (i === start) throw new ParseError(`Expected identifier at ${i}`)
    return { type: 'id', id: src.slice(start, i) }
  }

  function parseAnd(): ConditionAst {
    let left = parsePrimary()
    skipWs()
    while (peek() === ',') {
      i++
      const right = parsePrimary()
      left = { type: 'and', left, right }
      skipWs()
    }
    return left
  }

  function parseOr(): ConditionAst {
    let left = parseAnd()
    skipWs()
    while (peek() === '|') {
      i++
      const right = parseAnd()
      left = { type: 'or', left, right }
      skipWs()
    }
    return left
  }

  const ast = parseOr()
  skipWs()
  if (i < src.length) throw new ParseError(`Unexpected trailing input at ${i}`)
  return ast
}

export function evaluateCondition(
  ast: ConditionAst,
  selectedIds: ReadonlySet<string>,
): boolean {
  switch (ast.type) {
    case 'id':
      return selectedIds.has(ast.id)
    case 'and':
      return evaluateCondition(ast.left, selectedIds) && evaluateCondition(ast.right, selectedIds)
    case 'or':
      return evaluateCondition(ast.left, selectedIds) || evaluateCondition(ast.right, selectedIds)
  }
}

const cache = new Map<string, ConditionAst | null>()

function getCachedAst(expr: string): ConditionAst | null {
  let ast = cache.get(expr)
  if (ast === undefined) {
    try {
      ast = parseCondition(expr)
      cache.set(expr, ast)
    } catch {
      cache.set(expr, null)
      return null
    }
  }
  return ast
}

/** Collect component ids referenced in a condition AST (flat, duplicates kept in walk order). */
export function collectConditionIds(ast: ConditionAst): string[] {
  const ids: string[] = []
  function walk(node: ConditionAst) {
    switch (node.type) {
      case 'id':
        ids.push(node.id)
        break
      case 'and':
      case 'or':
        walk(node.left)
        walk(node.right)
        break
    }
  }
  walk(ast)
  return ids
}

/** Parse expr (cached) and return referenced component ids; empty on missing/invalid. */
export function collectConditionIdsFromExpr(expr: string | undefined): string[] {
  if (!expr?.trim()) return []
  const ast = getCachedAst(expr)
  if (!ast) return []
  return collectConditionIds(ast)
}

export function evalConditionExpr(
  expr: string | undefined,
  selectedIds: ReadonlySet<string>,
): boolean {
  if (!expr?.trim()) return true
  const ast = getCachedAst(expr)
  if (ast === null) return false
  return evaluateCondition(ast, selectedIds)
}
