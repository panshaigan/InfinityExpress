import { spawnSync } from 'node:child_process'

const steps = [
  ['npm', ['run', 'test:coverage']],
  ['npm', ['run', 'build:demo']],
]
// Each platform's tauri:build runs the desktop typecheck/build once, after
// build:demo has finished using dist. Keep the default Tauri build hook enabled.
if (process.platform === 'win32') {
  steps.push(
    ['npm', ['run', 'test:rust']],
    ['npm', ['run', 'tauri:build', '--', '--bundles', 'nsis', '--config', 'scripts/windows/tauri.smoke.conf.json']],
    ['npm', ['run', 'test:installer:windows']],
  )
} else if (process.platform === 'linux') {
  steps.push(
    ['npm', ['run', 'test:coverage:rust']],
    ['src-tauri/resources/weidu/linux-amd64/weidu', ['--version']],
    ['python3', ['scripts/linux/weidu-smoke.py']],
    ['npm', ['run', 'tauri:build', '--', '--bundles', 'deb', '--config', '{"bundle":{"createUpdaterArtifacts":false}}']],
    ['bash', ['scripts/linux/package-smoke.sh']],
    ['bash', ['scripts/linux/signing-smoke.sh']],
    ['bash', ['scripts/linux/appimage-smoke.sh']],
  )
} else {
  throw new Error('CI checks support Windows and Linux. Use npm run test:all on other platforms.')
}

for (const [command, args] of steps) {
  console.log(`\n> ${command} ${args.join(' ')}`)
  if (process.argv.includes('--dry-run')) continue
  // npm's CLI avoids invoking a .cmd file through a shell on Windows.
  const executable = command === 'npm' ? process.execPath : command
  const commandArgs = command === 'npm' ? [process.env.npm_execpath, ...args] : args
  const result = spawnSync(executable, commandArgs, { stdio: 'inherit', windowsHide: true })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}
