# iNfinity eXpress

Desktop **mod route planner** for Infinity Engine Enhanced Edition games (Baldur’s Gate, EET,  Icewind Dale, Planescape: Torment).

Use recommended presets or pick components station by station, acquire mods, then run an automatic WeiDU install — with vanilla backups and named snapshots built in. Public beta **0.10.0**.

## Screenshots

*Click a thumbnail to open the full-size image.*

### Intro / Projects

*Create or open a project for one engine.*

<p>
<a href="docs/screenshots/intro-01.webp"><img src="docs/screenshots/intro-01.webp" width="180" alt="Intro screenshot 1"></a>
<a href="docs/screenshots/intro-02.webp"><img src="docs/screenshots/intro-02.webp" width="180" alt="Intro screenshot 2"></a>
<a href="docs/screenshots/intro-03.webp"><img src="docs/screenshots/intro-03.webp" width="180" alt="Intro screenshot 3"></a>
<a href="docs/screenshots/intro-04.webp"><img src="docs/screenshots/intro-04.webp" width="180" alt="Intro screenshot 4"></a>
<a href="docs/screenshots/intro-05.webp"><img src="docs/screenshots/intro-05.webp" width="180" alt="Intro screenshot 5"></a>
</p>

### Components

*Browse stations, check components, apply presets and filters.*

<p>
<a href="docs/screenshots/components-01.webp"><img src="docs/screenshots/components-01.webp" width="180" alt="Components screenshot 1"></a>
<a href="docs/screenshots/components-02.webp"><img src="docs/screenshots/components-02.webp" width="180" alt="Components screenshot 2"></a>
<a href="docs/screenshots/components-03.webp"><img src="docs/screenshots/components-03.webp" width="180" alt="Components screenshot 3"></a>
<a href="docs/screenshots/components-04.webp"><img src="docs/screenshots/components-04.webp" width="180" alt="Components screenshot 4"></a>
<a href="docs/screenshots/components-05.webp"><img src="docs/screenshots/components-05.webp" width="180" alt="Components screenshot 5"></a>
<a href="docs/screenshots/components-06.webp"><img src="docs/screenshots/components-06.webp" width="180" alt="Components screenshot 6"></a>
<a href="docs/screenshots/components-07.webp"><img src="docs/screenshots/components-07.webp" width="180" alt="Components screenshot 7"></a>
<a href="docs/screenshots/components-08.webp"><img src="docs/screenshots/components-08.webp" width="180" alt="Components screenshot 8"></a>
<a href="docs/screenshots/components-09.webp"><img src="docs/screenshots/components-09.webp" width="180" alt="Components screenshot 9"></a>
<a href="docs/screenshots/components-10.webp"><img src="docs/screenshots/components-10.webp" width="180" alt="Components screenshot 10"></a>
</p>

### Mods

*Catalog, disk presence, update and acquire missing packages.*

<p>
<a href="docs/screenshots/mods-01.webp"><img src="docs/screenshots/mods-01.webp" width="180" alt="Mods screenshot 1"></a>
<a href="docs/screenshots/mods-02.webp"><img src="docs/screenshots/mods-02.webp" width="180" alt="Mods screenshot 2"></a>
<a href="docs/screenshots/mods-03.webp"><img src="docs/screenshots/mods-03.webp" width="180" alt="Mods screenshot 3"></a>
<a href="docs/screenshots/mods-04.webp"><img src="docs/screenshots/mods-04.webp" width="180" alt="Mods screenshot 4"></a>
<a href="docs/screenshots/mods-05.webp"><img src="docs/screenshots/mods-05.webp" width="180" alt="Mods screenshot 5"></a>
<a href="docs/screenshots/mods-06.webp"><img src="docs/screenshots/mods-06.webp" width="180" alt="Mods screenshot 6"></a>
</p>

### Installation

*Review the WeiDU install plan, run it, and manage backups/snapshots.*

<p>
<a href="docs/screenshots/installation-01.webp"><img src="docs/screenshots/installation-01.webp" width="180" alt="Installation screenshot 1"></a>
<a href="docs/screenshots/installation-02.webp"><img src="docs/screenshots/installation-02.webp" width="180" alt="Installation screenshot 2"></a>
<a href="docs/screenshots/installation-03.webp"><img src="docs/screenshots/installation-03.webp" width="180" alt="Installation screenshot 3"></a>
<a href="docs/screenshots/installation-04.webp"><img src="docs/screenshots/installation-04.webp" width="180" alt="Installation screenshot 4"></a>
<a href="docs/screenshots/installation-05.webp"><img src="docs/screenshots/installation-05.webp" width="180" alt="Installation screenshot 5"></a>
<a href="docs/screenshots/installation-06.webp"><img src="docs/screenshots/installation-06.webp" width="180" alt="Installation screenshot 6"></a>
<a href="docs/screenshots/installation-07.webp"><img src="docs/screenshots/installation-07.webp" width="180" alt="Installation screenshot 7"></a>
<a href="docs/screenshots/installation-08.webp"><img src="docs/screenshots/installation-08.webp" width="180" alt="Installation screenshot 8"></a>
</p>

## What it does

Work happens inside a **Project**: one engine, your component selection, mods catalog and install run state.

Three phases:

1. **Components** — curated, sorted components catalog, which carries a working installation sequence underneath. Rules, conditions and alternatives keep the tree installable without conflicts.
2. **Mods** — see which packages are on disk under the app data `mods` folder. Download the lacking ones, update the existing.
3. **Install** — build a WeiDU plan from your selection, run it with an in-app console, and keep **vanilla** backups plus named snapshots. For EET, Pre-EET (BG1) and EET steps stay split where needed.

The desktop app **bundles WeiDU 2.49 and 7-Zip** — you do not need to install them separately. Settings → App can still point at a custom WeiDU executable.

## Requirements

- **Windows 10/11** with WebView2 (usually already installed)
- Infinity Engine **Enhanced Edition** games you want to mod (BG1EE, BG2EE, EET, IWDEE, PSTEE as supported by the curated sequence)
- Clean **vanilla** game folders for backups (EET needs both BG1 and BG2 vanillas)

## Install

1. Open [Releases](https://github.com/panshaigan/InfinityExpress/releases).
2. Download the latest Windows build from the release assets.
3. Install and run **iNfinity eXpress**.

The app can check for updates on startup (About → **Check for updates**).

Building from source is for contributors — see [docs/development.md](docs/development.md).

## How to use

### 1. Create or open a project

On first launch, create a project: choose an engine, set up vanilla backups if prompted, and choose destination (live/modded) game folder(s). Later, the **Project hub** lists your projects so you can reopen one or start another.

### 2. Components

Work through the station list (after Presets). Expand groups, check components, use filters and recommended/user presets. Open a row’s detail for mod notes and links. When ready, move on to Mods (or export install order from the UI if you only need a text list).

### 3. Mods

Review the catalog against what is already under your main data `mods` folder. Acquire missing mods when download metadata is available. Remove from disk when you no longer need a package there.

### 4. Install

Open **Install**, review the plan table, then run. Watch the console for WeiDU output. Pause or stop if needed. Use vanilla restore and named snapshots from the backup tools when you want a known-good baseline again.

## Further reading

- [Keyboard reference](docs/keyboard.md) — tree and chrome shortcuts
- [Development](docs/development.md) — build from source, tests, releases, domain docs for contributors
