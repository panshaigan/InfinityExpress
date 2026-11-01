// Exercise the production React/WebView2 app and real Tauri IPC on disposable games.
// WebView2 debugging/profile isolation uses the desktop-smoke Cargo feature.
// No browser/driver download is needed; Node 22.12+ supplies fetch and WebSocket.
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { inspect } from 'node:util'

assert.equal(process.platform, 'win32', 'This smoke test requires Windows and WebView2')
const runtimeCheck = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
  '-File', fileURLToPath(new URL('./ensure-webview2.ps1', import.meta.url))],
{ encoding: 'utf8', windowsHide: true, timeout: 30_000 })
if (runtimeCheck.error) throw runtimeCheck.error
assert.equal(runtimeCheck.status, 0,
  `WebView2 prerequisite check failed:\n${runtimeCheck.stdout}\n${runtimeCheck.stderr}`)
console.log(runtimeCheck.stdout.trim())
const binary = path.resolve(process.env.IE_SMOKE_BINARY ?? 'src-tauri/target/release/app.exe')
const output = path.resolve(process.env.IE_SMOKE_RESULT_DIR ?? '.cache/windows-check')
await access(binary)
await mkdir(output, { recursive: true })
for (const name of ['result.json', 'native.log', 'failure-dom.json', 'failure.png', 'windows-window.png']) {
  await rm(path.join(output, name), { force: true })
}
const fixture = await mkdtemp(path.join(output, 'fixture-'))
const server = createServer()
server.listen(0, '127.0.0.1')
await once(server, 'listening')
const port = server.address().port
await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))

const app = spawn(binary, [], {
  windowsHide: true,
  env: {
    // Use the API path locally too, and discard inherited WebView2 overrides.
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('WEBVIEW2_'))),
    // Smoke builds pass these through the API even on elevated CI runners.
    IE_SMOKE_DEBUG_PORT: String(port),
    IE_SMOKE_PROFILE: path.join(fixture, 'webview-profile'),
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let appError
app.on('error', (error) => { appError = error })
const nativeLog = []
app.stdout.on('data', (data) => nativeLog.push(data.toString()))
app.stderr.on('data', (data) => nativeLog.push(data.toString()))
let socket
let sequence = 0
const pending = new Map()
const checks = []
let dialogSequence = 0

function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error(`Timed out: ${method}`))
    }, 90_000)
    pending.set(id, {
      resolve(value) { clearTimeout(timer); resolve(value) },
      reject(error) { clearTimeout(timer); reject(error) },
    })
    socket.send(JSON.stringify({ id, method, params }))
  })
}

async function evaluate(expression) {
  const response = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (response.exceptionDetails) {
    const exception = response.exceptionDetails.exception
    throw new Error(exception?.description ?? String(exception?.value ?? response.exceptionDetails.text))
  }
  return response.result.value
}

