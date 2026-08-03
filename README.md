# Infinity Express

Desktop-oriented mod route planner for Infinity Engine Enhanced Edition games.

## Milestone 1

Station-based component picker driven by curated data:

- `src/data/InstallSequence.xml`
- `src/data/mods.csv` (detail panel lookup for Codename / URL / Release / Version; download support later)

## Tech stack

- React 18
- TypeScript
- Vite 5
- Vitest + jsdom

## Requirements

Node.js 18+

## Setup

```bash
npm install
npm run dev
```

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite development server |
| `npm run build` | Typecheck (`tsc --noEmit`) then production build |
| `npm run preview` | Serve the production build locally |
| `npm test` | Run the test suite once |
| `npm run test:watch` | Run Vitest in watch mode |

### WSL / cross-OS installs

Native packages (Rollup, esbuild) are platform-specific. If `node_modules` was installed on Windows and you run the project under Linux/WSL (or the reverse), reinstall on the OS you are using:

```bash
rm -rf node_modules && npm install
```

Otherwise `npm test` / `npm run dev` may fail looking for the wrong `@rollup/rollup-*` binary.

## Testing

```bash
npm test
npm run test:watch
```

Tests live next to the code as `src/**/*.test.ts` and cover:

- Engine token matching (`matchEngine`)
- `alwaysIf` / `displayIf` condition parsing and evaluation
- Selection, station merge, alternatives, visibility, and install-order export
- Parsing the curated `InstallSequence.xml`

## Export

**Export install order** downloads `install-order.txt` with one line per selected component:

```text
componentId;componentLabel
```

Lines follow XML document order (duplicate stations merged in the UI only).

## Documentation

- [docs/app-logic.md](docs/app-logic.md) — runtime selection / station / export behaviour
- [docs/install-sequence-schema.md](docs/install-sequence-schema.md) — XML tags and attributes

## Data and scripts

Curated app data lives under `src/data/`.

[`scripts/update.ps1`](scripts/update.ps1) updates the mods catalog from GitHub. Pass a mod list filename; the script reads `scripts/token.txt` for a GitHub personal access token (or prompts you to create one). Historical note: older versions expected `mods.csv` next to the repo root; the curated file now lives at `src/data/mods.csv`.
