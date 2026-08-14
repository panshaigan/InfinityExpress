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

## Levels vs filters

- **Level strip** — mass-check by independently toggled ladder ranks (each chip selects/deselects only that rank's components) + independent Lower/Higher difficulty. Does not change filters.
- **Filters** — display-only after `buildDisplayTree` (search, level, stability, tags, size, author, hidden, required, unchecked modes). Never clear selection.

Ladder ranks: `fixes` → `restoration` → `vanillaPlus` → `blendWell` → `extended` (`restructure` with `blendWell`). Difficulty tokens are opt-in only.

## Recommended strip (Presets)

- **Recommended tiles** — mass-check components with matching `effectiveRecommended` and **no** `effectivePackage`. Independent toggles; does not change filters.
- **Package tiles** — nested visually under their recommended parent; mass-check only components with matching `effectivePackage`. Independent from the parent recommended tile and from sibling packages.
- Tiles are omitted when the current engine has no eligible visible components (engine allow-list, `noDisplay`, and `displayIf` / `displayIfNot` on the component or ancestors — e.g. IDGO stays hidden on EET until IWD-in-EET is selected).
- Dirty detection uses the combined level + recommended + package baseline (`selectionMatchesPresetBaseline`).

## Presets

In-memory, game-scoped: selected ids + level-strip UI + recommended/package chips. Not stored: filters, station, folds. Load restores chips **without** re-running mass-check. Shape: `presets/selectionPresets.ts`.

## Export

Top-bar export is phase-aware:

- **Components** — install order preview (`componentId;label`): selected ids (incl. hidden autos), skip `noExport`, sort by `orderIndex`, first occurrence wins. Label: `name` → `label` → id.
- **Mods** — catalog CSV preview (same dialog chrome).
- **Install** — game-dir `WeiDU.log` preview (EET: BG1 + BG2 tabs). If no log is available yet, falls back to install order.

**EET tabs (install order / WeiDU.log):** Pre-EET = token `eet1` / BG1 folder; EET = token `eet` / BG2 folder; both tokens → both lists; empty engine → EET tab only.

## Key modules

`selection/selectionCore.ts`, `selectionEngine.ts`, `visibility.ts`, `conditions.ts`, `selectionLevels.ts`, `selectionRecommended.ts`, `export/installOrder.ts`.
