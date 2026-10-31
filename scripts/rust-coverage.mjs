import { spawnSync } from 'node:child_process'
import { mkdir } from 'node:fs/promises'

await mkdir('coverage/rust', { recursive: true })
function run(args) {
  const result = spawnSync('cargo', ['llvm-cov', ...args], { stdio: 'inherit', windowsHide: true })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}
const common = ['--manifest-path', 'src-tauri/Cargo.toml', '--ignore-filename-regex', 'build[.]rs']
// Execute tests once; subsequent commands render that same instrumentation data.
run([...common, '--locked', '--lcov', '--output-path', 'coverage/rust/lcov.info'])
run(['report', ...common, '--json', '--summary-only', '--output-path', 'coverage/rust/summary.json'])
run(['report', ...common, '--html', '--output-dir', 'coverage/rust'])
