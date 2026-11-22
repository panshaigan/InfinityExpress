# Updates and saved data

App versions and storage schema versions are independent. Installing a newer
release must preserve settings, projects, presets, downloaded mods, backups,
and install history.

## Canonical component catalogs take priority

The bundled `src/data/InstallSequence.xml` defines the display and installation
order for every project. On project open, `catalogRevision` records the SHA-256
of the current canonical XML. Saved selections keep eligible component IDs,
drop removed or engine-ineligible IDs, add required components, and reapply
conditions. The reconciled session and revision are written to localStorage.
An old project snapshot never overrides the bundled definition. During Vite
development, XML edits also refresh an open project once background work is idle.

When the XML changes, a saved install plan refreshes to the canonical order and
labels. Matching component/mod/phase entries retain their statuses and log paths;
new or changed entries start queued. Breakpoints and planned snapshots follow
their matching components. Changed plans stay halted for review before resuming.
Before replacing desktop `run-state.json`, the app archives the previous session
as `run-state.before-catalog-{uuid}.json` in the same run folder. Read or archive
failures abort the refresh before changing project storage. Updating the catalog
does not install or uninstall anything in a game folder.

XML snapshots remain available for recovery under
`{appLocalData}/catalogs/{revision}.xml` on desktop, or IndexedDB
(`infinity-express.catalogs`, object store `xml`) in the browser demo. They are
hash-checked when explicitly read for recovery. A missing historical snapshot
does not prevent a project from loading the canonical XML.

## Mod metadata merges on update

`src/data/mods.csv` is the canonical metadata source, keyed by Codename (Download
ID). The working catalog records the last canonical metadata per row in
`baseRows`. Changed and newly added canonical rows replace saved metadata, local
edits, same-ID custom rows, and hidden-row tombstones. Removed built-in rows
disappear. Legacy stores without a canonical baseline refresh once from the CSV.
The merged catalog and new baseline persist only when needed.

Unrelated custom rows and edits or hide markers for unchanged canonical rows
survive. Downloaded-version/size/release overlays and disk presence survive
metadata refreshes. Disk scans and catalog edits retain the canonical baseline.

An app update does not download or replace mod files. Do not reuse a Codename or
component ID for a different mod/component.

## Recovery checkpoints

Before startup migrations or catalog merging, the desktop app writes a recovery
checkpoint when the app version, bundled XML, or bundled CSV changes. The updater
also flushes the active project, preset library, and queued run-state writes,
then writes a fresh checkpoint **before** starting installation. An active
install, download, or backup blocks app update installation; failed saves or
checkpoint writes abort it.

Checkpoints are unique files under `{appLocalData}/profile-backups/profile-*.json`.
Each contains the raw `infinity-express.*` localStorage entries, app version,
creation time, incoming bundled XML/CSV, and all previously archived XML catalogs.
They are retained across releases rather than overwritten. These are private
profile files and can include the configured GitHub token.

For the normal Windows identity, `{appLocalData}` is
`%LOCALAPPDATA%\com.infinityexpress.app`. On Linux it follows the app's XDG local
data directory. This is separate from Settings → App's chosen **main data folder**,
where downloaded mods, game backups, logs, and `run-state.json` already live.
Profile checkpoints do not copy those large external folders; keep them when
moving or recovering an installation.

Automatically configured bundled WeiDU paths track their source and refresh if
the app's installation/AppImage location changes. Explicit custom paths and
untracked legacy preferences remain user-owned.

Unreadable or unsupported project, preset, catalog, or core-settings stores stop
startup with **Saved data needs attention**, keeping the original values. Select
**Choose profile backup**, choose a compatible checkpoint (inspect `createdAt`
and `appVersion` if needed), and confirm **Restore profile**. Recovery verifies all
catalog hashes, saves the current profile first, restores XML catalogs and app
storage, and reloads. A failed settings replacement rolls back the localStorage
changes. Other browser storage keys and game folders are not replaced.

Install state accepts legacy unversioned files and `schemaVersion: 1`. Invalid,
unsupported, unreadable, or missing referenced run state stops that project from
opening rather than creating a replacement run. Restore its original run folder
or use a compatible app version. Run-state writes replace a fully written,
synced temporary file, avoiding truncation if a write fails.

The browser demo preserves projects and catalogs within the same browser/site
origin. It does not create native profile checkpoints. Clearing site data also
removes its localStorage and IndexedDB.

## Release compatibility contract

- Keep `identifier: com.infinityexpress.app`, `productName: InfinityExpress`,
  the main window label, default WebView data directory, and HTTP custom-protocol
  origin stable. Changing identity, origin, or the browser demo URL needs an
  explicit storage migration. Tests lock the desktop identity and origin.
- Keep storage keys stable. Introduce a new schema only with a tested migration
  from supported versions. Reject unsupported versions; never treat them as
  empty data. Checkpoint before migrating and mark migration complete only after
  successful writes. Legacy migration sources remain recoverable.
- Development fresh-install helpers are disabled in production, including an
  inherited `IE_FRESH_INSTALL` environment variable. No release-number change
  should trigger a reset.
- Keep catalogs outside the application payload. Do not clean profile or player
  data during an installer upgrade. The optional uninstall/data-removal flow is
  separate from upgrading.
- Before tagging, run the frontend tests, both production builds, Rust tests,
  and the OS-specific installer/desktop smoke suites from [development.md](development.md).
  For a release candidate, also upgrade an installed previous stable version
  with representative settings, multiple projects, custom catalog entries,
  presets, and a paused install; reopen and resume it. Verify both the in-app
  updater and a manually downloaded installer. Unit tests do not replace this
  real previous-version installer check.

Downgrading to beta builds that predate these protections is not a supported
storage migration. Keep recovery files and external data folders when doing
manual troubleshooting.
