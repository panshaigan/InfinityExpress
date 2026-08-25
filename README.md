# iNfinity eXpress

Desktop **mod route planner** for Infinity Engine Enhanced Edition games (Baldur’s Gate, Icewind Dale, Planescape: Torment, and EET).

Pick components station by station, acquire mods, then run a WeiDU install — with vanilla backups and named snapshots built in. Public beta **0.9.0**.

## Screenshots

![Project hub and first launch](docs/screenshots/intro-02.webp)

*Projects — create or open an install universe for one engine.*

![Components phase](docs/screenshots/components-02.webp)

*Components — browse stations, check components, apply presets and filters.*

![Mods phase](docs/screenshots/mods-01.webp)

*Mods — catalog, disk presence, and acquire missing packages.*

![Install phase](docs/screenshots/installation-03.webp)

*Install — review the WeiDU plan, run it, and manage backups.*

## What it does

Work happens inside a **Project**: one engine, your component selection, install run state, and destination game folder(s). Vanilla backups and app paths are shared in Settings.

Three phases:

1. **Components** — curated install sequence as stations (plus presets). Check what you want; conditions and alternatives keep the tree honest. Optionally export an install-order list.
2. **Mods** — see which packages are on disk under the app data `mods` folder; download/acquire where the catalog supports it.
3. **Install** — build a WeiDU plan from your selection, run it with an in-app console, and keep **vanilla** backups plus named snapshots. For EET, Pre-EET (BG1) and EET steps stay split where needed.

The desktop app **bundles WeiDU and 7-Zip** — you do not need to install them separately. Settings → App can still point at a custom WeiDU executable.

## Requirements

- **Windows 10/11** with WebView2 (usually already installed)
- Infinity Engine **Enhanced Edition** games you want to mod (BG1EE, BG2EE, EET, IWDEE, PSTEE as supported by the curated sequence)
- Clean **vanilla** game folders for backups (EET needs both BG1 and BG2 vanillas)

## Install

1. Open [Releases](https://github.com/panshaigan/InfinityExpress/releases).
2. Download the latest Windows build from the release assets.
3. Install or unpack and run **iNfinity eXpress**.

The app can check for updates on startup (About → **Check for updates**).

Building from source is for contributors — see [docs/development.md](docs/development.md).

## How to use

### 1. Create or open a project

On first launch, create a project: choose an engine, set up vanilla backups if prompted, and choose destination (live/modded) game folder(s). Later, the **Project hub** lists your projects so you can reopen one or start another.

### 2. Components

Work through the station list (after Presets). Expand groups, check components, use filters and recommended/user presets. Open a row’s detail for mod notes and links. When ready, move on to Mods (or export install order from the UI if you only need a text list).

### 3. Mods

Review the catalog against what is already under your main data `mods` folder. Acquire missing mods when download metadata is available; remove from disk when you no longer need a package there.

### 4. Install

Open **Install**, review the plan table, then run. Watch the console for WeiDU output; pause or stop if needed. Use vanilla restore and named snapshots from the backup tools when you want a known-good baseline again.

While an install is running, Components and Mods lock appropriately so the plan stays consistent with the cursor.

## Settings

Top-bar **Settings** covers:

- **Project** — destination folders for the active project
- **Vanilla backups** — clean baselines per game (BG1 / BG2 / IWD / PST)
- **App** — main data folder (backups, logs, projects, mods), WeiDU path override, optional GitHub token for acquire

## Further reading

- [Keyboard reference](docs/keyboard.md) — tree and chrome shortcuts
- [Development](docs/development.md) — build from source, tests, releases, domain docs for contributors
