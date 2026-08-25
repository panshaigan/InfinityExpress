import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const confPath = join(root, 'src-tauri', 'tauri.conf.json')
const pubkey = process.env.TAURI_SIGNING_PUBLIC_KEY?.trim()

if (!pubkey) {
  console.error('TAURI_SIGNING_PUBLIC_KEY is not set.')
  process.exit(1)
}

const conf = JSON.parse(readFileSync(confPath, 'utf8'))
if (!conf.plugins?.updater) {
  console.error('tauri.conf.json has no plugins.updater section.')
  process.exit(1)
}

conf.plugins.updater.pubkey = pubkey
writeFileSync(confPath, `${JSON.stringify(conf, null, 2)}\n`)
console.log('Injected updater public key into tauri.conf.json')
