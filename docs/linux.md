# Linux desktop support (first batch)

The native integration now bundles WeiDU 249 for **Linux x86_64** from the
provided `WeiDU-Linux-249-amd64.zip`. Only `weidu`, `COPYING`, and a provenance
notice are kept under `src-tauri/resources/weidu/linux-amd64/`. The original
archive is not needed to build. The Windows resources remain separate.

Tauri automatically merges `tauri.linux.conf.json` or `tauri.windows.conf.json`
with the common config. On Linux the build script sets WeiDU's execute bit
before bundling, including when the source checkout originated on Windows.
Other Linux architectures require a custom native WeiDU path in Settings.

Game-folder detection accepts native Linux executable names as well as the
Windows names used by Proton installs. FileVersion is optional on Linux and
is shown as blank. The app uses extensionless native `setup-{id}` launchers;
cleanup recognizes these without treating `.tp2` files as executables.

ZIP extraction preserves ordinary Unix file permissions. ZIP and 7z archives
use Rust extractors; RAR and fallback extraction need `7zz`, `7z`, or `7za` on
PATH. Windows 7-Zip binaries are never selected on Linux.

## Building and checking

Install the [Tauri Linux prerequisites](https://v2.tauri.app/start/prerequisites/),
Node.js, and Rust. Run `npm ci`, `npm run build`, and
`cargo test --manifest-path src-tauri/Cargo.toml` on Linux. Then use
`npm run tauri:dev` for interactive testing. Reinstall `node_modules` when
switching operating systems; native npm dependencies cannot be shared.

`.github/workflows/linux-check.yml` compiles/tests the Linux backend and frontend
and checks the bundled WeiDU. It does not publish Linux releases.

## Remaining compatibility work

- The required Bubb pathfinding revert still selects Windows engine payloads.
  Native Linux mod plans need platform filtering before installation is ready.
- EEex and other executable patches need separate native/Proton compatibility
  rules. Accepting a game directory does not establish that every mod supports it.
- WeiDU **249** predates newer Linux case-handling improvements. Existing
  filesystem preparation requirements still apply; this app does not rename
  or lowercase the user's game files automatically. `tolower` is not used by
  the app and is not bundled.
- Linux release packages, updater artifacts, and full GUI/install/rollback
  testing on disposable games remain to be validated before release.
