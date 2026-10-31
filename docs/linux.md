# Linux desktop support

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

`.github/workflows/linux-check.yml` compiles/tests the Linux backend and frontend,
checks the bundled WeiDU, and builds an unsigned Debian package as a CI artifact.
It does not publish Linux releases or updater artifacts.

## Target-game compatibility preflight

Every start/resume checks the remaining unfinished plan before staging or running
any mod. Compatibility follows the game executable's header, not the host OS:

- A native Linux (ELF) game skips Bubb's required pathfinding revert, which patches
  Windows engine payloads. The row stays in the plan as **Skipped**; its warning
  and the Commands log explain why.
- A native Linux game with EEex selected stops before installing any component.
  Deselect EEex and its dependent components, or use a Windows game installation
  through Proton/Wine. See [EEex's upstream compatibility notes](https://github.com/Bubb13/EEex#compatibility).
- Windows (MZ) game executables retain both options, including on a Linux host.
  This is a platform check, not a guarantee of a particular mod/game version's compatibility.
- Missing, unrecognized, or mixed Windows/Linux executable sets block these
  known executable patches rather than guessing the intended target.

Auto skip on errors does not bypass a preflight blocker. Staging and installation
also enforce the same restriction for direct calls or cached mod resolution.
Already installed, completed, and explicitly skipped steps are not rechecked.

## Remaining compatibility work

- Selection/export still show the full catalog. The install preflight covers the
  known Bubb/EEex blockers; additional platform-specific mods need individual review.
  Accepting a game directory does not establish that every mod supports it.
- WeiDU **249** predates newer Linux case-handling improvements. Existing
  filesystem preparation requirements still apply; this app does not rename
  or lowercase the user's game files automatically. `tolower` is not used by
  the app and is not bundled.
- Linux CI package results, signed updater artifacts, and full GUI/install/rollback
  testing on disposable games remain to be validated before release.
