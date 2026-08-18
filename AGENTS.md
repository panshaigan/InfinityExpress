# iNfinity eXpress — agent guide

Desktop mod route planner for Infinity Engine EE games. **React 18 + TypeScript + Vite** UI; **Tauri 2** shell (`src-tauri/`). Domain logic stays in pure TS under `src/lib/`.

## Projects

Boot opens the **Project hub**. A project locks one engine, owns selection + install run state, and has destination game folder(s). Vanilla backups and app paths are global (Settings).

## Phases

**Components** (Presets + XML stations) → **Mods** (catalog / disk / acquire) → **Install** (WeiDU plan / run / backups).

## When to Read (do this before nontrivial work)

| Working on | Read first |
| --- | --- |
| App map, folders, data flow, Mods overview, Projects, fresh-install localStorage reset | [docs/architecture.md](docs/architecture.md) |
| Checkboxes, visibility, filters, presets, export | [docs/selection.md](docs/selection.md) |
| `InstallSequence.xml` tags / attrs / engine / conditions | [docs/install-sequence-schema.md](docs/install-sequence-schema.md) |
| Install plan, WeiDU IDs, run, backups | [docs/weidu-install.md](docs/weidu-install.md) |
| Tree / chrome hotkeys | [docs/keyboard.md](docs/keyboard.md) |
| Tooltips, inputs, scrollbars, collapsible chrome | [docs/ui.md](docs/ui.md) |
| Tauri dialogs / FS / ACL | `.cursor/rules/tauri-desktop.mdc` (auto when editing matching files) |

Do **not** re-derive behaviour from a full codebase scan when the doc above covers it.

## Skills (procedural)

- `.cursor/skills/weidu-component-names` — fill component `name` from tp2/TRA
- `.cursor/skills/g3-readme-component-links` — G3 readme section → component `readme` URLs

## Always-on UI rules

Tooltips → `has-icon-tip` / `.icon-tip` (never native `title=`). Text inputs → `OutlinedTextField`. Scrollbars → global thin chrome (never per-widget). End file-changing tasks with a suggested commit message.
