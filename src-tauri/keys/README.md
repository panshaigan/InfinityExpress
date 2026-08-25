# Updater signing keys

Release builds need a minisign keypair for Tauri updater artifacts.

## One-time setup (maintainer)

```powershell
$env:CI = 'true'
node ./node_modules/@tauri-apps/cli/tauri.js signer generate `
  -w ./src-tauri/keys/infinityexpress.key `
  --ci -f
```

This writes:

- `infinityexpress.key` — **private** (never commit)
- `infinityexpress.key.pub` — public key for `tauri.conf.json`

Add GitHub repository secrets:

| Secret | Value |
| --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY` | contents of `infinityexpress.key` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | empty unless you set a password |
| `TAURI_SIGNING_PUBLIC_KEY` | contents of `infinityexpress.key.pub` (single string) |

The release workflow runs `scripts/inject-updater-pubkey.mjs` to paste the public key into `tauri.conf.json` before `tauri build`.

For local release builds, run the inject script with the same env var, then `npm run tauri:build`.
