import {
  collectConditionIds,
  parseCondition,
  type ConditionAst,
} from '../selection/conditions'

export interface ConditionComponentOption {
  id: string
  label: string
  name: string
  modId: string
}

export interface ConditionAnalysis {
  error: string | null
  preview: string
  unknownIds: string[]
  selfReference: boolean
}

const IDENTIFIER_CHAR = /[A-Za-z0-9_:\-@#\.]/

export function conditionIdentifierRange(
  expression: string,
  caret: number,
): { start: number; end: number; query: string } {
  let start = Math.max(0, Math.min(caret, expression.length))
  let end = start
  while (start > 0 && IDENTIFIER_CHAR.test(expression[start - 1])) start--
  while (end < expression.length && IDENTIFIER_CHAR.test(expression[end])) end++
  return { start, end, query: expression.slice(start, end) }
}

export function replaceConditionIdentifier(
  expression: string,
  caret: number,
  id: string,
): { value: string; caret: number } {
  const range = conditionIdentifierRange(expression, caret)
  return {
    value: `${expression.slice(0, range.start)}${id}${expression.slice(range.end)}`,
    caret: range.start + id.length,
  }
}

export function insertConditionOperator(
  expression: string,
  start: number,
  end: number,
  operator: ',' | '|' | '(' | ')',
): { value: string; caret: number } {
  const from = Math.max(0, Math.min(start, expression.length))
  const to = Math.max(from, Math.min(end, expression.length))
  return {
    value: `${expression.slice(0, from)}${operator}${expression.slice(to)}`,
    caret: from + 1,
  }
}

export function filterConditionOptions(
  options: readonly ConditionComponentOption[],
  query: string,
  limit = 30,
): ConditionComponentOption[] {
  const needle = query.trim().toLocaleLowerCase()
  if (!needle) return []
  return options
    .filter((option) =>
      [option.id, option.label, option.name, option.modId].some((value) =>
        value.toLocaleLowerCase().includes(needle),
      ),
    )
    .sort((left, right) => {
      const leftId = left.id.toLocaleLowerCase()
      const rightId = right.id.toLocaleLowerCase()
      const leftRank = leftId === needle ? 0 : leftId.startsWith(needle) ? 1 : 2
      const rightRank = rightId === needle ? 0 : rightId.startsWith(needle) ? 1 : 2
      return leftRank - rightRank || left.id.localeCompare(right.id)
    })
    .slice(0, limit)
}

function previewCondition(ast: ConditionAst, parent: 'and' | 'or' | null = null): string {
  if (ast.type === 'id') return ast.id
  const operator = ast.type === 'and' ? ' AND ' : ' OR '
  const rendered = `${previewCondition(ast.left, ast.type)}${operator}${previewCondition(
    ast.right,
    ast.type,
  )}`
  const needsParens = parent === 'and' && ast.type === 'or'
  return needsParens ? `(${rendered})` : rendered
}

export function analyzeConditionExpression(
  expression: string,
  knownIds: ReadonlySet<string>,
  currentComponentId: string,
): ConditionAnalysis {
  if (!expression.trim()) {
    return { error: null, preview: '', unknownIds: [], selfReference: false }
  }
  try {
    const ast = parseCondition(expression)
    const ids = [...new Set(collectConditionIds(ast))]
    return {
      error: null,
      preview: previewCondition(ast),
      unknownIds: ids.filter((id) => !knownIds.has(id)),
      selfReference: ids.includes(currentComponentId),
    }
  } catch (reason) {
    return {
      error: reason instanceof Error ? reason.message : String(reason),
      preview: '',
      unknownIds: [],
      selfReference: false,
    }
  }
}