async function invoke(command, args = {}) {
  console.log(`Checking native command: ${command}`)
  return evaluate(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(command)}, ${JSON.stringify(args)})`)
}

async function nativeDialog(command, options, action, targetPath = '') {
  const index = ++dialogSequence
  const title = `InfinityExpress native dialog smoke ${app.pid}-${index}`
  const resultPath = path.join(output, `dialog-${index}.json`)
  const dialog = invoke(command, { options: { ...options, title } })
  const helper = spawn('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', fileURLToPath(new URL('./native-dialog.ps1', import.meta.url)),
    '-AppProcessId', String(app.pid), '-DialogTitle', title, '-Action', action,
    '-TargetPath', targetPath, '-ResultPath', resultPath], { windowsHide: true, timeout: 35_000 })
  const helperLog = []
  helper.stdout.on('data', (data) => helperLog.push(data.toString()))
  helper.stderr.on('data', (data) => helperLog.push(data.toString()))
  const completed = once(helper, 'exit').then(([code]) => {
    assert.equal(code, 0, `Native dialog automation failed; see ${resultPath}\n${helperLog.join('')}`)
  })
  const [result] = await Promise.all([dialog, completed])
  return result
}

function passed(message) {
  checks.push(message)
  console.log(`PASS: ${message}`)
}

async function waitUntil(expression, message) {
  for (let attempt = 0; attempt < 150; attempt++) {
    try { if (await evaluate(expression)) return } catch { /* Navigation replaces the execution context. */ }
    assert.equal(app.exitCode, null, 'Desktop app exited during UI checks')
    await delay(100)
  }
  throw new Error(message)
}

async function clickButton(text) {
  await evaluate(`(() => {
    const button = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(text)});
    if (!button || button.disabled) throw new Error('Missing or disabled button: ' + ${JSON.stringify(text)});
    button.click();
  })()`)
}

async function enterInput(id, value) {
  await evaluate(`(() => {
    const input = document.getElementById(${JSON.stringify(id)});
    if (!input) throw new Error('Missing input: ' + ${JSON.stringify(id)});
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event('input', {bubbles:true}));
  })()`)
}

try {
  let target
  let startupDetails = 'No response from the WebView2 debugging endpoint'
  for (let attempt = 0; attempt < 150; attempt++) {
    if (appError) throw appError
    assert.equal(app.exitCode, null, `Desktop app exited early (${app.exitCode})`)
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(1000) })
      const targets = await response.json()
      startupDetails = JSON.stringify(targets.map(({ type, url }) => ({ type, url })))
      target = targets.find((entry) => entry.type === 'page' &&
        /^https?:\/\/tauri\.localhost(?:\/|$)/.test(entry.url))
      if (target) break
    } catch (error) { startupDetails = inspect(error, { depth: 4 }) }
    await delay(200)
  }
  assert.ok(target?.webSocketDebuggerUrl,
    `Production WebView2 target did not start (build with --features desktop-smoke): ${startupDetails}`)
  socket = new WebSocket(target.webSocketDebuggerUrl)
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    const request = pending.get(message.id)
    if (!request) return
    pending.delete(message.id)
    if (message.error) request.reject(new Error(JSON.stringify(message.error)))
    else request.resolve(message.result)
  })
  socket.addEventListener('close', () => {
    for (const request of pending.values()) request.reject(new Error('WebView2 disconnected'))
    pending.clear()
  })
  await once(socket, 'open')
  let rendered = false
  for (let attempt = 0; attempt < 100; attempt++) {
    rendered = await evaluate(`Boolean(document.querySelector('.project-wizard .engine-card') && window.__TAURI_INTERNALS__?.invoke)`)
    if (rendered) break
    await delay(100)
  }
  assert.ok(rendered, 'React project wizard did not render in the isolated profile')
  const screenshot = await call('Page.captureScreenshot', { format: 'png' })
  await writeFile(path.join(output, 'windows-window.png'), Buffer.from(screenshot.data, 'base64'))
  passed('Production React UI rendered in an isolated WebView2 profile')

  const weidu = await invoke('bundled_weidu_path')
  await access(weidu)
  assert.equal(path.resolve(weidu), path.join(path.dirname(binary), 'weidu', 'weidu.exe'))
  await access(path.join(path.dirname(binary), '7zip', '7z.exe'))
  passed('Bundled Windows tools resolve from the production resource layout')

  assert.equal(await nativeDialog('plugin:dialog|open', { directory: true, multiple: false }, 'Cancel'), null)
  const pickedFolder = path.join(fixture, 'Dialog folder Zażółć')
  await mkdir(pickedFolder)
  const folderResult = await nativeDialog('plugin:dialog|open',
    { directory: true, multiple: false, defaultPath: fixture }, 'Choose', pickedFolder)
  assert.equal(path.resolve(folderResult), pickedFolder)
  const pickedFile = path.join(pickedFolder, 'selected file.txt')
  await writeFile(pickedFile, 'selected')
  const fileResult = await nativeDialog('plugin:dialog|open',
    { directory: false, multiple: false, defaultPath: pickedFolder }, 'Choose', pickedFile)
  assert.equal(path.resolve(fileResult), pickedFile)
  assert.equal(await nativeDialog('plugin:dialog|save', { defaultPath: 'cancelled.txt' }, 'Cancel'), null)
  const exportPath = path.join(fixture, 'Export Zażółć.txt')
  const savedPath = await nativeDialog('plugin:dialog|save',
    { defaultPath: exportPath, filters: [{ name: 'Text', extensions: ['txt'] }] }, 'Choose', exportPath)
  assert.equal(path.resolve(savedPath), exportPath)
  const text = 'Zażółć gęślą — native save\n'
  const writeChosen = (destination) => evaluate(`window.__TAURI_INTERNALS__.invoke('plugin:fs|write_text_file',
    new TextEncoder().encode(${JSON.stringify(text)}), {headers:{
      path:encodeURIComponent(${JSON.stringify(destination)}), options:JSON.stringify({})}})`)
  await writeChosen(savedPath)
  assert.equal(await readFile(exportPath, 'utf8'), text)
  const unselectedPath = path.join(fixture, 'unselected.txt')
  await assert.rejects(writeChosen(unselectedPath), /not allowed|forbidden|scope/i)
  await assert.rejects(access(unselectedPath), { code: 'ENOENT' })
  passed('Real native folder/file/save dialogs, cancellation, Unicode paths, and save-scoped filesystem access')

  const game = path.join(fixture, 'game')
  const data = path.join(fixture, 'data')
  const source = path.join(fixture, 'mods', 'download', 'fixture')
  await mkdir(path.join(game, 'lang', 'en_US'), { recursive: true })
  const key = Buffer.alloc(24)
  key.write('KEY V1  ')
  key.writeUInt32LE(24, 16)
  key.writeUInt32LE(24, 20)
  await writeFile(path.join(game, 'chitin.key'), key)
  const tlk = Buffer.alloc(18)
  tlk.write('TLK V1  ')
  tlk.writeUInt32LE(18, 14)
  await writeFile(path.join(game, 'dialog.tlk'), tlk)
  await writeFile(path.join(game, 'lang', 'en_US', 'dialog.tlk'), tlk)
  await writeFile(path.join(game, 'Baldur.exe'), 'MZfixture')
  assert.deepEqual(await invoke('check_install_compatibility', { requests: [
    { stepId: 'bubb', gameDir: game, componentId: 'bubb_revert_pathfinding:0', modId: 'IE-Snippets' },
    { stepId: 'eeex', gameDir: game, componentId: 'EEex:1', modId: 'EEex' },
  ] }), [])
  const vanilla = await invoke('backup_game_dir', { input: {
    sourceDir: game, backupRoot: data, gameKey: 'bg1', kind: 'vanilla', excludeSafeDirs: false,
  } })
  const destination = path.join(fixture, 'prepared-game')
  assert.equal((await invoke('prepare_project_destination', {
    targetDir: destination, vanillaSource: vanilla.path, exeName: 'Baldur.exe',
  })).action, 'copied_vanilla')
  assert.equal(await readFile(path.join(destination, 'Baldur.exe'), 'utf8'), 'MZfixture')
  passed('Native compatibility, vanilla backup, and project destination preparation')

  // Start with real app-wide vanilla settings, then create two projects through
  // the actual wizard and verify the App shell restores each project's selection.
  await evaluate(`(() => {
    localStorage.setItem('infinity-express.app-dirs', JSON.stringify({backupDir:${JSON.stringify(data)}}));
    localStorage.setItem('infinity-express.vanilla-registry', JSON.stringify({bg1:{mode:'managed',path:${JSON.stringify(vanilla.path)}}}));
    window.__ieSmokeBeforeReload = true;
  })()`)
  await call('Page.reload')
  await waitUntil(`!window.__ieSmokeBeforeReload && Boolean(document.querySelector('.project-wizard .engine-card'))`, 'Wizard did not reload')
  async function createProject(name, target) {
    await evaluate(`document.querySelector('.engine-card').click()`)
    await enterInput('project-wizard-name', name)
    await clickButton('Continue')
    await waitUntil(`Boolean(document.getElementById('project-wizard-dest-bg1'))`, 'Destination step did not open')
    await enterInput('project-wizard-dest-bg1', target)
    await clickButton('Create project')
    await waitUntil(`Boolean(document.querySelector('.preset-group-check input:not(:disabled)') &&
      document.querySelector('button[aria-label="Projects"]:not(:disabled)'))`, 'Project workspace did not open')
    await waitUntil(`Boolean([...document.querySelectorAll('.level-card-label')]
      .find(label => label.textContent === 'Fixes')?.closest('label').querySelector('input').checked)`,
      'Initial destination scan did not finish seeding the Fixes preset')
  }
  async function returnToHub() {
    await waitUntil(`(() => {
      const button = document.querySelector('button[aria-label="Projects"]:not(:disabled)');
      if (!button) return false;
      button.click();
      return true;
    })()`, 'Projects control did not become available')
    await waitUntil(`Boolean(document.querySelector('.project-hub'))`, 'Project hub did not open')
    // The App shell flushes asynchronously when leaving the workspace.
    await waitUntil(`Object.values(JSON.parse(localStorage.getItem('infinity-express.projects-v1')).projects).every(p=>p.session)`,
      'Project session was not persisted')
  }
  const checkedGroups = `Array.from(document.querySelectorAll('.preset-group-check input'), input => input.checked)`
  await createProject('Smoke first', path.join(fixture, 'ui-first'))
  await evaluate(`(() => {
    const input = document.querySelector('.preset-group-check input:not(:checked):not(:disabled)');
    if (!input) throw new Error('No selectable preset group');
    input.click();
  })()`)
  await waitUntil(`Boolean(document.querySelector('.preset-group-check input:checked'))`,
    'Preset group selection did not render')
  const firstGroups = await evaluate(checkedGroups)
  await returnToHub()
  await clickButton('New Project')
  await waitUntil(`Boolean(document.querySelector('.project-wizard .engine-card'))`, 'New project wizard did not open')
  await createProject('Smoke second', path.join(fixture, 'ui-second'))
  const secondGroups = await evaluate(checkedGroups)
  assert.notDeepEqual(firstGroups, secondGroups, 'Second project inherited the first project selection')
  await returnToHub()
  for (const [name, expected] of [['Smoke first', firstGroups], ['Smoke second', secondGroups]]) {
    await evaluate(`(() => {
      const name = [...document.querySelectorAll('.project-hub-card-name')].find(el => el.textContent === ${JSON.stringify(name)});
      if (!name) throw new Error('Project missing from hub');
      name.closest('button').click();
    })()`)
    await waitUntil(`Boolean(document.querySelector('.preset-group-check input') &&
      document.querySelector('button[aria-label="Projects"]:not(:disabled)'))`, 'Project did not reopen')
    assert.deepEqual(await evaluate(checkedGroups), expected, `Selection changed when reopening ${name}`)
    await returnToHub()
  }
  passed('Real project wizard creation and App-shell switching preserve independent selections')

  await mkdir(source, { recursive: true })
  await writeFile(path.join(source, 'payload.txt'), 'Windows IPC installation\n')
  await writeFile(path.join(source, 'setup-fixture.tp2'),
    'BACKUP ~fixture/backup~\nAUTHOR ~Windows IPC smoke~\nBEGIN ~Fixture~\nLABEL ~ie_windows_ipc~\nCOPY ~fixture/payload.txt~ ~override/ie-windows-ipc.txt~\n')
  const tp2 = await invoke('stage_mod_into_game_dir', {
    modsDownloadDir: path.join(fixture, 'mods'), codename: 'download',
    gameDir: game, tp2Hint: 'fixture', gameVersion: null,
  })
  const step = {
    weiduPath: weidu, tp2Path: tp2, gameDir: game, componentNumber: 0,
    languageIndex: 0, logDir: path.join(fixture, 'logs'), stepFolder: 'fixture-0',
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await invoke('run_weidu_step', { input: {
      ...step, componentId: 'fixture:0', stepId: 'single:0000', timeoutSecs: 60,
    } })
    assert.ok([0, 3].includes(result.exitCode) && result.logVerified, JSON.stringify(result))
    assert.deepEqual(await readFile(path.join(game, 'override', 'ie-windows-ipc.txt')),
      await readFile(path.join(source, 'payload.txt')))
  }
  passed('Real Windows WeiDU staging, installation, and reinstallation through Tauri IPC')

  const snapshot = await invoke('create_named_backup', { input: {
    sourceDir: game, backupRoot: data, gameKey: 'bg1', kind: 'snapshot', name: 'installed', excludeSafeDirs: false,
  } })
  await invoke('run_weidu_force_uninstall', { input: step })
  const installedFile = path.join(game, 'override', 'ie-windows-ipc.txt')
  await assert.rejects(access(installedFile), { code: 'ENOENT' })
  await invoke('restore_game_dir', { backupPath: snapshot.path, targetDir: game })
  await access(installedFile)
  await invoke('restore_game_dir', { backupPath: vanilla.path, targetDir: game })
  await assert.rejects(access(installedFile), { code: 'ENOENT' })
  assert.equal(await readFile(path.join(game, 'Baldur.exe'), 'utf8'), 'MZfixture')
  passed('Uninstall, snapshot restore, and vanilla restore through Tauri IPC')
  await writeFile(path.join(output, 'result.json'), JSON.stringify({ ok: true, checks }, null, 2))
} catch (error) {
  if (socket?.readyState === WebSocket.OPEN) {
    try {
      const diagnostics = await evaluate(`({body:document.body.innerText,
        buttons:Array.from(document.querySelectorAll('button'), b=>({text:b.textContent, label:b.getAttribute('aria-label')}))})`)
      await writeFile(path.join(output, 'failure-dom.json'), JSON.stringify(diagnostics, null, 2))
      const screenshot = await call('Page.captureScreenshot', { format: 'png' })
      await writeFile(path.join(output, 'failure.png'), Buffer.from(screenshot.data, 'base64'))
    } catch { /* Preserve the original failure if the app has already exited. */ }
  }
  await writeFile(path.join(output, 'result.json'), JSON.stringify({ ok: false, checks, error: String(error) }, null, 2))
  throw error
} finally {
  socket?.close()
  // Terminate only the app process created above and its WebView2 descendants.
  if (app.pid && app.exitCode === null) {
    spawnSync('taskkill', ['/pid', String(app.pid), '/T', '/F'], { windowsHide: true })
    await Promise.race([once(app, 'exit'), delay(5000)])
  }
  await writeFile(path.join(output, 'native.log'), nativeLog.join(''))
  // Check the resolved deletion target remains inside this test's output folder.
  assert.equal(path.dirname(fixture), output)
  assert.ok(path.basename(fixture).startsWith('fixture-'))
  await rm(fixture, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
}
