/** Max WeiDU console lines kept in React state / rendered at once. */
export const INSTALL_CONSOLE_MAX_LINES = 800

/** Max bytes read from each on-disk run log when restoring console state. */
export const INSTALL_CONSOLE_TAIL_BYTES = 512 * 1024

/** Max bytes read from step stderr when building failure error messages. */
export const INSTALL_FAILURE_STDERR_TAIL_BYTES = 16 * 1024

export function trimConsoleLines(lines: readonly string[]): string[] {
  if (lines.length <= INSTALL_CONSOLE_MAX_LINES) return [...lines]
  return lines.slice(-INSTALL_CONSOLE_MAX_LINES)
}
