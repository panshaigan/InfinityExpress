# Updates and saved data

App versions and storage schema versions are independent. Installing a newer
release must preserve settings, projects, presets, downloaded mods, backups,
and install history.

## Component catalogs belong to projects

Every project records a `catalogRevision`: the SHA-256 of its exact
`InstallSequence.xml`. The XML is saved once per distinct revision and shared
by projects using that revision. Existing projects continue using that XML after
updates, including its component IDs, conditions, required components, engine
rules, mod IDs, and installation order. New projects use the latest bundled XML.
Resetting or renaming a project keeps its catalog; create a new project to use
a newer component catalog.

Desktop catalogs live under `{appLocalData}/catalogs/{revision}.xml`. The browser
demo uses IndexedDB (`infinity-express.catalogs`, object store `xml`), keeping
large XML files out of localStorage. Catalogs are hash-checked before use. A
missing or damaged snapshot stops loading; the app never substitutes the latest
XML and silently rewrites a saved selection or install plan.

Existing beta projects without a revision adopt the XML bundled with the first
snapshot-aware version they launch. Earlier XML cannot be reconstructed from
saved component IDs alone. Ship this protection before 1.0; do not combine its
first rollout with breaking catalog changes for existing beta users.

## Mod metadata merges on update

`mods.csv` remains the live metadata source. Its merge uses the stable Codename
(Download ID): new built-in rows appear and unedited built-in fields refresh.
Custom rows, locally edited built-in rows, downloaded-version/size/release
overlays, and hidden-row tombstones survive. Rows removed from the shipped CSV
stay in the saved working catalog, so an older project's download IDs continue
to resolve. A custom row wins if a later CSV adds the same Codename.

An app update does not download or replace mod files. XML snapshots preserve the
route definition; they do not freeze the contents of a mod downloaded separately.
Do not reuse a Codename or component ID for a different mod/component. Keep the
original download IDs available for old projects.

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
