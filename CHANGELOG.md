# Changelog

All notable changes to iNfinity eXpress are documented in this file.

## [0.10.0] — 2026-08-25

Public beta — still en route to 1.0 (signing/SmartScreen, notifications, install/cleanup responsiveness, About credits, reinstall-safe user data, broader tests).

### Features

- **Relative install cost** — components can carry `cost` / `costScale`; Install plan shows Cost bars vs the plan maximum (derived from metrics via the cost-from-metrics tooling).
- **Selectable post-install cleanup** — choose what to remove after install (mod folders, `setup-*.exe`, `*.DEBUG`, `weidu_external`, `zstweaks_logs`, `weidu.conf`). For EET, optional deletion of the whole BG1 game folder (off by default).
- **Destination browse naming** — browsing a modding destination appends the project leaf name (EET BG1 gets ` (BG1)`).
- **Outlined fields** — text inputs default to autocomplete off / no spellcheck.

### Fixes

- **Install navigation** — Previous / Uninstall-back no longer force-uninstall queued or skipped steps; row context menu drops Go back / Skip and moves cursor above Uninstall.
- **WeiDU paths on Windows** — strip `\\?\` verbatim prefixes from bundled/stored WeiDU paths.
- **EET_end status** — prefer `SUCCESSFULLY INSTALLED` / WeiDU.log verification over sibling `SUBCOMPONENT SKIPPING` lines (avoids false Skipped).
- **Child processes** — spawn WeiDU, PowerShell, and 7-Zip with `CREATE_NO_WINDOW` so no extra console windows flash during install/acquire.

### Improvements

- **Game exe version** — read FileVersion via Win32 APIs instead of spawning PowerShell.
- **Install UI copy** — “Key results”, Presets “Done”, clearer Route guide wording; install duration colors aligned with the rest of the chrome.

### Notes

- InstallSequence.xml costs were populated from the current metrics corpus; expect refinements as more install timing data lands.

## [0.9.0] — previous

Public beta baseline prior to this release.
