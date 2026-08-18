# Selection & visibility

XML attrs: [install-sequence-schema.md](install-sequence-schema.md). Architecture: [architecture.md](architecture.md).

## Engine matching

Game: `bg1` | `bg2` | `eet` | `iwd` | `pst`. Attribute `engine` = comma allow-list; **any** token may cover the game.

| Token | Covers |
| --- | --- |
| `bg` | bg1, bg2 (**not** eet) |
| `bg1` / `bg2` / `iwd` / `pst` | that game |
| `eet` / `eet1` | eet |

Empty / missing after inheritance → all games. Changing engine **resets** via `createInitialSelection`.

## Visibility (`buildDisplayTree`)

Order: engine → `displayIf` → `displayIfNot` → `noDisplay` (hidden containers still contribute children).

- **Single-child collapse** — one visible component leaf → show only container (`collapsedComponent`).
- **`noBranches`** — keep container row; flatten nested `mod`/`group` (nested `<alternatives>` and nested `noBranches` kept).
- Default-folded tags: `mod`, `group`, `restorations`, `restructure`, `alternatives`, plus common org folders; `unfolded="1"` overrides.

Station omitted from nav when display tree empty / station roots fail display gates.

## Conditions

Operands = component ids. `,` = AND, `|` = OR, `()` group. Unparsable → false. Re-evaluated on every selection change.

## Selection rules

**Initial:** `required` (engine-eligible) + `alwaysIf` to convergence.

**Containers:** check = eligible descendants (alts → defaults only); uncheck = clear descendant components.

**Parent state:** alternatives-aware — checked when every non-alt group is full **and** each nested `<alternatives>` has ≥1 option; not “all radios”.

| Attr | Behaviour |
| --- | --- |
| `required` | Always on when eligible; exported |
| `alwaysIf` | True → select (+ clear sibling alts). False + `noDisplay` → deselect. False + visible → leave manual |
| `displayIf` / `displayIfNot` | Visibility + parent select-all walk; then **prune** gated-out non-required (unless held by true `alwaysIf`) |
| `default` | Only when checking `<alternatives>` **parent** |
| `core` | Any select under `<mod>` pulls cores; uncheck core clears whole mod |
| `noExport` | May select; omit from export / install plan |

**Alternatives:** every enclosing `<alternatives>` applies (inner first). Component siblings = radio. Branch children = picking one branch clears others.

## Presets vs filters

- **Presets station** — mass-check by independently toggled **recommended** and **package** tiles (`effectiveRecommended` / `effectivePackage`). Does not change filters.
- **Filters** — display-only after `buildDisplayTree`. Visible chips: search, author, show hidden, unchecked modes. **Size and tags** filters remain in `FilterCriteria` and the filter pipeline (`filterDisplayTree.ts`) but have no UI — defaults are all tags allowed and the full catalog size range. Panel components under `src/ui/filters/` are kept for future re-enable. Never clear selection.

## Recommended strip (Presets)

- **Recommended tiles** — mass-check components with matching `effectiveRecommended` and **no** `effectivePackage`. Independent toggles; does not change filters.
- **Package tiles** — nested visually under their recommended parent; mass-check only components with matching `effectivePackage`. Independent from the parent recommended tile and from sibling packages.
- Tiles are omitted when the current engine has no eligible visible components (engine allow-list, `noDisplay`, and `displayIf` / `displayIfNot` on the component or ancestors — e.g. IDGO stays hidden on EET until IWD-in-EET is selected).

### Presets page catalog (`src/data/presetCatalog.ts`)

Single edit point for the Presets station:

- **`PRESET_TILE_COPY`** — label (optional override), tile subtitle (`summary`), and tooltip copy (`typeAndDepth`, `recommendedFor`) per recommended token.
- **`PRESET_PACKAGE_COPY`** — same fields for package tokens. Label falls back to the InstallSequence ancestor `label` when omitted; other fields come only from the catalog (no XML `desc` import). Add an entry per package token you want to customize; unknown packages still show the InstallSequence label with empty subtitle/tooltip.
- **`PRESET_LAYOUT`** — tabs of section headings and rows of recommended tokens (2–3 column flex grid). Each tab has an explicit `label` and nested `sections`. Only listed tokens render; packages still nest under their parent from the live catalog. Empty sections and empty tabs are omitted after engine / visibility filtering. The Presets station shows one tab at a time; Continue still finishes the whole station.

Example package entry (same shape as recommended tiles):

```ts
npcExpansions: {
  label: 'Original Cast Expansions',
  summary: 'Friendship and expansion mods for the original cast.',
  typeAndDepth: 'Moderate narrative and banter additions.',
  recommendedFor: 'Players who want richer companion content.',
},
```

New projects seed **Fixes** via `recommendedChecked` + mass-check on the Presets station.

## Presets

User presets (top-bar **User preset** control) store selected ids + recommended/package chips. The preset **library** is engine-scoped (`presets/selectionPresetsStore.ts`, localStorage `infinity-express.selection-presets-v1`) and shared across projects of the same engine; the **active loaded preset** and dirty baseline stay per-project. Not stored in presets: filters, station, folds. Load restores chips **without** re-running mass-check. Shape: `presets/selectionPresets.ts`.

## Export

Top-bar export is phase-aware:

- **Components** — install order preview (`componentId;label`): selected ids (incl. hidden autos), skip `noExport`, sort by `orderIndex`, first occurrence wins. Label: `name` → `label` → id.
- **Mods** — catalog CSV preview (same dialog chrome).
- **Install** — game-dir `WeiDU.log` preview (EET: BG1 + BG2 tabs). If no log is available yet, falls back to install order.

**EET tabs (install order / WeiDU.log):** Pre-EET = token `eet1` / BG1 folder; EET = token `eet` / BG2 folder; both tokens → both lists; empty engine → EET tab only.

## Key modules

`selection/selectionCore.ts`, `selectionEngine.ts`, `visibility.ts`, `conditions.ts`, `selectionRecommended.ts`, `export/installOrder.ts`.
