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
checks native install/reinstall/uninstall on disposable fixtures, and builds an
unsigned Debian package. Its package test verifies executable resources, rejects
Windows binaries, renders the real WebKit UI, and exercises staging, installation,
snapshots, and vanilla restore through Tauri IPC. The package and screenshot are
retained as CI artifacts. The job also builds Debian and AppImage updater
artifacts with disposable keys, verifies both signatures with minisign, and runs
the same native-command checks from the extracted AppImage. It does not publish
releases or use production signing keys.

The release workflow now includes Linux x86_64 Debian and AppImage builds on
Ubuntu 22.04. Existing repository updater secrets sign Debian/AppImage updates and feed
the shared `latest.json`, alongside Windows. Publishing still follows the existing
tag/draft release process.

### Reproduce the checks in an isolated Linux container

From a Linux/WSL shell in the repository root (Docker required):

```bash
docker build -t infinityexpress-linux-check -f scripts/linux/Dockerfile scripts/linux
mkdir -p .cache/linux-check
docker run --rm --init --shm-size=1g \
  -v "$PWD:/source:ro" \
  -v infinityexpress-linux-work:/work \
  -v infinityexpress-linux-build:/build \
  -v "$PWD/.cache/linux-check:/results" \
  -e CARGO_BUILD_JOBS=2 -e CARGO_PROFILE_DEV_DEBUG=0 -e CARGO_PROFILE_TEST_DEBUG=0 \
  -e IE_LINUX_RESULTS=/results \
  infinityexpress-linux-check bash /source/scripts/linux/container-check.sh
```

Source is copied into a Linux volume; Windows `node_modules`, build outputs,
environment files, and games are not modified. Results land in
`.cache/linux-check/`. On a prepared Linux host, run `bash scripts/linux/check.sh`
directly instead.

To test AppImage updater signing without production keys, use
`bash scripts/linux/signing-smoke.sh` in that prepared Linux environment
(requires `minisign`). This creates disposable keys, builds and verifies the
Debian and AppImage signatures, then restores the config and removes the keys.
Run `bash scripts/linux/appimage-smoke.sh` afterward to verify AppImage runtime
layout and native commands without FUSE. These artifacts are test builds;
production releases must use the repository's real signing keys.

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

## Validation performed (2026-10-31)

Validated in a Debian 12 x86_64 container with Node 22.23.4, Rust/Cargo 1.99.1,
and WebKitGTK 2.50.6:

- All 522 frontend tests and all 29 Linux Rust tests passed.
- The production frontend and native release build completed.
- Debian and AppImage packages built; updater signatures for both were verified
  using disposable keys and minisign.
- Both package layouts launched the actual React/WebKit UI. Through real Tauri
  IPC, tests verified bundled tools, native game probing, compatibility checks,
  mod staging, installation/reinstallation, uninstall, snapshot creation/restore,
  vanilla restore, and retention of game executable permissions.

All install/backup operations used generated minimal game fixtures, not a
player's game or a full mod list. Screenshots and a Debian test build are under
`.cache/linux-check/` locally. This is local validation of the checked-in workflow;
GitHub-hosted runs and production publishing occur after these changes are pushed
and released through the normal process.

## Compatibility limits

- Selection/export still show the full catalog. The install preflight covers the
  known Bubb/EEex blockers; additional platform-specific mods need individual review.
  Accepting a game directory does not establish that every mod supports it.
- WeiDU **249** predates newer Linux case-handling improvements. Existing
  filesystem preparation requirements still apply; this app does not rename
  or lowercase the user's game files automatically. `tolower` is not used by
  the app and is not bundled.
- Real-game mod lists, hardware graphics drivers, desktop file dialogs, and
  distribution-specific environments still need normal beta testing. The
  automated fixture tests do not establish compatibility for every game/mod.
