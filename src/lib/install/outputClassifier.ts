/** Mirror of Rust phrase classification for unit tests and optional TS-side use. */

export type OutputClassification =
  | 'informational'
  | 'progress'
  | 'warning'
  | 'error'
  | 'inputRequired'
  | 'finished'

const CHOICE_WORDS = ['choice', 'choose']
const CHOICE_PHRASES = ['do you want', 'would you like', 'please enter', 'press any key']
const WARNING_PHRASES = [
  'installed with warnings',
  'warning:',
  'warnings',
  'continuing despite error',
]
const ERROR_PHRASES = [
  'not installed due to errors',
  'stopping installation because of error',
  'error installing',
  'failed to install',
  'error:',
]
const FINISHED_PHRASES = [
  'successfully installed',
  'installation complete',
  'installing [',
  'installed successfully',
]
const PROGRESS_PHRASES = ['installing ', 'processing ', 'copying ', 'applying ']

export function classifyWeiduOutputLine(line: string): OutputClassification {
  const lower = line.trim().toLowerCase()
  if (!lower) return 'informational'

  for (const phrase of CHOICE_PHRASES) {
    if (lower.includes(phrase)) return 'inputRequired'
  }
  for (const word of CHOICE_WORDS) {
    if (lower.includes(word) && (lower.includes('?') || lower.includes(':'))) {
      return 'inputRequired'
    }
  }
  for (const phrase of ERROR_PHRASES) {
    if (lower.includes(phrase)) return 'error'
  }
  for (const phrase of WARNING_PHRASES) {
    if (lower.includes(phrase)) return 'warning'
  }
  for (const phrase of FINISHED_PHRASES) {
    if (lower.includes(phrase)) return 'finished'
  }
  for (const phrase of PROGRESS_PHRASES) {
    if (lower.includes(phrase)) return 'progress'
  }
  return 'informational'
}
