# Fresh install (dev)

Wipe **projects** and **Settings** stored in the app’s localStorage so the next run feels like a first launch. Does **not** delete game folders, vanilla copies, backups, or downloaded mods on disk.

## PowerShell (recommended)

From the repo root, with the desktop app **not** already running:

```powershell
cd D:\dev\InfinityExpress
$env:IE_FRESH_INSTALL = '1'; npm run tauri:dev
```

What happens:

1. Tauri starts with `IE_FRESH_INSTALL=1`.
2. On first webview boot the app clears project + Settings keys, then reloads.
3. The flag is consumed once in that process, so the reload does not loop.
4. You land on the empty Project hub with empty App / Vanilla settings.

Unset for a normal launch later in the same shell:

```powershell
Remove-Item Env:IE_FRESH_INSTALL -ErrorAction SilentlyContinue
npm run tauri:dev
```

Truthy values for the env var: `1`, `true`, `yes`, `on` (case-insensitive).

## DevTools console (optional)

With the app already open:

```js
__ieClearFreshInstall()
__ieClearFreshInstall({ chrome: true, catalog: true })
```

## What gets cleared

| Group | Keys |
| --- | --- |
| Projects | `infinity-express.projects-v1`, `infinity-express.projects-migrated-v1`, `infinity-express.app-session` |
| Settings | `infinity-express.app-dirs`, `infinity-express.vanilla-registry`, `infinity-express.weidu-path`, `infinity-express.github-token`, `infinity-express.game-folders`, `infinity-express.game-folder-versions` |

Optional via console only: chrome layout prefs and `infinity-express.mods-catalog`.

## Code

- TS: [`src/lib/ui/freshInstallReset.ts`](../src/lib/ui/freshInstallReset.ts)
- Rust (read-once env): [`src-tauri/src/dev_reset.rs`](../src-tauri/src/dev_reset.rs)
