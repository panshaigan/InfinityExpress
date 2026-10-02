import { useEffect, useMemo, useRef, useState } from 'react'
import {
  analyzeConditionExpression,
  conditionIdentifierRange,
  filterConditionOptions,
  insertConditionOperator,
  replaceConditionIdentifier,
  type ConditionComponentOption,
} from '../../lib/componentBrowser/conditionEditor'
import { OutlinedTextField } from '../OutlinedTextField'

interface Props {
  attribute: 'alwaysIf' | 'displayIf' | 'displayIfNot'
  label: string
  help: string
  value: string
  currentComponentId: string
  options: readonly ConditionComponentOption[]
  onChange: (value: string) => void
}

export function ConditionExpressionField({
  attribute,
  label,
  help,
  value,
  currentComponentId,
  options,
  onChange,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const suggestionRefs = useRef(new Map<number, HTMLButtonElement>())
  const [caret, setCaret] = useState(value.length)
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const knownIds = useMemo(() => new Set(options.map((option) => option.id)), [options])
  const analysis = useMemo(
    () => analyzeConditionExpression(value, knownIds, currentComponentId),
    [currentComponentId, knownIds, value],
  )
  const query = conditionIdentifierRange(value, caret).query
  const suggestions = useMemo(
    () => filterConditionOptions(options, query),
    [options, query],
  )

  useEffect(() => {
    if (!suggestionsOpen) return
    suggestionRefs.current
      .get(highlightedIndex)
      ?.scrollIntoView({ block: 'nearest' })
  }, [highlightedIndex, suggestions, suggestionsOpen])

  function restoreCaret(nextCaret: number) {
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.setSelectionRange(nextCaret, nextCaret)
    })
  }

  function applyValue(nextValue: string, nextCaret: number) {
    onChange(nextValue)
    setCaret(nextCaret)
    restoreCaret(nextCaret)
  }

  function chooseSuggestion(index: number) {
    const option = suggestions[index]
    if (!option) return
    const next = replaceConditionIdentifier(value, caret, option.id)
    applyValue(next.value, next.caret)
    setSuggestionsOpen(false)
    setHighlightedIndex(0)
  }

  function insertOperator(operator: ',' | '|' | '(' | ')') {
    const start = inputRef.current?.selectionStart ?? caret
    const end = inputRef.current?.selectionEnd ?? start
    const next = insertConditionOperator(value, start, end, operator)
    applyValue(next.value, next.caret)
    setSuggestionsOpen(false)
  }

  const warningParts: string[] = []
  if (analysis.unknownIds.length > 0) {
    warningParts.push(`Not in current XML: ${analysis.unknownIds.join(', ')}`)
  }
  if (analysis.selfReference) warningParts.push('References this component itself')

  return (
    <div className="condition-expression-field" data-attribute={attribute}>
      <OutlinedTextField
        label={label}
        value={value}
        inputRef={inputRef}
        onChange={(nextValue) => {
          const nextCaret = inputRef.current?.selectionStart ?? nextValue.length
          onChange(nextValue)
          setCaret(nextCaret)
          setSuggestionsOpen(true)
          setHighlightedIndex(0)
        }}
        onFocus={() => {
          setCaret(inputRef.current?.selectionStart ?? value.length)
          setSuggestionsOpen(true)
        }}
        onBlur={() => setSuggestionsOpen(false)}
        onKeyDown={(event) => {
          setCaret(event.currentTarget.selectionStart ?? value.length)
          if (!suggestionsOpen || suggestions.length === 0) return
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            setHighlightedIndex((index) => Math.min(index + 1, suggestions.length - 1))
          } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            setHighlightedIndex((index) => Math.max(index - 1, 0))
          } else if (event.key === 'Enter') {
            event.preventDefault()
            chooseSuggestion(highlightedIndex)
          } else if (event.key === 'Escape') {
            event.stopPropagation()
            setSuggestionsOpen(false)
          }
        }}
        placeholder="Start typing a component ID…"
        error={analysis.error}
        spellCheck={false}
      />
      {suggestionsOpen && suggestions.length > 0 ? (
        <div className="condition-expression-suggestions" role="listbox">
          {suggestions.map((option, index) => (
            <button
              key={option.id}
              ref={(element) => {
                if (element) suggestionRefs.current.set(index, element)
                else suggestionRefs.current.delete(index)
              }}
              type="button"
              role="option"
              aria-selected={index === highlightedIndex}
              className={index === highlightedIndex ? 'active' : undefined}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setHighlightedIndex(index)}
              onClick={() => chooseSuggestion(index)}
            >
              <span>{option.label || option.name || option.id}</span>
              <code>{option.id}</code>
              {option.modId ? <small>{option.modId}</small> : null}
            </button>
          ))}
        </div>
      ) : null}
      <div className="condition-expression-tools">
        <button type="button" onClick={() => insertOperator(',')}>AND</button>
        <button type="button" onClick={() => insertOperator('|')}>OR</button>
        <button type="button" onClick={() => insertOperator('(')}>(</button>
        <button type="button" onClick={() => insertOperator(')')}>)</button>
        <button
          type="button"
          onClick={() => {
            onChange('')
            setCaret(0)
            restoreCaret(0)
          }}
          disabled={!value}
        >
          Clear
        </button>
      </div>
      <p className="condition-expression-help">{help}</p>
      {analysis.preview ? (
        <p className="condition-expression-preview">{analysis.preview}</p>
      ) : null}
      {warningParts.length > 0 ? (
        <p className="condition-expression-warning">{warningParts.join(' · ')}</p>
      ) : null}
    </div>
  )
}
