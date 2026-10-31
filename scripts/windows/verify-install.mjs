import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const installDir = process.argv[2]
assert.ok(installDir, 'Pass the isolated install directory')
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
for (const relative of ['app.exe', 'weidu/weidu.exe', '7zip/7z.exe']) {
  const expected = await readFile(path.join('src-tauri/target/release', relative))
  if (relative === 'app.exe') {
    // Tauri patches the package's marker, then restores the original build
    // output. Normalize only that documented marker before comparing hashes.
    // https://github.com/tauri-apps/tauri/blob/dev/crates/tauri-bundler/src/bundle.rs
    const unknown = Buffer.from('__TAURI_BUNDLE_TYPE_VAR_UNK')
    const index = expected.indexOf(unknown)
    if (index !== -1) Buffer.from('__TAURI_BUNDLE_TYPE_VAR_NSS').copy(expected, index)
  }
  const actual = await readFile(path.join(installDir, relative))
  assert.equal(hash(actual), hash(expected), `Installed file differs from the NSIS payload: ${relative}`)
}
